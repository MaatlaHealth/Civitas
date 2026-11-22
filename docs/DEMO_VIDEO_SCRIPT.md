# Demo video voice-over script

For `demo-video/civitas-demo.webm` (3 minutes 27 seconds, silent, recorded on the live site by `scripts/record-demo.mjs`). Timings are from that recording. Read at a normal speaking pace; each block is sized to fit its slot with a little room. If you fall behind, drop the sentences in *italics*.

Everything in the video is the real site. The reports, crews and assets you see are demonstration records, and the planning section uses the synthetic training scenario. Say so; the script below does.

| Time | On screen | Say |
|---|---|---|
| 0:00 – 0:19 | Home page, scrolling to the five problems and the six steps | This is Civitas. When a pipe bursts or a streetlight fails, the people living next to it notice first. But their reports get scattered, the same problem gets reported ten times, and nobody can tell what is urgent. Civitas is built to sort that out. |
| 0:19 – 0:29 | Report form: category, title, description | Anyone can report a problem without creating an account. Here a resident reports a blocked storm drain and says the road is affected. |
| 0:29 – 0:43 | Typing an address, picking a suggestion, map marker moves | As they type the address, suggestions appear. Choosing one puts the marker on the map, and they can drag it to the exact spot. *Contact details are optional, and this report is anonymous.* |
| 0:43 – 0:58 | Confirmation with reference and code, then the tracking page | They get a reference and a private access code. With those two they can check progress at any time. Right now it says the report is waiting for a coordinator, and that no decision has been made yet. |
| 0:58 – 1:09 | Sign-in with a name, coordinator overview | Now the municipal side. The coordinator's overview counts everything from the stored records: what is waiting for review, what is high priority, which crews are free. |
| 1:09 – 1:28 | Incident record: Interpretation, Priority table, Consequence screening | Opening the new report. The interpretation panel shows where each judgement came from. The AI description is optional, and here it is unavailable, so the report was classified by plain rules and nothing was lost. Below that is the priority score, with every factor and its weight. Anything unknown is left out and listed, never counted as safe. |
| 1:28 – 1:42 | Duplicates page, "How the score was calculated" opened | Civitas also found that this report matches an earlier one at the same place. The match score is built from distance, category, time and wording. It only suggests. A coordinator confirms or rejects it, and no report is ever merged or deleted. |
| 1:42 – 1:58 | Verify the report, crew recommendations, Assign | The coordinator verifies the report. Civitas then ranks the crews. Only a drainage crew qualifies for a blocked drain, so the others are marked not eligible, with the reason. The coordinator assigns the recommended crew. |
| 1:58 – 2:25 | Crew member signs in, opens the job, accepts, starts, writes notes, marks complete | Now a crew member signs in. They only see their own crew's jobs, with no reporter details. They accept the job, start work, and when it is done they write what they did and mark it complete. *They could also attach a photo or ask the coordinator for help.* The incident is not resolved yet. That needs a coordinator. |
| 2:25 – 2:40 | Coordinator verifies completion, publishes an update, closes; audit trail | The coordinator checks the work, publishes a short update for the resident, and closes the incident. Every step, and who did it, is in the audit trail. |
| 2:40 – 2:54 | Planning page, "Run both and compare", metrics table | This is the planning comparison, on a made-up training scenario. First come, first served against the Civitas plan. Both assign all eight incidents, but the weighted waiting time drops from about eleven hundred and seventy to about three hundred and forty. |
| 2:54 – 3:07 | Electrical Team set to unavailable, compare again | If the electrical crew becomes unavailable, the plan is recalculated straight away. Two incidents can no longer be assigned, and Civitas says so plainly instead of hiding it. |
| 3:07 – 3:16 | Operations map with markers and legend | The operations map shows open incidents by priority, with crew bases and registered assets. |
| 3:16 – 3:27 | Tracking page: Closed, full timeline, the public update | And the resident who reported it can see the whole story: every stage, the date, and the coordinator's update. That is Civitas: from a citizen's report to a coordinated repair. |

## Things to say accurately

- The planning figures (1167.9 and 336.7 weighted minutes) come from an invented scenario under stated assumptions. Do not present them as real response times or savings.
- Civitas is not used by any municipality. The site says so on every page.
- The AI (Gemini) integration exists but did not run successfully on this deployment. Do not say it analysed the report.
- The records on screen are demonstration data, apart from the one report submitted during the recording, which is also made up.

## Adding the voice

1. Open the video in any editor (Clipchamp is free on Windows 11: Start menu → Clipchamp).
2. Import `demo-video/civitas-demo.webm`, then use **Record & create → Audio** to record while the video plays, reading from the table.
3. Export as 1080p or 720p MP4 and upload it to YouTube (unlisted is fine) or Vimeo.
4. Paste the link into Devpost and into `DEVPOST_SUBMISSION.md`.
