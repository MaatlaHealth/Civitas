import { ClipboardCheck, Inbox } from "lucide-react";
import Link from "next/link";
import { AssignmentBadge, PriorityBadge, StatusBadge } from "@/components/ui/badges";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardHeader, EmptyState, PageHeader } from "@/components/ui/layout";
import { loadDemoDataAction } from "@/lib/actions/coordinator";
import { requireCoordinatorSession } from "@/lib/auth/session";
import { categoryLabel } from "@/lib/domain/categories";
import { formatDateTime } from "@/lib/format";
import { getOverview } from "@/lib/services/analytics";
import { listAssignmentsNeedingAttention } from "@/lib/services/assignments";
import { listIncidents } from "@/lib/services/incidents";
import { openAccessEnabled } from "@/lib/services/open-access";

interface Statistic {
  label: string;
  value: number;
  href: string;
  emphasis?: boolean;
}

export default async function DashboardOverviewPage() {
  const { actor } = await requireCoordinatorSession();
  const [overview, reviewQueue, attention] = await Promise.all([
    getOverview(actor),
    listIncidents(actor, { review: "needs_review", sort: "priority" }),
    listAssignmentsNeedingAttention(actor),
  ]);

  const statistics: Statistic[] = [
    { label: "Active incidents", value: overview.activeIncidents, href: "/dashboard/incidents" },
    { label: "Awaiting review", value: overview.awaitingReview, href: "/dashboard/incidents?review=needs_review", emphasis: overview.awaitingReview > 0 },
    { label: "Critical (active)", value: overview.critical, href: "/dashboard/incidents?priority=critical", emphasis: overview.critical > 0 },
    { label: "High priority (active)", value: overview.high, href: "/dashboard/incidents?priority=high" },
    { label: "In progress", value: overview.inProgress, href: "/dashboard/incidents?status=in_progress" },
    { label: "Resolved or closed", value: overview.resolved, href: "/dashboard/incidents?status=resolved" },
    { label: "Available crews", value: overview.availableCrews, href: "/dashboard/crews" },
    { label: "Possible duplicates to review", value: overview.pendingDuplicates, href: "/dashboard/duplicates", emphasis: overview.pendingDuplicates > 0 },
  ];

  return (
    <>
      <PageHeader
        title="Operations overview"
        description="Every figure on this page is counted from stored records at the time the page loads."
        actions={<ButtonLink href="/dashboard/planning">Open planning</ButtonLink>}
      />

      {openAccessEnabled() ? (
        <div className="mb-6 rounded-lg border border-amber-600/40 bg-amber-50 p-4">
          <h2 className="text-base font-semibold">Demonstration data</h2>
          <p className="mt-1 max-w-3xl text-sm">
            This demo site can be filled with invented example reports, crews and assets so there is something to
            look at. Every demonstration record is labelled as such. Scores, duplicate matches and crew recommendations
            for them are worked out by Civitas in the normal way.
          </p>
          <ActionForm action={loadDemoDataAction} className="mt-3">
            <SubmitButton variant="secondary">Load demonstration data</SubmitButton>
          </ActionForm>
        </div>
      ) : null}

      <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {statistics.map((statistic) => (
          <li key={statistic.label}>
            <Link
              href={statistic.href}
              className={`block h-full rounded-lg border bg-white px-4 py-3 shadow-xs transition-colors hover:border-teal-600 ${
                statistic.emphasis ? "border-amber-500" : "border-line"
              }`}
            >
              <span className="block text-3xl font-bold text-navy-900 tabular-nums">{statistic.value}</span>
              <span className="mt-0.5 block text-sm text-ink-muted">{statistic.label}</span>
            </Link>
          </li>
        ))}
      </ul>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader
            title="Review queue"
            description="Reports waiting for a coordinator, highest provisional priority first."
            action={<ButtonLink href="/dashboard/incidents?review=needs_review" variant="secondary" size="sm">View all</ButtonLink>}
          />
          {reviewQueue.items.length === 0 ? (
            <EmptyState icon={Inbox} title="Nothing is waiting for review">
              New citizen reports appear here as soon as they are submitted.
            </EmptyState>
          ) : (
            <ul className="divide-y divide-line">
              {reviewQueue.items.slice(0, 8).map((incident) => (
                <li key={incident.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 sm:px-5">
                  <div className="min-w-0">
                    <Link href={`/dashboard/incidents/${incident.id}`} className="font-medium text-navy-900 hover:underline">
                      {incident.title}
                    </Link>
                    <p className="text-xs text-ink-muted">
                      <span className="font-mono">{incident.reference}</span> · {categoryLabel(incident.category)} · {formatDateTime(incident.createdAt)}
                    </p>
                  </div>
                  <div className="flex gap-1.5">
                    <PriorityBadge band={incident.priorityBand} provisional />
                    <StatusBadge status={incident.status} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader title="Assignments needing your attention" description="Proposals to approve, completed work to verify, and requests for assistance." />
          {attention.length === 0 ? (
            <EmptyState icon={ClipboardCheck} title="No assignments need attention">
              Proposals, completed jobs and crew requests for assistance are listed here.
            </EmptyState>
          ) : (
            <ul className="divide-y divide-line">
              {attention.map((assignment) => (
                <li key={assignment.id} className="px-4 py-3 sm:px-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Link href={`/dashboard/incidents/${assignment.incidentId}#assignment`} className="font-medium text-navy-900 hover:underline">
                      {assignment.title}
                    </Link>
                    <AssignmentBadge status={assignment.status} />
                  </div>
                  <p className="text-xs text-ink-muted">
                    <span className="font-mono">{assignment.reference}</span> · {assignment.crewName}
                  </p>
                  {assignment.assistanceRequested ? (
                    <p className="mt-1 text-sm font-medium text-red-800">Assistance requested: {assignment.assistanceNote}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
