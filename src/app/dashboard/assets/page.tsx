import { Building2 } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Badge } from "@/components/ui/badges";
import { Card, CardBody, CardHeader, EmptyState, Notice, PageHeader } from "@/components/ui/layout";
import { createAssetAction, deleteAssetAction, setAssetVerifiedAction } from "@/lib/actions/coordinator";
import { requireCoordinatorSession } from "@/lib/auth/session";
import { ASSET_IMPORTANCE, ASSET_TYPES, ASSET_TYPE_LABELS } from "@/lib/domain/types";
import { DEFAULT_SCREENING_CONFIG } from "@/lib/engines/screening";
import { formatDate } from "@/lib/format";
import { listAssets } from "@/lib/services/assets";

export const metadata = { title: "Asset registry" };

export default async function AssetsPage() {
  const { actor } = await requireCoordinatorSession();
  const assets = await listAssets(actor);

  return (
    <>
      <PageHeader
        title="Infrastructure asset registry"
        description={`Assets registered here are used for consequence screening: incidents within ${DEFAULT_SCREENING_CONFIG.radiusMeters} m of an asset are flagged for a coordinator to check.`}
      />
      <Notice className="mb-6" title="Only register assets you can source">
        Civitas never adds assets by itself and holds no built-in infrastructure data. Record where each entry comes
        from. Only entries marked as verified can raise an incident&apos;s priority score; unverified entries are shown
        for information.
      </Notice>

      <Card className="mb-6">
        {assets.length === 0 ? (
          <EmptyState icon={Building2} title="The registry is empty">
            Until assets are registered, consequence screening reports that no registered assets are nearby.
          </EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] border-collapse">
              <caption className="sr-only">Registered infrastructure assets</caption>
              <thead>
                <tr>
                  <th scope="col" className="table-header">Asset</th>
                  <th scope="col" className="table-header">Type</th>
                  <th scope="col" className="table-header">Coordinates</th>
                  <th scope="col" className="table-header">Importance</th>
                  <th scope="col" className="table-header">Source</th>
                  <th scope="col" className="table-header">Verification</th>
                  <th scope="col" className="table-header">Updated</th>
                  <th scope="col" className="table-header"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {assets.map((asset) => (
                  <tr key={asset.id}>
                    <td className="table-cell font-medium text-navy-900">
                      {asset.name}
                      {asset.notes ? <span className="block text-xs font-normal text-ink-muted">{asset.notes}</span> : null}
                    </td>
                    <td className="table-cell">{ASSET_TYPE_LABELS[asset.assetType]}</td>
                    <td className="table-cell text-xs tabular-nums">{asset.latitude.toFixed(5)}, {asset.longitude.toFixed(5)}</td>
                    <td className="table-cell capitalize">{asset.importance}</td>
                    <td className="table-cell text-xs">{asset.source}</td>
                    <td className="table-cell">
                      <Badge tone={asset.verified ? "green" : "amber"}>{asset.verified ? "Verified" : "Unverified"}</Badge>
                    </td>
                    <td className="table-cell text-xs whitespace-nowrap">{formatDate(asset.updatedAt)}</td>
                    <td className="table-cell">
                      <div className="flex flex-col gap-1">
                        <ActionForm action={setAssetVerifiedAction}>
                          <input type="hidden" name="id" value={asset.id} />
                          <input type="hidden" name="verified" value={asset.verified ? "false" : "true"} />
                          <SubmitButton variant="secondary" size="sm">{asset.verified ? "Mark unverified" : "Mark verified"}</SubmitButton>
                        </ActionForm>
                        <ActionForm action={deleteAssetAction} confirmMessage={`Remove ${asset.name} from the registry?`}>
                          <input type="hidden" name="id" value={asset.id} />
                          <SubmitButton variant="ghost" size="sm" className="text-red-800">Remove</SubmitButton>
                        </ActionForm>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card>
        <CardHeader title="Register an asset" />
        <CardBody>
          <ActionForm action={createAssetAction} resetOnSuccess className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="sm:col-span-2">
                <label htmlFor="asset-name" className="label">Asset name</label>
                <input id="asset-name" name="name" className="input" required minLength={2} maxLength={120} />
              </div>
              <div>
                <label htmlFor="asset-type" className="label">Type</label>
                <select id="asset-type" name="assetType" className="input">
                  {ASSET_TYPES.map((type) => <option key={type} value={type}>{ASSET_TYPE_LABELS[type]}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="asset-importance" className="label">Operational importance</label>
                <select id="asset-importance" name="importance" className="input" defaultValue="standard">
                  {ASSET_IMPORTANCE.map((level) => <option key={level} value={level} className="capitalize">{level}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="asset-latitude" className="label">Latitude</label>
                <input id="asset-latitude" name="latitude" className="input" inputMode="decimal" required />
              </div>
              <div>
                <label htmlFor="asset-longitude" className="label">Longitude</label>
                <input id="asset-longitude" name="longitude" className="input" inputMode="decimal" required />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="asset-source" className="label">Source of this record</label>
                <input id="asset-source" name="source" className="input" required minLength={3} maxLength={300} placeholder="For example: municipal GIS export, March 2026" />
              </div>
              <div className="sm:col-span-2 lg:col-span-3">
                <label htmlFor="asset-notes" className="label">Notes (optional)</label>
                <input id="asset-notes" name="notes" className="input" maxLength={500} />
              </div>
              <label className="flex items-center gap-2 self-end pb-2 text-sm">
                <input type="checkbox" name="verified" className="size-4" />
                I have verified this record
              </label>
            </div>
            <SubmitButton>Register asset</SubmitButton>
          </ActionForm>
        </CardBody>
      </Card>
    </>
  );
}
