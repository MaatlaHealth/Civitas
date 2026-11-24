import Image from "next/image";
import Link from "next/link";
import type { CSSProperties } from "react";
import { buttonClasses } from "@/components/ui/button";
import { walkthroughHref } from "@/lib/site";

const JOURNEY = [
  { time: "08:14", title: "A resident reports it", detail: "Burst pipe flooding the road, Rissik Street. Typed the address, dropped a pin, added a photo. No account needed." },
  { time: "08:14", title: "Civitas checks it", detail: "Matches one open report 30 m away. Priority works out as High, and every factor behind that is shown." },
  { time: "08:31", title: "A coordinator confirms", detail: "Severity confirmed. The two reports are linked as one problem, and both are kept." },
  { time: "08:33", title: "The water crew is assigned", detail: "Nearest qualified crew with capacity, 2.3 km away. They accept from their phone." },
  { time: "11:02", title: "Repaired, then checked", detail: "The crew records what they did. A coordinator signs it off, and the resident can see the update." },
];

const TOUR = [
  {
    title: "Ten reports of one burst pipe become one job",
    body: "When a new report lands near an open one, Civitas compares distance, category, timing and wording and shows you the match with the evidence. You confirm or reject it. Nothing is merged or deleted, and you can undo the decision.",
    image: { src: "/product/duplicate.png", width: 1752, height: 994, alt: "A possible duplicate: two burst-pipe reports 30 metres apart, with the match score and both descriptions side by side." },
  },
  {
    title: "A priority you can explain to a councillor",
    body: "The score comes from five things: how dangerous, how disruptive, how many people affected, how urgent and how well confirmed. Each one is listed with its weight and where it came from. If something isn't known, Civitas says so instead of guessing, and you can overrule the result with a written reason.",
    image: { src: "/product/priority.png", width: 1752, height: 1090, alt: "The priority panel for an incident, listing each factor with its weight, value and basis." },
  },
  {
    title: "The right crew, not just the next one",
    body: "An electrical fault never goes to a water crew, and a full crew is never given more. Among the crews that qualify, Civitas plans so the most serious problems wait the shortest time, and lets you compare that plan with plain first come, first served before you approve anything.",
    image: { src: "/product/planning.png", width: 1668, height: 770, alt: "A comparison table of two crew plans, first come first served against the Civitas plan, on a training scenario." },
  },
  {
    title: "Everything open, on one map",
    body: "Incidents coloured by priority, crew bases, and the sites you have told Civitas matter, such as pumping stations, schools and clinics. The same list sits beside the map for anyone who would rather read than click.",
    image: { src: "/product/map.png", width: 1016, height: 1244, alt: "The operations map with incident markers coloured by priority, crew bases and a legend." },
  },
];

const WORKSPACES = [
  {
    who: "Residents",
    points: ["Report in about a minute, with no account", "Type an address and pick from suggestions", "Follow progress with a reference and a private code", "Can report anonymously"],
  },
  {
    who: "Coordinators",
    points: ["One queue, sorted by priority", "Suggested duplicates and crews, with reasons", "Approve, overrule or reassign, all on the record", "Export and simple reporting"],
  },
  {
    who: "Crews",
    points: ["See only their own jobs", "Accept or decline with a reason", "Add notes and a photo from site", "Ask the coordinator for help"],
  },
];

const HONEST = [
  { claim: "Distances are straight-line.", detail: "Civitas does not plan road routes yet, and says so wherever a distance appears." },
  { claim: "The scoring starts from our assumptions.", detail: "Weights and thresholds are set out in full and are meant to be adjusted with you, not taken on trust." },
  { claim: "AI is optional and only describes.", detail: "It can summarise a report and photo for the coordinator. It never sets priority and never sends anyone anywhere." },
  { claim: "It is not an emergency line.", detail: "Nobody watches reports around the clock, and the site tells residents that before they submit." },
];

export default function HomePage() {
  const walkthrough = walkthroughHref();
  return (
    <div>
      <section aria-labelledby="hero-heading" className="border-b border-line bg-white">
        <div className="mx-auto grid max-w-6xl gap-12 px-4 py-14 sm:px-6 sm:py-20 lg:grid-cols-[minmax(0,1fr)_27rem] lg:gap-16">
          <div className="min-w-0 lg:pt-6">
            <h1 id="hero-heading" className="max-w-xl text-4xl leading-[1.05] font-extrabold text-balance sm:text-6xl">
              From the first report to the finished repair.
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink">
              Civitas is incident management for roads, water, drainage and street lighting. Residents report a problem
              in a minute. Your coordinators see what is duplicated, what is urgent and which crew should go.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              {walkthrough ? (
                <a href={walkthrough} className={buttonClasses("accent", "lg")}>
                  Book a walkthrough
                </a>
              ) : null}
              <Link href="/report" className={buttonClasses(walkthrough ? "secondary" : "accent", "lg")}>
                Try reporting a problem
              </Link>
              <Link href="/how-it-works" className={buttonClasses("ghost", "lg")}>
                See how it works
              </Link>
            </div>
            <p className="mt-10 max-w-md text-sm leading-relaxed text-ink-muted">
              Civitas is new and not yet running in a municipality. We are looking for our first councils and utilities
              to pilot it with.
            </p>
          </div>

          <figure className="min-w-0">
            <ol className="route space-y-7 py-3">
              {JOURNEY.map((stop, index) => (
                <li key={stop.title} className="route-stop" style={{ "--stop-index": index } as CSSProperties}>
                  <p className="text-sm font-semibold text-teal-800 tabular-nums">{stop.time}</p>
                  <h2 className="text-lg leading-snug font-bold">{stop.title}</h2>
                  <p className="mt-1 text-sm leading-relaxed text-ink">{stop.detail}</p>
                </li>
              ))}
            </ol>
            <figcaption className="mt-4 pl-13 text-xs text-ink-muted">One report&apos;s journey. The times are an example.</figcaption>
          </figure>
        </div>
      </section>

      <section aria-labelledby="problem-heading" className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-16">
          <Image
            src="/images/asphalt.jpg"
            alt="Badly cracked and broken road surface"
            width={1200}
            height={1800}
            sizes="(min-width: 1024px) 34rem, 100vw"
            className="h-72 w-full rounded-sm object-cover lg:h-full lg:max-h-[34rem]"
          />
          <div className="min-w-0 self-center">
            <h2 id="problem-heading" className="text-3xl leading-tight font-bold sm:text-4xl">
              The repair is rarely the hard part.
            </h2>
            <div className="mt-6 space-y-4 text-lg leading-relaxed">
              <p>
                The call comes in on one line, a WhatsApp on another, and a councillor forwards an email about the same
                pothole. By the time someone has worked out that it is one problem and not five, a week has gone.
              </p>
              <p>
                Meanwhile exposed cables outside a school sit in the same queue as a cracked paving slab, and the
                resident who reported them hears nothing and stops reporting.
              </p>
              <p>Civitas is built for the part between the report and the crew arriving.</p>
            </div>
            <p className="mt-6 text-xs text-ink-muted">
              Photo by{" "}
              <a href="https://unsplash.com/photos/cracked-dark-asphalt-surface-p1vkTeORouw" className="underline underline-offset-2" target="_blank" rel="noreferrer">
                Vladimir Litvinov
              </a>{" "}
              on Unsplash
            </p>
          </div>
        </div>
      </section>

      <section aria-labelledby="tour-heading" className="border-y border-line bg-white">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
          <h2 id="tour-heading" className="max-w-2xl text-3xl leading-tight font-bold sm:text-4xl">
            What your coordinators actually see
          </h2>
          <p className="mt-4 max-w-2xl text-lg leading-relaxed">
            These are screens from the product, showing demonstration records, not mock-ups.
          </p>
          <div className="mt-14 space-y-20">
            {TOUR.map((item, index) => (
              <article key={item.title} className="grid items-center gap-8 lg:grid-cols-12 lg:gap-12">
                <div className={`min-w-0 lg:col-span-5 ${index % 2 === 1 ? "lg:order-2" : ""}`}>
                  <h3 className="text-2xl leading-snug font-bold">{item.title}</h3>
                  <p className="mt-3 leading-relaxed">{item.body}</p>
                </div>
                <div className="min-w-0 lg:col-span-7">
                  <Image
                    src={item.image.src}
                    width={item.image.width}
                    height={item.image.height}
                    alt={item.image.alt}
                    sizes="(min-width: 1024px) 40rem, 100vw"
                    className={`h-auto rounded-md border border-navy-200 shadow-[0_18px_40px_-24px_rgba(8,45,82,0.55)] ${item.image.height > item.image.width ? "mx-auto w-full max-w-sm" : "w-full"}`}
                  />
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section aria-labelledby="workspaces-heading" className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
        <h2 id="workspaces-heading" className="max-w-2xl text-3xl leading-tight font-bold sm:text-4xl">
          Three groups of people, one record of what happened
        </h2>
        <div className="mt-10 grid gap-10 md:grid-cols-3 md:gap-0 md:divide-x md:divide-line">
          {WORKSPACES.map((workspace) => (
            <div key={workspace.who} className="md:px-8 md:first:pl-0 md:last:pr-0">
              <h3 className="text-xl font-bold">{workspace.who}</h3>
              <ul className="mt-4 space-y-2.5 leading-relaxed">
                {workspace.points.map((point) => (
                  <li key={point} className="border-l-2 border-amber-500 pl-3">
                    {point}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="honest-heading" className="relative isolate overflow-hidden bg-navy-950 text-white">
        <Image src="/images/street.jpg" alt="" fill sizes="100vw" className="-z-10 object-cover opacity-30" />
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
          <h2 id="honest-heading" className="max-w-2xl text-3xl leading-tight font-bold text-white sm:text-4xl">
            What Civitas does not do
          </h2>
          <p className="mt-4 max-w-2xl text-lg leading-relaxed text-navy-50">
            You will be asked to defend decisions made with this software, so here is where its edges are.
          </p>
          <dl className="mt-10 grid gap-x-12 gap-y-8 md:grid-cols-2">
            {HONEST.map((item) => (
              <div key={item.claim}>
                <dt className="font-display text-lg font-bold text-white">{item.claim}</dt>
                <dd className="mt-1 leading-relaxed text-navy-50">{item.detail}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-10">
            <Link href="/transparency" className="font-semibold text-white underline decoration-amber-500 decoration-2 underline-offset-8">
              Read the full list of limits
            </Link>
          </p>
          <p className="mt-12 text-xs text-navy-100">
            Photo by{" "}
            <a href="https://unsplash.com/photos/a-city-street-with-cars-and-people-C_cOkO1AO4w" className="underline underline-offset-2" target="_blank" rel="noreferrer">
              Ngcali Alexa Magopeni
            </a>{" "}
            on Unsplash
          </p>
        </div>
      </section>

      <section aria-labelledby="start-heading" className="bg-amber-500 text-navy-950">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-8 px-4 py-14 sm:px-6">
          <div className="max-w-xl">
            <h2 id="start-heading" className="text-3xl leading-tight font-bold text-navy-950 sm:text-4xl">
              See it with your own streets.
            </h2>
            <p className="mt-3 text-lg leading-relaxed">
              {walkthrough
                ? "A short call with your area on the map and your kinds of incident."
                : "Report a made-up problem on this demonstration site and follow it through."}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            {walkthrough ? (
              <a href={walkthrough} className={buttonClasses("primary", "lg")}>
                Book a walkthrough
              </a>
            ) : null}
            <Link href="/report" className={buttonClasses(walkthrough ? "secondary" : "primary", "lg")}>
              Try reporting a problem
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
