# YouTube Data API 설정 가이드

이 가이드는 YouTube Data API v3를 사용하기 위한 설정 방법을 안내합니다.

## 1. Google Cloud Console 설정

### 1-1. 프로젝트 생성
1. [Google Cloud Console](https://console.cloud.google.com/) 접속
2. 상단의 프로젝트 선택 → "새 프로젝트" 클릭
3. 프로젝트 이름: `SOUNDSTORM-YouTube-API` (원하는 이름)
4. "만들기" 클릭

### 1-2. YouTube Data API v3 활성화
1. 좌측 메뉴 → "API 및 서비스" → "라이브러리"
2. 검색창에 "YouTube Data API v3" 입력
3. "YouTube Data API v3" 선택
4. "사용" 버튼 클릭

### 1-3. OAuth 2.0 자격 증명 만들기
1. 좌측 메뉴 → "API 및 서비스" → "사용자 인증 정보"
2. 상단 "+ 사용자 인증 정보 만들기" → "OAuth 클라이언트 ID" 선택
3. 동의 화면 구성이 필요하면:
   - "동의 화면 구성" 클릭
   - 사용자 유형: "외부" 선택 → "만들기"
   - 앱 이름: `SOUNDSTORM YouTube Analyzer`
   - 사용자 지원 이메일: 본인 이메일
   - 개발자 연락처 정보: 본인 이메일
   - "저장 후 계속" 클릭
   - 범위 추가: 기본값 그대로 → "저장 후 계속"
   - 테스트 사용자 추가: 본인 이메일 추가 → "저장 후 계속"
4. 다시 "사용자 인증 정보" 탭으로 돌아가기
5. "+ 사용자 인증 정보 만들기" → "OAuth 클라이언트 ID"
6. 애플리케이션 유형: "데스크톱 앱" 선택
7. 이름: `SOUNDSTORM Desktop Client`
8. "만들기" 클릭

### 1-4. 자격 증명 다운로드
1. 생성된 OAuth 2.0 클라이언트 ID 옆의 다운로드 아이콘 클릭
2. JSON 파일 다운로드
3. 파일 이름을 `client_secret.json`으로 변경
4. 이 파일을 `youtube_api` 폴더에 복사

## 2. Python 패키지 설치

터미널에서 다음 명령어 실행:

```bash
cd "/Users/sinjiyong/Library/CloudStorage/GoogleDrive-sjytoto@gmail.com/내 드라이브/SOUNDSTORM/07_AUTOMATION_자동화/youtube_api"
pip3 install -r requirements.txt
```

## 3. 첫 실행 및 인증

스크립트를 처음 실행하면 브라우저가 열리며 Google 로그인을 요청합니다:

1. Google 계정으로 로그인
2. "앱이 확인되지 않음" 경고가 나오면:
   - "고급" 클릭
   - "SOUNDSTORM YouTube Analyzer(으)로 이동" 클릭
3. 권한 허용
4. 인증 완료 후 브라우저 창 닫기

인증이 완료되면 `token.pickle` 파일이 생성되며, 이후에는 자동으로 인증됩니다.

## 4. API 할당량

- YouTube Data API는 **일일 10,000 units** 제한이 있습니다
- 주요 작업별 비용:
  - 비디오 목록 조회: 1 unit
  - 비디오 상세 정보: 1 unit
  - 댓글 조회: 1 unit
  - 채널 정보: 1 unit

일반적인 채널 분석은 100-500 units 정도 사용하므로 충분합니다.

## 5. 보안 주의사항

⚠️ **중요**: `client_secret.json`과 `token.pickle` 파일은 절대 공유하지 마세요!

`.gitignore` 파일에 다음 내용 추가 권장:
```
client_secret.json
token.pickle
*.json
```

## 문제 해결

### "API has not been used in project" 오류
- Google Cloud Console에서 YouTube Data API v3가 활성화되었는지 확인

### "Access Not Configured" 오류
- OAuth 동의 화면 설정이 완료되었는지 확인
- 테스트 사용자에 본인 이메일이 추가되었는지 확인

### "Invalid client_secret.json" 오류
- 파일 이름이 정확히 `client_secret.json`인지 확인
- JSON 파일 내용이 손상되지 않았는지 확인
