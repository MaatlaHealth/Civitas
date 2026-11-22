"use server";

import { AuthError } from "next-auth";
import { signIn, signOut } from "@/lib/auth/auth";
import { openAccessEnabled, openAccessSchema } from "@/lib/services/open-access";
import { formDataToObject, loginSchema } from "@/lib/validation/schemas";
import type { ActionState } from "./result";

export async function loginAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = loginSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Enter your email address and password." };
  }
  try {
    // The dashboard layout sends crew members on to their own workspace.
    await signIn("credentials", { ...parsed.data, redirectTo: "/dashboard" });
  } catch (error) {
    if (error instanceof AuthError) {
      const rateLimited = "code" in error && error.code === "rate_limited";
      return {
        ok: false,
        message: rateLimited
          ? "Too many sign-in attempts. Please wait a few minutes and try again."
          : "The email address or password is incorrect.",
      };
    }
    throw error;
  }
  return { ok: true, message: "Signed in." };
}

/** Name-only sign-in. The provider itself refuses unless open access is enabled on the server. */
export async function openAccessAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  if (!openAccessEnabled()) return { ok: false, message: "Name-only sign-in is not enabled on this deployment." };
  const parsed = openAccessSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Enter your name." };
  try {
    await signIn("open-access", { ...parsed.data, redirectTo: parsed.data.role === "crew" ? "/crew" : "/dashboard" });
  } catch (error) {
    if (error instanceof AuthError) {
      const rateLimited = "code" in error && error.code === "rate_limited";
      return { ok: false, message: rateLimited ? "Too many sign-ins from this connection. Please wait a few minutes." : "Sign-in failed. Please try again." };
    }
    throw error;
  }
  return { ok: true, message: "Signed in." };
}

export async function logoutAction(): Promise<void> {
  await signOut({ redirectTo: "/login" });
}
