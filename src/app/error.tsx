"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Button, buttonClasses } from "@/components/ui/button";

/** Shown when a page fails to render, for example when the database is unreachable. */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main id="main-content" className="mx-auto max-w-xl px-4 py-20 text-center">
      <h1 className="text-2xl font-bold">This page could not be loaded</h1>
      <p className="mt-3 text-ink-muted">
        Civitas could not reach one of its services, most likely the database. Nothing you have already submitted has
        been lost. Please try again in a moment.
      </p>
      {error.digest ? <p className="mt-2 font-mono text-xs text-ink-muted">Error reference: {error.digest}</p> : null}
      <div className="mt-6 flex justify-center gap-3">
        <Button onClick={reset}>Try again</Button>
        <Link href="/" className={buttonClasses("secondary")}>Go to the home page</Link>
      </div>
    </main>
  );
}
