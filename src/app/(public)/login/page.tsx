import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AccessFrame } from "@/components/site/access-frame";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Notice } from "@/components/ui/layout";
import { loginAction, openAccessAction } from "@/lib/actions/auth";
import { getStaffSession } from "@/lib/auth/session";
import { setupAvailable, setupCodeConfigured } from "@/lib/services/accounts";
import { listCrewsForOpenAccess, openAccessEnabled } from "@/lib/services/open-access";

export const metadata: Metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

async function OpenAccessForm() {
  const crews = await listCrewsForOpenAccess().catch(() => []);
  return (
    <>
      <div className="rounded-lg border border-line bg-white p-6 shadow-xs sm:p-8">
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

async function PasswordForm() {
  const needsSetup = await setupAvailable().catch(() => false);
  return (
    <>
      <div className="rounded-lg border border-line bg-white p-6 shadow-xs sm:p-8">
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
      {needsSetup ? (
        <Notice className="mt-6" title="No accounts exist yet">
          {setupCodeConfigured() ? (
            <>
              <Link href="/setup" className="font-semibold underline underline-offset-2">
                Create the first coordinator account
              </Link>{" "}
              using your setup code.
            </>
          ) : (
            "The site owner needs to set a setup code before the first account can be created."
          )}
        </Notice>
      ) : (
        <p className="mt-4 text-sm text-ink-muted">
          Forgotten your password? Ask a coordinator in your organisation to set a new one from the Team page.
        </p>
      )}
    </>
  );
}

export default async function LoginPage() {
  const session = await getStaffSession().catch(() => null);
  if (session) redirect(session.actor.kind === "coordinator" ? "/dashboard" : "/crew");
  const open = openAccessEnabled();

  return (
    <AccessFrame
      title="Sign in"
      intro={
        open
          ? "This is a demonstration site, so there are no passwords. Enter your name and choose which workspace to open."
          : "For coordinators and maintenance crews."
      }
    >
      {open ? <OpenAccessForm /> : <PasswordForm />}
    </AccessFrame>
  );
}
