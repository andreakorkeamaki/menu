function SkeletonLine({ width = "100%" }: { width?: string }) {
  return <span className="skeleton-line" style={{ width }} />;
}

export function WorkspaceLoadingState({ label }: { label: string }) {
  return (
    <main className="workspace workspace-loading" aria-busy="true" aria-label={label}>
      <span className="sr-only">{label}</span>
      <header><div><SkeletonLine width="8rem" /><SkeletonLine width="min(32rem, 82%)" /><SkeletonLine width="min(26rem, 68%)" /></div><span className="skeleton-button" /></header>
      <section className="skeleton-feature"><div><SkeletonLine width="7rem" /><SkeletonLine width="70%" /><SkeletonLine width="88%" /></div><span className="skeleton-circle" /></section>
      <section className="skeleton-card-grid">{[0, 1, 2].map((item) => <article key={item}><SkeletonLine width="45%" /><SkeletonLine width="68%" /><SkeletonLine width="82%" /></article>)}</section>
      <section className="skeleton-panel"><SkeletonLine width="10rem" /><SkeletonLine width="65%" /><SkeletonLine width="92%" /><SkeletonLine width="84%" /><SkeletonLine width="76%" /></section>
    </main>
  );
}
