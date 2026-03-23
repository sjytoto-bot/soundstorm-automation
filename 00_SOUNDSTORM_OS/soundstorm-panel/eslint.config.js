import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'release', 'electron/**']),
  {
    files: ['**/*.{js,jsx,ts,tsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]' }],

      // ── SOUNDSTORM 토큰 시스템 강제 ─────────────────────────────────────────
      // 인라인 스타일에서 hex 색상 직접 작성 금지 → T.* 토큰 사용
      'no-restricted-syntax': [
        'error',
        {
          // color: "#..." 패턴 감지
          selector: 'Property[key.name="color"] > Literal[value=/^#[0-9a-fA-F]{3,8}$/]',
          message: '색상 하드코딩 금지. T.fg.* 또는 T.text/sub/muted 토큰을 사용하세요',
        },
        {
          // fontSize: 숫자 패턴 감지 (T.font.size.* 토큰 미사용)
          // 허용 사이즈: 10/12/14/16/20/40 — 반드시 T.font.size.* 로 참조
          selector: 'Property[key.name="fontSize"] > Literal[value=/^[0-9]+$/]',
          message: 'fontSize 하드코딩 금지. T.font.size.* 토큰을 사용하세요 (허용: xxs=10 xs=12 md=14 lg=16 title=20 hero=40)',
        },
        {
          // fontWeight: 숫자 패턴 감지 (T.font.weight.* 토큰 미사용, 800 포함 전부 금지)
          selector: 'Property[key.name="fontWeight"] > Literal[value=/^[0-9]+$/]',
          message: 'fontWeight 하드코딩 금지. T.font.weight.* 토큰을 사용하세요 (800 금지 — bold=700 사용)',
        },
        {
          // background: "#..." hex 직접 작성 금지
          selector: 'Property[key.name="background"] > Literal[value=/^#[0-9a-fA-F]{3,8}$/]',
          message: 'background 하드코딩 금지. T.bg.* 또는 T.bgCard/bgSection/bgApp 토큰을 사용하세요',
        },
        {
          // backgroundColor: "#..." hex 직접 작성 금지
          selector: 'Property[key.name="backgroundColor"] > Literal[value=/^#[0-9a-fA-F]{3,8}$/]',
          message: 'backgroundColor 하드코딩 금지. T.bg.* 또는 T.bgCard/bgSection/bgApp 토큰을 사용하세요',
        },
        {
          // borderColor: "#..." hex 직접 작성 금지
          selector: 'Property[key.name="borderColor"] > Literal[value=/^#[0-9a-fA-F]{3,8}$/]',
          message: 'borderColor 하드코딩 금지. T.borderColor.base 또는 T.border 토큰을 사용하세요',
        },
        {
          // borderRadius: 숫자 직접 작성 금지 (0 제외 — CSS reset 허용)
          selector: 'Property[key.name="borderRadius"] > Literal[value=/^[1-9][0-9]*$/]',
          message: 'borderRadius 하드코딩 금지. T.radius.* 토큰을 사용하세요 (card=16 btn=6 badge=4 pill=999)',
        },

        // ── SOUNDSTORM spacing 강제 (TOKENS_SYSTEM.md § 3, § 10) ───────────────────
        {
          // gap: 숫자 직접 작성 금지
          selector: 'Property[key.name="gap"] > Literal[value=/^[1-9][0-9]*$/]',
          message: 'gap 하드코딩 금지. T.spacing.* 토큰을 사용하세요 (xs=4 xxs=6 sm=8 md=12 lg=16 xl=24 xxl=32)',
        },
        {
          // marginBottom: 숫자 직접 작성 금지 (0 제외)
          selector: 'Property[key.name="marginBottom"] > Literal[value=/^[1-9][0-9]*$/]',
          message: 'marginBottom 하드코딩 금지. T.spacing.* 토큰을 사용하세요',
        },
        {
          // marginTop: 숫자 직접 작성 금지 (0 제외)
          selector: 'Property[key.name="marginTop"] > Literal[value=/^[1-9][0-9]*$/]',
          message: 'marginTop 하드코딩 금지. T.spacing.* 토큰을 사용하세요',
        },
        {
          // padding px 문자열 하드코딩 금지 (§ 3.4) — "12px 20px" 패턴
          selector: 'Property[key.name="padding"] > Literal[value=/[0-9]+px/]',
          message: 'padding px 문자열 하드코딩 금지. `${T.spacing.md}px ${T.spacing.xl}px` 형식으로 작성하세요 (TOKENS_SYSTEM.md § 3.4)',
        },
        {
          // transition에서 0.15s / 0.25s 사용 금지 (§ 7)
          selector: 'Property[key.name="transition"] > Literal[value=/0\\.1[0-9]s|0\\.2[0-9]s/]',
          message: 'transition 0.15s/0.25s 사용 금지. T.motion.default (0.3s ease) 또는 T.motion.duration 사용',
        },
      ],
    },
  },
])
