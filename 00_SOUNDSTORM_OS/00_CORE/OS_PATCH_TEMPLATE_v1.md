# OS_PATCH_TEMPLATE_v1

목적:  
SOUNDSTORM_AI_OS 수정/추가 시 구조 일관성과 Strict Merge 원칙을 유지하기 위한 공식 개정 요청 템플릿.

본 문서는 Level 4 (자동화 템플릿 레이어)에 속한다.  
헌법 문서(SOUNDSTORM_AI_OS)와 동일 레벨에 두지 않는다.

────────────────────────────────────

## [OS PATCH]

### 1. 작업명
(패치 명칭 작성)

---

### 2. 버전
(예: v4.1)

---

### 3. 작성일시
(UTC 기준)

---

### 4. 적용 레이어
아래 중 하나 선택:

- 헌법 레이어 (Non-Negotiable Rules)
- 구조 헌법 레이어 (Structure Constitution)
- 실행 시스템 레이어 (Runtime Rules)
- 실행 모드 레이어 (AI Operation Mode)

---

### 5. 목적
왜 이 패치가 필요한지 명확히 기술한다.  
(기능 확장이 아닌 구조 명확화 중심)

---

### 6. 적용 위치
OS 문서 내 정확한 섹션 번호 명시:

예:
- 2.3 TEAM_GUIDE_STRUCTURE_STANDARD 하단
- 4.1 TOKEN MIN PROTOCOL 하단

모호한 위치 지정 금지.

---

### 7. 변경 유형

- 추가 (Add)
- 재배치 (Reorder)
- 명확화 (Clarification)
- 예외 정의 (Exception Definition)

※ 삭제는 원칙적으로 금지  
※ 삭제 필요 시 Strict Merge Scope 예외 범위 명시 필수

---

### 8. 삭제 여부

- 없음 (기본 원칙)
또는
- Strict Merge Scope 예외에 해당 (구체 사유 명시)

---

### 9. 영향 범위

해당 패치가 영향을 주는 영역 명시:

- Team Guides
- Snapshot Engine
- Event System
- Automation Scripts
- 없음 (문서 명확화 전용)

---

### 10. Strict Merge 준수 확인

- 기존 문장 삭제 없음
- 의미 변경 없음
- 위치 재배치만 수행
- 누락 0 확인

---

### 11. Change Log 추가 문구

OS 하단 Change Log에 추가할 문장 작성:

예:
v4.1 - TEAM_GUIDE_STRUCTURE_STANDARD 명확화 블록 추가