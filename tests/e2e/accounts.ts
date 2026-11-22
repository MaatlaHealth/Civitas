/** Test accounts created by tests/e2e/seed.ts. The password is generated per run. */
export const E2E_ACCOUNTS = {
  coordinator: { email: "coordinator@e2e.civitas.test", name: "E2E Coordinator" },
  crew: { email: "crew@e2e.civitas.test", name: "E2E Crew Member" },
  otherCrew: { email: "other-crew@e2e.civitas.test", name: "E2E Other Crew Member" },
} as const;

export const E2E_CREWS = {
  water: "E2E Water Team",
  electrical: "E2E Electrical Team",
} as const;

export function e2ePassword(): string {
  const password = process.env.CIVITAS_E2E_PASSWORD;
  if (!password) throw new Error("CIVITAS_E2E_PASSWORD is not set; run the tests through `npm run test:e2e`.");
  return password;
}

/** Location used by the journey: a point in central Johannesburg. */
export const E2E_LOCATION = { latitude: -26.2041, longitude: 28.0473 };
