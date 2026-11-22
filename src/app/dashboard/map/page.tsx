import { OperationsView } from "@/components/map/operations-view";
import { PageHeader } from "@/components/ui/layout";
import { requireCoordinatorSession } from "@/lib/auth/session";
import { SPECIALIZATION_LABELS } from "@/lib/domain/categories";
import { ASSET_TYPE_LABELS, CREW_STATUS_LABELS } from "@/lib/domain/types";
import { listAssets } from "@/lib/services/assets";
import { listCrews } from "@/lib/services/crews";
import { listIncidentsForMap } from "@/lib/services/incidents";

export const metadata = { title: "Operations map" };

export default async function OperationsMapPage() {
  const { actor } = await requireCoordinatorSession();
  const [incidents, crews, assets] = await Promise.all([listIncidentsForMap(actor), listCrews(actor), listAssets(actor)]);

  return (
    <>
      <PageHeader
        title="Operations map"
        description="Open incidents, crew operating bases and registered assets, all drawn from stored records. Closed and rejected incidents are not shown."
      />
      <OperationsView
        incidents={incidents.map((incident) => ({ ...incident, reportedAt: incident.createdAt.toISOString() }))}
        crews={crews.map((crew) => ({
          id: crew.id,
          name: crew.name,
          detail: `${SPECIALIZATION_LABELS[crew.specialization]} · ${CREW_STATUS_LABELS[crew.status]} · base: ${crew.baseLabel}`,
          latitude: crew.baseLatitude,
          longitude: crew.baseLongitude,
        }))}
        assets={assets.map((asset) => ({
          id: asset.id,
          name: asset.name,
          detail: `${ASSET_TYPE_LABELS[asset.assetType]} · ${asset.verified ? "verified" : "unverified"} record`,
          latitude: asset.latitude,
          longitude: asset.longitude,
        }))}
      />
    </>
  );
}
