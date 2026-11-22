import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Badge } from "@/components/ui/badges";
import { Card, CardBody, CardHeader } from "@/components/ui/layout";
import { addNoteAction, publishUpdateAction, updateClassificationAction } from "@/lib/actions/coordinator";
import { CATEGORY_DEFINITIONS, INCIDENT_CATEGORIES } from "@/lib/domain/categories";
import { EXPOSURE_LEVELS, SEVERITY_LEVELS } from "@/lib/domain/types";
import { formatDateTime } from "@/lib/format";
import type { IncidentDetail } from "@/lib/services/incidents";

export function ClassificationPanel({ detail }: { detail: IncidentDetail }) {
  const { incident } = detail;
  return (
    <Card>
      <CardHeader title="Coordinator classification" description="Confirm or correct the category and record your assessment. Saving recalculates the priority." />
      <CardBody>
        <ActionForm action={updateClassificationAction} className="grid gap-4 sm:grid-cols-3">
          <input type="hidden" name="incidentId" value={incident.id} />
          <input type="hidden" name="version" value={incident.version} />
          <div>
            <label htmlFor="classification-category" className="label">Category</label>
            <select id="classification-category" name="category" className="input" defaultValue={incident.category}>
              {INCIDENT_CATEGORIES.map((category) => (
                <option key={category} value={category}>{CATEGORY_DEFINITIONS[category].label}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="classification-severity" className="label">Confirmed severity</label>
            <select id="classification-severity" name="confirmedSeverity" className="input" defaultValue={incident.confirmedSeverity ?? ""}>
              <option value="">Not confirmed</option>
              {SEVERITY_LEVELS.map((level) => <option key={level} value={level} className="capitalize">{level}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="classification-exposure" className="label">Exposure estimate</label>
            <select id="classification-exposure" name="exposureLevel" className="input" defaultValue={incident.exposureLevel ?? ""}>
              <option value="">Not estimated</option>
              {EXPOSURE_LEVELS.map((level) => <option key={level} value={level} className="capitalize">{level}</option>)}
            </select>
          </div>
          <div className="sm:col-span-3">
            <SubmitButton size="sm">Save classification</SubmitButton>
          </div>
        </ActionForm>
      </CardBody>
    </Card>
  );
}

const SOURCE_LABELS = { reporter: "Additional information from the reporter", coordinator: "Internal note", crew: "Crew field note" } as const;
const SOURCE_TONES = { reporter: "navy", coordinator: "neutral", crew: "teal" } as const;

export function NotesPanel({ detail }: { detail: IncidentDetail }) {
  const { incident, observations, updates } = detail;
  return (
    <Card>
      <CardHeader title="Notes and updates" />
      <CardBody className="space-y-6">
        <section aria-labelledby="public-updates-heading">
          <h3 id="public-updates-heading" className="text-sm font-semibold">Public updates (visible to the reporter)</h3>
          {updates.length === 0 ? (
            <p className="text-sm text-ink-muted">No public updates have been published.</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {updates.map((update) => (
                <li key={update.id} className="rounded-md border border-line px-3 py-2 text-sm">
                  <p className="whitespace-pre-line">{update.body}</p>
                  <p className="mt-1 text-xs text-ink-muted">{formatDateTime(update.createdAt)}</p>
                </li>
              ))}
            </ul>
          )}
          <ActionForm action={publishUpdateAction} resetOnSuccess className="mt-3 space-y-2">
            <input type="hidden" name="incidentId" value={incident.id} />
            <label htmlFor="public-update" className="label">Publish an update to the reporter</label>
            <textarea id="public-update" name="body" className="input" required minLength={10} maxLength={1000} />
            <SubmitButton size="sm">Publish update</SubmitButton>
          </ActionForm>
        </section>

        <section aria-labelledby="internal-notes-heading" className="border-t border-line pt-5">
          <h3 id="internal-notes-heading" className="text-sm font-semibold">Internal notes and field information (never shown publicly)</h3>
          {observations.length === 0 ? (
            <p className="text-sm text-ink-muted">No notes yet.</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {observations.map((observation) => (
                <li key={observation.id} className="rounded-md border border-line px-3 py-2 text-sm">
                  <Badge tone={SOURCE_TONES[observation.source]}>{SOURCE_LABELS[observation.source]}</Badge>
                  <p className="mt-1 whitespace-pre-line">{observation.body}</p>
                  <p className="mt-1 text-xs text-ink-muted">
                    {formatDateTime(observation.createdAt)}{observation.authorName ? ` · ${observation.authorName}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
          <ActionForm action={addNoteAction} resetOnSuccess className="mt-3 space-y-2">
            <input type="hidden" name="incidentId" value={incident.id} />
            <label htmlFor="internal-note" className="label">Add an internal note</label>
            <textarea id="internal-note" name="body" className="input" required minLength={3} maxLength={2000} />
            <SubmitButton variant="secondary" size="sm">Add note</SubmitButton>
          </ActionForm>
        </section>
      </CardBody>
    </Card>
  );
}

const ACTOR_LABELS = { system: "Civitas", citizen: "Reporter", coordinator: "Coordinator", crew: "Crew member" } as const;

function summariseDetail(detail: Record<string, unknown>): string {
  const entries = Object.entries(detail).filter(([, value]) => value !== null && value !== undefined && value !== "");
  if (entries.length === 0) return "";
  return entries.map(([key, value]) => `${key}: ${typeof value === "object" ? JSON.stringify(value) : String(value)}`).join("; ");
}

export function AuditPanel({ detail }: { detail: IncidentDetail }) {
  return (
    <Card>
      <CardHeader title="Audit trail" description="Every recorded action on this incident, newest first." />
      <div className="relative max-h-96 overflow-auto">
        <table className="w-full min-w-[560px] border-collapse">
          <caption className="sr-only">Audit trail for this incident</caption>
          <thead>
            <tr>
              <th scope="col" className="table-header">When</th>
              <th scope="col" className="table-header">Who</th>
              <th scope="col" className="table-header">Action</th>
              <th scope="col" className="table-header">Detail</th>
            </tr>
          </thead>
          <tbody>
            {detail.audit.map((event) => (
              <tr key={event.id}>
                <td className="table-cell text-xs whitespace-nowrap">{formatDateTime(event.createdAt)}</td>
                <td className="table-cell text-xs">{event.actorName ?? ACTOR_LABELS[event.actorKind]}</td>
                <td className="table-cell font-mono text-xs">{event.action}</td>
                <td className="table-cell text-xs break-words">{summariseDetail(event.detail)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
