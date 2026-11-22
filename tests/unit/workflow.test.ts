import { describe, expect, it } from "vitest";
import {
  ASSIGNMENT_STATUSES,
  INCIDENT_STATUSES,
  USER_ROLES,
  type AssignmentStatus,
  type IncidentStatus,
  type UserRole,
} from "@/lib/domain/types";
import {
  ACTIVE_INCIDENT_STATUSES,
  assignmentTransitionsFor,
  canTransition,
  canTransitionAssignment,
  findTransition,
  manualTransitions,
} from "@/lib/domain/workflow";

/** The intended incident workflow, written out by hand: from → [to, manual?, requiresReason?]. */
const EXPECTED_INCIDENT: Record<IncidentStatus, ReadonlyArray<readonly [IncidentStatus, "manual" | "automatic", "reason" | "no-reason"]>> = {
  submitted: [["awaiting_review", "automatic", "no-reason"]],
  awaiting_review: [
    ["verified", "manual", "no-reason"],
    ["rejected", "manual", "reason"],
  ],
  verified: [
    ["assigned", "automatic", "no-reason"],
    ["rejected", "manual", "reason"],
    ["awaiting_review", "manual", "reason"],
  ],
  assigned: [
    ["in_progress", "automatic", "no-reason"],
    ["verified", "automatic", "no-reason"],
  ],
  in_progress: [
    ["resolved", "automatic", "no-reason"],
    ["verified", "automatic", "no-reason"],
  ],
  resolved: [
    ["closed", "manual", "no-reason"],
    ["verified", "manual", "reason"],
  ],
  closed: [],
  rejected: [["awaiting_review", "manual", "reason"]],
};

/** The intended assignment workflow: from → [to, role allowed to make the change]. */
const EXPECTED_ASSIGNMENT: Record<AssignmentStatus, ReadonlyArray<readonly [AssignmentStatus, UserRole]>> = {
  proposed: [
    ["assigned", "coordinator"],
    ["cancelled", "coordinator"],
  ],
  assigned: [
    ["accepted", "crew"],
    ["declined", "crew"],
    ["cancelled", "coordinator"],
  ],
  accepted: [
    ["in_progress", "crew"],
    ["cancelled", "coordinator"],
  ],
  in_progress: [
    ["completed", "crew"],
    ["cancelled", "coordinator"],
  ],
  completed: [
    ["verified", "coordinator"],
    ["in_progress", "coordinator"],
  ],
  verified: [],
  declined: [],
  cancelled: [],
};

describe("incident workflow", () => {
  it("allows exactly the documented transitions across all 64 status pairs", () => {
    for (const from of INCIDENT_STATUSES) {
      for (const to of INCIDENT_STATUSES) {
        const expected = EXPECTED_INCIDENT[from].some(([target]) => target === to);
        expect(canTransition(from, to), `${from} → ${to}`).toBe(expected);
      }
    }
  });

  it("allows the happy path from submission to closure", () => {
    const path: IncidentStatus[] = ["submitted", "awaiting_review", "verified", "assigned", "in_progress", "resolved", "closed"];
    for (let index = 0; index < path.length - 1; index += 1) {
      const from = path[index];
      const to = path[index + 1];
      if (!from || !to) throw new Error("path is malformed");
      expect(canTransition(from, to), `${from} → ${to}`).toBe(true);
    }
  });

  it("rejects skipping steps", () => {
    expect(canTransition("submitted", "verified")).toBe(false);
    expect(canTransition("submitted", "assigned")).toBe(false);
    expect(canTransition("awaiting_review", "assigned")).toBe(false);
    expect(canTransition("awaiting_review", "in_progress")).toBe(false);
    expect(canTransition("verified", "in_progress")).toBe(false);
    expect(canTransition("verified", "resolved")).toBe(false);
    expect(canTransition("assigned", "resolved")).toBe(false);
    expect(canTransition("in_progress", "closed")).toBe(false);
    expect(canTransition("awaiting_review", "closed")).toBe(false);
  });

  it("rejects moving backwards except through the documented reopen paths", () => {
    expect(canTransition("verified", "submitted")).toBe(false);
    expect(canTransition("in_progress", "assigned")).toBe(false);
    expect(canTransition("resolved", "in_progress")).toBe(false);
    expect(canTransition("resolved", "verified")).toBe(true);
    expect(canTransition("rejected", "awaiting_review")).toBe(true);
    expect(canTransition("rejected", "verified")).toBe(false);
  });

  it("treats closed as terminal", () => {
    for (const to of INCIDENT_STATUSES) expect(canTransition("closed", to)).toBe(false);
    expect(manualTransitions("closed")).toEqual([]);
  });

  it("never allows a transition to the same status", () => {
    for (const status of INCIDENT_STATUSES) expect(canTransition(status, status)).toBe(false);
  });

  it("only rejects incidents that have not yet been assigned", () => {
    const rejectable = INCIDENT_STATUSES.filter((from) => canTransition(from, "rejected"));
    expect(rejectable).toEqual(["awaiting_review", "verified"]);
  });

  it("can never return to submitted", () => {
    for (const from of INCIDENT_STATUSES) expect(canTransition(from, "submitted")).toBe(false);
  });

  describe("findTransition", () => {
    it("returns the rule with its flags for a valid transition", () => {
      for (const from of INCIDENT_STATUSES) {
        for (const [to, mode, reason] of EXPECTED_INCIDENT[from]) {
          const rule = findTransition(from, to);
          expect(rule, `${from} → ${to}`).not.toBeNull();
          expect(rule?.to).toBe(to);
          expect(rule?.automatic, `${from} → ${to} automatic`).toBe(mode === "automatic");
          expect(rule?.requiresReason, `${from} → ${to} requiresReason`).toBe(reason === "reason");
          expect(rule?.description.length ?? 0).toBeGreaterThan(0);
        }
      }
    });

    it("returns null for an invalid transition", () => {
      expect(findTransition("submitted", "closed")).toBeNull();
      expect(findTransition("closed", "verified")).toBeNull();
      expect(findTransition("verified", "verified")).toBeNull();
    });

    it("requires a reason for every rejection and every reopening", () => {
      expect(findTransition("awaiting_review", "rejected")?.requiresReason).toBe(true);
      expect(findTransition("verified", "rejected")?.requiresReason).toBe(true);
      expect(findTransition("verified", "awaiting_review")?.requiresReason).toBe(true);
      expect(findTransition("resolved", "verified")?.requiresReason).toBe(true);
      expect(findTransition("rejected", "awaiting_review")?.requiresReason).toBe(true);
    });
  });

  describe("manualTransitions", () => {
    it("lists only the transitions a coordinator may request directly", () => {
      for (const from of INCIDENT_STATUSES) {
        const expected = EXPECTED_INCIDENT[from].filter(([, mode]) => mode === "manual").map(([to]) => to);
        expect(manualTransitions(from).map((rule) => rule.to), from).toEqual(expected);
      }
    });

    it("offers nothing manual while a crew holds the incident or before intake has finished", () => {
      expect(manualTransitions("submitted")).toEqual([]);
      expect(manualTransitions("assigned")).toEqual([]);
      expect(manualTransitions("in_progress")).toEqual([]);
    });

    it("does not let a coordinator set 'assigned', 'in_progress' or 'resolved' by hand from anywhere", () => {
      for (const from of INCIDENT_STATUSES) {
        const targets = manualTransitions(from).map((rule) => rule.to);
        expect(targets).not.toContain("assigned");
        expect(targets).not.toContain("in_progress");
        expect(targets).not.toContain("resolved");
      }
    });
  });

  it("treats exactly the pre-resolution statuses as active", () => {
    expect([...ACTIVE_INCIDENT_STATUSES]).toEqual(["submitted", "awaiting_review", "verified", "assigned", "in_progress"]);
  });
});

describe("assignment workflow", () => {
  it("allows exactly the documented transitions for each role across all status pairs", () => {
    for (const from of ASSIGNMENT_STATUSES) {
      for (const to of ASSIGNMENT_STATUSES) {
        for (const actor of USER_ROLES) {
          const expected = EXPECTED_ASSIGNMENT[from].some(([target, role]) => target === to && role === actor);
          expect(canTransitionAssignment(from, to, actor), `${from} → ${to} by ${actor}`).toBe(expected);
        }
      }
    }
  });

  it("lets only a coordinator approve or cancel a proposal", () => {
    expect(canTransitionAssignment("proposed", "assigned", "coordinator")).toBe(true);
    expect(canTransitionAssignment("proposed", "assigned", "crew")).toBe(false);
    expect(canTransitionAssignment("proposed", "cancelled", "crew")).toBe(false);
    expect(canTransitionAssignment("proposed", "accepted", "crew")).toBe(false);
  });

  it("lets only the crew accept, decline, start and complete work", () => {
    expect(canTransitionAssignment("assigned", "accepted", "crew")).toBe(true);
    expect(canTransitionAssignment("assigned", "declined", "crew")).toBe(true);
    expect(canTransitionAssignment("accepted", "in_progress", "crew")).toBe(true);
    expect(canTransitionAssignment("in_progress", "completed", "crew")).toBe(true);
    expect(canTransitionAssignment("assigned", "accepted", "coordinator")).toBe(false);
    expect(canTransitionAssignment("assigned", "declined", "coordinator")).toBe(false);
    expect(canTransitionAssignment("accepted", "in_progress", "coordinator")).toBe(false);
    expect(canTransitionAssignment("in_progress", "completed", "coordinator")).toBe(false);
  });

  it("does not let a crew verify its own completed work", () => {
    expect(canTransitionAssignment("completed", "verified", "crew")).toBe(false);
    expect(canTransitionAssignment("completed", "verified", "coordinator")).toBe(true);
    expect(canTransitionAssignment("completed", "in_progress", "coordinator")).toBe(true);
    expect(canTransitionAssignment("completed", "in_progress", "crew")).toBe(false);
  });

  it("does not let a crew skip acceptance or cancel", () => {
    expect(canTransitionAssignment("assigned", "in_progress", "crew")).toBe(false);
    expect(canTransitionAssignment("assigned", "completed", "crew")).toBe(false);
    expect(canTransitionAssignment("accepted", "completed", "crew")).toBe(false);
    expect(canTransitionAssignment("accepted", "cancelled", "crew")).toBe(false);
    expect(canTransitionAssignment("in_progress", "cancelled", "crew")).toBe(false);
    expect(canTransitionAssignment("accepted", "declined", "crew")).toBe(false);
  });

  it("treats verified, declined and cancelled as terminal for both roles", () => {
    const terminal: AssignmentStatus[] = ["verified", "declined", "cancelled"];
    for (const from of terminal) {
      for (const actor of USER_ROLES) {
        expect(assignmentTransitionsFor(from, actor)).toEqual([]);
        for (const to of ASSIGNMENT_STATUSES) expect(canTransitionAssignment(from, to, actor)).toBe(false);
      }
    }
  });

  it("cannot cancel completed work", () => {
    expect(canTransitionAssignment("completed", "cancelled", "coordinator")).toBe(false);
  });

  describe("assignmentTransitionsFor", () => {
    it("lists the options for each role and status", () => {
      for (const from of ASSIGNMENT_STATUSES) {
        for (const actor of USER_ROLES) {
          const expected = EXPECTED_ASSIGNMENT[from].filter(([, role]) => role === actor).map(([to]) => to);
          expect(assignmentTransitionsFor(from, actor), `${from} by ${actor}`).toEqual(expected);
        }
      }
    });

    it("gives concrete examples", () => {
      expect(assignmentTransitionsFor("assigned", "crew")).toEqual(["accepted", "declined"]);
      expect(assignmentTransitionsFor("assigned", "coordinator")).toEqual(["cancelled"]);
      expect(assignmentTransitionsFor("proposed", "crew")).toEqual([]);
      expect(assignmentTransitionsFor("completed", "coordinator")).toEqual(["verified", "in_progress"]);
    });
  });
});
