/* eslint-disable @next/next/no-img-element -- photographs are served by an authenticated route, not the image optimiser */
import Link from "next/link";
import { notFound } from "next/navigation";
import { LazyPointMap } from "@/components/map/lazy";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { AssignmentBadge, PriorityBadge } from "@/components/ui/badges";
import { Card, CardBody, CardHeader, Notice, PageHeader } from "@/components/ui/layout";
import {
  addFieldNoteAction,
  completeWorkAction,
  requestAssistanceAction,
  respondAction,
  startWorkAction,
} from "@/lib/actions/crew";
import { requireCrewSession } from "@/lib/auth/session";
import { categoryLabel, CATEGORY_DEFINITIONS, URGENT_HAZARD_ADVICE } from "@/lib/domain/categories";
import { ACTIVE_ASSIGNMENT_STATUSES } from "@/lib/domain/types";
import { AppError } from "@/lib/errors";
import { formatDateTime } from "@/lib/format";
import { getCrewAssignment } from "@/lib/services/assignments";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const metadata = { title: "Assignment" };

export default async function CrewAssignmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { actor } = await requireCrewSession();
  const { id } = await params;
  if (!UUID_PATTERN.test(id)) notFound();

  // "Forbidden" is shown as not found so assignment ids of other crews are not confirmed.
  const job = await getCrewAssignment(actor, id).catch((error: unknown) => {
    if (error instanceof AppError && (error.code === "not_found" || error.code === "forbidden")) notFound();
    throw error;
  });
  const { assignment, incident, images, fieldNotes } = job;
  const isCurrent = ACTIVE_ASSIGNMENT_STATUSES.includes(assignment.status);

  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/crew" className="font-medium text-teal-700 underline underline-offset-2">My assignments</Link>
        <span aria-hidden> / </span>
        <span className="font-mono">{incident.reference}</span>
      </p>
      <PageHeader
        title={incident.title}
        description={`${categoryLabel(incident.category)} · assigned to ${job.crewName}`}
        actions={
          <>
            <PriorityBadge band={incident.priorityBand} />
            <AssignmentBadge status={assignment.status} />
          </>
        }
      />

      {CATEGORY_DEFINITIONS[incident.category].urgentAdvice ? (
        <Notice tone="warning" className="mb-4" title="This category can involve immediate danger">
          Follow your organisation&apos;s safety procedures on site. {URGENT_HAZARD_ADVICE}
        </Notice>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-2">
        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader title="Job details" description={`Reported ${formatDateTime(incident.createdAt)}`} />
            <CardBody className="space-y-4">
              <p className="text-sm whitespace-pre-line">{incident.description}</p>
              <p className="text-sm"><strong>Address or landmark:</strong> {incident.address ?? "Not given"}</p>
              <LazyPointMap latitude={incident.latitude} longitude={incident.longitude} label={`the location of ${incident.reference}`} />
              <div>
                <h3 className="text-sm font-semibold">Photographs</h3>
                {images.length === 0 ? (
                  <p className="text-sm text-ink-muted">No photographs are available for this job.</p>
                ) : (
                  <ul className="mt-2 grid gap-3 sm:grid-cols-2">
                    {images.map((image) => (
                      <li key={image.id}>
                        <a href={`/api/images/${image.id}`} target="_blank" rel="noreferrer">
                          <img
                            src={`/api/images/${image.id}`}
                            alt={image.kind === "report" ? "Photograph supplied by the reporter" : "Completion evidence"}
                            loading="lazy"
                            className="h-44 w-full rounded-md border border-line object-cover"
                          />
                        </a>
                        <p className="mt-1 text-xs text-ink-muted">{image.kind === "report" ? "From the reporter" : "Completion evidence"}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </CardBody>
          </Card>
        </div>

        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader title="Update this job" />
            <CardBody className="space-y-5">
              {assignment.status === "assigned" ? (
                <>
                  <ActionForm action={respondAction}>
                    <input type="hidden" name="id" value={assignment.id} />
                    <input type="hidden" name="decision" value="accepted" />
                    <SubmitButton>Accept assignment</SubmitButton>
                  </ActionForm>
                  <ActionForm action={respondAction} className="space-y-2 border-t border-line pt-4">
                    <input type="hidden" name="id" value={assignment.id} />
                    <input type="hidden" name="decision" value="declined" />
                    <label htmlFor="decline-reason" className="label">Reason for declining (required)</label>
                    <input id="decline-reason" name="reason" className="input" required minLength={5} maxLength={500} />
                    <SubmitButton variant="secondary">Decline assignment</SubmitButton>
                  </ActionForm>
                </>
              ) : null}

              {assignment.status === "accepted" ? (
                <ActionForm action={startWorkAction}>
                  <input type="hidden" name="id" value={assignment.id} />
                  <SubmitButton>Start work</SubmitButton>
                </ActionForm>
              ) : null}

              {assignment.status === "in_progress" ? (
                <ActionForm action={completeWorkAction} className="space-y-3">
                  <input type="hidden" name="id" value={assignment.id} />
                  <div>
                    <label htmlFor="completion-notes" className="label">Completion notes (required)</label>
                    <textarea id="completion-notes" name="completionNotes" className="input min-h-24" required minLength={5} maxLength={2000} placeholder="What was done, and anything the coordinator should know." />
                  </div>
                  <div>
                    <label htmlFor="completion-evidence" className="label">Photograph of the completed work (optional)</label>
                    <input
                      id="completion-evidence"
                      name="evidence"
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-navy-900 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white"
                    />
                    <p className="mt-1 text-xs text-ink-muted">JPEG, PNG or WebP, up to 4 MB.</p>
                  </div>
                  <SubmitButton>Mark work complete</SubmitButton>
                  <p className="text-xs text-ink-muted">A coordinator verifies completed work before the incident is resolved.</p>
                </ActionForm>
              ) : null}

              {assignment.status === "completed" ? (
                <Notice title="Waiting for coordinator verification">
                  You marked this work complete. Your notes: {assignment.completionNotes}
                </Notice>
              ) : null}
              {assignment.status === "verified" ? <Notice tone="success">A coordinator verified this work as complete.</Notice> : null}
              {assignment.status === "declined" ? <Notice>Your crew declined this assignment. Reason: {assignment.declineReason}</Notice> : null}

              {isCurrent ? (
                <ActionForm action={requestAssistanceAction} resetOnSuccess className="space-y-2 border-t border-line pt-4">
                  <input type="hidden" name="id" value={assignment.id} />
                  <label htmlFor="assistance-note" className="label">Flag a problem that needs the coordinator</label>
                  <input id="assistance-note" name="note" className="input" required minLength={5} maxLength={2000} placeholder="For example: road closure needed before work can start." />
                  <SubmitButton variant="secondary" size="sm">Request assistance</SubmitButton>
                  {assignment.assistanceRequested ? (
                    <p className="text-xs font-medium text-red-800">Open request: {assignment.assistanceNote}</p>
                  ) : null}
                </ActionForm>
              ) : null}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Field notes" />
            <CardBody className="space-y-3">
              {fieldNotes.length === 0 ? (
                <p className="text-sm text-ink-muted">No field notes yet.</p>
              ) : (
                <ul className="space-y-2">
                  {fieldNotes.map((note) => (
                    <li key={note.id} className="rounded-md border border-line px-3 py-2 text-sm">
                      <p className="whitespace-pre-line">{note.body}</p>
                      <p className="mt-1 text-xs text-ink-muted">{formatDateTime(note.createdAt)}</p>
                    </li>
                  ))}
                </ul>
              )}
              {isCurrent ? (
                <ActionForm action={addFieldNoteAction} resetOnSuccess className="space-y-2">
                  <input type="hidden" name="id" value={assignment.id} />
                  <label htmlFor="field-note" className="label">Add a field note</label>
                  <textarea id="field-note" name="body" className="input" required minLength={5} maxLength={2000} />
                  <SubmitButton variant="secondary" size="sm">Add note</SubmitButton>
                </ActionForm>
              ) : null}
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
