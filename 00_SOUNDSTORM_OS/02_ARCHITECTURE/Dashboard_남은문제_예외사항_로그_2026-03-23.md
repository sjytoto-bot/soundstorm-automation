# SOUNDSTORM Dashboard 남은 문제 / 예외사항 로그

작성일: 2026-03-23
기준 문서:
- `Creator_OS_마스터_보고서.md`
- `soundstorm-panel/request.md`

목적:
- 구현 진행 중 실제로 확인된 잔여 리스크를 분리 기록한다.
- "나중에 고칠 것"이 아니라, 현재 왜 완결되지 않았는지와 어떤 조건에서 예외가 남는지 추적한다.

---

## 1. 현재 완료된 핵심 보정

1. `_RawData_Master` 쓰기 경로에서 `clear()` 선행 구조 제거
2. `KPI -> 문제 영상 리스트 -> VideoDetailModal` 드릴다운 연결
3. `Last updated`를 `VideoTrend latest date -> reach.ctrUpdatedAt` 우선순위로 통일
4. `track_name` fallback을 `VideoTitleMapAdapter`, `reachAdapter`, `buildSelectedVideo`, `ChannelStatusPanel`까지 연결
5. `Action Center` 제거 및 `최근 30일` 기준 정렬
6. 메인 클릭과 우측 패널 포커스 일부 동기화
7. 채널 건강도에 `Top Issue`, `P2 트렌드`, `점수 흐름`, 문제 영상 드릴다운 추가
8. CTR / Retention / Impression 진단 패널의 제목 fallback을 `track_name` 기준으로 정렬
9. `PrimaryActionHero`가 업로드 판단을 맡는 경우 `TodayDecisionCard`를 숨겨 상단 중복 감소
10. `ChannelPulseRow` 접힘 상태에서 CTR 중복 노출 제거
11. 우측 패널 포커스 상태에 따라 전략 그룹을 더 강하게 축소 표시
12. `DashboardPage`에서 상단 IA 판단과 블록 스택 렌더링을 분리해 페이지 조립 책임 축소
13. 우측 패널 포커스 기반 전략 가시성 규칙을 `rightPanelFocus.ts`로 중앙화
14. KPI 카드 상세를 카드 내부 확장에서 우측 패널 inspector로 이관
15. 우측 패널 내 주요 영상 항목에서 최종 `VideoDetailModal` 드릴다운 연결
16. `externalDrop` runtime 계산을 복구해 외부 유입 이상 감지 다시 활성화

### 1-1. 2026-03-23 검증 결과

- `npm run build` 성공
- `npm test` 136 / 136 통과
- `npm run lint` 현재 설정 범위 0 에러
- 확인 일시: 2026-03-23 21:20 KST

---

## 2. 남아 있는 문제

### 2-1. `track_name`이 원천 시트에 없으면 마지막 fallback은 여전히 `videoId`

상태:
- 앱 레벨 fallback은 최대한 `track_name` 쪽으로 당겼다.
- 하지만 `_RawData_Master`, `Video_Diagnostics`, 관련 보조 시트에 `track_name`이 비어 있으면 UI에서 최종적으로 `videoId`를 쓸 수밖에 없다.

의미:
- 이 경우는 UI 버그가 아니라 원천 데이터 결손이다.

권장 대응:
- `Video_Diagnostics` 생성 단계에서도 `track_name`을 함께 기록하도록 파이프라인 보강
- `_RawData_Master` 기준 `video_id -> track_name` 매핑 보존 여부 점검

---

### 2-2. 메인 ↔ 사이드 패널 컨텍스트 동기화는 일부 경로만 세밀화됨

상태:
- KPI 카드, Channel Status, 일부 Diagnostics는 우측 패널 포커스를 함께 바꾼다.
- 하지만 대시보드 전체 모든 진입점이 동일한 수준으로 세밀한 포커스를 넘기지는 않는다.

남은 경로 예시:
- 일부 `DashboardGrid` 내부 카드
- 레거시 youtube 패널 계열
- 실행/기회 패널 내부 세부 액션

권장 대응:
- `VideoClickContext`를 전체 드릴다운 경로에서 강제 사용
- `source`뿐 아니라 `triggerMetric`을 누락 없이 전달

---

### 2-3. 채널 건강도는 아직 "새 점수 체계"로 완전 교체되지 않음

상태:
- 현재 `ChannelHealthBar`는 `Top Issue`, `P2 트렌드`, `점수 흐름`, 문제 영상 드릴다운까지 반영됐다.
- 다만 사용자가 요구한 "정식 점수 공식 문서화 + 가중치/감점 룰 완전 외부화" 수준으로는 아직 정리되지 않았다.

의미:
- 지금 상태는 "기존 건강도 표시를 실사용 수준으로 끌어올린 단계"이며,
- 점수 산식 자체를 완전 제품 규격으로 고정하는 마지막 문서화 작업이 남아 있다.

권장 대응:
- `computeChannelHealth()`를 별도 스코어 엔진으로 분리 재설계
- 점수 산식, 감점 룰, Top Issue 출력 규칙을 문서화 후 UI 반영

---

### 2-4. 전체 드릴다운 통일은 거의 진행됐지만 100% 종료는 아님

상태:
- 핵심 대시보드 흐름은 `VideoDetailModal` 종착지에 많이 맞춰졌다.
- 다만 레거시 패널/보조 컴포넌트 중 일부는 아직 인라인 확장이나 텍스트 표시 위주다.

권장 대응:
- `request.md`의 드릴다운 체크리스트 기준으로 남은 진입점 일괄 점검
- `onVideoClick` 없는 컴포넌트 목록을 한 번 더 전수 조사

---

### 2-5. 데이터 파이프라인은 훨씬 안전해졌지만 "완전 무보수" 단계는 아님

상태:
- 가장 위험했던 `_RawData_Master clear() -> update()` 구조는 제거했다.
- 앱 쪽 시트 fetch도 fallback sheet 실패가 전체 실패가 되지 않도록 완화했다.
- GitHub Actions concurrency도 이전보다 안전하다.

잔여 리스크:
- `_RawData_FullPeriod` purge는 유지보수성보다 보관 정리 목적이라 여전히 전체 재기록 성격이 있다.
- 일부 보조 시트는 원천 컬럼 누락 시 앱이 fallback에 의존한다.

권장 대응:
- 파이프라인별 "필수 컬럼 계약" 문서화
- `track_name`, `video_id`, `published_at`, `ctr_updated_at` 누락 감시 추가

---

### 2-6. 번들 크기 경고는 계속 남아 있음

상태:
- `npm run build`는 성공하지만 Vite chunk size warning이 지속된다.

의미:
- 기능 오류는 아니지만, 장기적으로 로딩 비용과 유지보수성에 부담이 된다.

권장 대응:
- `Dashboard` / `VideoDetailModal` / legacy panel 군 코드 스플리팅 검토

---

## 3. 문서 기준 해결률 요약

### 대부분 해결

- 상단 IA 중복 제거
- KPI → inspector → 영상 상세 드릴다운
- NextUpload 단일 진입점 정리
- 테스트 실패 복구
- 외부 유입 이상 감지 재연결
- 토큰 기반 핵심 대시보드 정리

### 부분 해결

- 메인 ↔ 사이드 패널 컨텍스트 동기화 전면 통일
- 우측 패널 compact UX
- 구조 리팩토링의 최종 마감
- lint의 전수 수준 정리

### 미해결

- `computeChannelHealth()`의 정식 산식 외부화
- 번들 크기 경고
- 일부 레거시 컴포넌트의 드릴다운 일원화
## 4. 다음 우선순위

1. `computeChannelHealth()` 재설계 여부 결정
2. 남은 드릴다운 진입점 전수 조사
3. `track_name` 누락을 만드는 원천 파이프라인 확인
4. 우측 패널 포커스 매핑 표준화

---

## 5. 판정

현재 상태는:

- 예전보다 훨씬 안정적이고
- 드릴다운/판단 구조도 많이 정리됐지만
- 아직 "점수 체계 재설계"와 "전수 수준의 드릴다운 통일"은 남아 있다.

즉, 지금 단계는 `핵심 골조는 맞춰졌고, 남은 것은 완성도와 예외 제거`에 가깝다.
