import clsx from "clsx";
import type { ReactNode } from "react";
import {
  ASSIGNMENT_STATUS_LABELS,
  PRIORITY_LABELS,
  STATUS_LABELS,
  type AssignmentStatus,
  type IncidentStatus,
  type PriorityBand,
} from "@/lib/domain/types";

type Tone = "neutral" | "navy" | "teal" | "amber" | "red" | "green" | "orange";

const TONE_CLASSES: Record<Tone, string> = {
  neutral: "bg-slate-100 text-slate-800 ring-slate-300",
  navy: "bg-navy-50 text-navy-900 ring-navy-200",
  teal: "bg-teal-50 text-teal-800 ring-teal-600/30",
  amber: "bg-amber-50 text-amber-700 ring-amber-600/40",
  orange: "bg-orange-50 text-orange-800 ring-orange-600/40",
  red: "bg-red-50 text-red-800 ring-red-600/30",
  green: "bg-emerald-50 text-emerald-800 ring-emerald-600/30",
};

export function Badge({ tone = "neutral", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap ring-1 ring-inset",
        TONE_CLASSES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

const PRIORITY_TONES: Record<PriorityBand, Tone> = {
  critical: "red",
  high: "orange",
  moderate: "amber",
  low: "teal",
  awaiting_review: "neutral",
};

/** Hex colours for map markers and charts; kept beside the badge tones so they stay consistent. */
export const PRIORITY_COLORS: Record<PriorityBand, string> = {
  critical: "#b91c1c",
  high: "#ea580c",
  moderate: "#d9820a",
  low: "#168f95",
  awaiting_review: "#64748b",
};

export function PriorityBadge({ band, overridden = false, provisional = false }: { band: PriorityBand; overridden?: boolean; provisional?: boolean }) {
  return (
    <Badge tone={PRIORITY_TONES[band]}>
      {PRIORITY_LABELS[band]}
      {overridden ? <span className="font-normal">(manual)</span> : null}
      {provisional && band !== "awaiting_review" ? <span className="font-normal">(provisional)</span> : null}
    </Badge>
  );
}

const STATUS_TONES: Record<IncidentStatus, Tone> = {
  submitted: "neutral",
  awaiting_review: "amber",
  verified: "navy",
  assigned: "teal",
  in_progress: "teal",
  resolved: "green",
  closed: "neutral",
  rejected: "red",
};

export function StatusBadge({ status }: { status: IncidentStatus }) {
  return <Badge tone={STATUS_TONES[status]}>{STATUS_LABELS[status]}</Badge>;
}

const ASSIGNMENT_TONES: Record<AssignmentStatus, Tone> = {
  proposed: "amber",
  assigned: "navy",
  accepted: "teal",
  in_progress: "teal",
  completed: "amber",
  verified: "green",
  declined: "red",
  cancelled: "neutral",
};

export function AssignmentBadge({ status }: { status: AssignmentStatus }) {
  return <Badge tone={ASSIGNMENT_TONES[status]}>{ASSIGNMENT_STATUS_LABELS[status]}</Badge>;
}
