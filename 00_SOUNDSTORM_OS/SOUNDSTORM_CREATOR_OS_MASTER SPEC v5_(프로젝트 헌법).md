
---
# 1. Creator OS 목적

Soundstorm Creator OS는

```
YouTube 데이터
+
콘텐츠 제작 엔진
+
외부 유입 엔진
```

을 결합한 **Creator Operating System**이다.

목표

```
데이터 기반 콘텐츠 제작 자동화
```

즉

```
분석 → 전략 → 제작 → 배포 → 성장
```

을 자동화한다.

## Creator OS = Experiment OS

Creator OS는 콘텐츠 제작을

```
데이터 기반 자동화
+
가설 기반 실험
```

시스템으로 수행한다.

```
Content Pack = 실험 단위
Hypothesis   = 가설 (theme / thumbnailStyle / hookType / targetEmotion)
Analytics    = 검증 데이터
Pattern      = 학습 결과
```

채널은 가설을 세우고, 실험하고, 검증하면서 자동으로 학습한다.

---

# 2. Creator OS 핵심 데이터 구조

## Content Pack

Creator OS의 **기본 단위**

```
콘텐츠 하나 = Content Pack
```

구성

```
video_id         ← 절대 키: 업로드 후 YouTube video_id 저장, Analytics 매핑 기준
theme
title
suno_prompt
thumbnail
thumbnail_text
description
hashtags
keywords
playlist
status
performance      ← STAGE 7: YouTube Analytics 자동 수집 (views / ctr / impressions / watch_time)
hypothesis       ← STAGE 7.5: 가설 레이어 (theme? / thumbnailStyle? / hookType? / targetEmotion?)
campaign_links
distribution_data
```

status 상태 정의

```
idea      : 후보 테마 (아직 Pack 미생성)
draft     : Pack 생성됨 (자동화 미완료)
ready     : 자동화 완료 (업로드 준비)
uploaded  : YouTube 업로드 완료
analyzing : 성과 수집 중 (video_id 연결됨)
```

예

```json
{
 "video_id": "dQw4w9WgXcQ",
 "theme": "Samurai Battle",
 "title": "SAMURAI BATTLE | Epic War Drums",
 "suno_prompt": "epic oriental battle music, war drums, dark cinematic atmosphere",
 "thumbnail": "samurai_thumbnail.png",
 "thumbnail_text": "SAMURAI BATTLE",
 "description": "Epic oriental battle music featuring war drums...",
 "hashtags": ["#epicmusic", "#samurai", "#wardrums"],
 "keywords": ["oriental battle music", "war drums"],
 "playlist": "Epic Battle",
 "status": "analyzing",
 "performance": {}
}
```

---

# 2-A. Content Pack — 핵심 실행 객체

Content Pack은 Creator OS 자동화의 **결과물이 쌓이는 그릇**이다.

```
Analysis 데이터
      ↓
Content Pack 생성
      ↓
AUTO TITLE / AUTO DESCRIPTION
AUTO TAGS / AUTO THUMBNAIL TEXT
AUTO THUMBNAIL
      ↓
status: draft → ready → uploaded → analyzing
      ↓
performance 자동 수집 → video_id 기준 Analytics 매핑
      ↓
다음 Content Pack 추천
```

## 필드 자동화 매핑

| 필드            | 자동화 여부    | 근거 데이터                          |
|-----------------|----------------|--------------------------------------|
| video_id        | (현재) 수동 입력 / (향후) YouTube API 자동 | ContentPackCard VideoIdInput |
| theme           | AI 추천 / 수동  | OpportunityEngine + hypothesisEngine 출력 |
| title           | AUTO           | 상위 CTR 패턴 + 키워드 + 테마         |
| suno_prompt     | AUTO           | 테마 + 장르 패턴                     |
| thumbnail       | AUTO           | ThumbnailStudio 생성                 |
| thumbnail_text  | AUTO           | ThumbnailIntelligence 스타일 분석    |
| description     | AUTO           | 키워드 + 플레이리스트 + 테마          |
| hashtags        | AUTO           | OpportunityEngine 키워드 + 트렌드    |
| keywords        | AUTO           | ContentStrategyEngine                |
| playlist        | 수동           | —                                    |
| status          | 자동 전이      | 각 단계 완료 시 자동 업데이트         |
| performance     | 자동 수집      | youtubeAnalyticsService (YT API → Sheets fallback) |
| hypothesis      | 수동 입력      | ContentPackCard HypothesisInput (2×2 그리드) |
| campaign_links  | 수동 입력      | ContentPackCard CampaignLinksSection |

## 핵심 원칙

```
video_id 는 Content Pack의 절대 키다.
upload 이전: video_id = null
upload 이후: video_id 저장 → Analytics 자동 매핑 시작
```

---

# 2-B. Content Pack Lifecycle

Content Pack은 다음 생명주기를 따른다.

```
[idea]
  후보 테마 발견
  OpportunityEngine / hypothesisEngine 추천
  ※ idea 상태에서 Pack 객체는 존재하지 않음
    ThemeIntelligenceChips에 표시되는 테마 문자열이 idea 단계
  ↓
[draft]
  Content Pack 생성 (Pack 객체 최초 생성 시 status = draft)
  theme 확정
  AUTO 생성 미완료 상태
  hypothesis 입력 가능 (실험 가설 설정)
  ↓
[ready]
  AUTO TITLE / SUNO / DESC / TAGS / THUMB TXT / KEYWORDS 전체 완료
  AUTO THUMBNAIL 완료 (ThumbnailStudio)
  video_id = null
  hypothesis 확정 권장 (실험 변수 고정)
  ↓
[uploaded]
  YouTube 업로드 완료
  video_id 수동 입력 (현재) → ContentPackCard VideoIdInput
  ※ 향후: YouTube Data API 업로드 응답으로 자동 수신 예정
  ↓
[analyzing]
  video_id 저장 즉시 자동 전이 (reducer UPDATE_PACK 내부 처리)
  성과 수집 시작 → youtubeAnalyticsService
  views / ctr / impressions / watch_time → performance 필드 저장
  ↓
[Hypothesis Engine 분석]
  패턴 추출 (hypothesis × performance)
  confidence = log(count+1) * avgScore * (1 + avgCtr/0.1)
  Best Pattern 도출
  ↓
[Next Pack 추천]
  GrowthLoopMonitor
  패턴 기반 Next Opportunity → 새로운 Pack 생성 (idea 루프)
```

## 상태 전이 규칙

| From      | To        | 트리거                                              |
|-----------|-----------|-----------------------------------------------------|
| idea      | draft     | ThemeIntelligenceChips 클릭 또는 "+ 새 Pack" 수동 입력 |
| draft     | ready     | 모든 AUTO 필드 완료 시 reducer 자동 전이              |
| ready     | uploaded  | ContentPackCard VideoIdInput에 video_id 입력 + 저장  |
| uploaded  | analyzing | video_id 저장 감지 → reducer UPDATE_PACK 자동 전이   |
| analyzing | —         | 성과 수집 완료 → hypothesisEngine 패턴 분석 입력      |

---

# 3. Creator Growth Loop

Creator OS는 다음 루프를 자동화한다.

```
Opportunity 발견
↓
Content Theme 생성 + Hypothesis 설정 (theme / thumbnailStyle / hookType / targetEmotion)
↓
Suno Prompt 생성
↓
Content Pack 생성
↓
Thumbnail 생성
↓
Upload → video_id 수동 입력
↓
Performance 분석 (youtubeAnalyticsService: YT Analytics IPC → Sheets fallback)
↓
Hypothesis 검증 (hypothesisEngine → Best Pattern 도출)
↓
External Traffic
↓
Community Distribution
↓
Opportunity (패턴 기반 Next Opportunity → 새 Pack 생성)
```

즉

```
Creator Growth Loop = 자동화 루프 + 실험 학습 루프
```

Hypothesis 레이어가 루프에 포함되어 매 실험마다 패턴을 학습하고
다음 Opportunity 추천의 정확도를 높인다.

---

# 4. 시스템 전체 아키텍처

```
YouTube API
External Redirect Tracker
↓
Python Automation
↓
Google Sheets (Analytics Data Layer)
↓
Content Pack DB (Production Data Layer)
↓
TypeScript Adapters
↓
React Controllers
↓
Creator Dashboard
↓
Core Intelligence Engines
```

---

# 5. Creator OS Data Layers

## Analytics Layer

데이터 저장소

```
Google Sheets
```

데이터

```
YouTube Analytics
Traffic Sources
Video Performance
Audience Data
Thumbnail URLs
```

대표님 시트

```
SS_음원마스터_최종_분석추가
```

---

## Production Layer

데이터

```
Content Packs
Thumbnail Templates
Campaign Links
Distribution Data
```

---

# 6. Core Intelligence Engines

Creator OS는 **12개의 핵심 엔진 + 서비스**로 구성된다.

```
[분석 엔진]
Insight Engine
Opportunity Engine
Theme Intelligence Engine
Content Strategy Engine
Thumbnail Intelligence Engine
Execution Automation Engine
External Traffic Engine
Distribution Engine
Growth Loop Engine

[실험 엔진 — STAGE 7+]
packPerformanceEngine     Content Pack 성과 점수 계산
hypothesisEngine          가설 패턴 추출 + Next Opportunity
youtubeAnalyticsService   Analytics 데이터 서비스 레이어
```

---

# 7. 엔진 역할

---

# Insight Engine

목적

```
채널 상태 분석
```

분석

```
조회수
CTR
시청시간
유입경로
```

---

# Opportunity Engine

목적

```
콘텐츠 기회 탐지
```

출력

```
추천 콘텐츠
Search Opportunity
Algorithm Opportunity
External Opportunity
```

---

# Theme Intelligence Engine (신규 핵심)

목적

```
콘텐츠 테마 추천
```

분석

```
잘된 영상
키워드
트렌드
외부 커뮤니티
```

출력

```
Content Theme
```

예

```
Samurai Battle
Assassin
Oriental Ritual
War Drums
```

---

# Content Strategy Engine

목적

```
콘텐츠 제작 전략 생성
```

출력

```
Title
Suno Prompt
Keywords
Playlist
```

예

```
Title
SAMURAI BATTLE | Epic War Drums

Suno Prompt
epic oriental battle music
war drums
dark cinematic atmosphere
```

---

# Thumbnail Intelligence Engine

목적

```
썸네일 성과 분석
```

분석

```
색상
대비
텍스트 길이
텍스트 위치
CTR
```

출력

```
Best Thumbnail Style
Midjourney Prompt
Recommended Copy
```

예

```
dark cinematic
red accent
high contrast
```

---

# Execution Automation Engine

목적

```
콘텐츠 제작 자동화
```

생성

```
Content Pack
Thumbnail
Title
Prompt
```

---

# External Traffic Engine

목적

```
외부 유입 분석
```

데이터

```
Discord
Reddit
Naver
Blog
```

출력

```
External Traffic Map
Campaign Performance
Community Strategy
```

---

# Distribution Engine

목적

```
콘텐츠 확산 추적
```

데이터

```
YouTube
Discord
Reddit
Blog
```

출력

```
Distribution Map
Campaign Reach
Community Impact
```

---

# Growth Loop Engine

목적

```
Creator 성장 루프 분석
```

분석

```
콘텐츠 생산
콘텐츠 성과
콘텐츠 확산
콘텐츠 기회
```

출력

```
Next Content Recommendation
```

---

# packPerformanceEngine

파일: `src/engines/packPerformanceEngine.ts`

목적

```
Content Pack 성과 점수 계산
```

입력

```
ContentPerformance { views, ctr, watch_time, impressions }
```

계산

```
score = CTR * 0.4 + Retention * 0.4 + ViewsVelocity * 0.2
```

출력

```
PerformanceScore { total, ctr, retention, velocity, grade }
grade: S(90+) / A(75+) / B(55+) / C(35+) / F
```

---

# hypothesisEngine

파일: `src/engines/hypothesisEngine.ts`

목적

```
가설 패턴 추출 + Next Opportunity 추천
```

입력

```
ContentPack[] (hypothesis + performance 모두 있는 Pack만 사용)
```

분석 차원

```
theme 단독
thumbnailStyle 단독
hookType 단독
theme × thumbnailStyle 복합 (가장 강력한 신호)
```

신뢰도 공식

```
confidence = log(count + 1) × avgScore × (1 + avgCtr / 0.1)
```

출력

```
HypothesisInsight {
  bestPatterns:      PatternResult[]   (Top 6, confidence 내림차순)
  nextOpportunities: string[]          (패턴 기반 추천 테마)
  experimentCount:   number
}
```

---

# youtubeAnalyticsService

파일: `src/services/youtubeAnalyticsService.ts`

목적

```
YouTube Analytics 데이터 서비스 레이어
```

우선순위

```
1순위: Electron IPC → YouTube Analytics API 직접 호출
2순위: Google Sheets Analytics 시트 fallback
```

출력

```
ContentPerformance { views, ctr, watch_time, impressions }
```

---

# 8. Creator Decision OS — 4-Layer Dashboard 구조

Creator Dashboard는 **의사결정 흐름**에 따라 4개 레이어로 구성된다.

```
LAYER 0  채널 현황 파악    → KPI 한눈에 확인
      ↓
LAYER 1  실행 결정         → Content Pack + 자동화 도구
      ↓
LAYER 2  분석 근거 확인    → 왜 이 콘텐츠인가?
      ↓
LAYER 3  로우 데이터       → 분석 근거의 원천 데이터
```

## LAYER 0 — 채널 현황 (KPI)

```
KPICards
  조회수 / 구독자 변화 / 시청시간 / 평균 시청시간 / 좋아요 / 수익
  전 기간 대비 성장율 배지 포함
```

## LAYER 1 — 실행 (Execution + Content Pack + Growth Loop)

```
ExecutionPanel
  이번 주 업로드 현황 / 다음 업로드 예측 / 모멘텀 상태

ContentPackManager
  후보 Content Pack 목록
  ├─ theme + status badge (idea / draft / ready / uploaded / analyzing)
  ├─ VideoIdInput          (수동 video_id 입력 + [성과 수집] 트리거)
  ├─ HypothesisInput       (2×2 그리드: theme / thumbnailStyle / hookType / targetEmotion)
  ├─ PerformanceSection    (views / impressions / CTR + score / grade badge)
  ├─ [AUTO TITLE]
  ├─ [AUTO SUNO PROMPT]
  ├─ [AUTO DESCRIPTION]
  ├─ [AUTO TAGS]
  ├─ [AUTO THUMBNAIL TEXT]
  ├─ [AUTO KEYWORDS]
  └─ [AUTO THUMBNAIL → ThumbnailStudio 연동]

GrowthLoopMonitor
  ├─ Loop Pipeline          (9-node 시각화: Opportunity → Theme → Content → Thumbnail → Upload → Analytics → Ext.Traffic → Community → Next Opp.)
  ├─ Status Flow Bar        (idea / draft / ready / uploaded / analyzing 별 Pack 수)
  ├─ Best Pattern           (hypothesisEngine Top 3: dimension tags + avgCtr + avgScore + N packs badge)
  └─ Next Opportunity       (패턴 기반 테마 추천 chips → 클릭 시 새 Pack 생성)
```

핵심 원칙

```
자동화 버튼은 Content Pack 단위로 실행된다.
버튼 실행 결과는 Content Pack 필드에 저장된다.
각 버튼 하단에 근거 데이터(LAYER 2)를 인라인으로 펼칠 수 있다.
GrowthLoopMonitor는 ContentPackContext를 통해 ContentPackManager와 상태를 공유한다.
```

## LAYER 2 — 분석 근거 (Analysis)

```
EarlyPerformancePanel    최근 업로드 초기 성과
ChannelHealthCard        채널 상태 요약 + 즉시 수정 항목
StrategyPanel            콘텐츠 전략 요약 (OpportunitySection 제거 — GrowthLoopMonitor로 통합)
```

## LAYER 3 — 로우 데이터 (Raw Data)

```
ContentStrategyCard      콘텐츠 전략 목록 + CTR 분포 raw
DashboardGrid
  └─ GrowthPanel / AudienceTabs / TopVideos
     TrendingVideos / TrafficCluster / ExternalTrafficPanel
```

---

# 9. Dashboard Panel 구조

```
DashboardPage
  │
  ├─ [LAYER 0]
  │   KPICards
  │
  ├─ [LAYER 1]  ── 실행
  │   ExecutionPanel
  │   ContentPackManager
  │     └─ ContentPackCard
  │           ├─ VideoIdInput (수동 video_id 입력)
  │           ├─ HypothesisInput (2×2: theme/thumbnailStyle/hookType/targetEmotion)
  │           ├─ PerformanceSection (views/ctr/score/grade)
  │           ├─ AutoTitleGenerator
  │           ├─ AutoSunoPromptGenerator
  │           ├─ AutoDescriptionGenerator
  │           ├─ AutoTagsGenerator
  │           ├─ AutoThumbnailTextGenerator
  │           ├─ AutoKeywordsGenerator
  │           └─ ThumbnailStudio (Drawer 연동)
  │   GrowthLoopMonitor
  │     ├─ Loop Pipeline (9-node)
  │     ├─ Status Flow Bar
  │     ├─ Best Pattern (Top 3 — hypothesisEngine)
  │     └─ Next Opportunity chips
  │
  ├─ [LAYER 2]  ── 분석 근거
  │   EarlyPerformancePanel
  │   ChannelHealthCard
  │   StrategyPanel (OpportunitySection 통합 → GrowthLoopMonitor)
  │
  └─ [LAYER 3]  ── 로우 데이터
      ContentStrategyCard
      DashboardGrid
        ├─ GrowthPanel
        ├─ AudienceTabs
        ├─ TopVideos
        ├─ TrendingVideos
        ├─ TrafficCluster
        └─ ExternalTrafficPanel
```

---

# 10. Dashboard Layer 구조

Dashboard는 **Creator Decision OS 기준 4개 레이어**로 구성된다.

```
LAYER 0  KPI Layer          채널 현황 한눈에
LAYER 1  Execution Layer    Content Pack + 자동화 실행 + Growth Loop 모니터링
LAYER 2  Analysis Layer     분석 근거 (왜 이 콘텐츠인가)
LAYER 3  Raw Data Layer     로우 데이터 드릴다운
```

---

# LAYER 0 — KPI Layer

```
KPICards
  조회수 / 구독자 변화 / 시청시간 / 평균시청시간 / 좋아요 / 수익
```

---

# LAYER 1 — Execution Layer

```
ExecutionPanel          업로드 현황 + 모멘텀
ContentPackManager      Content Pack 생성 + AUTO 도구 실행 (7개 AUTO 버튼)
GrowthLoopMonitor       Growth Loop 시각화 + Best Pattern + Next Opportunity
```

---

# LAYER 2 — Analysis Layer

```
EarlyPerformancePanel   최근 영상 초기 성과
OpportunityCard         콘텐츠 기회 + 트렌드
ChannelHealthCard       채널 상태 + 즉시 수정
```

---

# LAYER 3 — Raw Data Layer

```
ContentStrategyCard     전략 목록 + CTR 분포
DashboardGrid           Growth / Audience / TopVideos
                        Trending / Traffic / ExternalTraffic
```

---

# 11. Production Roadmap — Creator Decision OS 기준

```
STAGE 1   Thumbnail Intelligence          ✅ 완료
STAGE 2   Thumbnail Studio                ✅ 완료 (Drawer)
STAGE 3   Content Pack Manager            ✅ 완료
STAGE 4   Automation Tools 통합           ✅ 완료 (7개 AUTO 버튼: title/suno/desc/tags/thumb_text/keywords/thumbnail)
STAGE 5   External Traffic Engine 연결    ✅ 완료
STAGE 6   Growth Loop Monitor             ✅ 완료 (GrowthLoopMonitor)
STAGE 7   Content Pack ↔ Analytics 연결  ✅ 완료 (youtubeAnalyticsService + VideoIdInput + PerformanceSection)
STAGE 7.5 Hypothesis Engine               ✅ 완료 (PackHypothesis + hypothesisEngine + HypothesisInput + Best Pattern)
STAGE 7.6 Pattern Confidence              ✅ 완료 (confidence = log(n+1) × avgScore × CTR weight)
STAGE 8   Thumbnail Intelligence 완성     🔴 미구현  ← 다음 단계
```

## 구현 순서 근거

```
STAGE 3 먼저
  Content Pack이 없으면 자동화 결과물을 저장할 그릇이 없다.
  모든 AUTO 버튼은 Content Pack 단위로 실행되어야 한다.

STAGE 4 다음
  Content Pack 구조 위에 AUTO 도구를 붙인다.
  title / suno_prompt / description / hashtags / thumbnail_text / keywords 생성 로직.

STAGE 5 병행 가능
  ExternalTrafficInsightsPanel.tsx 이미 존재.
  DashboardGrid CardId 추가만으로 즉시 노출 가능.

STAGE 6 그 다음
  Lifecycle (idea → analyzing) 완성 후에 설계 가능.
  ContentPackContext로 ContentPackManager ↔ GrowthLoopMonitor 상태 공유.

STAGE 7 마지막
  video_id 기준으로 Pack ↔ Analytics 자동 매핑.
  youtubeAnalyticsService: IPC 1순위 → Sheets fallback.
  performance 필드 자동 수집 완성.

STAGE 7.5 Hypothesis Engine
  Content Pack = 실험 단위.
  PackHypothesis 가설 입력 → hypothesisEngine 패턴 분석 → Best Pattern 출력.

STAGE 7.6 Pattern Confidence
  sample size 반영 신뢰도 공식.
  단일 실험(n=1) 패턴의 과대평가 방지.
  CTR 높은 패턴 우선 추천.

STAGE 8 다음
  Thumbnail Intelligence 완성 — ThumbnailStudio + 스타일 분석 + A/B 테스트.
```

---

# STAGE 1

## Thumbnail Intelligence System

분석 데이터

```
thumbnail
title
views
ctr
watch_time
```

분석

```
contrast
color
text_area
```

출력

```
Best Thumbnail Style
```

---

# STAGE 2

## Thumbnail Studio

구성

```
Style Intelligence
Prompt Generator
Copy Generator
Image Upload
Template Engine
Preview
Generate Thumbnail
```

---

# STAGE 3

## Content Pack Engine

구성

```
theme
title
suno_prompt
thumbnail
keywords
playlist
status
```

---

# STAGE 4

## Execution Automation
ExecutionPanel 안에서 실제 흐름은 이렇게 됩니다.

Theme Intelligence  
↓  
추천 콘텐츠  
  
ExecutionPanel Action  
↓  
Content Pack 생성  
↓  
Thumbnail Studio  
↓  
Upload Assistant

---

# STAGE 5

## External Traffic Engine

분석

```
discord
reddit
naver
blog
```

출력

```
Community Strategy
Campaign Links
```

---

# STAGE 6

## Growth Engine

분석

```
콘텐츠 생산
콘텐츠 성과
콘텐츠 확산
콘텐츠 기회
```

출력

```
Next Content Recommendation
```

---

# 실제 개발 순서 (대표님 시스템 기준)

```
1 Thumbnail Intelligence
2 Thumbnail Studio
3 Content Pack Manager
4 Execution Automation
5 External Traffic Engine
6 Growth Engine
```

예상

```
10~12일
```

---

# 대표님 OS 핵심 엔진 4개 (가장 중요)

실제로 Creator OS의 두뇌는 이 4개입니다.

```
Theme Intelligence
Content Strategy
Thumbnail Intelligence
External Traffic
```

이 4개가 연결되면

```
데이터
→ 콘텐츠
→ 썸네일
→ 홍보
```

가 자동화됩니다.

---


---
# SOUNDSTORM 엔진 파이프라인 현황 보고서

**기준일: 2026-03-19**

---

## 전체 파이프라인 구조

```
[Python 수집 레이어]  →  [Google Sheets]  →  [Electron IPC Bridge (16채널)]
                                                        ↓
                                           [TypeScript Adapters (10개)]
                                                        ↓
                                           [TypeScript Services (1개)]
                                                        ↓
                                           [TypeScript Engines (2개)]
                                                        ↓
                                           [React Controllers (4개)]
                                                        ↓
                                            [UI Panels / Dashboard]
                                              ├─ KPICards (LAYER 0)
                                              ├─ ContentPackManager (LAYER 1)
                                              ├─ GrowthLoopMonitor (LAYER 1)
                                              ├─ StrategyPanel / EarlyPerf (LAYER 2)
                                              └─ DashboardGrid (LAYER 3)
```

---

## 1. Python 자동화 엔진 (07_AUTOMATION_자동화)

### 1-1. 데이터 수집 파이프라인

| 파일 | 버전 | 역할 |
|------|------|------|
| `scripts_스크립트/api_data_shuttler.py` | v17.0 | **메인 파이프라인 진입점** — YouTube API → Google Sheets 업로드 + **SS_음원마스터_최종 APPEND+UPDATE 동기화** (Apps Script `syncMasterV10` parity, 파생 지표 계산, 게시일 내림차순 정렬) + **Analytics_Periods 통합 write** (4기간 period 컬럼 통합) + **_RawData_FullPeriod 90일 Rolling Purge** |
| `scripts_스크립트/youtube_data_collector.py` | — | YouTube Data API v3 영상 메타데이터 수집 |
| `scripts_스크립트/youtube_analytics_client.py` | — | YouTube Analytics API 클라이언트 |
| `scripts_스크립트/youtube_analyzer.py` | — | 수집 데이터 분석 처리 |

**핵심 특징:** CI/로컬 듀얼 인증 모드

- 로컬 환경: `service_account.json` 파일 기반
- GitHub Actions: `SERVICE_ACCOUNT_B64` 환경변수 → `/tmp` 경로 디코딩

**타깃 시트:** `Analytics_Periods` (통합), `Analytics_7d`, `Analytics_30d`, `Analytics_all`, `Analytics_prev30` (롤백용 병렬 유지), `_RawData_FullPeriod`, `Channel_KPI`, `_Pipeline_Health`

---

### 1-2. 데이터 동기화 엔진

| 파일 | 역할 |
|------|------|
| `engine/weekly_sync.py` | 주간 Google Sheets 동기화 + 서식 일괄 적용 |
| `engine/sync_to_google_sheets.py` | Sheets 데이터 동기화 전용 |
| `engine/update_single_sheet.py` | 개별 시트 업데이트 |
| `engine/google_sheets_formatting.py` | 서식화 함수 모음 |
| `scripts_스크립트/test_final_layer_sync.py` | SS_음원마스터_최종 단독 동기화 테스트 — Apps Script `syncMasterV10()` 100% parity 검증 + diff 출력 |

**macOS LaunchD / cron 자동화:**

| 파일/스케줄 | 역할 |
|------------|------|
| `~/Library/LaunchAgents/com.soundstorm.finallayersync.plist` | `test_final_layer_sync.py` 30분 자동 실행 데몬 (`StartInterval: 1800`, `RunAtLoad: true`) |
| `~/Library/LaunchAgents/com.soundstorm.chrome.plist` | CDP Chrome 전용 프로필 관리 (`RunAtLoad: false`, `KeepAlive: false`) — `sync_studio_csv.sh` 실행 시에만 Chrome 기동·종료 |
| cron `0 17 * * *` (02:00 KST) | `sync_studio_csv.sh` — Studio CSV 다운로드 → git push (변경 없으면 `--allow-empty` keepalive 커밋) → GitHub Actions push trigger |
| cron `0 18 * * *` (03:00 KST) | `engine/pipeline_health_monitor.py --fix` — 전수 건강 검진 + 자동 복구 → `_Pipeline_Health` 탭 기록 |

---

### 1-3. 분석 엔진

| 파일 | 역할 |
|------|------|
| `engine/soundstorm_analyzer.py` | 전체 폴더 스캔 — audio/image/video 중복 검사 (librosa, sklearn cosine similarity) |
| `engine/snapshot_engine.py` | 팀가이드 스냅샷 draft → approve 2단계 자동화 |
| `engine/analytics_snapshot_engine.py` | `_Analytics_Snapshot` 탭 생성 — 차원 분석 최신 스냅샷 집계 |
| `engine/auto_snapshot_poller.py` | `analytics_snapshot_engine.py` 주기 실행 폴러 |
| `engine/pipeline_health_monitor.py` | **파이프라인 전수 건강 검진 + 자동 복구 엔진** (아래 별도 섹션 참조) |
| `analytics/channel_ctr_engine.py` | `Channel_CTR_KPI` 탭 생성 — 채널 CTR 집계 |
| `analytics/video_diagnostics_engine.py` | `Video_Diagnostics` 탭 생성 — 영상별 자동 진단 |
| `analytics/thumbnail_intelligence_engine.py` | `Thumbnail_Style_Performance` 탭 생성 — 썸네일 스타일별 성과 분석 |
| `analytics/reference_engine.py` | `Reference_Videos` 탭 생성 — 레퍼런스 TOP 영상 |
| `scripts_스크립트/comment_analyzer.py` | 댓글 분석 |
| `scripts_스크립트/pattern_analyzer.py` | 패턴 분석 |

---

### 1-4. 음원 관리 파이프라인

| 파일 | 역할 |
|------|------|
| `scripts_스크립트/extract_audio_durations.py` | 음원 길이 추출 |
| `scripts_스크립트/rename_audio_files.py` | 음원 파일명 변경 |
| `scripts_스크립트/export_uploaded_audio.py` | 업로드된 음원 내보내기 |
| `scripts_스크립트/organize_files.py` | 파일 정렬/구조화 |
| `scripts_스크립트/cleanup_duplicates.py` | 중복 파일 정리 |

---

### 1-5. 라이선스 엔진 (license_engine/) — 14단계 워크플로우

```
Gmail 주문 수신
     ↓
[1]  입력 검증 + 중복 체크 (db_manager.py)
     ↓
[2~6] 채번 + PDF 생성 루프 (최대 2회 재시도)
     ├── [2] 라이선스 번호 채번  SS-{track_id}-{date}-{seq:02d}
     ├── [3] QR 코드 생성 (qr_generator.py)
     ├── [4] HTML 렌더링
     ├── [5] PDF 생성 (WeasyPrint)
     └── [6] PDF 존재 검증
     ↓
[7~8] Google Drive 폴더 생성 + PDF 업로드
     ↓
[9]  Cloudflare R2 업로드
     ↓
[10] SMTP 이메일 발송
     ↓
[11] SQLite DB 등록
     ↓
[12] Gmail 메시지 "처리됨" 마크
     ↓
[13~14] 기록 저장 + 결과 반환
```

**진입점 2개:**
- `main.py` → CLI 수동 실행
- `main_web.py` → Flask `/trigger` 엔드포인트 (Cloud Scheduler 연동)

**라이선스 타입:** `one_time` / `permanent`
**검증 URL:** `https://soundstorm.kr/verify`

---

## 2. TypeScript 어댑터 레이어 (src/adapters/)

| 어댑터 | 역할 | 데이터 소스 |
|--------|------|------------|
| `GoogleSheetAdapter.ts` | Sheets 원본 행 → NormalizedVideo[] | `_RawData_Master` |
| `AnalyticsAdapter.ts` | Analytics 다차원 데이터 파싱 | `Analytics_Periods` (period 컬럼 필터링), `_Analytics_Snapshot`, `_RawData_FullPeriod`, `Channel_KPI` |
| `ChannelKPIAdapter.ts` | 채널 KPI 이력 + **localStorage 스냅샷 폴백** (`soundstorm_kpi_snapshot_v1`) | `Channel_KPI` |
| `YouTubeApiAdapter.ts` | YouTube API 응답 정규화 | YouTube Data API v3 |
| `dataNormalizer.ts` | RawVideoRow → NormalizedVideo | 내부 변환 |
| `ReferenceVideosAdapter.ts` | 레퍼런스 영상 데이터 파싱 | Sheets Reference_Videos |
| `ThumbnailStyleAdapter.ts` | 썸네일 스타일 성과 파싱 | Sheets Thumbnail_Style_Performance |
| `VideoDiagnosticsAdapter.ts` | 영상 진단 데이터 파싱 | Sheets Video_Diagnostics |
| `VideoTitleMapAdapter.ts` | video_id → 제목 매핑 | Sheets 전체 |
| `reachAdapter.ts` | 외부 유입 도달 데이터 파싱 | ExternalTraffic 시트 |

### AnalyticsAdapter 처리 데이터

```
Analytics_Periods (v17.0 통합 — period 컬럼으로 필터링)
  컬럼: period | type | key | views | likes | watch_time_min | avg_duration_sec |
        subscriber_change | ratio | rank | title
  period 값: "7d" | "30d" | "prev30" | "all"
  type 값:   "SUMMARY" (채널 집계) | "VIDEO" (영상별 Top 10)

  사용처:
  ├── currentRows   = filter(period === 현재선택기간)  → KpiCardsPanel, GrowthPanel
  ├── prev30Rows    = filter(period === "prev30")      → GrowthPanel 성장율 계산
  └── allRows       = filter(period === "all")         → HitVideosPanel 영상 순위

_RawData_FullPeriod (행 형식 3가지 자동 판별 — 차원 분석용 fallback)
  ├── [AGG]    4컬럼 집계행  : metric_type | dim_1 | dim_2 | value
  ├── [SNAP-A] 8컬럼 구버전  : snapshot_id | ... | collected_at | metric_type | dim_1 | dim_2 | value
  └── [SNAP-B] 8컬럼 신버전  : snapshot_id | ... | metric_type | dim_1 | dim_2 | value | collected_at

metric_type 분류:
  DEMOGRAPHICS    → age[]
  COUNTRY         → countries[]
  DEVICE          → devices[]
  KEYWORD         → keywords[]          (dim_2 = "search" 필터)
  EXTERNAL        → trafficSources[]
  EXTERNAL_DETAIL → internalInfluence[] (Top 10)
```

---

## 3. TypeScript 서비스 레이어 (src/services/)

### youtubeAnalyticsService.ts (STAGE 7)

목적: Content Pack ↔ Analytics 연결 전용 서비스 레이어

```
fetchAllPerformance(videoIds: string[]) → AnalyticsMap
fetchPerformanceByVideoId(videoId: string) → ContentPerformance
```

**호출 우선순위:**

```
1순위: Electron IPC → YouTube Analytics API 직접 호출
2순위: Google Sheets Analytics 시트 fallback (IPC 실패 시)
```

**출력 타입:**
```ts
ContentPerformance { views?, ctr?, watch_time?, impressions? }
```

---

## 4. TypeScript 엔진 레이어 (src/engines/)

### packPerformanceEngine.ts (STAGE 7)

목적: Content Pack 성과 점수 계산 — UI 분리 원칙

```
calcPerformanceScore(perf: ContentPerformance): PerformanceScore
scoreColor(total: number): string
```

**점수 공식:**
```
score = CTR * 0.4 + Retention * 0.4 + ViewsVelocity * 0.2
```

**등급:**
```
S: 90+  /  A: 75+  /  B: 55+  /  C: 35+  /  F: 35 미만
```

---

### hypothesisEngine.ts (STAGE 7.5 + 7.6)

목적: 가설 패턴 추출 + Next Opportunity 자동 생성

```
analyzeHypotheses(packs: ContentPack[]): HypothesisInsight
```

**분석 차원:**
```
theme 단독
thumbnailStyle 단독
hookType 단독
theme × thumbnailStyle 복합 (가장 강력한 신호)
```

**신뢰도 공식 (STAGE 7.6):**
```
confidence = log(count + 1) × avgScore × (1 + avgCtr / 0.1)

sample 1개: log(2) ≈ 0.69 → score × 0.69  (신뢰도 낮음)
sample 5개: log(6) ≈ 1.79 → score × 1.79  (신뢰도 높음)
CTR weight: 3% → ×1.3 / 6% → ×1.6 / 8% → ×1.8
```

**출력:**
```ts
HypothesisInsight {
  bestPatterns:      PatternResult[]  // Top 6, confidence 내림차순
  nextOpportunities: string[]         // 패턴 기반 추천 테마 (최대 6개)
  experimentCount:   number
}
```

---

## 5. Electron IPC 브릿지 (electron/main.js + preload.js)

| IPC 채널 | 방향 | 역할 | STAGE |
|----------|------|------|-------|
| `FETCH_SHEET_VIDEOS` | Renderer → Main | Google Sheets API 호출 | 기존 |
| `FETCH_YT_ANALYTICS` | Renderer → Main | YouTube Analytics API 호출 | 기존 |
| `YT_AUTH_STATUS` | Renderer → Main | YouTube OAuth 상태 확인 | 기존 |
| `YT_AUTH_CLEAR` | Renderer → Main | YouTube 토큰 초기화 | 기존 |
| `SHEETS_AUTH_STATUS` | Renderer → Main | Sheets OAuth 상태 확인 | 기존 |
| `SHEETS_AUTH_CLEAR` | Renderer → Main | Sheets 토큰 초기화 | 기존 |
| `load-official-state` | Renderer → Main | `logs/state.json` 로드 | 기존 |
| `set-roadmap-meta` | Renderer → Main | 로드맵 메타 업데이트 | 기존 |
| `load-tasks` / `add-task` / `update-task` / `delete-task` | Renderer → Main | 태스크 CRUD | 기존 |
| `load-changelog` / `append-changelog` | Renderer → Main | 변경 이력 관리 | 기존 |
| `get-pending-proposals` | Renderer → Main | AI 제안 목록 조회 | 기존 |
| `approve-proposal` / `execute-proposal` | Renderer → Main | AI 제안 승인/실행 | 기존 |
| `load-content-packs` | Renderer → Main | Content Pack 목록 로드 | STAGE 3 |
| `save-content-packs` | Renderer → Main | Content Pack 목록 저장 | STAGE 3 |
| `fetch-yt-performance` | Renderer → Main | video_id 기준 Analytics 수집 | STAGE 7 |
| `getGithubPat` | Renderer → Main | GitHub PAT 조회 — DataHealthBar workflow auto-dispatch용 | v3 |

**preload.js window.api 노출 항목:** `loadContentPacks`, `saveContentPacks`, `fetchSheetVideos`, `fetchYtAnalytics`, 태스크/변경이력/제안 CRUD

---

## 6. React 컨트롤러 레이어 (src/controllers/)

### useContentPackController (STAGE 3+)

파일: `src/controllers/useContentPackController.ts`

**Actions (reducer 기반):**

| 액션 | 설명 |
|------|------|
| `CREATE_PACK` | 새 Content Pack 생성 (status: draft) |
| `UPDATE_PACK` | Pack 필드 업데이트 + uploaded→analyzing 자동 전이 |
| `DELETE_PACK` | Pack 삭제 |
| `SET_ACTIVE` | 활성 Pack 변경 |
| `SET_GENERATING` | AUTO 생성 진행 상태 플래그 |
| `SET_SYNCING` | 성과 동기화 진행 상태 플래그 |
| `LOAD_PACKS` | IPC에서 Pack 목록 로드 |

**공개 함수:**

| 함수 | 설명 |
|------|------|
| `createPack(theme)` | 새 Pack 생성 |
| `updatePack(id, changes)` | Pack 부분 업데이트 |
| `deletePack(id)` | Pack 삭제 |
| `generateField(id, field)` | AUTO 단일 필드 생성 |
| `generateAll(id)` | AUTO 전체 필드 일괄 생성 |
| `syncPerformance(id)` | 단일 Pack 성과 수집 |
| `syncAllPerformance()` | video_id 있는 전체 Pack 성과 수집 |

**상태 구조:**
```ts
{
  packs:      ContentPack[]
  activePack: ContentPack | null
  generating: Record<string, Partial<Record<AutoField, boolean>>>
  syncing:    Record<string, boolean>
  error:      string | null
}
```

**uploaded → analyzing 자동 전이 로직:**
```ts
// reducer UPDATE_PACK 내부
if (next.status === "uploaded" && next.video_id) {
  next.status = "analyzing";
}
```

---

### ContentPackContext (STAGE 6)

파일: `src/controllers/ContentPackContext.tsx`

- `ContentPackProvider` — `useContentPackController()` 상태를 React Context로 주입
- `useContentPackCtx()` — ContentPackManager + GrowthLoopMonitor 양쪽에서 동일 상태 공유
- DashboardPage 최상단에서 `<ContentPackProvider>` 래핑

**설계 이유:** ContentPackManager와 GrowthLoopMonitor가 동일 Pack 목록을 필요로 하지만 props drilling을 피하기 위해 Context 패턴 적용

---

### useYouTubeController

파일: `src/controllers/useYouTubeController.ts`

- **5분 폴링** (`setInterval 300,000ms`) — 자동 데이터 갱신
- `loadVideos()` → `fetchSheetVideos()` → `normalizeVideos()` → `runFullAnalysis()`
- `loadChannelKPI()` → `fetchChannelKPI()`
- `runFullAnalysis()` 메모이즈 (videos, period, weights 변경 시만 재계산)

**반환값:**

| 키 | 설명 |
|----|------|
| `dailyStats` | 일별 조회수 추세 |
| `topVideos` | 상위 영상 목록 |
| `contentClusters` | 콘텐츠 클러스터 분석 |
| `trendClusters` | 트렌드 클러스터 |
| `algorithmSignals` | 알고리즘 신호 |
| `algorithmFitness` | 알고리즘 적합도 점수 |
| `nextStrategy` | 다음 전략 제안 |
| `opportunityVideos` | 기회 영상 목록 |
| `tracksWithScore` | 트랙별 종합 점수 |
| `internalAnalysis` | 내부 분석 결과 |

**가중치 설정 (기본값):**
```js
{ growth: 0.25, reach: 0.25, engagement: 0.30, monetization: 0.20 }
```

---

### useAnalyticsController

파일: `src/controllers/useAnalyticsController.ts`

- `period` 변경 시 `fetchAnalytics()` 재호출
- `periodRef`로 stale 응답 방지 (경쟁 조건 제거)
- `calcGrowth(current, prev30)` → 지표별 성장율 % 계산

**반환값:**

| 키 | 설명 |
|----|------|
| `analytics` | AnalyticsResult (current, prev30, hitVideos) |
| `growth` | 성장율 { views, likes, watchTime, avgDuration, subscribers } |
| `loadingAnalytics` | 로딩 상태 |

---

## 7. UI 컴포넌트 레이어 (src/components/dashboard/)

### ContentPackManager.tsx

- `useContentPackCtx()` 로 상태 구독 (직접 controller 호출 없음)
- Pack 카드 목록 렌더링 + 신규 Pack 생성 UI
- `syncPerformance` 각 카드로 주입

---

### ContentPackCard.tsx

| 섹션 | 설명 |
|------|------|
| `VideoIdInput` | video_id 수동 입력 + [성과 수집] 버튼 — status ≥ uploaded 시 노출 |
| `HypothesisInput` | 2×2 그리드 (THEME / THUMB STYLE / HOOK TYPE / TARGET EMOTION) — 접을 수 있음 |
| `PerformanceSection` | views / impressions / CTR 수치 + Score 원형 + Grade 배지 |
| AUTO 버튼 7개 | TITLE / SUNO PROMPT / DESCRIPTION / TAGS / THUMBNAIL TEXT / KEYWORDS / THUMBNAIL |

---

### UpdateStatusBar.tsx

파일: `src/components/dashboard/UpdateStatusBar.tsx`

YouTube 뷰 상단 — 데이터 신뢰도 인라인 상태 바 (3개 인디케이터)

| 인디케이터 | 상태 소스 | 임계값 |
|-----------|----------|--------|
| 🟢 자동화 | GitHub API `workflow_runs` (3분 폴링) | <30min→🟢 / 30-90min→🟡지연 / >90min→🔴중단 / 5연속실패→🔴 |
| 🟢 데이터 | `syncError` prop | null→🟢 / STALE→🟡지연 / SYNC_FAILED→🔴 |
| 🟢 시트 | `_Pipeline_Health` 탭 (10분 폴링) | 전체 OK→🟢 / WARN 있음→🟡 / FAIL 있음→🔴 |

**3단 자동 복구 시스템:**

```
1️⃣ fetchWithRetry — 지수 백오프 최대 3회 재시도 (1s → 2s → 4s)
2️⃣ 타임라인 재시도 — runs null 지속 시 30s → 빈 배열 강제 세팅
3️⃣ 40분+ 미실행 → GitHub Actions workflow_dispatch POST 자동 트리거
       대상: youtube-data-sync.yml (sjytoto-bot/soundstorm-automation)
       PAT: window.api.getGithubPat() → VITE_GITHUB_PAT 순서
       세션당 1회 실행 (workflowFiredRef)
```

**시트 상태 표시 로직 (`_Pipeline_Health` 탭):**
```
_Pipeline_Health 행: tab_name | status | row_count | last_update | issues | checked_at
status 집계:
  FAIL/MISSING 행 1개 이상 → 🔴 시트 장애 N개
  WARN 행 1개 이상         → 🟡 시트 경고 N개
  전체 OK                  → 🟢 시트 정상
  탭 미존재 / 미로드       → 표시 안 함 (기존 UI 유지)
```

---

### GrowthLoopMonitor.tsx

파일: `src/components/dashboard/GrowthLoopMonitor.tsx`

- `useContentPackCtx()` 로 packs 구독
- `analyzeHypotheses(packs)` 호출 → hypothesisInsight 계산

| 섹션 | 설명 |
|------|------|
| Loop Pipeline | 9-node 시각화: Opportunity → Theme → Content → Thumbnail → Upload → Analytics → Ext.Traffic → Community → Next Opp. |
| Status Flow Bar | idea / draft / ready / uploaded / analyzing 별 Pack 수 bar |
| Best Pattern | Top 3 패턴 카드 — dimension tags + avgCtr + avgScore + `N packs` 배지 (≥3: 초록, <3: 회색) |
| Next Opportunity | hypothesisInsight.nextOpportunities 기반 테마 chips (폴백: suggestedThemes) |
| [전체 성과 수집] | video_id 있는 Pack이 1개 이상일 때 노출 → `syncAllPerformance()` |

---

## 8. 핵심 데이터 타입 (src/core/types/)

### contentPack.ts

| 타입 | 설명 |
|------|------|
| `ContentPackStatus` | `idea / draft / ready / uploaded / analyzing` |
| `AutoField` | `title / suno_prompt / thumbnail_text / description / hashtags / keywords` |
| `ContentPerformance` | `views? / ctr? / watch_time? / impressions?` |
| `PackHypothesis` | `theme? / thumbnailStyle? / hookType? / targetEmotion?` (STAGE 7.5) |
| `ContentPack` | Creator OS 기본 단위 — 실험 단위 |
| `ContentPackManagerState` | `packs + activePack + generating + syncing + error` |

---

## 8-A. Google Sheets 탭 구조 (SS_음원마스터_최종_분석추가)

총 탭 수: 19개 (2026-03-19 기준)

```
[원본 데이터]
  _RawData_Master           영상 단위 원본 (56개 영상) — api_data_shuttler.py write
  _RawData_FullPeriod       차원 분석 원본 (append-only, 90일 rolling purge)
  _RawData_Recent30         [보류 — 생성 주체 미확인, 향후 삭제 검토]

[집계 / 대시보드]
  Analytics_Periods         4기간 집계 통합 (period 컬럼: 7d/30d/prev30/all) ← v17.0 신규
  Analytics_7d              ↑ 롤백 안전망으로 병렬 유지 (향후 삭제 예정)
  Analytics_30d             ↑ 동일
  Analytics_prev30          ↑ 동일
  Analytics_all             ↑ 동일
  _Analytics_Snapshot       대시보드 전용 최신 스냅샷 — analytics_snapshot_engine.py write
  Channel_KPI               채널 KPI 시계열 (시간대: KST, append-only)

[AI 인사이트]
  Thumbnail_Analysis        썸네일 CTR 분석 — studio_csv_ingestor.py write
  Channel_CTR_KPI           채널 CTR KPI 요약 — channel_ctr_engine.py write
  Thumbnail_Style_Performance 썸네일 스타일별 성과 — thumbnail_intelligence_engine.py write
  Video_Diagnostics         영상 자동 진단 — video_diagnostics_engine.py write
  Reference_Videos          레퍼런스 TOP 영상 — reference_engine.py write

[모니터링]
  _Pipeline_Health          파이프라인 전수 건강 검진 결과 — pipeline_health_monitor.py write

[마스터]
  마스터시트 (SS_음원마스터_최종) 최종 소비층 (인간용) — api_data_shuttler.py FinalLayerSync
  업로드 예정               수동 운영 탭 (향후 별도 스프레드시트 이동 예정)
  _VideoTrend               영상 트렌드 추적
```

**탭 통합 로드맵:**
```
Phase 1 (미완료): 업로드 예정 + 트랜드분석&인사이트 → 별도 "SOUNDSTORM_운영시트"로 이동
Phase 2 (미완료): _RawData_Recent30 생성 주체 확인 → 삭제 또는 유지 결정
Phase 3 (완료):   Analytics_7d/30d/prev30/all → Analytics_Periods 통합 (v17.0)
  └─ 구 4탭 삭제는 패널 검증 후 수동 진행
```

---

## 8-B. pipeline_health_monitor.py

파일: `engine/pipeline_health_monitor.py` v1.0

목적: 구글시트 전 탭 자동 전수조사 + 자동 복구

**실행:**
```bash
python3 engine/pipeline_health_monitor.py           # 검진만
python3 engine/pipeline_health_monitor.py --fix     # 검진 + 자동 복구
```

**검진 항목 (10개 탭):**

| 탭 | 최소 행 | 신선도 | 필수 컬럼 | 자동 복구 스크립트 |
|---|---|---|---|---|
| `_RawData_Master` | 50 | 26h (`data_fetched_at`) | video_id, views | api_data_shuttler.py |
| `_RawData_FullPeriod` | 50 | 72h | metric_type, value | api_data_shuttler.py |
| `Channel_KPI` | 1 | 26h (`date`) | subscribers | api_data_shuttler.py |
| `Analytics_Periods` | 40 | — | period, type, views | api_data_shuttler.py |
| `_Analytics_Snapshot` | 5 | 48h (`snapshot_date`) | metric_type | analytics_snapshot_engine.py |
| `Thumbnail_Analysis` | 10 | — | video_id | 수동 (Studio CSV 필요) |
| `Channel_CTR_KPI` | 1 | — | metric, value | api_data_shuttler.py |
| `Thumbnail_Style_Performance` | 1 | — | — | api_data_shuttler.py |
| `Video_Diagnostics` | 10 | — | video_id | api_data_shuttler.py |
| `Reference_Videos` | 5 | — | video_id | api_data_shuttler.py |

**판정 기준:**
```
✅ OK      : 행 수 / 신선도 / 컬럼 / 수치 모두 정상
⚠️  WARN    : 타임스탬프 오래됨 또는 수치 이상 (비치명적)
❌ FAIL    : 행 수 부족 또는 시트 읽기 불가
🚫 MISSING : 탭 자체 없음
```

**자동 복구 흐름:**
```
FAIL/MISSING 탭 발견
  → 해당 fix_script 실행 (subprocess, 600초 타임아웃)
  → 재검진
  → _Pipeline_Health 탭에 최종 결과 기록
  → SLACK_WEBHOOK_URL 환경변수 있으면 Slack 알림
```

**cron 스케줄:** `0 18 * * *` (매일 03:00 KST) — api_data_shuttler.py 실행 후 1시간 뒤

---

## 9. 경로 보호 시스템 (00_GUARD/path_rules.py)

```
허용 쓰기 경로
  ✅ 07_AUTOMATION/03_RUNTIME/    (캐시, 로그, 임시)
  ✅ 99_SYSTEM/DATA_SNAPSHOTS/
  ✅ 99_SYSTEM/LICENSE/DELIVERY/
  ✅ 99_SYSTEM/LICENSE/LOGS/

차단 경로
  ❌ 00_SOUNDSTORM_OS/            (01_TEAM_GUIDES 제외)
  ❌ 08_ARCHIVE_보관/             (직접 자동화 쓰기 금지)
```

---

## 10. 외부 연동 서비스

| 서비스 | 용도 |
|--------|------|
| YouTube Data API v3 | 영상 메타데이터, 채널 정보 수집 |
| YouTube Analytics API | 조회수, 시청시간, 트래픽 소스 분석 + Content Pack 성과 수집 |
| Google Sheets API | 데이터 저장소 (원본 + 집계) + Analytics fallback |
| Google Drive API | 라이선스 PDF 폴더 저장 |
| Gmail API | 주문 이메일 수신 + 처리됨 마크 |
| SMTP (Gmail) | 라이선스 이메일 발송 |
| Cloudflare R2 | 라이선스 PDF 오브젝트 스토리지 |
| SQLite | 라이선스 발급 이력 DB |
| GitHub Actions | `sjytoto-bot/soundstorm-automation` 레포 — `youtube-data-sync.yml`, `reach-data-sync.yml` 자동 실행 / DataHealthBar에서 40분+ 미실행 시 자동 dispatch |

---

## 11. 파이프라인 수 요약

| 레이어 | 모듈/채널 수 | 상태 |
|--------|-------------|------|
| Python 데이터 수집 (CI/로컬) | 4개 스크립트 | 운영 중 |
| Python 분석/동기화 엔진 | 9개 엔진 (analytics_snapshot, auto_snapshot_poller, pipeline_health_monitor, channel_ctr, video_diagnostics, thumbnail_intelligence, reference 포함) | 운영 중 |
| 라이선스 자동화 | 14단계 워크플로우 + 8개 core 모듈 | 운영 중 |
| 음원 관리 유틸 | 5개 스크립트 | 보조 도구 |
| Google Sheets 탭 | 19개 (Analytics_Periods 신규, _Pipeline_Health 신규) | 운영 중 |
| TypeScript 어댑터 (src/adapters/) | 10개 | 운영 중 |
| TypeScript 서비스 (src/services/) | 1개 (youtubeAnalyticsService) | 운영 중 |
| TypeScript 엔진 (src/engines/) | 2개 (packPerformanceEngine, hypothesisEngine) | 운영 중 |
| Electron IPC 핸들러 | 16개 채널 | 운영 중 |
| React 컨트롤러 | 4개 (useYouTubeController, useAnalyticsController, useContentPackController, ContentPackContext) | 운영 중 |
| 핵심 UI 컴포넌트 (dashboard/) | ContentPackManager + ContentPackCard + GrowthLoopMonitor + UpdateStatusBar (3-indicator) | 운영 중 |

---

## 12. 핵심 설계 원칙

**데이터 무결성**
- **절대 키**: 모든 데이터 매핑은 `video_id` 기준
- **보호 컬럼**: `곡명`, `상품ID`, `음원파일`, `영상파일`, `장르`, `BPM` — 자동화 덮어쓰기 금지
- **셀 단위 업데이트**: `setValues()` 일괄 금지 → `setValue()` 개별 처리

**시스템 보호**
- **경로 불변**: 절대 경로 하드코딩 금지 → `path_config.py` 동적 해석
- **쓰기 보호**: `path_rules.py` 가드 통과 후에만 쓰기 허용

**Experiment OS 원칙 (STAGE 7.5+)**
- **Content Pack = 실험 단위**: 모든 Pack에 Hypothesis 가설 부착 가능
- **패턴은 데이터에서**: confidence = sample size × score × CTR weight — 직관이 아닌 데이터 기반
- **서비스/엔진 분리**: UI는 점수를 계산하지 않는다 → packPerformanceEngine 위임

---

## 13. Block 기반 Dashboard 개발 방식 (STAGE 4 확립)

### 개요

Dashboard는 **Block 배열**이다. 새 기능을 추가할 때 `DashboardPage.tsx`를 수정하지 않는다.

```
새 기능 추가 흐름:
  1. Engine 작성  (src/engines/ 또는 src/lib/)
  2. Block 작성   (src/components/dashboard/ 또는 src/components/youtube/)
  3. Registry 등록 (src/dashboard/blockRegistry.tsx)
  4. 끝 — DashboardPage.tsx 수정 없음
```

DashboardPage를 수정하는 순간 = 구조가 깨지는 신호.

---

### 핵심 파일 구조

| 파일 | 역할 |
|------|------|
| `src/types/dashboardBlock.ts` | BlockId 타입 + BLOCK_DEFS 배열 (순서 = 화면 순서) |
| `src/types/dashboardData.ts`  | DashboardData (읽기 전용) + DashboardActions (핸들러) 계약 |
| `src/hooks/useDashboardBlocks.ts` | 블록 가시성 상태 (localStorage 영속화) |
| `src/dashboard/blockRegistry.tsx` | BlockId → component(data, actions) 매핑 레지스트리 |
| `src/pages/DashboardPage.tsx` | 데이터 조립 전용 — 렌더 로직 없음 |

---

### 데이터 흐름

```
Engine (계산)
  → DashboardPage (DashboardData + DashboardActions 조립)
    → blockRegistry.BLOCK_REGISTRY[id](data, actions)
      → Block Component (표시 전용)
```

Block은 props로 받은 값만 표시한다. Block 안에서 fetch·계산·상태 생성 금지.

---

### DashboardData / DashboardActions 계약

**DashboardData** — 읽기 전용. Block이 렌더에만 사용.

```ts
interface DashboardData {
  execution, analytics, videoDiagnostics   // 채널 실행 + YouTube 데이터
  suggestedThemes, syncError, lastSyncAt   // ThemeIntelligenceEngine 출력
  reachRows, channelAvgCTR, ctrGrowth      // Reach + CTR
  diagnostics, recentPerfVideos, dataHealth
  strategy, portfolio, healthData, growthData, goldenHour, decisionBar
  earlyPerfData, packContext, campaignStats, kpiHistory, autoAlertTasks
  isLoading, hasDiagIssues
  analyticsExpanded, analyticsHeight, diagHighlighted
  actionStartedId, autoExpandDiagVideo
  refs: DashboardRefs  // scroll anchor DOM refs
}
```

**DashboardActions** — Block이 호출하는 핸들러.

```ts
interface DashboardActions {
  setSelectedVideo, setAutoAlertTasks
  handleCommandAction, handleStrategyAction, handleOpportunityClick
  setAnalyticsExpanded, navigateToPanel
}
```

---

### Block 가시성 관리

`useDashboardBlocks` 훅이 `localStorage("soundstorm_dashboard_blocks")`에 영속화한다.
UI: 우측 상단 "⊞ 블록 관리" 버튼 → 토글 패널.
새 블록은 `BLOCK_DEFS`의 `defaultVisible` 값이 적용된다.

---

### 저장 상태 표시

`SaveStatusBadge` 컴포넌트 (`src/components/dashboard/SaveStatusBadge.tsx`):
- `useContentPackCtx()` 에서 `lastSavedAt` / `saveError` 읽기
- "마지막 저장: X초 전" (1초마다 갱신) / "저장 실패: {message}"
- Block Manager 버튼 좌측에 항상 표시
- 저장 실패는 빨간 점으로 즉시 시각화

---

### 현재 등록 블록 (2026-03-20 기준)

| BlockId | 포함 컴포넌트 | 섹션 헤더 |
|---------|-------------|-----------|
| `execution` | ActiveUploadMonitor + ExecutionPanel + ContentPackManager | CONTENT EXECUTION |
| `upload` | UploadAssistant (ready 팩 + GoldenHour 타이밍) | — |
| `growth` | GrowthLoopMonitor (9단계 성장 루프) | — |
| `action` | ActionCommandBar + DataHealthIssues + EarlyPerformanceCompact + DashboardDiagnosticsSection | ACTION CENTER |
| `strategy` | TodayBriefCard + StrategyPanel | CONTENT STRATEGY |
| `opportunity` | DashboardPortfolioSection | OPPORTUNITY |
| `insight` | ChannelPulseRow + AnalyticsHeader + KPICards + ActionResultPanel + DashboardGrid | CHANNEL INSIGHT |
- **API 레이어 분리**: Controller는 데이터 소스를 모른다 → youtubeAnalyticsService 위임
