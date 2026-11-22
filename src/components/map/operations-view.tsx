"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { PriorityBadge, StatusBadge } from "@/components/ui/badges";
import { buttonClasses } from "@/components/ui/button";
import { CATEGORY_DEFINITIONS, INCIDENT_CATEGORIES, type IncidentCategory } from "@/lib/domain/categories";
import { PRIORITY_BANDS, PRIORITY_LABELS, STATUS_LABELS, type IncidentStatus, type PriorityBand } from "@/lib/domain/types";
import { LazyOperationsMap } from "./lazy";
import type { MapPoint } from "./operations-map";

export interface OperationsIncident {
  id: string;
  reference: string;
  title: string;
  category: IncidentCategory;
  status: IncidentStatus;
  priorityBand: PriorityBand;
  latitude: number;
  longitude: number;
  address: string | null;
  reportedAt: string;
}

interface OperationsViewProps {
  incidents: OperationsIncident[];
  crews: MapPoint[];
  assets: MapPoint[];
}

/** Map with filters and a synchronised incident list, which is the non-map way to reach every incident. */
export function OperationsView({ incidents, crews, assets }: OperationsViewProps) {
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState("");
  const [showCrews, setShowCrews] = useState(true);
  const [showAssets, setShowAssets] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const visible = useMemo(
    () =>
      incidents.filter(
        (incident) =>
          (!category || incident.category === category) &&
          (!status || incident.status === status) &&
          (!priority || incident.priorityBand === priority),
      ),
    [incidents, category, status, priority],
  );
  const statuses = useMemo(() => [...new Set(incidents.map((incident) => incident.status))], [incidents]);
  const selected = visible.find((incident) => incident.id === selectedId) ?? null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-line bg-white p-3">
        <div>
          <label htmlFor="map-category" className="label">Category</label>
          <select id="map-category" className="input" value={category} onChange={(event) => setCategory(event.target.value)}>
            <option value="">All categories</option>
            {INCIDENT_CATEGORIES.map((key) => <option key={key} value={key}>{CATEGORY_DEFINITIONS[key].label}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="map-status" className="label">Status</label>
          <select id="map-status" className="input" value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">All open statuses</option>
            {statuses.map((key) => <option key={key} value={key}>{STATUS_LABELS[key]}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="map-priority" className="label">Priority</label>
          <select id="map-priority" className="input" value={priority} onChange={(event) => setPriority(event.target.value)}>
            <option value="">All priorities</option>
            {PRIORITY_BANDS.map((band) => <option key={band} value={band}>{PRIORITY_LABELS[band]}</option>)}
          </select>
        </div>
        <label className="flex items-center gap-2 pb-2 text-sm">
          <input type="checkbox" className="size-4" checked={showCrews} onChange={(event) => setShowCrews(event.target.checked)} />
          Crew bases ({crews.length})
        </label>
        <label className="flex items-center gap-2 pb-2 text-sm">
          <input type="checkbox" className="size-4" checked={showAssets} onChange={(event) => setShowAssets(event.target.checked)} />
          Registered assets ({assets.length})
        </label>
        <p className="pb-2 text-sm text-ink-muted" role="status">
          Showing {visible.length} of {incidents.length} open incidents.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <LazyOperationsMap
          incidents={visible}
          crews={showCrews ? crews : []}
          assets={showAssets ? assets : []}
          selectedId={selected?.id ?? null}
          onSelect={setSelectedId}
        />

        <div className="space-y-4">
          {selected ? (
            <section aria-live="polite" className="rounded-lg border-2 border-navy-900 bg-white p-4">
              <p className="font-mono text-xs text-ink-muted">{selected.reference}</p>
              <h2 className="text-base font-semibold">{selected.title}</h2>
              <p className="text-sm text-ink-muted">{CATEGORY_DEFINITIONS[selected.category].label}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <PriorityBadge band={selected.priorityBand} />
                <StatusBadge status={selected.status} />
              </div>
              <p className="mt-2 text-sm">{selected.address ?? "No address given"}</p>
              <p className="text-xs text-ink-muted">{selected.latitude.toFixed(5)}, {selected.longitude.toFixed(5)}</p>
              <Link href={`/dashboard/incidents/${selected.id}`} className={buttonClasses("primary", "sm", "mt-3")}>
                Open full incident record
              </Link>
            </section>
          ) : (
            <p className="rounded-lg border border-dashed border-line bg-white p-4 text-sm text-ink-muted">
              Select an incident on the map or in the list to see its summary. The full record shows photographs, AI
              observations, the priority explanation, duplicates and history.
            </p>
          )}

          <section aria-labelledby="map-incident-list" className="rounded-lg border border-line bg-white">
            <h2 id="map-incident-list" className="border-b border-line px-4 py-2.5 text-sm font-semibold">Incidents shown on the map</h2>
            {visible.length === 0 ? (
              <p className="p-4 text-sm text-ink-muted">No open incidents match these filters.</p>
            ) : (
              <ul className="max-h-[420px] divide-y divide-line overflow-auto">
                {visible.map((incident) => (
                  <li key={incident.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(incident.id)}
                      aria-pressed={incident.id === selectedId}
                      className={`block w-full px-4 py-2.5 text-left hover:bg-navy-50 ${incident.id === selectedId ? "bg-navy-50" : ""}`}
                    >
                      <span className="block text-sm font-medium text-navy-900">{incident.title}</span>
                      <span className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-ink-muted">
                        <span className="font-mono">{incident.reference}</span>
                        <PriorityBadge band={incident.priorityBand} />
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
