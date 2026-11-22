import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { AssignmentBadge, Badge } from "@/components/ui/badges";
import { Card, CardBody, CardHeader, Notice } from "@/components/ui/layout";
import {
  approveProposalAction,
  assignCrewAction,
  cancelAssignmentAction,
  reassignAction,
  resolveAssistanceAction,
  returnForReworkAction,
  verifyCompletionAction,
} from "@/lib/actions/coordinator";
import { ACTIVE_ASSIGNMENT_STATUSES } from "@/lib/domain/types";
import type { CrewRanking } from "@/lib/engines/assignment";
import { formatDateTime } from "@/lib/format";
import type { IncidentDetail } from "@/lib/services/incidents";

type AssignmentRow = IncidentDetail["assignments"][number];

function CurrentAssignment({ row, rankings }: { row: AssignmentRow; rankings: CrewRanking[] }) {
  const { assignment, crewName } = row;
  const alternatives = rankings.filter((ranking) => ranking.eligible && ranking.crewId !== assignment.crewId);
  const cancellable = assignment.status !== "completed";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold text-navy-900">{crewName}</span>
        <AssignmentBadge status={assignment.status} />
      </div>
      <ul className="list-disc space-y-1 pl-5 text-sm">
        {assignment.rationale.reasons.map((reason) => <li key={reason}>{reason}</li>)}
      </ul>

      {assignment.assistanceRequested ? (
        <Notice tone="error" title="The crew has asked for assistance">
          <p>{assignment.assistanceNote}</p>
          <ActionForm action={resolveAssistanceAction} className="mt-2">
            <input type="hidden" name="id" value={assignment.id} />
            <SubmitButton variant="secondary" size="sm">Mark as handled</SubmitButton>
          </ActionForm>
        </Notice>
      ) : null}

      {assignment.status === "proposed" ? (
        <ActionForm action={approveProposalAction}>
          <input type="hidden" name="id" value={assignment.id} />
          <SubmitButton size="sm">Approve proposal and assign crew</SubmitButton>
        </ActionForm>
      ) : null}

      {assignment.status === "completed" ? (
        <div className="space-y-3 rounded-md border border-line p-3">
          <p className="text-sm"><strong>Crew completion notes:</strong> {assignment.completionNotes}</p>
          <ActionForm action={verifyCompletionAction}>
            <input type="hidden" name="id" value={assignment.id} />
            <SubmitButton size="sm">Verify completion and resolve incident</SubmitButton>
          </ActionForm>
          <ActionForm action={returnForReworkAction} className="space-y-2">
            <input type="hidden" name="id" value={assignment.id} />
            <label htmlFor="rework-reason" className="label">Or return to the crew, with a reason</label>
            <input id="rework-reason" name="reason" className="input" required minLength={10} maxLength={500} />
            <SubmitButton variant="secondary" size="sm">Return for further work</SubmitButton>
          </ActionForm>
        </div>
      ) : null}

      {cancellable ? (
        <details className="rounded-md border border-line p-3">
          <summary className="cursor-pointer text-sm font-semibold text-navy-900">Cancel or reassign</summary>
          <ActionForm action={cancelAssignmentAction} className="mt-3 space-y-2">
            <input type="hidden" name="id" value={assignment.id} />
            <label htmlFor="cancel-reason" className="label">Reason for cancelling</label>
            <input id="cancel-reason" name="reason" className="input" required minLength={10} maxLength={500} />
            <SubmitButton variant="danger" size="sm">Cancel assignment</SubmitButton>
          </ActionForm>
          {assignment.status !== "proposed" && alternatives.length > 0 ? (
            <ActionForm action={reassignAction} className="mt-4 space-y-2 border-t border-line pt-3">
              <input type="hidden" name="id" value={assignment.id} />
              <label htmlFor="reassign-crew" className="label">Reassign to another qualified, available crew</label>
              <select id="reassign-crew" name="crewId" className="input">
                {alternatives.map((ranking) => (
                  <option key={ranking.crewId} value={ranking.crewId}>
                    {ranking.crewName} ({ranking.assignment?.straightLineKm} km straight line)
                  </option>
                ))}
              </select>
              <label htmlFor="reassign-reason" className="label">Reason for reassigning</label>
              <input id="reassign-reason" name="reason" className="input" required minLength={10} maxLength={500} />
              <SubmitButton variant="secondary" size="sm">Reassign</SubmitButton>
            </ActionForm>
          ) : null}
        </details>
      ) : null}
    </div>
  );
}

function Recommendations({ incidentId, rankings }: { incidentId: string; rankings: CrewRanking[] }) {
  if (rankings.length === 0) {
    return <Notice tone="warning">No crews exist yet. Add crews on the Crews page before assigning incidents.</Notice>;
  }
  const eligible = rankings.filter((ranking) => ranking.eligible);
  return (
    <div className="space-y-3">
      {eligible.length === 0 ? (
        <Notice tone="warning" title="No crew can take this incident right now">
          Every crew is unqualified, unavailable or at capacity. The reasons are listed below.
        </Notice>
      ) : null}
      <ol className="space-y-3">
        {rankings.map((ranking, index) => (
          <li key={ranking.crewId} className="rounded-md border border-line p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-navy-900">{ranking.crewName}</span>
              {ranking.eligible && index === 0 ? <Badge tone="green">Recommended</Badge> : null}
              {!ranking.eligible ? <Badge tone="neutral">Not eligible</Badge> : null}
            </div>
            {ranking.assignment ? (
              <>
                <ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm">
                  {ranking.assignment.reasons.map((reason) => <li key={reason}>{reason}</li>)}
                </ul>
                <ActionForm action={assignCrewAction} className="mt-2">
                  <input type="hidden" name="incidentId" value={incidentId} />
                  <input type="hidden" name="crewId" value={ranking.crewId} />
                  <input type="hidden" name="origin" value={index === 0 ? "recommendation" : "manual"} />
                  <SubmitButton size="sm" variant={index === 0 ? "primary" : "secondary"}>
                    Assign {ranking.crewName}
                  </SubmitButton>
                </ActionForm>
              </>
            ) : (
              <p className="mt-1 text-sm text-ink-muted">{ranking.ineligibilityReason}</p>
            )}
          </li>
        ))}
      </ol>
      <p className="text-xs text-ink-muted">
        Ranked by priority-weighted estimated wait. Distances are straight-line from the crew base, not road distances,
        and travel times assume a fixed average speed. The recommendation is a suggestion; you decide.
      </p>
    </div>
  );
}

export function AssignmentPanel({ detail, rankings }: { detail: IncidentDetail; rankings: CrewRanking[] }) {
  const { incident, assignments } = detail;
  const current = assignments.find((row) => ACTIVE_ASSIGNMENT_STATUSES.includes(row.assignment.status));
  const past = assignments.filter((row) => row !== current);

  return (
    <Card>
      <div id="assignment" />
      <CardHeader title="Crew assignment" description="Civitas recommends; a coordinator approves every assignment." />
      <CardBody className="space-y-5">
        {current ? (
          <CurrentAssignment row={current} rankings={rankings} />
        ) : incident.duplicateOfId ? (
          <Notice>This report is a confirmed duplicate. Assign the original incident instead.</Notice>
        ) : incident.status === "verified" ? (
          <Recommendations incidentId={incident.id} rankings={rankings} />
        ) : (
          <Notice>
            {incident.status === "submitted" || incident.status === "awaiting_review"
              ? "Verify this report before assigning a crew."
              : "This incident has no current assignment."}
          </Notice>
        )}

        {past.length > 0 ? (
          <div>
            <h3 className="text-sm font-semibold">Assignment history</h3>
            <ul className="mt-1 space-y-2 text-sm">
              {past.map(({ assignment, crewName }) => (
                <li key={assignment.id} className="rounded-md bg-navy-50 px-3 py-2">
                  <span className="font-medium">{crewName}</span> <AssignmentBadge status={assignment.status} />
                  <span className="text-ink-muted"> · {formatDateTime(assignment.updatedAt)}</span>
                  {assignment.declineReason ? <span className="block text-xs">Declined: {assignment.declineReason}</span> : null}
                  {assignment.completionNotes ? <span className="block text-xs">Completion notes: {assignment.completionNotes}</span> : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </CardBody>
    </Card>
  );
}
