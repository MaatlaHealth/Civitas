import { ClipboardList } from "lucide-react";
import Link from "next/link";
import { AssignmentBadge, Badge, PriorityBadge } from "@/components/ui/badges";
import { Card, EmptyState, Notice, PageHeader } from "@/components/ui/layout";
import { requireCrewSession } from "@/lib/auth/session";
import { categoryLabel } from "@/lib/domain/categories";
import { ACTIVE_ASSIGNMENT_STATUSES } from "@/lib/domain/types";
import { formatDateTime } from "@/lib/format";
import { listCrewAssignments } from "@/lib/services/assignments";

type CrewAssignmentRow = Awaited<ReturnType<typeof listCrewAssignments>>[number];

function AssignmentList({ title, assignments }: { title: string; assignments: CrewAssignmentRow[] }) {
  if (assignments.length === 0) return null;
  return (
    <section className="mb-6" aria-label={title}>
      <h2 className="mb-2 text-lg font-semibold">{title}</h2>
      <ul className="space-y-3">
        {assignments.map((assignment) => (
          <li key={assignment.id}>
            <Link
              href={`/crew/assignments/${assignment.id}`}
              className="block rounded-lg border border-line bg-white p-4 shadow-xs transition-colors hover:border-teal-600"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold text-navy-900">{assignment.title}</span>
                <span className="flex flex-wrap gap-1.5">
                  <PriorityBadge band={assignment.priorityBand} />
                  <AssignmentBadge status={assignment.status} />
                  {assignment.assistanceRequested ? <Badge tone="red">Assistance requested</Badge> : null}
                </span>
              </div>
              <p className="mt-1 text-sm text-ink-muted">
                <span className="font-mono">{assignment.reference}</span> · {categoryLabel(assignment.category)} · {assignment.crewName}
              </p>
              <p className="text-sm">{assignment.address ?? `${assignment.latitude.toFixed(5)}, ${assignment.longitude.toFixed(5)}`}</p>
              <p className="mt-1 text-xs text-ink-muted">Updated {formatDateTime(assignment.updatedAt)}</p>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default async function CrewHomePage() {
  const { actor } = await requireCrewSession();
  const assignments = await listCrewAssignments(actor);
  const current = assignments.filter((assignment) => ACTIVE_ASSIGNMENT_STATUSES.includes(assignment.status));
  const past = assignments.filter((assignment) => !ACTIVE_ASSIGNMENT_STATUSES.includes(assignment.status));

  return (
    <>
      <PageHeader title="My assignments" description="Work a coordinator has assigned to your crew." />
      {actor.crewIds.length === 0 ? (
        <Notice tone="warning" title="You are not a member of a crew yet">
          Ask an administrator to add your account to a crew. Until then no assignments can be shown.
        </Notice>
      ) : assignments.length === 0 ? (
        <Card>
          <EmptyState icon={ClipboardList} title="No assignments yet">
            When a coordinator assigns an incident to your crew it will appear here.
          </EmptyState>
        </Card>
      ) : (
        <>
          <AssignmentList title="Current work" assignments={current} />
          <AssignmentList title="Finished or declined" assignments={past} />
        </>
      )}
    </>
  );
}
