import Link from "next/link";
import { PriorityFactorTable } from "@/components/incident/priority-panel";
import { ScreeningFindings } from "@/components/incident/screening-panel";
import { PlanningSimulator } from "@/components/planning/planning-simulator";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { PriorityBadge } from "@/components/ui/badges";
import { Card, CardBody, CardHeader, Notice, PageHeader } from "@/components/ui/layout";
import { proposeLivePlanAction } from "@/lib/actions/coordinator";
import { requireCoordinatorSession } from "@/lib/auth/session";
import { categoryLabel } from "@/lib/domain/categories";
import { formatDateTime } from "@/lib/format";
import { evaluateScenario } from "@/lib/scenario/evaluate";
import { SCENARIO_EVALUATED_AT, SCENARIO_NAME } from "@/lib/scenario/training-scenario";
import { getLivePlanningInputs } from "@/lib/services/planning";

export const metadata = { title: "Response planning" };

const TABS = [
  { key: "training", label: "Training scenario (synthetic)" },
  { key: "live", label: "Live operations" },
] as const;

function TrainingScenario() {
  const scenario = evaluateScenario();
  return (
    <div className="space-y-6">
      <Notice tone="warning" title="Synthetic training data">
        <p>
          <strong>{SCENARIO_NAME}.</strong> Every incident, crew and asset below is invented for training and
          evaluation. None of it is stored in the operational database or shown on the operations map. Positions are
          deliberately placed in the open ocean and drawn on a plain grid so they cannot be mistaken for real places.
          The scenario is fixed at {formatDateTime(SCENARIO_EVALUATED_AT)}, so results are identical on every run.
        </p>
        <p className="mt-2">
          Only the raw reports are scripted. Duplicate matches, priority scores, consequence screening and both crew
          plans are computed live by the same engines used for real incidents. The scenario does not call the AI
          service and contains no AI output.
        </p>
      </Notice>

      <Card>
        <CardHeader
          title="Step 1: how the engines read the nine reports"
          description="Open a report to see its computed priority factors, duplicate match and nearby synthetic assets."
        />
        <ul className="divide-y divide-line">
          {scenario.reports.map(({ report, priority, duplicateMatch, duplicateOf, screening }) => (
            <li key={report.id} className="px-4 py-3 sm:px-5">
              <details>
                <summary className="cursor-pointer">
                  <span className="font-mono text-xs">{report.id}</span>{" "}
                  <span className="font-medium text-navy-900">{report.title}</span>{" "}
                  <PriorityBadge band={priority.band} />
                  {duplicateOf ? <span className="ml-2 text-xs font-semibold text-teal-800">Duplicate of {duplicateOf}</span> : null}
                  <span className="block text-xs text-ink-muted">
                    {categoryLabel(report.category)} · reported {formatDateTime(report.reportedAt)}
                  </span>
                </summary>
                <div className="mt-3 space-y-3 text-sm">
                  <p>{report.description}</p>
                  <p className="font-medium text-navy-900">{priority.explanation}</p>
                  <PriorityFactorTable factors={priority.factors} />
                  {duplicateMatch ? (
                    <p className="rounded-md bg-teal-50 px-3 py-2">
                      <strong>Duplicate engine (score {duplicateMatch.score.toFixed(2)}):</strong> {duplicateMatch.explanation}{" "}
                      The scenario assumes the coordinator confirms this match, so the report is not planned separately
                      and counts as corroboration for {duplicateOf}.
                    </p>
                  ) : null}
                  <ScreeningFindings screening={screening} />
                </div>
              </details>
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <CardHeader
          title="Step 2: compare allocation strategies"
          description="Run the baseline, run the Civitas plan, then mark a crew unavailable or change its specialisation and run again to see how the plans change."
        />
        <CardBody>
          <PlanningSimulator
            showSchematic
            incidents={scenario.planIncidents.map((incident) => ({ ...incident, reportedAt: incident.reportedAt.toISOString() }))}
            crews={scenario.planCrews}
          />
        </CardBody>
      </Card>
    </div>
  );
}

async function LiveOperations() {
  const { actor } = await requireCoordinatorSession();
  const inputs = await getLivePlanningInputs(actor);
  return (
    <div className="space-y-6">
      <Notice title="Live records">
        These are stored, verified incidents without a crew, and your real crews with their current workload. The
        comparison below is a what-if view: editing a crew here does not change its record. To act on a plan, create
        proposals; each proposal still needs your approval on the incident before the crew sees it.
      </Notice>
      <Card>
        <CardHeader title="Create proposals from the Civitas plan" description="Recomputed on the server from current records, ignoring any what-if edits below." />
        <CardBody>
          <ActionForm action={proposeLivePlanAction}>
            <SubmitButton>Propose assignments for all ready incidents</SubmitButton>
          </ActionForm>
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="What-if comparison" description={`${inputs.incidents.length} verified incident${inputs.incidents.length === 1 ? "" : "s"} ready for planning.`} />
        <CardBody>
          <PlanningSimulator
            incidents={inputs.incidents.map((incident) => ({ ...incident, reportedAt: incident.reportedAt.toISOString() }))}
            crews={inputs.crews}
          />
        </CardBody>
      </Card>
    </div>
  );
}

export default async function PlanningPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  await requireCoordinatorSession();
  const view = (await searchParams).view === "live" ? "live" : "training";

  return (
    <>
      <PageHeader
        title="Response planning"
        description="Compare first-in-first-out dispatch with Civitas resource-aware prioritisation, using the same assignment engine that produces live recommendations."
      />
      <nav aria-label="Planning data source" className="mb-5">
        <ul className="flex flex-wrap gap-2">
          {TABS.map((tab) => (
            <li key={tab.key}>
              <Link
                href={`/dashboard/planning?view=${tab.key}`}
                aria-current={tab.key === view ? "page" : undefined}
                className={`inline-block rounded-md px-3 py-1.5 text-sm font-semibold ${
                  tab.key === view ? "bg-navy-900 text-white" : "border border-line bg-white text-navy-900 hover:bg-navy-50"
                }`}
              >
                {tab.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      {view === "live" ? <LiveOperations /> : <TrainingScenario />}
    </>
  );
}
