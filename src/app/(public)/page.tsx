import { AlertTriangle, ArrowRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
import { URGENT_HAZARD_ADVICE } from "@/lib/domain/categories";

const PROBLEMS = [
  {
    title: "Reports are scattered",
    body: "A phone call here, a WhatsApp message there, a post on a community page. Nobody has the full list.",
  },
  {
    title: "The same leak gets reported ten times",
    body: "Ten neighbours describe one burst pipe in ten different ways, and it looks like ten jobs.",
  },
  {
    title: "Everything looks equally urgent",
    body: "Exposed cables outside a school end up in the same queue as a cracked paving slab.",
  },
  {
    title: "There are never enough crews",
    body: "A handful of teams, each with its own trade, has to cover the whole area.",
  },
  {
    title: "Nobody tells the person who reported it",
    body: "You report a problem, hear nothing, and stop bothering next time.",
  },
];

const STEPS = [
  {
    name: "You report it",
    who: "Resident",
    body: "Pick a category, say what you see, and find the spot by typing the address or tapping the map. A photo helps but is optional. You don't need an account, and you get a reference and a private code to check back later.",
  },
  {
    name: "Civitas checks it",
    who: "Automatic",
    body: "Is there already an open report a few metres away that sounds like the same thing? How serious is this kind of problem, how long has it been there, is a road blocked, is there a registered school or pumping station nearby? Each answer is shown with the numbers behind it.",
  },
  {
    name: "A coordinator decides",
    who: "Coordinator",
    body: "A person reviews every report. They confirm or reject a suggested duplicate, correct the category, and can overrule the priority if they write down why.",
  },
  {
    name: "A crew is assigned",
    who: "Coordinator and crew",
    body: "Civitas suggests the qualified crew that makes most sense given distance, workload and what else is waiting. The coordinator approves it. The crew can accept or decline.",
  },
  {
    name: "The work gets done and checked",
    who: "Crew, then coordinator",
    body: "The crew records what they did and can attach a photo. The incident is only marked resolved once a coordinator has checked it.",
  },
  {
    name: "You can see what happened",
    who: "Resident",
    body: "Your tracking page shows each stage with its date, plus any update the coordinator has written for you.",
  },
];

const CHECKS = [
  {
    title: "Finding duplicates",
    body: "New reports are compared with open ones nearby. Distance counts most, then whether the categories fit, how close together in time they came in, and how similar the wording is. Matches are only suggestions, and two reports are never merged or deleted.",
  },
  {
    title: "Setting priority",
    body: "The score is built from five things: how dangerous, how much it could disrupt services, how many people it affects, how urgent, and how well it has been confirmed. If something isn't known, Civitas says so and leaves it out, so a missing answer is never read as “safe”.",
  },
  {
    title: "Checking what is nearby",
    body: "If an incident is close to an asset the coordinator has registered, such as a hospital or substation, Civitas points it out. Being close doesn't prove anything is affected, so it is always flagged for a person to check.",
  },
  {
    title: "Planning crews",
    body: "An electrical fault never goes to a water crew, and a full crew is never given more. Among the crews that qualify, the plan keeps the most serious incidents waiting the shortest time. You can compare it with plain first-come-first-served on the planning page.",
  },
];

function PhotoCredit({ name, href }: { name: string; href: string }) {
  return (
    <p className="mt-1.5 text-xs text-ink-muted">
      Photo by{" "}
      <a href={href} className="underline underline-offset-2" target="_blank" rel="noreferrer">
        {name}
      </a>{" "}
      on Unsplash
    </p>
  );
}

export default function HomePage() {
  return (
    <div>
      <section aria-labelledby="hero-heading" className="relative isolate overflow-hidden bg-navy-950 text-white">
        <Image
          src="/images/street.jpg"
          alt=""
          fill
          priority
          sizes="100vw"
          className="-z-10 object-cover opacity-35"
        />
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
          <div className="max-w-2xl">
            <h1 id="hero-heading" className="text-3xl leading-tight font-bold text-balance text-white sm:text-5xl sm:leading-[1.1]">
              Better infrastructure starts with better information.
            </h1>
            <p className="mt-5 text-base leading-relaxed text-navy-50 sm:text-lg">
              Civitas transforms community infrastructure reports into actionable intelligence, helping engineering
              teams identify problems, prioritize responses and coordinate repairs.
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
            <p className="mt-6 text-sm text-navy-50">
              Reported something already?{" "}
              <Link href="/track" className="font-semibold text-white underline underline-offset-4 hover:text-amber-500">
                Check on it here
              </Link>
            </p>
          </div>
          <p className="mt-10 text-xs text-navy-100">
            Photo by{" "}
            <a href="https://unsplash.com/photos/a-city-street-with-cars-and-people-C_cOkO1AO4w" className="underline underline-offset-2" target="_blank" rel="noreferrer">
              Ngcali Alexa Magopeni
            </a>{" "}
            on Unsplash
          </p>
        </div>
      </section>

      <div className="border-b border-amber-600/30 bg-amber-100 text-navy-950">
        <div className="mx-auto flex max-w-6xl gap-3 px-4 py-3 text-sm leading-relaxed sm:px-6">
          <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" />
          <p>{URGENT_HAZARD_ADVICE}</p>
        </div>
      </div>

      <section aria-labelledby="problems-heading" className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_26rem] lg:gap-14">
          <div className="min-w-0">
            <h2 id="problems-heading" className="text-2xl font-bold sm:text-3xl">
              Why a pothole can take months to fix
            </h2>
            <p className="mt-4 leading-relaxed">
              The people who live next to a problem usually spot it first. What goes wrong is everything that happens
              after they report it.
            </p>
            <ol className="mt-8 space-y-5">
              {PROBLEMS.map((problem, index) => (
                <li key={problem.title} className="flex gap-4">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-navy-900 text-sm font-bold text-white">
                    {index + 1}
                  </span>
                  <div>
                    <h3 className="text-base font-semibold">{problem.title}</h3>
                    <p className="mt-1 text-sm leading-relaxed">{problem.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
          <figure className="min-w-0">
            <Image
              src="/images/asphalt.jpg"
              alt="Badly cracked and broken road surface"
              width={1200}
              height={1800}
              sizes="(min-width: 1024px) 26rem, 100vw"
              className="h-72 w-full rounded-lg object-cover lg:h-full lg:max-h-[30rem]"
            />
            <PhotoCredit name="Vladimir Litvinov" href="https://unsplash.com/photos/cracked-dark-asphalt-surface-p1vkTeORouw" />
          </figure>
        </div>
      </section>

      <section aria-labelledby="workflow-heading" className="border-y border-line bg-white">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
          <h2 id="workflow-heading" className="text-2xl font-bold sm:text-3xl">
            What happens to a report
          </h2>
          <p className="mt-4 max-w-3xl leading-relaxed">
            The software does the sorting and the sums. People make the decisions, and each one is recorded.
          </p>
          <ol className="mt-10 grid gap-x-10 gap-y-8 md:grid-cols-2">
            {STEPS.map((step, index) => (
              <li key={step.name} className="flex gap-4">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-teal-600 text-base font-bold text-white">
                  {index + 1}
                </span>
                <div className="min-w-0">
                  <h3 className="text-lg font-semibold">{step.name}</h3>
                  <p className="text-xs font-semibold tracking-wide text-teal-800 uppercase">{step.who}</p>
                  <p className="mt-2 text-sm leading-relaxed">{step.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section aria-labelledby="checks-heading" className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <div className="grid gap-10 lg:grid-cols-[24rem_minmax(0,1fr)] lg:gap-14">
          <figure className="min-w-0">
            <Image
              src="/images/walkway.jpg"
              alt="Workers in high-visibility clothing relaying a brick walkway"
              width={1200}
              height={1800}
              sizes="(min-width: 1024px) 24rem, 100vw"
              className="h-72 w-full rounded-lg object-cover lg:h-[26rem]"
            />
            <PhotoCredit name="Denise Jans" href="https://unsplash.com/photos/a-group-of-construction-workers-working-on-a-brick-walkway-TL2nCgQ1hBc" />
          </figure>
          <div className="min-w-0">
            <h2 id="checks-heading" className="text-2xl font-bold sm:text-3xl">
              How the checks work
            </h2>
            <p className="mt-4 leading-relaxed">
              None of this is a black box. Every score comes with the figures that produced it, and a coordinator can
              disagree with any of them.
            </p>
            <dl className="mt-8 grid gap-6 sm:grid-cols-2">
              {CHECKS.map((check) => (
                <div key={check.title}>
                  <dt className="text-base font-semibold text-navy-900">{check.title}</dt>
                  <dd className="mt-1.5 text-sm leading-relaxed">{check.body}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-8 text-sm leading-relaxed">
              The numbers we use for all of this are our starting assumptions. They haven&apos;t been tested against a
              real municipality&apos;s records yet. The formulas are written out on the{" "}
              <Link href="/how-it-works" className="font-medium text-teal-700 underline underline-offset-2">
                How it works
              </Link>{" "}
              page.
            </p>
          </div>
        </div>
      </section>

      <section aria-labelledby="honest-heading" className="bg-navy-900 text-white">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-16">
          <h2 id="honest-heading" className="text-2xl font-bold text-white sm:text-3xl">
            What Civitas is, and what it isn&apos;t
          </h2>
          <div className="mt-6 grid gap-8 text-sm leading-relaxed text-navy-50 md:grid-cols-3">
            <p>
              <strong className="block text-base text-white">It helps people decide.</strong>
              It doesn&apos;t send anyone anywhere by itself. A coordinator approves every assignment and checks every
              finished job.
            </p>
            <p>
              <strong className="block text-base text-white">It isn&apos;t an emergency line.</strong>
              Nobody watches reports around the clock. If someone is in danger, phone your local emergency number.
            </p>
            <p>
              <strong className="block text-base text-white">It&apos;s a hackathon project.</strong>
              We built it for EvoHacks 2. No municipality uses it yet, so a report made here won&apos;t reach a repair
              team.
            </p>
          </div>
          <div className="mt-8 flex flex-wrap gap-3">
            <ButtonLink href="/report" variant="accent">
              Report an Incident
            </ButtonLink>
            <ButtonLink href="/track" variant="secondary">
              Track an incident
            </ButtonLink>
            <ButtonLink href="/transparency" variant="secondary">
              Read the limitations
            </ButtonLink>
          </div>
        </div>
      </section>
    </div>
  );
}
