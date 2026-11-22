# AI assistance record

This file records, as accurately as possible, how AI was used to build Civitas for EvoHacks 2. It exists so the submission can disclose AI use truthfully. **Check it against the hackathon's AI policy before submitting**, and complete the developer section at the end.

## Tools

- **Claude (Anthropic), through Claude Code** in the desktop app, on 22 November 2026.
- Two Claude sub-agents were started by the main session for parallel work. Both were interrupted by a network error after writing their files; the main session then reviewed, ran and corrected their output.

## What the developer provided

- The complete product specification ("Civitas: complete production build directive"): product definition, roles, required features, architecture preferences, safety constraints (no autonomous dispatch, no AI structural judgements, no fabricated data or claims), algorithm outlines including the two weighted formulas and example search radii, testing requirements and the definition of done.
- The Civitas logo.
- The repository, deployment target and deadline.

## What the AI produced

Working from that specification, the AI wrote essentially all of the code and documentation in the initial commits:

| Area | AI contribution |
|---|---|
| Architecture | Chose the concrete stack within the specification's preferences (Drizzle, PGlite for local/test, Auth.js credentials, Netlify Blobs, Gemini over REST), and the service-layer authorisation design. |
| Algorithms | Implemented Haversine and bounding boxes, the duplicate score and its normalisations, the priority engine including unknown-factor handling and band thresholds, screening rules, the Hungarian solver, the slot-based cost model and the FIFO baseline. **All numeric values beyond those in the specification (category baselines, compatibility values, thresholds, speeds, durations, priority weights) were chosen by the AI as initial assumptions** and are labelled as such in the code and interface. |
| Application | Database schema and migration, services, API routes, server actions, all pages and components. |
| Public page copy | Home, How it works, Transparency and Privacy pages were drafted by a sub-agent from the source code and a fact list, then checked for unsupported claims. |
| Tests | Unit tests were drafted by a sub-agent instructed to derive expected values independently and to report bugs instead of weakening tests. It found four real defects, which were then fixed. Integration and end-to-end tests were written by the main session. |
| Synthetic scenario | The nine training reports, three assets and six crews were invented by the AI and are labelled synthetic everywhere they appear. |
| Documentation | README, this file and the Devpost draft. |

## Changes requested by the developer after the first deployment

After deploying and trying the site, the developer asked for: address suggestions while typing on the report form, name-only sign-in for judges, Unsplash photographs, and a rewrite of the home page in plainer language. The developer chose these changes and the AI implemented them. The developer was told that name-only sign-in exposes all submitted data; it is off unless the developer sets CIVITAS_OPEN_ACCESS=true on the deployment.

## Verification actually performed

Run by the AI in the developer's environment and recorded in the README: type check, lint, production build, 401 unit tests, 26 integration tests, 18 Playwright end-to-end tests, `npm audit`, and visual review of screenshots captured from the running application.

Not performed: any live Gemini API call; any deployment to Netlify; any test against Netlify DB or Netlify Blobs; accessibility testing with assistive technology; independent security review.

## Defects found and fixed during the build

- Bounding box about 0.1% smaller than the Haversine circle it was meant to contain.
- Distances between 999.5 m and 1000 m formatted as "1000 m".
- Keyword classifier matching inside longer words ("started" matched "tar").
- Accented letters splitting a word during tokenisation.
- Tables widening the page on phones (two separate causes).
- MapLibre pinned to a version with a critical advisory; upgraded, which required serving its worker file separately.

## Developer contributions (to be completed by the developer)

The hackathon may require a statement of your own work. Replace this section with an accurate account, for example:

- Code you reviewed, changed or wrote after the initial AI-assisted build (list commits).
- Parameters you reviewed or changed (weights, radii, thresholds) and why.
- Testing you carried out yourself, including on the deployed site.
- Deployment, database provisioning and account setup.
- The demo video.

Do not describe AI-written code as written without AI assistance.
