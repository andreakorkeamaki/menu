"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function AppShellNav({ links }: { links: string[][] }) {
  const pathname = usePathname();

  return links.map(([href, label], index) => {
    const isRoot = href === "/dashboard" || href === "/ops";
    const isCurrent = pathname === href || (!isRoot && pathname.startsWith(`${href}/`));

    return (
      <Link href={href} key={href} aria-current={isCurrent ? "page" : undefined}>
        <span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
        <strong>{label}</strong>
      </Link>
    );
  });
}
