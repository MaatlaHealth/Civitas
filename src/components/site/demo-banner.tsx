import { openAccessEnabled } from "@/lib/services/open-access";

/**
 * Shown on every page of a demonstration site, so nobody mistakes it for a
 * service operated by a municipality. Set NEXT_PUBLIC_DEPLOYMENT_MODE=demo
 * to show it. It is always shown while name-only sign-in is on, and then
 * also says that submitted details are not private.
 */
export function DemoBanner() {
  const openAccess = openAccessEnabled();
  const mode = process.env.NEXT_PUBLIC_DEPLOYMENT_MODE;
  if (mode !== "demo" && mode !== "evaluation" && !openAccess) return null;
  return (
    <div role="note" className="bg-amber-100 px-4 py-1.5 text-center text-xs font-medium text-navy-950">
      This is a demonstration site. It is not connected to a municipality, so reports made here will not reach a repair
      team. {openAccess ? "Anyone can sign in and read what is submitted, so please use made-up details. " : ""}
      In an emergency, call your local emergency number.
    </div>
  );
}
