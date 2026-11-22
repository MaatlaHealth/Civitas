import { LogOut } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { logoutAction } from "@/lib/actions/auth";
import { StaffNav, type StaffNavItem } from "./staff-nav";

interface StaffShellProps {
  workspace: string;
  homeHref: string;
  navigation: StaffNavItem[];
  userName: string;
  isEvaluation: boolean;
  children: ReactNode;
}

/** Shared frame for the coordinator dashboard and the crew workspace. */
export function StaffShell({ workspace, homeHref, navigation, userName, isEvaluation, children }: StaffShellProps) {
  return (
    <div className="min-h-screen lg:flex">
      <aside className="bg-navy-950 text-navy-100 lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-60 lg:shrink-0 lg:flex-col">
        <div className="flex items-center justify-between gap-3 px-4 py-3 lg:py-5">
          <Link href={homeHref} className="flex items-center gap-2.5">
            <span className="rounded-md bg-white p-1">
              <Image src="/brand/civitas-mark.png" alt="" width={32} height={32} className="size-8" />
            </span>
            <span>
              <span className="block text-base leading-tight font-bold text-white">Civitas</span>
              <span className="block text-xs text-navy-200">{workspace}</span>
            </span>
          </Link>
        </div>
        <StaffNav items={navigation} />
        <div className="border-t border-navy-800 px-4 py-3 lg:mt-auto">
          <p className="truncate text-sm font-medium text-white">{userName}</p>
          {isEvaluation ? <p className="text-xs text-amber-500">Evaluation account</p> : null}
          <form action={logoutAction} className="mt-2">
            <button type="submit" className="inline-flex items-center gap-1.5 text-sm text-navy-100 underline-offset-4 hover:text-white hover:underline">
              <LogOut aria-hidden className="size-4" /> Sign out
            </button>
          </form>
        </div>
      </aside>
      <main id="main-content" className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        {children}
      </main>
    </div>
  );
}
