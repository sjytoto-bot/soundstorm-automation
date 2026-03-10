# LICENSE_ENGINE_SETUP.md

SOUNDSTORM License Engine -- Real Environment Setup Guide

작성일시: 2026-02-23 12:08 UTC 적용 범위: 07_AUTOMATION/license_engine

------------------------------------------------------------------------

## 1. 시스템 개요

License Engine은 다음 3가지 작업을 자동 수행합니다.

1.  MASTER_AUDIO에서 원본 음원 읽기
2.  LICENSE_DELIVERY 폴더에 발급 결과 저장
3.  Gmail SMTP를 통해 라이선스 메일 발송

------------------------------------------------------------------------

## 2. Canonical Audio Source (단일 기준 원본)

현재 기준 폴더:

02_MUSIC/03_music_master_마스터완성/

규칙:

-   확정 WAV 파일만 보관
-   mp3 금지
-   버전명 금지 (v1, final 등)
-   파일명 규칙 통일 (SS###\_Title_bpmXXX.wav)
-   읽기 전용 자산

------------------------------------------------------------------------

## 3. Drive 폴더 구조 (실환경 기준)

읽기 전용 (MASTER_AUDIO):

MASTER_AUDIO_FOLDER_ID = 1ehBylNmWYHWOiLqOXHhfNUU0YsQ-P-wH

쓰기 전용 (LICENSE_DELIVERY):

DRIVE_ROOT_FOLDER_ID = 12Ae8iVE7n8FYRgJtRWezaeRQLzwPJyfF

계층:

SOUNDSTORM/ ├── 02_MUSIC/ │ └── 03_music_master_마스터완성/ └──
99_SYSTEM/ └── LICENSE_DELIVERY/

------------------------------------------------------------------------

## 4. .env 파일 설정 (현재 세팅 기록)

DRIVE_ROOT_FOLDER_ID="12Ae8iVE7n8FYRgJtRWezaeRQLzwPJyfF"
MASTER_AUDIO_FOLDER_ID="1ehBylNmWYHWOiLqOXHhfNUU0YsQ-P-wH"

SMTP_SERVER="smtp.gmail.com" SMTP_PORT=587 SMTP_USER="sjtroro@gmail.com"
SMTP_PASSWORD="(보안상 문서 미기록)"

보안 원칙:

-   SMTP_PASSWORD는 문서에 기록하지 않는다.
-   .env 파일 외부 공유 금지
-   service_account.json 외부 노출 금지

------------------------------------------------------------------------

## 5. Gmail 앱 비밀번호 발급 절차

1.  Google 계정 → 보안
2.  2단계 인증 활성화
3.  앱 비밀번호 → Mail → 기타(Soundstorm License Engine)
4.  16자리 코드 생성
5.  .env에 공백 제거 후 입력

------------------------------------------------------------------------

## 6. Service Account 권한 구조

  폴더                                  권한
  ------------------------------------- ----------------
  02_MUSIC/03_music_master_마스터완성   Viewer
  99_SYSTEM/LICENSE_DELIVERY            Editor
  SOUNDSTORM 루트                       권한 부여 금지

------------------------------------------------------------------------

## 7. 테스트 체크리스트

-   Drive 복사 SUCCESS
-   권한 부여 SUCCESS
-   PDF 생성 SUCCESS
-   이메일 발송 SUCCESS

에러 발생 시:

-   ERR003 → Drive 권한 오류
-   ERR005 → SMTP 인증 오류

------------------------------------------------------------------------

## 8. 보안 원칙 고정

-   MASTER_AUDIO 수정 금지
-   자동화는 원본을 절대 변경하지 않는다.
-   앱 비밀번호는 문서/채팅에 기록하지 않는다.
-   Git 커밋 금지 (.env는 로컬 전용)

------------------------------------------------------------------------

본 문서는 SOUNDSTORM 자동화 운영 안정성을 위한 실환경 기준 문서이다.
