import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { StatusBadge } from "@/components/ui/badges";
import { Card, CardBody, CardHeader } from "@/components/ui/layout";
import { changeStatusAction } from "@/lib/actions/coordinator";
import { STATUS_LABELS } from "@/lib/domain/types";
import { manualTransitions } from "@/lib/domain/workflow";
import { formatDateTime } from "@/lib/format";
import type { IncidentDetail } from "@/lib/services/incidents";

const ACTOR_LABELS = { system: "Civitas (automatic)", citizen: "Reporter", coordinator: "Coordinator", crew: "Crew member" } as const;

export function StatusPanel({ detail }: { detail: IncidentDetail }) {
  const { incident, history } = detail;
  const transitions = manualTransitions(incident.status);

  return (
    <Card>
      <CardHeader title="Status" action={<StatusBadge status={incident.status} />} />
      <CardBody className="space-y-5">
        {transitions.length === 0 ? (
          <p className="text-sm text-ink-muted">
            {incident.status === "closed"
              ? "This incident is closed. No further changes are possible."
              : "The next status change happens through the crew assignment workflow."}
          </p>
        ) : (
          <div className="space-y-3">
            {transitions.map((transition) => (
              <ActionForm key={transition.to} action={changeStatusAction} className="rounded-md border border-line p-3">
                <input type="hidden" name="incidentId" value={incident.id} />
                <input type="hidden" name="version" value={incident.version} />
                <input type="hidden" name="toStatus" value={transition.to} />
                {transition.requiresReason ? (
                  <div className="mb-2">
                    <label htmlFor={`reason-${transition.to}`} className="label">
                      Reason (required) to {transition.description.toLowerCase()}
                    </label>
                    <input id={`reason-${transition.to}`} name="reason" className="input" required minLength={3} maxLength={500} />
                  </div>
                ) : null}
                <SubmitButton size="sm" variant={transition.to === "rejected" ? "danger" : transition.requiresReason ? "secondary" : "primary"}>
                  {transition.description}
                </SubmitButton>
              </ActionForm>
            ))}
          </div>
        )}

        <div>
          <h3 className="text-sm font-semibold">Status timeline</h3>
          <ol className="mt-2 border-l-2 border-navy-100 pl-5">
            {history.map((entry) => (
              <li key={entry.id} className="relative pb-3 last:pb-0">
                <span aria-hidden className="absolute top-1.5 -left-[27px] size-3 rounded-full border-2 border-white bg-teal-600" />
                <p className="text-sm font-medium text-navy-900">{STATUS_LABELS[entry.toStatus]}</p>
                <p className="text-xs text-ink-muted">
                  {formatDateTime(entry.createdAt)} · {entry.actorName ?? ACTOR_LABELS[entry.actorKind]}
                </p>
                {entry.reason ? <p className="text-xs">Reason: {entry.reason}</p> : null}
              </li>
            ))}
          </ol>
        </div>
      </CardBody>
    </Card>
  );
}
