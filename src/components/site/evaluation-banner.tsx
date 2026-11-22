import { openAccessEnabled } from "@/lib/services/open-access";

/**
 * Shown on every page when the deployment is an evaluation instance, so
 * nobody mistakes it for a service operated by a municipality. When
 * name-only sign-in is on, it also says that submitted details are not private.
 */
export function EvaluationBanner() {
  const openAccess = openAccessEnabled();
  if (process.env.NEXT_PUBLIC_DEPLOYMENT_MODE !== "evaluation" && !openAccess) return null;
  return (
    <div role="note" className="bg-amber-100 px-4 py-1.5 text-center text-xs font-medium text-navy-950">
      Evaluation site for EvoHacks 2. Civitas is not connected to any municipality, so reports made here will not reach
      a repair team. {openAccess ? "Anyone can sign in and read what is submitted, so please use made-up details. " : ""}
      In an emergency, call your local emergency number.
    </div>
  );
}
