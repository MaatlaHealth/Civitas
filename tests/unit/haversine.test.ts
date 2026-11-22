import { describe, expect, it } from "vitest";
import { boundingBox, formatDistance, haversineMeters, isValidCoordinate } from "@/lib/geo/haversine";
import { METERS_PER_DEGREE, northOf } from "./helpers/geo";

describe("haversineMeters", () => {
  it("is zero for identical points", () => {
    const point = { latitude: -26.2041, longitude: 28.0473 };
    expect(haversineMeters(point, point)).toBe(0);
  });

  it("is symmetric", () => {
    const a = { latitude: -26.2041, longitude: 28.0473 };
    const b = { latitude: -33.9249, longitude: 18.4241 };
    expect(haversineMeters(a, b)).toBeCloseTo(haversineMeters(b, a), 6);
  });

  it("gives R·π/180 for one degree of longitude on the equator", () => {
    const distance = haversineMeters({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 1 });
    expect(distance).toBeCloseTo(111_195.08, 1);
  });

  it("gives R·π/180 for one degree of latitude anywhere", () => {
    const distance = haversineMeters({ latitude: 45, longitude: 10 }, { latitude: 46, longitude: 10 });
    expect(distance).toBeCloseTo(111_195.08, 1);
  });

  it("halves the east-west distance per degree at 60° latitude", () => {
    const distance = haversineMeters({ latitude: 60, longitude: 0 }, { latitude: 60, longitude: 1 });
    // Great-circle distance is marginally shorter than the parallel arc (55 597.5 m).
    expect(distance).toBeGreaterThan(55_590);
    expect(distance).toBeLessThan(55_598);
  });

  it("gives half the circumference between the poles", () => {
    const distance = haversineMeters({ latitude: 90, longitude: 0 }, { latitude: -90, longitude: 0 });
    expect(distance).toBeCloseTo(Math.PI * 6_371_008.8, 3);
  });

  it("handles antipodal points on the equator without NaN", () => {
    const distance = haversineMeters({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 180 });
    expect(distance).toBeCloseTo(Math.PI * 6_371_008.8, 3);
  });

  it("takes the short way across the antimeridian", () => {
    const distance = haversineMeters({ latitude: 0, longitude: 179.5 }, { latitude: 0, longitude: -179.5 });
    expect(distance).toBeCloseTo(111_195.08, 1);
  });

  it("matches the known London–Paris distance (~343.5 km)", () => {
    const london = { latitude: 51.5074, longitude: -0.1278 };
    const paris = { latitude: 48.8566, longitude: 2.3522 };
    const km = haversineMeters(london, paris) / 1000;
    expect(km).toBeGreaterThan(342);
    expect(km).toBeLessThan(345);
  });

  it("matches the known Johannesburg–Cape Town distance (~1 262 km)", () => {
    const johannesburg = { latitude: -26.2041, longitude: 28.0473 };
    const capeTown = { latitude: -33.9249, longitude: 18.4241 };
    const km = haversineMeters(johannesburg, capeTown) / 1000;
    expect(km).toBeGreaterThan(1250);
    expect(km).toBeLessThan(1275);
  });

  it("is accurate at street scale", () => {
    const origin = { latitude: -26.2041, longitude: 28.0473 };
    expect(haversineMeters(origin, northOf(origin, 25))).toBeCloseTo(25, 3);
  });
});

describe("isValidCoordinate", () => {
  it("accepts ordinary and boundary coordinates", () => {
    expect(isValidCoordinate(-26.2, 28.04)).toBe(true);
    expect(isValidCoordinate(0, 0)).toBe(true);
    expect(isValidCoordinate(90, 180)).toBe(true);
    expect(isValidCoordinate(-90, -180)).toBe(true);
  });

  it("rejects out-of-range values", () => {
    expect(isValidCoordinate(90.0001, 0)).toBe(false);
    expect(isValidCoordinate(-90.0001, 0)).toBe(false);
    expect(isValidCoordinate(0, 180.0001)).toBe(false);
    expect(isValidCoordinate(0, -180.0001)).toBe(false);
  });

  it("rejects NaN and infinities", () => {
    expect(isValidCoordinate(Number.NaN, 0)).toBe(false);
    expect(isValidCoordinate(0, Number.NaN)).toBe(false);
    expect(isValidCoordinate(Number.POSITIVE_INFINITY, 0)).toBe(false);
    expect(isValidCoordinate(0, Number.NEGATIVE_INFINITY)).toBe(false);
  });
});

describe("boundingBox", () => {
  it("is symmetric about the centre", () => {
    const center = { latitude: -26.2041, longitude: 28.0473 };
    const box = boundingBox(center, 500);
    expect(center.latitude - box.minLatitude).toBeCloseTo(box.maxLatitude - center.latitude, 12);
    expect(center.longitude - box.minLongitude).toBeCloseTo(box.maxLongitude - center.longitude, 12);
    expect(box.minLatitude).toBeLessThan(box.maxLatitude);
    expect(box.minLongitude).toBeLessThan(box.maxLongitude);
  });

  it("spans about 0.01° each way for a 1.11 km radius on the equator", () => {
    const box = boundingBox({ latitude: 0, longitude: 0 }, 1112);
    expect(box.maxLatitude).toBeCloseTo(0.01, 4);
    expect(box.minLatitude).toBeCloseTo(-0.01, 4);
    expect(box.maxLongitude).toBeCloseTo(0.01, 4);
    expect(box.minLongitude).toBeCloseTo(-0.01, 4);
  });

  it("widens the longitude span by 1/cos(latitude)", () => {
    const equator = boundingBox({ latitude: 0, longitude: 10 }, 1000);
    const sixty = boundingBox({ latitude: 60, longitude: 10 }, 1000);
    const equatorSpan = equator.maxLongitude - equator.minLongitude;
    const sixtySpan = sixty.maxLongitude - sixty.minLongitude;
    // Slightly more than 2: the span is sized for the box edge furthest from
    // the equator, where a degree of longitude is shortest.
    expect(sixtySpan / equatorSpan).toBeGreaterThanOrEqual(2);
    expect(sixtySpan / equatorSpan).toBeCloseTo(2, 2);
    // Latitude span does not depend on latitude.
    expect(sixty.maxLatitude - sixty.minLatitude).toBeCloseTo(equator.maxLatitude - equator.minLatitude, 12);
  });

  it("stays finite at the poles", () => {
    const box = boundingBox({ latitude: 90, longitude: 0 }, 100);
    expect(Number.isFinite(box.minLongitude)).toBe(true);
    expect(Number.isFinite(box.maxLongitude)).toBe(true);
  });

  it("scales linearly with the radius", () => {
    const center = { latitude: -26.2041, longitude: 28.0473 };
    const small = boundingBox(center, 100);
    const large = boundingBox(center, 300);
    expect((large.maxLatitude - center.latitude) / (small.maxLatitude - center.latitude)).toBeCloseTo(3, 9);
    // Longitude is very nearly linear; the edge-latitude correction adds a tiny excess.
    expect((large.maxLongitude - center.longitude) / (small.maxLongitude - center.longitude)).toBeCloseTo(3, 3);
  });

  it("contains points comfortably inside the circle in every cardinal direction", () => {
    const center = { latitude: -26.2041, longitude: 28.0473 };
    const radius = 150;
    const box = boundingBox(center, radius);
    const inner = radius * 0.99;
    const cos = Math.cos((center.latitude * Math.PI) / 180);
    const dLat = inner / METERS_PER_DEGREE;
    const dLng = inner / (METERS_PER_DEGREE * cos);
    expect(center.latitude + dLat).toBeLessThanOrEqual(box.maxLatitude);
    expect(center.latitude - dLat).toBeGreaterThanOrEqual(box.minLatitude);
    expect(center.longitude + dLng).toBeLessThanOrEqual(box.maxLongitude);
    expect(center.longitude - dLng).toBeGreaterThanOrEqual(box.minLongitude);
  });

  it("precondition for the containment bug below: the probe point really is inside the circle", () => {
    const center = { latitude: -26.2041, longitude: 28.0473 };
    const probe = northOf(center, 149.95);
    expect(haversineMeters(center, probe)).toBeLessThan(150);
  });

  // Regression (was a bug in src/lib/geo/haversine.ts:4,45): the doc comment promises a box that
  // "fully contains the circle", but METERS_PER_DEGREE_LATITUDE = 111 320 is
  // larger than the 111 195.08 m/degree implied by EARTH_RADIUS_METERS used in
  // haversineMeters. The box is therefore ~0.11 % too small, and a point
  // 149.95 m due north of the centre (inside a 150 m circle) falls outside it.
  it("fully contains the circle of the given radius (point 149.95 m due north of a 150 m circle)", () => {
    const center = { latitude: -26.2041, longitude: 28.0473 };
    const box = boundingBox(center, 150);
    const probe = northOf(center, 149.95);
    expect(probe.latitude).toBeLessThanOrEqual(box.maxLatitude);
  });
});

describe("formatDistance", () => {
  it("formats sub-kilometre distances as whole metres", () => {
    expect(formatDistance(0)).toBe("0 m");
    expect(formatDistance(12.4)).toBe("12 m");
    expect(formatDistance(12.6)).toBe("13 m");
    expect(formatDistance(999.4)).toBe("999 m");
  });

  it("formats a kilometre or more with one decimal", () => {
    expect(formatDistance(1000)).toBe("1.0 km");
    expect(formatDistance(1549)).toBe("1.5 km");
    expect(formatDistance(12_345)).toBe("12.3 km");
  });

  // Regression (was a bug in src/lib/geo/haversine.ts:57): the < 1000 check is applied before
  // rounding, so 999.5–999.99 m is rendered as "1000 m" instead of "1.0 km".
  it("never renders '1000 m' (999.6 m should read 1.0 km)", () => {
    expect(formatDistance(999.6)).toBe("1.0 km");
  });
});
