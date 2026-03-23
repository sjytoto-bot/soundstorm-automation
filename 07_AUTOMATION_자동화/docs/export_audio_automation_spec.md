# 작업 요청서: Soundstorm 업로드 완료 후 음원 Export 자동화 운영

## 1. 목적

Soundstorm 작업 흐름에서 **유튜브 업로드 완료 이후 단계**에서
네이버 스토어 판매용 음원을 자동 생성하는 시스템을 안정적으로 운영한다.

현재 제작 흐름
```text
음원 제작
썸네일 제작
영상 제작
↓
유튜브 업로드
↓
파일 정리
↓
스토어 판매 파일 생성
```
따라서 자동화는 **업로드 완료 이후 실행되는 구조**로 유지한다.

---

## 2. 자동화 흐름 (확정)

현재 시스템의 기준 흐름
```
Google Sheet (곡 등록)
        ↓
track_list.csv 자동 동기화
        ↓
export_uploaded_audio.py 실행
        ↓
music_음원 탐색
        ↓
없으면 videos_영상에서 오디오 추출
        ↓
wav + mp3 생성
        ↓
EXPORT_AUDIO 저장
```

---

## 3. 기준 폴더 구조

루트
```
01_uploaded_업로드완료
│
├ music_음원
├ videos_영상
└ EXPORT_AUDIO
```

의미
| 폴더           | 역할          |
| ------------ | ----------- |
| music_음원     | 마스터 음원      |
| videos_영상    | 곡별 영상       |
| EXPORT_AUDIO | 자동 생성 판매 파일 |

---

## 4. 파일 생성 규칙

최종 파일명
```
상품ID_영상ID_곡제목
```

예시
```
SS-011_G6KVn8kKjCM_흑운.wav
SS-011_G6KVn8kKjCM_흑운.mp3
```

출력 위치
```
EXPORT_AUDIO
```

---

## 5. 음원 탐색 규칙

곡 제목(title)을 기준으로 파일 탐색

검색 순서
### 1️⃣ music_음원
```
music_음원/{title}.wav
music_음원/{title}.flac
music_음원/{title}.aiff
music_음원/{title}.mp3
```
존재 시 → 해당 파일 사용

---
### 2️⃣ 없을 경우
```
videos_영상/{title}.mp4
videos_영상/{title}.mov
videos_영상/{title}.mkv
```
영상에서 오디오 추출

---

## 6. 매칭 안정성

제목 매칭 시 **정규화 처리 적용**

정규화 규칙
```
괄호 제거
특수문자 제거
공백 제거
소문자 변환
```

예
```
Cyber City
Cybercity
Cyber-City
```
모두 동일 곡으로 인식.

---

## 7. 성능 최적화 (적용 완료)

스크립트 시작 시
```
music_index
video_index
```
딕셔너리 인덱스 생성 후 lookup 방식으로 탐색.

시간 복잡도
```
O(n²) → O(n)
```
대량 곡 처리 시 속도 크게 향상.

---

## 8. 재실행 안정성

이미 생성된 파일은 다시 생성하지 않도록 처리

조건
```
wav + mp3 모두 존재
```

로그
```
[SKIP EXIST] {파일명}
```

---

## 9. 로그 출력

예시
```
[OK] SS-011_G6KVn8kKjCM_흑운
[OK] SS-012_xxxxx_Cybercity
[SKIP EXIST] SS-013_xxxxx_혈풍
[SKIP] Shadow Hunter
```

---

## 10. 실행 방식

현재는 **수동 실행 기준**

실행 명령
```
python export_uploaded_audio.py
```

향후 필요 시
```
cron 배치 실행
```
으로 확장 가능.

---

## 11. 적용 파일

스크립트 위치
```
07_AUTOMATION_자동화/scripts_스크립트/export_uploaded_audio.py
```
