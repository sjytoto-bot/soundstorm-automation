// ─── ThumbnailStudioDrawer ────────────────────────────────────────────────────
// Thumbnail Studio — 썸네일 제작 워크플로우 패널 (480px right drawer)
//
// 흐름:
//   1 Content Theme 입력
//   2 Style Intelligence 표시 (Phase 1 결과)
//   3 Midjourney Prompt 생성 + 복사
//   4 Copy 옵션 선택
//   5 Midjourney 이미지 업로드 (Drag & Drop)
//   6 Template 선택 (TEMPLATE_OPTIONS)
//   7 Generate Thumbnail (POST /api/thumbnail/generate → Pillow 서버 합성)

import { useCallback, useEffect, useRef, useState } from "react";
import {
  X, Palette, Wand2, Type, Upload, Layout,
  Eye, Download, RotateCcw, Copy, ExternalLink, BarChart2, Trophy,
} from "lucide-react";
import { T } from "../../styles/tokens";

// ─── 타입 ─────────────────────────────────────────────────────────────────────
interface StyleIntelligence {
  best_style:                  string[];
  recommended_prompt_keywords: string[];
}

interface AbVariant {
  thumbnail_url:   string | null;
  template:        string;
  style:           string;
  text:            string;
  position:        string;
  estimated_ctr:   number;
}

interface AbTestResult {
  test_id:    string;
  theme:      string;
  created_at: string;
  variant_a:  AbVariant;
  variant_b:  AbVariant;
  winner:     "A" | "B" | null;
}

interface Props {
  open:    boolean;
  onClose: () => void;
}

// ─── 상수 ─────────────────────────────────────────────────────────────────────
const API_BASE          = "http://localhost:5100";
const STYLE_API_URL     = `${API_BASE}/api/thumbnail/style`;
const GEN_API_URL       = `${API_BASE}/api/thumbnail/generate`;
const AUTO_LAYOUT_URL   = `${API_BASE}/api/thumbnail/auto-layout`;
const AB_TEST_URL       = `${API_BASE}/api/thumbnail/ab-test/create`;

const POSITION_LABELS: Record<string, string> = {
  top_left:      "Top Left",
  top_center:    "Top Center",
  top_right:     "Top Right",
  center_left:   "Center Left",
  center:        "Center",
  center_right:  "Center Right",
  bottom_left:   "Bottom Left",
  bottom_center: "Bottom Center",
  bottom_right:  "Bottom Right",
};

const TEMPLATE_OPTIONS = [
  { value: "default",  label: "Default",  desc: "흰색 · 검정 stroke" },
  { value: "battle",   label: "Battle",   desc: "흰색 · 붉은 stroke" },
  { value: "assassin", label: "Assassin", desc: "회색 · 검정 stroke" },
  { value: "oriental", label: "Oriental", desc: "금색 · 암갈색 stroke" },
  { value: "minimal",  label: "Minimal",  desc: "흰색 · 옅은 stroke" },
];

// API 오프라인 시 fallback 기본값
const FALLBACK_STYLE: StyleIntelligence = {
  best_style: ["high_contrast", "text_overlay"],
  recommended_prompt_keywords: [
    "high contrast", "dramatic shadows", "sharp definition",
    "clear text area", "strong typography",
  ],
};

// 테마 → 프롬프트 키워드 (prompt_generator.py JS 미러)
const THEME_KEYWORDS: Record<string, string[]> = {
  samurai:  ["samurai warrior", "katana silhouette", "feudal japan"],
  battle:   ["epic battlefield", "war chaos", "clash of swords"],
  assassin: ["shadow figure", "rooftop silhouette", "hidden blade"],
  dark:     ["dark void", "shadow realm", "ominous sky"],
  war:      ["war drums", "marching army", "battlefield horizon"],
  oriental: ["asian architecture", "misty mountains", "lanterns"],
  royal:    ["royal procession", "golden throne", "imperial palace"],
  dragon:   ["dragon silhouette", "fire breath", "mythical beast"],
  warrior:  ["armored warrior", "battle stance", "war paint"],
  ghost:    ["ghost warrior", "ethereal glow", "spirit form"],
  ninja:    ["ninja shadow", "black mask", "rooftop sprint"],
  viking:   ["viking longship", "fjord", "battle axe"],
  epic:     ["epic scale", "god rays", "vast landscape"],
};

// 테마 → 카피 (copy_generator.py JS 미러)
const COPY_MAP: Record<string, string[]> = {
  samurai:  ["SAMURAI", "RONIN", "THE KATANA"],
  battle:   ["BATTLE", "THE CLASH", "WAR CRY"],
  assassin: ["ASSASSIN", "THE SHADOW", "SILENT BLADE"],
  war:      ["WAR", "WAR DRUMS", "THE SIEGE"],
  dark:     ["DARKNESS", "THE VOID", "SHADOW REALM"],
  oriental: ["ORIENTAL", "DYNASTY", "THE EAST"],
  royal:    ["ROYAL", "THE THRONE", "PROCESSION"],
  dragon:   ["DRAGON", "THE BEAST", "FIRE LORD"],
  warrior:  ["WARRIOR", "THE CHOSEN", "IRON WILL"],
  ghost:    ["GHOST", "THE SPIRIT", "PHANTOM"],
  ninja:    ["NINJA", "SHADOW RUN", "THE BLADE"],
  epic:     ["EPIC", "LEGEND", "THE RISE"],
  viking:   ["VIKING", "VALHALLA", "RAGNAROK"],
};

const EPIC_PREFIX = ["EPIC", "DARK", "ANCIENT"];

// ─── 유틸 ─────────────────────────────────────────────────────────────────────
function buildPrompt(theme: string, style: StyleIntelligence | null): string {
  const s = style ?? FALLBACK_STYLE;
  const words   = theme.toLowerCase().split(/[\s\-_]+/);
  const themeKw: string[] = [];
  for (const w of words) {
    const kws = THEME_KEYWORDS[w];
    if (kws) themeKw.push(...kws.slice(0, 2));
  }
  if (!themeKw.length) themeKw.push(theme.toLowerCase(), "epic cinematic");

  const atmo = s.recommended_prompt_keywords.slice(0, 3);
  const all  = [...new Set([...themeKw.slice(0, 3), ...atmo])];
  return all.join(", ") + " --ar 16:9 --v 6 --style raw --q 2";
}

function buildCopyOptions(theme: string): string[] {
  const words   = theme.toLowerCase().split(/[\s\-_]+/);
  const options: string[] = [];
  const seen    = new Set<string>();

  const add = (s: string) => { if (!seen.has(s)) { options.push(s); seen.add(s); } };

  for (const w of words) {
    (COPY_MAP[w] ?? []).forEach(add);
  }
  for (const w of words) {
    const base = (COPY_MAP[w] ?? [w.toUpperCase()])[0];
    EPIC_PREFIX.slice(0, 2).forEach(p => add(`${p} ${base}`));
  }
  if (words.length >= 2) add(words.slice(0, 2).map(w => w.toUpperCase()).join(" "));
  add(theme.toUpperCase());

  return options.slice(0, 6);
}

// ─── 섹션 헤더 공통 컴포넌트 ──────────────────────────────────────────────────
function SectionLabel({ Icon, label, color = T.sub }: {
  Icon: React.ElementType; label: string; color?: string;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: T.spacing.sm, marginBottom: T.spacing.md }}>
      <Icon size={13} color={color} />
      <span style={{
        fontSize:      T.font.size.xs,
        fontWeight:    T.font.weight.semibold,
        color,
        letterSpacing: "0.07em",
        fontFamily:    T.font.familyMono,
      }}>
        {label}
      </span>
    </div>
  );
}

// ─── 메인 컴포넌트 ────────────────────────────────────────────────────────────
export default function ThumbnailStudioDrawer({ open, onClose }: Props) {
  // ── Style Intelligence (API fetch) ──
  const [styleData,     setStyleData]     = useState<StyleIntelligence | null>(null);
  const [isLoadingStyle,setIsLoadingStyle] = useState(false);
  const [styleError,    setStyleError]    = useState<string | null>(null);

  // ── 제작 워크플로우 ──
  const [theme,            setTheme]            = useState("");
  const [prompt,           setPrompt]           = useState("");
  const [copyOptions,      setCopyOptions]      = useState<string[]>([]);
  const [selectedCopy,     setSelectedCopy]     = useState("");
  const [imageFile,        setImageFile]        = useState<File | null>(null);
  const [imageUrl,         setImageUrl]         = useState<string | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState("default");
  const [useAiPosition,    setUseAiPosition]    = useState(true);
  const [aiPosition,       setAiPosition]       = useState<string | null>(null);
  const [aiConfidence,     setAiConfidence]     = useState<number | null>(null);
  const [heatmapUrl,       setHeatmapUrl]       = useState<string | null>(null);
  const [showHeatmap,      setShowHeatmap]      = useState(false);
  const [isDragging,       setIsDragging]       = useState(false);
  const [output,           setOutput]           = useState<string | null>(null);  // 서버 URL
  const [isGenerating,     setIsGenerating]     = useState(false);
  const [copied,           setCopied]           = useState(false);
  // ── A/B Test ──
  const [abTestResult,     setAbTestResult]     = useState<AbTestResult | null>(null);
  const [isCreatingAb,     setIsCreatingAb]     = useState(false);
  const [abTestError,      setAbTestError]      = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Drawer 열릴 때 Style Intelligence API 호출 ──
  useEffect(() => {
    if (!open) return;
    if (styleData) return;           // 이미 로드됨 → 재호출 불필요
    setIsLoadingStyle(true);
    setStyleError(null);
    fetch(STYLE_API_URL)
      .then(r => r.json())
      .then((data: StyleIntelligence & { source?: string }) => {
        setStyleData(data);
        setIsLoadingStyle(false);
      })
      .catch(err => {
        console.warn("[ThumbnailStudio] Style API 오프라인 — fallback 사용:", err.message);
        setStyleData(FALLBACK_STYLE);
        setStyleError("API 오프라인 — 기본값 사용 중");
        setIsLoadingStyle(false);
      });
  }, [open]);

  // ESC 닫기
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // 테마 또는 styleData 변경 시 프롬프트 + 카피 자동 생성
  useEffect(() => {
    if (!theme.trim()) { setPrompt(""); setCopyOptions([]); setSelectedCopy(""); return; }
    const p    = buildPrompt(theme, styleData);   // styleData null이면 FALLBACK_STYLE 사용
    const opts = buildCopyOptions(theme);
    setPrompt(p);
    setCopyOptions(opts);
    setSelectedCopy(opts[0] ?? "");
    setOutput(null);
  }, [theme, styleData]);

  // 이미지 파일 처리
  const handleFile = useCallback((file: File) => {
    if (!file.type.startsWith("image/")) return;
    const url = URL.createObjectURL(file);
    setImageFile(file);
    setImageUrl(url);
    setOutput(null);
    setAiPosition(null);
    setAiConfidence(null);
    setHeatmapUrl(null);
    setShowHeatmap(false);
    setAbTestResult(null);
    setAbTestError(null);
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  // 프롬프트 복사
  const handleCopyPrompt = () => {
    navigator.clipboard.writeText(prompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  // 썸네일 생성 (Step 1: AI 위치 분석 → Step 2: Pillow 합성)
  const handleGenerate = async () => {
    if (!imageFile || !selectedCopy) return;
    setIsGenerating(true);
    try {
      // ── Step 1: Auto Layout (AI 위치 결정) ──
      let resolvedPosition: string | null = null;

      if (useAiPosition) {
        try {
          const layoutFd = new FormData();
          layoutFd.append("image", imageFile);
          const layoutRes  = await fetch(AUTO_LAYOUT_URL, { method: "POST", body: layoutFd });
          const layoutData = await layoutRes.json();
          if (layoutRes.ok && layoutData.best_position) {
            resolvedPosition = layoutData.best_position;
            setAiPosition(layoutData.best_position);
            setAiConfidence(layoutData.confidence ?? null);
            if (layoutData.heatmap_url) {
              setHeatmapUrl(`${API_BASE}${layoutData.heatmap_url}`);
            }
            console.log(`[ThumbnailStudio] AI 위치: ${layoutData.best_position} (신뢰도 ${(layoutData.confidence * 100).toFixed(0)}%)`);
          }
        } catch (layoutErr) {
          console.warn("[ThumbnailStudio] Auto Layout 실패 — 템플릿 기본 위치 사용:", layoutErr);
        }
      }

      // ── Step 2: Pillow 합성 ──
      const fd = new FormData();
      fd.append("image",    imageFile);
      fd.append("text",     selectedCopy);
      fd.append("template", selectedTemplate);
      if (resolvedPosition) fd.append("position", resolvedPosition);

      const res  = await fetch(GEN_API_URL, { method: "POST", body: fd });
      const data = await res.json();

      if (!res.ok || data.error) throw new Error(data.error ?? `HTTP ${res.status}`);
      setOutput(`${API_BASE}${data.thumbnail_url}`);

    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[ThumbnailStudio] 생성 실패:", msg);
      alert(`썸네일 생성 실패: ${msg}`);
    } finally {
      setIsGenerating(false);
    }
  };

  // 다운로드
  const handleDownload = async () => {
    if (!output) return;
    try {
      const res  = await fetch(output);
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = url;
      a.download = `thumbnail_${selectedCopy.replace(/\s+/g, "_").toLowerCase()}.jpg`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("[ThumbnailStudio] 다운로드 실패:", e);
    }
  };

  // A/B 테스트 생성
  const handleCreateAbTest = async () => {
    if (!imageFile || !theme.trim()) return;
    setIsCreatingAb(true);
    setAbTestError(null);
    setAbTestResult(null);
    try {
      const fd = new FormData();
      fd.append("image", imageFile);
      fd.append("theme", theme);
      if (selectedCopy) fd.append("text_a", selectedCopy);

      const res  = await fetch(AB_TEST_URL, { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error ?? `HTTP ${res.status}`);
      setAbTestResult(data as AbTestResult);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[ThumbnailStudio] A/B Test 실패:", msg);
      setAbTestError(msg);
    } finally {
      setIsCreatingAb(false);
    }
  };

  // Drawer 닫힐 때 object URL 해제 + imageFile 초기화
  useEffect(() => {
    if (!open) {
      if (imageUrl) URL.revokeObjectURL(imageUrl);
      setImageFile(null);
    }
  }, [open]);

  // ── 공통 스타일 ──
  const sectionStyle = {
    display:       "flex",
    flexDirection: "column" as const,
    gap:           T.spacing.sm,
  };

  return (
    <>
      {/* ── Backdrop ── */}
      <div
        onClick={onClose}
        style={{
          position:      "fixed",
          inset:         0,
          background:    T.component.surface.scrim,
          zIndex:        40,
          opacity:       open ? 1 : 0,
          pointerEvents: open ? "auto" : "none",
          transition:    "opacity 0.25s ease",
        }}
      />

      {/* ── Drawer Panel ── */}
      <div style={{
        position:      "fixed",
        top:           0,
        right:         0,
        bottom:        0,
        width:         480,
        background:    T.bgCard,
        borderLeft:    `1px solid ${T.border}`,
        boxShadow:     T.component.shadow.drawer,
        zIndex:        50,
        display:       "flex",
        flexDirection: "column",
        transform:     open ? "translateX(0)" : "translateX(100%)",
        transition:    "transform 0.3s cubic-bezier(0.4,0,0.2,1)",
      }}>

        {/* ── DrawerHeader ── */}
        <div style={{
          display:         "flex",
          alignItems:      "center",
          justifyContent:  "space-between",
          padding:         `${T.spacing.lg}px ${T.spacing.xl}px`,
          borderBottom:    `1px solid ${T.border}`,
          background:      T.bgSection,
          flexShrink:      0,
        }}>
          <div>
            <div style={{
              fontSize:      T.font.size.xs,
              fontFamily:    T.font.familyMono,
              color:         T.muted,
              letterSpacing: "0.08em",
              marginBottom:  3,
            }}>
              PHASE 2
            </div>
            <div style={{
              fontSize:   T.font.size.lg,
              fontWeight: T.font.weight.bold,
              color:      T.text,
            }}>
              Thumbnail Studio
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              width:          32, height:        32,
              display:        "flex", alignItems: "center", justifyContent: "center",
              background:     "transparent",
              border:         `1px solid ${T.border}`,
              borderRadius:   T.radius.btn,
              cursor:         "pointer",
              color:          T.sub,
            }}
          >
            <X size={14} />
          </button>
        </div>

        {/* ── Scrollable Body ── */}
        <div style={{
          flex:          1,
          overflowY:     "auto",
          padding:       T.spacing.xl,
          display:       "flex",
          flexDirection: "column",
          gap:           T.spacing.xl,
        }}>

          {/* ── 1. ContentThemeInput ── */}
          <section style={sectionStyle}>
            <SectionLabel Icon={Type} label="CONTENT THEME" color={T.primary} />
            <input
              type="text"
              placeholder="예: Samurai Battle, Dark Assassin, Royal Procession"
              value={theme}
              onChange={e => setTheme(e.target.value)}
              style={{
                width:        "100%",
                padding:      `${T.spacing.md}px ${T.spacing.lg}px`,
                background:   T.bgSection,
                border:       `1px solid ${theme ? T.primaryBorder : T.border}`,
                borderRadius: T.radius.input,
                fontSize:     T.font.size.sm,
                fontFamily:   T.font.familyBase,
                color:        T.text,
                outline:      "none",
                boxSizing:    "border-box",
                transition:   "border-color 0.2s",
              }}
            />
          </section>

          {/* ── 2. StyleIntelligenceSection ── */}
          <section style={sectionStyle}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: T.spacing.md }}>
              <SectionLabel Icon={Palette} label="STYLE INTELLIGENCE" color={T.warn} />
              <div style={{ display: "flex", alignItems: "center", gap: T.spacing.sm }}>
                {isLoadingStyle && (
                  <span style={{ fontSize: T.font.size.xs, color: T.muted, fontFamily: T.font.familyMono }}>
                    로드 중...
                  </span>
                )}
                {!isLoadingStyle && styleData && (
                  <button
                    onClick={() => {
                      setStyleData(null);
                      setStyleError(null);
                      fetch(STYLE_API_URL + "?refresh=true")
                        .then(r => r.json()).then(setStyleData)
                        .catch(() => setStyleData(FALLBACK_STYLE));
                    }}
                    style={{
                      padding:      `2px ${T.spacing.sm}px`,
                      background:   "transparent",
                      border:       `1px solid ${T.border}`,
                      borderRadius: T.radius.btn,
                      cursor:       "pointer",
                      fontSize:     T.font.size.xxs,
                      color:        T.muted,
                      fontFamily:   T.font.familyMono,
                    }}
                  >
                    ↻ 새로고침
                  </button>
                )}
              </div>
            </div>

            {/* 로딩 스켈레톤 */}
            {isLoadingStyle && (
              <div style={{
                padding:      `${T.spacing.md}px ${T.spacing.lg}px`,
                background:   T.warnBg,
                border:       `1px solid ${T.component.palette.goldBorder}`,
                borderRadius: T.radius.btn,
                display:      "flex",
                flexDirection: "column",
                gap:           T.spacing.sm,
              }}>
                {[80, 120, 100].map((w, i) => (
                  <div key={i} style={{
                    height:       14,
                    width:        `${w}px`,
                    background:   T.component.palette.goldBorder,
                    borderRadius: T.radius.badge,
                    opacity:      0.6,
                  }} />
                ))}
              </div>
            )}

            {/* 에러 표시 */}
            {!isLoadingStyle && styleError && (
              <div style={{
                padding:      `${T.spacing.sm}px ${T.spacing.md}px`,
                background:   T.warnBg,
                border:       `1px solid ${T.warn}30`,
                borderRadius: T.radius.btn,
                fontSize:     T.font.size.xs,
                color:        T.warn,
                fontFamily:   T.font.familyMono,
                marginBottom: T.spacing.sm,
              }}>
                ⚠ {styleError}
              </div>
            )}

            {/* 실제 데이터 */}
            {!isLoadingStyle && styleData && (
              <div style={{
                padding:      `${T.spacing.md}px ${T.spacing.lg}px`,
                background:   T.warnBg,
                border:       `1px solid ${T.component.palette.goldBorder}`,
                borderRadius: T.radius.btn,
              }}>
                <div style={{
                  fontSize:      T.font.size.xs,
                  fontFamily:    T.font.familyMono,
                  color:         T.component.palette.goldText,
                  letterSpacing: "0.06em",
                  marginBottom:  T.spacing.sm,
                }}>
                  BEST STYLE
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: T.spacing.sm }}>
                  {styleData.best_style.map(tag => (
                    <span key={tag} style={{
                      padding:      `3px ${T.spacing.sm}px`,
                      background:   T.warn,
                      color:        T.semantic.text.inverse,
                      borderRadius: T.radius.pill,
                      fontSize:     T.font.size.xs,
                      fontFamily:   T.font.familyMono,
                      fontWeight:   T.font.weight.semibold,
                    }}>
                      {tag.replace(/_/g, " ")}
                    </span>
                  ))}
                </div>
                <div style={{ height: 1, background: T.component.palette.goldBorder, margin: `${T.spacing.sm}px 0` }} />
                <div style={{
                  fontSize:      T.font.size.xs,
                  fontFamily:    T.font.familyMono,
                  color:         T.component.palette.goldText,
                  letterSpacing: "0.06em",
                  marginBottom:  T.spacing.xs,
                }}>
                  추천 스타일
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: T.spacing.xs }}>
                  {styleData.recommended_prompt_keywords.map(kw => (
                    <span key={kw} style={{
                      padding:      `2px ${T.spacing.sm}px`,
                      background:   T.component.palette.goldTint,
                      border:       `1px solid ${T.component.palette.goldBorder}`,
                      color:        T.component.palette.goldText,
                      borderRadius: T.radius.badge,
                      fontSize:     T.font.size.xxs,
                      fontFamily:   T.font.familyMono,
                    }}>
                      {kw}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </section>

          {/* ── 3. PromptGeneratorSection ── */}
          <section style={sectionStyle}>
            <SectionLabel Icon={Wand2} label="MIDJOURNEY PROMPT" color={T.primary} />
            {prompt ? (
              <>
                <div style={{
                  padding:      `${T.spacing.md}px ${T.spacing.lg}px`,
                  background:   T.terminal,
                  borderRadius: T.radius.btn,
                  fontSize:     T.font.size.xs,
                  fontFamily:   T.font.familyMono,
                  color:        T.semantic.text.inverse,
                  lineHeight:   1.6,
                  wordBreak:    "break-all",
                }}>
                  {prompt}
                </div>
                <div style={{ display: "flex", gap: T.spacing.sm }}>
                  <button
                    onClick={handleCopyPrompt}
                    style={{
                      flex:         1,
                      display:      "flex", alignItems: "center", justifyContent: "center",
                      gap:          T.spacing.sm,
                      padding:      `${T.spacing.sm}px`,
                      background:   copied ? T.successBg : T.primarySoft,
                      border:       `1px solid ${copied ? T.successBorder : T.primaryBorder}`,
                      borderRadius: T.radius.btn,
                      cursor:       "pointer",
                      fontSize:     T.font.size.xs,
                      fontFamily:   T.font.familyBase,
                      fontWeight:   T.font.weight.semibold,
                      color:        copied ? T.success : T.primary,
                      transition:   "all 0.2s",
                    }}
                  >
                    <Copy size={11} />
                    {copied ? "복사됨!" : "Copy Prompt"}
                  </button>
                  <button
                    onClick={() => window.open("https://www.midjourney.com", "_blank")}
                    style={{
                      flex:         1,
                      display:      "flex", alignItems: "center", justifyContent: "center",
                      gap:          T.spacing.sm,
                      padding:      `${T.spacing.sm}px`,
                      background:   T.bgSection,
                      border:       `1px solid ${T.border}`,
                      borderRadius: T.radius.btn,
                      cursor:       "pointer",
                      fontSize:     T.font.size.xs,
                      fontFamily:   T.font.familyBase,
                      fontWeight:   T.font.weight.semibold,
                      color:        T.sub,
                    }}
                  >
                    <ExternalLink size={11} />
                    Open Midjourney
                  </button>
                </div>
              </>
            ) : (
              <div style={{
                padding:      `${T.spacing.md}px`,
                background:   T.bgSection,
                borderRadius: T.radius.btn,
                fontSize:     T.font.size.xs,
                color:        T.muted,
                fontFamily:   T.font.familyMono,
                textAlign:    "center",
              }}>
                테마를 입력하면 프롬프트가 생성됩니다
              </div>
            )}
          </section>

          {/* ── 4. CopyGeneratorSection ── */}
          <section style={sectionStyle}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: T.spacing.md }}>
              <SectionLabel Icon={Type} label="RECOMMENDED COPY" />
              {copyOptions.length > 0 && (
                <button
                  onClick={() => {
                    const opts = buildCopyOptions(theme);
                    setCopyOptions([...opts.slice(1), opts[0]]);
                    setSelectedCopy(opts[1] ?? opts[0]);
                  }}
                  style={{
                    display:      "flex", alignItems: "center", gap: 4,
                    padding:      `3px ${T.spacing.sm}px`,
                    background:   "transparent",
                    border:       `1px solid ${T.border}`,
                    borderRadius: T.radius.btn,
                    cursor:       "pointer",
                    fontSize:     T.font.size.xs,
                    color:        T.sub,
                  }}
                >
                  <RotateCcw size={10} />
                  Regenerate
                </button>
              )}
            </div>
            {copyOptions.length > 0 ? (
              <div style={{ display: "flex", flexWrap: "wrap", gap: T.spacing.sm }}>
                {copyOptions.map(opt => (
                  <button
                    key={opt}
                    onClick={() => { setSelectedCopy(opt); setOutput(null); }}
                    style={{
                      padding:      `${T.spacing.sm}px ${T.spacing.md}px`,
                      background:   selectedCopy === opt ? T.primary : T.bgSection,
                      border:       `1px solid ${selectedCopy === opt ? T.primary : T.border}`,
                      borderRadius: T.radius.btn,
                      cursor:       "pointer",
                      fontSize:     T.font.size.xs,
                      fontFamily:   T.font.familyMono,
                      fontWeight:   T.font.weight.bold,
                      color:        selectedCopy === opt ? T.semantic.text.inverse : T.text,
                      letterSpacing: "0.05em",
                      transition:   "all 0.15s",
                    }}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            ) : (
              <div style={{
                padding:      `${T.spacing.md}px`,
                background:   T.bgSection,
                borderRadius: T.radius.btn,
                fontSize:     T.font.size.xs,
                color:        T.muted,
                fontFamily:   T.font.familyMono,
                textAlign:    "center",
              }}>
                테마를 입력하면 카피 옵션이 생성됩니다
              </div>
            )}
          </section>

          {/* ── 5. ImageUploadSection ── */}
          <section style={sectionStyle}>
            <SectionLabel Icon={Upload} label="BACKGROUND IMAGE" />
            <div
              onDragEnter={e => { e.preventDefault(); setIsDragging(true); }}
              onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={onDrop}
              onClick={() => fileInputRef.current?.click()}
              style={{
                padding:      `${T.spacing.xl}px`,
                background:   isDragging ? T.primarySoft : T.bgSection,
                border:       `2px dashed ${isDragging ? T.primary : imageUrl ? T.successBorder : T.border}`,
                borderRadius: T.radius.btn,
                cursor:       "pointer",
                textAlign:    "center",
                transition:   "all 0.2s",
              }}
            >
              {imageUrl ? (
                <div>
                  <img
                    src={imageUrl}
                    alt="업로드된 이미지"
                    style={{
                      width:        "100%",
                      height:       160,
                      objectFit:    "cover",
                      borderRadius: T.radius.btn,
                      marginBottom: T.spacing.sm,
                    }}
                  />
                  <div style={{ fontSize: T.font.size.xs, color: T.success, fontFamily: T.font.familyMono }}>
                    ✓ 이미지 업로드 완료 · 클릭하여 교체
                  </div>
                </div>
              ) : (
                <>
                  <Upload size={24} color={T.muted} style={{ marginBottom: T.spacing.md }} />
                  <div style={{ fontSize: T.font.size.sm, color: T.sub, marginBottom: T.spacing.xs }}>
                    Drop Midjourney Image Here
                  </div>
                  <div style={{ fontSize: T.font.size.xs, color: T.muted }}>
                    또는 클릭하여 파일 선택 · JPG, PNG
                  </div>
                </>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={onFileChange}
                style={{ display: "none" }}
              />
            </div>
          </section>

          {/* ── 6. TemplateSelector + AI Position ── */}
          <section style={sectionStyle}>
            <SectionLabel Icon={Layout} label="TEMPLATE" />
            <div style={{ display: "flex", flexDirection: "column", gap: T.spacing.xs }}>
              {TEMPLATE_OPTIONS.map(tmpl => {
                const isSelected = selectedTemplate === tmpl.value;
                return (
                  <button
                    key={tmpl.value}
                    onClick={() => { setSelectedTemplate(tmpl.value); setOutput(null); }}
                    style={{
                      display:        "flex",
                      alignItems:     "center",
                      justifyContent: "space-between",
                      padding:        `${T.spacing.sm}px ${T.spacing.md}px`,
                      background:     isSelected ? T.primarySoft : T.bgSection,
                      border:         `1px solid ${isSelected ? T.primaryBorder : T.border}`,
                      borderRadius:   T.radius.btn,
                      cursor:         "pointer",
                      transition:     "all 0.15s",
                      textAlign:      "left",
                    }}
                  >
                    <span style={{
                      fontSize:   T.font.size.sm,
                      fontFamily: T.font.familyMono,
                      fontWeight: T.font.weight.semibold,
                      color:      isSelected ? T.primary : T.text,
                    }}>
                      {tmpl.label}
                    </span>
                    <span style={{
                      fontSize:   T.font.size.xs,
                      fontFamily: T.font.familyMono,
                      color:      isSelected ? T.primary : T.muted,
                    }}>
                      {tmpl.desc}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* ── AI Text Position Toggle ── */}
            <div style={{
              marginTop:    T.spacing.md,
              padding:      `${T.spacing.md}px`,
              background:   T.bgSection,
              border:       `1px solid ${T.border}`,
              borderRadius: T.radius.btn,
            }}>
              <div style={{
                fontSize:     T.font.size.xs,
                fontFamily:   T.font.familyMono,
                color:        T.muted,
                letterSpacing:"0.06em",
                marginBottom: T.spacing.sm,
              }}>
                TEXT POSITION
              </div>

              {/* AI / 수동 토글 버튼 */}
              <div style={{ display: "flex", gap: T.spacing.xs }}>
                <button
                  onClick={() => setUseAiPosition(true)}
                  style={{
                    flex:         1,
                    padding:      `${T.spacing.sm}px`,
                    background:   useAiPosition ? T.primarySoft : T.bgSection,
                    border:       `1px solid ${useAiPosition ? T.primaryBorder : T.border}`,
                    borderRadius: T.radius.btn,
                    cursor:       "pointer",
                    fontSize:     T.font.size.xs,
                    fontFamily:   T.font.familyMono,
                    fontWeight:   T.font.weight.semibold,
                    color:        useAiPosition ? T.primary : T.sub,
                    transition:   "all 0.15s",
                  }}
                >
                  AI 추천 위치
                </button>
                <button
                  onClick={() => setUseAiPosition(false)}
                  style={{
                    flex:         1,
                    padding:      `${T.spacing.sm}px`,
                    background:   !useAiPosition ? `${T.component.palette.ai}10` : T.bgSection,
                    border:       `1px solid ${!useAiPosition ? T.component.palette.ai : T.border}`,
                    borderRadius: T.radius.btn,
                    cursor:       "pointer",
                    fontSize:     T.font.size.xs,
                    fontFamily:   T.font.familyMono,
                    fontWeight:   T.font.weight.semibold,
                    color:        !useAiPosition ? T.component.palette.ai : T.sub,
                    transition:   "all 0.15s",
                  }}
                >
                  수동 위치
                </button>
              </div>

              {/* AI 결과 표시 (생성 후) */}
              {useAiPosition && aiPosition && (
                <div style={{
                  marginTop:    T.spacing.sm,
                  display:      "flex",
                  alignItems:   "center",
                  gap:          T.spacing.sm,
                }}>
                  <span style={{
                    padding:      `2px ${T.spacing.sm}px`,
                    background:   T.successBg,
                    border:       `1px solid ${T.successBorder}`,
                    borderRadius: T.radius.pill,
                    fontSize:     T.font.size.xs,
                    fontFamily:   T.font.familyMono,
                    fontWeight:   T.font.weight.semibold,
                    color:        T.success,
                  }}>
                    {POSITION_LABELS[aiPosition] ?? aiPosition} (AI)
                  </span>
                  {aiConfidence !== null && (
                    <span style={{
                      fontSize:   T.font.size.xs,
                      fontFamily: T.font.familyMono,
                      color:      T.muted,
                    }}>
                      신뢰도 {(aiConfidence * 100).toFixed(0)}%
                    </span>
                  )}
                </div>
              )}

              {/* 수동 위치 선택 (3x3 그리드) */}
              {!useAiPosition && (
                <div style={{
                  marginTop:           T.spacing.sm,
                  display:             "grid",
                  gridTemplateColumns: "1fr 1fr 1fr",
                  gap:                 T.spacing.xs,
                }}>
                  {(Object.keys(POSITION_LABELS) as string[]).map(pos => {
                    const isSel = aiPosition === pos || (!aiPosition && pos === "bottom_center");
                    return (
                      <button
                        key={pos}
                        onClick={() => { setAiPosition(pos); setOutput(null); }}
                        style={{
                          padding:      `${T.spacing.xs}px`,
                          background:   aiPosition === pos ? T.primarySoft : T.bgSection,
                          border:       `1px solid ${aiPosition === pos ? T.primaryBorder : T.border}`,
                          borderRadius: T.radius.badge,
                          cursor:       "pointer",
                          fontSize:     T.font.size.xxs,
                          fontFamily:   T.font.familyMono,
                          color:        aiPosition === pos ? T.primary : T.sub,
                          transition:   "all 0.15s",
                          lineHeight:   1.3,
                        }}
                      >
                        {POSITION_LABELS[pos]}
                      </button>
                    );
                  })}
                </div>
              )}

              {useAiPosition && !aiPosition && (
                <div style={{
                  marginTop:  T.spacing.sm,
                  fontSize:   T.font.size.xs,
                  color:      T.muted,
                  fontFamily: T.font.familyMono,
                }}>
                  Generate 시 이미지 분석 후 자동 결정
                </div>
              )}
            </div>
          </section>

          {/* ── 7. ThumbnailPreview ── */}
          {(imageUrl || output) && (
            <section style={sectionStyle}>
              {/* 헤더: PREVIEW + Attention Map 토글 */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: T.spacing.md }}>
                <SectionLabel Icon={Eye} label="PREVIEW" color={T.success} />
                {heatmapUrl && (
                  <button
                    onClick={() => setShowHeatmap(v => !v)}
                    style={{
                      display:      "flex",
                      alignItems:   "center",
                      gap:          T.spacing.xs,
                      padding:      `3px ${T.spacing.sm}px`,
                      background:   showHeatmap ? T.dangerBg : T.bgSection,
                      border:       `1px solid ${showHeatmap ? T.borderColor.danger : T.border}`,
                      borderRadius: T.radius.pill,
                      cursor:       "pointer",
                      fontSize:     T.font.size.xxs,
                      fontFamily:   T.font.familyMono,
                      fontWeight:   T.font.weight.semibold,
                      color:        showHeatmap ? T.danger : T.muted,
                      transition:   "all 0.15s",
                    }}
                  >
                    <span style={{
                      width: 8, height: 8,
                      borderRadius: "50%",
                      background: showHeatmap ? T.danger : T.muted,
                      flexShrink: 0,
                    }} />
                    Attention Map
                  </button>
                )}
              </div>

              {/* 이미지 + 오버레이 */}
              <div style={{ position: "relative", borderRadius: T.radius.btn, overflow: "hidden" }}>
                <img
                  src={output ?? imageUrl ?? ""}
                  alt="썸네일 미리보기"
                  style={{ width: "100%", display: "block", borderRadius: T.radius.btn }}
                />

                {/* Attention Heatmap Overlay */}
                {showHeatmap && heatmapUrl && (
                  <img
                    src={heatmapUrl}
                    alt="Attention Heatmap"
                    style={{
                      position:     "absolute",
                      inset:        0,
                      width:        "100%",
                      height:       "100%",
                      objectFit:    "cover",
                      opacity:      0.52,
                      mixBlendMode: "hard-light",
                      pointerEvents:"none",
                    }}
                  />
                )}

                {/* 생성 완료 뱃지 */}
                {output && !showHeatmap && (
                  <div style={{
                    position:     "absolute",
                    top:          T.spacing.sm,
                    right:        T.spacing.sm,
                    padding:      `3px ${T.spacing.sm}px`,
                    background:   T.success,
                    color:        T.semantic.text.inverse,
                    borderRadius: T.radius.pill,
                    fontSize:     T.font.size.xs,
                    fontFamily:   T.font.familyMono,
                  }}>
                    ✓ 생성 완료
                  </div>
                )}

                {/* Heatmap 범례 */}
                {showHeatmap && (
                  <div style={{
                    position:     "absolute",
                    bottom:       T.spacing.sm,
                    left:         T.spacing.sm,
                    display:      "flex",
                    alignItems:   "center",
                    gap:          T.spacing.xs,
                    padding:      `3px ${T.spacing.sm}px`,
                    background:   T.component.surface.modalScrim,
                    borderRadius: T.radius.pill,
                    fontSize:     T.font.size.xxs,
                    fontFamily:   T.font.familyMono,
                    color:        T.semantic.text.inverse,
                  }}>
                    <span style={{ color: T.primary }}>■</span> 낮음
                    <span style={{ color: T.success }}>■</span> 중간
                    <span style={{ color: T.danger }}>■</span> 높음 (회피)
                  </div>
                )}

                {/* 생성 전 카피 미리보기 */}
                {!output && selectedCopy && (
                  <div style={{
                    position:      "absolute",
                    bottom:        16,
                    left:          "50%",
                    transform:     "translateX(-50%)",
                    fontSize:      T.font.size.xl,
                    fontFamily:    '"Bebas Neue", Arial Black, sans-serif',
                    fontWeight:    "bold",
                    color:         T.semantic.text.inverse,
                    textShadow:    T.component.shadow.textOutlineStrong,
                    pointerEvents: "none",
                    whiteSpace:    "nowrap",
                    opacity:       0.75,
                  }}>
                    {selectedCopy}
                  </div>
                )}
              </div>

              {!output && (
                <div style={{
                  fontSize:   T.font.size.xs,
                  color:      T.muted,
                  fontFamily: T.font.familyMono,
                  textAlign:  "center",
                }}>
                  미리보기 · Generate 버튼으로 최종 합성
                </div>
              )}
            </section>
          )}

          {/* ── 8. GenerateActions ── */}
          <section>
            <div style={{ height: 1, background: T.borderSoft, marginBottom: T.spacing.lg }} />
            <div style={{ display: "flex", flexDirection: "column", gap: T.spacing.md }}>
              <button
                onClick={handleGenerate}
                disabled={!imageFile || !selectedCopy || isGenerating}
                style={{
                  display:        "flex",
                  alignItems:     "center",
                  justifyContent: "center",
                  gap:            T.spacing.sm,
                  padding:        `${T.spacing.md}px`,
                  background:     (!imageFile || !selectedCopy) ? T.bgSection : T.primary,
                  border:         `1px solid ${(!imageFile || !selectedCopy) ? T.border : T.primary}`,
                  borderRadius:   T.radius.btn,
                  cursor:         (!imageFile || !selectedCopy) ? "not-allowed" : "pointer",
                  fontSize:       T.font.size.sm,
                  fontFamily:     T.font.familyBase,
                  fontWeight:     T.font.weight.semibold,
                  color:          (!imageFile || !selectedCopy) ? T.muted : T.semantic.text.inverse,
                  opacity:        isGenerating ? 0.7 : 1,
                  transition:     "all 0.2s",
                }}
              >
                <Wand2 size={14} />
                {isGenerating
                  ? (useAiPosition ? "AI 분석 중..." : "서버 합성 중...")
                  : "Generate Thumbnail"
                }
              </button>

              {output && (
                <button
                  onClick={handleDownload}
                  style={{
                    display:        "flex",
                    alignItems:     "center",
                    justifyContent: "center",
                    gap:            T.spacing.sm,
                    padding:        `${T.spacing.md}px`,
                    background:     T.successBg,
                    border:         `1px solid ${T.successBorder}`,
                    borderRadius:   T.radius.btn,
                    cursor:         "pointer",
                    fontSize:       T.font.size.sm,
                    fontFamily:     T.font.familyBase,
                    fontWeight:     T.font.weight.semibold,
                    color:          T.success,
                  }}
                >
                  <Download size={14} />
                  Save Thumbnail
                </button>
              )}

              {(!imageFile || !selectedCopy) && (
                <div style={{
                  fontSize:   T.font.size.xs,
                  color:      T.muted,
                  textAlign:  "center",
                  fontFamily: T.font.familyMono,
                }}>
                  {!theme && "테마 입력 → "}
                  {theme && !imageFile && "Midjourney 이미지 업로드 → "}
                  {imageFile && !selectedCopy && "카피 선택 → "}
                  Generate
                </div>
              )}
            </div>
          </section>

          {/* ── 9. A/B Test ── */}
          <section style={sectionStyle}>
            <div style={{ height: 1, background: T.borderSoft, marginBottom: T.spacing.lg }} />
            <SectionLabel Icon={BarChart2} label="A/B TEST" color={T.component.palette.ai} />

            {/* Create 버튼 */}
            <button
              onClick={handleCreateAbTest}
              disabled={!imageFile || !theme.trim() || isCreatingAb}
              style={{
                display:        "flex",
                alignItems:     "center",
                justifyContent: "center",
                gap:            T.spacing.sm,
                padding:        `${T.spacing.md}px`,
                background:     (!imageFile || !theme.trim()) ? T.bgSection : `${T.component.palette.ai}10`,
                border:         `1px solid ${(!imageFile || !theme.trim()) ? T.border : T.component.palette.ai}`,
                borderRadius:   T.radius.btn,
                cursor:         (!imageFile || !theme.trim()) ? "not-allowed" : "pointer",
                fontSize:       T.font.size.sm,
                fontFamily:     T.font.familyBase,
                fontWeight:     T.font.weight.semibold,
                color:          (!imageFile || !theme.trim()) ? T.muted : T.component.palette.ai,
                opacity:        isCreatingAb ? 0.7 : 1,
                transition:     "all 0.2s",
              }}
            >
              <BarChart2 size={14} />
              {isCreatingAb ? "A/B 썸네일 생성 중..." : "Create A/B Test"}
            </button>

            {(!imageFile || !theme.trim()) && (
              <div style={{ fontSize: T.font.size.xs, color: T.muted, textAlign: "center", fontFamily: T.font.familyMono }}>
                {!theme.trim() && "테마 입력 → "}
                {theme.trim() && !imageFile && "이미지 업로드 → "}
                Create A/B Test
              </div>
            )}

            {/* 에러 */}
            {abTestError && (
              <div style={{
                padding:      `${T.spacing.sm}px ${T.spacing.md}px`,
                background:   T.dangerBg,
                border:       `1px solid ${T.danger}30`,
                borderRadius: T.radius.btn,
                fontSize:     T.font.size.xs,
                color:        T.danger,
                fontFamily:   T.font.familyMono,
              }}>
                ✕ {abTestError}
              </div>
            )}

            {/* A/B 결과 */}
            {abTestResult && (() => {
              const { variant_a: va, variant_b: vb, winner } = abTestResult;
              const maxCtr = Math.max(va.estimated_ctr, vb.estimated_ctr, 0.01);

              const VariantCard = ({ id, v }: { id: "A" | "B"; v: AbVariant }) => {
                const isWinner = winner === id;
                const hasCtr   = v.estimated_ctr > 0;
                return (
                  <div style={{
                    flex:         1,
                    display:      "flex",
                    flexDirection:"column",
                    gap:          T.spacing.sm,
                    padding:      `${T.spacing.md}px`,
                    background:   isWinner ? `${T.component.palette.ai}10` : T.bgSection,
                    border:       `1px solid ${isWinner ? T.component.palette.ai : T.border}`,
                    borderRadius: T.radius.btn,
                  }}>
                    {/* 헤더 */}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span style={{
                        fontSize:   T.font.size.xs,
                        fontFamily: T.font.familyMono,
                        fontWeight: T.font.weight.bold,
                        color:      isWinner ? T.component.palette.ai : T.text,
                      }}>
                        Variant {id}
                      </span>
                      {isWinner && (
                        <span style={{
                          display:      "flex",
                          alignItems:   "center",
                          gap:          3,
                          padding:      `2px 6px`,
                          background:   T.component.palette.ai,
                          color:        T.semantic.text.inverse,
                          borderRadius: T.radius.pill,
                          fontSize:     T.font.size.xxs,
                          fontFamily:   T.font.familyMono,
                        }}>
                          <Trophy size={9} /> WINNER
                        </span>
                      )}
                    </div>

                    {/* 썸네일 이미지 */}
                    {v.thumbnail_url ? (
                      <img
                        src={`${API_BASE}${v.thumbnail_url}`}
                        alt={`Variant ${id}`}
                        style={{
                          width:        "100%",
                          borderRadius: T.radius.badge,
                          display:      "block",
                        }}
                      />
                    ) : (
                      <div style={{
                        height:       80,
                        background:   T.border,
                        borderRadius: T.radius.badge,
                        display:      "flex",
                        alignItems:   "center",
                        justifyContent: "center",
                        fontSize:     T.font.size.xs,
                        color:        T.muted,
                      }}>
                        생성 실패
                      </div>
                    )}

                    {/* 메타 */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                      <div style={{ fontSize: T.font.size.xxs, color: T.muted, fontFamily: T.font.familyMono }}>
                        <span style={{ color: T.sub }}>{v.template}</span>
                        {" · "}{v.style.replace(/_/g, " ")}
                      </div>
                      <div style={{ fontSize: T.font.size.xxs, color: T.sub, fontFamily: T.font.familyMono }}>
                        "{v.text}"
                      </div>
                    </div>

                    {/* CTR 바 */}
                    {hasCtr ? (
                      <div>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                          <span style={{ fontSize: T.font.size.xxs, color: T.muted, fontFamily: T.font.familyMono }}>
                            Est. CTR
                          </span>
                          <span style={{
                            fontSize:   T.font.size.xxs,
                            fontFamily: T.font.familyMono,
                            fontWeight: T.font.weight.bold,
                            color:      isWinner ? T.component.palette.ai : T.sub,
                          }}>
                            {v.estimated_ctr.toFixed(1)}%
                          </span>
                        </div>
                        <div style={{
                          height:       5,
                          background:   T.border,
                          borderRadius: T.radius.pill,
                          overflow:     "hidden",
                        }}>
                          <div style={{
                            height:           "100%",
                            width:            `${(v.estimated_ctr / maxCtr) * 100}%`,
                            background:       isWinner ? T.component.palette.ai : T.sub,
                            borderRadius:     T.radius.pill,
                            transition:       "width 0.4s ease",
                          }} />
                        </div>
                      </div>
                    ) : (
                      <div style={{ fontSize: T.font.size.xxs, color: T.muted, fontFamily: T.font.familyMono }}>
                        CTR 데이터 없음 (스타일 분석 필요)
                      </div>
                    )}
                  </div>
                );
              };

              return (
                <div style={{ display: "flex", flexDirection: "column", gap: T.spacing.md }}>
                  {/* 승자 배너 */}
                  {winner && (
                    <div style={{
                      display:        "flex",
                      alignItems:     "center",
                      justifyContent: "center",
                      gap:            T.spacing.sm,
                      padding:        `${T.spacing.sm}px`,
                      background:     `${T.component.palette.ai}10`,
                      border:         `1px solid ${T.component.palette.ai}`,
                      borderRadius:   T.radius.btn,
                      fontSize:       T.font.size.xs,
                      fontFamily:     T.font.familyMono,
                      fontWeight:     T.font.weight.bold,
                      color:          T.component.palette.ai,
                    }}>
                      <Trophy size={13} />
                      Winner: Variant {winner}
                      {va.estimated_ctr > 0 && vb.estimated_ctr > 0 && (
                        <span style={{ fontWeight: "normal", color: T.muted }}>
                          {" "}(CTR +{Math.abs(va.estimated_ctr - vb.estimated_ctr).toFixed(1)}% 차이)
                        </span>
                      )}
                    </div>
                  )}

                  {/* A / B 카드 나란히 */}
                  <div style={{ display: "flex", gap: T.spacing.sm }}>
                    <VariantCard id="A" v={va} />
                    <VariantCard id="B" v={vb} />
                  </div>

                  {/* 재생성 버튼 */}
                  <button
                    onClick={handleCreateAbTest}
                    disabled={isCreatingAb}
                    style={{
                      display:        "flex",
                      alignItems:     "center",
                      justifyContent: "center",
                      gap:            T.spacing.sm,
                      padding:        `${T.spacing.sm}px`,
                      background:     "transparent",
                      border:         `1px solid ${T.border}`,
                      borderRadius:   T.radius.btn,
                      cursor:         "pointer",
                      fontSize:       T.font.size.xs,
                      fontFamily:     T.font.familyBase,
                      color:          T.sub,
                    }}
                  >
                    <RotateCcw size={11} />
                    Regenerate A/B Test
                  </button>
                </div>
              );
            })()}
          </section>

        </div>
      </div>
    </>
  );
}
