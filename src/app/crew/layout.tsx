import type { Metadata } from "next";
import type { ReactNode } from "react";
import { StaffShell } from "@/components/staff/staff-shell";
import { requireCrewSession } from "@/lib/auth/session";

export const metadata: Metadata = { title: { default: "Crew workspace", template: "%s | Civitas crew" } };
export const dynamic = "force-dynamic";

const NAVIGATION = [{ href: "/crew", label: "My assignments" }];

export default async function CrewLayout({ children }: { children: ReactNode }) {
  const session = await requireCrewSession();
  return (
    <StaffShell workspace="Crew workspace" homeHref="/crew" navigation={NAVIGATION} userName={session.name} isEvaluation={session.isEvaluation}>
      {children}
    </StaffShell>
  );
}
