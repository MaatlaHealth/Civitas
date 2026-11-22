"use client";

import { useMemo, useState } from "react";
import { PriorityBadge } from "@/components/ui/badges";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/layout";
import {
  CATEGORY_DEFINITIONS,
  CREW_SPECIALIZATIONS,
  SPECIALIZATION_LABELS,
  type CrewSpecialization,
  type IncidentCategory,
} from "@/lib/domain/categories";
import { CREW_STATUSES, CREW_STATUS_LABELS, type CrewStatus, type PriorityBand } from "@/lib/domain/types";
import { buildPlan, type Plan, type PlanCrew, type PlanIncident } from "@/lib/engines/assignment";
import { PlanResults } from "./plan-results";
import { ScenarioSchematic } from "./scenario-schematic";

export interface SimulatorIncident {
  id: string;
  label: string;
  title: string;
  category: IncidentCategory;
  priorityBand: PriorityBand;
  latitude: number;
  longitude: number;
  /** ISO timestamp; dates cannot cross the server/client boundary as objects. */
  reportedAt: string;
  eastKm?: number;
  northKm?: number;
}

export interface SimulatorCrew extends PlanCrew {
  eastKm?: number;
  northKm?: number;
}

interface PlanningSimulatorProps {
  incidents: SimulatorIncident[];
  crews: SimulatorCrew[];
  /** Draw the schematic grid (training scenario only; live data has real coordinates). */
  showSchematic?: boolean;
}

/**
 * What-if planning. Runs the same `buildPlan` engine the server uses, in the
 * browser, on the inputs shown. Editing a crew here changes only this
 * simulation; stored records are never modified.
 */
export function PlanningSimulator({ incidents, crews: initialCrews, showSchematic = false }: PlanningSimulatorProps) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set(incidents.map((incident) => incident.id)));
  const [crews, setCrews] = useState<SimulatorCrew[]>(initialCrews);
  const [fifo, setFifo] = useState<Plan | null>(null);
  const [civitas, setCivitas] = useState<Plan | null>(null);
  const [stale, setStale] = useState(false);

  const planIncidents = useMemo<PlanIncident[]>(
    () =>
      incidents
        .filter((incident) => selected.has(incident.id))
        .map((incident) => ({ ...incident, reportedAt: new Date(incident.reportedAt) })),
    [incidents, selected],
  );
  const crewNames = useMemo(() => Object.fromEntries(crews.map((crew) => [crew.id, crew.name])), [crews]);

  const markChanged = () => {
    if (fifo || civitas) setStale(true);
  };
  const toggleIncident = (id: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    markChanged();
  };
  const updateCrew = (id: string, patch: Partial<Pick<SimulatorCrew, "status" | "specialization">>) => {
    setCrews((current) => current.map((crew) => (crew.id === id ? { ...crew, ...patch } : crew)));
    markChanged();
  };

  const run = (strategy: "fifo" | "civitas" | "both") => {
    // Recompute any plan already on screen too, so both always reflect the current inputs.
    if (strategy !== "civitas" || fifo) setFifo(buildPlan("fifo", planIncidents, crews));
    if (strategy !== "fifo" || civitas) setCivitas(buildPlan("civitas", planIncidents, crews));
    setStale(false);
  };
  const reset = () => {
    setSelected(new Set(incidents.map((incident) => incident.id)));
    setCrews(initialCrews);
    setFifo(null);
    setCivitas(null);
    setStale(false);
  };

  if (incidents.length === 0) {
    return <Notice>There are no verified, unassigned incidents to plan at the moment.</Notice>;
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-2">
        <fieldset className="min-w-0 rounded-lg border border-line bg-white p-4">
          <legend className="px-1 text-sm font-semibold text-navy-900">Unresolved incidents to plan ({selected.size} of {incidents.length} selected)</legend>
          <ul className="relative max-h-96 space-y-1 overflow-auto">
            {incidents.map((incident) => (
              <li key={incident.id}>
                <label className="flex items-start gap-2.5 rounded-md px-2 py-1.5 text-sm hover:bg-navy-50">
                  <input type="checkbox" className="mt-0.5 size-4" checked={selected.has(incident.id)} onChange={() => toggleIncident(incident.id)} />
                  <span className="min-w-0">
                    <span className="font-mono text-xs">{incident.label}</span> <PriorityBadge band={incident.priorityBand} />
                    <span className="block">{incident.title}</span>
                    <span className="block text-xs text-ink-muted">{CATEGORY_DEFINITIONS[incident.category].label}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </fieldset>

        <div className="min-w-0 rounded-lg border border-line bg-white">
          <h3 className="border-b border-line px-4 py-3 text-sm font-semibold">Crews (edit to test what-if changes)</h3>
          {crews.length === 0 ? (
            <p className="p-4 text-sm text-ink-muted">No crews exist. Add crews on the Crews page.</p>
          ) : (
            <div className="relative overflow-x-auto">
              <table className="w-full min-w-[480px] border-collapse">
                <caption className="sr-only">Crews available to the simulation</caption>
                <thead>
                  <tr>
                    <th scope="col" className="table-header">Crew</th>
                    <th scope="col" className="table-header">Specialisation</th>
                    <th scope="col" className="table-header">Availability</th>
                    <th scope="col" className="table-header text-right">Free capacity</th>
                  </tr>
                </thead>
                <tbody>
                  {crews.map((crew) => (
                    <tr key={crew.id}>
                      <th scope="row" className="table-cell text-left font-medium">{crew.name}</th>
                      <td className="table-cell">
                        <select
                          aria-label={`Specialisation of ${crew.name}`}
                          className="input py-1"
                          value={crew.specialization}
                          onChange={(event) => updateCrew(crew.id, { specialization: event.target.value as CrewSpecialization })}
                        >
                          {CREW_SPECIALIZATIONS.map((key) => <option key={key} value={key}>{SPECIALIZATION_LABELS[key]}</option>)}
                        </select>
                      </td>
                      <td className="table-cell">
                        <select
                          aria-label={`Availability of ${crew.name}`}
                          className="input py-1"
                          value={crew.status}
                          onChange={(event) => updateCrew(crew.id, { status: event.target.value as CrewStatus })}
                        >
                          {CREW_STATUSES.map((key) => <option key={key} value={key}>{CREW_STATUS_LABELS[key]}</option>)}
                        </select>
                      </td>
                      <td className="table-cell text-right tabular-nums">{Math.max(0, crew.capacity - crew.activeWorkload)} of {crew.capacity}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" onClick={() => run("fifo")}>Run FIFO baseline</Button>
        <Button onClick={() => run("civitas")}>Run Civitas plan</Button>
        <Button variant="accent" onClick={() => run("both")}>Run both and compare</Button>
        <Button variant="ghost" onClick={reset}>Reset inputs</Button>
      </div>
      {stale ? (
        <Notice tone="warning" live>
          The inputs have changed since these results were calculated. Run the plans again to update them.
        </Notice>
      ) : null}

      {showSchematic ? <ScenarioSchematic incidents={incidents.filter((incident) => selected.has(incident.id))} crews={crews} plan={stale ? null : civitas} /> : null}

      <div className={stale ? "opacity-50" : undefined} aria-hidden={stale}>
        <PlanResults fifo={fifo} civitas={civitas} incidents={incidents} crewNames={crewNames} />
      </div>
    </div>
  );
}
