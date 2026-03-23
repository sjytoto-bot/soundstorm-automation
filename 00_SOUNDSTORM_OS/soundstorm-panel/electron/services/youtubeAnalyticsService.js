// ─── youtubeAnalyticsService v1 ───────────────────────────────────────────────
// YouTube Analytics API OAuth2 Desktop Flow
//
// 사전 조건:
//   config/google_credentials.json — Google Cloud Console에서 내려받은
//   OAuth 2.0 Desktop App 자격증명 파일을 이 경로에 놓는다.
//   (client_id, client_secret 포함)
//
// 인증 흐름:
//   1. loadTokens()  → userData/yt_tokens.json 확인
//   2. 없으면 → 시스템 브라우저로 OAuth URL 열기
//   3. localhost:9473/callback 로컬 서버에서 code 수신
//   4. code → tokens 교환 후 yt_tokens.json 저장
//   5. 만료 시 자동 refresh
//
// API 호출:
//   YouTube Analytics API v2
//   metrics: impressions, impressionsCtr
//   dimensions: video
//
// 반환값:
//   [videoId: string, impressions: number, ctr: number][]

"use strict";

const { google } = require("googleapis");
const http       = require("http");
const urlModule  = require("url");
const { shell }  = require("electron");
const path       = require("path");
const fs         = require("fs");

// ─── 상수 ─────────────────────────────────────────────────────────────────────

const SCOPES = [
  "https://www.googleapis.com/auth/yt-analytics.readonly",
  "https://www.googleapis.com/auth/youtube.readonly",
];
const TOKENS_FILE   = "yt_tokens.json";
const CREDS_FILE    = "google_credentials.json";
const REDIRECT_PORT = 9473;
const REDIRECT_URI  = `http://localhost:${REDIRECT_PORT}/callback`;
const AUTH_TIMEOUT  = 5 * 60 * 1000; // 5분

// ─── credentials ──────────────────────────────────────────────────────────────

/**
 * config/google_credentials.json 로드
 * Google Cloud Console > OAuth 2.0 클라이언트 ID (데스크톱 앱) 다운로드 파일
 */
function loadCredentials(configDir) {
  const credPath = path.join(configDir, CREDS_FILE);
  if (!fs.existsSync(credPath)) {
    throw new Error(
      `[YT Analytics] 자격증명 파일 없음: ${credPath}\n` +
      `Google Cloud Console에서 OAuth2 Desktop App 자격증명 JSON을 다운로드하여\n` +
      `해당 경로에 저장하세요.`
    );
  }
  const raw = JSON.parse(fs.readFileSync(credPath, "utf8"));
  // "installed" (Desktop) 또는 "web" 키 지원
  const creds = raw.installed || raw.web;
  if (!creds?.client_id || !creds?.client_secret) {
    throw new Error("[YT Analytics] 자격증명 JSON 형식 오류: client_id / client_secret 없음");
  }
  return creds;
}

// ─── token management ─────────────────────────────────────────────────────────

function loadTokens(userDataDir) {
  const tokenPath = path.join(userDataDir, TOKENS_FILE);
  if (!fs.existsSync(tokenPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(tokenPath, "utf8"));
  } catch {
    return null;
  }
}

function saveTokens(userDataDir, tokens) {
  const tokenPath = path.join(userDataDir, TOKENS_FILE);
  fs.writeFileSync(tokenPath, JSON.stringify(tokens, null, 2), "utf8");
}

// ─── OAuth2 flow ──────────────────────────────────────────────────────────────

/**
 * 로컬 HTTP 서버를 열고 시스템 브라우저로 OAuth URL을 띄운다.
 * 사용자가 승인하면 /callback에서 code를 받아 반환한다.
 */
function runOAuthFlow(client) {
  return new Promise((resolve, reject) => {
    let serverClosed = false;

    const server = http.createServer((req, res) => {
      const parsed = urlModule.parse(req.url, true);
      if (parsed.pathname !== "/callback") {
        res.writeHead(404);
        res.end();
        return;
      }

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
        <h2>✅ SOUNDSTORM — 인증 완료</h2>
        <p>이 창을 닫고 앱으로 돌아가세요.</p>
        </body></html>
      `);
      if (!serverClosed) { serverClosed = true; server.close(); }
      resolve(code);
    });

    server.on("error", (err) => {
      reject(new Error(`[YT Analytics] 로컬 서버 오류: ${err.message}`));
    });

    server.listen(REDIRECT_PORT, () => {
      const authUrl = client.generateAuthUrl({
        access_type: "offline",
        scope:        SCOPES,
        prompt:       "consent", // refresh_token 보장
      });
      shell.openExternal(authUrl);
      console.log("[YT Analytics] 브라우저에서 인증 진행 중...");
    });

    // 5분 타임아웃
    setTimeout(() => {
      if (!serverClosed) {
        serverClosed = true;
        server.close();
        reject(new Error("[YT Analytics] OAuth2 타임아웃 — 5분 이내 인증을 완료하세요."));
      }
    }, AUTH_TIMEOUT);
  });
}

// ─── authenticate ─────────────────────────────────────────────────────────────

/**
 * 인증된 OAuth2 클라이언트를 반환한다.
 * 캐시된 토큰 사용 → 만료 시 자동 갱신 → 없으면 브라우저 인증
 */
async function authenticate(configDir, userDataDir) {
  const creds  = loadCredentials(configDir);
  const client = new google.auth.OAuth2(creds.client_id, creds.client_secret, REDIRECT_URI);

  const cached = loadTokens(userDataDir);

  if (cached) {
    client.setCredentials(cached);

    // 만료 여부 확인 (1분 여유)
    const expiryMs = cached.expiry_date ?? 0;
    if (expiryMs > 0 && expiryMs < Date.now() + 60_000) {
      try {
        const { credentials } = await client.refreshAccessToken();
        saveTokens(userDataDir, credentials);
        client.setCredentials(credentials);
        console.log("[YT Analytics] 토큰 갱신 완료");
      } catch (err) {
        console.warn("[YT Analytics] 토큰 갱신 실패, 재인증:", err.message);
        const code = await runOAuthFlow(client);
        const { tokens } = await client.getToken(code);
        saveTokens(userDataDir, tokens);
        client.setCredentials(tokens);
      }
    }
    return client;
  }

  // 최초 인증
  const code = await runOAuthFlow(client);
  const { tokens } = await client.getToken(code);
  saveTokens(userDataDir, tokens);
  client.setCredentials(tokens);
  console.log("[YT Analytics] 최초 인증 완료");
  return client;
}

// ─── fetchAnalytics ───────────────────────────────────────────────────────────

/**
 * YouTube Analytics API v2에서 영상별 impressions + impressionsCtr를 가져온다.
 * @param  auth       인증된 OAuth2 클라이언트
 * @param  startDate  "YYYY-MM-DD"
 * @param  endDate    "YYYY-MM-DD"
 * @returns           [videoId, impressions, ctr][]
 */
async function fetchAnalytics(auth, startDate, endDate) {
  const youtubeAnalytics = google.youtubeAnalytics({ version: "v2", auth });

  const res = await youtubeAnalytics.reports.query({
    ids:        "channel==MINE",
    startDate,
    endDate,
    metrics:    "impressions,impressionsCtr",
    dimensions: "video",
    sort:       "-impressions",
    maxResults: 200,
  });

  // rows: [[videoId, impressions, impressionsCtr], ...]
  // impressions: 정수, impressionsCtr: 0~1 비율
  return (res.data.rows ?? []).map(row => [
    String(row[0]),          // videoId
    Number(row[1] ?? 0),     // impressions
    Number(row[2] ?? 0),     // ctr (0~1)
  ]);
}

// ─── 공개 API ──────────────────────────────────────────────────────────────────

/**
 * IPC 핸들러에서 호출하는 메인 엔트리포인트
 * @param  configDir   electron/main.js의 configDir
 * @param  userDataDir app.getPath("userData")
 * @param  dateRange   { start: "YYYY-MM-DD", end: "YYYY-MM-DD" }
 * @returns            [videoId, impressions, ctr][]
 */
async function getAnalyticsData(configDir, userDataDir, dateRange) {
  const auth = await authenticate(configDir, userDataDir);
  return await fetchAnalytics(auth, dateRange.start, dateRange.end);
}

/** 토큰 캐시 존재 여부 */
function isAuthenticated(userDataDir) {
  return loadTokens(userDataDir) !== null;
}

/** 토큰 삭제 (재인증 강제) */
function clearTokens(userDataDir) {
  const tokenPath = path.join(userDataDir, TOKENS_FILE);
  if (fs.existsSync(tokenPath)) fs.unlinkSync(tokenPath);
}

// ─── listRecentUploads ────────────────────────────────────────────────────────

/**
 * 채널의 최근 업로드 영상 목록을 YouTube Data API v3로 가져온다.
 *
 * 흐름:
 *   1. channels.list → uploads 재생목록 ID 획득
 *   2. playlistItems.list → 최근 n개 영상 ID + 제목 + 업로드 일시
 *
 * 사용 목적: UploadAssistant — 업로드 후 video_id 자동 매핑
 *
 * @param  configDir   configDir (main.js 기준)
 * @param  userDataDir app.getPath("userData")
 * @param  maxResults  최대 반환 수 (기본 10)
 * @returns            { videoId, title, publishedAt }[]
 */
async function getRecentUploads(configDir, userDataDir, maxResults = 10) {
  const auth    = await authenticate(configDir, userDataDir);
  const youtube = google.youtube({ version: "v3", auth });

  // 1. 채널의 uploads 재생목록 ID 획득
  const channelRes = await youtube.channels.list({
    part: ["contentDetails"],
    mine: true,
  });

  const uploadsId =
    channelRes.data.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;

  if (!uploadsId) {
    console.warn("[YT Data] uploads 재생목록 ID 없음 — 채널 권한 확인 필요");
    return [];
  }

  // 2. 최근 업로드 목록 조회
  const listRes = await youtube.playlistItems.list({
    part:       ["snippet"],
    playlistId: uploadsId,
    maxResults,
  });

  return (listRes.data.items ?? []).map(item => ({
    videoId:     item.snippet?.resourceId?.videoId ?? "",
    title:       item.snippet?.title ?? "",
    publishedAt: item.snippet?.publishedAt ?? "",
  })).filter(v => v.videoId);
}

module.exports = { getAnalyticsData, isAuthenticated, clearTokens, getRecentUploads };
