# Block Widget Drag & Drop — 구현 계획 보고서

**작성일: 2026-03-21 (v2 — 충돌 이슈 반영)**
**목적: BlockManagerPanel에서 위젯 미리보기 → 대시보드로 드래그해서 원하는 위치에 배치 + 위치 기억**

---

## 1. 기능 정의

### 원하는 동작
1. BlockManagerPanel 우측 패널에서 블록을 **위젯 카드 형태**로 미리 볼 수 있다
2. 위젯 카드를 **드래그해서** 대시보드 원하는 위치에 **드롭**한다
3. 드롭 위치는 **영구 기억** — 껐다 켜도 마지막 위치로 복원된다

### 현재 시스템과의 차이

| 항목 | 현재 | 이번 구현 |
|------|------|-----------|
| 블록 순서 | `order[]` 배열 (toggle ON/OFF 시 위치 초기화) | `savedPosition` — OFF해도 위치 기억 |
| 블록 추가 방식 | 토글 버튼 클릭 → 최하단 추가 | 패널에서 드래그 → 원하는 위치 드롭 |
| 위젯 미리보기 | 없음 | 패널에 위젯 카드 (아이콘 + 이름 + 설명) |
| 대시보드 내 재정렬 | 없음 (순서 고정) | 드롭 존 사이에 끼워넣기 가능 |

---

## 2. 위젯 갤러리 — BlockManagerPanel 변경

### 현재 (v4 - ON/OFF 리스트)
```
[아이콘] Thumbnail Analyzer   🔥  ○ OFF
         CTR 낮음 (-1.8%p)
         지금 안 바꾸면 노출 감소
```

### 변경 후 (위젯 카드 갤러리)

```
BLOCK MANAGER
──────────────────────────────────────

┌───────────────────────────────────┐
│ ⠿  [🖼]  Thumbnail Analyzer  🔥  │  ← ⠿ = 드래그 핸들
│          ○ OFF                    │
│     CTR 낮음 (-1.8%p)             │
│     지금 안 바꾸면 노출 감소      │
└───────────────────────────────────┘

┌───────────────────────────────────┐
│ ⠿  [⚡]  Action Center       ●ON │
│     긴급 2건 추적 중              │
└───────────────────────────────────┘

...
```

**정렬: 🔥 추천 → ● ON → ○ OFF (기존 v4 유지)**

---

## 3. 대시보드 드롭 존 설계

드래그 중 대시보드에 **드롭 존**이 나타난다.

```
대시보드 (드래그 중 상태)

░░░ [여기에 추가] ░░░   ← 드롭 존 (index 0)
─────────────────────
[ Action Center 블록 ]
─────────────────────
░░░ [여기에 추가] ░░░   ← 드롭 존 (index 1)
─────────────────────
[ Channel Insight 블록 ]
─────────────────────
░░░ [여기에 추가] ░░░   ← 드롭 존 (index 2)
```

드롭 존 규칙:
- 드래그 중일 때만 표시 (`isDragging` 상태)
- 블록 사이마다 한 개씩 (n+1개 드롭 존)
- 드롭 존 hover 시 파란색 강조

---

## 4. 위치 기억 로직

### `savedPosition` 필드 추가

```ts
export type BlockLayout = {
  cols:          1 | 2 | 3;
  pinned:        boolean;
  savedPosition: number | null;  // ← 신규: OFF 시 마지막 위치 기억
};
```

### 동작 시나리오

**시나리오 A — 드래그 드롭으로 추가 (OFF 블록)**
```
패널에서 "Thumbnail Analyzer" (OFF) 드래그
→ 대시보드 index 1에 드롭
→ insertAt("thumbnailAnalyzer", 1) 호출
→ visibility ON + order에서 index 1 삽입
→ layout.savedPosition = 1
```

**시나리오 B — 패널에서 토글 OFF (ON 블록)**
```
"Channel Insight" (ON, 현재 index 2) 토글 OFF
→ layout[insight].savedPosition = 2  (현재 위치 저장)
→ visibility = false
```

**시나리오 C — 다시 토글 ON (savedPosition 있음)**
```
"Channel Insight" (OFF, savedPosition=2) 토글 ON
→ insertAt("insight", 2) 호출
→ layout.savedPosition = null (복원 완료)
```

**시나리오 D — 대시보드 내 드래그로 재정렬 (ON 블록)**
```
"Action Center" (현재 index 0) → index 2로 드래그
→ order 배열 [0→2] 이동
→ layout[action].savedPosition = 2
```

---

## 5. 충돌 이슈 3가지 및 해결책

### 이슈 1 — pinned + DnD 충돌 (치명적)

**문제:** `pinned` 블록을 DnD로 아래로 드롭하면 정렬 버그 발생.

**해결: PINNED 영역 / DRAGGABLE 영역 완전 분리**

```
대시보드 레이아웃:

┌─────────────────────────────────────┐
│  [PINNED 영역]                      │  ← pinned=true 블록만
│  Action Center  (고정, 드래그 불가) │
├─────────────────────────────────────┤
│  [DRAGGABLE 영역]                   │  ← pinned=false 블록만
│  ░░░ [드롭 존 0] ░░░                │
│  Channel Insight                    │
│  ░░░ [드롭 존 1] ░░░                │
│  Thumbnail Analyzer                 │
│  ░░░ [드롭 존 2] ░░░                │
└─────────────────────────────────────┘
```

**규칙:**
- pinned 블록은 `Draggable` 래핑 제외 → 드래그 불가
- 드롭 존은 DRAGGABLE 영역에만 존재
- PINNED 영역에 드롭 시 무시 (onDragEnd에서 처리)
- `activeOrder`는 기존대로 pinned 우선 정렬 유지

---

### 이슈 2 — insertAt + savedPosition index 충돌

**문제:** A가 index 1에 저장됨 → B가 index 1에 새로 들어옴 → 충돌.

**해결: insert 시 shift 처리**

```
현재 order: [action(0), insight(1), growth(2)]

insertAt("thumbnailAnalyzer", 1) 호출
→ index 1 이후 savedPosition 전부 +1 shift
→ insight.savedPosition: 1 → 2
→ growth.savedPosition: 2 → 3
→ order: [action(0), thumbnailAnalyzer(1), insight(2), growth(3)]
```

**구현 규칙:**
```ts
function insertAt(id: BlockId, index: number) {
  setOrder(prev => {
    const next = prev.filter(i => i !== id);
    next.splice(index, 0, id);
    return next;
  });
  // 삽입 위치 이후 savedPosition 전부 +1 shift
  setLayout(prev => {
    const next = { ...prev };
    for (const bid of Object.keys(next)) {
      const pos = next[bid].savedPosition;
      if (pos != null && pos >= index && bid !== id) {
        next[bid] = { ...next[bid], savedPosition: pos + 1 };
      }
    }
    next[id] = { ...next[id], savedPosition: index };
    return next;
  });
  setVisibility(prev => ({ ...prev, [id]: true }));
}
```

---

### 이슈 3 — DragOverlay 성능

**문제:** Block UI 그대로 DragOverlay에 쓰면 렉 발생.

**해결: Lightweight 전용 카드 분리**

```
DragOverlayCard (아이콘 + 이름만):
┌────────────────────────┐
│ ⠿  [🖼] Thumbnail      │  ← 아이콘 + 이름만
│         Analyzer        │   높이 40px, 고정
└────────────────────────┘
opacity: 0.85
boxShadow: T.shadow.hover (강조)
```

**규칙:**
- 설명 텍스트, 추천 정보 등 모두 제거
- 순수 시각 피드백 역할만
- `pointer-events: none` (드래그 중 클릭 차단)

---

## 6. 드래그 UX 완성 3가지

### 1. 드래그 시작 시 UI 변화

드래그 시작 → 대시보드 살짝 dim + 드롭 존 강조:

```
onDragStart:
  → isDragging = true
  → 대시보드 배경: opacity 0.6 (dim)
  → DropZone 표시 (height 0 → 32px)
  → 드래그 중 블록 자리: placeholder 표시 (점선 border)
```

이유: 드래그 가능 영역 명확화, "어디에 드롭하나?" 즉시 인지.

### 2. 드롭 후 애니메이션

```
onDragEnd:
  → insertAt() 실행
  → 새 블록 진입: opacity 0→1 (150ms)
  → height 0→auto (150ms)
  → "툭 떨어지는 느낌"
```

구현: 삽입된 블록에 `animation: fadeIn 150ms ease` CSS 적용.

### 3. 취소 케이스 처리

```
onDragCancel:
  → isDragging = false
  → 대시보드 dim 해제
  → DropZone 숨김
  → DragOverlay 제거
  → order 변경 없음 (원위치)
```

**필수:** 드롭 존 밖에서 놓거나 Escape 키 → 원위치 복원.

---

## 7. DnD 라이브러리

`@dnd-kit/core` 이미 설치됨.

사용할 구성:
```
DndContext (BlocksContext 내부, AnalyticsProvider 아래)
  onDragStart   → activeDragId 설정, isDragging=true
  onDragEnd     → insertAt 또는 reorder + 상태 초기화
  onDragCancel  → 상태 초기화 (원위치)

  ├── Draggable — 패널 위젯 카드 (OFF + ON 블록 모두)
  ├── Draggable — 대시보드 ON 블록 (pinned=false만)
  └── Droppable — 대시보드 드롭 존 (DRAGGABLE 영역만)

DragOverlay
  └── DragOverlayCard (lightweight — 아이콘+이름만)
```

---

## 8. 구현 파일 목록

### 수정

| 파일 | 변경 내용 |
|------|----------|
| `src/hooks/useDashboardBlocks.ts` | `savedPosition` 타입 추가, `insertAt()` (shift 포함), `toggleOffWithSave()`, `toggleOnWithRestore()` |
| `src/contexts/BlocksContext.jsx` | `DndContext` 래핑, `activeDragId` + `isDragging` 상태 추가, `onDragEnd` 핸들러 |
| `src/components/BlockManagerPanel.jsx` | BlockRow → WidgetCard 교체, 드래그 핸들 추가 |
| `src/pages/DashboardPage.tsx` | PINNED/DRAGGABLE 영역 분리, DropZone 삽입, 드롭 후 애니메이션 |

### 신규 생성

| 파일 | 역할 |
|------|------|
| `src/components/dashboard/DropZone.tsx` | 블록 사이 드롭 존 (드래그 중만 표시, hover 강조) |
| `src/components/dashboard/WidgetCard.tsx` | 패널 위젯 카드 (Draggable, v4 추천 정보 통합) |
| `src/components/dashboard/DragOverlayCard.tsx` | **Lightweight** 드래그 미리보기 (아이콘+이름만, 40px) |

---

## 9. useDashboardBlocks 변경 상세

### 추가 타입

```ts
export type BlockLayout = {
  cols:          1 | 2 | 3;
  pinned:        boolean;
  savedPosition: number | null;  // ← 추가
};
```

### 추가 함수

```ts
// 특정 index에 삽입 + shift 처리 + visibility ON
insertAt(id: BlockId, index: number): void

// 현재 위치 → savedPosition 저장 후 visibility OFF
toggleOffWithSave(id: BlockId): void

// savedPosition 있으면 insertAt, 없으면 끝에 추가
toggleOnWithRestore(id: BlockId): void
```

---

## 10. DashboardPage 변경 상세

```jsx
{/* ── PINNED 영역 (드래그 불가) ── */}
{pinnedOrder.map(id => (
  <div key={id}>
    {def.section && <SectionLabel />}
    {BLOCK_REGISTRY[id](dashData, dashActions)}
  </div>
))}

{/* ── PINNED/DRAGGABLE 구분선 (pinned 있을 때만) ── */}
{pinnedOrder.length > 0 && <PinnedDivider />}

{/* ── DRAGGABLE 영역 ── */}
<DropZone index={0} isDragging={isDragging} />

{draggableOrder.map((id, i) => (
  <React.Fragment key={id}>
    <Draggable id={id}>
      <div style={{ opacity: id === activeDragId ? 0.3 : 1 }}>
        {def.section && <SectionLabel />}
        {BLOCK_REGISTRY[id](dashData, dashActions)}
      </div>
    </Draggable>
    <DropZone index={i + 1} isDragging={isDragging} />
  </React.Fragment>
))}

{/* ── DragOverlay ── */}
<DragOverlay>
  {activeDragId && <DragOverlayCard id={activeDragId} />}
</DragOverlay>
```

---

## 11. DropZone 컴포넌트 설계

```
드래그 중 아님:      height: 0, overflow: hidden (공간 없음)
드래그 중, idle:     height: 32px, border: 1px dashed borderSoft, opacity: 0.5
드래그 중, hover:    height: 40px, border: 2px dashed primary, background: primarySoft
                     "여기에 추가" 텍스트 표시
드롭 완료 직후:      height: 0 → 전환 (150ms)
```

---

## 12. 단계별 작업 순서

### Step 1 — `useDashboardBlocks.ts` 확장
- `savedPosition` 타입 추가
- `insertAt()` — index shift 로직 포함
- `toggleOffWithSave()` / `toggleOnWithRestore()` 구현

### Step 2 — `DragOverlayCard.tsx` 작성 (Lightweight)
- 아이콘 + 이름만 (40px)
- `pointer-events: none`
- opacity 0.85 + shadow 강조

### Step 3 — `DropZone.tsx` 작성
- `useDroppable` 사용
- isDragging prop으로 height 제어
- hover 강조 스타일

### Step 4 — `WidgetCard.tsx` 작성
- `useDraggable` 사용
- v4 추천 정보 통합 (urgencyLine, impactLabel)
- 드래그 핸들 (GripVertical 아이콘)

### Step 5 — `BlocksContext.jsx` DndContext 추가
- `DndContext` 래핑
- `activeDragId`, `isDragging` 상태
- `onDragStart` / `onDragEnd` / `onDragCancel` 핸들러
- `onDragEnd`: PINNED 영역 드롭 무시 처리

### Step 6 — `BlockManagerPanel.jsx` 위젯 갤러리 전환
- BlockRow → WidgetCard 교체
- 토글 클릭 → `toggleOffWithSave` / `toggleOnWithRestore` 사용

### Step 7 — `DashboardPage.tsx` 영역 분리 + 드롭 존 삽입
- PINNED / DRAGGABLE 영역 분리
- DropZone 삽입
- isDragging 시 대시보드 dim 효과
- 삽입 블록 fadeIn 애니메이션 (150ms)

---

## 13. 레이아웃·토큰 규칙

- DropZone transition: `height 0.15s ease`
- Draggable cursor: `grab` / 드래그 중 `grabbing`
- DragOverlay shadow: `T.shadow.hover`
- 드롭 후 fadeIn: `opacity 0→1, 150ms ease`
- Draggable 영역 dim: `opacity 0.6` (onDragStart → 0.3s transition)

---

## 14. 구현 완료 기준

- [ ] 패널에서 위젯 카드 드래그 가능
- [ ] 드래그 중 대시보드 dim + DropZone 표시
- [ ] PINNED 영역 드래그 불가 (pinned 블록 드래그 시 무시)
- [ ] DRAGGABLE 영역에만 드롭 존 존재
- [ ] 드롭 → insertAt (shift 처리) → 블록 삽입 + fadeIn 150ms
- [ ] 대시보드 내 블록 드래그로 재정렬 가능
- [ ] OFF 시 `savedPosition` 저장 → ON 시 복원
- [ ] insertAt 시 기존 savedPosition shift 처리
- [ ] DragOverlay = Lightweight 카드 (아이콘+이름만)
- [ ] onDragCancel → 원위치 복원
- [ ] 위치 정보 localStorage 영구 저장

---

**승인 시 Step 1부터 구현 시작합니다.**
