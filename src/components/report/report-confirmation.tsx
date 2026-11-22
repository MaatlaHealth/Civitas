"use client";

import { CheckCircle2, Copy } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Button, buttonClasses } from "@/components/ui/button";
import { Notice } from "@/components/ui/layout";

export interface SubmissionReceipt {
  reference: string;
  accessCode: string;
  photographStored: boolean;
  photographProblem: string | null;
  analysisConfigured: boolean;
}

/** Groups the access code in fours so it is easier to copy by hand. */
export function formatAccessCode(code: string): string {
  return code.match(/.{1,4}/g)?.join("-") ?? code;
}

export function ReportConfirmation({ receipt }: { receipt: SubmissionReceipt }) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  const copyDetails = async () => {
    try {
      await navigator.clipboard.writeText(`Civitas reference: ${receipt.reference}\nAccess code: ${formatAccessCode(receipt.accessCode)}`);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  // The fragment is never sent to the server, so the code stays out of request logs.
  const trackingLink = `/track#ref=${receipt.reference}&code=${receipt.accessCode}`;

  return (
    <div className="space-y-6" data-testid="report-confirmation">
      <div className="flex items-start gap-3">
        <CheckCircle2 aria-hidden className="mt-1 size-7 shrink-0 text-emerald-700" />
        <div>
          <h2 ref={headingRef} tabIndex={-1} className="text-xl font-semibold">
            Your report has been received
          </h2>
          <p className="mt-1 text-sm text-ink-muted">
            It has been saved and is waiting for a coordinator to review it. No decision has been made yet.
          </p>
        </div>
      </div>

      <div className="rounded-lg border-2 border-navy-900 bg-white p-5">
        <dl className="grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-xs font-semibold tracking-wide text-ink-muted uppercase">Reference</dt>
            <dd className="mt-1 font-mono text-xl font-bold text-navy-900" data-testid="reference">
              {receipt.reference}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold tracking-wide text-ink-muted uppercase">Access code</dt>
            <dd className="mt-1 font-mono text-xl font-bold break-all text-navy-900" data-testid="access-code" data-code={receipt.accessCode}>
              {formatAccessCode(receipt.accessCode)}
            </dd>
          </div>
        </dl>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button variant="secondary" size="sm" onClick={copyDetails}>
            <Copy aria-hidden className="size-4" /> Copy reference and code
          </Button>
          <span className="text-sm text-emerald-800" role="status">
            {copied ? "Copied to clipboard." : ""}
          </span>
        </div>
      </div>

      <Notice tone="warning" title="Save these details now">
        You need both the reference and the access code to track this report. The access code is shown only once and
        cannot be recovered, because Civitas stores only a scrambled version of it.
      </Notice>

      {receipt.photographProblem ? <Notice tone="warning">{receipt.photographProblem}</Notice> : null}
      {receipt.photographStored ? <p className="text-sm text-ink-muted">Your photograph was stored securely.</p> : null}

      <div className="flex flex-wrap gap-3">
        <Link href={trackingLink} className={buttonClasses("primary")}>
          Track this report
        </Link>
        <Link href="/" className={buttonClasses("secondary")}>
          Back to home
        </Link>
      </div>
    </div>
  );
}
