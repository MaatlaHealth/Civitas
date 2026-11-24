import type { Metadata } from "next";
import type { ReactNode } from "react";
import { StaffShell } from "@/components/staff/staff-shell";
import { requireCoordinatorSession } from "@/lib/auth/session";

export const metadata: Metadata = { title: { default: "Operations", template: "%s | Civitas operations" } };
export const dynamic = "force-dynamic";

const NAVIGATION = [
  { href: "/dashboard", label: "Overview", exact: true },
  { href: "/dashboard/incidents", label: "Incidents" },
  { href: "/dashboard/map", label: "Map" },
  { href: "/dashboard/duplicates", label: "Duplicates" },
  { href: "/dashboard/crews", label: "Crews" },
  { href: "/dashboard/planning", label: "Planning" },
  { href: "/dashboard/analytics", label: "Analytics" },
  { href: "/dashboard/assets", label: "Assets" },
  { href: "/dashboard/team", label: "Team" },
];

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const session = await requireCoordinatorSession();
  return (
    <StaffShell
      workspace="Coordinator operations"
      homeHref="/dashboard"
      navigation={NAVIGATION}
      userName={session.name}
      isEvaluation={session.isEvaluation}
    >
      {children}
    </StaffShell>
  );
}
