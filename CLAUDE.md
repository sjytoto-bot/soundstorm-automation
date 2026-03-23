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