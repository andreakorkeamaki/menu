"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

export function AiJobMonitor({ activeJobs }: { activeJobs: number }) {
  const router = useRouter();

  useEffect(() => {
    if (activeJobs === 0) return;
    const refresh = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const timer = window.setInterval(refresh, 4000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [activeJobs, router]);

  if (activeJobs === 0) return null;

  return (
    <section className="ai-progress compact" role="status" aria-live="polite">
      <span className="ai-progress-icon" aria-hidden="true">
        <span className="loading-spinner" />
      </span>
      <div>
        <strong>Analisi AI in corso</strong>
        <p>{activeJobs === 1 ? "Un documento è in elaborazione." : `${activeJobs} documenti sono in elaborazione.`}</p>
        <div className="progress-track indeterminate" aria-hidden="true"><span /></div>
        <small>Lo stato si aggiorna automaticamente ogni pochi secondi.</small>
      </div>
    </section>
  );
}
