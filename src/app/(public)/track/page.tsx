import type { Metadata } from "next";
import { TrackIncident } from "@/components/track/track-incident";

export const metadata: Metadata = {
  title: "Track an incident",
  description: "Check the progress of an infrastructure report using your reference and access code.",
};

export default function TrackPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-bold">Track an incident</h1>
      <p className="mt-2 mb-6 text-ink-muted">
        Enter the reference and access code you received when you submitted your report. Only the report&apos;s
        category, status and public updates are shown here; your contact details and internal notes are never displayed.
      </p>
      <TrackIncident />
    </div>
  );
}
