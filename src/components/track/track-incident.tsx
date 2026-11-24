"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useId, useState, type FormEvent } from "react";
import { StatusBadge } from "@/components/ui/badges";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/layout";
import type { PublicIncidentView } from "@/lib/services/tracking";
import { formatDateTime } from "@/lib/format";

interface ApiError {
  error?: { message?: string };
}

async function postJson(method: "POST" | "PUT", payload: unknown): Promise<{ ok: boolean; body: unknown }> {
  const response = await fetch("/api/track", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  return { ok: response.ok, body };
}

const errorMessage = (body: unknown, fallback: string): string => (body as ApiError | null)?.error?.message ?? fallback;
const NETWORK_ERROR = "The request could not be sent. Check your internet connection and try again.";

export function TrackIncident() {
  const formId = useId();
  const [reference, setReference] = useState("");
  const [accessCode, setAccessCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [incident, setIncident] = useState<PublicIncidentView | null>(null);
  const [additional, setAdditional] = useState("");
  const [additionalState, setAdditionalState] = useState<{ ok: boolean; message: string } | null>(null);
  const [sendingAdditional, setSendingAdditional] = useState(false);

  const lookUp = async (referenceValue: string, codeValue: string) => {
    setLoading(true);
    setError(null);
    try {
      const { ok, body } = await postJson("POST", { reference: referenceValue, accessCode: codeValue });
      if (ok) setIncident(body as PublicIncidentView);
      else {
        setIncident(null);
        setError(errorMessage(body, "The report could not be found."));
      }
    } catch {
      setError(NETWORK_ERROR);
    } finally {
      setLoading(false);
    }
  };

  // A link from the confirmation screen carries the details in the URL
  // fragment, which browsers never send to the server.
  useEffect(() => {
    const parameters = new URLSearchParams(window.location.hash.slice(1));
    const linkedReference = parameters.get("ref");
    const linkedCode = parameters.get("code");
    if (!linkedReference || !linkedCode) return;
    window.history.replaceState(null, "", window.location.pathname);
    const timer = window.setTimeout(() => {
      setReference(linkedReference);
      setAccessCode(linkedCode);
      void lookUp(linkedReference, linkedCode);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    void lookUp(reference, accessCode);
  };

  const sendAdditional = async (event: FormEvent) => {
    event.preventDefault();
    setSendingAdditional(true);
    setAdditionalState(null);
    try {
      const { ok, body } = await postJson("PUT", { reference, accessCode, body: additional });
      if (ok) {
        setAdditional("");
        setAdditionalState({ ok: true, message: "Thank you. Your additional information has been added to the report." });
      } else {
        setAdditionalState({ ok: false, message: errorMessage(body, "The information could not be added.") });
      }
    } catch {
      setAdditionalState({ ok: false, message: NETWORK_ERROR });
    } finally {
      setSendingAdditional(false);
    }
  };

  return (
    <div className="space-y-8">
      <form onSubmit={handleSubmit} className="rounded-lg border border-line bg-white p-5 shadow-xs sm:p-6" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor={`${formId}-reference`} className="label">
              Reference
            </label>
            <input
              id={`${formId}-reference`}
              className="input font-mono uppercase"
              placeholder="CIV-XXXXXXXX"
              autoComplete="off"
              required
              value={reference}
              onChange={(event) => setReference(event.target.value)}
            />
          </div>
          <div>
            <label htmlFor={`${formId}-code`} className="label">
              Access code
            </label>
            <input
              id={`${formId}-code`}
              className="input font-mono uppercase"
              placeholder="XXXX-XXXX-XXXX-XXXX-XXXX"
              autoComplete="off"
              required
              value={accessCode}
              onChange={(event) => setAccessCode(event.target.value)}
            />
          </div>
        </div>
        <Button type="submit" className="mt-4" disabled={loading} aria-busy={loading}>
          {loading ? <Loader2 aria-hidden className="size-4 animate-spin" /> : null}
          View progress
        </Button>
        {error ? (
          <Notice tone="error" live className="mt-4">
            {error}
          </Notice>
        ) : null}
      </form>

      {incident ? (
        <section aria-labelledby={`${formId}-result`} className="rounded-lg border border-line bg-white p-5 shadow-xs sm:p-6" data-testid="tracking-result">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 id={`${formId}-result`} className="font-mono text-xl font-bold">
                {incident.reference}
              </h2>
              <p className="text-sm text-ink-muted">{incident.category}</p>
            </div>
            <span data-testid="tracking-status">
              <StatusBadge status={incident.status} />
            </span>
          </div>
          <p className="mt-4 rounded-md bg-navy-50 px-4 py-3 text-sm text-navy-900" role="status">
            {incident.statusMessage}
          </p>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs font-semibold text-ink-muted">Reported</dt>
              <dd>{formatDateTime(incident.reportedAt)}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold text-ink-muted">Last updated</dt>
              <dd>{formatDateTime(incident.lastUpdatedAt)}</dd>
            </div>
          </dl>

          <h3 className="mt-6 mb-2 text-base font-semibold">Progress</h3>
          <ol className="space-y-0 border-l-2 border-navy-100 pl-5">
            {incident.timeline.map((entry, index) => (
              <li key={`${entry.status}-${index}`} className="relative pb-4 last:pb-0">
                <span aria-hidden className="absolute top-1.5 -left-[27px] size-3 rounded-full border-2 border-white bg-teal-600" />
                <p className="text-sm font-medium text-navy-900">{entry.label}</p>
                <p className="text-xs text-ink-muted">{formatDateTime(entry.at)}</p>
              </li>
            ))}
          </ol>

          <h3 className="mt-6 mb-2 text-base font-semibold">Updates from the coordinator</h3>
          {incident.updates.length === 0 ? (
            <p className="text-sm text-ink-muted">No updates have been published yet.</p>
          ) : (
            <ul className="space-y-3">
              {incident.updates.map((update) => (
                <li key={update.at} className="rounded-md border border-line px-4 py-3">
                  <p className="text-sm whitespace-pre-line">{update.body}</p>
                  <p className="mt-1 text-xs text-ink-muted">{formatDateTime(update.at)}</p>
                </li>
              ))}
            </ul>
          )}

          {incident.status !== "closed" ? (
            <form onSubmit={sendAdditional} className="mt-6 border-t border-line pt-5">
              <label htmlFor={`${formId}-additional`} className="label">
                Add information to this report
              </label>
              <textarea
                id={`${formId}-additional`}
                className="input min-h-24"
                minLength={10}
                maxLength={1000}
                required
                value={additional}
                onChange={(event) => setAdditional(event.target.value)}
                placeholder="For example: the leak has become worse since this morning."
              />
              <Button type="submit" variant="secondary" className="mt-3" disabled={sendingAdditional} aria-busy={sendingAdditional}>
                {sendingAdditional ? <Loader2 aria-hidden className="size-4 animate-spin" /> : null}
                Send additional information
              </Button>
              {additionalState ? (
                <Notice tone={additionalState.ok ? "success" : "error"} live className="mt-3">
                  {additionalState.message}
                </Notice>
              ) : null}
            </form>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
