import Link from "next/link";
import type { ReactNode } from "react";

/** Shared frame for the sign-in and setup pages: a statement on the left, the form on the right. */
export function AccessFrame({ title, intro, children }: { title: string; intro: string; children: ReactNode }) {
  return (
    <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 sm:py-16 lg:grid-cols-2 lg:gap-16">
      <div className="min-w-0 lg:pt-4">
        <h1 className="text-4xl leading-tight font-extrabold sm:text-5xl">{title}</h1>
        <p className="mt-4 max-w-md text-lg leading-relaxed">{intro}</p>
        <p className="mt-8 max-w-md border-l-2 border-amber-500 pl-4 text-sm leading-relaxed text-ink-muted">
          Reporting or tracking a problem? You don&apos;t need to sign in.{" "}
          <Link href="/report" className="font-medium text-teal-700 underline underline-offset-2">
            Report a problem
          </Link>{" "}
          or{" "}
          <Link href="/track" className="font-medium text-teal-700 underline underline-offset-2">
            track a report
          </Link>
          .
        </p>
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
