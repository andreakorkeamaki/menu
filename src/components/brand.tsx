import Link from "next/link";

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link className="brand" href="/" aria-label="MenuInterattivo, home">
      <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>
      {!compact && <span>Menu<span>Interattivo</span></span>}
    </Link>
  );
}
