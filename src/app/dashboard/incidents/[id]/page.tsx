import { CopyCheck } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AnalysisPanel } from "@/components/incident/analysis-panel";
import { AssignmentPanel } from "@/components/incident/assignment-panel";
import { DuplicateCandidateCard } from "@/components/incident/duplicate-candidate-card";
import { PriorityPanel } from "@/components/incident/priority-panel";
import { AuditPanel, ClassificationPanel, NotesPanel } from "@/components/incident/records-panels";
import { ScreeningPanel } from "@/components/incident/screening-panel";
import { StatusPanel } from "@/components/incident/status-panel";
import { SubmissionPanel } from "@/components/incident/submission-panel";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { PriorityBadge, StatusBadge } from "@/components/ui/badges";
import { Card, CardBody, CardHeader, EmptyState, Notice, PageHeader } from "@/components/ui/layout";
import { rerunChecksAction } from "@/lib/actions/coordinator";
import { requireCoordinatorSession } from "@/lib/auth/session";
import { categoryLabel } from "@/lib/domain/categories";
import { AppError } from "@/lib/errors";
import { recommendCrews } from "@/lib/services/assignments";
import { getIncidentDetail } from "@/lib/services/incidents";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const metadata = { title: "Incident" };

export default async function IncidentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { actor } = await requireCoordinatorSession();
  const { id } = await params;
  if (!UUID_PATTERN.test(id)) notFound();

  const detail = await getIncidentDetail(actor, id).catch((error: unknown) => {
    if (error instanceof AppError && error.code === "not_found") notFound();
    throw error;
  });
  const rankings = await recommendCrews(actor, id);
  const { incident } = detail;

  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/dashboard/incidents" className="font-medium text-teal-700 underline underline-offset-2">Incidents</Link>
        <span aria-hidden> / </span>
        <span className="font-mono">{incident.reference}</span>
      </p>
      <PageHeader
        title={incident.title}
        description={
          <>
            <span className="font-mono">{incident.reference}</span> · {categoryLabel(incident.category)}
          </>
        }
        actions={
          <>
            <PriorityBadge band={incident.priorityBand} overridden={incident.priorityOverridden} />
            <StatusBadge status={incident.status} />
          </>
        }
      />

      {detail.duplicateOf ? (
        <Notice className="mb-4" title="Confirmed duplicate">
          A coordinator confirmed that this report describes the same problem as{" "}
          <Link href={`/dashboard/incidents/${detail.duplicateOf.id}`} className="font-mono font-semibold underline">
            {detail.duplicateOf.reference}
          </Link>
          . This report is kept in full and the decision can be reopened below.
        </Notice>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-2">
        <div className="space-y-6">
          <SubmissionPanel detail={detail} />
          <AnalysisPanel detail={detail} />
          <NotesPanel detail={detail} />
        </div>
        <div className="space-y-6">
          <StatusPanel detail={detail} />
          <ClassificationPanel detail={detail} />
          <PriorityPanel detail={detail} />
          <AssignmentPanel detail={detail} rankings={rankings} />
          <ScreeningPanel screening={detail.screening} />
        </div>
      </div>

      <Card className="mt-6">
        <CardHeader
          title="Duplicate analysis"
          description="Open reports nearby that may describe the same physical problem."
          action={
            <ActionForm action={rerunChecksAction}>
              <input type="hidden" name="id" value={incident.id} />
              <SubmitButton variant="secondary" size="sm">Re-run checks</SubmitButton>
            </ActionForm>
          }
        />
        <CardBody>
          {detail.duplicateCandidates.length === 0 ? (
            <EmptyState icon={CopyCheck} title="No possible duplicates found">
              No open report within the search radius for this category scored high enough to be raised.
            </EmptyState>
          ) : (
            <div className="space-y-4">
              {detail.duplicateCandidates.map((candidate) => (
                <DuplicateCandidateCard key={candidate.id} candidate={candidate} />
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      <div className="mt-6">
        <AuditPanel detail={detail} />
      </div>
    </>
  );
}
