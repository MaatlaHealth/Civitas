import Image from "next/image";
import Link from "next/link";
import { buttonClasses } from "@/components/ui/button";
import { walkthroughHref } from "@/lib/site";

const NAV_LINKS = [
  { href: "/how-it-works", label: "How it works" },
  { href: "/transparency", label: "Trust and limits" },
  { href: "/report", label: "Report a problem" },
  { href: "/track", label: "Track a report" },
];

export function SiteHeader() {
  const walkthrough = walkthroughHref();
  return (
    <header className="border-b border-line bg-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-8 gap-y-2 px-4 py-3 sm:px-6">
        <Link href="/" className="flex shrink-0 items-center" aria-label="Civitas home">
          <Image src="/brand/civitas-logo.png" alt="Civitas" width={720} height={388} priority className="h-11 w-auto" />
        </Link>
        <nav aria-label="Main" className="order-3 w-full lg:order-none lg:w-auto">
          <ul className="flex flex-wrap gap-x-6 gap-y-1 text-sm font-medium text-navy-900">
            {NAV_LINKS.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className="inline-block py-1.5 decoration-amber-500 decoration-2 underline-offset-8 hover:underline">
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="flex items-center gap-2">
          <Link href="/login" className={buttonClasses("ghost", "sm")}>
            Sign in
          </Link>
          {walkthrough ? (
            <a href={walkthrough} className={buttonClasses("primary", "sm")}>
              Book a walkthrough
            </a>
          ) : null}
        </div>
      </div>
    </header>
  );
}
