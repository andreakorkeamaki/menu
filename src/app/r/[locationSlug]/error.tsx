"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PUBLIC_ERROR_COPY, publicErrorLocale } from "@/lib/public-error-copy";

const referencePattern = /Reference ([0-9a-f-]{36})/i;

export default function PublicMenuError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const locale = publicErrorLocale(usePathname());
  const copy = PUBLIC_ERROR_COPY[locale];
  const reference = error.message.match(referencePattern)?.[1] ?? error.digest;
  return (
    <main className="public-menu-error" lang={locale}>
      <section aria-labelledby="public-menu-error-title">
        <span aria-hidden="true">MI</span>
        <p>{copy.eyebrow}</p>
        <h1 id="public-menu-error-title">{copy.title}</h1>
        <p>{copy.detail}</p>
        <div><button onClick={reset}>{copy.retry}</button><Link href="/">{copy.home}</Link></div>
        {reference ? <small>Ref. {reference.slice(0, 36)}</small> : null}
      </section>
    </main>
  );
}
