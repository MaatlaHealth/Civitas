import { describe, expect, it } from "vitest";
import { AppError } from "@/lib/errors";
import {
  assetSchema,
  crewSchema,
  formDataToObject,
  parseOrThrow,
  reportSchema,
  trackingLookupSchema,
} from "@/lib/validation/schemas";

const VALID_UUID = "3f2b8c1e-4d5a-4f6b-8a7c-9d0e1f2a3b4c";

function validReport(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    submissionKey: VALID_UUID,
    category: "pothole",
    title: "Deep pothole on Main Road",
    description: "A deep pothole in the left lane outside the library entrance.",
    latitude: "-26.2041",
    longitude: "28.0473",
    consent: "on",
    ...overrides,
  };
}

function without(input: Record<string, unknown>, key: string): Record<string, unknown> {
  const copy = { ...input };
  delete copy[key];
  return copy;
}

/** Runs parseOrThrow and returns the AppError it throws; fails the test if it does not throw one. */
function validationError(run: () => unknown): AppError {
  try {
    run();
  } catch (error) {
    if (error instanceof AppError) return error;
    throw error;
  }
  throw new Error("Expected an AppError to be thrown, but parsing succeeded.");
}

describe("reportSchema", () => {
  it("accepts a minimal valid form submission and applies defaults", () => {
    const report = parseOrThrow(reportSchema, validReport());
    expect(report).toEqual({
      submissionKey: VALID_UUID,
      category: "pothole",
      title: "Deep pothole on Main Road",
      description: "A deep pothole in the left lane outside the library entrance.",
      latitude: -26.2041,
      longitude: 28.0473,
      address: null,
      obstructsAccess: "unsure",
      reportedDuration: "unknown",
      anonymous: false,
      reporterName: null,
      reporterEmail: null,
      reporterPhone: null,
      consent: true,
    });
  });

  it("accepts a fully populated submission", () => {
    const report = parseOrThrow(
      reportSchema,
      validReport({
        address: " 12 Main Road ",
        obstructsAccess: "yes",
        reportedDuration: "weeks",
        anonymous: "true",
        reporterName: "Thandi M",
        reporterEmail: "thandi@example.org",
        reporterPhone: "+27 11 555 0100",
        latitude: -26.2041,
        longitude: 28.0473,
        consent: true,
      }),
    );
    expect(report.address).toBe("12 Main Road");
    expect(report.obstructsAccess).toBe("yes");
    expect(report.reportedDuration).toBe("weeks");
    expect(report.anonymous).toBe(true);
    expect(report.reporterName).toBe("Thandi M");
    expect(report.reporterEmail).toBe("thandi@example.org");
    expect(report.reporterPhone).toBe("+27 11 555 0100");
  });

  describe("missing fields", () => {
    it.each([
      ["title", "Title is required."],
      ["description", "Description is required."],
      ["category", "Choose an incident category."],
      ["latitude", "Select a location on the map."],
      ["longitude", "Select a location on the map."],
      ["submissionKey", "The form session is invalid. Reload the page and try again."],
      ["consent", "You must acknowledge the privacy notice to submit a report."],
    ])("rejects a submission without %s", (field, message) => {
      const error = validationError(() => parseOrThrow(reportSchema, without(validReport(), field)));
      expect(error.code).toBe("validation");
      expect(error.fieldErrors?.[field]).toBe(message);
      expect(Object.keys(error.fieldErrors ?? {})).toEqual([field]);
    });

    it("reports every missing field at once", () => {
      const error = validationError(() => parseOrThrow(reportSchema, {}));
      expect(Object.keys(error.fieldErrors ?? {}).sort()).toEqual(
        ["category", "consent", "description", "latitude", "longitude", "submissionKey", "title"].sort(),
      );
    });

    it("rejects non-object input", () => {
      expect(validationError(() => parseOrThrow(reportSchema, null)).code).toBe("validation");
      expect(validationError(() => parseOrThrow(reportSchema, "pothole")).code).toBe("validation");
    });
  });

  describe("text fields", () => {
    it("enforces minimum and maximum lengths", () => {
      expect(validationError(() => parseOrThrow(reportSchema, validReport({ title: "Hole" }))).fieldErrors?.title).toBe(
        "Title must be at least 5 characters.",
      );
      expect(validationError(() => parseOrThrow(reportSchema, validReport({ title: "x".repeat(121) }))).fieldErrors?.title).toBe(
        "Title must be at most 120 characters.",
      );
      expect(
        validationError(() => parseOrThrow(reportSchema, validReport({ description: "Too short." }))).fieldErrors?.description,
      ).toBe("Description must be at least 20 characters.");
      expect(
        validationError(() => parseOrThrow(reportSchema, validReport({ description: "x".repeat(2001) }))).fieldErrors?.description,
      ).toBe("Description must be at most 2000 characters.");
    });

    it("accepts text exactly at the length limits", () => {
      const report = parseOrThrow(reportSchema, validReport({ title: "x".repeat(120), description: "y".repeat(2000) }));
      expect(report.title).toHaveLength(120);
      expect(report.description).toHaveLength(2000);
      expect(parseOrThrow(reportSchema, validReport({ title: "12345" })).title).toBe("12345");
    });

    it("strips control characters and trims surrounding whitespace", () => {
      const report = parseOrThrow(
        reportSchema,
        validReport({
          title: "  Deep\u0007 pothole\u001F here\u007F \u0000 ",
          address: "\u000B12 Main\u0008 Road\u000C",
          reporterName: "Tha\u0001ndi",
        }),
      );
      expect(report.title).toBe("Deep pothole here");
      expect(report.address).toBe("12 Main Road");
      expect(report.reporterName).toBe("Thandi");
    });

    it("keeps tabs and line breaks inside a description", () => {
      const description = "First line of the report.\nSecond line\twith a tab.\r\nThird line.";
      expect(parseOrThrow(reportSchema, validReport({ description })).description).toBe(description);
    });

    it("measures length after cleaning, so padding cannot satisfy the minimum", () => {
      expect(
        validationError(() => parseOrThrow(reportSchema, validReport({ title: "ab\u0000\u0000\u0000\u0000" }))).fieldErrors?.title,
      ).toBe("Title must be at least 5 characters.");
      expect(validationError(() => parseOrThrow(reportSchema, validReport({ title: "        " }))).fieldErrors?.title).toBe(
        "Title must be at least 5 characters.",
      );
    });

    it("rejects a non-string title", () => {
      expect(validationError(() => parseOrThrow(reportSchema, validReport({ title: 12345 }))).fieldErrors?.title).toBe(
        "Title is required.",
      );
    });

    it("turns blank optional text into null", () => {
      const report = parseOrThrow(reportSchema, validReport({ address: "   ", reporterName: "", reporterPhone: null }));
      expect(report.address).toBeNull();
      expect(report.reporterName).toBeNull();
      expect(report.reporterPhone).toBeNull();
    });

    it("enforces maximum lengths on optional text", () => {
      expect(validationError(() => parseOrThrow(reportSchema, validReport({ address: "x".repeat(201) }))).fieldErrors?.address).toBe(
        "Address must be at most 200 characters.",
      );
      expect(
        validationError(() => parseOrThrow(reportSchema, validReport({ reporterPhone: "1".repeat(31) }))).fieldErrors?.reporterPhone,
      ).toBe("Phone number must be at most 30 characters.");
    });
  });

  describe("coordinates", () => {
    it("coerces numeric strings", () => {
      const report = parseOrThrow(reportSchema, validReport({ latitude: "-33.9249", longitude: "18.4241" }));
      expect(report.latitude).toBe(-33.9249);
      expect(report.longitude).toBe(18.4241);
    });

    it("accepts the extreme valid values", () => {
      const report = parseOrThrow(reportSchema, validReport({ latitude: "-90", longitude: "180" }));
      expect(report.latitude).toBe(-90);
      expect(report.longitude).toBe(180);
    });

    it.each([
      ["latitude", "90.0001", "Latitude must be between -90 and 90."],
      ["latitude", "-91", "Latitude must be between -90 and 90."],
      ["longitude", "180.5", "Longitude must be between -180 and 180."],
      ["longitude", "-181", "Longitude must be between -180 and 180."],
    ])("rejects %s = %s", (field, value, message) => {
      const error = validationError(() => parseOrThrow(reportSchema, validReport({ [field]: value })));
      expect(error.fieldErrors?.[field]).toBe(message);
    });

    it("rejects non-numeric and non-finite coordinates", () => {
      expect(validationError(() => parseOrThrow(reportSchema, validReport({ latitude: "north" }))).fieldErrors?.latitude).toBe(
        "Select a location on the map.",
      );
      expect(validationError(() => parseOrThrow(reportSchema, validReport({ longitude: "Infinity" }))).fieldErrors).toHaveProperty(
        "longitude",
      );
      expect(validationError(() => parseOrThrow(reportSchema, validReport({ latitude: Number.NaN }))).fieldErrors).toHaveProperty(
        "latitude",
      );
    });

    it("rejects the 0,0 placeholder location (no pin placed)", () => {
      const error = validationError(() => parseOrThrow(reportSchema, validReport({ latitude: "0", longitude: "0" })));
      expect(error.fieldErrors).toEqual({ latitude: "Select a location on the map." });
      // Empty form fields coerce to 0 and are caught by the same rule.
      const blank = validationError(() => parseOrThrow(reportSchema, validReport({ latitude: "", longitude: "" })));
      expect(blank.fieldErrors).toEqual({ latitude: "Select a location on the map." });
    });

    it("accepts a location on the equator or the prime meridian that is not 0,0", () => {
      expect(parseOrThrow(reportSchema, validReport({ latitude: "0", longitude: "36.8" })).latitude).toBe(0);
      expect(parseOrThrow(reportSchema, validReport({ latitude: "51.5", longitude: "0" })).longitude).toBe(0);
    });
  });

  describe("consent", () => {
    it.each([["on"], ["true"], [true]])("accepts consent given as %j", (consent) => {
      expect(parseOrThrow(reportSchema, validReport({ consent })).consent).toBe(true);
    });

    it.each([["false"], ["off"], [""], [false], ["yes"], [1], [null]])("rejects consent given as %j", (consent) => {
      const error = validationError(() => parseOrThrow(reportSchema, validReport({ consent })));
      expect(error.fieldErrors).toEqual({ consent: "You must acknowledge the privacy notice to submit a report." });
      expect(error.message).toBe("You must acknowledge the privacy notice to submit a report.");
    });
  });

  describe("enumerations and contact details", () => {
    it("rejects an unknown category", () => {
      expect(validationError(() => parseOrThrow(reportSchema, validReport({ category: "alien_landing" }))).fieldErrors?.category).toBe(
        "Choose an incident category.",
      );
    });

    it("rejects unknown obstruction and duration answers", () => {
      expect(validationError(() => parseOrThrow(reportSchema, validReport({ obstructsAccess: "maybe" }))).fieldErrors).toHaveProperty(
        "obstructsAccess",
      );
      expect(validationError(() => parseOrThrow(reportSchema, validReport({ reportedDuration: "forever" }))).fieldErrors).toHaveProperty(
        "reportedDuration",
      );
    });

    it("rejects a malformed submission key", () => {
      expect(
        validationError(() => parseOrThrow(reportSchema, validReport({ submissionKey: "not-a-uuid" }))).fieldErrors?.submissionKey,
      ).toBe("The form session is invalid. Reload the page and try again.");
    });

    it("treats a blank email as absent and rejects a malformed one", () => {
      expect(parseOrThrow(reportSchema, validReport({ reporterEmail: "" })).reporterEmail).toBeNull();
      expect(
        validationError(() => parseOrThrow(reportSchema, validReport({ reporterEmail: "not-an-email" }))).fieldErrors?.reporterEmail,
      ).toBe("Enter a valid email address.");
    });

    it("reads the anonymous checkbox like a form boolean", () => {
      expect(parseOrThrow(reportSchema, validReport({ anonymous: "on" })).anonymous).toBe(true);
      expect(parseOrThrow(reportSchema, validReport({ anonymous: "false" })).anonymous).toBe(false);
      expect(parseOrThrow(reportSchema, validReport()).anonymous).toBe(false);
    });

    it("drops unknown fields", () => {
      const report = parseOrThrow(reportSchema, validReport({ isAdmin: true, status: "closed" }));
      expect(report).not.toHaveProperty("isAdmin");
      expect(report).not.toHaveProperty("status");
    });
  });
});

describe("trackingLookupSchema", () => {
  const ACCESS_CODE = "ABCDE12345FGHIJ67890";

  it("accepts a well-formed reference and access code", () => {
    expect(parseOrThrow(trackingLookupSchema, { reference: "CIV-1A2B3C4D", accessCode: ACCESS_CODE })).toEqual({
      reference: "CIV-1A2B3C4D",
      accessCode: ACCESS_CODE,
    });
  });

  it("normalises case, surrounding whitespace and grouping separators", () => {
    expect(
      parseOrThrow(trackingLookupSchema, { reference: "  civ-1a2b3c4d ", accessCode: " abcde-12345 fghij-67890 " }),
    ).toEqual({ reference: "CIV-1A2B3C4D", accessCode: ACCESS_CODE });
  });

  it.each([["CIV-1A2B3C4"], ["CIV-1A2B3C4D5"], ["CIV1A2B3C4D"], ["ABC-1A2B3C4D"], ["CIV-1A2B_C4D"], [""]])(
    "rejects the malformed reference %j",
    (reference) => {
      const error = validationError(() => parseOrThrow(trackingLookupSchema, { reference, accessCode: ACCESS_CODE }));
      expect(error.fieldErrors).toEqual({ reference: "Enter the reference in the form CIV-XXXXXXXX." });
    },
  );

  it.each([["ABCDE12345FGHIJ6789"], ["ABCDE12345FGHIJ678901"], ["ABCDE12345FGHIJ6789!"], [""]])(
    "rejects the malformed access code %j",
    (accessCode) => {
      const error = validationError(() => parseOrThrow(trackingLookupSchema, { reference: "CIV-1A2B3C4D", accessCode }));
      expect(error.fieldErrors).toEqual({ accessCode: "Enter the 20-character access code you were given." });
    },
  );

  it("rejects missing fields", () => {
    const error = validationError(() => parseOrThrow(trackingLookupSchema, {}));
    expect(Object.keys(error.fieldErrors ?? {}).sort()).toEqual(["accessCode", "reference"]);
  });
});

describe("crewSchema", () => {
  const validCrew = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
    name: "Road Team A",
    specialization: "road_maintenance",
    status: "available",
    baseLabel: "Central Depot",
    baseLatitude: "-26.2",
    baseLongitude: "28.04",
    capacity: "3",
    ...overrides,
  });

  it("accepts a valid crew and coerces numeric fields", () => {
    expect(parseOrThrow(crewSchema, validCrew())).toEqual({
      name: "Road Team A",
      specialization: "road_maintenance",
      status: "available",
      baseLabel: "Central Depot",
      baseLatitude: -26.2,
      baseLongitude: 28.04,
      capacity: 3,
      shiftNotes: null,
    });
  });

  it("keeps shift notes when given", () => {
    expect(parseOrThrow(crewSchema, validCrew({ shiftNotes: " Weekdays 07:00–16:00 " })).shiftNotes).toBe("Weekdays 07:00–16:00");
  });

  it.each([["name"], ["specialization"], ["status"], ["baseLabel"], ["baseLatitude"], ["baseLongitude"], ["capacity"]])(
    "rejects a crew without %s",
    (field) => {
      const error = validationError(() => parseOrThrow(crewSchema, without(validCrew(), field)));
      expect(Object.keys(error.fieldErrors ?? {})).toEqual([field]);
    },
  );

  it("enforces the capacity range and integrality", () => {
    expect(validationError(() => parseOrThrow(crewSchema, validCrew({ capacity: "0" }))).fieldErrors?.capacity).toBe(
      "Capacity must be at least 1.",
    );
    expect(validationError(() => parseOrThrow(crewSchema, validCrew({ capacity: "21" }))).fieldErrors?.capacity).toBe(
      "Capacity must be at most 20.",
    );
    expect(validationError(() => parseOrThrow(crewSchema, validCrew({ capacity: "2.5" }))).fieldErrors).toHaveProperty("capacity");
    expect(validationError(() => parseOrThrow(crewSchema, validCrew({ capacity: "many" }))).fieldErrors).toHaveProperty("capacity");
    expect(parseOrThrow(crewSchema, validCrew({ capacity: 1 })).capacity).toBe(1);
    expect(parseOrThrow(crewSchema, validCrew({ capacity: 20 })).capacity).toBe(20);
  });

  it("rejects unknown specialisations and statuses", () => {
    expect(validationError(() => parseOrThrow(crewSchema, validCrew({ specialization: "plumbing" }))).fieldErrors).toHaveProperty(
      "specialization",
    );
    expect(validationError(() => parseOrThrow(crewSchema, validCrew({ status: "on_holiday" }))).fieldErrors).toHaveProperty("status");
  });

  it("rejects an invalid base location and a too-short name", () => {
    expect(validationError(() => parseOrThrow(crewSchema, validCrew({ baseLatitude: "95" }))).fieldErrors?.baseLatitude).toBe(
      "Latitude must be between -90 and 90.",
    );
    expect(validationError(() => parseOrThrow(crewSchema, validCrew({ baseLongitude: "-200" }))).fieldErrors?.baseLongitude).toBe(
      "Longitude must be between -180 and 180.",
    );
    expect(validationError(() => parseOrThrow(crewSchema, validCrew({ name: "A" }))).fieldErrors?.name).toBe(
      "Crew name must be at least 2 characters.",
    );
  });
});

describe("assetSchema", () => {
  const validAsset = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
    name: "Central Hospital",
    assetType: "hospital",
    latitude: "-26.19",
    longitude: "28.03",
    importance: "critical",
    source: "Provincial health facility list",
    ...overrides,
  });

  it("accepts a valid asset; an unticked 'verified' box means unverified", () => {
    expect(parseOrThrow(assetSchema, validAsset())).toEqual({
      name: "Central Hospital",
      assetType: "hospital",
      latitude: -26.19,
      longitude: 28.03,
      importance: "critical",
      source: "Provincial health facility list",
      verified: false,
      notes: null,
    });
  });

  it("reads the verified checkbox", () => {
    expect(parseOrThrow(assetSchema, validAsset({ verified: "on" })).verified).toBe(true);
    expect(parseOrThrow(assetSchema, validAsset({ verified: "true" })).verified).toBe(true);
    expect(parseOrThrow(assetSchema, validAsset({ verified: "false" })).verified).toBe(false);
  });

  it.each([["name"], ["assetType"], ["latitude"], ["longitude"], ["importance"], ["source"]])(
    "rejects an asset without %s",
    (field) => {
      const error = validationError(() => parseOrThrow(assetSchema, without(validAsset(), field)));
      expect(Object.keys(error.fieldErrors ?? {})).toEqual([field]);
    },
  );

  it("requires a source so the registry entry can be traced", () => {
    expect(validationError(() => parseOrThrow(assetSchema, validAsset({ source: "  " }))).fieldErrors?.source).toBe(
      "Source must be at least 3 characters.",
    );
  });

  it("rejects unknown asset types and importance levels, and out-of-range coordinates", () => {
    expect(validationError(() => parseOrThrow(assetSchema, validAsset({ assetType: "airport" }))).fieldErrors).toHaveProperty("assetType");
    expect(validationError(() => parseOrThrow(assetSchema, validAsset({ importance: "vital" }))).fieldErrors).toHaveProperty("importance");
    expect(validationError(() => parseOrThrow(assetSchema, validAsset({ latitude: "-90.5" }))).fieldErrors).toHaveProperty("latitude");
  });

  it("strips control characters from the name and notes", () => {
    const asset = parseOrThrow(assetSchema, validAsset({ name: "Central\u0000 Hospital", notes: "Main\u0002 gate on 3rd Ave" }));
    expect(asset.name).toBe("Central Hospital");
    expect(asset.notes).toBe("Main gate on 3rd Ave");
  });
});

describe("parseOrThrow", () => {
  it("returns the parsed (transformed) data on success", () => {
    expect(parseOrThrow(trackingLookupSchema, { reference: "civ-00000000", accessCode: "a".repeat(20) })).toEqual({
      reference: "CIV-00000000",
      accessCode: "A".repeat(20),
    });
  });

  it("throws an AppError with code 'validation' and HTTP status 400", () => {
    const error = validationError(() => parseOrThrow(reportSchema, validReport({ title: "" })));
    expect(error).toBeInstanceOf(AppError);
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("AppError");
    expect(error.code).toBe("validation");
    expect(error.status).toBe(400);
  });

  it("collects one message per invalid field and uses the first as the error message", () => {
    const error = validationError(() =>
      parseOrThrow(reportSchema, validReport({ title: "abc", description: "short", latitude: "200" })),
    );
    expect(error.fieldErrors).toEqual({
      title: "Title must be at least 5 characters.",
      description: "Description must be at least 20 characters.",
      latitude: "Latitude must be between -90 and 90.",
    });
    expect(error.message).toBe("Title must be at least 5 characters.");
  });

  it("files root-level problems under 'form'", () => {
    const error = validationError(() => parseOrThrow(reportSchema, undefined));
    expect(Object.keys(error.fieldErrors ?? {})).toEqual(["form"]);
    expect(error.message).toBe(error.fieldErrors?.form);
  });
});

describe("formDataToObject", () => {
  it("copies string entries and skips files", () => {
    const formData = new FormData();
    formData.set("title", "Deep pothole");
    formData.set("consent", "on");
    formData.set("photo", new Blob(["x"], { type: "image/png" }), "photo.png");
    expect(formDataToObject(formData)).toEqual({ title: "Deep pothole", consent: "on" });
  });

  it("round-trips a real form submission through reportSchema", () => {
    const formData = new FormData();
    for (const [key, value] of Object.entries(validReport())) formData.set(key, String(value));
    const report = parseOrThrow(reportSchema, formDataToObject(formData));
    expect(report.latitude).toBe(-26.2041);
    expect(report.consent).toBe(true);
  });
});
