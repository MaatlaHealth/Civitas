import { PriorityBadge } from "@/components/ui/badges";
import { Notice } from "@/components/ui/layout";
import { PRIORITY_BANDS, PRIORITY_LABELS, type PriorityBand } from "@/lib/domain/types";
import { DEFAULT_ASSIGNMENT_CONFIG, type Plan } from "@/lib/engines/assignment";

export interface ResultIncident {
  id: string;
  label: string;
  title: string;
  priorityBand: PriorityBand;
}

interface PlanResultsProps {
  fifo: Plan | null;
  civitas: Plan | null;
  incidents: ResultIncident[];
  crewNames: Record<string, string>;
}

const STRATEGY_TITLES = {
  fifo: "A. First-in-first-out baseline",
  civitas: "B. Civitas resource-aware plan",
} as const;

const STRATEGY_DESCRIPTIONS = {
  fifo: "Incidents are taken strictly in the order reported. Each goes to the qualified, available crew with the shortest queue. Priority and distance are ignored.",
  civitas: "Minimises total priority-weighted waiting time across all incidents and crew capacity slots (Hungarian algorithm). Optimal for this cost model only.",
} as const;

function formatDelta(baseline: number, candidate: number, unit: string): string {
  const delta = candidate - baseline;
  if (Math.abs(delta) < 0.05) return "No difference";
  return `${delta > 0 ? "+" : "−"}${Math.abs(delta).toFixed(1)} ${unit}`.trim();
}

function MetricsTable({ fifo, civitas }: { fifo: Plan | null; civitas: Plan | null }) {
  const rows: Array<{ label: string; value: (plan: Plan) => number; unit: string; digits: number }> = [
    { label: "Feasible assignments", value: (plan) => plan.metrics.feasibleAssignments, unit: "", digits: 0 },
    { label: "Unassigned incidents", value: (plan) => plan.metrics.unassignedIncidents, unit: "", digits: 0 },
    { label: "Priority-weighted waiting time (assigned incidents)", value: (plan) => plan.metrics.weightedWaitMinutes, unit: "weighted min", digits: 1 },
    { label: "Total straight-line travel distance", value: (plan) => plan.metrics.totalStraightLineKm, unit: "km", digits: 2 },
  ];
  const cell = (plan: Plan | null, row: (typeof rows)[number]) =>
    plan ? `${row.value(plan).toFixed(row.digits)}${row.unit && row.digits > 0 ? ` ${row.unit}` : ""}` : "Not run";

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] border-collapse" data-testid="plan-metrics">
        <caption className="sr-only">Comparison of planning strategies</caption>
        <thead>
          <tr>
            <th scope="col" className="table-header">Metric</th>
            <th scope="col" className="table-header text-right">A. FIFO</th>
            <th scope="col" className="table-header text-right">B. Civitas</th>
            <th scope="col" className="table-header text-right">Difference (B − A)</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label}>
              <th scope="row" className="table-cell text-left font-medium">{row.label}</th>
              <td className="table-cell text-right tabular-nums">{cell(fifo, row)}</td>
              <td className="table-cell text-right tabular-nums">{cell(civitas, row)}</td>
              <td className="table-cell text-right tabular-nums">
                {fifo && civitas ? formatDelta(row.value(fifo), row.value(civitas), row.digits > 0 ? row.unit : "") : "Run both"}
              </td>
            </tr>
          ))}
          {PRIORITY_BANDS.filter((band) => (fifo ?? civitas)?.metrics.coverageByPriority[band].total).map((band) => {
            const coverage = (plan: Plan | null) =>
              plan ? `${plan.metrics.coverageByPriority[band].assigned} of ${plan.metrics.coverageByPriority[band].total}` : "Not run";
            return (
              <tr key={band}>
                <th scope="row" className="table-cell text-left font-medium">{PRIORITY_LABELS[band]} incidents assigned</th>
                <td className="table-cell text-right tabular-nums">{coverage(fifo)}</td>
                <td className="table-cell text-right tabular-nums">{coverage(civitas)}</td>
                <td className="table-cell" />
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function PlanDetail({ plan, incidents, crewNames }: { plan: Plan; incidents: ResultIncident[]; crewNames: Record<string, string> }) {
  const incidentById = new Map(incidents.map((incident) => [incident.id, incident]));
  return (
    <section aria-label={STRATEGY_TITLES[plan.strategy]} className="min-w-0 rounded-lg border border-line bg-white" data-testid={`plan-${plan.strategy}`}>
      <header className="border-b border-line px-4 py-3">
        <h3 className="text-base font-semibold">{STRATEGY_TITLES[plan.strategy]}</h3>
        <p className="mt-0.5 text-xs text-ink-muted">{STRATEGY_DESCRIPTIONS[plan.strategy]}</p>
      </header>
      <ol className="divide-y divide-line">
        {plan.assignments.map((assignment) => {
          const incident = incidentById.get(assignment.incidentId);
          return (
            <li key={assignment.incidentId} className="px-4 py-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs">{incident?.label}</span>
                {incident ? <PriorityBadge band={incident.priorityBand} /> : null}
                <span aria-hidden>→</span>
                <span className="font-semibold text-navy-900">{crewNames[assignment.crewId]}</span>
              </div>
              <p className="mt-0.5">{incident?.title}</p>
              <p className="text-xs text-ink-muted">
                Estimated wait {Math.round(assignment.waitMinutes)} min ({assignment.straightLineKm} km straight line
                {assignment.queuePosition > 0 ? `, ${assignment.queuePosition} job${assignment.queuePosition === 1 ? "" : "s"} ahead` : ""})
              </p>
              <details className="mt-1">
                <summary className="cursor-pointer text-xs font-medium text-teal-700">Reasoning</summary>
                <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs">
                  {assignment.reasons.map((reason) => <li key={reason}>{reason}</li>)}
                  <li>
                    Priority weight {assignment.priorityWeight} × wait {assignment.waitMinutes} min = cost {assignment.weightedWaitMinutes}.
                  </li>
                </ul>
              </details>
            </li>
          );
        })}
        {plan.assignments.length === 0 ? <li className="px-4 py-3 text-sm text-ink-muted">No incident could be assigned.</li> : null}
      </ol>
      {plan.unassigned.length > 0 ? (
        <div className="border-t border-line bg-amber-50 px-4 py-3">
          <h4 className="text-sm font-semibold text-navy-900">Unassigned ({plan.unassigned.length})</h4>
          <ul className="mt-1 space-y-1 text-sm">
            {plan.unassigned.map((entry) => {
              const incident = incidentById.get(entry.incidentId);
              return (
                <li key={entry.incidentId}>
                  <span className="font-mono text-xs">{incident?.label}</span> {incident?.title}
                  <span className="block text-xs text-navy-900">{entry.reason}</span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

/** Honest reading of the comparison, including when the Civitas plan is not better. */
function ComparisonSummary({ fifo, civitas }: { fifo: Plan; civitas: Plan }) {
  const waitDelta = civitas.metrics.weightedWaitMinutes - fifo.metrics.weightedWaitMinutes;
  const assignedDelta = civitas.metrics.feasibleAssignments - fifo.metrics.feasibleAssignments;
  const kmDelta = civitas.metrics.totalStraightLineKm - fifo.metrics.totalStraightLineKm;

  const statements: string[] = [];
  if (assignedDelta !== 0) {
    statements.push(
      `The Civitas plan assigns ${Math.abs(assignedDelta)} ${assignedDelta > 0 ? "more" : "fewer"} incident${Math.abs(assignedDelta) === 1 ? "" : "s"} than FIFO, so the waiting-time totals cover different sets of incidents and are not directly comparable.`,
    );
  }
  if (Math.abs(waitDelta) < 0.05) statements.push("Both plans have the same priority-weighted waiting time for these inputs.");
  else if (waitDelta < 0) statements.push(`Priority-weighted waiting time is ${Math.abs(waitDelta).toFixed(1)} weighted minutes lower under the Civitas plan.`);
  else statements.push(`Priority-weighted waiting time is ${waitDelta.toFixed(1)} weighted minutes higher under the Civitas plan.`);
  if (kmDelta > 0.05) {
    statements.push(`The Civitas plan uses ${kmDelta.toFixed(2)} km more straight-line travel: it trades distance for getting to higher-priority incidents sooner.`);
  } else if (kmDelta < -0.05) {
    statements.push(`The Civitas plan also uses ${Math.abs(kmDelta).toFixed(2)} km less straight-line travel.`);
  }

  return (
    <Notice tone={waitDelta > 0.05 && assignedDelta <= 0 ? "warning" : "info"} title="Reading this comparison" live>
      <ul className="list-disc space-y-1 pl-5" data-testid="comparison-summary">
        {statements.map((statement) => <li key={statement}>{statement}</li>)}
      </ul>
    </Notice>
  );
}

export function PlanResults({ fifo, civitas, incidents, crewNames }: PlanResultsProps) {
  if (!fifo && !civitas) return null;
  const config = DEFAULT_ASSIGNMENT_CONFIG;
  return (
    <div className="space-y-4">
      <MetricsTable fifo={fifo} civitas={civitas} />
      {fifo && civitas ? <ComparisonSummary fifo={fifo} civitas={civitas} /> : null}
      <div className="grid gap-4 xl:grid-cols-2">
        {fifo ? <PlanDetail plan={fifo} incidents={incidents} crewNames={crewNames} /> : null}
        {civitas ? <PlanDetail plan={civitas} incidents={incidents} crewNames={crewNames} /> : null}
      </div>
      <p className="text-xs text-ink-muted">
        Assumptions: distances are straight-line (Haversine) from each crew&apos;s operating base, not road distances;
        travel time assumes {config.averageSpeedKmh} km/h; each job is assumed to take {config.serviceMinutes} minutes;
        priority weights are critical {config.priorityWeights.critical}, high {config.priorityWeights.high}, moderate{" "}
        {config.priorityWeights.moderate}, low {config.priorityWeights.low}. These are estimates for comparing plans,
        not predictions of real response times, and no cost savings are implied.
      </p>
    </div>
  );
}
