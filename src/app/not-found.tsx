import Link from "next/link";
import { buttonClasses } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main id="main-content" className="mx-auto max-w-xl px-4 py-20 text-center">
      <h1 className="text-2xl font-bold">Page not found</h1>
      <p className="mt-3 text-ink-muted">
        The page or record you asked for does not exist, or you do not have access to it.
      </p>
      <Link href="/" className={buttonClasses("primary", "md", "mt-6")}>Go to the home page</Link>
    </main>
  );
}
