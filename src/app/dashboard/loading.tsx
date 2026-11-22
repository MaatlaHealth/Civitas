import { Loader2 } from "lucide-react";

export default function DashboardLoading() {
  return (
    <p className="flex items-center gap-2 py-16 text-sm text-ink-muted" role="status">
      <Loader2 aria-hidden className="size-4 animate-spin" /> Loading records
    </p>
  );
}
