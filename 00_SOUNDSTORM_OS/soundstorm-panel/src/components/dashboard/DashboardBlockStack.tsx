import { Fragment, type ReactNode } from "react";
import { T } from "../../styles/tokens";
import type { DashboardActions, DashboardData } from "../../types/dashboardData";
import type { BlockDef, BlockId } from "../../types/dashboardBlock";
import DropZone from "./DropZone";

type BlockRegistry = Record<BlockId, (data: DashboardData, actions: DashboardActions) => ReactNode>;

function SectionLabel({ label }: { label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: T.spacing.md }}>
      <span style={{
        fontSize:      T.font.size.xs,
        fontFamily:    T.font.familyMono,
        fontWeight:    T.font.weight.bold,
        color:         T.muted,
        letterSpacing: "0.1em",
        whiteSpace:    "nowrap",
      }}>
        {label}
      </span>
      <div style={{ flex: 1, height: 1, background: T.borderSoft }} />
    </div>
  );
}

function BlockSection({
  id,
  def,
  registry,
  dashData,
  dashActions,
  opacity = 1,
  animation,
}: {
  id: BlockId;
  def: BlockDef;
  registry: BlockRegistry;
  dashData: DashboardData;
  dashActions: DashboardActions;
  opacity?: number;
  animation?: string;
}) {
  return (
    <div style={{
      display:       "flex",
      flexDirection: "column",
      gap:           T.spacing.xl,
      opacity,
      transition:    "opacity 0.15s",
      animation,
    }}>
      {def.section && <SectionLabel label={def.section} />}
      {registry[id]?.(dashData, dashActions)}
    </div>
  );
}

export default function DashboardBlockStack({
  pinnedOrder,
  draggableOrder,
  blockDefs,
  registry,
  dashData,
  dashActions,
  isDragging,
  activeDragId,
  lastInsertedId,
  hiddenIds = [],
}: {
  pinnedOrder: BlockId[];
  draggableOrder: BlockId[];
  blockDefs: readonly BlockDef[];
  registry: BlockRegistry;
  dashData: DashboardData;
  dashActions: DashboardActions;
  isDragging: boolean;
  activeDragId: string | null;
  lastInsertedId: string | null;
  hiddenIds?: BlockId[];
}) {
  const insightDef = blockDefs.find(b => b.id === "insight");
  const executionDef = blockDefs.find(b => b.id === "execution");
  const isHidden = (id: BlockId) => hiddenIds.includes(id);

  return (
    <>
      {insightDef && !isHidden("insight") && (
        <BlockSection
          id="insight"
          def={insightDef}
          registry={registry}
          dashData={dashData}
          dashActions={dashActions}
        />
      )}

      {executionDef && !isHidden("execution") && (
        <BlockSection
          id="execution"
          def={executionDef}
          registry={registry}
          dashData={dashData}
          dashActions={dashActions}
        />
      )}

      {pinnedOrder.map(id => {
        if (id === "execution" || id === "insight" || isHidden(id)) return null;
        const def = blockDefs.find(b => b.id === id);
        if (!def) return null;
        return (
          <BlockSection
            key={id}
            id={id}
            def={def}
            registry={registry}
            dashData={dashData}
            dashActions={dashActions}
          />
        );
      })}

      {pinnedOrder.length > 0 && draggableOrder.length > 0 && (
        <div style={{ height: 1, background: T.borderSoft }} />
      )}

      <DropZone index={0} isDragging={isDragging} />

      {draggableOrder.map((id, i) => {
        if (id === "execution" || id === "insight" || isHidden(id)) return null;
        const def = blockDefs.find(b => b.id === id);
        if (!def) return null;
        return (
          <Fragment key={id}>
            <BlockSection
              id={id}
              def={def}
              registry={registry}
              dashData={dashData}
              dashActions={dashActions}
              opacity={isDragging && activeDragId === id ? 0.3 : 1}
              animation={lastInsertedId === id ? "blockGlow 2s ease-out forwards" : undefined}
            />
            <DropZone index={i + 1} isDragging={isDragging} />
          </Fragment>
        );
      })}
    </>
  );
}
