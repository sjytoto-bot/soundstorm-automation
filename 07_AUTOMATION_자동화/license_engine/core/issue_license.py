import os
from datetime import datetime

from license_engine.core.db_manager import db_manager
from license_engine.core.number_generator import LicenseIssueError
from license_engine.core.qr_generator import generate_qr_base64
from license_engine.core.pdf_renderer import render_license_pdf, PDFRenderError
from license_engine.core.drive_manager import drive_manager, DriveManagerError
from license_engine.core.mail_sender import send_license_email, MailSenderError
from license_engine.core.r2_manager import r2_manager
from license_engine.config import Config

def issue_license_process(order_number: str, message_id: str, buyer_name: str, buyer_email: str, track_id: str, track_title: str, license_type: str) -> dict:
    """
    네이버 스토어 주문에 따른 라이선스 자동 발급 워크플로우 14단계를 관장합니다. (v2.0 R2 연동)
    """
    error_code = None
    error_message = None
    license_number = None
    pdf_path = None
    drive_folder_url = None
    process_status = "failed" # 최종 결과 (success, failed, partial)
    
    try:
        # 1. 입력값 검증 및 중복 체크
        if not all([order_number, message_id, buyer_name, buyer_email, track_id, track_title, license_type]):
            raise LicenseIssueError("ERR001", "필수 입력값이 누락되었습니다.")
            
        if db_manager.check_duplicate(order_number, message_id):
            return {"status": "skip", "error_message": "이미 처리된 주문/메시지입니다. (중복 방지)"}
            
        # 2 ~ 6: 동시성 충돌을 고려한 채번 및 PDF 생성 루프 (최대 2회)
        max_retries = 2
        for attempt in range(max_retries):
            # 2. 채번 (번호 문자열 조합, DB 등록은 아직)
            date_str = datetime.now().strftime("%Y%m%d")
            next_seq = db_manager.get_latest_seq_for_date(track_id, date_str)
            current_license_number = f"SS-{track_id}-{date_str}-{next_seq:02d}"
            
            try:
                # 3. QR 생성
                qr_base64 = generate_qr_base64(current_license_number)
                
                # 4. HTML 렌더링 & 5. PDF 생성
                current_pdf_path = render_license_pdf(
                    buyer_name=buyer_name,
                    track_title=track_title,
                    license_number=current_license_number,
                    qr_base64=qr_base64,
                    track_id=track_id,
                    license_type=license_type,
                    issue_date=datetime.now().strftime("%Y년 %m월 %d일")
                )
                
            except PDFRenderError as e:
                # PDF 생성 실패 시 DB 기록이 수행되지 않아야 하므로 곧바로 에러 발생
                raise LicenseIssueError("ERR004", e.message)
            except Exception as e:
                raise LicenseIssueError("ERR004", f"PDF 생성 중 알 수 없는 예외: {str(e)}")
            
            # 6. DB 임시 기록 (status=PENDING) - BEGIN IMMEDIATE 로 고유성 검증
            success = db_manager.create_pending_license(
                current_license_number, order_number, message_id, track_id, buyer_name, buyer_email
            )
            
            if success:
                # 정상적으로 DB에 PENDING 등록 완료
                license_number = current_license_number
                pdf_path = current_pdf_path
                break
            else:
                # UNIQUE 제약조건 충돌 발생 (다른 프로세스가 먼저 생성)
                # 로컬에 생성된 PDF 찌꺼기 삭제 후 재시도
                if os.path.exists(current_pdf_path):
                    os.remove(current_pdf_path)
                if attempt == max_retries - 1:
                    raise LicenseIssueError("ERR006", "라이선스 번호 채번 충돌이 연속 발생했습니다.")
                    
        # --- (이하 단계부터는 DB에 레코드가 존재하므로, 실패 시 Status 업데이트 필수) ---
        try:
            # 7. Drive에서 원본 음원 다운로드 (youtube_id 기반 파일명 검색)
            # track_id에는 Gmail 파싱에서 추출한 YouTube ID가 들어있음
            local_audio_paths = drive_manager.download_files(
                youtube_id=track_id,
                target_folder_id=Config.MASTER_AUDIO_FOLDER_ID,
                save_dir=Config.OUTPUT_DIR
            )

            drive_links = {}
            for local_audio_path in local_audio_paths:
                audio_filename = os.path.basename(local_audio_path)
                ext = os.path.splitext(audio_filename)[1].lower().replace('.', '') or "file"

                # 8. R2 버킷에 파일 업로드
                r2_object_name = f"licenses/{license_number}/{audio_filename}"
                r2_manager.upload_file(local_audio_path, r2_object_name)
                
                # 9. 만료 시간이 설정된 Presigned URL 생성 (604800초 = 7일)
                presigned_url = r2_manager.generate_presigned_url(r2_object_name, 604800)
                drive_links[ext] = presigned_url
                
                # 10. 로컬 임시파일 삭제
                if os.path.exists(local_audio_path):
                    os.remove(local_audio_path)
                    
            # 대표 URL(로깅 등을 위함)
            drive_folder_url = next(iter(drive_links.values())) if drive_links else None

        except DriveManagerError as e:
            # Drive 다운로드 실패 시 전체 루틴 중지
            db_manager.update_license_status(license_number, "FAILED", e.code, e.message)
            raise LicenseIssueError(e.code, e.message)
        except Exception as e:
            # R2 등 파일 처리 과정에서의 실패
            db_manager.update_license_status(license_number, "FAILED", "R2_ERR", str(e))
            raise LicenseIssueError("R2_ERR", str(e))
            
        try:
            # 12. 이메일 발송
            send_license_email(buyer_email, license_number, drive_links, pdf_path)
            
            # 13. 모든 과정 성공, DB 상태 SUCCESS 업데이트
            db_manager.update_license_status(license_number, "SUCCESS")
            process_status = "success"
        except MailSenderError as e:
            # 이메일 전송 실패 시: Drive 구조는 유지, 상태는 PARTIAL
            db_manager.update_license_status(license_number, "PARTIAL", e.code, e.message)
            process_status = "partial" # 로직상 부분 성공은 상위로 던지지 않고 마무리
            error_code = e.code
            error_message = e.message

    except LicenseIssueError as e:
        error_code = e.code
        error_message = e.message
    except Exception as e:
        # 그 외 처리되지 않은 시스템 에러
        error_code = "ERR000"
        error_message = f"처리 중 알 수 없는 시스템 오류: {str(e)}"
        if license_number:
            db_manager.update_license_status(license_number, "FAILED", error_code, error_message)

    # 14. JSON 로그 저장
    result_data = {
        "status": process_status,
        "issued_at": datetime.now().isoformat()
    }
    
    if license_number:
        result_data["license_number"] = license_number
    if drive_folder_url:
        result_data["drive_folder_url"] = drive_folder_url
        
    if error_code:
        result_data["error_code"] = error_code
        result_data["error_message"] = error_message
        
    # JSON 파일 로그 출력
    if license_number:
        db_manager.save_json_log(license_number, result_data)

    return result_data
