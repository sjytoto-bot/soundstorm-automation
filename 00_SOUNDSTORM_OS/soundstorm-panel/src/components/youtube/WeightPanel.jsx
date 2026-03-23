import { T } from "../../styles/tokens";

// ─── 로컬 색상 앨리어스 ────────────────────────────────────────────────────────
const C = {
  bg:     T.bgApp,
  border: T.border,
  text:   T.text,
  sub:    T.sub,
  muted:  T.muted,
};

// ─── STEP 1 — Preset 가중치 세트 ──────────────────────────────────────────────
export const PRESETS = {
  balanced:        { growth: 0.25, reach: 0.25, engagement: 0.30, monetization: 0.20 },
  growthMax:       { growth: 0.40, reach: 0.20, engagement: 0.25, monetization: 0.15 },
  engagementMax:   { growth: 0.20, reach: 0.20, engagement: 0.45, monetization: 0.15 },
  monetizationMax: { growth: 0.20, reach: 0.20, engagement: 0.25, monetization: 0.35 },
};

const PRESET_BUTTONS = [
  { key: "balanced",        label: "Balanced" },
  { key: "growthMax",       label: "Growth"   },
  { key: "engagementMax",   label: "Engage"   },
  { key: "monetizationMax", label: "Monetize" },
];

const AXES = [
  { key: "growth",       label: "Growth"   },
  { key: "reach",        label: "Reach"    },
  { key: "engagement",   label: "Engage"   },
  { key: "monetization", label: "Monetize" },
];

const AXIS_KEYS = AXES.map(a => a.key);

// 현재 weights가 특정 preset과 일치하는지 판별 (부동소수점 허용치 0.001)
function detectActivePreset(weights) {
  return Object.entries(PRESETS).find(([, p]) =>
    AXIS_KEYS.every(k => Math.abs(weights[k] - p[k]) < 0.001)
  )?.[0] ?? null;
}

// ─── WeightPanel ───────────────────────────────────────────────────────────────
// Props
//   weights        { growth, reach, engagement, monetization } — 합계 1.0
//   onWeightChange (axis: string, pctValue: number) => void
//   onPresetApply  (presetWeights: object) => void  ← = setWeights

export default function WeightPanel({ weights, onWeightChange, onPresetApply }) {
  const pctOf        = key => Math.round(weights[key] * 100);
  const activePreset = detectActivePreset(weights);

  return (
    <div style={{
      padding:       `${T.spacing.sm}px ${T.spacing.md}px`,
      borderRadius:  T.radius.btn,
      border:        `1px solid ${C.border}`,
      background:    C.bg,
      display:       "flex",
      flexDirection: "column",
      gap:           T.spacing.sm,
    }}>
      {/* ── 헤더 + Preset 버튼 그룹 ─────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{
          fontSize: 10, color: C.muted, fontFamily: "monospace",
          letterSpacing: "0.08em",
        }}>
          WEIGHTS
        </span>

        <div style={{ display: "flex", gap: T.spacing.xs }}>
          {PRESET_BUTTONS.map(({ key, label }) => {
            const isActive = activePreset === key;
            return (
              <button
                key={key}
                onClick={() => onPresetApply?.(PRESETS[key])}
                style={{
                  fontSize:      9,
                  fontFamily:    "monospace",
                  letterSpacing: "0.04em",
                  fontWeight:    isActive ? 700 : 500,
                  padding:       `1px ${T.spacing.xs}px`,
                  borderRadius:  T.radius.badge,
                  border:        `1px solid ${isActive ? T.color.primary : C.border}`,
                  background:    isActive ? T.primarySoft : C.bg,
                  color:         isActive ? T.color.primary : C.muted,
                  cursor:        "pointer",
                  transition:    "background 0.15s, border-color 0.15s, color 0.15s",
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── 슬라이더 4개 ─────────────────────────────────────────────────────── */}
      {AXES.map(({ key, label }) => (
        <div key={key} style={{ display: "flex", flexDirection: "column", gap: T.spacing.xs }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <span style={{ fontSize: 10, color: C.sub, fontFamily: "monospace" }}>
              {label}
            </span>
            <span style={{ fontSize: 10, color: C.text, fontFamily: "monospace", fontWeight: 600 }}>
              {pctOf(key)}%
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={pctOf(key)}
            onChange={e => onWeightChange?.(key, Number(e.target.value))}
            style={{ width: "100%", accentColor: T.color.primary, cursor: "pointer" }}
          />
        </div>
      ))}
    </div>
  );
}
