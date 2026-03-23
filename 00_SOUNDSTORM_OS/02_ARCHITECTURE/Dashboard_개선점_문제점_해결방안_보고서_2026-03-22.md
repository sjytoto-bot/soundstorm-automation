# SOUNDSTORM Dashboard 개선점 / 문제점 / 해결방안 보고서

작성일: 2026-03-22
대상: `soundstorm-panel`
기준 문서:
- `Creator_OS_마스터_보고서.md`
- `TOKENS_SYSTEM.md`

---

## 1. 요약

현재 대시보드는 기능 밀도와 운영 개념은 강하다. 특히 Block System, 진단 흐름, 실행 루프, 우측 패널 개념은 제품 방향이 분명하다.

반면 실제 구현은 다음 5가지 리스크가 동시에 커져 있다.

1. 페이지/패널 파일 비대화로 인해 구조 규칙이 약해지고 있다.
2. 타입 계약과 품질 게이트가 약해서 리팩토링 안정성이 낮다.
3. 운영 자동화 검증 실패가 있어 중복 실행/오판 가능성이 있다.
4. 디자인 토큰 규칙은 문서상 강하지만 코드 준수율은 낮다.
5. UI/UX는 기능량에 비해 정보 위계와 실행 동선 정리가 덜 됐다.

결론적으로, 지금 단계의 핵심 과제는 "기능 추가"보다 "대시보드 구조 고정 + 품질 게이트 복구 + 운영 로직 안정화"다.

---

## 2. 현재 상태 평가

### 잘 되고 있는 점

- Creator OS 철학과 실행 중심 UX 방향이 문서와 코드 모두에서 일관된다.
- Block Registry, BlocksContext, useDashboardBlocks 구조가 있어 확장 기반은 이미 만들어져 있다.
- 빌드는 통과한다.
- 진단, 실행, 전략, 우측패널이 실제 제품 기능으로 연결되어 있다.

### 우려되는 점

- 핵심 페이지와 우측패널이 너무 많은 책임을 가지고 있다.
- lint/test가 깨진 상태라 "지금 보이는 동작"과 "안전한 제품 상태"가 다르다.
- 문서에서 금지한 규칙이 실제 코드에서 여러 군데 깨지고 있다.
- 핵심 의사결정 UI는 존재하지만, 한눈에 읽히는 우선순위와 상호작용 완성도가 아직 부족하다.

---

## 3. 핵심 문제점

### P0-1. `DashboardPage.tsx`가 여전히 중앙 집중형 파일이다

근거:
- `src/pages/DashboardPage.tsx` 665줄
- 데이터 fetch/useEffect 다수: 111-223
- 행동 기록/스크롤/하이라이트/모달 제어: 306-452
- DashboardData 조립 + 블록 렌더 + Provider 중첩: 457-656

문제:
- 문서상 원칙은 "새 기능 추가 시 DashboardPage 수정 금지"인데, 실제로는 새 데이터 소스나 상호작용이 들어올 때 이 파일을 계속 만질 가능성이 높다.
- fetch, orchestration, action logging, modal state, scroll anchor가 한 파일에 몰려 있어 회귀 위험이 크다.

영향:
- 기능 추가 속도는 당장은 빠르지만, 수정 1건이 여러 영역에 파급된다.
- Block System 도입 효과가 약해진다.

해결방안:
- `useDashboardRuntime` 훅으로 fetch/useEffect 묶음 분리
- `useDashboardInteractions` 훅으로 scroll/highlight/action tracking 분리
- `DashboardProviders` 컴포넌트로 Provider nesting 분리
- `dashData` 조립부를 `buildDashboardData()` 팩토리로 이동

권장 목표:
- `DashboardPage.tsx`를 200~250줄 이하로 축소

---

### P0-2. `RightSidePanel.tsx`가 하나의 거대 기능 파일이 되었다

근거:
- `src/components/layout/RightSidePanel.tsx` 857줄
- 섹션 정의, UI, 상태, 전략 계산, 데이터 fetch, 추천 블록 처리까지 한 파일 안에 존재

문제:
- 우측 패널이 사실상 "미니 애플리케이션"이 되었는데 분해되지 않았다.
- StrategyContent 안에서 insight/opportunity/marketing/strategy 계산을 직접 수행한다.
- 토큰 규칙 위반 스타일도 다수 존재한다.

영향:
- 유지보수 난이도 상승
- 탭 추가/제거 시 충돌 가능성 증가
- 디자인 시스템 통제 실패 지점이 된다

해결방안:
- `RightSidePanel/sections/*`로 섹션 컴포넌트 분리
- `useRightPanelState`, `useRightPanelSections` 훅 분리
- 계산 로직은 panel 내부가 아니라 controller/engine adapter에서 선조립
- 각 섹션을 lazy import 대상으로 전환

권장 목표:
- 파일 1개 300줄 이하
- 전략/분석 계산은 패널 밖으로 이동

---

### P0-3. 품질 게이트가 깨져 있다

검증 결과:
- `npm run build`: 성공
- `npm test`: 실패 4건
- `npm run lint`: 실패 252건

테스트 실패 핵심:
- `tests/shouldDispatch.test.ts` 4건 실패
- `src/components/dashboard/UpdateStatusBar.tsx:116-119`
- 첫 실행일 때 threshold를 30분으로 낮추는 로직 때문에 최신 성공 이력이 60분 미만이어도 `dispatch`가 발생함

문제:
- 운영 자동화 상태바의 자동 dispatch 판단이 테스트 기대와 불일치한다.
- 잘못하면 workflow를 너무 자주 재실행할 수 있다.

영향:
- GitHub Actions 중복 트리거
- 운영 데이터 sync 신뢰도 저하
- 사용자가 상태바를 "신뢰 가능한 진실"로 보기 어려움

해결방안:
- `shouldDispatch()`의 기준을 테스트와 일치시키거나, 정책을 바꿀 경우 테스트를 함께 갱신
- "최초 실행 30분 예외"가 꼭 필요하면 명시 플래그(`bootstrapMode`)로 분리
- 상태판단 로직은 UI 파일에서 떼어내 `lib/dispatchPolicy.ts`로 이동

권장 우선순위:
- 최우선 수정

---

### P0-4. lint 실패 규모가 너무 크다

검증 결과:
- `eslint.config.js` 기준 전체 252개 문제
- Electron CJS/Node 전역 처리 미흡
- unused vars 다수
- 토큰 시스템 위반 다수
- 파싱 에러 파일 존재: `src/AIControlCenter.jsx`

문제:
- 현재 lint는 "정리 과제"가 아니라 "품질 게이트 붕괴" 상태다.
- 문서에 적어둔 디자인 규칙이 자동 검증으로는 아직 통제되지 못하고 있다.

영향:
- 규칙 신뢰도 하락
- 새 코드가 더 쉽게 누적 오염됨
- CI를 붙이기 어려움

해결방안:
- 1차: lint를 3개 영역으로 분리
  - 앱 UI
  - Electron
  - 레거시/보류
- 2차: `eslint.config.js`에 Node/Electron globals 분리 설정
- 3차: 파싱 에러 파일 즉시 정리
- 4차: 토큰 위반은 자동 변환 가능한 패턴부터 일괄 정리

권장 목표:
- 우선 "0 에러"가 아니라 "CI blocking 영역 0 에러"부터 달성

---

### P1-1. Block System의 타입 계약이 약하다

근거:
- `src/types/dashboardData.ts`의 핵심 필드가 대부분 `any`
- `execution`, `analytics`, `diagnostics`, `strategy`, `healthData`, `goldenHour` 등 다수

문제:
- Block System을 도입했지만 계약이 느슨해서 변경 시 IDE/타입 검증 이점을 거의 못 얻는다.
- 블록 추가 시 안전한 확장보다는 런타임 확인에 의존하게 된다.

영향:
- 리팩토링 비용 증가
- 숨은 prop 누락, shape mismatch 가능성 증가

해결방안:
- `DashboardData`를 3단계로 타입화
  - Core KPI 타입
  - Diagnostics 타입
  - Execution/Strategy 타입
- `DashboardActions`의 `item: any` 제거
- 블록별 입력 타입을 `BlockComponentMap` 형태로 세분화

---

### P1-2. Block Registry가 "표시 전용" 원칙에서 일부 흔들린다

근거:
- `src/dashboard/blockRegistry.tsx:90`
- `src/dashboard/blockRegistry.tsx:190`
- `console.log()` placeholder 존재
- `action` 블록은 남아 있지만 실제 렌더는 `null`

문제:
- dead block 정의와 placeholder callback이 남아 있어 구조 신뢰도를 떨어뜨린다.
- "레지스트리 = 진실"이어야 하는데 중간 상태 흔적이 보인다.

영향:
- 블록 추가/삭제 시 혼동
- 실제 제품 상태와 선언 상태 불일치

해결방안:
- `action` 블록 제거 또는 복구 중 하나로 명확화
- placeholder action은 `TODO`가 아니라 no-op util 또는 실제 핸들러 연결
- registry는 선언만, 행동은 action factory에서 주입하도록 분리

---

### P1-3. 디자인 토큰 문서와 실제 구현 간 괴리가 있다

근거:
- `TOKENS_SYSTEM.md`: 토큰 외 값 사용 금지
- lint에서 padding/transition/color 위반 다수
- `RightSidePanel.tsx` 내 하드코딩 스타일 다수

문제:
- 규칙은 강한데 적용이 부분적이다.
- 강한 규칙이 계속 깨지면 팀이 문서를 무시하게 된다.

영향:
- UI 일관성 저하
- 리디자인 비용 증가

해결방안:
- 공통 primitive 컴포넌트 도입
  - `PanelSection`
  - `MetricRow`
  - `Badge`
  - `SectionHeader`
- 인라인 스타일 반복 패턴을 공통화
- 토큰 문서와 ESLint 메시지를 현재 토큰 네이밍과 정확히 맞춤

---

### P1-4. 번들 크기가 크고 code-splitting이 부족하다

검증 결과:
- `dist/assets/index-GQpHZbJ9.js` 1,221.32 kB
- Vite chunk size warning 발생

문제:
- 대시보드, 우측패널, 분석 컴포넌트가 한 번에 묶여 로드될 가능성이 높다.

영향:
- 초기 로딩 체감 저하
- Electron 환경에서도 렌더 부담 증가

해결방안:
- `RightSidePanel` 섹션 lazy load
- `RoadmapPage`, `ThumbnailAnalyzer`, heavy analytics 탭 분리
- `manualChunks` 또는 route/component-level dynamic import 적용

---

### P0-5. UI 정보 위계가 강하지 않다

근거:
- `ActionCommandBar.jsx`
- `TodayBriefCard.jsx`
- `ChannelPulseRow.jsx`
- `NextUploadCard.tsx`

문제:
- 실행 중심 제품인데 상단 핵심 카드들 사이의 "주인공"이 더 선명해야 한다.
- `ActionCommandBar`는 primary와 secondary를 나누긴 했지만, 현재는 같은 시각 밀도로 보여 urgency 체감이 약하다.
- `TodayBriefCard`와 `NextUploadCard`는 둘 다 타이밍을 말하고 있어 사용자 입장에서는 "지금 무엇을 해야 하는지"보다 "설명"이 먼저 들어온다.
- `ChannelPulseRow`는 정보 밀도가 높지만 한 줄에 너무 많은 KPI를 밀어 넣어 스캔성이 떨어진다.

영향:
- 진입 3초 내 판단 속도 저하
- 중요한 경고와 참고 정보가 같은 무게로 읽힘
- "실행 OS"보다는 "정보판"처럼 느껴질 수 있음

해결방안:
- 상단 영역을 3단으로 재정렬
  - 1단: 지금 해야 할 1개 행동
  - 2단: 왜 지금인지 설명
  - 3단: 보조 데이터
- `ActionCommandBar`의 primary 카드 면적/대비/타이포를 더 키우고 secondary는 chip보다 명확한 보조 카드로 정리
- `TodayBriefCard`와 `NextUploadCard`를 역할 기준으로 분리
  - `TodayBriefCard`: "오늘 업로드/대기 판단"
  - `NextUploadCard`: "다음 슬롯 계획"
- `ChannelPulseRow`는 4개 KPI를 전부 고정 노출하지 말고 핵심 2개 + 더보기 구조로 축소

---

### P0-6. 반응형과 좁은 레이아웃 대응이 약하다

근거:
- `blockRegistry.tsx`의 execution 블록은 `gridTemplateColumns: "1fr 1fr"` 고정
- `ActionCommandBar.jsx`는 primary + secondary `360px` 고정 폭 구조
- `Sidebar.jsx`, `Topbar.jsx`, `RightSidePanel.tsx`는 데스크톱 폭 기준 설계가 강함

문제:
- 창 폭이 줄어들면 핵심 콘텐츠보다 패널 구조가 먼저 공간을 차지한다.
- 우측 패널과 사이드바를 같이 열었을 때 메인 진단 영역 폭이 빠르게 줄어든다.
- 실행 패널의 2열 고정은 특정 폭 이하에서 읽기성과 클릭성이 급격히 나빠질 수 있다.

영향:
- 노트북 작은 창, 분할 화면, 추후 모바일 대응에서 UX 저하
- 가장 중요한 메인 진단 영역이 오히려 압박받음

해결방안:
- 1280px 이하에서 execution 블록 1열 전환
- 1440px 이하에서 우측 패널 기본 collapsed 옵션 검토
- `ActionCommandBar` secondary 영역 고정폭 제거, 세로 적층 fallback 추가
- Topbar/Sidebar/RightPanel의 responsive breakpoint 정의 문서화

---

### P1-5. 인터랙션 피드백과 상태 전이가 아직 거칠다

근거:
- hover/focus/active 상태가 파일마다 제각각
- `transition: 0.15s` 패턴 다수
- CTA 결과 피드백은 일부 컴포넌트에서만 제공

문제:
- 사용자는 눌렀을 때 "선택됨 / 처리중 / 완료됨 / 반영됨"을 일관되게 느끼기 어렵다.
- 진단으로 스크롤 이동은 되지만, 왜 이동했는지와 무엇을 봐야 하는지의 연결 피드백은 약하다.

영향:
- 실행률 저하
- "버튼이 먹었는지"에 대한 불안
- 학습 루프 제품인데 행동-결과 연결 감각이 약함

해결방안:
- 공통 interaction state 정의
  - hover
  - pressed
  - loading
  - completed
  - highlighted target
- CTA 이후 toast, inline badge, target glow를 공통 규칙으로 통합
- `ActionCommandBar`와 진단 섹션 간 연결 카피 추가
  - 예: "CTR 이슈 1건을 펼쳤습니다"

---

### P1-6. 내비게이션과 제품 메탈레이어가 기능 밀도에 비해 약하다

근거:
- `Topbar.jsx`는 제목과 progress만 표시
- `Sidebar.jsx`는 최소 기능형
- 현재 제품은 운영 OS인데 전역 상태, 오늘 상태, 마지막 동기화 맥락이 상단에 충분히 드러나지 않음

문제:
- 사용자는 지금 어떤 모드에 있는지, 데이터가 얼마나 최신인지, 오늘 무엇이 중요한지 상단에서 즉시 파악하기 어렵다.
- Topbar가 제품의 "통제 센터" 역할을 아직 하지 못한다.

영향:
- 첫 진입 이해도 저하
- 제품의 고유한 OS 느낌이 약해짐

해결방안:
- Topbar를 "상태 바"로 격상
  - 현재 모드
  - 마지막 데이터 갱신
  - 오늘 긴급도
  - 실행률/처리율
- Sidebar active 상태 대비 강화
- Right panel open/closed 상태를 전역 정보 구조와 연결

---

### P1-7. 시각 디자인 언어가 아직 완전히 잠기지 않았다

근거:
- 토큰은 정의되어 있으나 실제 컴포넌트마다 badge, padding, CTA 스타일이 조금씩 다름
- `RightSidePanel.tsx` 내부만 봐도 badge/row/button 스타일 변형이 반복됨

문제:
- 같은 레벨의 정보가 다른 톤으로 보인다.
- "진단", "전략", "알림", "보조지표"의 시각 언어가 체계적으로 분리되지 않았다.

영향:
- 장기적으로 화면이 더 복잡해질수록 피로감 증가
- 디자인 수정 비용 증가

해결방안:
- dashboard UI primitive 정리
  - `StatusBadge`
  - `MetricInline`
  - `ActionButton`
  - `SectionCard`
  - `CompactAccordionRow`
- semantic color mapping 고정
  - danger = 즉시 조치
  - warning = 곧 조치
  - primary = 추천
  - success = 완료/정상

---

## 4. 구조상 불일치 포인트

### 문서 vs 실제 구현 불일치

1. 문서:
   Block 안에서 fetch/계산/상태 생성 금지
   실제:
   우측 패널은 사실상 별도 계산 허브 역할을 수행 중

2. 문서:
   DashboardPage 수정 금지
   실제:
   DashboardPage가 데이터/이벤트/모달/Provider의 메인 조립 지점

3. 문서:
   토큰 외 값 사용 금지
   실제:
   다수 파일에서 padding, transition, 색상 하드코딩 누적

4. 문서:
   Action First / One Primary Action / Zero Scroll Execution
   실제:
   상단 의사결정 카드들은 존재하지만 역할 구분과 우선순위 체감이 아직 충분히 강하지 않음

이 불일치를 먼저 줄여야 문서가 다시 "작동하는 규칙"이 된다.

---

## 5. 우선순위별 해결 로드맵

### P0. 바로 해야 하는 것

1. `shouldDispatch()` 로직 수정 또는 테스트 정책 정합화
2. lint 파싱 에러/Node 전역 오류 우선 정리
3. `DashboardPage` 분리 리팩토링 착수
4. `RightSidePanel` 분리 설계 확정

### P1. 다음 스프린트에서 해야 하는 것

1. `DashboardData` 타입 정리
2. `blockRegistry` dead entry/placeholder 제거
3. 토큰 위반 패턴 공통 컴포넌트화
4. heavy panel lazy load 적용
5. 상단 IA 재설계와 반응형 breakpoint 설계

### P2. 안정화 이후

1. Block별 테스트 추가
2. dashboard runtime/controller 계층 문서화
3. 번들 budget 설정
4. CI에서 build/test/lint 단계적 강제

---

## 6. 추천 실행 순서

### 1단계. 운영 안정화

- `UpdateStatusBar.tsx` dispatch 정책 수정
- 관련 테스트 4건 통과

### 2단계. 품질 게이트 복구

- lint config를 앱/Electron으로 분리
- parsing error 제거
- 토큰 위반 상위 20개 파일부터 정리

### 3단계. 구조 리팩토링

- `DashboardPage`
  - `useDashboardRuntime`
  - `useDashboardInteractions`
  - `DashboardProviders`
- `RightSidePanel`
  - `sections/*`
  - `useRightPanelState`
  - `useStrategySectionData`

### 4단계. 성능 최적화

- lazy import
- chunk 분리
- 우측패널 비활성 탭 지연 로딩

### 5단계. UI/UX 정리

- 상단 의사결정 영역 IA 재설계
- KPI 밀도 축소 및 시각 우선순위 재정의
- 공통 버튼/배지/행 컴포넌트 도입
- 좁은 폭 레이아웃 fallback 적용

---

## 7. UI/UX 긴급 개선안

### 가장 시급한 UI 과제

1. 상단에서 "오늘 해야 할 1개 행동"이 지금보다 더 강하게 보여야 한다.
2. 실행 패널과 골든아워/다음 업로드의 역할이 겹치지 않게 정리해야 한다.
3. 우측 패널은 정보 저장소가 아니라 보조 탐색 패널처럼 느껴지도록 밀도를 낮춰야 한다.
4. 작은 화면에서 2열 고정 구성을 빨리 해제해야 한다.

### 추천 UI 구조

1. `CriticalAlertBanner`
   - 빨간 경고는 유지
   - CTA 1개만 남기고 보조 설명 최소화

2. `ActionCommandBar`
   - primary 카드 1개를 더 크게
   - secondary 2개는 우측 세로 요약 카드
   - 버튼 문구를 결과 중심으로 변경
   - 예: "CTR 진단 열기", "지금 업로드 판단 보기"

3. `TodayBrief/NextUpload`
   - 둘 중 하나는 "오늘 판단", 다른 하나는 "주간 계획" 역할로 분리
   - 같은 위치에서 같은 종류의 시간 정보를 중복 설명하지 않기

4. `ChannelPulseRow`
   - 첫 줄: 등급 + 핵심 KPI 2개
   - 두 번째 줄 또는 토글: 나머지 KPI
   - 진단 보기 버튼 대비 강화

5. `RightSidePanel`
   - 기본은 compact
   - 문제 있는 섹션만 badge 강조
   - 각 섹션당 3~5개 핵심 항목만 먼저 보여주기

### 추천 UX 원칙

- 클릭 후 300ms 안에 반응이 보여야 한다.
- 이동이 발생하면 "왜 여기로 왔는지"를 짧게 알려줘야 한다.
- 정상 상태와 긴급 상태의 시각 대비를 더 벌려야 한다.
- 정보량보다 행동 유도를 먼저 배치해야 한다.

---

## 8. 최종 판단

이 대시보드는 "방향이 틀린 프로젝트"가 아니라 "성공적으로 커졌지만 구조 정리가 늦은 프로젝트"에 가깝다.

지금은 새 기능을 더 넣는 것보다 아래 4가지를 먼저 고정하는 것이 가장 큰 투자 대비 효과를 만든다.

1. 운영 자동화 판단 로직 안정화
2. 대시보드/우측패널 구조 분해
3. lint/test를 다시 신뢰 가능한 수준으로 복구
4. UI 정보 위계와 반응형 UX 정리

이 4가지만 선행되면 이후의 전략 패널 고도화, 실행률 개선, Block 확장도 훨씬 안전하고 빠르게 진행할 수 있다.

---

## 9. 검증 기록

- `npm run build` 성공
- `npm test` 실패 4건
- `npm run lint` 실패 252건

---

## 10. 2026-03-23 구현 기준 상태 체크

아래 평가는 2026-03-23 실제 코드/빌드 기준으로 다시 점검한 결과다.

### 해결됨

- `npm run build` 성공 유지
- `npm test` 현재 136 / 136 통과
- 상단 중복 시간 카드 정리
  - `TodayDecisionCard`, `PrimaryActionHero`, 단독 상단 추천 카드 중복 제거
- `NextUploadCard`를 실행 블록 우측의 단일 진입점으로 정리
- KPI 카드 클릭 → 우측 패널 KPI inspector → 최종 `VideoDetailModal` 드릴다운 경로 연결
- 외부 트래픽 이상 감지 경로 복구
  - `externalDrop` runtime 계산 및 diagnostics 연결 완료
- 토큰 시스템은 대시보드 핵심부 기준 상당 부분 정리됨

### 부분 해결

- 우측 패널 compact UX
  - 구조와 padding, 드릴다운 연결은 개선됐지만 파일 크기와 정보 밀도는 아직 큼
- 반응형 보호
  - 이전보다 잘림과 충돌은 줄었지만 모든 폭에서 완전히 안정화됐다고 보긴 어려움
- lint 문제
  - 현재 repo의 lint 스크립트 범위에서는 0 에러
  - 다만 2026-03-22 당시의 "전체 252건"을 그대로 비교하는 전수 기준은 아님

### 아직 남음

- `RightSidePanel.tsx` 구조 분해
- 번들 크기 경고 해소
- 채널 건강도 점수 산식의 완전 문서화/외부화
- 일부 레거시 패널 드릴다운 일원화 마감
