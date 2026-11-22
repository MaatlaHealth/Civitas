import { Building2 } from "lucide-react";
import { Badge } from "@/components/ui/badges";
import { Card, CardBody, CardHeader, EmptyState } from "@/components/ui/layout";
import { ASSET_TYPE_LABELS } from "@/lib/domain/types";
import { SCREENING_CAVEAT, type ScreeningResult } from "@/lib/engines/screening";
import { formatDistance } from "@/lib/geo/haversine";

/** Registered assets near an incident. Used by the incident view and the training scenario. */
export function ScreeningFindings({ screening }: { screening: ScreeningResult }) {
  if (screening.findings.length === 0) {
    return (
      <EmptyState icon={Building2} title="No registered assets nearby">
        No asset in the registry is within {formatDistance(screening.radiusMeters)} of this incident. This does not mean
        no infrastructure is nearby; the registry only contains what coordinators have entered.
      </EmptyState>
    );
  }
  return (
    <ul className="space-y-3">
      {screening.findings.map((finding) => (
        <li key={finding.assetId} className="rounded-md border border-line p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-navy-900">{finding.assetName}</span>
            <Badge tone="navy">{ASSET_TYPE_LABELS[finding.assetType]}</Badge>
            <Badge tone={finding.verified ? "green" : "amber"}>{finding.verified ? "Verified record" : "Unverified record"}</Badge>
            <span className="text-sm text-ink-muted">{formatDistance(finding.distanceMeters)} (straight line)</span>
          </div>
          <p className="mt-1.5 text-sm">{finding.relevance ?? "No screening rule connects this incident category to this asset type."}</p>
          <p className="mt-1 text-xs text-ink-muted">Importance: {finding.importance}. Source: {finding.source}</p>
        </li>
      ))}
    </ul>
  );
}

export function ScreeningPanel({ screening }: { screening: ScreeningResult }) {
  return (
    <Card>
      <CardHeader
        title="Consequence screening"
        description={`Registered assets within ${formatDistance(screening.radiusMeters)}. ${SCREENING_CAVEAT}`}
      />
      <CardBody>
        <ScreeningFindings screening={screening} />
      </CardBody>
    </Card>
  );
}
