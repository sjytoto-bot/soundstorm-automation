// ─── googleSheetService v1 ─────────────────────────────────────────────────────
// Google Sheets API OAuth2 Desktop Flow
//
// 사전 조건:
//   config/google_credentials.json — YouTube Analytics와 동일한 OAuth2 Desktop App 자격증명
//   config/sheets_config.json      — { "spreadsheetId": "YOUR_SHEET_ID" }
//
// 인증 흐름: youtubeAnalyticsService 와 동일 (포트만 9474 사용)
// 토큰 파일: userData/sheets_tokens.json (YT와 별도 관리)
//
// 반환값: { [sheetName]: Record<string, string>[] }
//   첫 행을 헤더(키)로 사용한 행 객체 배열

"use strict";

const { google } = require("googleapis");
const http       = require("http");
const urlModule  = require("url");
const { shell }  = require("electron");
const path       = require("path");
const fs         = require("fs");

// ─── 상수 ─────────────────────────────────────────────────────────────────────

const SCOPES        = ["https://www.googleapis.com/auth/spreadsheets.readonly"];
const TOKENS_FILE   = "sheets_tokens.json";
const CREDS_FILE    = "google_credentials.json";
const CONFIG_FILE   = "sheets_config.json";
const REDIRECT_PORT = 9474;
const REDIRECT_URI  = `http://localhost:${REDIRECT_PORT}/callback`;
const AUTH_TIMEOUT  = 5 * 60 * 1000;

// ─── config ───────────────────────────────────────────────────────────────────

const SHEETS_CONFIG_TEMPLATE = JSON.stringify(
  { spreadsheetId: "PASTE_YOUR_GOOGLE_SHEET_ID_HERE" },
  null, 2
);

const PLACEHOLDER_ID = "PASTE_YOUR_GOOGLE_SHEET_ID_HERE";

function loadSheetsConfig(configDir) {
  const configPath = path.join(configDir, CONFIG_FILE);

  // 파일 없으면 템플릿 자동 생성
  if (!fs.existsSync(configPath)) {
    console.warn("[Sheets] sheets_config.json not found — creating template");
    fs.writeFileSync(configPath, SHEETS_CONFIG_TEMPLATE, "utf8");
    console.warn(`
[Sheets] Google Sheets 연결이 아직 설정되지 않았습니다.

config/sheets_config.json 파일의 spreadsheetId를
실제 Google Sheet ID로 수정하세요.

예:
{
  "spreadsheetId": "1ABCDEF1234567890"
}

Google Sheet URL 예시:
https://docs.google.com/spreadsheets/d/1ABCDEF1234567890/edit
`);
    throw new Error("[Sheets] spreadsheetId가 설정되지 않았습니다 — sheets_config.json을 수정 후 앱을 재시작하세요.");
  }

  const cfg = JSON.parse(fs.readFileSync(configPath, "utf8"));

  if (!cfg.spreadsheetId) {
    throw new Error("[Sheets] sheets_config.json에 spreadsheetId 없음");
  }

  // placeholder 미수정 검사
  if (cfg.spreadsheetId === PLACEHOLDER_ID) {
    console.warn(`
[Sheets] Google Sheets 연결이 아직 설정되지 않았습니다.

config/sheets_config.json 파일의 spreadsheetId를
실제 Google Sheet ID로 수정하세요.

예:
{
  "spreadsheetId": "1ABCDEF1234567890"
}

Google Sheet URL 예시:
https://docs.google.com/spreadsheets/d/1ABCDEF1234567890/edit
`);
    throw new Error("[Sheets] spreadsheetId가 설정되지 않았습니다 — PASTE_YOUR_GOOGLE_SHEET_ID_HERE를 실제 ID로 교체하세요.");
  }

  return cfg;
}

// ─── credentials ──────────────────────────────────────────────────────────────

function loadCredentials(configDir) {
  const credPath = path.join(configDir, CREDS_FILE);
  if (!fs.existsSync(credPath)) {
    throw new Error(
      `[Sheets] 자격증명 파일 없음: ${credPath}\n` +
      `Google Cloud Console에서 OAuth2 Desktop App 자격증명 JSON을 다운로드하여\n` +
      `해당 경로에 저장하세요.`
    );
  }
  const raw   = JSON.parse(fs.readFileSync(credPath, "utf8"));
  const creds = raw.installed || raw.web;
  if (!creds?.client_id || !creds?.client_secret) {
    throw new Error("[Sheets] 자격증명 JSON 형식 오류: client_id / client_secret 없음");
  }
  return creds;
}

// ─── token management ─────────────────────────────────────────────────────────

function loadTokens(userDataDir) {
  const tokenPath = path.join(userDataDir, TOKENS_FILE);
  if (!fs.existsSync(tokenPath)) return null;
  try { return JSON.parse(fs.readFileSync(tokenPath, "utf8")); }
  catch { return null; }
}

function saveTokens(userDataDir, tokens) {
  fs.writeFileSync(path.join(userDataDir, TOKENS_FILE), JSON.stringify(tokens, null, 2), "utf8");
}

// ─── OAuth2 flow ──────────────────────────────────────────────────────────────

function runOAuthFlow(client) {
  return new Promise((resolve, reject) => {
    let serverClosed = false;

    const server = http.createServer((req, res) => {
      const parsed = urlModule.parse(req.url, true);
      if (parsed.pathname !== "/callback") { res.writeHead(404); res.end(); return; }

      const { code, error } = parsed.query;

      if (error) {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(`<html><body><h2>인증 오류: ${error}</h2><p>앱으로 돌아가 재시도하세요.</p></body></html>`);
        if (!serverClosed) { serverClosed = true; server.close(); }
        reject(new Error(`OAuth2 오류: ${error}`));
        return;
      }

      if (!code) {
        res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
        res.end("<html><body><h2>오류: 인증 코드 없음</h2></body></html>");
        if (!serverClosed) { serverClosed = true; server.close(); }
        reject(new Error("OAuth2 redirect에 code 없음"));
        return;
      }

      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(`
        <html><body style="font-family:sans-serif;padding:40px;text-align:center;">
        <h2>✅ SOUNDSTORM — 시트 인증 완료</h2>
        <p>이 창을 닫고 앱으로 돌아가세요.</p>
        </body></html>
      `);
      if (!serverClosed) { serverClosed = true; server.close(); }
      resolve(code);
    });

    server.on("error", err => reject(new Error(`[Sheets] 로컬 서버 오류: ${err.message}`)));

    server.listen(REDIRECT_PORT, () => {
      const authUrl = client.generateAuthUrl({ access_type: "offline", scope: SCOPES, prompt: "consent" });
      console.log("[Sheets] Opening browser for Google OAuth login");
      shell.openExternal(authUrl);
      console.log("[Sheets] 브라우저에서 인증 진행 중...");
    });

    setTimeout(() => {
      if (!serverClosed) { serverClosed = true; server.close(); reject(new Error("[Sheets] OAuth2 타임아웃 — 5분 이내 인증을 완료하세요.")); }
    }, AUTH_TIMEOUT);
  });
}

// ─── authenticate ─────────────────────────────────────────────────────────────

async function authenticate(configDir, userDataDir) {
  const creds  = loadCredentials(configDir);
  const client = new google.auth.OAuth2(creds.client_id, creds.client_secret, REDIRECT_URI);
  const cached = loadTokens(userDataDir);

  if (cached) {
    client.setCredentials(cached);
    const expiryMs = cached.expiry_date ?? 0;
    if (expiryMs > 0 && expiryMs < Date.now() + 60_000) {
      try {
        const { credentials } = await client.refreshAccessToken();
        saveTokens(userDataDir, credentials);
        client.setCredentials(credentials);
        console.log("[Sheets] 토큰 갱신 완료");
      } catch (err) {
        console.warn("[Sheets] 토큰 갱신 실패, 재인증:", err.message);
        const code = await runOAuthFlow(client);
        const { tokens } = await client.getToken(code);
        saveTokens(userDataDir, tokens);
        client.setCredentials(tokens);
      }
    }
    return client;
  }

  const code = await runOAuthFlow(client);
  const { tokens } = await client.getToken(code);
  saveTokens(userDataDir, tokens);
  client.setCredentials(tokens);
  console.log("[Sheets] OAuth authentication complete");
  return client;
}

// ─── fetchRows ────────────────────────────────────────────────────────────────

/**
 * 지정된 시트의 전체 행을 헤더 키 기반 객체 배열로 반환한다.
 * @returns Record<string, string>[]
 */
async function fetchRows(auth, spreadsheetId, sheetName) {
  const sheets = google.sheets({ version: "v4", auth });
  const res    = await sheets.spreadsheets.values.get({ spreadsheetId, range: sheetName });
  const [headerRow, ...dataRows] = res.data.values ?? [];

  if (!headerRow?.length) return [];

  return dataRows
    .filter(row => row.some(cell => String(cell ?? "").trim()))
    .map(row => {
      const obj = {};
      // 헤더 정의 컬럼
      headerRow.forEach((key, i) => { obj[String(key).trim()] = String(row[i] ?? "").trim(); });
      // 헤더 범위 초과 컬럼 — _ext{index} 키로 보존 (스냅샷 행의 추가 컬럼 대응)
      for (let i = headerRow.length; i < row.length; i++) {
        const cell = String(row[i] ?? "").trim();
        if (cell) obj[`_ext${i}`] = cell;
      }
      return obj;
    });
}

// ─── 공개 API ──────────────────────────────────────────────────────────────────

/**
 * IPC 핸들러에서 호출하는 메인 엔트리포인트
 * @param configDir   config/ 디렉토리 경로
 * @param userDataDir app.getPath("userData")
 * @param sheetNames  읽을 시트 이름 배열 (예: ["_RawData_Master", "SS_음원마스터_최종"])
 * @returns           { [sheetName]: Record<string, string>[] }
 */
async function getSheetVideos(configDir, userDataDir, sheetNames) {
  const { spreadsheetId } = loadSheetsConfig(configDir);
  console.log("[SheetsService] Fetching spreadsheet:", spreadsheetId);
  console.log("[SheetsService] Sheet names:", sheetNames);

  // ── credentials 존재 여부 검사 ──────────────────────────────────────────────
  const credentialsPath = path.join(configDir, "google_credentials.json");
  if (!fs.existsSync(credentialsPath)) {
    console.error(`
[Sheets] google_credentials.json 파일이 없습니다.

Google Sheets API를 사용하려면 OAuth2 자격증명 파일이 필요합니다.

설정 방법:

1. https://console.cloud.google.com/ 접속
2. 프로젝트 생성 또는 선택
3. API 및 서비스 → 사용자 인증 정보
4. OAuth 2.0 클라이언트 ID 생성
5. 애플리케이션 유형 → 데스크톱 앱
6. JSON 다운로드

다운로드한 파일을 아래 경로에 저장하세요:

soundstorm-panel/config/google_credentials.json
`);
    throw new Error("[Sheets] OAuth credentials missing");
  }
  console.log("[Sheets] OAuth credentials loaded");

  const auth              = await authenticate(configDir, userDataDir);
  const result            = {};

  for (const sheetName of sheetNames) {
    try {
      const rows = await fetchRows(auth, spreadsheetId, sheetName);
      console.log(`[SheetsService] Rows received (${sheetName}):`, rows.length);
      if (!rows || rows.length === 0) {
        console.warn("[SheetsService] WARNING: Sheet returned 0 rows —", sheetName);
      } else {
        console.log(`[SheetsService] COLUMN HEADERS (${sheetName}):`, Object.keys(rows[0]));
        console.log(`[SheetsService] FIRST ROW (${sheetName}):`, rows[0]);
      }
      result[sheetName] = rows;
    } catch (sheetErr) {
      // 시트가 존재하지 않거나 범위 파싱 실패 — 빈 배열로 처리해 fallback 허용
      console.warn(`[SheetsService] 시트 읽기 실패 (${sheetName}):`, sheetErr.message ?? sheetErr);
      result[sheetName] = [];
    }
  }

  console.log("[Sheets] Google Sheets 연결 활성화");
  return result;
}

/** 토큰 캐시 존재 여부 */
function isSheetsAuthenticated(userDataDir) {
  return loadTokens(userDataDir) !== null;
}

/** 토큰 삭제 (재인증 강제) */
function clearSheetsTokens(userDataDir) {
  const tokenPath = path.join(userDataDir, TOKENS_FILE);
  if (fs.existsSync(tokenPath)) fs.unlinkSync(tokenPath);
}

module.exports = { getSheetVideos, isSheetsAuthenticated, clearSheetsTokens };
