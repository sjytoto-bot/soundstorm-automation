# SOUNDSTORM Dashboard 프론트엔드 재구성 보고서

작성일: 2026-03-23
대상: `soundstorm-panel`
기준:
- `02_ARCHITECTURE/Creator_OS_마스터_보고서.md`
- `02_ARCHITECTURE/Tokens_System_개선및적용_보고서_2026-03-23.md`
- 현재 대시보드 구현 상태

문서 목적:
현재 대시보드를 `$frontend-skill` 관점에서 다시 해석하고, 정보량이 아니라 `작업 표면의 위계, 패널 역할, 첫 인지 품질`을 개선하는 프론트 기준을 확정한다.

---

## 0. 전제

이번 개선의 기준은 "더 화려하게 만들기"가 아니다.

운영 화면에서 프론트엔드의 목표는 아래 4가지다.

1. 첫 화면에서 무엇이 주연인지 바로 보여준다
2. 패널마다 역할을 분리해 시선 경쟁을 줄인다
3. 카드/배지/경계선보다 레이아웃과 타이포로 위계를 만든다
4. 사용자가 어디를 먼저 봐야 하는지 5초 안에 알 수 있게 한다

이 전제는 Creator OS의 아래 원칙을 깨지 않는 범위에서만 허용된다.

- `Action First`
- `One Primary Action`
- `Zero Scroll Execution`
- `Learning Loop`
- `새 기능 추가 시 DashboardPage.tsx를 수정하지 않는다`

즉, 프론트 개선도 결국 `행동 우선 구조를 더 선명하게 만드는 작업`이어야 한다.

---

## 1. Frontend Skill 기준 3문장

### 1-1. Visual Thesis

SOUNDSTORM 대시보드는 `차분한 컨트롤 룸 위에 지금 중요한 것만 선명하게 떠오르는 decision-first 작업면`이어야 한다.

### 1-2. Content Plan

- Primary workspace: 오늘의 판단과 핵심 실행
- Support: 현재 성과와 핵심 KPI
- Detail: 원인 진단, 영향 영상, 학습 피드백
- Secondary inspector: 우측 패널은 보조 근거와 실행 준비 영역

### 1-3. Interaction Thesis

- 상단 핵심 영역은 짧고 빠르게 반응해야 한다
- 진단과 우측 패널은 펼침/드릴다운 중심으로 조용하게 반응해야 한다
- hover는 장식이 아니라 affordance만 강화해야 한다

---

## 2. 현재 프론트 상태 진단

현재 대시보드는 기능량은 충분하지만, 시각 구조는 아직 아래 문제를 안고 있다.

1. 메인 작업면과 보조 패널이 모두 비슷한 밀도와 카드 언어를 사용한다
2. compact summary 영역도 card처럼 보여서 "요약 줄"이 아니라 "작은 패널"처럼 느껴진다
3. 우측 패널은 inspector라기보다 또 하나의 작은 대시보드처럼 보인다
4. badge, border, card radius가 많아 정보보다 UI 장치가 먼저 눈에 들어온다
5. 패널 이름은 있지만 각 패널의 시각적 책임이 충분히 분리되지 않았다

한 줄 요약:

`현재 문제는 데이터 부족이 아니라, 모든 패널이 비슷한 목소리로 말하는 프론트 위계 부족이다.`

---

## 3. 패널별 분석

## 3-1. Top Area

현재 상단은 기능적으로는 잘 구성되어 있지만, 프론트 관점에서는 아래 개선이 필요하다.

- primary action 아래의 보조 영역이 아직 card 덩어리처럼 느껴진다
- top area 전체가 "poster-like first viewport"보다 "좋은 운영 카드 모음"에 가깝다
- 상단 액션과 하단 근거의 시각적 긴장 차이가 더 벌어져야 한다

개선 방향:

- primary workspace는 가장 넓고 가장 조용한 면을 가진다
- 보조 정보는 card보다 inset / divider / compact metric로 낮춘다
- accent color는 primary action과 severity에만 집중한다

## 3-2. Channel Pulse Row

이 영역의 역할은 항상 표시되는 `상태 요약 스트립`이어야 한다.

현재 문제:

1. 요약 줄인데도 card box 성격이 강하다
2. divider, badge, outline, 버튼이 많아 compact strip 특유의 속도가 약해진다
3. 펼침 토글과 진단 버튼이 status line보다 더 UI처럼 느껴진다

개선 방향:

- 카드가 아니라 얇은 command strip처럼 다룬다
- label은 더 조용하게, 수치는 더 또렷하게
- 행동 버튼은 utility control처럼 축소
- 상태 변화는 배경색보다 타이포와 소형 상태점으로 처리

## 3-3. Channel Insight / KPI Area

이 영역은 메인 작업면의 support layer다.

현재 문제:

1. KPI 카드가 아직 다수의 equal-weight objects처럼 느껴진다
2. support KPI와 core KPI의 밀도 차이가 더 분명해야 한다
3. 진단 정보와 학습 정보가 같은 카드 언어를 공유해 서열이 덜 보인다

개선 방향:

- core KPI는 louder
- supporting KPI는 inset group
- diagnosis는 report가 아니라 explanation layer로 처리

## 3-4. RightSidePanel

우측 패널은 `secondary inspector`여야 한다.

현재 문제:

1. 섹션 헤더, badge, 열림 영역, 내부 카드가 모두 강하게 보여 작은 대시보드처럼 보인다
2. 섹션마다 카드 스타일이 달라 언어가 통일되지 않는다
3. 전략/기회/유지율 섹션이 각각 따로 말해서 inspector의 차분함이 약하다
4. collapsed 상태와 open 상태의 성격 차이가 커서, 열면 갑자기 정보량이 폭증한다

개선 방향:

- 우측 패널은 card stack이 아니라 structured list + inspector panels로 다룬다
- 헤더는 더 얇게, 섹션은 더 명확하게, 내부 콘텐츠는 더 plain하게
- 위험도는 left border보다 count / label / tone 차이로 해결한다
- inspector는 메인을 보조해야지 메인과 경쟁하면 안 된다

## 3-5. Retention / Opportunity / Strategy 내부 콘텐츠

현재 문제:

- 내부 항목이 또 작은 카드들로 반복된다
- badge와 버튼 treatment가 섹션마다 다르다
- same-level objects가 미묘하게 다른 컴포넌트 패턴을 가진다

개선 방향:

- cardless list 우선
- open row 하나만 강조
- CTA는 섹션마다 같은 size / weight / placement 유지

---

## 4. 프론트 리팩토링 원칙

### 4-1. Primary Workspace / Secondary Inspector 분리

메인 화면은 판단과 실행의 작업면이다.
우측 패널은 보조 근거와 실행 준비 inspector다.

두 영역은 같은 시각 언어를 쓰면 안 된다.

- 메인: 넓고 조용한 면, 큰 위계 차이
- 우측: 촘촘하지만 얇은 구조, 명확한 라벨, 최소한의 카드

### 4-2. No Cards By Default

운영 화면에서 card는 기본값이 아니다.

우선순위는 아래가 맞다.

1. plain section
2. divider
3. inset surface
4. card only if interaction needs enclosure

### 4-3. Utility Copy 우선

모든 섹션 헤더와 버튼은 제품 카피가 아니라 운영 카피여야 한다.

좋은 예:

- `현재 포커스`
- `저성과 영상`
- `시청유지율`
- `다음 조치`

나쁜 예:

- 추상적 전략 카피
- 무드성 문장
- 마케팅식 헤드라인

### 4-4. Interaction은 존재감을 만들되 조용해야 한다

- hover는 background/border tone change 위주
- expand는 천천히, CTA는 빠르게
- 우측 패널은 flashy animation 금지
- 중요한 상태는 animation보다 contrast 우선

---

## 5. 현재 적용 우선순위

### P0

1. `ChannelPulseRow.jsx`
2. `RightSidePanel.tsx`

이유:

- 둘 다 첫 인지 품질에 직접 영향
- card 과잉과 UI 장치 과잉이 가장 눈에 띄는 영역
- 패널 역할 분담이 이 둘에서 가장 먼저 드러난다

### P1

1. `AnalyticsHeader.tsx`
2. `KPICards.tsx`
3. `UpdateStatusBar.tsx`
4. `Topbar.jsx`

### P2

1. Right panel 내부 섹션 통일
2. 전략 / 기회 / retention row 패턴 통일
3. metric / badge / CTA 토큰 적용 확대

---

## 6. 이번 리팩토링에서 실제로 바꿔야 할 것

### 6-1. Channel Pulse Row

- card 느낌을 줄인다
- status strip처럼 재구성한다
- indicator와 utility action의 비중을 재조정한다
- expanded 상태도 surface density만 조금 올리고 box 강조는 줄인다

### 6-2. RightSidePanel

- panel header를 더 얇고 조용하게 만든다
- accordion header를 inspector list로 바꾼다
- 내부 card 반복을 줄이고 plain rows를 늘린다
- collapsed/open 상태의 언어를 일치시킨다

### 6-3. Section Language

- 같은 수준의 항목은 같은 label 구조
- 같은 종류의 CTA는 같은 높이
- 같은 severity는 같은 color logic

---

## 7. 최종 판단

SOUNDSTORM 대시보드의 프론트 문제는 "못생김"이 아니라 "역할이 다른 패널들이 비슷한 목소리로 보이는 것"에 가깝다.

따라서 지금 필요한 것은:

1. 메인을 더 메인답게 만든다
2. 우측 패널을 inspector답게 만든다
3. compact row를 strip답게 만든다
4. 카드와 배지를 줄이고 타이포와 레이아웃으로 위계를 만든다

한 줄 결론:

`이번 프론트 리팩토링의 목표는 새 UI를 더하는 것이 아니라, 대시보드의 각 패널이 자기 역할에 맞는 표정을 갖게 만드는 것이다.`
