// ─── ExternalCSVParser ───────────────────────────────────────────────────────
// YouTube Studio 외부 트래픽 CSV → DimensionRow[] 변환
//
// 지원 CSV 컬럼 (YouTube Studio 한국어 내보내기):
//   트래픽 소스 | 소스 제목 | 조회수 | 시청 시간(시간) | 평균 시청 지속 시간
//
// 처리 흐름:
//   CSV 텍스트
//   → 행 파싱 (BOM 제거, 헤더 매핑)
//   → "소스 제목" 기준 집계 (동일 referrer 합산)
//   → DimensionRow[] 반환 (기존 analyzeExternalTraffic 입력 형식)

import type { DimensionRow } from "@/adapters/AnalyticsAdapter";

// ─── 내부 타입 ────────────────────────────────────────────────────────────────

interface RawCSVRow {
  trafficSource:   string;  // 트래픽 소스 (예: "외부")
  sourceTitle:     string;  // 소스 제목 = referrer (예: "naver.com")
  views:           number;
  watchTimeHour:   number;  // 시청 시간(시간)
  avgDurationSec:  number;  // 평균 시청 지속 시간 → 초 변환
}

// ─── 유틸: duration 문자열 → 초 변환 ─────────────────────────────────────────
// YouTube 내보내기 형식: "H:MM:SS" 또는 "M:SS" 또는 "0:00:30" 등

function parseDurationToSec(raw: string): number {
  if (!raw || raw.trim() === "") return 0;
  const clean = raw.trim().replace(/"/g, "");
  const parts  = clean.split(":").map(p => parseInt(p, 10));

  if (parts.some(isNaN)) return 0;

  if (parts.length === 3) {
    const [h, m, s] = parts;
    return h * 3600 + m * 60 + s;
  }
  if (parts.length === 2) {
    const [m, s] = parts;
    return m * 60 + s;
  }
  return parts[0] ?? 0;
}

// ─── 유틸: 숫자 문자열 → number (쉼표 제거) ──────────────────────────────────

function parseNum(raw: string): number {
  if (!raw) return 0;
  const clean = raw.trim().replace(/"/g, "").replace(/,/g, "");
  const n = parseFloat(clean);
  return isNaN(n) ? 0 : n;
}

// ─── CSV 행 파싱 ──────────────────────────────────────────────────────────────
// RFC 4180 간소화: 따옴표 필드 지원

function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuote  = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuote && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuote = !inQuote;
      }
    } else if (ch === "," && !inQuote) {
      fields.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields;
}

// ─── 컬럼 헤더 정규화 ─────────────────────────────────────────────────────────
// 유튜브 내보내기 버전에 따라 컬럼명이 약간 다를 수 있으므로 유연하게 매핑

function detectColumnIndex(headers: string[]): {
  trafficSource: number;
  sourceTitle:   number;
  views:         number;
  watchTime:     number;
  avgDuration:   number;
} {
  const idx = (candidates: string[]) => {
    for (const candidate of candidates) {
      const i = headers.findIndex(h =>
        h.trim().toLowerCase().includes(candidate.toLowerCase())
      );
      if (i >= 0) return i;
    }
    return -1;
  };

  return {
    trafficSource: idx(["트래픽 소스", "traffic source", "traffic_source"]),
    sourceTitle:   idx(["소스 제목", "source title", "source_title", "소스"]),
    views:         idx(["조회수", "views"]),
    watchTime:     idx(["시청 시간", "watch time", "watch_time"]),
    avgDuration:   idx(["평균 시청", "average", "avg"]),
  };
}

// ─── 메인 파서 ────────────────────────────────────────────────────────────────

export interface CSVParseResult {
  rows:   DimensionRow[];
  errors: string[];
  total:  number;   // 원본 데이터 행 수
}

export function parseExternalTrafficCSV(csvText: string): CSVParseResult {
  const errors: string[] = [];

  // BOM 제거
  const clean = csvText.replace(/^\uFEFF/, "").trim();
  const lines  = clean.split(/\r?\n/).filter(l => l.trim().length > 0);

  if (lines.length < 2) {
    return { rows: [], errors: ["CSV 데이터가 비어 있거나 헤더만 있습니다."], total: 0 };
  }

  // 헤더 파싱
  const headers = parseCSVLine(lines[0]);
  const colIdx  = detectColumnIndex(headers);

  if (colIdx.sourceTitle < 0 || colIdx.views < 0) {
    return {
      rows:   [],
      errors: ["필수 컬럼(소스 제목, 조회수)을 찾을 수 없습니다."],
      total:  0,
    };
  }

  // 데이터 행 파싱
  const rawRows: RawCSVRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const fields = parseCSVLine(lines[i]);
    if (fields.length < 2) continue;

    const sourceTitle = fields[colIdx.sourceTitle]?.trim() ?? "";
    if (!sourceTitle) continue;

    rawRows.push({
      trafficSource:  colIdx.trafficSource >= 0 ? (fields[colIdx.trafficSource]?.trim() ?? "") : "외부",
      sourceTitle,
      views:          parseNum(fields[colIdx.views] ?? "0"),
      watchTimeHour:  colIdx.watchTime  >= 0 ? parseNum(fields[colIdx.watchTime] ?? "0") : 0,
      avgDurationSec: colIdx.avgDuration >= 0 ? parseDurationToSec(fields[colIdx.avgDuration] ?? "") : 0,
    });
  }

  // sourceTitle 기준 집계 (동일 referrer 행 합산)
  const aggregated = new Map<string, {
    views:        number;
    watchTimeMin: number;
    durationSum:  number;
    count:        number;
  }>();

  for (const row of rawRows) {
    const existing = aggregated.get(row.sourceTitle) ?? {
      views:        0,
      watchTimeMin: 0,
      durationSum:  0,
      count:        0,
    };
    existing.views        += row.views;
    existing.watchTimeMin += row.watchTimeHour * 60;  // 시간 → 분
    existing.durationSum  += row.avgDurationSec;
    existing.count        += 1;
    aggregated.set(row.sourceTitle, existing);
  }

  // 총 조회수 (ratio 계산용)
  const totalViews = Array.from(aggregated.values()).reduce((s, v) => s + v.views, 0);

  // DimensionRow[] 변환
  const rows: DimensionRow[] = Array.from(aggregated.entries())
    .map(([key, val]) => ({
      key,
      views:          val.views,
      ratio:          totalViews > 0 ? val.views / totalViews : 0,
      watchTimeMin:   val.watchTimeMin,
      avgDurationSec: val.count > 0 ? Math.round(val.durationSum / val.count) : 0,
    }))
    .filter(r => r.views > 0)
    .sort((a, b) => b.views - a.views);

  return { rows, errors, total: rawRows.length };
}
