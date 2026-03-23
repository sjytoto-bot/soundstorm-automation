// ─── CTRDistributionChart ─────────────────────────────────────────────────────
// CTR 분포 히스토그램 — videoDiagnostics 기준 영상별 CTR 버킷 분포
//
// 차트: Recharts BarChart
// 색상: 버킷별 CTR 범위에 따라 danger / warn / success
//   0-2%: danger  (채널 평균 이하)
//   2-4%: warn
//   4-6%: warn
//   6-8%: success
//   8-10%: success
//   10%+: success (강조)

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Cell, ResponsiveContainer,
} from "recharts";
import { T } from "../../styles/tokens";
import { useAnalyticsContext } from "@/controllers/useAnalyticsController";

// ─── 버킷별 색상 정의 ─────────────────────────────────────────────────────────

const BUCKET_COLOR: Record<string, string> = {
  "0-2%":  T.danger,
  "2-4%":  T.warn,
  "4-6%":  T.warn,
  "6-8%":  T.success,
  "8-10%": T.success,
  "10%+":  T.primary,
};

const BUCKET_BG: Record<string, string> = {
  "0-2%":  T.dangerBg,
  "2-4%":  T.warnBg,
  "4-6%":  T.warnBg,
  "6-8%":  T.successBg,
  "8-10%": T.successBg,
  "10%+":  T.primarySoft,
};

// ─── CustomTooltip ────────────────────────────────────────────────────────────

interface TooltipProps {
  active?:  boolean;
  payload?: { value: number; payload: { bucket: string } }[];
}

function CustomTooltip({ active, payload }: TooltipProps) {
  if (!active || !payload?.length) return null;
  const { bucket } = payload[0].payload;
  const count = payload[0].value;
  const color = BUCKET_COLOR[bucket] ?? T.sub;
  const bg    = BUCKET_BG[bucket]    ?? T.bgSection;

  return (
    <div style={{
      background:   T.bgCard,
      border:       `1px solid ${T.border}`,
      borderRadius: T.radius.btn,
      padding:      `${T.spacing.sm}px ${T.spacing.md}px`,
      boxShadow:    T.shadow.hover,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: T.spacing.sm }}>
        <span style={{
          fontSize:     T.font.size.xs,
          fontFamily:   T.font.familyMono,
          fontWeight:   T.font.weight.bold,
          color,
          background:   bg,
          borderRadius: T.radius.badge,
          padding:      `0 ${T.spacing.xs}px`,
        }}>
          CTR {bucket}
        </span>
        <span style={{
          fontSize:   T.font.size.xs,
          fontFamily: T.font.familyMono,
          fontWeight: T.font.weight.bold,
          color:      T.text,
        }}>
          {count}개 영상
        </span>
      </div>
    </div>
  );
}

// ─── CTRDistributionChart ─────────────────────────────────────────────────────

export default function CTRDistributionChart() {
  const { ctrBuckets, videoDiagnostics, loadingAnalytics } = useAnalyticsContext();

  if (loadingAnalytics || videoDiagnostics.length === 0) return null;

  const total = videoDiagnostics.length;
  const maxVal = Math.max(...ctrBuckets.map(b => b.value), 1);

  // CTR 해석 수치
  const bucketMap = Object.fromEntries(ctrBuckets.map(b => [b.bucket, b.value]));
  const strongCTR = (bucketMap["8-10%"] ?? 0) + (bucketMap["10%+"] ?? 0);
  const weakCTR   = (bucketMap["0-2%"]  ?? 0) + (bucketMap["2-4%"] ?? 0);

  return (
    <div style={{
      background:    T.bgCard,
      border:        `1px solid ${T.border}`,
      borderRadius:  T.radius.card,
      padding:       T.spacing.xl,
      display:       "flex",
      flexDirection: "column",
      gap:           T.spacing.lg,
      boxShadow:     T.shadow.card,
    }}>
      {/* 헤더 */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{
          fontSize:      T.font.size.xs,
          fontFamily:    T.font.familyMono,
          fontWeight:    T.font.weight.bold,
          color:         T.sub,
          letterSpacing: "0.08em",
        }}>
          CTR 분포
        </span>
        <span style={{
          fontSize:   T.font.size.xs,
          fontFamily: T.font.familyMono,
          color:      T.muted,
        }}>
          {total}개 영상 분석
        </span>
      </div>

      {/* BarChart */}
      <ResponsiveContainer width="100%" height={160}>
        <BarChart
          data={ctrBuckets}
          margin={{ top: 4, right: 0, bottom: 0, left: -24 }}
          barCategoryGap="28%"
        >
          <CartesianGrid
            vertical={false}
            stroke={T.borderSoft}
            strokeDasharray="3 3"
          />
          <XAxis
            dataKey="bucket"
            tick={{
              fontSize:   10,
              fontFamily: "monospace",
              fill:       T.muted,
            }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            allowDecimals={false}
            tick={{
              fontSize:   10,
              fontFamily: "monospace",
              fill:       T.muted,
            }}
            axisLine={false}
            tickLine={false}
            domain={[0, maxVal + 1]}
          />
          <Tooltip
            content={<CustomTooltip />}
            cursor={{ fill: T.bgSection }}
          />
          <Bar dataKey="value" radius={[4, 4, 0, 0]}>
            {ctrBuckets.map(entry => (
              <Cell
                key={entry.bucket}
                fill={BUCKET_COLOR[entry.bucket] ?? T.primary}
                fillOpacity={entry.value === 0 ? 0.2 : 0.85}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      {/* 버킷별 비율 요약 */}
      <div style={{
        display:             "grid",
        gridTemplateColumns: "repeat(6, 1fr)",
        gap:                 T.spacing.xs,
      }}>
        {ctrBuckets.map(b => {
          const pct   = total > 0 ? Math.round((b.value / total) * 100) : 0;
          const color = BUCKET_COLOR[b.bucket] ?? T.sub;
          return (
            <div key={b.bucket} style={{
              display:        "flex",
              flexDirection:  "column",
              alignItems:     "center",
              gap:            2,
              padding:        `${T.spacing.xs}px`,
              background:     b.value > 0 ? (BUCKET_BG[b.bucket] ?? T.bgSection) : T.bgSection,
              borderRadius:   T.radius.badge,
            }}>
              <span style={{
                fontSize:   T.font.size.xs,
                fontFamily: T.font.familyMono,
                fontWeight: T.font.weight.bold,
                color:      b.value > 0 ? color : T.muted,
              }}>
                {b.value}
              </span>
              <span style={{
                fontSize:   9,
                fontFamily: "monospace",
                color:      T.muted,
              }}>
                {b.bucket}
              </span>
              <span style={{
                fontSize:   9,
                fontFamily: "monospace",
                color:      b.value > 0 ? color : T.muted,
                opacity:    0.8,
              }}>
                {pct}%
              </span>
            </div>
          );
        })}
      </div>

      {/* CTR 해석 요약 */}
      {(strongCTR > 0 || weakCTR > 0) && (
        <div style={{
          display:    "flex",
          gap:        T.spacing.sm,
          flexWrap:   "wrap",
        }}>
          {strongCTR > 0 && (
            <span style={{
              fontSize:     T.font.size.xs,
              fontFamily:   T.font.familyMono,
              color:        T.success,
              background:   T.successBg,
              borderRadius: T.radius.badge,
              padding:      `2px ${T.spacing.sm}px`,
            }}>
              강한 CTR 영상 {strongCTR}개 발견
            </span>
          )}
          {weakCTR > 0 && (
            <span style={{
              fontSize:     T.font.size.xs,
              fontFamily:   T.font.familyMono,
              color:        T.danger,
              background:   T.dangerBg,
              borderRadius: T.radius.badge,
              padding:      `2px ${T.spacing.sm}px`,
            }}>
              낮은 CTR 영상 {weakCTR}개
            </span>
          )}
        </div>
      )}
    </div>
  );
}
