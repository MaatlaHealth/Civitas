import type { Metadata } from "next";
import Link from "next/link";
import { AccessFrame } from "@/components/site/access-frame";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { buttonClasses } from "@/components/ui/button";
import { Notice } from "@/components/ui/layout";
import { firstAccountAction } from "@/lib/actions/accounts";
import { setupAvailable, setupCodeConfigured } from "@/lib/services/accounts";

export const metadata: Metadata = { title: "Set up Civitas", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function SetupPage() {
  const available = await setupAvailable();
  const codeConfigured = setupCodeConfigured();

  return (
    <AccessFrame
      title="Set up Civitas"
      intro="Create the first coordinator account. After that, coordinators add everyone else from the Team page."
    >
      {!available ? (
        <Notice title="Setup is already complete">
          An account already exists, so this page is closed.{" "}
          <Link href="/login" className="font-semibold underline underline-offset-2">
            Sign in
          </Link>
          , or ask a coordinator to add you.
        </Notice>
      ) : !codeConfigured ? (
        <Notice tone="warning" title="A setup code is needed first">
          To stop a stranger claiming a new site, the first account can only be created by someone who knows a setup
          code. Add an environment variable named <code>CIVITAS_SETUP_CODE</code> with a value of your choice where the
          site is hosted, redeploy, and come back to this page.
        </Notice>
      ) : (
        <div className="rounded-lg border border-line bg-white p-6 shadow-xs sm:p-8">
          <ActionForm action={firstAccountAction} className="space-y-4">
            <div>
              <label htmlFor="setupCode" className="label">
                Setup code
              </label>
              <input id="setupCode" name="setupCode" type="password" className="input" autoComplete="off" required />
            </div>
            <div>
              <label htmlFor="name" className="label">
                Your name
              </label>
              <input id="name" name="name" className="input" autoComplete="name" required minLength={2} maxLength={80} />
            </div>
            <div>
              <label htmlFor="email" className="label">
                Email address
              </label>
              <input id="email" name="email" type="email" className="input" autoComplete="username" required />
            </div>
            <div>
              <label htmlFor="password" className="label">
                Password (12 or more characters)
              </label>
              <input id="password" name="password" type="password" className="input" autoComplete="new-password" required minLength={12} />
            </div>
            <SubmitButton className="w-full">Create coordinator account</SubmitButton>
          </ActionForm>
          <p className="mt-4 text-center text-sm">
            <Link href="/login" className={buttonClasses("ghost", "sm")}>
              Go to sign in
            </Link>
          </p>
        </div>
      )}
    </AccessFrame>
  );
}
