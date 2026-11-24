"use client";

import { Loader2 } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useId, useRef, useState, type FormEvent } from "react";
import type { PickedLocation } from "@/components/map/location-picker";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/layout";
import { CATEGORY_DEFINITIONS, INCIDENT_CATEGORIES, URGENT_HAZARD_ADVICE, isIncidentCategory } from "@/lib/domain/categories";
import { REPORTED_DURATIONS, REPORTED_DURATION_LABELS } from "@/lib/domain/types";
import { AddressSearch } from "./address-search";
import { downscaleImage } from "./downscale-image";
import { ReportConfirmation, type SubmissionReceipt } from "./report-confirmation";

const LocationPicker = dynamic(() => import("@/components/map/location-picker").then((module) => module.LocationPicker), {
  ssr: false,
  loading: () => (
    <p className="flex h-72 items-center justify-center rounded-md border border-line bg-navy-50 text-sm text-ink-muted" role="status">
      Loading map
    </p>
  ),
});

const ACCEPTED_IMAGE_TYPES = "image/jpeg,image/png,image/webp";
const MAX_ORIGINAL_BYTES = 25 * 1024 * 1024;

type FieldErrors = Record<string, string>;

interface ApiError {
  error?: { message?: string; fieldErrors?: FieldErrors };
}

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="mt-1 text-sm font-medium text-red-700">
      {message}
    </p>
  );
}

export function ReportForm({ openAccess = false }: { openAccess?: boolean }) {
  const formId = useId();
  const errorSummaryRef = useRef<HTMLDivElement>(null);
  // One key per form session makes an accidental double submission harmless.
  const [submissionKey] = useState(() => crypto.randomUUID());
  const [category, setCategory] = useState("");
  const [location, setLocation] = useState<PickedLocation | null>(null);
  const [address, setAddress] = useState("");
  const [anonymous, setAnonymous] = useState(false);
  const [photograph, setPhotograph] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<SubmissionReceipt | null>(null);

  const definition = isIncidentCategory(category) ? CATEGORY_DEFINITIONS[category] : null;
  const field = (name: string) => `${formId}-${name}`;
  const describedBy = (name: string) => (fieldErrors[name] ? `${field(name)}-error` : undefined);

  const fail = (message: string, errors: FieldErrors = {}) => {
    setFormError(message);
    setFieldErrors(errors);
    setSubmitting(false);
    requestAnimationFrame(() => errorSummaryRef.current?.focus());
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;
    setFormError(null);
    setFieldErrors({});

    if (!location) {
      fail("Select the incident location before submitting.", { latitude: "Select a location on the map or enter coordinates." });
      return;
    }
    if (photograph && photograph.size > MAX_ORIGINAL_BYTES) {
      fail("The photograph is too large.", { photograph: "Choose a photograph smaller than 25 MB." });
      return;
    }

    setSubmitting(true);
    const formData = new FormData(event.currentTarget);
    formData.set("submissionKey", submissionKey);
    formData.set("latitude", String(location.latitude));
    formData.set("longitude", String(location.longitude));
    formData.delete("photograph");
    if (photograph) formData.set("photograph", await downscaleImage(photograph), "photograph.jpg");

    let response: Response;
    try {
      response = await fetch("/api/incidents", { method: "POST", body: formData });
    } catch {
      fail("The report could not be sent. Check your internet connection and try again. Nothing you entered has been lost.");
      return;
    }
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      body = null;
    }
    if (!response.ok) {
      const apiError = (body as ApiError | null)?.error;
      fail(apiError?.message ?? "The report could not be submitted. Please try again.", apiError?.fieldErrors ?? {});
      return;
    }
    setReceipt(body as SubmissionReceipt);
    setSubmitting(false);
  };

  if (receipt) return <ReportConfirmation receipt={receipt} />;

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-8" aria-describedby={formError ? `${formId}-summary` : undefined}>
      <fieldset className="space-y-4">
        <legend className="text-lg font-semibold text-navy-900">1. What is the problem?</legend>
        <div>
          <label htmlFor={field("category")} className="label">
            Category <span aria-hidden>*</span>
          </label>
          <select
            id={field("category")}
            name="category"
            className="input"
            required
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            aria-invalid={Boolean(fieldErrors.category)}
            aria-describedby={describedBy("category")}
          >
            <option value="">Choose a category</option>
            {INCIDENT_CATEGORIES.map((key) => (
              <option key={key} value={key}>
                {CATEGORY_DEFINITIONS[key].label}
              </option>
            ))}
          </select>
          <FieldError id={`${field("category")}-error`} message={fieldErrors.category} />
          {definition ? (
            <p className="mt-2 text-sm text-ink-muted">
              {definition.description} {definition.severityGuidance}
            </p>
          ) : null}
        </div>
        {definition?.urgentAdvice ? (
          <Notice tone="warning" title="This type of problem can be dangerous" live>
            {URGENT_HAZARD_ADVICE}
          </Notice>
        ) : null}
        <div>
          <label htmlFor={field("title")} className="label">
            Short title <span aria-hidden>*</span>
          </label>
          <input
            id={field("title")}
            name="title"
            className="input"
            required
            minLength={5}
            maxLength={120}
            placeholder="For example: Burst pipe flooding the road"
            aria-invalid={Boolean(fieldErrors.title)}
            aria-describedby={describedBy("title")}
          />
          <FieldError id={`${field("title")}-error`} message={fieldErrors.title} />
        </div>
        <div>
          <label htmlFor={field("description")} className="label">
            Description <span aria-hidden>*</span>
          </label>
          <textarea
            id={field("description")}
            name="description"
            className="input min-h-32"
            required
            minLength={20}
            maxLength={2000}
            placeholder="Describe what you can see, how big it is and whether it is getting worse."
            aria-invalid={Boolean(fieldErrors.description)}
            aria-describedby={`${field("description")}-hint ${describedBy("description") ?? ""}`.trim()}
          />
          <p id={`${field("description")}-hint`} className="mt-1 text-xs text-ink-muted">
            At least 20 characters. Please do not include other people&apos;s personal details.
          </p>
          <FieldError id={`${field("description")}-error`} message={fieldErrors.description} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor={field("obstructsAccess")} className="label">
              Is a road or walkway blocked?
            </label>
            <select id={field("obstructsAccess")} name="obstructsAccess" className="input" defaultValue="unsure">
              <option value="unsure">Not sure</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </div>
          <div>
            <label htmlFor={field("reportedDuration")} className="label">
              How long has it been like this?
            </label>
            <select id={field("reportedDuration")} name="reportedDuration" className="input" defaultValue="unknown">
              {REPORTED_DURATIONS.map((key) => (
                <option key={key} value={key}>
                  {REPORTED_DURATION_LABELS[key]}
                </option>
              ))}
            </select>
          </div>
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="text-lg font-semibold text-navy-900">2. Where is it?</legend>
        <AddressSearch
          value={address}
          onChange={setAddress}
          onChoose={(choice) => setLocation({ latitude: choice.latitude, longitude: choice.longitude })}
          near={location}
        />
        <p className="text-sm text-ink-muted">
          Then check the marker. Click or tap the map to place it on the problem, or drag it to adjust. <span aria-hidden>*</span>
        </p>
        <LocationPicker value={location} onChange={setLocation} errorId={describedBy("latitude")} />
        <FieldError id={`${field("latitude")}-error`} message={fieldErrors.latitude ?? fieldErrors.longitude} />
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-lg font-semibold text-navy-900">3. Photograph (optional)</legend>
        <label htmlFor={field("photograph")} className="label">
          Add one photograph of the problem
        </label>
        <input
          id={field("photograph")}
          name="photograph"
          type="file"
          accept={ACCEPTED_IMAGE_TYPES}
          className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-navy-900 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white"
          onChange={(event) => setPhotograph(event.target.files?.[0] ?? null)}
          aria-invalid={Boolean(fieldErrors.photograph)}
          aria-describedby={`${field("photograph")}-hint ${describedBy("photograph") ?? ""}`.trim()}
        />
        <p id={`${field("photograph")}-hint`} className="text-xs text-ink-muted">
          JPEG, PNG or WebP. The photograph is resized and its embedded metadata (such as GPS position) is removed. Only
          staff can view it. Avoid photographing people&apos;s faces or vehicle number plates where possible, and never put
          yourself in danger to take a photograph.
        </p>
        <FieldError id={`${field("photograph")}-error`} message={fieldErrors.photograph} />
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="text-lg font-semibold text-navy-900">4. Your details (optional)</legend>
        {openAccess ? (
          <Notice tone="warning" title="Details entered here are not private on this site">
            This demo site lets anyone sign in to the staff workspaces, where contact details and photographs are
            shown. Report anonymously or use made-up details.
          </Notice>
        ) : null}
        <label className="flex items-start gap-2.5 text-sm">
          <input
            type="checkbox"
            name="anonymous"
            className="mt-0.5 size-4"
            checked={anonymous}
            onChange={(event) => setAnonymous(event.target.checked)}
          />
          <span>
            <span className="font-medium text-navy-900">Report anonymously.</span> No contact details will be stored. You
            can still track the report with the reference and access code you receive.
          </span>
        </label>
        {anonymous ? null : (
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label htmlFor={field("reporterName")} className="label">
                Name
              </label>
              <input id={field("reporterName")} name="reporterName" className="input" maxLength={100} autoComplete="name" />
            </div>
            <div>
              <label htmlFor={field("reporterEmail")} className="label">
                Email
              </label>
              <input
                id={field("reporterEmail")}
                name="reporterEmail"
                type="email"
                className="input"
                autoComplete="email"
                aria-invalid={Boolean(fieldErrors.reporterEmail)}
                aria-describedby={describedBy("reporterEmail")}
              />
              <FieldError id={`${field("reporterEmail")}-error`} message={fieldErrors.reporterEmail} />
            </div>
            <div>
              <label htmlFor={field("reporterPhone")} className="label">
                Phone
              </label>
              <input id={field("reporterPhone")} name="reporterPhone" type="tel" className="input" maxLength={30} autoComplete="tel" />
            </div>
          </div>
        )}
        <label className="flex items-start gap-2.5 text-sm">
          <input
            type="checkbox"
            name="consent"
            required
            className="mt-0.5 size-4"
            aria-invalid={Boolean(fieldErrors.consent)}
            aria-describedby={describedBy("consent")}
          />
          <span>
            I have read the{" "}
            <Link href="/privacy" target="_blank" className="font-medium text-teal-700 underline underline-offset-2">
              privacy notice
            </Link>{" "}
            and understand that this report, its location and any photograph will be reviewed by staff, and that Civitas
            is not an emergency service. <span aria-hidden>*</span>
          </span>
        </label>
        <FieldError id={`${field("consent")}-error`} message={fieldErrors.consent} />
      </fieldset>

      {formError ? (
        <div ref={errorSummaryRef} tabIndex={-1} id={`${formId}-summary`}>
          <Notice tone="error" title="The report was not submitted" live>
            {formError}
          </Notice>
        </div>
      ) : null}

      <Button type="submit" variant="accent" size="lg" disabled={submitting} aria-busy={submitting}>
        {submitting ? <Loader2 aria-hidden className="size-5 animate-spin" /> : null}
        {submitting ? "Submitting report" : "Submit report"}
      </Button>
    </form>
  );
}
