import type { Metadata } from "next";
import { ReportForm } from "@/components/report/report-form";
import { Notice } from "@/components/ui/layout";
import { URGENT_HAZARD_ADVICE } from "@/lib/domain/categories";

export const metadata: Metadata = {
  title: "Report an incident",
  description: "Report a pothole, water leak, blocked drain, streetlight failure or other infrastructure problem.",
};

export default function ReportPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-bold">Report an infrastructure incident</h1>
      <p className="mt-2 text-ink-muted">
        You do not need an account. Fields marked with * are required. After submitting you will receive a reference
        and an access code for tracking progress.
      </p>
      <Notice tone="warning" title="Not for emergencies" className="my-6">
        {URGENT_HAZARD_ADVICE}
      </Notice>
      <div className="rounded-lg border border-line bg-white p-5 shadow-xs sm:p-8">
        <ReportForm />
      </div>
    </div>
  );
}
