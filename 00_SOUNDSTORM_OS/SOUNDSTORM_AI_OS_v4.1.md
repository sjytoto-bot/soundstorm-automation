

---

Spec Layer: Level 1 (운영 헌법)  
작성일시: 2026-02-25

────────────────────────────────────

# 0️⃣ META

- 본 문서는 SOUNDSTORM 운영 헌법이다.
    
- 기능 확장보다 구조 일관성을 우선한다.
    
- 삭제, 요약, 재서술은 허용되지 않는다.
    
- Strict Merge는 기본 병합 방식이다.
    

────────────────────────────────────

# 1️⃣ 🏛 최상위 헌법 레이어 (Non-Negotiable Rules)

## 1.1 Content Preservation Rule

- 삭제 금지
    
- 요약 금지
    
- 표현 변경 금지
    
- 재서술 금지
    
- 위치 이동만 허용
    

---

## 1.2 Strict Merge Protocol

문서 통합 시 반드시:

1. 원문 A 100% 유지
    
2. 원문 B 100% 유지
    
3. 중복 판단 금지
    
4. 표현 통일 금지
    
5. 간결화 금지
    
6. 의미 해석 변경 금지
    
7. 위치 재배치만 허용
    

병합 후 반드시 출력:

[누락 검사 보고]

- A 항목 수
    
- B 항목 수
    
- 병합 항목 수
    
- 누락 0 확인
    

---

## 1.3 DATA_RULES 우선 원칙

1. 데이터 관련 작업은 SOUNDSTORM_DATA_RULES.md를 최상위 기준으로 따른다.
    
2. OS와 DATA_RULES 충돌 시 DATA_RULES가 우선한다.
    
3. 데이터 무결성은 운영 편의보다 항상 상위에 둔다.
    

---

## 1.4 Stage Classification Reporting Principle

- 작업 시작 시 현재 로드맵 단계만 명시
    
- AI는 단계 분류만 보고
    
- 실행 여부 판단은 대표가 수행
    
- 단계 분류는 제동 장치가 아니다
    
- “확장 금지/위반/침범” 표현 사용 금지
    

---

## 1.5 🧭 ROADMAP SYSTEM — 4 STAGE MODEL (v4.0 고정)

SOUNDSTORM는 4단계 체계를 따른다.

### 1단계 — 시스템 안정화

구조 고정 및 무결성 확보 단계.

### 2단계 — 자동화/전략 기반 구축

데이터 기반 분석 구조 및 자동화 설계 단계.

### 3단계 — 수익 구조 연결

자동화 시스템과 외부 매출 구조 연결 단계.

### 4단계 — 장기 브랜드 자산화

IP, 카탈로그, 브랜드 방향 고정 및 자산 영속성 확보 단계.

본 체계는 분류 목적이며 실행 제동 장치가 아니다.  
실행 판단은 대표가 수행한다.

────────────────────────────────────

# 2️⃣ 🧱 구조 헌법 레이어 (Structure Constitution)

## 2.1 계층 구조 정의

Level 0 → SOUNDSTORM_DATA_RULES.md  
Level 1 → SOUNDSTORM_AI_OS  
Level 2 → MASTER_ROADMAP  
Level 3 → TEAM_GUIDES  
Level 4 → 자동화 템플릿

- AG_CODE_PATCH_TEMPLATE_v1.md
    
- OS_PATCH_TEMPLATE_v1.md
    

---

## 2.2 Team Identity Registry (고정)

- 운영팀_마스터컨트롤
    
- 운영팀_데이터구축
    
- 전략팀_데이터분석
    
- 콘텐츠팀_제작
    
- 네이버스토어팀
    
- 운영팀_재무세무
    
- 운영팀_개발
    

변형 금지.

---

## 2.3 TEAM_GUIDE_STRUCTURE_STANDARD (고정 규칙)

모든 팀가이드는 다음 6단계 구조를 따른다:

1️⃣ 역할 정의

2️⃣ 내부 정책 레이어 (해당 시)

- 가격 정책
    
- 고정 원칙
    
- 계약/결제 규칙
    
- Strict Merge 보고
    

3️⃣ 운영 인프라 레이어 (해당 시)

- 시스템 구조
    
- 자동화 흐름
    
- 데이터 보호 원칙
    
- 단계별 계획
    

4️⃣ 실행 기준점

- 해결 완료
    
- 미해결
    
- 진행 중
    
- 다음 즉시 실행 단계
    

5️⃣ 병행 트랙

- 2단계/3단계 확장
    
- 장기 전략
    

6️⃣ Snapshot (Dashboard 동기화 대상)

- 반드시 단일 블록
    
- 상태만 포함
    
- 정책/인프라 포함 금지
    

---

## 2.4 DIRECTORY CONSTITUTION

- OS는 Obsidian Vault 내부에만 존재
    
- TEAM_GUIDES 단일 경로 유지
    
- snapshot_engine는 01_TEAM_GUIDES만 수정
    
- 자동화는 OS 복제 금지
    

────────────────────────────────────

# 3️⃣ ⚙ 실행 시스템 레이어 (System Runtime Rules)

## 3.1 Snapshot 승인 구조

- SNAPSHOT_DRAFT::팀명
    
- SNAPSHOT_APPROVE::팀명
    
- SNAPSHOT_START / SNAPSHOT_END 필수
    
- Version +0.1
    
- Timestamp 갱신
    
- Change Log 기록
    
- Drive 백업
    

---

## 3.2 Event Structure Adoption

1단계에서는 Track/Goal 기반 이벤트 구조 채택

- 상태 변경은 append-only history
    
- 앱 시작 시 replay 복원
    
- reducer 단일 상태 변경 경로 유지
    

---

## 3.3 SPEC VERSION REQUIREMENT

SPEC_VERSION = "7.1"  
불일치 시 실행 중단

────────────────────────────────────

# 4️⃣ 🛠 실행 모드 레이어 (AI Operation Mode)

## 4.1 TOKEN MIN PROTOCOL

목적: 대형 코드 수정 시 토큰 소비 최소화

규칙:

1. 전체 파일 재출력 금지
    
2. 다중 분할 읽기 금지
    
3. 수정 대상 블록만 확인
    
4. diff 단위 패치만 작성
    
5. 미변경 코드 재출력 금지
    
6. 설명 최소화
    

패치 방식: AG_CODE_PATCH_TEMPLATE_v1 기본 적용

---

## 4.2 Strict Merge Scope Clarification

Strict Merge는 문서 병합 시 적용

예외 범위:

- 버전 종속 제거
    
- 계층 구조 정리
    
- 오타/형식 오류 수정
    
- 버전 정규화
    

정책 의미 변경은 금지

---

## 4.3 AI Command Trigger Rule (추가 블록)

목적:  
자연어 대화와 실행 명령을 명확히 분리하여  
Event 시스템 오염 및 비의도적 상태 변경을 방지한다.

### 4.3.1 기본 원칙

- 자연어 응답은 실행하지 않는다.
    
- YAML 형식 응답만 Command Layer에서 실행 대상이 된다.
    
- YAML은 단독 코드블록으로만 반환되어야 한다.
    
- 설명과 YAML을 혼합하지 않는다.
    

### 4.3.2 YAML 생성 트리거 조건

AI는 다음 조건이 명시적으로 충족될 때만 YAML을 생성한다:

- “실행용으로 줘”
    
- “YAML로 만들어줘”
    
- “Command 형식으로 줘”
    
- 상태 변경이 명확히 목적임이 선언된 경우
    

위 신호가 없을 경우 기본값은 설명 모드 유지이다.

### 4.3.3 자동 생성 금지 원칙

다음 경우 YAML을 자동 생성하지 않는다:

- 전략 논의 중
    
- 구조 검토 중
    
- 분석/설명 요청 상황
    
- 실행 의도가 명확히 표현되지 않은 경우
    

### 4.3.4 안전 확인 절차

의도가 모호한 경우 AI는 다음과 같이 1회 확인할 수 있다:

“이거 실행용으로 만들까?”

확인 없이는 상태 변경용 YAML을 생성하지 않는다.

### 4.3.5 실행 보호 원칙

- YAML 파싱 실패 시 실행하지 않는다.
    
- YAML 외 포맷은 실행하지 않는다.
    
- null 반환 시 state 변경 없음.
    
- history append 없음.
    

---

## 4.3.6 공식 Command YAML 스키마 (구현 기준 고정)

다음 스키마는 현재 Dashboard `commandParser.js` 구현을 기준으로 한  
**공식 실행 스키마**이다.

최상위 키는 반드시 단일 명령 타입이어야 하며,  
2칸 들여쓰기 YAML 객체 구조를 따른다.

### 작업_추가 (수정 반영본)

작업_추가:  
  트랙: string  
  제목: string  
  상태: 대기 | 진행중 | 완료 | 보류   # optional  
  우선순위: 낮음 | 보통 | 높음        # optional  
  팀: string

---

### 내부 동작 기준 (추가 설명)

- 상태가 생략될 경우 기본값은 `planned`
    
- 상태는 한글 enum → 내부 영문 enum으로 변환된다.
    
- 허용 값:
    
    - 대기 → planned
        
    - 진행중 → active
        
    - 완료 → done
        
    - 보류 → blocked
        
- 유효하지 않은 상태 입력 시 실행되지 않는다.
    
- 생성 이벤트 1개만 발생하며 추가 상태 변경 이벤트는 생성하지 않는다.
    

---

### 작업_상태변경

```yaml
작업_상태변경:
  아이디: goal_xxx
  상태: 대기 | 진행중 | 완료 | 보류
```

내부 매핑:

- 작업_상태변경 → GOAL_STATUS
    
- 상태는 planned/active/done/blocked로 변환된다.
    
- 유효 상태 외 값은 실행되지 않는다.
    

---

### 작업_수정

```yaml
작업_수정:
  아이디: goal_xxx
  제목: optional
  우선순위: optional
  팀: optional
```

- 아이디는 필수
    
- 수정 필드가 0개일 경우 실행되지 않는다.
    
- 우선순위는 한글 enum → 내부 영문 enum으로 변환된다.
    

---

### 작업_삭제

```yaml
작업_삭제:
  아이디: goal_xxx
```

- 아이디 필수
    
- 존재하지 않는 ID는 실행되지 않는다.
    

---

### 4.3.7 파서 동작 기준

- `yaml.load()`를 통해 객체 파싱한다.
    
- 최상위 key 1개만 허용한다.
    
- 첫 번째 key를 명령 타입으로 인식한다.
    
- COMMAND_ALIAS / FIELD_ALIAS 매핑을 통해 내부 이벤트로 변환한다.
    
- buildEvent()가 null 반환 시 실행되지 않는다.
    

---

본 블록은 현재 구현 상태와 1:1 정렬된 기준 문서이며,  
구현 변경 없이 헌법 명문화(Add Only)로 간주한다.

SPEC_VERSION 변경 없음.

────────────────────────────────────

# 5️⃣ CHANGE LOG (통합)

v3.0 Strict Merge Protocol 도입  
v3.1 Layer 추가  
v3.2 Governance Patch  
v3.4 Version 정렬  
v3.6 구조 참조 분리  
v3.7 Strict Merge Scope 명확화  
v3.8 Event 구조 승격 + TOKEN MIN 추가  
v3.9 Stage Classification 원칙 추가  
v4.0 4단계 체계 확정 및 구조 재배열 (내용 삭제 없음 / 재배치만 수행)  
v4.1 AI Command Trigger Rule 추가 (삭제 0 / 의미 변경 0 / Add only)

---
