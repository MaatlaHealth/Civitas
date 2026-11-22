import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Notice } from "@/components/ui/layout";
import { loginAction, openAccessAction } from "@/lib/actions/auth";
import { getStaffSession } from "@/lib/auth/session";
import { listCrewsForOpenAccess, openAccessEnabled } from "@/lib/services/open-access";

export const metadata: Metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

async function OpenAccessForm() {
  const crews = await listCrewsForOpenAccess().catch(() => []);
  return (
    <>
      <p className="mt-2 mb-6 text-sm text-ink-muted">
        This is an evaluation site, so there are no passwords. Enter your name and choose which workspace to open.
      </p>
      <div className="rounded-lg border border-line bg-white p-6 shadow-xs">
        <ActionForm action={openAccessAction} className="space-y-4">
          <div>
            <label htmlFor="name" className="label">
              Your name
            </label>
            <input id="name" name="name" className="input" autoComplete="name" required minLength={2} maxLength={60} />
          </div>
          {crews.length > 0 ? (
            <div>
              <label htmlFor="crewId" className="label">
                Crew to join (only used if you continue as a crew member)
              </label>
              <select id="crewId" name="crewId" className="input">
                {crews.map((crew) => (
                  <option key={crew.id} value={crew.id}>
                    {crew.name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <div className="flex flex-col gap-2">
            <SubmitButton name="role" value="coordinator" className="w-full">
              Continue as coordinator
            </SubmitButton>
            <SubmitButton name="role" value="crew" variant="secondary" className="w-full">
              Continue as crew member
            </SubmitButton>
          </div>
        </ActionForm>
      </div>
      <Notice tone="warning" className="mt-6" title="Anyone can open these workspaces">
        Everything submitted to this site, including contact details and photographs on reports, is visible to anyone
        who signs in here. Use made-up details when you try it out.
      </Notice>
      {crews.length === 0 ? (
        <Notice className="mt-4">
          No crews exist yet. Continue as coordinator first and add one on the Crews page; crew members can then join it
          here.
        </Notice>
      ) : null}
    </>
  );
}

function PasswordForm() {
  return (
    <>
      <p className="mt-2 mb-6 text-sm text-ink-muted">
        For coordinators and maintenance crew members. You do not need an account to report or track an incident.
      </p>
      <div className="rounded-lg border border-line bg-white p-6 shadow-xs">
        <ActionForm action={loginAction} className="space-y-4">
          <div>
            <label htmlFor="email" className="label">
              Email address
            </label>
            <input id="email" name="email" type="email" className="input" autoComplete="username" required />
          </div>
          <div>
            <label htmlFor="password" className="label">
              Password
            </label>
            <input id="password" name="password" type="password" className="input" autoComplete="current-password" required />
          </div>
          <SubmitButton className="w-full">Sign in</SubmitButton>
        </ActionForm>
      </div>
      <Notice className="mt-6">Accounts are created by an administrator. Sessions end after eight hours.</Notice>
    </>
  );
}

export default async function LoginPage() {
  const session = await getStaffSession().catch(() => null);
  if (session) redirect(session.actor.kind === "coordinator" ? "/dashboard" : "/crew");

  return (
    <div className="mx-auto max-w-md px-4 py-12 sm:px-6">
      <h1 className="text-3xl font-bold">Sign in</h1>
      {openAccessEnabled() ? <OpenAccessForm /> : <PasswordForm />}
    </div>
  );
}
