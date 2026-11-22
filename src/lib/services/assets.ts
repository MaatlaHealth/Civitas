import { asc, eq } from "drizzle-orm";
import { requireCoordinator, type StaffActor } from "@/lib/auth/actor";
import { getDb } from "@/lib/db/client";
import { infrastructureAssets } from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import type { AssetInput } from "@/lib/validation/schemas";
import { recordAudit } from "./core";

/**
 * The asset registry holds only what coordinators enter, each record with
 * its stated source. Civitas never creates asset records by itself.
 */
export async function listAssets(actor: StaffActor | null) {
  const coordinator = requireCoordinator(actor);
  const db = await getDb();
  return db
    .select()
    .from(infrastructureAssets)
    .where(eq(infrastructureAssets.organizationId, coordinator.organizationId))
    .orderBy(asc(infrastructureAssets.name));
}

export async function createAsset(actor: StaffActor | null, input: AssetInput): Promise<void> {
  const coordinator = requireCoordinator(actor);
  const db = await getDb();
  const [asset] = await db
    .insert(infrastructureAssets)
    .values({ ...input, organizationId: coordinator.organizationId })
    .returning({ id: infrastructureAssets.id });
  if (!asset) throw new AppError("unavailable", "The asset could not be saved.");
  await recordAudit(db, {
    organizationId: coordinator.organizationId,
    actorKind: "coordinator",
    actorUserId: coordinator.userId,
    action: "asset.created",
    entityType: "infrastructure_asset",
    entityId: asset.id,
    detail: { name: input.name, assetType: input.assetType, verified: input.verified, source: input.source },
  });
}

export async function setAssetVerified(actor: StaffActor | null, assetId: string, verified: boolean): Promise<void> {
  const coordinator = requireCoordinator(actor);
  const db = await getDb();
  const [updated] = await db
    .update(infrastructureAssets)
    .set({ verified, updatedAt: new Date() })
    .where(eq(infrastructureAssets.id, assetId))
    .returning({ id: infrastructureAssets.id });
  if (!updated) throw new AppError("not_found", "Asset not found.");
  await recordAudit(db, {
    organizationId: coordinator.organizationId,
    actorKind: "coordinator",
    actorUserId: coordinator.userId,
    action: "asset.verification_changed",
    entityType: "infrastructure_asset",
    entityId: assetId,
    detail: { verified },
  });
}

export async function deleteAsset(actor: StaffActor | null, assetId: string): Promise<void> {
  const coordinator = requireCoordinator(actor);
  const db = await getDb();
  const [deleted] = await db
    .delete(infrastructureAssets)
    .where(eq(infrastructureAssets.id, assetId))
    .returning({ id: infrastructureAssets.id, name: infrastructureAssets.name });
  if (!deleted) throw new AppError("not_found", "Asset not found.");
  await recordAudit(db, {
    organizationId: coordinator.organizationId,
    actorKind: "coordinator",
    actorUserId: coordinator.userId,
    action: "asset.deleted",
    entityType: "infrastructure_asset",
    entityId: assetId,
    detail: { name: deleted.name },
  });
}
