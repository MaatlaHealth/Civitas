import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Badge, StatusBadge } from "@/components/ui/badges";
import { reviewDuplicateAction } from "@/lib/actions/coordinator";
import { categoryLabel } from "@/lib/domain/categories";
import { DEFAULT_DUPLICATE_CONFIG } from "@/lib/engines/duplicates";
import { formatDateTime } from "@/lib/format";
import { formatDistance } from "@/lib/geo/haversine";
import type { DuplicateCandidateView } from "@/lib/services/duplicates";

const STATUS_TONE = { pending: "amber", confirmed: "green", rejected: "neutral" } as const;
const STATUS_LABEL = { pending: "Awaiting review", confirmed: "Confirmed match", rejected: "Rejected" } as const;

function ReportSummary({ label, report }: { label: string; report: DuplicateCandidateView["primary"] }) {
  return (
    <div className="min-w-0 rounded-md border border-line p-3">
      <p className="text-xs font-semibold text-ink-muted">{label}</p>
      <Link href={`/dashboard/incidents/${report.id}`} className="font-medium text-navy-900 hover:underline">
        {report.title}
      </Link>
      <p className="text-xs text-ink-muted">
        <span className="font-mono">{report.reference}</span> · {categoryLabel(report.category)} · {formatDateTime(report.createdAt)}
      </p>
      <p className="mt-2 line-clamp-3 text-sm">{report.description}</p>
      <span className="mt-2 inline-block"><StatusBadge status={report.status} /></span>
    </div>
  );
}

/** One candidate pair with the evidence behind its score and the review controls. */
export function DuplicateCandidateCard({ candidate }: { candidate: DuplicateCandidateView }) {
  const { weights } = DEFAULT_DUPLICATE_CONFIG;
  const components = [
    { label: "Geographic proximity (G)", value: candidate.components.geographic, weight: weights.geographic },
    { label: "Category compatibility (C)", value: candidate.components.category, weight: weights.category },
    { label: "Temporal proximity (T)", value: candidate.components.temporal, weight: weights.temporal },
    { label: "Description similarity (D)", value: candidate.components.description, weight: weights.description },
  ];

  return (
    <article className="rounded-lg border border-line bg-white p-4 shadow-xs sm:p-5" aria-label={`Possible duplicate: ${candidate.primary.reference} and ${candidate.later.reference}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-navy-900">
          Match score <span className="tabular-nums">{candidate.score.toFixed(2)}</span>
          <span className="font-normal text-ink-muted"> · {formatDistance(candidate.distanceMeters)} apart (straight line)</span>
        </p>
        <Badge tone={STATUS_TONE[candidate.status]}>{STATUS_LABEL[candidate.status]}</Badge>
      </div>
      <p className="mt-2 text-sm">{candidate.explanation}</p>

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <ReportSummary label="Earlier report" report={candidate.primary} />
        <ReportSummary label="Later report" report={candidate.later} />
      </div>

      <details className="mt-3 text-sm">
        <summary className="cursor-pointer font-medium text-teal-700">How the score was calculated</summary>
        <table className="mt-2 w-full max-w-md border-collapse">
          <thead>
            <tr>
              <th scope="col" className="table-header">Component</th>
              <th scope="col" className="table-header text-right">Value</th>
              <th scope="col" className="table-header text-right">Weight</th>
            </tr>
          </thead>
          <tbody>
            {components.map((component) => (
              <tr key={component.label}>
                <td className="table-cell">{component.label}</td>
                <td className="table-cell text-right tabular-nums">{component.value.toFixed(2)}</td>
                <td className="table-cell text-right tabular-nums">{component.weight.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-xs text-ink-muted">
          Score = sum of value × weight. Pairs scoring at least {DEFAULT_DUPLICATE_CONFIG.candidateThreshold.toFixed(2)} are raised for review.
        </p>
      </details>

      <ActionForm action={reviewDuplicateAction} className="mt-4 border-t border-line pt-4">
        <input type="hidden" name="candidateId" value={candidate.id} />
        <label htmlFor={`reason-${candidate.id}`} className="label">Reason (optional)</label>
        <input id={`reason-${candidate.id}`} name="reason" className="input max-w-lg" maxLength={500} />
        <div className="mt-3 flex flex-wrap gap-2">
          {candidate.status === "pending" ? (
            <>
              <SubmitButton name="decision" value="confirmed" size="sm">Confirm same incident</SubmitButton>
              <SubmitButton name="decision" value="rejected" variant="secondary" size="sm">Not the same incident</SubmitButton>
            </>
          ) : (
            <SubmitButton name="decision" value="reopened" variant="secondary" size="sm">Reopen this decision</SubmitButton>
          )}
        </div>
        <p className="mt-2 text-xs text-ink-muted">
          Confirming links the later report to the earlier one. Both reports are kept in full and the decision can be reopened.
        </p>
      </ActionForm>
    </article>
  );
}
