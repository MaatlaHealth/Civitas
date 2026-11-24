import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Badge } from "@/components/ui/badges";
import { Card, CardBody, CardHeader, PageHeader } from "@/components/ui/layout";
import { createAccountAction, resetPasswordAction, setAccountActiveAction } from "@/lib/actions/accounts";
import { requireCoordinatorSession } from "@/lib/auth/session";
import { formatDate } from "@/lib/format";
import { listAccounts } from "@/lib/services/accounts";
import { listCrews } from "@/lib/services/crews";

export const metadata = { title: "Team" };

export default async function TeamPage() {
  const { actor } = await requireCoordinatorSession();
  const [accounts, crews] = await Promise.all([listAccounts(actor), listCrews(actor)]);

  return (
    <>
      <PageHeader
        title="Team"
        description="The people who can sign in. Coordinators see everything; crew members see only the jobs assigned to their crew."
      />

      <Card className="mb-6">
        <div className="relative overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse">
            <caption className="sr-only">Staff accounts</caption>
            <thead>
              <tr>
                <th scope="col" className="table-header">Name</th>
                <th scope="col" className="table-header">Email</th>
                <th scope="col" className="table-header">Role</th>
                <th scope="col" className="table-header">Status</th>
                <th scope="col" className="table-header">Added</th>
                <th scope="col" className="table-header"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((account) => (
                <tr key={account.id}>
                  <td className="table-cell font-medium text-navy-900">
                    {account.name}
                    {account.id === actor.userId ? <span className="font-normal text-ink-muted"> (you)</span> : null}
                  </td>
                  <td className="table-cell text-xs break-all">{account.canSignInWithPassword ? account.email : "No email sign-in"}</td>
                  <td className="table-cell">
                    {account.role === "coordinator" ? "Coordinator" : "Crew member"}
                    {account.crews.length > 0 ? <span className="block text-xs text-ink-muted">{account.crews.join(", ")}</span> : null}
                  </td>
                  <td className="table-cell">
                    <Badge tone={account.active ? "green" : "neutral"}>{account.active ? "Active" : "Deactivated"}</Badge>
                    {account.isDemo ? <Badge tone="amber" className="ml-1">Demo</Badge> : null}
                  </td>
                  <td className="table-cell text-xs whitespace-nowrap">{formatDate(account.createdAt)}</td>
                  <td className="table-cell">
                    <details>
                      <summary className="cursor-pointer text-sm font-medium text-teal-700">Manage</summary>
                      <div className="mt-2 space-y-3">
                        <ActionForm action={resetPasswordAction} resetOnSuccess className="space-y-1.5">
                          <input type="hidden" name="userId" value={account.id} />
                          <label htmlFor={`password-${account.id}`} className="label">New password (12 or more characters)</label>
                          <input id={`password-${account.id}`} name="password" type="password" className="input" minLength={12} autoComplete="new-password" required />
                          <SubmitButton variant="secondary" size="sm">Set password</SubmitButton>
                        </ActionForm>
                        {account.id === actor.userId ? null : (
                          <ActionForm action={setAccountActiveAction}>
                            <input type="hidden" name="userId" value={account.id} />
                            <input type="hidden" name="active" value={account.active ? "false" : "true"} />
                            <SubmitButton variant="ghost" size="sm" className={account.active ? "text-red-800" : undefined}>
                              {account.active ? "Deactivate account" : "Reactivate account"}
                            </SubmitButton>
                          </ActionForm>
                        )}
                      </div>
                    </details>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <CardHeader title="Add a person" description="Choose a password for them and pass it on privately. They sign in with their email address." />
        <CardBody>
          <ActionForm action={createAccountAction} resetOnSuccess className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <label htmlFor="new-name" className="label">Name</label>
                <input id="new-name" name="name" className="input" required minLength={2} maxLength={80} autoComplete="off" />
              </div>
              <div>
                <label htmlFor="new-email" className="label">Email address</label>
                <input id="new-email" name="email" type="email" className="input" required autoComplete="off" />
              </div>
              <div>
                <label htmlFor="new-password" className="label">Password (12 or more characters)</label>
                <input id="new-password" name="password" type="password" className="input" required minLength={12} autoComplete="new-password" />
              </div>
              <div>
                <label htmlFor="new-role" className="label">Role</label>
                <select id="new-role" name="role" className="input" defaultValue="crew">
                  <option value="crew">Crew member</option>
                  <option value="coordinator">Coordinator</option>
                </select>
              </div>
              <div>
                <label htmlFor="new-crew" className="label">Crew (for crew members)</label>
                <select id="new-crew" name="crewId" className="input" defaultValue="">
                  <option value="">No crew yet</option>
                  {crews.map((crew) => <option key={crew.id} value={crew.id}>{crew.name}</option>)}
                </select>
              </div>
            </div>
            <SubmitButton>Add person</SubmitButton>
          </ActionForm>
        </CardBody>
      </Card>
    </>
  );
}
