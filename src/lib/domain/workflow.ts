import type { AssignmentStatus, IncidentStatus, UserRole } from "./types";

/**
 * Incident status workflow. A transition not listed here is invalid.
 *
 * Some transitions are side effects of assignment events (for example an
 * incident becomes "assigned" when a coordinator approves a crew) and are
 * marked `automatic`; they cannot be requested directly from the status
 * control.
 */
interface TransitionRule {
  to: IncidentStatus;
  requiresReason: boolean;
  automatic: boolean;
  description: string;
}

const TRANSITIONS: Record<IncidentStatus, readonly TransitionRule[]> = {
  submitted: [
    { to: "awaiting_review", requiresReason: false, automatic: true, description: "Intake processing finished" },
  ],
  awaiting_review: [
    { to: "verified", requiresReason: false, automatic: false, description: "Verify the report" },
    { to: "rejected", requiresReason: true, automatic: false, description: "Reject the report" },
  ],
  verified: [
    { to: "assigned", requiresReason: false, automatic: true, description: "Crew assignment approved" },
    { to: "rejected", requiresReason: true, automatic: false, description: "Reject the report" },
    { to: "awaiting_review", requiresReason: true, automatic: false, description: "Return to review" },
  ],
  assigned: [
    { to: "in_progress", requiresReason: false, automatic: true, description: "Crew started work" },
    { to: "verified", requiresReason: false, automatic: true, description: "Assignment cancelled or declined" },
  ],
  in_progress: [
    { to: "resolved", requiresReason: false, automatic: true, description: "Completion verified by a coordinator" },
    { to: "verified", requiresReason: false, automatic: true, description: "Assignment cancelled" },
  ],
  resolved: [
    { to: "closed", requiresReason: false, automatic: false, description: "Close the incident" },
    { to: "verified", requiresReason: true, automatic: false, description: "Reopen for further work" },
  ],
  closed: [],
  rejected: [
    { to: "awaiting_review", requiresReason: true, automatic: false, description: "Reopen for review" },
  ],
};

export function findTransition(from: IncidentStatus, to: IncidentStatus): TransitionRule | null {
  return TRANSITIONS[from].find((rule) => rule.to === to) ?? null;
}

export function canTransition(from: IncidentStatus, to: IncidentStatus): boolean {
  return findTransition(from, to) !== null;
}

/** Transitions a coordinator may request directly. */
export function manualTransitions(from: IncidentStatus): readonly TransitionRule[] {
  return TRANSITIONS[from].filter((rule) => !rule.automatic);
}

/** Statuses in which an incident still needs operational attention. */
export const ACTIVE_INCIDENT_STATUSES: readonly IncidentStatus[] = [
  "submitted",
  "awaiting_review",
  "verified",
  "assigned",
  "in_progress",
];

/** Statuses whose incidents are compared against new reports for duplicates. */
export const DUPLICATE_COMPARABLE_STATUSES: readonly IncidentStatus[] = ACTIVE_INCIDENT_STATUSES;

/**
 * Assignment workflow. `actor` is the role allowed to make the change.
 */
const ASSIGNMENT_TRANSITIONS: Record<AssignmentStatus, ReadonlyArray<{ to: AssignmentStatus; actor: UserRole }>> = {
  proposed: [
    { to: "assigned", actor: "coordinator" },
    { to: "cancelled", actor: "coordinator" },
  ],
  assigned: [
    { to: "accepted", actor: "crew" },
    { to: "declined", actor: "crew" },
    { to: "cancelled", actor: "coordinator" },
  ],
  accepted: [
    { to: "in_progress", actor: "crew" },
    { to: "cancelled", actor: "coordinator" },
  ],
  in_progress: [
    { to: "completed", actor: "crew" },
    { to: "cancelled", actor: "coordinator" },
  ],
  completed: [
    { to: "verified", actor: "coordinator" },
    { to: "in_progress", actor: "coordinator" },
  ],
  verified: [],
  declined: [],
  cancelled: [],
};

export function canTransitionAssignment(from: AssignmentStatus, to: AssignmentStatus, actor: UserRole): boolean {
  return ASSIGNMENT_TRANSITIONS[from].some((rule) => rule.to === to && rule.actor === actor);
}

export function assignmentTransitionsFor(from: AssignmentStatus, actor: UserRole): AssignmentStatus[] {
  return ASSIGNMENT_TRANSITIONS[from].filter((rule) => rule.actor === actor).map((rule) => rule.to);
}
