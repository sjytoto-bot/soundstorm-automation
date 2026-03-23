// ─── SOUNDSTORM Design Tokens v1.0 (하위 호환 유지) ───────────────────────────
// 모든 컴포넌트는 이 파일의 토큰만 사용한다. 하드코딩 금지.

// ─── Layout System ────────────────────────────────────────────────────────────
// 레이아웃 단위 상수 — 모든 리스트/그리드 구조는 이 값을 기준으로 정렬한다.
export const L = {
  iconCol:  40,   // icon/marker 고정 열 너비 (사이드바 아이콘 박스, 리스트 마커)
  badgeCol: 80,   // 텍스트 badge 열 너비 (ActivityLog 이벤트 타입)
  metaCol:  52,   // 날짜/시간 secondary 열 너비
  rowH:     48,   // 표준 행 높이 (touch target 충족)
  rowHsm:   36,   // compact 행 높이
  px:       16,   // 표준 horizontal padding
  pxSm:     10,   // compact horizontal padding
  colGap:   10,   // 열간 gap
};

export const T = {
  // ── 기존 top-level 컬러 키 (하위 호환) ───────────────────────────────────────

  // Primary
  primary:       "#2563EB",
  primarySoft:   "#EFF6FF",
  primaryBorder: "#BFDBFE",

  // Background
  bgApp:     "#F8FAFC",
  bgCard:    "#FFFFFF",
  bgSection: "#F1F5F9",
  bgHover:   "#E8EEF4",

  // ── Background hierarchy (grouped, for dark-mode extensibility) ───────────
  bg: {
    base:    "#FFFFFF",   // card surface
    section: "#F1F5F9",  // inset / inner block
    app:     "#F8FAFC",  // page canvas
    hover:   "#E8EEF4",  // interactive hover
  },

  // Border
  border:     "#E2E8F0",
  borderSoft: "#F1F5F9",

  // Text (flat aliases — 하위 호환)
  text:  "#0F172A",
  sub:   "#64748B",
  muted: "#94A3B8",

  // ── Foreground hierarchy (grouped, T.fg.*) ────────────────────────────────
  // 신규 컴포넌트는 T.fg.* 사용 권장
  fg: {
    primary: "#0F172A",  // = T.text
    sub:     "#64748B",  // = T.sub
    muted:   "#94A3B8",  // = T.muted
  },

  // Semantic
  success:       "#16A34A",
  successBg:     "#F0FDF4",
  successBorder: "#6EE7B7",
  danger:        "#EF4444",
  dangerBg:      "#FEF2F2",
  warn:          "#D97706",
  warnBg:        "#FFFBEB",

  // ── Border Colors (grouped) ────────────────────────────────────────────────
  // base/subtle: 일반 border에 사용 (= T.border / T.borderSoft)
  // semantic: 상태별 border
  borderColor: {
    base:    "#E2E8F0",  // = T.border
    subtle:  "#F1F5F9",  // = T.borderSoft
    danger:  "#FECACA",
    warning: "#FDE68A",
    success: "#6EE7B7",
    primary: "#BFDBFE",
  },

  // Special surfaces
  terminal: "#0D1117",

  // ── Status (상태별 배경 + 텍스트) ─────────────────────────────────────────────
  status: {
    done:    { bg: "#ECFDF5", text: "#059669" },
    active:  { bg: "#EFF6FF", text: "#2563EB" },
    blocked: { bg: "#FFFBEB", text: "#D97706" },
    planned: { bg: "#F1F5F9", text: "#475569" },
  },

  // ── Spacing (8px 단위 시스템) ─────────────────────────────────────────────────
  spacing: {
    xxs: 6,
    xs:  4,
    sm:  8,
    md:  12,
    lg:  16,
    xl:  24,
    xxl: 32,
  },

  // ── Typography (기존 컴포넌트용 + 신규 시스템 토큰 병합) ──────────────────────
  font: {
    // 기존 컴포넌트용
    stage: { size: 20, weight: 800, letterSpacing: "-0.2px" },
    track: { size: 16, weight: 700 },
    goal:  { size: 14, weight: 600 },
    meta:  { size: 12, color: "#64748B" },
    label: { size: 11 },

    // v1.1 시스템 토큰 (TOKENS_SYSTEM.md 스펙)
    familyBase: "'Fira Sans', system-ui, -apple-system, sans-serif",
    familyMono: "monospace",
    mono:       "monospace",   // shorthand alias

    // ── Font Size v1.1 (TOKENS_SYSTEM.md § 5.2) ─────────────────────────────
    // 신규 코드: xs/sm/base/lg/xl/xxl/display 사용
    // 하위 호환 alias: xxs/md/title/hero 유지 (점진적 제거 대상)
    size: {
      // v1.1 표준 키
      xs:      12,  // caption, badge, meta
      sm:      14,  // small body, secondary
      base:    16,  // default body
      lg:      18,  // section heading
      xl:      20,  // KPI value, page title
      xxl:     28,  // large display (선택적)
      display: 40,  // hero numbers

      // deprecated aliases (기존 코드 하위 호환)
      xxs:   10,  // → deprecated (micro, 사용 자제)
      md:    14,  // → deprecated → sm 사용
      title: 20,  // → deprecated → xl 사용
      hero:  40,  // → deprecated → display 사용
    },

    weight: {
      regular:  400,
      medium:   500,
      semibold: 600,
      bold:     700,
      // 800 사용 금지 — T.font.weight.bold 사용
    },

    lineHeight: {
      tight:   1.2,
      normal:  1.5,
      relaxed: 1.7,
    },
  },

  // ── Shadow ────────────────────────────────────────────────────────────────────
  shadow: {
    card:  "0 1px 2px rgba(15,23,42,0.04)",
    hover: "0 4px 12px rgba(15,23,42,0.08)",
  },

  // ── Radius ────────────────────────────────────────────────────────────────────
  radius: {
    card:  16,
    pill:  999,
    btn:   6,
    input: 6,
    badge: 4,
    panel: 0,
  },

  // ── v1.0 Color System (네임스페이스 추가) ─────────────────────────────────────
  color: {
    bgPrimary:   "#F8FAFC",
    bgSecondary: "#FFFFFF",
    bgSection:   "#F1F5F9",
    bgSubtle:    "#E8EEF4",

    textPrimary:   "#0F172A",
    textSecondary: "#64748B",
    textMuted:     "#94A3B8",
    textInverse:   "#FFFFFF",

    border:     "#E2E8F0",
    borderSoft: "#F1F5F9",

    primary:     "#2563EB",
    primarySoft: "#EFF6FF",
    success:     "#16A34A",
    warning:     "#D97706",
    danger:      "#EF4444",
  },

  // ── v1.0 Layout Constants ─────────────────────────────────────────────────────
  layout: {
    topbarHeight:      56,
    sidebarCollapsed:  56,
    sidebarExpanded:   220,
    rightPanelWidth:   340,
    controlPanelWidth: 260,
  },

  // ── Motion (TOKENS_SYSTEM.md § 7) ────────────────────────────────────────────
  // 기본 transition: 0.3s ease
  // 0.15s / 0.25s 사용 금지
  motion: {
    fast:     "0.15s ease",
    base:     "0.3s ease",
    slow:     "0.5s ease",
    duration: "0.3s",
    easing:   "ease",
    default:  "0.3s ease",  // shorthand: transition: T.motion.default
  },
};

// ─── Semantic Tokens ──────────────────────────────────────────────────────────
// 신규 코드 우선순위: component > semantic > primitive(top-level alias)
T.semantic = {
  surface: {
    app:   T.color.bgPrimary,
    card:  T.color.bgSecondary,
    hover: T.bgHover,
    inset: T.color.bgSection,
    raised: "linear-gradient(180deg, #F8FBFF 0%, #F3F7FC 100%)",
    insetTint: "#F7FAFD",
    hoverTint: "#FBFCFE",
    dangerTint: "#FFF8F8",
  },
  text: {
    primary:   T.color.textPrimary,
    secondary: T.color.textSecondary,
    muted:     T.color.textMuted,
    inverse:   T.color.textInverse,
  },
  border: {
    default: T.color.border,
    soft:    T.color.borderSoft,
    strong:  T.color.border,
  },
  action: {
    primary: T.color.primary,
    success: T.color.success,
    warning: T.color.warning,
    danger:  T.color.danger,
  },
};

T.component = {
  size: {
    topbar: 56,
    sidebarCollapsed: 56,
    sidebarExpanded: 220,
    iconButton: 28,
    buttonSm: 32,
    rowCompact: 36,
    rail: 3,
    dotSm: 6,
    dotMd: 8,
    progressSm: 4,
  },
  radius: {
    control: 10,
    cardLg: 24,
    cardMd: 22,
    inset: 18,
    section: 28,
    rail: 2,
  },
  surface: {
    softOverlay: "rgba(255,255,255,0.75)",
    strongOverlay: "rgba(255,255,255,0.82)",
    scrim: "rgba(0,0,0,0.4)",
    modalScrim: "rgba(0,0,0,0.65)",
  },
  shadow: {
    panelHover: "0 8px 24px rgba(15,23,42,0.06)",
    drawer: "-4px 0 32px rgba(0,0,0,0.14)",
    modal: "0 24px 64px rgba(0,0,0,0.5)",
    textOutlineStrong: "3px 3px 0 #000, -3px -3px 0 #000, 3px -3px 0 #000, -3px 3px 0 #000",
  },
  palette: {
    ai: "#8B5CF6",
    social: "#EC4899",
    messenger: "#06B6D4",
    community: "#F97316",
    tool: "#6366F1",
    media: "#D97706",
    divider: "#D1D5DB",
    goldTint: "#FEF3C7",
    goldBorder: "#FDE68A",
    goldText: "#92400E",
  },
};

// ─── State / Interaction Tokens ──────────────────────────────────────────────
T.state = {
  hoverOpacity:    0.08,
  activeOpacity:   0.16,
  disabledOpacity: 0.4,
};

T.interaction = {
  hover: {
    opacity: T.state.hoverOpacity,
    surface: T.semantic.surface.hover,
  },
  active: {
    opacity: T.state.activeOpacity,
  },
  disabled: {
    opacity: T.state.disabledOpacity,
  },
};

// ─── Elevation / Z / Grid ────────────────────────────────────────────────────
T.elevation = {
  0: "none",
  1: T.shadow.card,
  2: T.shadow.hover,
  3: "0 8px 24px rgba(15,23,42,0.12)",
};

T.z = {
  base:     0,
  dropdown: 10,
  sticky:   50,
  modal:    100,
  toast:    200,
};

T.grid = {
  columns: 12,
  gutter:  T.spacing.lg,
  margin:  T.spacing.xl,
};

// ─── Component Tokens ────────────────────────────────────────────────────────
T.component = {
  ...T.component,
  card: {
    default: {
      padding: T.spacing.lg,
      gap:     T.spacing.sm,
      radius:  T.radius.card,
      bg:      T.semantic.surface.card,
      border:  T.semantic.border.soft,
      shadow:  T.elevation[1],
    },
    compact: {
      padding: T.spacing.md,
      gap:     T.spacing.xs,
      radius:  T.radius.card,
      bg:      T.semantic.surface.card,
      border:  T.semantic.border.soft,
      shadow:  T.elevation[1],
    },
    hero: {
      padding: T.spacing.xl,
      gap:     T.spacing.md,
      radius:  T.radius.card,
      bg:      T.semantic.surface.card,
      border:  T.semantic.border.default,
      shadow:  T.elevation[2],
    },
  },
  panel: {
    padding: T.spacing.xl,
    gap:     T.spacing.md,
    radius:  T.radius.panel,
    bg:      T.semantic.surface.app,
  },
  button: {
    size: {
      sm: 32,
      md: 36,
      lg: 44,
    },
    paddingX: T.spacing.md,
    paddingY: T.spacing.sm,
    gap:      T.spacing.xs,
    radius:   T.radius.btn,
    primary: {
      bg:   T.semantic.action.primary,
      text: T.semantic.text.inverse,
    },
    secondary: {
      bg:   T.semantic.surface.card,
      text: T.semantic.text.primary,
    },
    danger: {
      bg:   T.semantic.action.danger,
      text: T.semantic.text.inverse,
    },
    ghost: {
      bg:   "transparent",
      text: T.semantic.text.secondary,
    },
  },
  input: {
    height:  40,
    padding: T.spacing.sm,
    radius:  T.radius.input,
    border:  T.semantic.border.default,
    bg:      T.semantic.surface.app,
  },
  badge: {
    paddingX: T.spacing.xs,
    paddingY: T.spacing.xxs,
    radius:   T.radius.badge,
    fontSize: T.font.size.xs,
  },
  metric: {
    inline: {
      value: {
        fontSize: T.font.size.xs,
        weight:   T.font.weight.bold,
        color:    T.semantic.text.primary,
      },
      label: {
        fontSize: T.font.size.xs,
        color:    T.semantic.text.secondary,
      },
    },
    card: {
      value: {
        fontSize: T.font.size.lg,
        weight:   T.font.weight.semibold,
        color:    T.semantic.text.primary,
      },
      label: {
        fontSize: T.font.size.sm,
        color:    T.semantic.text.secondary,
      },
    },
    hero: {
      value: {
        fontSize: T.font.size.xl,
        weight:   T.font.weight.bold,
        color:    T.semantic.text.primary,
      },
      label: {
        fontSize: T.font.size.sm,
        color:    T.semantic.text.secondary,
      },
    },
  },
  divider: {
    thickness: 1,
    color:     T.semantic.border.soft,
    spacing:   T.spacing.md,
  },
  icon: {
    size: {
      sm: 16,
      md: 20,
      lg: 24,
    },
    color: {
      primary:   T.semantic.text.primary,
      secondary: T.semantic.text.secondary,
      muted:     T.semantic.text.muted,
    },
  },
};
