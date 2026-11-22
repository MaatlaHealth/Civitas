import { CopyCheck } from "lucide-react";
import Link from "next/link";
import { DuplicateCandidateCard } from "@/components/incident/duplicate-candidate-card";
import { Card, EmptyState, PageHeader } from "@/components/ui/layout";
import { requireCoordinatorSession } from "@/lib/auth/session";
import { listDuplicateCandidates } from "@/lib/services/duplicates";

export const metadata = { title: "Duplicate review" };

const TABS = [
  { key: "pending", label: "Awaiting review" },
  { key: "confirmed", label: "Confirmed" },
  { key: "rejected", label: "Rejected" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

export default async function DuplicatesPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { actor } = await requireCoordinatorSession();
  const requested = (await searchParams).status;
  const active: TabKey = TABS.some((tab) => tab.key === requested) ? (requested as TabKey) : "pending";
  const candidates = await listDuplicateCandidates(actor, active);

  return (
    <>
      <PageHeader
        title="Duplicate review"
        description="Pairs of reports that may describe the same physical problem. Civitas never merges or deletes reports; you confirm or reject each match, and any decision can be reopened."
      />
      <nav aria-label="Duplicate review status" className="mb-4">
        <ul className="flex flex-wrap gap-2">
          {TABS.map((tab) => (
            <li key={tab.key}>
              <Link
                href={`/dashboard/duplicates?status=${tab.key}`}
                aria-current={tab.key === active ? "page" : undefined}
                className={`inline-block rounded-md px-3 py-1.5 text-sm font-semibold ${
                  tab.key === active ? "bg-navy-900 text-white" : "border border-line bg-white text-navy-900 hover:bg-navy-50"
                }`}
              >
                {tab.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      {candidates.length === 0 ? (
        <Card>
          <EmptyState icon={CopyCheck} title={active === "pending" ? "No possible duplicates are waiting for review" : "Nothing here yet"}>
            Candidate pairs are created automatically when a new report is submitted close to an open report of a
            compatible category.
          </EmptyState>
        </Card>
      ) : (
        <div className="space-y-4">
          {candidates.map((candidate) => <DuplicateCandidateCard key={candidate.id} candidate={candidate} />)}
        </div>
      )}
    </>
  );
}
