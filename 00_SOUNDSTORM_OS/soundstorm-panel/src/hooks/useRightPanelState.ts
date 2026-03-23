import { useEffect, useState } from "react";
import { getRightPanelSection, type RightPanelFocus } from "@/components/layout/rightPanelFocus";

const STORAGE_KEY = "dashboard:rightPanelState:v2";

export function useRightPanelState({
  videoDiagnostics = [],
  activeDiagFilter,
}: {
  videoDiagnostics?: any[];
  activeDiagFilter?: RightPanelFocus;
}) {
  const [isOpen, setIsOpen] = useState<boolean>(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}").isOpen ?? true; } catch { return true; }
  });

  const defaultOpen = () => {
    const hasRetention = videoDiagnostics.some((d: any) => d.problemType === "RETENTION_WEAK");
    if (hasRetention) return "retention";
    const hasActionable = videoDiagnostics.some((d: any) =>
      d.problemType !== "INSUFFICIENT_DATA" && d.problemType !== "NORMAL",
    );
    if (hasActionable) return "strategy";
    return "blocks";
  };

  const [openSection, setOpenSection] = useState<string | null>(defaultOpen);

  useEffect(() => {
    if (activeDiagFilter) {
      setIsOpen(true);
      const nextSection = getRightPanelSection(activeDiagFilter);
      if (nextSection) setOpenSection(nextSection);
    }
  }, [activeDiagFilter]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ isOpen }));
  }, [isOpen]);

  function toggleSection(id: string) {
    setOpenSection(prev => (prev === id ? null : id));
  }

  return {
    isOpen,
    setIsOpen,
    openSection,
    setOpenSection,
    toggleSection,
  };
}
