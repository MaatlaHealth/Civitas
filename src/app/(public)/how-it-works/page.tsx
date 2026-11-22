import { ClipboardList, FileText, Wrench, type LucideIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { ButtonLink } from "@/components/ui/button";
import { CATEGORY_DEFINITIONS, INCIDENT_CATEGORIES, SPECIALIZATION_LABELS } from "@/lib/domain/categories";
import { DEFAULT_ASSIGNMENT_CONFIG } from "@/lib/engines/assignment";
import { DEFAULT_DUPLICATE_CONFIG } from "@/lib/engines/duplicates";
import { DEFAULT_PRIORITY_CONFIG } from "@/lib/engines/priority";
import { DEFAULT_SCREENING_CONFIG } from "@/lib/engines/screening";

export const metadata: Metadata = {
  title: "How Civitas Works",
  description:
    "Step-by-step explanation of Civitas for citizens, coordinators and maintenance crews, with the formulas and default values behind every automatic check.",
};

const SECTIONS = [
  { id: "roles", label: "Step by step, by role" },
  { id: "statuses", label: "Status workflow" },
  { id: "duplicates", label: "Duplicate score" },
  { id: "priority", label: "Priority score" },
  { id: "screening", label: "Consequence screening" },
  { id: "assignment", label: "Crew assignment" },
  { id: "categories", label: "Category assumptions" },
];

const ROLES: Array<{ icon: LucideIcon; name: string; summary: string; steps: string[] }> = [
  {
    icon: FileText,
    name: "Citizen",
    summary: "No account is needed, and a report may be anonymous.",
    steps: [
      "Choose the category that best fits the problem. Categories that can involve immediate danger show emergency advice, because Civitas is not an emergency service.",
      "Give the report a title and describe what you see. You can also say whether it blocks a road or walkway and roughly how long it has existed.",
      "Mark the location on the map. Your browser's location is used only if you give permission, and you can always place the marker by hand.",
      "Optionally attach a photograph (JPEG, PNG or WebP, up to 4 MB).",
      "Optionally leave a name, email address or phone number, or report anonymously.",
      "Submit. You receive a reference in the form CIV-XXXXXXXX and a 20-character access code. Keep both: Civitas stores only a hash of the access code and cannot show it to you again.",
      "Use the reference and access code on the tracking page to see the status, the timeline of status changes and any public updates. You can also add further information to your report there until it is closed.",
    ],
  },
  {
    icon: ClipboardList,
    name: "Municipal coordinator",
    summary: "Signs in with a staff account. Every action below is recorded in an audit log.",
    steps: [
      "New reports arrive as Awaiting review with the results of the automatic checks: the keyword classification, possible duplicates, a provisional priority, nearby registered assets and, where configured, the advisory AI analysis.",
      "Review the report. Correct the category if needed, confirm the severity and estimate the exposure. The priority is recalculated each time.",
      "Verify the report, or reject it with a written reason.",
      "Confirm or reject each possible duplicate. Reports are never merged automatically, a confirmation can be reversed, and the original reports are preserved.",
      "If the calculated priority does not fit the situation, override it with a written reason.",
      "Review the recommended crew, compare the plan with the first-in, first-out baseline if useful, and approve the assignment.",
      "Publish public updates for the citizen. Internal notes are kept separately and never appear on the tracking page.",
      "When the crew reports the work complete, verify it or return it to the crew. Verification moves the incident to Resolved, after which it can be closed.",
      "Maintain the asset registry and crew roster, and erase reporter contact details or delete photographs when required.",
    ],
  },
  {
    icon: Wrench,
    name: "Maintenance crew member",
    summary: "Signs in with a separate, restricted staff account.",
    steps: [
      "See only the jobs assigned to your own crew, including the report photograph for those jobs.",
      "Accept or decline each assignment. A declined job returns to the coordinator.",
      "Start work, which moves the incident to In progress.",
      "Mark the job complete with completion notes and evidence.",
      "A coordinator verifies the completion or returns the job for further work.",
    ],
  },
];

const STATUSES: Array<{ label: string; meaning: string; how: string }> = [
  {
    label: "Submitted",
    meaning: "The report has been received and is being processed.",
    how: "Set when the citizen submits the report.",
  },
  {
    label: "Awaiting review",
    meaning: "The report is waiting for a coordinator. No decision has been made.",
    how: "Automatic, when the intake checks finish.",
  },
  {
    label: "Verified",
    meaning: "A coordinator has reviewed and verified the report. It is waiting to be scheduled.",
    how: "Coordinator decision.",
  },
  {
    label: "Assigned",
    meaning: "A maintenance crew has been assigned.",
    how: "Automatic, when a coordinator approves a crew assignment.",
  },
  {
    label: "In progress",
    meaning: "A maintenance crew is working on the incident.",
    how: "Automatic, when the crew starts work.",
  },
  {
    label: "Resolved",
    meaning: "The crew reported the work complete and a coordinator has verified it.",
    how: "Automatic, when a coordinator verifies the completion.",
  },
  {
    label: "Closed",
    meaning: "The incident has been closed. No further changes are possible.",
    how: "Coordinator decision.",
  },
];

const percent = (value: number): string => `${Math.round(value * 100)}%`;
const fixed = (value: number): string => value.toFixed(2);

function Assumption({ children }: { children: ReactNode }) {
  return (
    <div className="my-5 rounded-md border border-amber-600/40 bg-amber-50 px-4 py-3 text-sm leading-relaxed text-navy-950">
      <span className="mr-2 inline-block rounded-full bg-amber-500 px-2.5 py-0.5 text-xs font-semibold text-navy-950">
        Initial assumption
      </span>
      {children}
    </div>
  );
}

function Formula({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div
      role="group"
      aria-label={label}
      className="my-4 overflow-x-auto rounded-md border border-navy-200 bg-navy-50 px-4 py-3 font-mono text-sm leading-7 whitespace-nowrap text-navy-900"
    >
      {children}
    </div>
  );
}

function Example({ children }: { children: ReactNode }) {
  return (
    <div className="my-5 rounded-md border border-line bg-white px-4 py-3 text-sm leading-relaxed text-ink">
      <span className="font-semibold text-navy-900">Illustration (invented numbers): </span>
      {children}
    </div>
  );
}

export default function HowItWorksPage() {
  const duplicate = DEFAULT_DUPLICATE_CONFIG;
  const priority = DEFAULT_PRIORITY_CONFIG;
  const screening = DEFAULT_SCREENING_CONFIG;
  const assignment = DEFAULT_ASSIGNMENT_CONFIG;
  const unassignedDays = assignment.unassignedPenaltyMinutes / (24 * 60);

  return (
    <div>
      <header className="border-b border-line bg-white">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
          <p className="text-xs font-semibold tracking-widest text-teal-700 uppercase">Method</p>
          <h1 className="mt-3 text-3xl font-bold sm:text-4xl">How Civitas Works</h1>
          <p className="mt-4 max-w-3xl text-lg leading-relaxed text-ink">
            What each person does, what Civitas calculates automatically, and the exact formulas and default values
            behind every score. Nothing on this page is hidden from the coordinators who use the results.
          </p>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-14 lg:py-16">
        <nav aria-label="On this page" className="h-fit rounded-lg border border-line bg-white p-4 lg:sticky lg:top-6">
          <p className="text-xs font-semibold tracking-wide text-ink-muted uppercase">On this page</p>
          <ul className="mt-3 space-y-1 text-sm">
            {SECTIONS.map((section) => (
              <li key={section.id}>
                <a href={`#${section.id}`} className="block rounded px-2 py-1.5 font-medium text-navy-900 hover:bg-navy-50 hover:underline">
                  {section.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="max-w-3xl min-w-0">
          <Assumption>
            Every weight, radius and threshold on this page is an initial engineering assumption chosen for this
            project. None is a validated municipal standard. They are kept in configuration so that an operating
            organisation can review and change them.
          </Assumption>

          <section id="roles" aria-labelledby="roles-heading" className="scroll-mt-6">
            <div className="prose-civitas">
              <h2 id="roles-heading">Step by step, by role</h2>
              <p>
                Civitas has three kinds of user. Citizens need no account. Coordinators and crew members sign in with
                separate staff accounts that have different, restricted permissions.
              </p>
            </div>
            <div className="mt-6 space-y-6">
              {ROLES.map((role) => (
                <article key={role.name} className="rounded-lg border border-line bg-white p-5 sm:p-6">
                  <div className="flex items-start gap-3">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-navy-900 text-white">
                      <role.icon aria-hidden className="size-5" />
                    </span>
                    <div className="min-w-0">
                      <h3 className="text-lg font-semibold">{role.name}</h3>
                      <p className="mt-0.5 text-sm text-ink-muted">{role.summary}</p>
                    </div>
                  </div>
                  <ol className="mt-5 list-decimal space-y-2.5 pl-5 text-sm leading-relaxed text-ink marker:font-semibold marker:text-navy-800">
                    {role.steps.map((step) => (
                      <li key={step} className="pl-1">
                        {step}
                      </li>
                    ))}
                  </ol>
                </article>
              ))}
            </div>
          </section>

          <section id="statuses" aria-labelledby="statuses-heading" className="prose-civitas scroll-mt-6">
            <h2 id="statuses-heading">Status workflow</h2>
            <p>
              An incident moves through a fixed set of statuses. A change that is not listed in the workflow is refused.
              The tracking page shows the status and the time of each change, but not who made it or why.
            </p>
            <ol className="list-none space-y-0 pl-0">
              {STATUSES.map((status, index) => (
                <li key={status.label} className="relative flex gap-4 pb-5 last:pb-0">
                  {index < STATUSES.length - 1 ? (
                    <span aria-hidden className="absolute top-8 bottom-0 left-3.5 w-px bg-navy-200" />
                  ) : null}
                  <span
                    aria-hidden
                    className="relative flex size-7 shrink-0 items-center justify-center rounded-full bg-teal-700 text-xs font-bold text-white"
                  >
                    {index + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="mb-0 font-semibold text-navy-900">{status.label}</p>
                    <p className="mb-0 text-sm">{status.meaning}</p>
                    <p className="mb-0 text-sm text-ink-muted">{status.how}</p>
                  </div>
                </li>
              ))}
            </ol>
            <h3>Other paths</h3>
            <ul>
              <li>
                <strong>Rejected.</strong> A coordinator can reject a report that is awaiting review or verified. A written
                reason is required. A rejected report can be reopened for review, also with a reason.
              </li>
              <li>
                <strong>Back to Verified.</strong> If the crew declines, or a coordinator cancels the assignment, the
                incident returns to Verified so that another crew can be assigned.
              </li>
              <li>
                <strong>Return to review.</strong> A coordinator can send a verified report back to Awaiting review with a
                reason.
              </li>
              <li>
                <strong>Reopen.</strong> A resolved incident can be reopened for further work with a reason. A closed
                incident cannot be changed.
              </li>
            </ul>
            <h3>Assignment statuses</h3>
            <p>
              Each crew assignment has its own status: Proposed (awaiting coordinator approval), Assigned (awaiting crew
              response), Accepted or Declined by the crew, Work in progress, Completed (awaiting verification) and
              Verified complete. A coordinator can cancel an assignment before it is completed, or return a completed job
              to Work in progress.
            </p>
          </section>

          <section id="duplicates" aria-labelledby="duplicates-heading" className="prose-civitas scroll-mt-6">
            <h2 id="duplicates-heading">Duplicate score</h2>
            <p>
              Several people often report the same physical problem. When a report is submitted, Civitas compares it with
              every report that is still open and gives each pair a score between 0 and 1.
            </p>
            <Formula label="Duplicate score formula">
              S = {fixed(duplicate.weights.geographic)}·G + {fixed(duplicate.weights.category)}·C +{" "}
              {fixed(duplicate.weights.temporal)}·T + {fixed(duplicate.weights.description)}·D
            </Formula>
            <ul>
              <li>
                <strong>G, geographic proximity.</strong> 1 when the two reports are at the same point, falling in a straight
                line to 0 at the search radius: <code>G = 1 − distance ÷ radius</code>. The radius depends on the category
                (from 25 m for a streetlight to 150 m for flooding; see the{" "}
                <a href="#categories">category table</a>), and the larger of the two reports&apos; radii is used. Distance
                is straight-line.
              </li>
              <li>
                <strong>C, category compatibility.</strong> 1 for the same category (0.5 when both are &ldquo;Other&rdquo;).
                Related categories that can describe one problem have a set value: blocked drain and flooding 0.7, water
                leak and flooding 0.6, streetlight and exposed electrical 0.4, illegal dumping and blocked drain 0.4,
                pothole and sidewalk 0.3.
              </li>
              <li>
                <strong>T, time between submissions.</strong> Halves for every {duplicate.temporalHalfLifeHours} hours
                between the two reports: <code>T = 0.5 ^ (hours apart ÷ {duplicate.temporalHalfLifeHours})</code>.
              </li>
              <li>
                <strong>D, description similarity.</strong> The share of words the two titles and descriptions have in
                common (the Jaccard index), after lower-casing, removing common words and trimming a few word endings. It
                measures shared vocabulary, not meaning, which is why it has the lowest weight.
              </li>
            </ul>
            <p>
              A pair is never a candidate if the categories are unrelated or the reports are further apart than the search
              radius, whatever the other components. A pair scoring {fixed(duplicate.candidateThreshold)} or more is raised
              as a possible duplicate with its distance, time gap and component values.
            </p>
            <Example>
              two pothole reports 7 m apart (radius 35 m), submitted 72 hours apart, sharing a fifth of their words. G =
              0.80, C = 1, T = 0.50, D = 0.20, so S = 0.32 + 0.25 + 0.10 + 0.03 = 0.70. That is above{" "}
              {fixed(duplicate.candidateThreshold)}, so the pair is shown to a coordinator.
            </Example>
            <p>
              Civitas never merges reports by itself. A coordinator confirms or rejects each candidate, a confirmation can
              be reversed, and both original reports are kept.
            </p>
            <Assumption>
              The four weights, the {fixed(duplicate.candidateThreshold)} threshold, the {duplicate.temporalHalfLifeHours}
              -hour half-life, the search radii and the related-category values have not been validated against municipal
              data.
            </Assumption>
          </section>

          <section id="priority" aria-labelledby="priority-heading" className="prose-civitas scroll-mt-6">
            <h2 id="priority-heading">Priority score</h2>
            <p>
              Priority is calculated by a fixed rule engine. The language model plays no part in it. The score is a
              weighted sum of five factors, each between 0 and 1.
            </p>
            <Formula label="Priority score formula">
              P = {fixed(priority.weights.hazard)}·H + {fixed(priority.weights.impact)}·I +{" "}
              {fixed(priority.weights.exposure)}·E + {fixed(priority.weights.urgency)}·U +{" "}
              {fixed(priority.weights.evidence)}·V
            </Formula>
            <ul>
              <li>
                <strong>H, hazard severity ({percent(priority.weights.hazard)}).</strong> The severity confirmed by a
                coordinator (low 0.25, moderate 0.5, high 0.75, critical 1). Until then, the baseline for the category
                from the <a href="#categories">category table</a>.
              </li>
              <li>
                <strong>I, infrastructure impact ({percent(priority.weights.impact)}).</strong> The category&apos;s
                baseline service impact. If consequence screening finds a relevant, verified registered asset nearby, the
                baseline is raised by up to {fixed(priority.assetImpactUplift)}:{" "}
                <code>
                  I = baseline + {fixed(priority.assetImpactUplift)} × importance × (1 − distance ÷ {screening.radiusMeters}{" "}
                  m)
                </code>
                , capped at 1. Importance is 0.4 for a standard asset, 0.7 for an important one and 1 for a critical one.
                Only the strongest such asset counts.
              </li>
              <li>
                <strong>E, exposure ({percent(priority.weights.exposure)}).</strong> A coordinator&apos;s estimate (low
                0.25, moderate 0.55, high 0.85). Without one, the reporter&apos;s unverified answer to whether a road or
                walkway is blocked (yes 0.6, no 0.3). Civitas holds no population or traffic data, so if neither exists
                the factor is unknown.
              </li>
              <li>
                <strong>U, urgency ({percent(priority.weights.urgency)}).</strong> Half from how quickly the category
                tends to worsen, a quarter from how long the report has been open (reaching its maximum at{" "}
                {priority.openAgeSaturationHours} hours) and a quarter from how long the reporter says the problem has
                existed (today 0.2, a few days 0.5, a few weeks 0.8, more than a month 1). If the reporter is not sure, that
                part is left out and the other two are rescaled.
              </li>
              <li>
                <strong>V, verified evidence ({percent(priority.weights.evidence)}).</strong> 0.5 if a coordinator has
                verified the report, 0.2 if a photograph was supplied, and 0.1 for each confirmed matching report up to
                three. The total is capped at 1.
              </li>
            </ul>
            <h3>Unknown inputs</h3>
            <p>
              A missing input is never treated as &ldquo;no risk&rdquo;. An unknown factor is left out, the remaining
              weights are rescaled to add up to 1, and the gap is listed as a limitation next to the score. If hazard
              severity itself is unknown, which happens for an unconfirmed &ldquo;Other&rdquo; report, no score is produced
              and the incident is placed in the Awaiting review band until a coordinator confirms a severity.
            </p>
            <h3>Bands</h3>
            <ul>
              <li>
                <strong>Critical:</strong> score of {fixed(priority.bandThresholds.critical)} or more
              </li>
              <li>
                <strong>High:</strong> {fixed(priority.bandThresholds.high)} or more
              </li>
              <li>
                <strong>Moderate:</strong> {fixed(priority.bandThresholds.moderate)} or more
              </li>
              <li>
                <strong>Low:</strong> below {fixed(priority.bandThresholds.moderate)}
              </li>
            </ul>
            <p>
              A priority is marked provisional until a coordinator has verified the incident. It is recalculated whenever
              its inputs change, for example when a severity is confirmed or a duplicate is confirmed.
            </p>
            <Example>
              a new, unverified water leak with no photograph, where the reporter says it started today and blocks the
              road, and no registered asset is nearby. H = 0.50 and I = 0.70 (category baselines), E = 0.60, U = 0.5 ×
              0.70 + 0.25 × 0 + 0.25 × 0.20 = 0.40, V = 0. P = 0.150 + 0.175 + 0.090 + 0.060 + 0 = 0.475, which is in the
              Moderate band and marked provisional.
            </Example>
            <h3>Override</h3>
            <p>
              A coordinator can replace the calculated band with their own judgement. A written reason is required, and
              the override is recorded in the audit log alongside the calculated value.
            </p>
            <Assumption>
              The factor weights, band thresholds, severity and exposure values, category baselines and the{" "}
              {priority.openAgeSaturationHours}-hour limit are starting values. They are not derived from municipal data or
              an engineering standard.
            </Assumption>
          </section>

          <section id="screening" aria-labelledby="screening-heading" className="prose-civitas scroll-mt-6">
            <h2 id="screening-heading">Consequence screening</h2>
            <p>
              Coordinators maintain a registry of important assets: hospitals, schools, water pumping stations,
              electrical substations, bridges, major road intersections and emergency facilities. Each entry has an
              importance level, a source and a flag showing whether the entry has been verified.
            </p>
            <p>
              For each incident, Civitas lists every registered asset within {screening.radiusMeters} m in a straight
              line, nearest first. A fixed table of rules gives the reason a category of incident may matter to a type of
              asset. For example, for a water leak near a substation the stated reason is that escaping water near
              electrical equipment may create an electrical hazard. If no rule connects the two, the asset is still listed
              as nearby, without a relevance note.
            </p>
            <p>Every finding carries the same caveat:</p>
            <blockquote className="my-4 border-l-4 border-teal-700 bg-white px-4 py-3 text-ink">
              Proximity alone does not establish a service impact. Coordinator verification required.
            </blockquote>
            <p>
              Screening does not simulate water, electrical or road networks, and it never concludes that an asset is
              affected. Only a verified registry entry with a relevance rule can raise the infrastructure impact factor
              of the priority score. If no asset is found, the coordinator is told that the registry may be incomplete.
            </p>
            <Assumption>
              The {screening.radiusMeters} m radius, the importance values and the relevance rules were written for this
              project. The registry contains only what coordinators have entered.
            </Assumption>
          </section>

          <section id="assignment" aria-labelledby="assignment-heading" className="prose-civitas scroll-mt-6">
            <h2 id="assignment-heading">Crew assignment</h2>
            <p>
              A crew can take an incident only if its specialisation is qualified for the category, it is marked
              available, and it is below its capacity. Crews that cannot take a job are still listed for the coordinator
              with the reason.
            </p>
            <p>
              Each available crew offers one slot for each unit of free capacity. Taking a later slot means waiting behind
              the jobs ahead of it. For an incident placed in a slot:
            </p>
            <Formula label="Assignment cost formula">
              wait = travel time + jobs ahead × {assignment.serviceMinutes} min
              <br />
              travel time = straight-line distance from crew base ÷ {assignment.averageSpeedKmh} km/h
              <br />
              cost = priority weight × wait
            </Formula>
            <p>
              The priority weights are {assignment.priorityWeights.critical} for Critical,{" "}
              {assignment.priorityWeights.high} for High, {assignment.priorityWeights.moderate} for Moderate and{" "}
              {assignment.priorityWeights.low} for Low or Awaiting review. Leaving an incident unassigned is charged as a
              wait of {unassignedDays} days, so an incident is left out only when no qualified slot is free.
            </p>
            <p>
              Civitas finds the pairing of incidents to slots with the lowest total cost using the Hungarian algorithm, a
              standard exact method for minimum-cost assignment. The coordinator sees the reasons for each pairing: the
              qualification, the distance and assumed travel time, and the number of jobs ahead.
            </p>
            <Example>
              a High priority incident 3 km in a straight line from a crew base, with one job ahead of it. Travel time =
              3 ÷ 30 × 60 = 6 minutes, wait = 6 + 90 = 96 minutes, cost = 4 × 96 = 384.
            </Example>
            <h3>Comparison with first-in, first-out</h3>
            <p>
              The same incidents and crews can be planned with a simple baseline: incidents are taken strictly in the
              order they were reported, and each goes to the qualified, available crew with the shortest queue. Priority
              and distance are ignored. Both plans are then shown with the same measures: assignments made, incidents left
              unassigned, total priority-weighted waiting time, total straight-line distance, coverage by priority band
              and workload by crew.
            </p>
            <h3>What the plan is not</h3>
            <ul>
              <li>It is optimal only for the cost model above. It is not a vehicle-routing solution.</li>
              <li>Distance is straight-line from the crew&apos;s base, not distance by road.</li>
              <li>Every job is assumed to take the same time, and jobs are not chained into routes.</li>
              <li>It is a recommendation. Nothing is assigned until a coordinator approves it, and the crew can decline.</li>
            </ul>
            <Assumption>
              The {assignment.averageSpeedKmh} km/h average speed, {assignment.serviceMinutes} minutes per job, the
              priority weights and the {unassignedDays}-day penalty are assumed values, not measurements.
            </Assumption>
          </section>

          <section id="categories" aria-labelledby="categories-heading" className="scroll-mt-6">
            <div className="prose-civitas">
              <h2 id="categories-heading">Category assumptions</h2>
              <p>
                These values feed the duplicate score, the priority score and crew eligibility. Hazard, service impact and
                time sensitivity are on a scale from 0 to 1.
              </p>
            </div>
            <div className="overflow-x-auto rounded-lg border border-line bg-white">
              <table className="w-full min-w-[44rem] border-collapse">
                <caption className="sr-only">Default assumptions for each incident category</caption>
                <thead>
                  <tr>
                    <th scope="col" className="table-header">
                      Category
                    </th>
                    <th scope="col" className="table-header">
                      Hazard
                    </th>
                    <th scope="col" className="table-header">
                      Service impact
                    </th>
                    <th scope="col" className="table-header">
                      Time sensitivity
                    </th>
                    <th scope="col" className="table-header">
                      Duplicate radius
                    </th>
                    <th scope="col" className="table-header">
                      Qualified crews
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {INCIDENT_CATEGORIES.map((category) => {
                    const definition = CATEGORY_DEFINITIONS[category];
                    return (
                      <tr key={category}>
                        <th scope="row" className="table-cell text-left font-semibold text-navy-900">
                          {definition.label}
                        </th>
                        <td className="table-cell">{definition.baseHazard === null ? "None assumed" : fixed(definition.baseHazard)}</td>
                        <td className="table-cell">
                          {definition.baseServiceImpact === null ? "None assumed" : fixed(definition.baseServiceImpact)}
                        </td>
                        <td className="table-cell">{fixed(definition.timeSensitivity)}</td>
                        <td className="table-cell whitespace-nowrap">{definition.duplicateRadiusMeters} m</td>
                        <td className="table-cell">
                          {definition.qualifiedSpecializations.map((specialization) => SPECIALIZATION_LABELS[specialization]).join(", ")}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Assumption>
              Every value in this table is a configuration assumption made for this project, not a verified municipal
              standard.
            </Assumption>
          </section>

          <div className="mt-12 flex flex-wrap items-center gap-3 border-t border-line pt-8">
            <ButtonLink href="/transparency" variant="primary">
              Transparency and limitations
            </ButtonLink>
            <ButtonLink href="/report" variant="secondary">
              Report an Incident
            </ButtonLink>
            <Link href="/privacy" className="text-sm font-medium text-teal-700 underline underline-offset-2">
              How report data is handled
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
