import Link from "next/link";
import { contactEmail } from "@/lib/site";

const PRODUCT_LINKS = [
  { href: "/how-it-works", label: "How it works" },
  { href: "/transparency", label: "Trust and limits" },
  { href: "/privacy", label: "Privacy" },
];

const USE_LINKS = [
  { href: "/report", label: "Report a problem" },
  { href: "/track", label: "Track a report" },
  { href: "/login", label: "Sign in" },
];

function LinkList({ title, links }: { title: string; links: Array<{ href: string; label: string }> }) {
  return (
    <nav aria-label={title}>
      <p className="text-sm font-semibold text-white">{title}</p>
      <ul className="mt-3 space-y-2 text-sm">
        {links.map((link) => (
          <li key={link.href}>
            <Link href={link.href} className="underline-offset-4 hover:text-white hover:underline">
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function SiteFooter() {
  const email = contactEmail();
  return (
    <footer className="bg-navy-950 text-navy-100">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-[minmax(0,1fr)_auto_auto] md:gap-16">
        <div className="max-w-sm">
          <p className="font-display text-xl font-bold text-white">Civitas</p>
          <p className="mt-2 text-sm leading-relaxed">
            Incident management for roads, water, drainage and street lighting. People make the decisions; Civitas does
            the sorting.
          </p>
          {email ? (
            <p className="mt-4 text-sm">
              <a href={`mailto:${email}`} className="font-medium text-white underline underline-offset-4">
                {email}
              </a>
            </p>
          ) : null}
        </div>
        <LinkList title="Product" links={PRODUCT_LINKS} />
        <LinkList title="Use Civitas" links={USE_LINKS} />
      </div>
      <div className="border-t border-navy-800">
        <p className="mx-auto max-w-6xl px-4 py-4 text-xs text-navy-200 sm:px-6">
          Civitas is not an emergency service. In an emergency, call your local emergency number. Map data &copy;
          OpenStreetMap contributors.
        </p>
      </div>
    </footer>
  );
}
