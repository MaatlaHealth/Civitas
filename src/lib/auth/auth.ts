import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import NextAuth, { CredentialsSignin, type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { getDb } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import type { UserRole } from "@/lib/domain/types";
import { AppError } from "@/lib/errors";
import { createOpenAccessUser, openAccessEnabled, openAccessSchema } from "@/lib/services/open-access";
import { clientAddress, enforceRateLimit, RATE_LIMITS } from "@/lib/services/rate-limit";
import { loginSchema } from "@/lib/validation/schemas";

declare module "next-auth" {
  interface User {
    role: UserRole;
  }
  interface Session {
    user: { id: string; role: UserRole } & DefaultSession["user"];
  }
}

const SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;

/**
 * A fixed bcrypt hash compared against when the email is unknown, so that
 * responses take the same time whether or not an account exists.
 */
const DUMMY_HASH = "$2b$12$CwTycUXWue0Thq9StjUM0uJ8eVQk0S7rVvXKQO9s0zYcG4n0n9m3K";

export class RateLimitedSignin extends CredentialsSignin {
  code = "rate_limited";
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  // Netlify terminates TLS and forwards the host header.
  trustHost: true,
  session: { strategy: "jwt", maxAge: SESSION_MAX_AGE_SECONDS },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(credentials, request) {
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) return null;
        const { email, password } = parsed.data;
        try {
          await enforceRateLimit(RATE_LIMITS.login, `${email}|${clientAddress(request.headers)}`);
        } catch (error) {
          if (error instanceof AppError && error.code === "rate_limited") throw new RateLimitedSignin();
          throw error;
        }
        const db = await getDb();
        const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
        const passwordMatches = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
        if (!user || !user.active || !passwordMatches) return null;
        return { id: user.id, name: user.name, email: user.email, role: user.role };
      },
    }),
    // Name-only sign-in for evaluation deployments. Refused unless explicitly enabled.
    Credentials({
      id: "open-access",
      credentials: { name: {}, role: {}, crewId: {} },
      async authorize(credentials, request) {
        if (!openAccessEnabled()) return null;
        const parsed = openAccessSchema.safeParse(credentials);
        if (!parsed.success) return null;
        try {
          await enforceRateLimit(RATE_LIMITS.openAccess, clientAddress(request.headers));
        } catch (error) {
          if (error instanceof AppError && error.code === "rate_limited") throw new RateLimitedSignin();
          throw error;
        }
        const { name, role, crewId } = parsed.data;
        return createOpenAccessUser({ name, role, crewId: crewId || undefined });
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.sub = user.id;
        token.role = user.role;
      }
      return token;
    },
    session({ session, token }) {
      if (token.sub) session.user.id = token.sub;
      session.user.role = token.role as UserRole;
      return session;
    },
  },
});
