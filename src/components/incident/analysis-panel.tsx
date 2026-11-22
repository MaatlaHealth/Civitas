import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Badge } from "@/components/ui/badges";
import { Card, CardBody, CardHeader, Notice } from "@/components/ui/layout";
import { rerunAnalysisAction } from "@/lib/actions/coordinator";
import { categoryLabel } from "@/lib/domain/categories";
import { formatDateTime } from "@/lib/format";
import type { IncidentDetail } from "@/lib/services/incidents";

const CONSISTENCY_LABELS = {
  consistent: "Photograph and description agree",
  partially_consistent: "Photograph and description partly agree",
  inconsistent: "Photograph and description disagree",
  not_assessable: "Could not be assessed",
} as const;

const IMAGE_QUALITY_LABELS = { good: "Good", fair: "Fair", poor: "Poor", no_image: "No photograph supplied" } as const;

const ERROR_EXPLANATIONS: Record<string, string> = {
  timeout: "The AI service did not respond in time.",
  rate_limited: "The AI service is rate-limiting requests.",
  provider_error: "The AI service returned an error.",
  blocked: "The AI service declined to analyse this content.",
  invalid_response: "The AI service returned output that failed validation, so it was discarded.",
  network_error: "The AI service could not be reached.",
};

function ObservationList({ title, items, empty }: { title: string; items: string[]; empty: string }) {
  return (
    <div>
      <h3 className="text-sm font-semibold">{title}</h3>
      {items.length === 0 ? (
        <p className="text-sm text-ink-muted">{empty}</p>
      ) : (
        <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
          {items.map((item) => <li key={item}>{item}</li>)}
        </ul>
      )}
    </div>
  );
}

/**
 * Shows where each piece of interpretation came from: the reporter, the
 * deterministic keyword rules, or the AI model. AI content is always
 * labelled as such and as advisory.
 */
export function AnalysisPanel({ detail }: { detail: IncidentDetail }) {
  const { incident, analysis, ruleClassification } = detail;
  const result = analysis?.succeeded ? analysis.result : null;

  return (
    <Card>
      <CardHeader title="Interpretation" description="Sources are labelled. Nothing here changes the incident until a coordinator acts." />
      <CardBody className="space-y-5">
        <section aria-label="Reporter's classification">
          <Badge tone="navy">From the reporter</Badge>
          <p className="mt-1.5 text-sm">Category chosen: <strong>{categoryLabel(incident.reportedCategory)}</strong></p>
        </section>

        <section aria-label="Rule-based classification">
          <Badge tone="teal">Deterministic rules</Badge>
          <p className="mt-1.5 text-sm">
            {ruleClassification.suggestedCategory === null
              ? "No category keywords were found in the report text."
              : ruleClassification.agreesWithReporter
                ? `The report text supports the reporter's category (matched: ${ruleClassification.matchedKeywords.join(", ")}).`
                : `The report text suggests "${categoryLabel(ruleClassification.suggestedCategory)}" instead (matched: ${ruleClassification.matchedKeywords.join(", ")}). Check the category.`}
          </p>
        </section>

        <section aria-label="AI analysis" className="space-y-3">
          <Badge tone="amber">AI-generated · advisory only</Badge>
          {incident.analysisStatus === "not_configured" ? (
            <Notice>AI analysis is not configured for this deployment (no Gemini API key). The report was classified by rules only.</Notice>
          ) : null}
          {incident.analysisStatus === "pending" ? (
            <Notice>AI analysis has not completed yet. It runs shortly after submission; you can also start it now.</Notice>
          ) : null}
          {incident.analysisStatus === "failed" ? (
            <Notice tone="warning" title="AI analysis unavailable">
              {ERROR_EXPLANATIONS[analysis?.errorCode ?? ""] ?? "The analysis failed."} The report is unaffected. Review it manually or try again.
            </Notice>
          ) : null}
          {result && analysis ? (
            <>
              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-xs font-semibold tracking-wide text-ink-muted uppercase">Likely category</dt>
                  <dd>{categoryLabel(result.category)}{result.category !== incident.category ? " (differs from the current category)" : ""}</dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold tracking-wide text-ink-muted uppercase">Model confidence label</dt>
                  <dd className="capitalize">{result.confidence}</dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold tracking-wide text-ink-muted uppercase">Consistency</dt>
                  <dd>{CONSISTENCY_LABELS[result.descriptionConsistency]}</dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold tracking-wide text-ink-muted uppercase">Image quality</dt>
                  <dd>{IMAGE_QUALITY_LABELS[result.imageQuality]}</dd>
                </div>
              </dl>
              <ObservationList title="Visible observations" items={result.observations} empty="None reported." />
              <ObservationList title="Possible hazards (unverified)" items={result.possibleHazards} empty="None identified." />
              <ObservationList title="Missing information" items={result.missingInformation} empty="None identified." />
              <ObservationList title="Suggested questions for review" items={result.reviewQuestions} empty="None suggested." />
              <p className="text-xs text-ink-muted">
                Generated by {analysis.model} on {formatDateTime(analysis.createdAt)} from the report text
                {analysis.includedImage ? " and photograph" : " only"}. The model cannot determine structural safety or
                the cause of a problem, and its output does not affect the priority score.
              </p>
            </>
          ) : null}
          {incident.analysisStatus !== "not_configured" ? (
            <ActionForm action={rerunAnalysisAction}>
              <input type="hidden" name="id" value={incident.id} />
              <SubmitButton variant="secondary" size="sm">{result ? "Run AI analysis again" : "Run AI analysis now"}</SubmitButton>
            </ActionForm>
          ) : null}
        </section>
      </CardBody>
    </Card>
  );
}
