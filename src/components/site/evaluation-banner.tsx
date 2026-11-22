/**
 * Shown on every page when the deployment is an evaluation instance, so
 * nobody mistakes it for a service operated by a municipality.
 */
export function EvaluationBanner() {
  if (process.env.NEXT_PUBLIC_DEPLOYMENT_MODE !== "evaluation") return null;
  return (
    <div role="note" className="bg-amber-100 px-4 py-1.5 text-center text-xs font-medium text-navy-950">
      Evaluation deployment for EvoHacks 2. Civitas is not connected to any municipality and reports submitted here will
      not reach a repair team. In an emergency, call your local emergency number.
    </div>
  );
}
