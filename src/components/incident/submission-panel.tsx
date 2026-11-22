/* eslint-disable @next/next/no-img-element -- photographs are served by an authenticated route, not the image optimiser */
import { LazyPointMap } from "@/components/map/lazy";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Card, CardBody, CardHeader, DefinitionList } from "@/components/ui/layout";
import { deleteImageAction, eraseContactAction } from "@/lib/actions/coordinator";
import { REPORTED_DURATION_LABELS } from "@/lib/domain/types";
import { formatDateTime } from "@/lib/format";
import type { IncidentDetail } from "@/lib/services/incidents";

const OBSTRUCTION_LABELS = { true: "Yes (reporter's statement)", false: "No (reporter's statement)", null: "Not stated" } as const;

export function SubmissionPanel({ detail }: { detail: IncidentDetail }) {
  const { incident, contact, images } = detail;

  return (
    <Card>
      <CardHeader title="Original citizen submission" description={`Received ${formatDateTime(incident.createdAt)}`} />
      <CardBody className="space-y-5">
        <div>
          <h3 className="text-base font-semibold">{incident.title}</h3>
          <p className="mt-1 text-sm whitespace-pre-line">{incident.description}</p>
        </div>
        <DefinitionList
          items={[
            { term: "Address or landmark", detail: incident.address ?? "Not given" },
            { term: "Road or walkway blocked", detail: OBSTRUCTION_LABELS[String(incident.obstructsAccess) as keyof typeof OBSTRUCTION_LABELS] },
            { term: "How long it has existed", detail: REPORTED_DURATION_LABELS[incident.reportedDuration] },
            { term: "Reporter", detail: contact ? "Contact details provided" : "Anonymous or no contact details" },
          ]}
        />

        <LazyPointMap latitude={incident.latitude} longitude={incident.longitude} label={`the reported location of ${incident.reference}`} />

        <div>
          <h3 className="text-sm font-semibold">Photographs</h3>
          {images.length === 0 ? (
            <p className="text-sm text-ink-muted">No photographs are stored for this incident.</p>
          ) : (
            <ul className="mt-2 grid gap-3 sm:grid-cols-2">
              {images.map((image) => (
                <li key={image.id}>
                  <a href={`/api/images/${image.id}`} target="_blank" rel="noreferrer">
                    <img
                      src={`/api/images/${image.id}`}
                      alt={image.kind === "report" ? "Photograph supplied by the reporter" : "Completion evidence uploaded by the crew"}
                      width={image.width}
                      height={image.height}
                      loading="lazy"
                      className="h-48 w-full rounded-md border border-line object-cover"
                    />
                  </a>
                  <p className="mt-1 text-xs text-ink-muted">
                    {image.kind === "report" ? "From the reporter" : "Crew completion evidence"} · {formatDateTime(image.createdAt)}
                  </p>
                  <ActionForm action={deleteImageAction} confirmMessage="Permanently delete this photograph? This cannot be undone.">
                    <input type="hidden" name="id" value={image.id} />
                    <SubmitButton variant="ghost" size="sm" className="text-red-800">Delete photograph</SubmitButton>
                  </ActionForm>
                </li>
              ))}
            </ul>
          )}
        </div>

        {contact ? (
          <div className="rounded-md border border-line p-3">
            <h3 className="text-sm font-semibold">Reporter contact details (private)</h3>
            <DefinitionList
              items={[
                { term: "Name", detail: contact.name ?? "Not given" },
                { term: "Email", detail: contact.email ?? "Not given" },
                { term: "Phone", detail: contact.phone ?? "Not given" },
              ]}
            />
            <ActionForm action={eraseContactAction} className="mt-2" confirmMessage="Permanently erase the reporter's contact details? This cannot be undone.">
              <input type="hidden" name="id" value={incident.id} />
              <SubmitButton variant="ghost" size="sm" className="text-red-800">Erase contact details</SubmitButton>
            </ActionForm>
          </div>
        ) : null}
      </CardBody>
    </Card>
  );
}
