import { describe, expect, it } from "vitest";
import { AppError, CONCURRENT_UPDATE_MESSAGE, isUniqueViolation, type AppErrorCode } from "@/lib/errors";

describe("AppError", () => {
  it.each<[AppErrorCode, number]>([
    ["validation", 400],
    ["unauthenticated", 401],
    ["forbidden", 403],
    ["not_found", 404],
    ["conflict", 409],
    ["payload_too_large", 413],
    ["unsupported_media", 415],
    ["rate_limited", 429],
    ["unavailable", 503],
  ])("maps %s to HTTP %i", (code, status) => {
    expect(new AppError(code, "message").status).toBe(status);
  });

  it("is a real Error with a stable name, code and message", () => {
    const error = new AppError("not_found", "No such incident.");
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(AppError);
    expect(error.name).toBe("AppError");
    expect(error.code).toBe("not_found");
    expect(error.message).toBe("No such incident.");
    expect(typeof error.stack).toBe("string");
  });

  it("carries per-field messages when given, and none otherwise", () => {
    const fieldErrors = { title: "Title is required." };
    expect(new AppError("validation", "Title is required.", fieldErrors).fieldErrors).toEqual(fieldErrors);
    expect(new AppError("validation", "Invalid.").fieldErrors).toBeUndefined();
  });

  it("can be caught and distinguished from unexpected errors", () => {
    const run = (): never => {
      throw new AppError("conflict", CONCURRENT_UPDATE_MESSAGE);
    };
    expect(run).toThrow(AppError);
    expect(run).toThrow(CONCURRENT_UPDATE_MESSAGE);
    expect(new Error("boom")).not.toBeInstanceOf(AppError);
  });
});

describe("isUniqueViolation", () => {
  it("recognises a PostgreSQL unique-violation error", () => {
    expect(isUniqueViolation({ code: "23505" })).toBe(true);
    expect(isUniqueViolation(Object.assign(new Error("duplicate key value"), { code: "23505" }))).toBe(true);
  });

  it("recognises one wrapped in up to three levels of cause (as ORMs do)", () => {
    const database = Object.assign(new Error("duplicate key"), { code: "23505" });
    const once = new Error("query failed", { cause: database });
    const twice = new Error("transaction failed", { cause: once });
    const thrice = new Error("request failed", { cause: twice });
    expect(isUniqueViolation(once)).toBe(true);
    expect(isUniqueViolation(twice)).toBe(true);
    expect(isUniqueViolation(thrice)).toBe(true);
  });

  it("stops looking after four levels", () => {
    let error: Error = Object.assign(new Error("duplicate key"), { code: "23505" });
    for (let depth = 0; depth < 4; depth += 1) error = new Error("wrapper", { cause: error });
    expect(isUniqueViolation(error)).toBe(false);
  });

  it("does not confuse other database errors with a unique violation", () => {
    expect(isUniqueViolation({ code: "23503" })).toBe(false); // foreign-key violation
    expect(isUniqueViolation({ code: "40001" })).toBe(false); // serialization failure
    expect(isUniqueViolation({ code: 23505 })).toBe(false); // numeric, not the SQLSTATE string
    expect(isUniqueViolation(new Error("duplicate key value violates unique constraint"))).toBe(false);
    expect(isUniqueViolation(new AppError("conflict", "Conflict."))).toBe(false);
  });

  it("returns false for non-objects", () => {
    expect(isUniqueViolation(null)).toBe(false);
    expect(isUniqueViolation(undefined)).toBe(false);
    expect(isUniqueViolation("23505")).toBe(false);
    expect(isUniqueViolation(23505)).toBe(false);
  });

  it("terminates on a circular cause chain", () => {
    const a: { cause?: unknown } = {};
    const b: { cause?: unknown } = { cause: a };
    a.cause = b;
    expect(isUniqueViolation(a)).toBe(false);
  });
});
