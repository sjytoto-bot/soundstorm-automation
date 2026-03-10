# SOUNDSTORM YouTube 데이터 수집 가이드

## 📌 준비물
- GCP 프로젝트 (이미 있음: 프로젝트 번호 7478031217)
- YouTube Data API v3 활성화
- API 키

---

## 🔧 1단계: YouTube Data API 활성화

### 1) Google Cloud Console 접속
https://console.cloud.google.com/

### 2) 프로젝트 선택
- 상단 프로젝트 선택 드롭다운 클릭
- 프로젝트 번호 `7478031217` 또는 프로젝트 이름으로 검색

### 3) API 라이브러리에서 YouTube Data API v3 활성화
```
좌측 메뉴 > API 및 서비스 > 라이브러리
→ "YouTube Data API v3" 검색
→ "사용" 버튼 클릭
```

---

## 🔑 2단계: API 키 발급

### 1) 사용자 인증 정보 페이지로 이동
```
좌측 메뉴 > API 및 서비스 > 사용자 인증 정보
```

### 2) API 키 생성
```
상단의 "+ 사용자 인증 정보 만들기" 클릭
→ "API 키" 선택
→ API 키가 생성됨 (예: AIzaSyC-xxxxxxxxxxx)
```

### 3) API 키 제한 설정 (권장)
```
생성된 API 키 옆의 "편집" 아이콘 클릭
→ "API 제한사항" 섹션에서 "키 제한" 선택
→ "YouTube Data API v3"만 선택
→ 저장
```

---

## 🚀 3단계: 스크립트 실행

### 1) API 키를 스크립트에 입력
`youtube_data_collector.py` 파일을 열고 13번째 줄 수정:

```python
API_KEY = "여기에_발급받은_API_키_입력"
```

### 2) 필요한 라이브러리 설치
```bash
pip install requests
```

### 3) 스크립트 실행
```bash
python youtube_data_collector.py
```

---

## 📊 4단계: 결과 확인

### 출력 파일
- `soundstorm_youtube_data.csv`
  - 채널의 모든 영상 데이터
  - 조회수 순으로 정렬됨

### CSV 파일 내용
| 순위 | 제목 | 영상ID | 조회수 | 좋아요 | 댓글수 | 게시일 | 러닝타임 | 썸네일URL | 설명 |
|------|------|--------|--------|--------|--------|--------|----------|-----------|------|

---

## 💡 수집되는 데이터

### 기본 정보
- ✅ 영상 제목
- ✅ 영상 ID
- ✅ 게시일
- ✅ 러닝타임
- ✅ 썸네일 URL (최고화질)

### 통계 데이터
- ✅ 조회수
- ✅ 좋아요 수
- ✅ 댓글 수

### 추가 분석 (옵션)
- 댓글 키워드 분석
- 시청 유지율 (YouTube Analytics API 필요)
- CTR 데이터 (YouTube Analytics API 필요)

---

## ⚠️ 주의사항

### API 할당량
- YouTube Data API v3 기본 할당량: **10,000 units/일**
- 영상 1개 조회: 약 1 unit
- 채널 전체 영상 수집: 약 100-200 units

### 할당량 초과 시
- 다음 날 자동 리셋
- 추가 할당량 신청 가능 (GCP 콘솔에서)

---

## 🔍 다음 단계

데이터 수집 완료 후:

1. **상위 10개 곡 선정**
   - 조회수 + 좋아요 비율 기준
   
2. **상세페이지 데이터 매핑**
   - 각 음원에 유튜브 데이터 연결
   
3. **네이버 스토어 상품 등록**
   - CSV 데이터를 기반으로 상품 설명 자동 생성

---

## 📞 문제 해결

### "API key not valid" 오류
→ API 키를 다시 확인하거나 새로 발급

### "The request cannot be completed because you have exceeded your quota"
→ 할당량 초과, 내일 다시 시도 또는 할당량 증가 신청

### 영상이 0개로 나옴
→ 채널 ID 확인 (`UCAvSo9RLq0rCy64IH2nm91w`)

---

## 📧 연락처
- 이메일: wldyd032@gmail.com
- 채널: https://youtube.com/channel/UCAvSo9RLq0rCy64IH2nm91w
