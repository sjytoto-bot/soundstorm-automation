
# 현재 엔진 파이프라인 (최신)
metricEngine
trafficEngine
momentumEngine
strategyScoreEngine
correlationEngine
insightEngine
trafficGrowthEngine
earlyMomentumEngine
algorithmEntryEngine
thumbnailAnalyzerEngine
contentClusterEngine
uploadTimingEngine
trendDetectionEngine
performancePredictionEngine
strategyOptimizerEngine
strategyRecommendationEngine

--

@SOUNDSTORM Dashboard — Master Spec (프로젝트 헌법).md

# SOUNDSTORM Dashboard 구축 로드맵
PHASE 1  Data Schema 안정화   ✔
PHASE 2  Snapshot Engine    ✔
PHASE 3  Adapter Layer      ✔
PHASE 4  Controller Layer   ✔
PHASE 5  Core Dashboard UI  ✔
PHASE 6  Video Intelligence ✔

## PHASE 7  Insight Engine     ✔
Snapshot Engine
AnalyticsAdapter
useAnalyticsController
DashboardPage
Video Intelligence
Opportunity Engine
Insight Engine

## PHASE 8  Strategy Engine    
### PHASE 8A External Traffic Insight Engine  ✔
src/engines/externalTraffic/
ExternalTrafficEngine.ts
ReferrerClassifier.ts
PlatformMapper.ts
IntentAnalyzer.ts
AudienceAnalyzer.ts
ExternalQualityAnalyzer.ts
ExternalStrategyGenerator.ts

### PHASE 8B Redirect Tracker (Tracking)  ✔
redirect_server.py    ✔
  PHASE 8B Setup Automation 완료 요약:                       
                                                             
  파일: redirect_tracker/redirectLinks.json                  
  작업: battle, dungeon, stealth, ambient 슬러그로 교체      
  ────────────────────────────────────────                   
  파일: soundstorm-panel/config/redirect_config.json         
  작업: redirectLogsPath + autoDetect 키로 생성              
  ────────────────────────────────────────
  파일: scripts/start_redirect.sh
  작업: 서버 시작 스크립트 (chmod +x, 로그 경로 자동 지정)
  ────────────────────────────────────────
  파일: scripts/test_redirect.sh
  작업: curl 기반 5단계 테스트 스크립트 (chmod +x)
  ────────────────────────────────────────
  파일: redirect_server.py
  작업: ensure_log_file() 추가 → 시작 시 CSV 자동 생성
  ────────────────────────────────────────
  파일: electron/main.js
  작업: redirectLogsPath 우선 읽기, 상대경로 path.resolve
  처리
    추가

  서버 실행 방법:
  bash scripts/start_redirect.sh          # port 8080 (기본)
  bash scripts/start_redirect.sh 5050     # port 지정
⏺ 모든 테스트 통과. 결과 정리:                               
                                                             
  ┌────────────┬─────────────────────────────────────────┐   
  │   테스트   │                  결과                   │   
  ├────────────┼─────────────────────────────────────────┤   
  │ [1] Health │ status: ok, log_count: 0 ✅             │
  │  check     │                                         │   
  ├────────────┼─────────────────────────────────────────┤   
  │ [2]        │ 5개 슬러그 (assassin/battle/dungeon/ste │   
  │ /api/links │ alth/ambient) 정상 반환 ✅              │   
  ├────────────┼─────────────────────────────────────────┤
  │ [3] /r/ass │ HTTP 404 — video 미설정이므로 정상 동작 │
  │ assin      │  ✅                                     │
  ├────────────┼─────────────────────────────────────────┤
  │ [4]        │ click 로그 1건 기록됨 (ip_hash,         │
  │ /api/logs  │ platform=DIRECT, campaign=discord_dnd)  │
  │            │ ✅                                      │
  ├────────────┼─────────────────────────────────────────┤
  │ [5]        │ 캠페인별 집계 정상 ✅                   │
  │ /api/stats │                                         │
  └────────────┴─────────────────────────────────────────┘

  추가 확인된 동작:
  - 서버 시작 시 redirect_logs.csv 자동 생성
  (ensure_log_file()) ✅
  - /r/assassin 접근 → video 없어도 클릭 자체는 CSV에 기록됨
  ✅
  - IP 해시 (12ca17b4) 정상 처리 ✅

  실제 사용 시 redirectLinks.json의 각 slug에 YouTube video
  ID를 채우면 리다이렉트가 즉시 작동합니다.





### PHASE 8C Redirect Marketing Intelligence    ✔
src/engines/redirectIntelligence/
CampaignAnalyzer.ts
CommunityAnalyzer.ts
ContentReactionAnalyzer.ts
TimePatternAnalyzer.ts
RedirectMarketingEngine.ts

### PHASE 8D Opportunity Engine     ✔
src/engines/opportunity/
SearchOpportunityAnalyzer.ts
AlgorithmOpportunityAnalyzer.ts
ExternalOpportunityAnalyzer.ts
RedirectRecommendationEngine.ts
OpportunityEngine.ts

### PHASE 8E Content Strategy Engine   ✔ 
다음단계 넘어가기 전에 UI 정리중
- 액션 리포트 수정중... 기회탐색, 콘텐츠 전략 넣는중...
- 채널 분석 이름 아래에 데이터 업데이트 날짜 표기
- 모든 탭에 있는 액션리포트들 모아서 맨 위에 액션 리포트 자세히보기에 넣어야함
- (추후) 매 주 업로드 현황 및 업로드 예정일 및 실천 대시보드를 제일 위로 배치. => 이 대시보드는 자동으로 컨텐츠 생성해주는 기능과 연결

---

목표

```
Dashboard → 자동 실행
```

예

```
추천 콘텐츠 생성
→ 자동 플레이리스트 생성
```

또는

```
SEO 키워드
→ 자동 제목 생성
```

---



최종 아키텍처

```
YouTube API
↓
Python Automation
↓
Google Sheets
↓
Adapters
↓
Controllers
↓
Dashboard UI
↓
Insight Engine
↓
Opportunity Engine
↓
Strategy Engine
↓
Content Strategy Panel
```


---


---


## PHASE 9A Execution Panel     ✔
Creator Control Panel

기능

이번주 업로드
업로드 예정
다음 업로드
콘텐츠 생성 버튼

예

CONTENT EXECUTION

이번주 업로드
✔ Royal Procession

이번주 예정
• Assassin Theme
• War Drums Battle

[콘텐츠 생성]

이 패널이 대시보드의 중심입니다.

## PHASE 9B Strategy Panel   
ExecutionPanel        완료
StrategyInsightsPanel 완료
Analytics             완료
OpportunityPanel      
EarlyPerformance      

목표

콘텐츠 전략 표시

UI

CONTENT STRATEGY

예

추천 콘텐츠

Dark Assassin Theme
War Drums Battle
Samurai Combat

여기에 나중에

[콘텐츠 생성]

버튼이 붙습니다.

## PHASE 9C Dashboard Refactor    
목표

패널 구조 정리

최종 순서

CONTENT EXECUTION
ACTION CENTER
CONTENT STRATEGY
OPPORTUNITY
CHANNEL INSIGHT

즉

Execution
Action
Strategy
Opportunity
Insight


## 원하는 구조 (Drilldown Creator Panel)

예를 들어 지금 화면 기준으로:

### Level 1 — 요약 (항상 보임)

```
CREATOR CONTROL PANEL

⚠ 콘텐츠 품질 저하
조회수 -37.9%

추천 액션
• 썸네일/제목 A/B 테스트
• 인트로 20초 이내 단축
```

여기까지만 **기본 화면**

---

### Level 2 — 분석 (클릭 시)

```
왜?

유입 경로
구독자 32.4%
추천 영상 24.5%

성장 지표
조회수 -37.9%
시청시간 -46%
```

---

### Level 3 — 데이터 (더 클릭)

```
데이터

인기 영상
급상승 영상
유입 경로 분석
```

---

### UI 구조

즉 카드 하나가 이렇게 됩니다.

```
Action Summary
    ▼
Analysis
    ▼
Data
```

---

### 실제 제품들이 쓰는 구조

이 구조는 많이 쓰입니다.

### Vercel

```
Alert
↓
Why
↓
Logs
```

### Linear

```
Issue
↓
Context
↓
Activity
```

### Notion AI

```
Suggestion
↓
Reason
↓
Sources
```

---



```
ActionCard

├ Summary
├ Insight
└ Data
```

상태

```
Insight
Data
```

는 **collapse 상태**

---



당신이 말한 구조는 정확히 이것입니다.

```
Summary
↓
Insight
↓
Data
```

그리고 UI는

```
Drilldown
```

---




# 색깔 가이드
좋습니다.
아래는 **Soundstorm Creator Dashboard UI 디자인 가이드 + 개발 요청서**입니다.
목표는 **알록달록한 색을 제거하고 분석 도구다운 차분한 UI로 정리하는 것**입니다.

---

## Soundstorm Creator Dashboard

## UI 디자인 가이드 (v1)

목표

```
색 최소화
정보 우선순위 강화
분석 도구 스타일 UI
```

참고 스타일

```
Linear
Notion
Vercel
Stripe Dashboard
```

핵심 원칙

```
색 = 의미
```

색을 장식이 아니라 **정보 전달용으로만 사용합니다.**

---

## 1. 컬러 시스템

사용 색상은 **3개만 사용합니다.**

| 역할    | 색    |
| ----- | ---- |
| 기본 UI | Gray |
| 액션    | Blue |
| 문제    | Red  |

컬러 코드

```
Gray  #64748B
Blue  #3B82F6
Red   #EF4444
```

보조 색

```
Background  #F8FAFC
Card        #FFFFFF
Border      #E2E8F0
Text        #0F172A
Subtext     #64748B
```

---

## 2. 색 사용 규칙

UI 전체 색 비율

```
Gray 90%
Blue 8%
Red 2%
```

의미

```
Gray → 정보
Blue → 행동
Red → 문제
```

금지

```
초록
보라
주황
여러 색 badge
```

---

## 3. 카드 디자인

모든 카드 공통 스타일

```
background: white
border: 1px solid #E2E8F0
border-radius: 10px
```

Hover

```
border-color: #CBD5F5
```

그림자

```
없음
또는 매우 약함
```

---

## 4. Badge 시스템

색은 **3종만 사용**

### FIX

```
background: #FEF2F2
text: #B91C1C
border: #FECACA
```

표시

```
[FIX]
```

---

### HOT

```
background: #EFF6FF
text: #1D4ED8
border: #BFDBFE
```

표시

```
[HOT]
```

---

### INFO

```
background: #F1F5F9
text: #475569
border: #E2E8F0
```

표시

```
[INFO]
```

---

## 5. 버튼 디자인

버튼은 **2종만 사용**

### Primary Button

```
background: #3B82F6
text: white
```

사용

```
콘텐츠 생성
```

---

### Secondary Button

```
background: white
border: 1px solid #CBD5F5
text: #334155
```

사용

```
플레이리스트 생성
SEO 생성
```

---

## 6. Topic Momentum 디자인

현재

```
초록 pill 여러 개
```

변경

```
outline pill
```

스타일

```
border: #E2E8F0
text: #334155
background: white
```

예

```
심장을
때리는
한국적
강렬한
```

---

## 7. Upload Candidate 카드

강조는 **좌측 border만 사용**

HOT 예

```
border-left: 4px solid #3B82F6
```

Momentum

```
border-left: 4px solid #CBD5F5
```

---

## 8. Strategy 카드

카드 색 사용 금지

구분 방식

```
좌측 border
badge
```

예

```
| RED  | FIX
| BLUE | KEYWORD
| GRAY | OPERATION
```

---

## 9. 숫자 강조

증가율만 색 사용

예

```
+261.8%
+19.3%
+13.9%
```

스타일

```
color: #16A34A
font-weight: 600
```

---

## 10. 타이포그래피

제목

```
font-weight: 600
font-size: 16px
```

본문

```
font-size: 14px
color: #334155
```

보조 텍스트

```
font-size: 13px
color: #64748B
```

---

## 개발 요청서

대상

```
CreatorControlPanel.tsx
StrategyInsightsPanel.tsx
StrategyCard.tsx
UploadCandidateCard.tsx
```

목적

```
대시보드 컬러 시스템 단순화
```

---

## 1. 기존 컬러 제거

삭제 대상

```
green card background
purple badge
orange badge
multi-color cards
```

---

## 2. 카드 스타일 통일

모든 카드

```
background: #FFFFFF
border: 1px solid #E2E8F0
border-radius: 10px
```

---

## 3. Badge 색상 통일

사용 가능한 badge

```
FIX
HOT
INFO
```

색상 규칙

```
FIX → red
HOT → blue
INFO → gray
```

---

## 4. Topic Momentum 스타일 변경

현재

```
green filled pill
```

변경

```
outline pill
```

스타일

```
background: white
border: 1px solid #E2E8F0
color: #334155
```

---

## 5. 버튼 색상 정리

Primary

```
콘텐츠 생성
```

Secondary

```
플레이리스트 생성
SEO 생성
```

---

## 6. Strategy 카드 스타일

카드 색 사용 금지

구분 방식

```
badge
left border
```

---

## 7. Upload Candidate 스타일

HOT

```
left border: blue
```

Momentum

```
left border: gray
```

---

## 기대 효과

개선 전

```
알록달록
시각적 피로
정보 집중도 낮음
```

개선 후

```
차분한 분석 UI
전문적인 SaaS 스타일
가독성 상승
```

---



# 뉴 로드맵

STAGE 1
Thumbnail Intelligence

---
STAGE 2
Thumbnail Engine
│
├─ 1 Thumbnail Intelligence
├─ 2 Style Intelligence
├─ 3 Prompt Generation
├─ 4 Visual Analysis
├─ 5 Attention Map Engine
├─ 6 Auto Layout Engine
├─ 7 Template Rendering Engine
├─ 8 Thumbnail Studio UI
└─ 9 Thumbnail A/B Testing Engine

Backend
Flask API
style_engine
Google Sheets
OpenCV
Frontend
React Drawer
API fetch
state management
fallback system
skeleton loading
canvas rendering

---

       
결론부터 명확하게 👇

👉 **지금 단계 E (NavigationContext + 드릴다운) 진행하는 게 맞습니다.**
단, **“UX 기능”으로 만들지 말고 “운영 속도 개선 장치”로 설계해야 합니다.**

---

# 메인 대시보드 문제점 및 개선
1. CHANNEL INSIGHT: 
1) CTR 기간별 수집이 안됨. 데이터 수집 체크 필요

2) VIEWS
▼ -45.4%
SUBS
+52
▼ -62.6%
WATCH
3.0만분
▼ -59.4%
AVG
1:57
▼ -25.9%
LIKES
253
▼ -49%
CTR
4.4%
▼ -29.7%
REV
₩12,653
- 각 카드를 누르면 근거 데이터가 나와야함
=> 


~~3) 각 카드들 이름 한국어로 변경 (VIEWS → 조회수, SUBS → 구독자, WATCH → 시청시간, AVG → 평균 시청시간, LIKES → 좋아요, CTR → 클릭률, REV → 예상 수익)~~

~~1) 더 자세히보기 삭제할게(그 안에 나오는 블럭들도 같이 삭제)~~

2) 채널 건강도 그래프: 
=> 근거 데이터가 너무 단순함. 
“유튜브 알고리즘 기반 건강도 점수 시스템”
점수 공식
가중치
감점 룰
1️⃣ 채널 기준 (필수)
평균 대비 비교
2️⃣ 트렌드 기준
최근 vs 과거
3️⃣ 최소 절대 기준
너무 낮은 경우 컷

등등 점수 시스템이 만들어져야함. 

보고서 작성해

- 쓸데없이 자리를 많이 차지하는 듯 싶음. ui에서 제거하거나, 아니면 그래프 크기를 줄이는 방향으로 개선 필요
- 만약 그래프를 줄여서 남긴다면, 채널 건강도의 근거 데이터가 무엇인지 명확하게 나와야할 것 같음. 예를 들어, 채널 건강도가 낮은 이유가 조회수 감소 때문이라면, 조회수 감소 그래프가 같이 나오는 식으로


------


1. 영상 상세:  
2) 어떤 경우 영상 상세로 들어가게 되는지 명확하지 않은 것 같음. 
- 항상 드릴다운으로 클릭을 했을때 최종 종착지가 결국 영상 상세 데이터가 되었으면 함. 
- 예를 들어, 채널 인사이트에서 CTR 감소 카드 누르면 CTR 감소한 영상들 리스트 나오고, 그 영상들 중 하나를 누르면 그 영상의 상세 데이터가 나오는 식으로 
- 모든 영상 상세에 언제 데이터인지 Last updated 표시 (단순 전체 업로드 말고, 영상의 실제 데이터 들어온 Last updated. 영상마다 데이터 업데이트 되는 시점이 다르므로.)


3. CONTENT EXECUTION
- "조회" -> "조회수" 로 변경
- 최근 10일 -> 최근 30일로 변경
-> 실제 데이터도 최근 30일 데이터로 변경. (csv 자동 업데이트 데이터도 어차피 최근 30일 데이터로 들어오므로)
- "최근 업로드 성과" 옆에 "최근 10일" 텍스트는 삭제

3. ACTION CENTER
- 안에 아무런 블록이 없는데 지워도 되는건지

해결방안 보고서 작성해

----


4. CONTENT STRATEGY
1) 오늘의 전략: 아무 의미가 없어보임. 왜 필요한지 이유 설명하고, 삭제해도 되는지 검토

2) 골든아워: 
- 이미 금요일이 지났는데 계속 금요일 기준으로 나옴. -> 다음 추천 시간으로 변경하고 
- "다음 추천 시간까지 다음 추천까지 21시간 43분" 이 부분은 Ui 삭제
- 업로드 3시간 전 완성 권장, 1시간 전 알림 설정 삭제할게. 
- 추천 시간을 18:00~20:00 이런식으로 범위를 크게 주지 말고, 정확한 시간으로 설정해

3) 채널 상태 요약
- 썸네일 개선 필요, 검색 노출 부족, 초반 몰입도 문제, 알고리즘 확산 부족
각 카드를 누르면 -> 어떤 영상이 문제인지 -> 그 영상을 누르면 영상 상세 데이터 나오게 
- 사이드 패널에 이와 관련된 데이터가 같이 나오는 식으로 개선 필요


5. 패널 이름과 현재 패널 안에 있는 데이터들이랑 맞지 않는 것 같음. 검토 필요.



해결방안 보고서 작성해 



# 사이드 패널 문제점 및 개선
