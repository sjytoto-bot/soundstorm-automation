#!/usr/bin/env node
// ─── create-block ─────────────────────────────────────────────────────────────
// Block Generator — Block System 개발 흐름 자동화
//
// 사용:
//   npm run create:block -- ThumbnailAnalyzer
//
// 자동 처리:
//   1. src/components/dashboard/{Name}Block.tsx  생성 (표시 전용 템플릿)
//   2. src/types/dashboardBlock.ts               BlockId 유니온 + BLOCK_DEFS 추가
//   3. src/dashboard/blockRegistry.tsx           import + registry 항목 추가
//
// 생성 후 할 일:
//   - Engine에서 필요한 데이터를 DashboardData에 추가 (src/types/dashboardData.ts)
//   - DashboardPage.tsx에서 dashData 조립 시 해당 필드 추가
//   - 블록 컴포넌트 구현

import fs   from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC       = path.join(__dirname, "../src");

// ─── 인수 검증 ────────────────────────────────────────────────────────────────

const rawName = process.argv[2];
if (!rawName) {
  console.error("❌ 사용법: npm run create:block -- <BlockName>");
  console.error("   예시:   npm run create:block -- ThumbnailAnalyzer");
  process.exit(1);
}

// PascalCase 보정 (첫 글자 대문자) + "Block" suffix 중복 제거
const baseName      = rawName[0].toUpperCase() + rawName.slice(1);
const name          = baseName.endsWith("Block") ? baseName.slice(0, -5) : baseName;
// camelCase blockId
const blockId       = name[0].toLowerCase() + name.slice(1);
const componentName = name + "Block";
const componentPath = path.join(SRC, "components/dashboard", componentName + ".tsx");
const blockTypePath = path.join(SRC, "types/dashboardBlock.ts");
const registryPath  = path.join(SRC, "dashboard/blockRegistry.tsx");

// ─── 1. 컴포넌트 파일 생성 ────────────────────────────────────────────────────

if (fs.existsSync(componentPath)) {
  console.error(`❌ 이미 존재: ${componentPath}`);
  process.exit(1);
}

const componentTemplate = `\
// ─── ${componentName} ${"─".repeat(Math.max(0, 76 - componentName.length))}
// Block: ${name}
//
// ━━━━ 절대 규칙 (위반 시 Block System 붕괴) ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ❌ 데이터 생성 금지    — useState로 데이터 만들기 금지
// ❌ API 호출 금지       — useEffect + fetch / axios 패턴 금지
// ❌ 다른 Block 참조 금지 — import OtherBlock 금지 (Block A → Block B 의존 금지)
// ✅ data.xxx 읽기만     — DashboardData의 기존 필드 사용
// ✅ actions.xxx 호출    — DashboardActions 핸들러만 호출
// ✅ 새 데이터 필요 시   — Engine 추가 → dashData에 필드 추가 → 여기서 읽기
// ✅ UI 상태 허용        — useBlockState("${blockId}", { expanded: false }) 사용 가능
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import type { DashboardData, DashboardActions } from "@/types/dashboardData";
import { T } from "@/styles/tokens";

interface Props {
  data:    DashboardData;
  actions: DashboardActions;
}

export default function ${componentName}({ data, actions }: Props) {
  return (
    <div style={{
      background:    T.color.bgPrimary,
      border:        \`1px solid \${T.color.border}\`,
      borderRadius:  T.radius.card,
      padding:       T.spacing.lg,
      display:       "flex",
      flexDirection: "column",
      gap:           T.spacing.sm,
    }}>
      <span style={{
        fontSize:      T.font.size.xs,
        fontFamily:    T.font.familyMono,
        fontWeight:    T.font.weight.bold,
        color:         T.color.textMuted,
        letterSpacing: "0.1em",
      }}>
        ${name.toUpperCase()}
      </span>
      <span style={{ fontSize: T.font.size.sm, color: T.color.textPrimary }}>
        구현 예정 — Engine 연결 후 여기서 표시
      </span>
    </div>
  );
}
`;

fs.writeFileSync(componentPath, componentTemplate, "utf8");
console.log(`✅ 생성: src/components/dashboard/${componentName}.tsx`);

// ─── 2. dashboardBlock.ts 업데이트 ───────────────────────────────────────────

let blockType = fs.readFileSync(blockTypePath, "utf8");
const btLines = blockType.split("\n");

// BlockId 유니온: 마지막 항목(세미콜론 포함)을 찾아 새 항목 삽입
const lastUnionIdx = btLines.reduce(
  (last, line, i) => (line.match(/^\s+\| "[^"]+";/) ? i : last),
  -1,
);
if (lastUnionIdx === -1) {
  console.error("❌ dashboardBlock.ts: BlockId 유니온 끝을 찾지 못함");
  process.exit(1);
}
// 마지막 항목에서 세미콜론 제거 + 새 항목(세미콜론 포함) 추가
// "insight";    // ... → "insight"    // ... (세미콜론만 제거, 공백·코멘트 보존)
btLines[lastUnionIdx] = btLines[lastUnionIdx].replace(/";(\s)/, '" $1').replace(/";$/, '"');
btLines.splice(lastUnionIdx + 1, 0, `  | "${blockId}"; // ${name}`);

// BLOCK_DEFS: '] as const' 바로 앞에 새 항목 삽입
const defsEndIdx = btLines.findIndex(l => l.includes("] as const"));
if (defsEndIdx === -1) {
  console.error("❌ dashboardBlock.ts: BLOCK_DEFS 끝을 찾지 못함");
  process.exit(1);
}
btLines.splice(defsEndIdx, 0,
  `  { id: "${blockId}", label: "${name}", section: null, defaultVisible: false },`,
);

fs.writeFileSync(blockTypePath, btLines.join("\n"), "utf8");
console.log(`✅ 수정: src/types/dashboardBlock.ts`);

// ─── 3. blockRegistry.tsx 업데이트 ───────────────────────────────────────────

let registry = fs.readFileSync(registryPath, "utf8");
const rgLines = registry.split("\n");

// import 추가: 마지막 import 행 다음에 삽입
const lastImportIdx = rgLines.reduce(
  (last, line, i) => (line.startsWith("import ") ? i : last),
  -1,
);
if (lastImportIdx !== -1) {
  const padded = componentName.padEnd(25);
  rgLines.splice(lastImportIdx + 1, 0,
    `import ${padded} from "../components/dashboard/${componentName}";`,
  );
}

// registry 항목 추가: 마지막 `};` 바로 앞에 삽입
const closingIdx = rgLines.reduce(
  (last, line, i) => (line === "};" ? i : last),
  -1,
);
if (closingIdx === -1) {
  console.error("❌ blockRegistry.tsx: 닫는 }; 를 찾지 못함");
  process.exit(1);
}
rgLines.splice(closingIdx, 0,
  "",
  `  // ── ${blockId}: ${name} ${"─".repeat(Math.max(0, 74 - blockId.length - name.length))}`,
  `  ${blockId}: (data, actions) => (`,
  `    <${componentName} data={data} actions={actions} />`,
  `  ),`,
);

fs.writeFileSync(registryPath, rgLines.join("\n"), "utf8");
console.log(`✅ 수정: src/dashboard/blockRegistry.tsx`);

// ─── 완료 안내 ────────────────────────────────────────────────────────────────

console.log(`
🎉 Block 생성 완료: ${blockId}

  컴포넌트:  src/components/dashboard/${componentName}.tsx
  BlockId:   "${blockId}" (dashboardBlock.ts에 추가됨)
  Registry:  blockRegistry.tsx에 등록됨

다음 단계:
  1. DashboardData에 필요한 필드 추가  (src/types/dashboardData.ts)
  2. DashboardPage dashData 조립에 추가 (src/pages/DashboardPage.tsx)
  3. ${componentName}.tsx 구현
`);
