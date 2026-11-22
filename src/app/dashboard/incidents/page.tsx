import { SearchX } from "lucide-react";
import Link from "next/link";
import { AssignmentBadge, Badge, PriorityBadge, StatusBadge } from "@/components/ui/badges";
import { ButtonLink, buttonClasses } from "@/components/ui/button";
import { Card, EmptyState, PageHeader } from "@/components/ui/layout";
import { requireCoordinatorSession } from "@/lib/auth/session";
import { CATEGORY_DEFINITIONS, INCIDENT_CATEGORIES, categoryLabel, isIncidentCategory } from "@/lib/domain/categories";
import { INCIDENT_STATUSES, PRIORITY_BANDS, PRIORITY_LABELS, STATUS_LABELS, type IncidentStatus, type PriorityBand } from "@/lib/domain/types";
import { formatDateTime } from "@/lib/format";
import { listIncidents, type IncidentFilters } from "@/lib/services/incidents";

type SearchParams = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined): string => (Array.isArray(value) ? (value[0] ?? "") : (value ?? ""));

const oneOf = <T extends string>(value: string, allowed: readonly T[]): T | undefined =>
  (allowed as readonly string[]).includes(value) ? (value as T) : undefined;

function parseDate(value: string, endOfDay: boolean): Date | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}+02:00`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function parseFilters(params: SearchParams): IncidentFilters {
  const category = first(params.category);
  return {
    search: first(params.q).trim().slice(0, 100) || undefined,
    priority: oneOf<PriorityBand>(first(params.priority), PRIORITY_BANDS),
    category: isIncidentCategory(category) ? category : undefined,
    status: oneOf<IncidentStatus>(first(params.status), INCIDENT_STATUSES),
    assignment: oneOf(first(params.assignment), ["assigned", "unassigned"] as const),
    review: oneOf(first(params.review), ["needs_review", "overridden", "duplicate"] as const),
    from: parseDate(first(params.from), false),
    to: parseDate(first(params.to), true),
    sort: oneOf(first(params.sort), ["newest", "oldest", "priority"] as const) ?? "newest",
    page: Math.max(1, Number.parseInt(first(params.page), 10) || 1),
  };
}

function pageHref(params: SearchParams, page: number): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    const single = first(value);
    if (single && key !== "page") query.set(key, single);
  }
  query.set("page", String(page));
  return `/dashboard/incidents?${query.toString()}`;
}

export const metadata = { title: "Incidents" };

export default async function IncidentsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { actor } = await requireCoordinatorSession();
  const params = await searchParams;
  const result = await listIncidents(actor, parseFilters(params));
  const value = (key: string) => first(params[key]);

  return (
    <>
      <PageHeader
        title="Incidents"
        description={`${result.totalCount} incident${result.totalCount === 1 ? "" : "s"} match the current filters.`}
        actions={
          <a href="/api/export/incidents" className={buttonClasses("secondary")} download>
            Export all as CSV
          </a>
        }
      />

      <Card className="mb-4">
        <form method="get" className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4" role="search" aria-label="Filter incidents">
          <div className="sm:col-span-2">
            <label htmlFor="q" className="label">Search reference, title or address</label>
            <input id="q" name="q" type="search" className="input" defaultValue={value("q")} />
          </div>
          <div>
            <label htmlFor="priority" className="label">Priority</label>
            <select id="priority" name="priority" className="input" defaultValue={value("priority")}>
              <option value="">Any</option>
              {PRIORITY_BANDS.map((band) => <option key={band} value={band}>{PRIORITY_LABELS[band]}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="status" className="label">Status</label>
            <select id="status" name="status" className="input" defaultValue={value("status")}>
              <option value="">Any</option>
              {INCIDENT_STATUSES.map((status) => <option key={status} value={status}>{STATUS_LABELS[status]}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="category" className="label">Category</label>
            <select id="category" name="category" className="input" defaultValue={value("category")}>
              <option value="">Any</option>
              {INCIDENT_CATEGORIES.map((category) => <option key={category} value={category}>{CATEGORY_DEFINITIONS[category].label}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="assignment" className="label">Assignment</label>
            <select id="assignment" name="assignment" className="input" defaultValue={value("assignment")}>
              <option value="">Any</option>
              <option value="assigned">Has a current assignment</option>
              <option value="unassigned">No current assignment</option>
            </select>
          </div>
          <div>
            <label htmlFor="review" className="label">Review state</label>
            <select id="review" name="review" className="input" defaultValue={value("review")}>
              <option value="">Any</option>
              <option value="needs_review">Needs review</option>
              <option value="overridden">Priority manually adjusted</option>
              <option value="duplicate">Confirmed duplicate</option>
            </select>
          </div>
          <div>
            <label htmlFor="sort" className="label">Sort by</label>
            <select id="sort" name="sort" className="input" defaultValue={value("sort") || "newest"}>
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="priority">Highest priority first</option>
            </select>
          </div>
          <div>
            <label htmlFor="from" className="label">Reported from</label>
            <input id="from" name="from" type="date" className="input" defaultValue={value("from")} />
          </div>
          <div>
            <label htmlFor="to" className="label">Reported to</label>
            <input id="to" name="to" type="date" className="input" defaultValue={value("to")} />
          </div>
          <div className="flex items-end gap-2 sm:col-span-2">
            <button type="submit" className={buttonClasses("primary")}>Apply filters</button>
            <ButtonLink href="/dashboard/incidents" variant="ghost">Clear</ButtonLink>
          </div>
        </form>
      </Card>

      <Card>
        {result.items.length === 0 ? (
          <EmptyState icon={SearchX} title="No incidents match these filters">
            Clear the filters to see every incident, or wait for new citizen reports.
          </EmptyState>
        ) : (
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[820px] border-collapse">
              <caption className="sr-only">Incidents matching the current filters</caption>
              <thead>
                <tr>
                  <th scope="col" className="table-header">Reference</th>
                  <th scope="col" className="table-header">Incident</th>
                  <th scope="col" className="table-header">Location</th>
                  <th scope="col" className="table-header">Priority</th>
                  <th scope="col" className="table-header">Status</th>
                  <th scope="col" className="table-header">Reported</th>
                  <th scope="col" className="table-header">Crew</th>
                  <th scope="col" className="table-header"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {result.items.map((incident) => (
                  <tr key={incident.id} className="hover:bg-navy-50/50">
                    <td className="table-cell font-mono text-xs whitespace-nowrap">{incident.reference}</td>
                    <td className="table-cell">
                      <span className="font-medium text-navy-900">{incident.title}</span>
                      <span className="block text-xs text-ink-muted">{categoryLabel(incident.category)}</span>
                      {incident.duplicateOfId ? <Badge tone="navy" className="mt-1">Confirmed duplicate</Badge> : null}
                    </td>
                    <td className="table-cell text-xs">
                      {incident.address ?? <span className="text-ink-muted">No address given</span>}
                      <span className="block text-ink-muted">{incident.latitude.toFixed(5)}, {incident.longitude.toFixed(5)}</span>
                    </td>
                    <td className="table-cell">
                      <PriorityBadge band={incident.priorityBand} overridden={incident.priorityOverridden} />
                      {incident.priorityScore !== null ? <span className="mt-0.5 block text-xs text-ink-muted tabular-nums">Score {incident.priorityScore.toFixed(2)}</span> : null}
                    </td>
                    <td className="table-cell"><StatusBadge status={incident.status} /></td>
                    <td className="table-cell text-xs whitespace-nowrap">{formatDateTime(incident.createdAt)}</td>
                    <td className="table-cell text-xs">
                      {incident.crewName ? (
                        <>
                          {incident.crewName}
                          {incident.assignmentStatus ? <span className="mt-1 block"><AssignmentBadge status={incident.assignmentStatus} /></span> : null}
                        </>
                      ) : (
                        <span className="text-ink-muted">Unassigned</span>
                      )}
                    </td>
                    <td className="table-cell text-right">
                      <Link href={`/dashboard/incidents/${incident.id}`} className={buttonClasses("secondary", "sm")}>
                        Open<span className="sr-only"> {incident.reference}</span>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {result.pageCount > 1 ? (
          <nav aria-label="Pagination" className="flex items-center justify-between gap-3 border-t border-line px-4 py-3 text-sm">
            <span>Page {result.page} of {result.pageCount}</span>
            <span className="flex gap-2">
              {result.page > 1 ? <ButtonLink href={pageHref(params, result.page - 1)} variant="secondary" size="sm">Previous</ButtonLink> : null}
              {result.page < result.pageCount ? <ButtonLink href={pageHref(params, result.page + 1)} variant="secondary" size="sm">Next</ButtonLink> : null}
            </span>
          </nav>
        ) : null}
      </Card>
    </>
  );
}
