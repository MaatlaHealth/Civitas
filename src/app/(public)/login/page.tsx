import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Notice } from "@/components/ui/layout";
import { loginAction } from "@/lib/actions/auth";
import { getStaffSession } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Staff sign in" };
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const session = await getStaffSession().catch(() => null);
  if (session) redirect(session.actor.kind === "coordinator" ? "/dashboard" : "/crew");

  return (
    <div className="mx-auto max-w-md px-4 py-12 sm:px-6">
      <h1 className="text-3xl font-bold">Staff sign in</h1>
      <p className="mt-2 mb-6 text-sm text-ink-muted">
        For municipal coordinators and maintenance crew members. Citizens do not need an account to report or track an
        incident.
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
      <Notice className="mt-6">
        Staff accounts are created by an administrator. Sessions expire after eight hours. If you are evaluating
        Civitas, use the evaluation account details supplied with the submission.
      </Notice>
    </div>
  );
}
