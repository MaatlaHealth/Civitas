"use server";

import { AuthError } from "next-auth";
import { signIn, signOut } from "@/lib/auth/auth";
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

export async function logoutAction(): Promise<void> {
  await signOut({ redirectTo: "/login" });
}
