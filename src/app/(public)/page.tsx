import {
  AlertTriangle,
  ArrowRight,
  Bell,
  CheckCircle2,
  ClipboardList,
  Copy,
  Eye,
  FileText,
  Layers,
  MapPin,
  Network,
  Route,
  Scale,
  Search,
  ShieldCheck,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
import { URGENT_HAZARD_ADVICE } from "@/lib/domain/categories";

const PROBLEMS: Array<{ icon: LucideIcon; title: string; body: string }> = [
  {
    icon: Layers,
    title: "Reports arrive through fragmented channels",
    body: "Phone calls, messages, emails and social media posts each hold part of the picture, and none of them is a shared record.",
  },
  {
    icon: Copy,
    title: "Reports are incomplete, duplicated or ambiguous",
    body: "Several people describe the same burst pipe in different words, while other reports have no usable location at all.",
  },
  {
    icon: Scale,
    title: "Urgent and routine problems look alike",
    body: "Without a consistent method, an exposed cable next to a school can sit in the same queue as a cosmetic defect.",
  },
  {
    icon: Users,
    title: "Repair resources are limited",
    body: "A small number of crews, each with its own specialisation and workload, has to cover every open incident.",
  },
  {
    icon: Bell,
    title: "Citizens do not hear what happened",
    body: "People who take the time to report a problem often receive no confirmation and no update on its progress.",
  },
];

const WORKFLOW: Array<{ icon: LucideIcon; name: string; actor: string; body: string }> = [
  {
    icon: MapPin,
    name: "Report",
    actor: "Citizen",
    body: "Choose a category, describe the problem and mark its location on the map. A photograph and contact details are optional, and no account is needed. The citizen receives a reference and a private access code.",
  },
  {
    icon: Search,
    name: "Analyse",
    actor: "Automatic, advisory",
    body: "A rule-based keyword check runs on every report and flags text that points to a different category. Where it is configured, Google Gemini adds an advisory description of the text and photograph. Neither changes the report.",
  },
  {
    icon: Copy,
    name: "De-duplicate",
    actor: "Automatic, coordinator confirms",
    body: "Open reports nearby with a compatible category are scored on distance, category, time and wording. Likely matches are raised for review. Reports are never merged automatically.",
  },
  {
    icon: Scale,
    name: "Prioritise",
    actor: "Automatic, coordinator can override",
    body: "A deterministic formula combines hazard, infrastructure impact, exposure, urgency and evidence into a score and a band. Every factor and every unknown is shown to the coordinator.",
  },
  {
    icon: Users,
    name: "Assign",
    actor: "Civitas recommends, coordinator approves",
    body: "Civitas recommends a qualified, available crew by solving a minimum-cost assignment over priority-weighted waiting time. Nothing is assigned until a coordinator approves it.",
  },
  {
    icon: Wrench,
    name: "Repair",
    actor: "Maintenance crew, coordinator verifies",
    body: "The crew accepts or declines the job, carries out the work and marks it complete with notes and evidence. A coordinator verifies the completion before the incident is resolved.",
  },
  {
    icon: Bell,
    name: "Track",
    actor: "Citizen",
    body: "Using the reference and access code, the citizen sees the current status, a timeline of status changes and any public updates the coordinator has published.",
  },
];

const DIFFERENTIATORS: Array<{ icon: LucideIcon; title: string; body: string; limit: string }> = [
  {
    icon: MapPin,
    title: "Geospatial duplicate detection",
    body: "Each new report is compared with open reports inside a category-specific search radius. The score combines distance, category compatibility, time between submissions and shared wording, and is shown with its components.",
    limit: "Candidates are suggestions. A coordinator confirms or rejects each one, and a confirmation can be reversed.",
  },
  {
    icon: Scale,
    title: "Explainable priority",
    body: "Priority is a weighted sum of five factors with published weights. Missing information is excluded and reported as a limitation rather than treated as zero risk.",
    limit: "The language model plays no part in the score. A coordinator can override it with a written reason, which is audited.",
  },
  {
    icon: Network,
    title: "Consequence screening",
    body: "Civitas lists registered assets such as hospitals, schools, pumping stations and substations within a fixed distance of an incident, with the stated reason each one may be relevant.",
    limit: "Proximity is a prompt to check, not proof of impact. The registry holds only what coordinators have entered.",
  },
  {
    icon: Route,
    title: "Resource-aware planning",
    body: "Crew recommendations respect specialisation, availability and capacity. The plan can be compared side by side with a first-in, first-out baseline using the same measures.",
    limit: "The plan is optimal for its stated cost model only. It uses straight-line distance and is not a routing optimiser.",
  },
];

const CONTROLS = [
  "A coordinator reviews every report before it is verified or rejected.",
  "Possible duplicates are confirmed or rejected by a coordinator. Confirmation is reversible and the original reports are preserved.",
  "A coordinator can override the calculated priority with a written reason. The override is recorded in the audit log.",
  "No crew is assigned until a coordinator approves the recommendation, and the crew can decline.",
  "An incident is resolved only after a coordinator verifies the crew's completion report.",
  "AI output is advisory. It never sets priority, never changes a report and never dispatches anyone.",
];

function Eyebrow({ children }: { children: string }) {
  return <p className="text-xs font-semibold tracking-widest text-teal-700 uppercase">{children}</p>;
}

export default function HomePage() {
  return (
    <div>
      <section aria-labelledby="hero-heading" className="bg-navy-900 text-white">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 sm:py-20 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-center lg:gap-14">
          <div className="min-w-0">
            <p className="text-xs font-semibold tracking-widest text-amber-500 uppercase">
              Geospatial infrastructure incident intelligence
            </p>
            <h1 id="hero-heading" className="mt-4 text-3xl leading-tight font-bold text-balance text-white sm:text-5xl sm:leading-[1.1]">
              Better infrastructure starts with better information.
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-relaxed text-navy-100 sm:text-lg">
              Civitas transforms community infrastructure reports into actionable intelligence, helping engineering teams
              identify problems, prioritize responses and coordinate repairs.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <ButtonLink href="/report" variant="accent" size="lg">
                Report an Incident
              </ButtonLink>
              <ButtonLink href="/how-it-works" variant="secondary" size="lg">
                Explore Civitas
                <ArrowRight aria-hidden className="size-4" />
              </ButtonLink>
            </div>
            <p className="mt-6 text-sm text-navy-100">
              Already reported something?{" "}
              <Link href="/track" className="font-semibold text-white underline underline-offset-4 hover:text-amber-500">
                Track an incident
              </Link>
            </p>
          </div>

          <aside aria-label="Civitas at a glance" className="rounded-lg bg-white p-6 text-ink shadow-lg">
            <div className="flex items-center gap-3">
              <Image src="/brand/civitas-mark.png" alt="" width={256} height={256} className="size-12 shrink-0" />
              <p className="text-sm leading-snug font-semibold text-navy-900">
                From citizen reports to coordinated infrastructure response.
              </p>
            </div>
            <dl className="mt-5 space-y-4 border-t border-line pt-5 text-sm">
              <div>
                <dt className="text-xs font-semibold tracking-wide text-ink-muted uppercase">What it is</dt>
                <dd className="mt-1 leading-relaxed">A decision-support tool for municipal coordinators and maintenance crews.</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold tracking-wide text-ink-muted uppercase">What it is not</dt>
                <dd className="mt-1 leading-relaxed">An emergency service or an autonomous dispatcher. People make every decision.</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold tracking-wide text-ink-muted uppercase">Status</dt>
                <dd className="mt-1 leading-relaxed">
                  An evaluation build made for the EvoHacks 2 hackathon. It is not operated by any municipality.
                </dd>
              </div>
            </dl>
          </aside>
        </div>
      </section>

      <div className="border-b border-amber-600/30 bg-amber-100 text-navy-950">
        <div className="mx-auto flex max-w-6xl gap-3 px-4 py-3 text-sm leading-relaxed sm:px-6">
          <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" />
          <p>{URGENT_HAZARD_ADVICE}</p>
        </div>
      </div>

      <section aria-labelledby="problems-heading" className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <div className="max-w-3xl">
          <Eyebrow>The problem</Eyebrow>
          <h2 id="problems-heading" className="mt-3 text-2xl font-bold sm:text-3xl">
            Five connected problems between a report and a repair
          </h2>
          <p className="mt-4 leading-relaxed text-ink">
            Potholes, leaks, blocked drains and failed streetlights are usually noticed first by the people who live
            beside them. Turning those observations into repairs is difficult for reasons that reinforce one another.
          </p>
        </div>
        <ol className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {PROBLEMS.map((problem, index) => (
            <li key={problem.title} className="rounded-lg border border-line bg-white p-5">
              <div className="flex items-center gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-navy-50 text-navy-800">
                  <problem.icon aria-hidden className="size-5" />
                </span>
                <span className="text-sm font-semibold text-ink-muted">Problem {index + 1}</span>
              </div>
              <h3 className="mt-4 text-base font-semibold">{problem.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink">{problem.body}</p>
            </li>
          ))}
          <li className="rounded-lg border border-teal-700/30 bg-teal-50 p-5">
            <h3 className="text-base font-semibold">What Civitas does about it</h3>
            <p className="mt-2 text-sm leading-relaxed text-ink">
              One structured intake, automatic checks that explain themselves, a recommended crew plan and a tracking
              page for the person who reported the problem.
            </p>
            <Link
              href="/how-it-works"
              className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-teal-800 underline underline-offset-4"
            >
              See how each step works
              <ArrowRight aria-hidden className="size-4" />
            </Link>
          </li>
        </ol>
      </section>

      <section aria-labelledby="workflow-heading" className="border-y border-line bg-white">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
          <div className="max-w-3xl">
            <Eyebrow>The workflow</Eyebrow>
            <h2 id="workflow-heading" className="mt-3 text-2xl font-bold sm:text-3xl">
              From a report to a verified repair
            </h2>
            <p className="mt-4 leading-relaxed text-ink">
              Seven steps, each with a named owner. Automatic steps prepare information for a person. They do not make
              the decision.
            </p>
          </div>

          <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-14">
            <ol className="min-w-0">
              {WORKFLOW.map((step, index) => {
                const isLast = index === WORKFLOW.length - 1;
                return (
                  <li key={step.name} className={`relative flex gap-4 ${isLast ? "" : "pb-8"}`}>
                    {isLast ? null : <span aria-hidden className="absolute top-11 bottom-1 left-5 w-px bg-navy-200" />}
                    <span className="relative flex size-10 shrink-0 items-center justify-center rounded-full bg-navy-900 text-white">
                      <step.icon aria-hidden className="size-5" />
                    </span>
                    <div className="min-w-0 pt-0.5">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <h3 className="text-lg font-semibold">
                          <span className="text-ink-muted">{index + 1}.</span> {step.name}
                        </h3>
                        <span className="rounded-full bg-navy-50 px-2.5 py-0.5 text-xs font-semibold text-navy-800">
                          {step.actor}
                        </span>
                      </div>
                      <p className="mt-1.5 text-sm leading-relaxed text-ink">{step.body}</p>
                    </div>
                  </li>
                );
              })}
            </ol>

            <aside aria-labelledby="roles-heading" className="h-fit rounded-lg border border-line bg-canvas p-6">
              <h3 id="roles-heading" className="text-base font-semibold">
                Three roles
              </h3>
              <dl className="mt-4 space-y-5 text-sm">
                <div className="flex gap-3">
                  <FileText aria-hidden className="mt-0.5 size-5 shrink-0 text-teal-700" />
                  <div>
                    <dt className="font-semibold text-navy-900">Citizen</dt>
                    <dd className="mt-1 leading-relaxed">Reports and tracks incidents. No account, and reports may be anonymous.</dd>
                  </div>
                </div>
                <div className="flex gap-3">
                  <ClipboardList aria-hidden className="mt-0.5 size-5 shrink-0 text-teal-700" />
                  <div>
                    <dt className="font-semibold text-navy-900">Municipal coordinator</dt>
                    <dd className="mt-1 leading-relaxed">
                      Reviews and verifies reports, decides on duplicates and priority, approves assignments and verifies
                      completed work.
                    </dd>
                  </div>
                </div>
                <div className="flex gap-3">
                  <Wrench aria-hidden className="mt-0.5 size-5 shrink-0 text-teal-700" />
                  <div>
                    <dt className="font-semibold text-navy-900">Maintenance crew member</dt>
                    <dd className="mt-1 leading-relaxed">
                      Sees only the jobs assigned to their crew, accepts or declines them and reports completion.
                    </dd>
                  </div>
                </div>
              </dl>
            </aside>
          </div>
        </div>
      </section>

      <section aria-labelledby="different-heading" className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <div className="max-w-3xl">
          <Eyebrow>What makes it different</Eyebrow>
          <h2 id="different-heading" className="mt-3 text-2xl font-bold sm:text-3xl">
            Methods you can read, check and change
          </h2>
          <p className="mt-4 leading-relaxed text-ink">
            Each method below is deterministic: the same inputs always produce the same result, and the result is shown
            with the numbers behind it. Each one also has a stated limit.
          </p>
        </div>
        <ul className="mt-10 grid gap-5 md:grid-cols-2">
          {DIFFERENTIATORS.map((item) => (
            <li key={item.title} className="flex flex-col rounded-lg border border-line bg-white p-6">
              <span className="flex size-11 items-center justify-center rounded-md bg-teal-50 text-teal-800">
                <item.icon aria-hidden className="size-5" />
              </span>
              <h3 className="mt-4 text-lg font-semibold">{item.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink">{item.body}</p>
              <p className="mt-4 border-t border-line pt-4 text-sm leading-relaxed text-ink">
                <span className="font-semibold text-navy-900">Limit: </span>
                {item.limit}
              </p>
            </li>
          ))}
        </ul>
        <p className="mt-6 max-w-3xl text-sm leading-relaxed text-ink">
          All weights, radii and thresholds are initial engineering assumptions, not validated municipal standards. The
          formulas and default values are set out in{" "}
          <Link href="/how-it-works" className="font-medium text-teal-700 underline underline-offset-2">
            How Civitas Works
          </Link>
          .
        </p>
      </section>

      <section aria-labelledby="control-heading" className="bg-navy-900 text-white">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:px-6 sm:py-20 lg:grid-cols-[20rem_minmax(0,1fr)] lg:gap-14">
          <div>
            <span className="flex size-12 items-center justify-center rounded-md bg-white/10 text-amber-500">
              <ShieldCheck aria-hidden className="size-6" />
            </span>
            <h2 id="control-heading" className="mt-5 text-2xl font-bold text-white sm:text-3xl">
              Humans stay in control
            </h2>
            <p className="mt-4 leading-relaxed text-navy-100">
              Civitas organises information and makes recommendations. Decisions that affect people, crews and
              infrastructure are made by a named person and recorded.
            </p>
          </div>
          <ul className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
            {CONTROLS.map((control) => (
              <li key={control} className="flex gap-3 text-sm leading-relaxed text-navy-50">
                <CheckCircle2 aria-hidden className="mt-0.5 size-5 shrink-0 text-amber-500" />
                <span>{control}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section aria-labelledby="next-heading" className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <h2 id="next-heading" className="text-2xl font-bold sm:text-3xl">
          Where to go next
        </h2>
        <ul className="mt-8 grid gap-5 md:grid-cols-3">
          <li className="flex flex-col rounded-lg border border-line bg-white p-6">
            <MapPin aria-hidden className="size-6 text-teal-700" />
            <h3 className="mt-4 text-lg font-semibold">Report an incident</h3>
            <p className="mt-2 flex-1 text-sm leading-relaxed text-ink">
              Describe an infrastructure problem and mark it on the map. It takes a few minutes and needs no account.
            </p>
            <ButtonLink href="/report" variant="primary" className="mt-5 self-start">
              Report an Incident
            </ButtonLink>
          </li>
          <li className="flex flex-col rounded-lg border border-line bg-white p-6">
            <Search aria-hidden className="size-6 text-teal-700" />
            <h3 className="mt-4 text-lg font-semibold">Track an incident</h3>
            <p className="mt-2 flex-1 text-sm leading-relaxed text-ink">
              Enter your reference and access code to see the current status and any public updates.
            </p>
            <ButtonLink href="/track" variant="secondary" className="mt-5 self-start">
              Track an incident
            </ButtonLink>
          </li>
          <li className="flex flex-col rounded-lg border border-line bg-white p-6">
            <Eye aria-hidden className="size-6 text-teal-700" />
            <h3 className="mt-4 text-lg font-semibold">Transparency and limitations</h3>
            <p className="mt-2 flex-1 text-sm leading-relaxed text-ink">
              Read what the AI does and does not do, which parts are deterministic and what Civitas cannot tell you.
            </p>
            <ButtonLink href="/transparency" variant="secondary" className="mt-5 self-start">
              Read the limitations
            </ButtonLink>
          </li>
        </ul>
        <p className="mt-8 max-w-3xl text-sm leading-relaxed text-ink">
          Civitas was built for the EvoHacks 2 hackathon under the theme &ldquo;Projects for Social Good&rdquo;. For how
          report data is handled, see the{" "}
          <Link href="/privacy" className="font-medium text-teal-700 underline underline-offset-2">
            privacy page
          </Link>
          .
        </p>
      </section>
    </div>
  );
}
