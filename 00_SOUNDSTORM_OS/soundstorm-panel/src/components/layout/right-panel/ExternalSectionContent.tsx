import { T } from "@/styles/tokens";
import { useAnalyticsContext } from "@/controllers/useAnalyticsController";
import ExternalTrafficInsightsPanel from "@/components/dashboard/ExternalTrafficInsightsPanel";

function fmtViews(n: number): string {
  if (n >= 10_000) return `${(n / 10_000).toFixed(1)}만`;
  return n.toLocaleString("ko-KR");
}

function EmptyState({ text }: { text: string }) {
  return (
    <div style={{
      padding: "22px 18px",
      textAlign: "left",
      fontSize: T.font.size.xs,
      color: T.muted,
      fontFamily: T.font.familyMono,
      letterSpacing: "0.04em",
    }}>
      {text}
    </div>
  );
}

function InspectorRow({
  left,
  right,
}: {
  left: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "1fr auto",
      gap: T.spacing.sm,
      alignItems: "center",
      padding: "10px 0",
      borderBottom: `1px solid ${T.borderSoft}`,
      color: T.text,
    }}>
      <div style={{ minWidth: 0 }}>{left}</div>
      {right ? <div style={{ flexShrink: 0 }}>{right}</div> : <div />}
    </div>
  );
}

function PanelList({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", padding: `0 ${T.spacing.md}px ${T.spacing.sm}px` }}>
      {children}
    </div>
  );
}

export default function ExternalSectionContent() {
  const { analytics } = useAnalyticsContext();
  const sources = (analytics?.trafficSources ?? []) as any[];
  const hasSources = sources.length > 0;

  if (!hasSources) {
    return (
      <div style={{ padding: `${T.spacing.sm}px ${T.spacing.md} ${T.spacing.md}px` }}>
        <ExternalTrafficInsightsPanel embedded />
      </div>
    );
  }

  const total = sources.reduce((s: number, r: any) => s + (r.value ?? 0), 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: T.spacing.md, padding: `${T.spacing.sm}px ${T.spacing.md} ${T.spacing.md}px` }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
        <span style={{ fontSize: T.font.size.xxs, color: T.muted, fontFamily: T.font.familyMono, letterSpacing: "0.06em", padding: `0 ${T.spacing.xs}` }}>
          외부 유입 비중
        </span>
        <PanelList>
          {sources.map((src: any, i: number) => {
            const pct = total > 0 ? ((src.value / total) * 100).toFixed(1) : "—";
            return (
              <InspectorRow
                key={src.key ?? i}
                left={(
                  <span style={{
                    fontSize: T.font.size.xs,
                    color: T.text,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    minWidth: 0,
                  }}>
                    {src.label ?? src.key}
                  </span>
                )}
                right={(
                  <div style={{ display: "flex", alignItems: "center", gap: T.spacing.sm }}>
                    <span style={{ fontSize: T.font.size.xs, fontWeight: T.font.weight.bold, fontFamily: T.font.familyMono, color: T.primary, whiteSpace: "nowrap" }}>
                      {pct}%
                    </span>
                    <span style={{ fontSize: T.font.size.xxs, color: T.muted, fontFamily: T.font.familyMono, whiteSpace: "nowrap" }}>
                      {fmtViews(src.value ?? 0)}
                    </span>
                  </div>
                )}
              />
            );
          })}
        </PanelList>
      </div>

      <ExternalTrafficInsightsPanel embedded />
    </div>
  );
}
