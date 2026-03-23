# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

SOUNDSTORM is a music production and distribution platform with automation infrastructure. It handles audio creation, storage, analytics, licensing, and sales across integrated systems including Naver Store, YouTube, and Google Sheets.

## Build and Run Commands

### Python Automation (07_AUTOMATION_자동화)
```bash
# Install dependencies
pip install -r 07_AUTOMATION_자동화/requirements.txt

# Run automation scripts
python3 07_AUTOMATION_자동화/engine/snapshot_engine.py
python3 07_AUTOMATION_자동화/scripts_스크립트/api_data_shuttler.py

# License Engine CLI
python3 07_AUTOMATION_자동화/license_engine/main.py

# License Engine Web Server (Flask)
cd 07_AUTOMATION_자동화/license_engine && python3 main_web.py

# Run license engine tests
python3 07_AUTOMATION_자동화/license_engine/test_scenarios.py
```

### Desktop Application (soundstorm-panel)
```bash
cd 00_SOUNDSTORM_OS/soundstorm-panel

npm install
npm run electron:dev    # Development with hot reload
npm run dist            # Build distribution package
npm run test            # Run Vitest unit tests
npm run lint            # ESLint check
```

## Architecture

### Layer System (Constitution-Based)
The project follows strict layered architecture defined in `00_SOUNDSTORM_OS/02_ARCHITECTURE/`:

| Layer | Directory | Role |
|-------|-----------|------|
| **Producer** | `07_AUTOMATION_자동화/` | Sole execution layer - all automation runs here |
| **Consumer** | `04_STORE_스토어/` | Static assets only (HTML, images for Naver Store) |
| **Consumer** | `06_BRAND_브랜드/` | Dashboard visualization consumption |
| **Protected Storage** | `99_SYSTEM/` | Read-only master data, license PDFs, logs |
| **OS Governance** | `00_SOUNDSTORM_OS/` | Team guides, architecture standards, AI governance |
| **Human Input** | `01_WORKSPACE/` | Manual data entry point |

### Path Resolution
Never hardcode absolute paths. Use `07_AUTOMATION_자동화/core/path_config.py`:
```python
from core.path_config import PROJECT_ROOT, STORE_DIR, SYSTEM_DIR, AUTOMATION_DIR
```

### Write Path Enforcement
The `00_GUARD/path_rules.py` module enforces valid output paths. Allowed write locations:
- `07_AUTOMATION/03_RUNTIME/` (cache, temp, logs)
- `99_SYSTEM/DATA_SNAPSHOTS/`
- `99_SYSTEM/LICENSE/DELIVERY/`
- `99_SYSTEM/LICENSE/LOGS/`

Blocked locations:
- `00_SOUNDSTORM_OS/` (except 01_TEAM_GUIDES)
- `08_ARCHIVE_보관/` (direct automation write forbidden)

Use the guard API:
```python
from 00_GUARD.path_rules import get_runtime_path, get_license_delivery_path, get_snapshot_path
```

## Data Rules (SOUNDSTORM_DATA_RULES.md)

- **Absolute Key**: All data mapping uses `video_id`, not video titles
- **Protected Columns**: `곡명`, `상품ID`, `음원파일`, `영상파일`, `장르`, `BPM` - automation cannot overwrite these
- **Cell-by-Cell Update**: Never use bulk `setValues()`; use individual `setValue()` to preserve formatting

## Document Hierarchy

Level 0: `SOUNDSTORM_DATA_RULES.md` (highest priority)
Level 1: `SOUNDSTORM_AI_OS` (operating constitution)
Level 2: `MASTER_ROADMAP`
Level 3: `TEAM_GUIDES`
Level 4: Automation templates

When DATA_RULES and OS rules conflict, DATA_RULES takes precedence.

## Key Governance Rules

- **Content Preservation**: No deletion, summarization, or rewording of documents
- **Strict Merge Protocol**: When merging documents, preserve 100% of both originals
- **4-Stage Roadmap**: 1) System Stabilization → 2) Automation/Strategy → 3) Revenue Connection → 4) Brand Asset Long-term

## Environment Variables (License Engine)

Required in `license_engine/.env`:
```
DRIVE_ROOT_FOLDER_ID=
MASTER_AUDIO_FOLDER_ID=
R2_ENDPOINT=
R2_BUCKET=
R2_ACCESS_KEY=
R2_SECRET_KEY=
SMTP_SERVER=
SMTP_PORT=
SMTP_USER=
SMTP_PASSWORD=
VERIFY_BASE_URL=https://soundstorm.kr/verify
```

## Tech Stack

- **Python**: pandas, google-api-python-client, gspread, Flask, WeasyPrint (PDF), librosa (audio)
- **Node.js**: React 19, Vite 7, Electron 40, TypeScript
- **Storage**: Google Drive, Cloudflare R2, SQLite (license tracking)
- **APIs**: YouTube Data API, Google Sheets, Gmail

## Language Rule

- 모든 설명과 응답은 한국어로 작성한다.
- 코드, 변수명, 파일명은 영어로 유지한다.
- 기존 폴더 구조는 절대 변경하지 않는다.

## Safety Rules

- 기존 문서 내용은 절대 삭제하거나 요약하지 않는다.
- 기존 파일을 수정할 때는 변경 범위를 명확히 제시한다.
- 전체 리팩토링은 반드시 승인 후 진행한다.


## UI Layout Governance

### 1. Layout Structure Rules

- Topbar height는 항상 56px로 고정한다.
- Left Sidebar width는 56px (collapsed) / 220px (expanded)만 허용한다.
- Right Panel width는 340px 고정이다.
- 모든 탭은 동일한 Topbar 구조를 공유한다.
- Header를 중복 생성하지 않는다.
- Layout은 단일 root flex 구조를 유지한다.
- maxWidth: 960px 같은 고정 제한은 사용하지 않는다.

---

### 2. Topbar Alignment Rules

- Topbar는 3영역 구조로 고정한다: 좌측 / 중앙 / 우측
- 좌측: Sidebar toggle 버튼
- 중앙: Page Title
- 우측: Progress, 상태 표시, 우측 패널 토글
- 모든 페이지에서 Topbar 내부 정렬 기준은 동일해야 한다.
- Topbar 내부 요소는 수직 중앙 정렬을 유지한다.

---

### 3. Container & Spacing Rules

- 모든 주요 View는 동일한 container padding 값을 사용한다.
- 카드 좌우 여백은 container padding 기준으로 통일한다.
- Progress bar는 부모 width 100% 기준으로 계산한다.
- Layout 내부 spacing은 styles/tokens.js 값을 사용한다.
- 인라인 스타일 사용은 임시 목적 외 금지한다.

---

### 4. State Management Rules

- Sidebar open/close state는 App 최상단에서만 관리한다.
- Layout 관련 state는 View 컴포넌트에 두지 않는다.
- Topbar는 자체 상태를 생성하지 않는다.
- Layout 구조 변경 시 state 위치를 이동하지 않는다.

---

### 5. Component Responsibility Rules

- Layout 구조는 AppShell에서만 정의한다.
- View 컴포넌트는 콘텐츠만 담당한다.
- 동일 역할의 Header를 각 View에서 생성하지 않는다.
- Layout 컴포넌트 내부에서 비즈니스 로직을 처리하지 않는다.

---

### 6. Animation & Transition Rules

- Transition duration은 최대 0.3초를 넘기지 않는다.
- Layout 이동 애니메이션은 width/opacity 중심으로 제한한다.
- Progress bar transition은 0.3초 이하로 유지한다.

---

### 7. Modification Protocol

- 기존 구조 위에 덧붙이지 말고 정리 후 재배치한다.
- 중복 div 생성 금지.
- Layout 변경 시 변경 범위를 명확히 제시한다.
- 전체 리팩토링은 반드시 승인 후 진행한다.

---

## 필수 참조 문서

모든 작업 전 다음 두 문서를 반드시 참조한다.

- `../../00_SOUNDSTORM_OS/02_ARCHITECTURE/SOUNDSTORM_CREATOR_OS_MASTER SPEC v5_(프로젝트 헌법).md`
  — Creator OS 전체 아키텍처, 엔진 역할, Dashboard Layer 구조 정의 (최우선 헌법)

- `../00_CORE/SOUNDSTORM_DATA_RULES.md`
  — 데이터 키 규칙 (video_id 절대 키), 보호 컬럼, 셀 단위 업데이트 원칙 (데이터 무결성 최우선)

- `../02_ARCHITECTURE/TOKENS_SYSTEM.md`
  — 디자인 토큰 시스템 정의 (T.* 네임스페이스, 색상·간격·반경 토큰 규칙, hex 직접 작성 금지)

위 세 문서와 본 CLAUDE.md 간 충돌 시: **데이터 규칙 > Master Spec > Tokens System > CLAUDE.md** 순으로 우선한다.