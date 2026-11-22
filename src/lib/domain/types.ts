/** Shared domain vocabularies. Database enums are derived from these lists. */

export const INCIDENT_STATUSES = [
  "submitted",
  "awaiting_review",
  "verified",
  "assigned",
  "in_progress",
  "resolved",
  "closed",
  "rejected",
] as const;
export type IncidentStatus = (typeof INCIDENT_STATUSES)[number];

export const STATUS_LABELS: Record<IncidentStatus, string> = {
  submitted: "Submitted",
  awaiting_review: "Awaiting review",
  verified: "Verified",
  assigned: "Assigned",
  in_progress: "In progress",
  resolved: "Resolved",
  closed: "Closed",
  rejected: "Rejected",
};

export const PRIORITY_BANDS = ["critical", "high", "moderate", "low", "awaiting_review"] as const;
export type PriorityBand = (typeof PRIORITY_BANDS)[number];

export const PRIORITY_LABELS: Record<PriorityBand, string> = {
  critical: "Critical",
  high: "High",
  moderate: "Moderate",
  low: "Low",
  awaiting_review: "Awaiting review",
};

export const SEVERITY_LEVELS = ["low", "moderate", "high", "critical"] as const;
export type SeverityLevel = (typeof SEVERITY_LEVELS)[number];

export const EXPOSURE_LEVELS = ["low", "moderate", "high"] as const;
export type ExposureLevel = (typeof EXPOSURE_LEVELS)[number];

export const REPORTED_DURATIONS = ["unknown", "today", "days", "weeks", "longer"] as const;
export type ReportedDuration = (typeof REPORTED_DURATIONS)[number];

export const REPORTED_DURATION_LABELS: Record<ReportedDuration, string> = {
  unknown: "Not sure",
  today: "Started today",
  days: "A few days",
  weeks: "A few weeks",
  longer: "More than a month",
};

export const ASSET_TYPES = [
  "hospital",
  "school",
  "water_pumping_station",
  "substation",
  "bridge",
  "major_intersection",
  "emergency_facility",
] as const;
export type AssetType = (typeof ASSET_TYPES)[number];

export const ASSET_TYPE_LABELS: Record<AssetType, string> = {
  hospital: "Hospital",
  school: "School",
  water_pumping_station: "Water pumping station",
  substation: "Electrical substation",
  bridge: "Bridge",
  major_intersection: "Major road intersection",
  emergency_facility: "Emergency facility",
};

export const ASSET_IMPORTANCE = ["standard", "important", "critical"] as const;
export type AssetImportance = (typeof ASSET_IMPORTANCE)[number];

export const CREW_STATUSES = ["available", "unavailable", "off_shift"] as const;
export type CrewStatus = (typeof CREW_STATUSES)[number];

export const CREW_STATUS_LABELS: Record<CrewStatus, string> = {
  available: "Available",
  unavailable: "Unavailable",
  off_shift: "Off shift",
};

export const ASSIGNMENT_STATUSES = [
  "proposed",
  "assigned",
  "accepted",
  "in_progress",
  "completed",
  "verified",
  "declined",
  "cancelled",
] as const;
export type AssignmentStatus = (typeof ASSIGNMENT_STATUSES)[number];

export const ASSIGNMENT_STATUS_LABELS: Record<AssignmentStatus, string> = {
  proposed: "Proposed (awaiting coordinator approval)",
  assigned: "Assigned (awaiting crew response)",
  accepted: "Accepted by crew",
  in_progress: "Work in progress",
  completed: "Completed (awaiting verification)",
  verified: "Verified complete",
  declined: "Declined by crew",
  cancelled: "Cancelled",
};

/** Assignment states that occupy crew capacity. */
export const ACTIVE_ASSIGNMENT_STATUSES: readonly AssignmentStatus[] = [
  "proposed",
  "assigned",
  "accepted",
  "in_progress",
  "completed",
];

export const USER_ROLES = ["coordinator", "crew"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export interface GeoPoint {
  latitude: number;
  longitude: number;
}
