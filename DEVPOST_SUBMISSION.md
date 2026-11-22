# Devpost submission: Civitas (EvoHacks 2)

Ready-to-review copy for the Devpost form. Items marked **[ADD MANUALLY]** cannot be filled in from the repository and must be completed by the submitter. Everything else is believed accurate as of 22 November 2026; re-check anything that changes before submitting.

---

## Project name

Civitas

## Tagline

From citizen reports to coordinated infrastructure response.

## Theme alignment: Projects for Social Good

Broken infrastructure falls hardest on communities with the least ability to work around it: a burst pipe, an unlit crossing or exposed cables near a school. Residents usually see these problems first, but their reports are scattered, duplicated and hard to rank, and they rarely hear back. Civitas is built to make each report count: it gives residents a simple, account-free way to report and follow a problem, and gives stretched municipal teams a transparent way to decide what to fix first with the crews they actually have.

## Problem statement

Municipal engineering teams face five connected problems between a report and a repair:

1. Complaints arrive through fragmented channels and do not form a shared record.
2. Many reports are incomplete, duplicated or geographically ambiguous.
3. Urgent hazards and routine maintenance look alike in a queue.
4. A few repair crews must be allocated across many competing incidents.
5. Residents get no transparent update on what happened to their report.

## Solution overview

Civitas is a geospatial infrastructure incident intelligence platform with three roles.

- **Citizens** report an incident with a category, description, map location and optional photograph, without creating an account. They receive a reference and a private access code and can track status, a timeline and public updates.
- **Coordinators** see every report with a labelled interpretation (reporter, deterministic rules, optional AI), possible duplicates with the evidence behind each match, an explained priority score, nearby registered critical assets, and a ranked crew recommendation. They confirm, correct, override (with recorded reasons) and approve.
- **Crew members** see only their own crew's jobs, accept or decline them, record field notes, and mark work complete for coordinator verification.

Civitas is decision support. It does not dispatch anyone automatically and is not an emergency service.

## Social impact explanation

Civitas has **not** been deployed with a municipality and has no real-world impact results. What it offers is measurable operational change that a pilot could evaluate:

- Duplicate reports detected and reviewed, instead of being worked separately.
- Time from report to verified, verified to assigned, and assigned to resolved (computed from status history).
- Share of incidents assigned to a crew with a qualifying specialisation (enforced: 100% by construction).
- Priority-weighted waiting time and straight-line travel distance under different dispatch plans.
- Incidents with unresolved review requirements or unknown priority inputs.

On the included **synthetic** training scenario (nine invented reports, six invented crews), the Civitas plan and a first-in-first-out baseline both assign all eight plannable incidents; estimated priority-weighted waiting is 336.7 versus 1167.9 weighted minutes and straight-line travel 9.00 km versus 13.03 km. These figures come from the stated cost model on invented inputs. They are not evidence of real response-time or cost improvements, and the simulator reports honestly when the Civitas plan is not better.

## Key features

- Account-free incident reporting with map picker, permission-based geolocation and typed-coordinate fallback.
- Secure photograph upload: signature check, re-encoding that strips metadata, private storage.
- Citizen tracking with a random reference and hashed access code.
- Geospatial duplicate detection (bounding-box prefilter, Haversine distance, composite score) with reversible coordinator review and no automatic merging.
- Deterministic, explainable priority scoring that distinguishes unknown inputs from zero and lists its limitations.
- Consequence screening against a coordinator-maintained asset registry, always flagged for verification.
- Resource-aware crew assignment (minimum-cost assignment via the Hungarian algorithm) with hard specialisation, availability and capacity rules.
- Planning simulator comparing FIFO with the Civitas plan on live records or a labelled synthetic scenario.
- MapLibre operations map with clustering, filters, legend and a synchronised list alternative.
- Coordinator dashboard, searchable incident table, status workflow with enforced transitions, audit trail, analytics and CSV export.
- Crew workspace with accept/decline, field notes, assistance requests and completion evidence.
- Optional Gemini multimodal analysis, advisory only, schema-validated, with a rule-based fallback.

## What makes the approach distinctive

- **Explanations are first-class.** Every duplicate match, priority score and crew recommendation shows the numbers and reasons behind it.
- **Unknown is not zero.** Missing inputs are excluded and reported, not silently scored as safe.
- **Humans decide.** AI and algorithms recommend; coordinators confirm, override and approve, and every decision is audited.
- **The demo is the product.** The simulator runs the same assignment engine as live recommendations.
- **Honest scope.** Limitations and assumptions are stated in the interface, not only in documentation.

## Technical architecture

A single TypeScript Next.js application on Netlify. Pure engines (`src/lib/engines`) implement duplicates, priority, screening and assignment with no I/O. A service layer (`src/lib/services`) owns authorisation, transactions and the audit trail. Route handlers serve the public API (report, track, images, export); server actions serve staff pages. PostgreSQL (Netlify DB) through Drizzle ORM with SQL migrations; Netlify Blobs for photographs; Gemini over REST for optional analysis. Full detail is in the README.

## Technology stack

Next.js 16, React 19, TypeScript, Tailwind CSS 4, MapLibre GL JS 6 (OpenFreeMap / OpenStreetMap), Recharts, Drizzle ORM, PostgreSQL (Netlify DB; PGlite for local development and tests), Zod, Auth.js, bcryptjs, sharp, Netlify Blobs, Google Gemini API, Vitest, Playwright.

## How the project was built

The developer wrote a detailed product and safety specification. The implementation was then produced with substantial AI assistance (see the disclosure below), in dependency order: domain model and engines, database and services, reporting and tracking, coordinator dashboard, crew workspace, planning simulator, then tests and documentation. The work was verified with a type check, lint, a production build, 401 unit tests, 26 integration tests against in-memory PostgreSQL and 15 browser end-to-end tests.

**[ADD MANUALLY]** Describe your own review, changes, testing and deployment work here.

## Challenges encountered

- **Scoring with missing data.** Treating an unknown factor as zero would have ranked poorly described hazards as low risk. The engine excludes unknowns, rescales the remaining weights and reports each gap.
- **Keeping reports safe when optional services fail.** The report is committed first; photograph storage, duplicate search, priority and AI analysis can each fail independently and be retried.
- **An honest comparison.** A minimum-cost plan can assign more incidents than FIFO, which makes waiting-time totals incomparable; the simulator detects and says this.
- **Not implying real places.** The training scenario is placed at open-ocean coordinates and drawn on a plain grid.
- **Defects found by tests.** Unit tests exposed a bounding box slightly smaller than its search circle and a keyword matcher that matched inside longer words; a visual check exposed a map library upgrade that silently fell back to the no-map state.

## Limitations

- Not yet deployed or tested on Netlify (see status below); live Gemini calls are untested because no API key was available during development.
- All weights, radii and thresholds are initial assumptions, not calibrated on real municipal data.
- Distances are straight-line; there is no routing provider.
- Description similarity is lexical.
- One organisation per deployment; no notifications; staff accounts are managed by script.
- No accessibility conformance, security certification or legal (including POPIA) compliance is claimed.

## Future improvements

- Calibrate parameters with a municipal partner and evaluate on real incident history.
- Road-network travel times and multi-stop routing.
- Email or SMS notifications for reporters and crews.
- Multilingual reporting and semantic description matching.
- Import of authoritative asset registries (for example GIS exports).
- In-app user administration, multi-organisation tenancy, offline-tolerant crew app.
- Formal accessibility and security assessments.

## Links

- **Source repository:** https://github.com/MaatlaHealth/Civitas
- **Deployment:** **[ADD MANUALLY]** Netlify URL, once the site is deployed and you have tested it.
- **Demo video:** **[ADD MANUALLY]**
- **Evaluation accounts:** **[ADD MANUALLY]** If you provide judges with a coordinator and a crew account, create them with `--evaluation`, share the details privately through Devpost, and do not publish passwords in the repository.

## Deployment status at the time of writing

The repository builds for production locally and contains Netlify configuration, but **it has not been deployed**. Do not state that a deployment works until you have opened it and completed the workflow in the README's demonstration instructions.

## AI assistance disclosure

**In the product:** Google Gemini is used, when configured, to produce an advisory description of a report's text and photograph. It never determines priority, changes a record or dispatches anyone, and the application works without it.

**In development:** The code, tests and documentation were produced with substantial assistance from Anthropic's Claude (Claude Code), working from the developer's written specification. Numeric parameters not given in the specification were chosen by the AI as initial assumptions. A fuller record is in `docs/AI_ASSISTANCE.md`. **[ADD MANUALLY]** Confirm this matches the hackathon's AI policy and add your own contributions.

## Pre-existing assets and code disclosure

- **Logo:** the Civitas logo (`Civitas City Map Logo.png`) was supplied by the project owner. **[ADD MANUALLY]** State when and how it was created (and with what tool) if the rules ask for it.
- **Code:** the repository started empty; no pre-existing project code was reused. All dependencies are third-party open-source packages listed in `package.json` and attributed in the README.
- **Data:** no real municipal data is included. The training scenario is synthetic and labelled as such.
