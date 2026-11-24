"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { getActor } from "@/lib/auth/session";
import {
  createAccount,
  createFirstCoordinator,
  firstAccountSchema,
  newAccountSchema,
  passwordResetSchema,
  resetAccountPassword,
  setAccountActive,
} from "@/lib/services/accounts";
import { clientAddress, enforceRateLimit, RATE_LIMITS } from "@/lib/services/rate-limit";
import { formDataToObject, parseOrThrow } from "@/lib/validation/schemas";
import { runAction, type ActionState } from "./result";

/** One-time creation of the first coordinator account. */
export async function firstAccountAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  return runAction("firstAccount", async () => {
    await enforceRateLimit(RATE_LIMITS.login, `setup|${clientAddress(await headers())}`);
    await createFirstCoordinator(parseOrThrow(firstAccountSchema, formDataToObject(formData)));
    return "Your coordinator account is ready. You can sign in now.";
  });
}

export async function createAccountAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  return runAction("createAccount", async () => {
    await createAccount(await getActor(), parseOrThrow(newAccountSchema, formDataToObject(formData)));
    revalidatePath("/dashboard", "layout");
    return "Account created. Give the person their email address and password; they can sign in straight away.";
  });
}

export async function setAccountActiveAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  return runAction("setAccountActive", async () => {
    const { userId, active } = parseOrThrow(z.object({ userId: z.uuid(), active: z.enum(["true", "false"]) }), formDataToObject(formData));
    await setAccountActive(await getActor(), userId, active === "true");
    revalidatePath("/dashboard", "layout");
    return active === "true" ? "Account reactivated." : "Account deactivated. That person can no longer sign in.";
  });
}

export async function resetPasswordAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  return runAction("resetPassword", async () => {
    await resetAccountPassword(await getActor(), parseOrThrow(passwordResetSchema, formDataToObject(formData)));
    revalidatePath("/dashboard", "layout");
    return "Password changed.";
  });
}
