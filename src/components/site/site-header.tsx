import Image from "next/image";
import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";

const NAV_LINKS = [
  { href: "/report", label: "Report an incident" },
  { href: "/track", label: "Track an incident" },
  { href: "/how-it-works", label: "How it works" },
  { href: "/transparency", label: "Transparency" },
];

export function SiteHeader() {
  return (
    <header className="border-b border-line bg-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3 sm:px-6">
        <Link href="/" className="flex shrink-0 items-center" aria-label="Civitas home">
          <Image src="/brand/civitas-logo.png" alt="Civitas" width={720} height={388} priority className="h-11 w-auto" />
        </Link>
        <nav aria-label="Main" className="order-3 w-full sm:order-none sm:w-auto">
          <ul className="flex flex-wrap gap-x-5 gap-y-1 text-sm font-medium text-navy-900">
            {NAV_LINKS.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className="inline-block py-1.5 hover:text-teal-700 hover:underline hover:underline-offset-4">
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <ButtonLink href="/login" variant="secondary" size="sm">
          Sign in
        </ButtonLink>
      </div>
    </header>
  );
}
