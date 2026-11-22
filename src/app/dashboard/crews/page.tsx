import { Users } from "lucide-react";
import { CrewFormFields } from "@/components/staff/crew-form-fields";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Badge } from "@/components/ui/badges";
import { Card, CardBody, CardHeader, EmptyState, PageHeader } from "@/components/ui/layout";
import { createCrewAction, setCrewStatusAction, updateCrewAction } from "@/lib/actions/coordinator";
import { requireCoordinatorSession } from "@/lib/auth/session";
import { SPECIALIZATION_LABELS } from "@/lib/domain/categories";
import { CREW_STATUSES, CREW_STATUS_LABELS, type CrewStatus } from "@/lib/domain/types";
import { listCrews } from "@/lib/services/crews";

export const metadata = { title: "Crews" };

const STATUS_TONES: Record<CrewStatus, "green" | "red" | "neutral"> = { available: "green", unavailable: "red", off_shift: "neutral" };

export default async function CrewsPage() {
  const { actor } = await requireCoordinatorSession();
  const crews = await listCrews(actor);

  return (
    <>
      <PageHeader
        title="Maintenance crews"
        description="Crew specialisation, availability, operating base and capacity drive the assignment recommendations. Changes are saved immediately and recorded in the audit trail."
      />

      {crews.length === 0 ? (
        <Card className="mb-6">
          <EmptyState icon={Users} title="No crews have been added yet">
            Add your first crew below. Incidents can only be assigned once a qualified crew exists.
          </EmptyState>
        </Card>
      ) : (
        <ul className="mb-6 grid gap-4 xl:grid-cols-2">
          {crews.map((crew) => (
            <li key={crew.id}>
              <Card className="h-full">
                <CardHeader
                  title={crew.name}
                  description={`${SPECIALIZATION_LABELS[crew.specialization]} · base: ${crew.baseLabel}`}
                  action={<Badge tone={STATUS_TONES[crew.status]}>{CREW_STATUS_LABELS[crew.status]}</Badge>}
                />
                <CardBody className="space-y-4">
                  <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
                    <div>
                      <dt className="text-xs font-semibold tracking-wide text-ink-muted uppercase">Workload</dt>
                      <dd className="tabular-nums">{crew.activeWorkload} of {crew.capacity} jobs</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-semibold tracking-wide text-ink-muted uppercase">Base position</dt>
                      <dd className="tabular-nums">{crew.baseLatitude.toFixed(4)}, {crew.baseLongitude.toFixed(4)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-semibold tracking-wide text-ink-muted uppercase">Shift</dt>
                      <dd>{crew.shiftNotes ?? "Not recorded"}</dd>
                    </div>
                  </dl>
                  <p className="text-sm">
                    <span className="font-semibold">Members with sign-in access: </span>
                    {crew.members.length === 0 ? "none yet" : crew.members.map((member) => member.name).join(", ")}
                  </p>

                  <ActionForm action={setCrewStatusAction} className="flex flex-wrap items-end gap-2">
                    <input type="hidden" name="id" value={crew.id} />
                    <div>
                      <label htmlFor={`status-${crew.id}`} className="label">Set availability</label>
                      <select id={`status-${crew.id}`} name="status" className="input" defaultValue={crew.status}>
                        {CREW_STATUSES.map((status) => <option key={status} value={status}>{CREW_STATUS_LABELS[status]}</option>)}
                      </select>
                    </div>
                    <SubmitButton variant="secondary" size="md">Update</SubmitButton>
                  </ActionForm>

                  <details className="rounded-md border border-line p-3">
                    <summary className="cursor-pointer text-sm font-semibold text-navy-900">Edit crew details</summary>
                    <ActionForm action={updateCrewAction} className="mt-3 space-y-3">
                      <input type="hidden" name="id" value={crew.id} />
                      <CrewFormFields idPrefix={`edit-${crew.id}`} defaults={crew} />
                      <SubmitButton size="sm">Save changes</SubmitButton>
                    </ActionForm>
                  </details>
                </CardBody>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <Card>
        <CardHeader
          title="Add a crew"
          description="Sign-in accounts for crew members are created by an administrator with the users:create script (see the README)."
        />
        <CardBody>
          <ActionForm action={createCrewAction} resetOnSuccess className="space-y-3">
            <CrewFormFields idPrefix="new-crew" />
            <SubmitButton>Add crew</SubmitButton>
          </ActionForm>
        </CardBody>
      </Card>
    </>
  );
}
