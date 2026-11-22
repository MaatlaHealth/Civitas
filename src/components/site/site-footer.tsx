import Link from "next/link";

const FOOTER_LINKS = [
  { href: "/how-it-works", label: "How Civitas works" },
  { href: "/transparency", label: "Transparency and limitations" },
  { href: "/privacy", label: "Privacy" },
  { href: "/login", label: "Sign in" },
];

export function SiteFooter() {
  return (
    <footer className="mt-16 bg-navy-950 text-navy-100">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:grid-cols-2 sm:px-6">
        <div>
          <p className="text-lg font-semibold text-white">Civitas</p>
          <p className="mt-1 text-sm">From citizen reports to coordinated infrastructure response.</p>
          <p className="mt-4 max-w-md text-sm text-navy-200">
            Civitas is a decision-support tool. It is not an emergency service and does not dispatch anyone
            automatically. In an emergency, call your local emergency number.
          </p>
        </div>
        <nav aria-label="Footer">
          <ul className="space-y-2 text-sm">
            {FOOTER_LINKS.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className="underline-offset-4 hover:text-white hover:underline">
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
      <div className="border-t border-navy-800 px-4 py-4 text-center text-xs text-navy-200">
        Built for EvoHacks 2, &ldquo;Projects for Social Good&rdquo;. Map data &copy; OpenStreetMap contributors.
      </div>
    </footer>
  );
}
