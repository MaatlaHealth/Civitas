import { BarChart3 } from "lucide-react";
import { CountChart } from "@/components/analytics/count-chart";
import { PRIORITY_COLORS } from "@/components/ui/badges";
import { buttonClasses } from "@/components/ui/button";
import { Card, CardBody, CardHeader, EmptyState, Notice, PageHeader } from "@/components/ui/layout";
import { requireCoordinatorSession } from "@/lib/auth/session";
import { formatHours, formatPercent } from "@/lib/format";
import { getAnalytics, MIN_RELIABLE_SAMPLE } from "@/lib/services/analytics";

export const metadata = { title: "Analytics" };

function RateCard({ label, value, basis }: { label: string; value: string; basis: string }) {
  return (
    <div className="rounded-lg border border-line bg-white px-4 py-3 shadow-xs">
      <p className="text-3xl font-bold text-navy-900 tabular-nums">{value}</p>
      <p className="mt-0.5 text-sm font-medium text-navy-900">{label}</p>
      <p className="mt-1 text-xs text-ink-muted">{basis}</p>
    </div>
  );
}

export default async function AnalyticsPage() {
  const { actor } = await requireCoordinatorSession();
  const analytics = await getAnalytics(actor);
  const exportButton = (
    <a href="/api/export/incidents" className={buttonClasses("secondary")} download>
      Export incidents as CSV
    </a>
  );

  if (analytics.totalIncidents === 0) {
    return (
      <>
        <PageHeader title="Operational analytics" actions={exportButton} />
        <Card>
          <EmptyState icon={BarChart3} title="No incidents have been recorded yet">
            Analytics are calculated only from stored records, so there is nothing to show until reports are submitted.
          </EmptyState>
        </Card>
      </>
    );
  }

  const { duplicates, assignments } = analytics;
  return (
    <>
      <PageHeader
        title="Operational analytics"
        description={`Calculated from ${analytics.totalIncidents} stored incident${analytics.totalIncidents === 1 ? "" : "s"} when this page loaded. Nothing here is estimated or projected.`}
        actions={exportButton}
      />
      {analytics.totalIncidents < MIN_RELIABLE_SAMPLE ? (
        <Notice tone="warning" className="mb-6" title="Very small sample">
          With fewer than {MIN_RELIABLE_SAMPLE} incidents, rates and averages on this page describe individual cases and
          should not be read as trends.
        </Notice>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <RateCard
          label="Duplicate detection rate"
          value={duplicates.detectionRate === null ? "n/a" : formatPercent(duplicates.detectionRate)}
          basis={`${duplicates.flaggedIncidents} of ${analytics.totalIncidents} reports were flagged as a possible duplicate of an earlier report.`}
        />
        <RateCard
          label="Duplicate reviews"
          value={`${duplicates.confirmed} / ${duplicates.rejected} / ${duplicates.pending}`}
          basis="Candidate pairs confirmed / rejected / still awaiting review."
        />
        <RateCard
          label="Assignment completion rate"
          value={assignments.completionRate === null ? "n/a" : formatPercent(assignments.completionRate)}
          basis={
            assignments.approved === 0
              ? "No assignments have been approved yet."
              : `${assignments.verifiedComplete} of ${assignments.approved} approved assignments were completed and verified.`
          }
        />
        <RateCard label="Total incidents" value={String(analytics.totalIncidents)} basis="All stored reports, including closed and rejected ones." />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="Reports by category" />
          <CardBody><CountChart title="Reports by category" data={analytics.byCategory} /></CardBody>
        </Card>
        <Card>
          <CardHeader title="Reports by priority" description="Current priority band of every stored incident." />
          <CardBody><CountChart title="Reports by priority" data={analytics.byPriority} colors={PRIORITY_COLORS} /></CardBody>
        </Card>
        <Card>
          <CardHeader title="Reports by status" />
          <CardBody><CountChart title="Reports by status" data={analytics.byStatus} /></CardBody>
        </Card>
        <Card>
          <CardHeader title="Time between workflow stages" description="Measured from the first time each incident reached each status." />
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[480px] border-collapse">
              <caption className="sr-only">Time between workflow stages</caption>
              <thead>
                <tr>
                  <th scope="col" className="table-header">Stage</th>
                  <th scope="col" className="table-header text-right">Incidents measured</th>
                  <th scope="col" className="table-header text-right">Median</th>
                  <th scope="col" className="table-header text-right">Mean</th>
                </tr>
              </thead>
              <tbody>
                {analytics.durations.map((duration) => (
                  <tr key={duration.label}>
                    <th scope="row" className="table-cell text-left font-medium">
                      {duration.label}
                      {duration.sampleSize > 0 && duration.sampleSize < MIN_RELIABLE_SAMPLE ? (
                        <span className="block text-xs font-normal text-amber-700">Small sample: indicative only</span>
                      ) : null}
                    </th>
                    <td className="table-cell text-right tabular-nums">{duration.sampleSize}</td>
                    <td className="table-cell text-right tabular-nums">{duration.medianHours === null ? "No data yet" : formatHours(duration.medianHours)}</td>
                    <td className="table-cell text-right tabular-nums">{duration.meanHours === null ? "No data yet" : formatHours(duration.meanHours)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </>
  );
}
