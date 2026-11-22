import { describe, expect, it } from "vitest";
import {
  requireCoordinator,
  requireCrew,
  requireCrewMembership,
  type CoordinatorActor,
  type CrewActor,
} from "@/lib/auth/actor";
import { AppError, type AppErrorCode } from "@/lib/errors";

const coordinator: CoordinatorActor = { kind: "coordinator", userId: "user-1", organizationId: "org-1" };
const crewMember: CrewActor = { kind: "crew", userId: "user-2", organizationId: "org-1", crewIds: ["crew-a", "crew-b"] };

function thrownBy(run: () => unknown): AppError {
  try {
    run();
  } catch (error) {
    if (error instanceof AppError) return error;
    throw error;
  }
  throw new Error("Expected an AppError to be thrown.");
}

function expectDenied(run: () => unknown, code: AppErrorCode, status: number): AppError {
  const error = thrownBy(run);
  expect(error.code).toBe(code);
  expect(error.status).toBe(status);
  return error;
}

describe("requireCoordinator", () => {
  it("returns the actor for a coordinator", () => {
    expect(requireCoordinator(coordinator)).toBe(coordinator);
  });

  it("rejects an anonymous caller as unauthenticated (401)", () => {
    expectDenied(() => requireCoordinator(null), "unauthenticated", 401);
    expectDenied(() => requireCoordinator(undefined), "unauthenticated", 401);
  });

  it("rejects a crew member as forbidden (403)", () => {
    const error = expectDenied(() => requireCoordinator(crewMember), "forbidden", 403);
    expect(error.message).toBe("Only coordinators can perform this action.");
  });
});

describe("requireCrew", () => {
  it("returns the actor for a crew member", () => {
    expect(requireCrew(crewMember)).toBe(crewMember);
  });

  it("rejects an anonymous caller as unauthenticated (401)", () => {
    expectDenied(() => requireCrew(null), "unauthenticated", 401);
    expectDenied(() => requireCrew(undefined), "unauthenticated", 401);
  });

  it("rejects a coordinator as forbidden (403): coordinators do not act as crews", () => {
    const error = expectDenied(() => requireCrew(coordinator), "forbidden", 403);
    expect(error.message).toBe("Only crew members can perform this action.");
  });
});

describe("requireCrewMembership", () => {
  it("allows a member of the crew", () => {
    expect(() => requireCrewMembership(crewMember, "crew-a")).not.toThrow();
    expect(() => requireCrewMembership(crewMember, "crew-b")).not.toThrow();
  });

  it("forbids a crew the user does not belong to (403)", () => {
    const error = expectDenied(() => requireCrewMembership(crewMember, "crew-z"), "forbidden", 403);
    expect(error.message).toMatch(/not a member/);
  });

  it("forbids everything for a user with no crews", () => {
    const unattached: CrewActor = { ...crewMember, crewIds: [] };
    expectDenied(() => requireCrewMembership(unattached, "crew-a"), "forbidden", 403);
  });

  it("matches crew ids exactly (no prefix, case or whitespace leniency)", () => {
    expectDenied(() => requireCrewMembership(crewMember, "crew"), "forbidden", 403);
    expectDenied(() => requireCrewMembership(crewMember, "CREW-A"), "forbidden", 403);
    expectDenied(() => requireCrewMembership(crewMember, "crew-a "), "forbidden", 403);
    expectDenied(() => requireCrewMembership(crewMember, ""), "forbidden", 403);
  });
});
