import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { PriorityBadge } from "@/components/ui/badges";
import { Card, CardBody, CardHeader, Notice } from "@/components/ui/layout";
import { clearOverrideAction, overridePriorityAction } from "@/lib/actions/coordinator";
import { PRIORITY_LABELS } from "@/lib/domain/types";
import type { PriorityFactor } from "@/lib/engines/priority";
import { formatDateTime } from "@/lib/format";
import type { IncidentDetail } from "@/lib/services/incidents";

/** Reusable factor table: also used by the training scenario. */
export function PriorityFactorTable({ factors }: { factors: PriorityFactor[] }) {
  return (
    <div className="relative overflow-x-auto">
      <table className="w-full min-w-[400px] border-collapse">
        <caption className="sr-only">Priority score factors</caption>
        <thead>
          <tr>
            <th scope="col" className="table-header">Factor</th>
            <th scope="col" className="table-header text-right">Weight</th>
            <th scope="col" className="table-header text-right">Value</th>
            <th scope="col" className="table-header">Basis</th>
          </tr>
        </thead>
        <tbody>
          {factors.map((factor) => (
            <tr key={factor.key}>
              <th scope="row" className="table-cell text-left font-medium">{factor.label}</th>
              <td className="table-cell text-right tabular-nums">{factor.weight.toFixed(2)}</td>
              <td className="table-cell text-right tabular-nums">
                {factor.value === null ? <span className="font-semibold text-amber-700">Unknown</span> : factor.value.toFixed(2)}
              </td>
              <td className="table-cell text-xs">{factor.basis}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function PriorityPanel({ detail }: { detail: IncidentDetail }) {
  const { incident, latestAssessment, overrides } = detail;
  const provisional = incident.status === "submitted" || incident.status === "awaiting_review";

  return (
    <Card>
      <CardHeader
        title="Priority"
        description="Calculated by deterministic rules. The AI model takes no part in this score."
        action={<PriorityBadge band={incident.priorityBand} overridden={incident.priorityOverridden} provisional={provisional} />}
      />
      <CardBody className="space-y-4">
        {incident.priorityOverridden ? (
          <Notice tone="warning" title="Priority manually adjusted">
            A coordinator set this incident to {PRIORITY_LABELS[incident.priorityBand]}.
            {latestAssessment ? ` The calculated band is ${PRIORITY_LABELS[latestAssessment.band]}.` : ""}
          </Notice>
        ) : null}
        {latestAssessment ? (
          <>
            <p className="text-sm font-medium text-navy-900" data-testid="priority-explanation">{latestAssessment.explanation}</p>
            <PriorityFactorTable factors={latestAssessment.factors} />
            <p className="text-xs text-ink-muted">
              Score = weighted average of the known factors. Unknown factors are left out and the remaining weights are
              rescaled, so missing information is never counted as &ldquo;no risk&rdquo;. Calculated {formatDateTime(latestAssessment.createdAt)}.
            </p>
            {latestAssessment.limitations.length > 0 ? (
              <Notice title="Limitations of this assessment">
                <ul className="list-disc space-y-1 pl-5">
                  {latestAssessment.limitations.map((limitation) => <li key={limitation}>{limitation}</li>)}
                </ul>
              </Notice>
            ) : null}
          </>
        ) : (
          <Notice tone="warning">No priority assessment has been stored yet. Use &ldquo;Re-run checks&rdquo; to calculate one.</Notice>
        )}

        <details className="rounded-md border border-line p-3">
          <summary className="cursor-pointer text-sm font-semibold text-navy-900">Override the priority</summary>
          <ActionForm action={overridePriorityAction} className="mt-3 space-y-3">
            <input type="hidden" name="incidentId" value={incident.id} />
            <input type="hidden" name="version" value={incident.version} />
            <div>
              <label htmlFor="override-band" className="label">New priority</label>
              <select id="override-band" name="band" className="input max-w-xs" defaultValue={incident.priorityBand === "awaiting_review" ? "moderate" : incident.priorityBand}>
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="moderate">Moderate</option>
                <option value="low">Low</option>
              </select>
            </div>
            <div>
              <label htmlFor="override-reason" className="label">Reason (required, recorded in the audit trail)</label>
              <textarea id="override-reason" name="reason" className="input" required minLength={10} maxLength={500} />
            </div>
            <SubmitButton size="sm">Record override</SubmitButton>
          </ActionForm>
          {incident.priorityOverridden ? (
            <ActionForm action={clearOverrideAction} className="mt-3 border-t border-line pt-3">
              <input type="hidden" name="id" value={incident.id} />
              <input type="hidden" name="version" value={incident.version} />
              <SubmitButton variant="secondary" size="sm">Clear override and use the calculated priority</SubmitButton>
            </ActionForm>
          ) : null}
        </details>

        {overrides.length > 0 ? (
          <div>
            <h3 className="text-sm font-semibold">Override history</h3>
            <ul className="mt-1 space-y-2 text-sm">
              {overrides.map((override) => (
                <li key={override.id} className="rounded-md bg-navy-50 px-3 py-2">
                  {override.previousBand ? PRIORITY_LABELS[override.previousBand] : "Unset"} → {PRIORITY_LABELS[override.band]}
                  <span className="text-ink-muted"> · {formatDateTime(override.createdAt)}</span>
                  <span className="block text-xs">Reason: {override.overrideReason}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </CardBody>
    </Card>
  );
}
