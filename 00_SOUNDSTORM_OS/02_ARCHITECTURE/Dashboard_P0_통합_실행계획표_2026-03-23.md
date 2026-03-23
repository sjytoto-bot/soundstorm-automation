# SOUNDSTORM Dashboard P0 통합 실행 계획표

작성일: 2026-03-23
범위:
- 구조
- 품질
- UI/UX
- 토큰 시스템

기준 문서:
- `Dashboard_개선점_문제점_해결방안_보고서_2026-03-22.md`
- `Dashboard_UIUX_개선안_와이어프레임_2026-03-23.md`
- `Tokens_System_개선및적용_보고서_2026-03-23.md`

---

## 1. 목적

이 계획표는 P0 수준의 구조/품질/UI/UX 과제를 분리된 개선 항목이 아니라 하나의 실행 묶음으로 처리하기 위한 문서다.

핵심 방향:

1. 품질 게이트를 복구한다.
2. 대시보드 핵심 구조를 분해한다.
3. 상단 UX를 실행 중심으로 재설계한다.
4. 토큰 시스템을 문서-코드-컴포넌트 수준에서 맞춘다.

---

## 2. P0 목표

### 최종 완료 기준

- `npm run build` 성공
- P0 대상 테스트 통과
- lint CI blocking 영역 0 에러
- 상단 대시보드 IA가 새 구조로 반영
- `DashboardPage.tsx`와 `RightSidePanel.tsx` 책임 분리 시작
- 상단 핵심 UI에 토큰 primitive 적용

### 2026-03-23 구현 상태 체크

- `npm run build` 성공: ✅
- P0 대상 테스트 통과: ✅ (`npm test` 136 / 136)
- lint CI blocking 영역 0 에러: ⚠️ 현재 스크립트 범위 기준 ✅, 전수 기준은 별도
- 상단 대시보드 IA가 새 구조로 반영: ✅
- `DashboardPage.tsx`와 `RightSidePanel.tsx` 책임 분리 시작: ⚠️ `DashboardPage.tsx` 220줄로 진척, `RightSidePanel.tsx`는 1156줄로 미완
- 상단 핵심 UI에 토큰 primitive 적용: ✅ 핵심 범위 적용 완료

---

## 3. 작업 스트림

### Stream A. 품질 게이트 복구

목표:
- 테스트 실패 제거
- lint blocking 영역 정리

작업:
1. `UpdateStatusBar.shouldDispatch()` 정책 정합화
2. 관련 테스트 4건 수정 또는 로직 수정
3. `eslint.config.js`에서 Electron/Node 환경 분리
4. `AIControlCenter.jsx` parsing error 제거
5. CI blocking 범위를 dashboard/layout/core UI 우선으로 축소

완료 기준:
- `npm test`에서 현재 실패 4건 해소
- dashboard/layout 관련 lint 오류 0

상태 체크:
- 테스트 실패 4건 해소: ✅
- 현재 lint 스크립트 범위 0 에러: ✅
- 전체 lint 체계 재정의/확장: ⚠️ 남음

---

### Stream B. 구조 리팩토링

목표:
- 거대 파일 책임 분산

작업:
1. `DashboardPage.tsx`
   - `useDashboardRuntime`
   - `useDashboardInteractions`
   - `DashboardProviders`
   - `buildDashboardData`
2. `RightSidePanel.tsx`
   - `useRightPanelState`
   - `useRightPanelSectionData`
   - `sections/BlocksSection`
   - `sections/StrategySection`
   - `sections/RetentionSection`
3. `blockRegistry` placeholder 정리

완료 기준:
- `DashboardPage.tsx` 250줄 내외
- `RightSidePanel.tsx` 300줄 이하

상태 체크:
- `DashboardPage.tsx` 220줄: ✅
- `RightSidePanel.tsx` 300줄 이하: ❌ 현재 1156줄

---

### Stream C. 상단 UI/UX 재설계

목표:
- 첫 화면 실행 속도 향상

작업:
1. `ActionCommandBar` → `PrimaryActionHero` 성격으로 개편
2. `TodayBriefCard` → Today Decision 역할로 축소
3. `NextUploadCard` → Next Upload Plan 역할로 고정
4. `ChannelPulseRow` → compact + expandable 구조로 개편
5. diagnostics 이동 피드백 통일

완료 기준:
- 상단 1스크린에서
  - 긴급도
  - 오늘 할 일
  - 오늘 업로드 판단
  - 채널 상태
  가 모두 읽힘

상태 체크:
- 상단 중복 카드 제거 및 역할 재배치: ✅
- `NextUploadCard` 단일화: ✅
- KPI / 상태 / 건강도 흐름 재정리: ✅
- 우측 패널 compact 완성도: ⚠️ 부분 해결

---

### Stream D. 토큰 시스템 정리

목표:
- 문서와 실제 사용 체계 일치

작업:
1. `tokens.js`에 `semantic`, `component`, `motion` 보강
2. `TOKENS_SYSTEM.md` 네이밍 정합화
3. primitive 컴포넌트 도입
   - `StatusBadge`
   - `ActionButton`
   - `MetricInline`
   - `SectionCard`
4. 상단 핵심 컴포넌트부터 적용

완료 기준:
- 상단 핵심 UI에서 padding/button/badge/metric 토큰화
- 신규 코드에서 deprecated alias 사용 금지 시작

상태 체크:
- 상단 핵심 UI 토큰화: ✅
- 대시보드/모달/드로어 핵심 범위 토큰 치환: ✅
- 코드베이스 전수 정리: ⚠️ 일부 레거시 잔여

---

## 3-A. 추가 구현 상태

### 외부 트래픽

- `ExternalDropPanel` 표시는 `externalDrop` runtime 계산 누락 때문에 비활성 상태였음
- 2026-03-23 기준 `redirectAdapter.ts` + `useDashboardRuntime.ts` 연결 복구 완료
- 현재는 최근 7일 vs 이전 7일 기준의 외부 유입 급감 캠페인 감지가 diagnostics 경로에 반영됨
- 다만 외부 유입 인사이트 전체 UX를 별도 제품 기능으로 확장하는 일은 아직 P1 이상 범위

---

## 4. 추천 실행 순서

### Phase 1. 안전화

기간:
- 0.5~1일

작업:
- `shouldDispatch()` 수정
- 테스트 복구
- parsing error 제거
- lint config 분리

왜 먼저인가:
- 품질 게이트가 깨진 상태에서는 UI/구조 리팩토링 회귀를 안전하게 확인할 수 없음

---

### Phase 2. 토큰 기반 준비

기간:
- 0.5~1일

작업:
- `tokens.js` 구조 정리
- primitive 컴포넌트 작성
- `TOKENS_SYSTEM.md` 업데이트 초안

왜 지금인가:
- UI 개편 전에 토큰/primitive가 없으면 다시 인라인 스타일이 늘어남

---

### Phase 3. 상단 UX 개편

기간:
- 1~2일

작업:
- `ActionCommandBar`
- `TodayBriefCard`
- `NextUploadCard`
- `ChannelPulseRow`

왜 지금인가:
- 사용자 체감 효과가 가장 크고, 제품 방향을 바로 보여줌

---

### Phase 4. 구조 분해

기간:
- 1~2일

작업:
- `DashboardPage` 분해
- `RightSidePanel` 분해

왜 마지막인가:
- 상단 IA와 토큰 체계가 정해진 뒤에 구조 분해를 하면 책임 경계가 더 명확함

---

## 5. 파일 단위 작업표

### 1차 수정 대상

- `src/components/dashboard/UpdateStatusBar.tsx`
- `tests/shouldDispatch.test.ts`
- `eslint.config.js`
- `src/styles/tokens.js`
- `TOKENS_SYSTEM.md`

### 2차 수정 대상

- `src/components/dashboard/ActionCommandBar.jsx`
- `src/components/dashboard/TodayBriefCard.jsx`
- `src/components/dashboard/NextUploadCard.tsx`
- `src/components/dashboard/ChannelPulseRow.jsx`

### 3차 수정 대상

- `src/pages/DashboardPage.tsx`
- `src/components/layout/RightSidePanel.tsx`
- `src/dashboard/blockRegistry.tsx`

---

## 6. 산출물

### 문서 산출물

1. UI/UX 와이어프레임 문서
2. 토큰 시스템 개선 및 적용 보고서
3. 통합 실행 계획표

### 코드 산출물

1. 복구된 테스트
2. 정리된 lint config
3. 보강된 tokens runtime
4. 상단 UX 개편 컴포넌트
5. 분리된 dashboard/right panel 구조

---

## 7. 리스크와 대응

### 리스크 1. UI 개편이 구조 리팩토링과 충돌

대응:
- 상단 핵심 컴포넌트부터 독립적으로 교체
- 데이터 계약은 `dashData` 유지 후 내부만 교체

### 리스크 2. 토큰 정리가 대규모 스타일 수정으로 번짐

대응:
- P0는 상단 핵심 UI만
- 나머지는 P1로 이월

### 리스크 3. lint 전체를 한 번에 잡으려다 일정 지연

대응:
- CI blocking 범위를 먼저 정의
- dashboard/layout/core UI 우선 정리

---

## 8. 우선순위 표

| 우선순위 | 과제 | 분류 | 완료 조건 |
|---|---|---|---|
| P0-1 | `shouldDispatch()` 복구 | 품질 | 테스트 4건 통과 |
| P0-2 | lint config 분리 + parse error 제거 | 품질 | dashboard/layout lint 안정화 |
| P0-3 | tokens runtime 보강 | 디자인 시스템 | semantic/component token 사용 시작 |
| P0-4 | 상단 UX 개편 | UI/UX | 1스크린 실행 중심 구조 반영 |
| P0-5 | `DashboardPage` 분해 | 구조 | runtime/interactions/providers 분리 |
| P0-6 | `RightSidePanel` 분해 | 구조 | section/hook 단위 분리 |

---

## 9. 최종 판단

지금 가장 좋은 순서는 "예쁘게 고치기"가 아니라 아래 순서다.

1. 깨진 품질 게이트를 먼저 복구한다.
2. 토큰과 primitive를 먼저 세운다.
3. 상단 UI/UX를 새 정보 위계로 바꾼다.
4. 마지막으로 구조를 분해해 유지보수 가능한 상태로 고정한다.

이 순서가 가장 적은 회귀로 가장 큰 사용자 체감 개선을 만든다.
