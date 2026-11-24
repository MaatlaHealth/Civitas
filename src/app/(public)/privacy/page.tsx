import { AlertTriangle, Camera, Eye, Lock, MapPin, ShieldCheck, type LucideIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Privacy",
  description:
    "What information Civitas collects when you report an infrastructure incident, why, who can see it, which third parties are involved and how it is deleted.",
};

const SECTIONS = [
  { id: "summary", label: "Summary" },
  { id: "collected", label: "What is collected and why" },
  { id: "access", label: "Who can see it" },
  { id: "photographs", label: "Photographs" },
  { id: "third-parties", label: "Third parties" },
  { id: "retention", label: "Retention and deletion" },
  { id: "erasure", label: "Asking for erasure" },
  { id: "legal", label: "Legal status" },
];

const SUMMARY: Array<{ icon: LucideIcon; title: string; body: string }> = [
  {
    icon: ShieldCheck,
    title: "No account, and you may be anonymous",
    body: "You can report and track an incident without registering. Contact details are optional.",
  },
  {
    icon: Lock,
    title: "Contact details are kept apart",
    body: "They are stored separately from the incident record and can be erased without deleting the incident.",
  },
  {
    icon: Camera,
    title: "Photographs are private",
    body: "They are stripped of metadata, stored privately and shown only to signed-in staff.",
  },
  {
    icon: Eye,
    title: "The tracking page shows no personal data",
    body: "It shows the status, a timeline and public updates. It never shows contact details, photographs or internal notes.",
  },
];

const COLLECTED: Array<{ item: string; detail: string; why: string; required: string }> = [
  {
    item: "Report content",
    detail: "Category, title, description, and your answers about whether access is blocked and how long the problem has existed.",
    why: "To understand the problem, compare it with other reports and calculate a priority.",
    required: "Required",
  },
  {
    item: "Location",
    detail: "The map coordinates of the marker you place, and an address or landmark if you type one.",
    why: "To find the problem, detect duplicate reports, list nearby registered assets and recommend a crew.",
    required: "Required",
  },
  {
    item: "Photograph",
    detail: "One image, re-encoded before it is stored.",
    why: "To help a coordinator assess the report and a crew find and prepare for the job.",
    required: "Optional",
  },
  {
    item: "Contact details",
    detail: "Name, email address and phone number, whichever you choose to give.",
    why: "So that a coordinator can contact you about your report if needed.",
    required: "Optional",
  },
  {
    item: "Further information",
    detail: "Anything you add to your report later from the tracking page.",
    why: "To keep the report accurate as the situation changes.",
    required: "Optional",
  },
  {
    item: "Access code hash",
    detail: "A one-way hash of your 20-character access code. The code itself is not stored.",
    why: "To check that the person tracking a report holds its access code.",
    required: "Automatic",
  },
  {
    item: "Rate-limit counter",
    detail: "A hash of your IP address with a count of recent requests. The address itself is not stored in this record.",
    why: "To limit abuse of the report, tracking and sign-in forms.",
    required: "Automatic",
  },
  {
    item: "Audit record",
    detail: "The fact that a report was submitted or added to, with the time. Citizen entries carry no name.",
    why: "To keep a reliable history of what happened to each incident.",
    required: "Automatic",
  },
];

export default function PrivacyPage() {
  return (
    <div>
      <header className="border-b border-line bg-white">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
          <h1 className="mt-3 text-3xl font-bold sm:text-4xl">Privacy</h1>
          <p className="mt-4 max-w-3xl text-lg leading-relaxed text-ink">
            What Civitas collects when you report an infrastructure incident, why it is needed, who can see it and how it
            is deleted.
          </p>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-14 lg:py-16">
        <nav aria-label="On this page" className="h-fit rounded-lg border border-line bg-white p-4 lg:sticky lg:top-6">
          <p className="text-xs font-semibold text-ink-muted">On this page</p>
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
          <div className="flex gap-3 rounded-lg border border-amber-600/40 bg-amber-50 p-5 text-navy-950">
            <AlertTriangle aria-hidden className="mt-0.5 size-5 shrink-0" />
            <div className="min-w-0 text-sm leading-relaxed">
              <p className="font-semibold">This is a demonstration site, and this page is not a legal notice.</p>
              <p className="mt-1">
                The site you are using is our public demonstration and is not operated by a municipality. Data entered
                here may be deleted at any time. This page describes how the software handles information. Each
                organisation that runs Civitas publishes its own privacy notice, and this page does not claim compliance
                with any law.
              </p>
            </div>
          </div>

          <section id="summary" aria-labelledby="summary-heading" className="scroll-mt-6">
            <div className="prose-civitas">
              <h2 id="summary-heading">Summary</h2>
            </div>
            <ul className="grid gap-4 sm:grid-cols-2">
              {SUMMARY.map((point) => (
                <li key={point.title} className="rounded-lg border border-line bg-white p-5">
                  <point.icon aria-hidden className="size-5 text-teal-700" />
                  <h3 className="mt-3 text-base font-semibold">{point.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-ink">{point.body}</p>
                </li>
              ))}
            </ul>
          </section>

          <section id="collected" aria-labelledby="collected-heading" className="scroll-mt-6">
            <div className="prose-civitas">
              <h2 id="collected-heading">What is collected and why</h2>
              <p>
                Civitas collects what is needed to locate, assess and repair an infrastructure problem. It does not ask
                for an identity number, a home address or an account.
              </p>
            </div>
            <div className="overflow-x-auto rounded-lg border border-line bg-white">
              <table className="w-full min-w-[40rem] border-collapse">
                <caption className="sr-only">Information collected when a report is submitted</caption>
                <thead>
                  <tr>
                    <th scope="col" className="table-header">
                      Information
                    </th>
                    <th scope="col" className="table-header">
                      What it contains
                    </th>
                    <th scope="col" className="table-header">
                      Why it is needed
                    </th>
                    <th scope="col" className="table-header">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {COLLECTED.map((row) => (
                    <tr key={row.item}>
                      <th scope="row" className="table-cell text-left font-semibold text-navy-900">
                        {row.item}
                      </th>
                      <td className="table-cell">{row.detail}</td>
                      <td className="table-cell">{row.why}</td>
                      <td className="table-cell whitespace-nowrap">{row.required}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="prose-civitas mt-6">
              <h3>Your device&apos;s location</h3>
              <p>
                The report form can centre the map on your current position, but only if you give your browser permission.
                You can refuse and place the marker by hand; manual selection is always available. Only the position of
                the marker you submit is stored.
              </p>
              <h3>What you write is up to you</h3>
              <p>
                The title and description are free text. Please describe the problem, not people. Avoid names, vehicle
                registration numbers and other details about individuals.
              </p>
              <h3>Staff accounts</h3>
              <p>
                Coordinators and crew members have accounts holding a name, an email address, a role and a hashed
                password. Signing in sets a session cookie that expires after eight hours. Actions taken by staff are
                recorded in the audit log with their account.
              </p>
            </div>
          </section>

          <section id="access" aria-labelledby="access-heading" className="prose-civitas scroll-mt-6">
            <h2 id="access-heading">Who can see it</h2>
            <ul>
              <li>
                <strong>Anyone with your reference and access code</strong> can open the tracking page for your report. It
                shows the reference, category, status, the times of status changes and public updates written by a
                coordinator. It does not show contact details, photographs, internal notes, the reasons for decisions or
                the names of staff.
              </li>
              <li>
                <strong>Coordinators</strong> who are signed in can see the full report, including the photograph, any
                contact details, internal notes and the audit history.
              </li>
              <li>
                <strong>Maintenance crew members</strong> who are signed in can see only the incidents assigned to their
                own crew, and photographs only for those assignments.
              </li>
            </ul>
            <p>
              Keep your access code private. Civitas stores only a hash of it, so the code cannot be recovered or shown to
              you again. A wrong code and an unknown reference give the same answer, so the tracking page cannot be used
              to discover which references exist.
            </p>
          </section>

          <section id="photographs" aria-labelledby="photographs-heading" className="prose-civitas scroll-mt-6">
            <h2 id="photographs-heading">Photographs</h2>
            <ul>
              <li>JPEG, PNG and WebP images up to 4 MB are accepted.</li>
              <li>The file type is checked from the file&apos;s signature (its leading bytes), not from its name.</li>
              <li>
                Every image is re-encoded before it is stored. This removes embedded metadata, including any GPS position
                and device details recorded by the camera.
              </li>
              <li>Images are stored privately and are served only to signed-in staff who are permitted to see them.</li>
              <li>Photographs are never shown on the public tracking page.</li>
            </ul>
            <p>
              Removing metadata does not change what the picture shows. Try not to include faces, number plates or the
              inside of private property.
            </p>
          </section>

          <section id="third-parties" aria-labelledby="third-parties-heading" className="scroll-mt-6">
            <div className="prose-civitas">
              <h2 id="third-parties-heading">Third parties</h2>
              <p>Three outside services are involved when you use Civitas.</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-lg border border-line bg-white p-5">
                <MapPin aria-hidden className="size-5 text-teal-700" />
                <h3 className="mt-3 text-base font-semibold">Address suggestions: Photon</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-ink">
                  When you type in the address box on the report form, the text you type and the rough map position are
                  sent from the Civitas server to Photon, a public search service built on OpenStreetMap data, to fetch
                  suggestions. Photon does not receive your IP address or anything else from your report. If you would
                  rather not use it, place the marker on the map instead.
                </p>
              </div>
              <div className="rounded-lg border border-line bg-white p-5">
                <MapPin aria-hidden className="size-5 text-teal-700" />
                <h3 className="mt-3 text-base font-semibold">Map tiles: OpenFreeMap</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-ink">
                  The map is drawn from OpenFreeMap tiles, which use OpenStreetMap data. Your browser requests those
                  tiles directly from that third party, which therefore receives your IP address and the area of the map
                  you are viewing. Civitas does not send it your report.
                </p>
              </div>
              <div className="rounded-lg border border-line bg-white p-5">
                <Eye aria-hidden className="size-5 text-teal-700" />
                <h3 className="mt-3 text-base font-semibold">AI analysis: Google Gemini</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-ink">
                  If the operating organisation has configured Gemini, the report&apos;s category, title, description and
                  photograph are sent from the Civitas server to Google&apos;s Gemini API for an advisory analysis.
                  Reporter contact details are never sent. If Gemini is not configured, nothing is sent.
                </p>
              </div>
            </div>
            <div className="prose-civitas mt-6">
              <p>
                The application and its database also run on infrastructure chosen by the organisation operating Civitas,
                which processes the data on that organisation&apos;s behalf. For more on the AI analysis, see{" "}
                <Link href="/transparency#ai">Transparency and Limitations</Link>.
              </p>
            </div>
          </section>

          <section id="retention" aria-labelledby="retention-heading" className="prose-civitas scroll-mt-6">
            <h2 id="retention-heading">Retention and deletion</h2>
            <ul>
              <li>
                <strong>Contact details</strong> can be erased by a coordinator at any time. The incident itself is kept
                so that the infrastructure record stays complete. The erasure is recorded in the audit log.
              </li>
              <li>
                <strong>Photographs</strong> can be permanently deleted by a coordinator, from both storage and the
                database.
              </li>
              <li>
                <strong>Closed incidents.</strong> Civitas includes a retention script (<code>npm run retention:purge</code>)
                that erases the contact details of incidents that have been closed for longer than a period the
                operating organisation sets. The organisation decides the period and when the script runs.
              </li>
              <li>
                <strong>Rate-limit counters</strong> are short-lived, and expired counters are deleted.
              </li>
              <li>
                <strong>This demonstration site.</strong> All data may be deleted at any time, without notice.
              </li>
            </ul>
          </section>

          <section id="erasure" aria-labelledby="erasure-heading" className="prose-civitas scroll-mt-6">
            <h2 id="erasure-heading">Asking for erasure</h2>
            <p>
              To have your contact details erased or a photograph deleted, contact the organisation operating the Civitas
              deployment you reported to and quote your reference (for example <code>CIV-XXXXXXXX</code>). A coordinator
              can then carry out the erasure from the incident record. Do not send your access code to anyone by email or
              message.
            </p>
            <p>
              If you reported anonymously and did not attach a photograph, Civitas holds no contact details or image for
              your report.
            </p>
            <p>
              On this demonstration site there is no municipal operator. Data here may be deleted at any time.
            </p>
          </section>

          <section id="legal" aria-labelledby="legal-heading" className="prose-civitas scroll-mt-6">
            <h2 id="legal-heading">Legal status</h2>
            <p>
              The design considers the principles of South Africa&apos;s Protection of Personal Information Act (POPIA),
              such as collecting only what is needed, keeping optional details separate and making erasure possible.
            </p>
            <p>
              Civitas does not claim to comply with POPIA or any other law. No legal or privacy assessment has been
              carried out. An organisation that operates Civitas is responsible for its own assessment, its own privacy
              notice and its own retention policy.
            </p>
          </section>

          <div className="mt-12 flex flex-wrap items-center gap-3 border-t border-line pt-8">
            <ButtonLink href="/report" variant="primary">
              Report an Incident
            </ButtonLink>
            <ButtonLink href="/transparency" variant="secondary">
              Transparency and limitations
            </ButtonLink>
          </div>
        </div>
      </div>
    </div>
  );
}
