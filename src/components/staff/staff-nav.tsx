"use client";

import clsx from "clsx";
import Link from "next/link";
import { usePathname } from "next/navigation";

export interface StaffNavItem {
  href: string;
  label: string;
  /** Match only this exact path (used for the section's index page). */
  exact?: boolean;
}

export function StaffNav({ items }: { items: StaffNavItem[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Workspace" className="px-2 pb-2 lg:px-3">
      <ul className="flex flex-wrap gap-1 lg:flex-col">
        {items.map((item) => {
          const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={clsx(
                  "block rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  active ? "bg-teal-600 text-white" : "text-navy-100 hover:bg-navy-800 hover:text-white",
                )}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
