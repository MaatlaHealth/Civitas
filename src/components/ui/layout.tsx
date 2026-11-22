import clsx from "clsx";
import { AlertTriangle, CheckCircle2, Info, XCircle, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={clsx("rounded-lg border border-line bg-white shadow-xs", className)}>{children}</section>;
}

export function CardHeader({ title, description, action }: { title: string; description?: ReactNode; action?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
      <div className="min-w-0">
        <h2 className="text-base font-semibold">{title}</h2>
        {description ? <p className="mt-0.5 text-sm text-ink-muted">{description}</p> : null}
      </div>
      {action}
    </header>
  );
}

export function CardBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={clsx("px-4 py-4 sm:px-5", className)}>{children}</div>;
}

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold">{title}</h1>
        {description ? <p className="mt-1 max-w-3xl text-sm text-ink-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </header>
  );
}

export function EmptyState({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center">
      <span className="mb-3 rounded-full bg-navy-50 p-3 text-navy-700">
        <Icon aria-hidden className="size-6" />
      </span>
      <p className="font-semibold text-navy-900">{title}</p>
      {children ? <div className="mt-1 max-w-md text-sm text-ink-muted">{children}</div> : null}
    </div>
  );
}

type NoticeTone = "info" | "warning" | "error" | "success";

const NOTICE_STYLES: Record<NoticeTone, { classes: string; icon: LucideIcon }> = {
  info: { classes: "border-navy-200 bg-navy-50 text-navy-900", icon: Info },
  warning: { classes: "border-amber-600/40 bg-amber-50 text-amber-700", icon: AlertTriangle },
  error: { classes: "border-red-300 bg-red-50 text-red-800", icon: XCircle },
  success: { classes: "border-emerald-300 bg-emerald-50 text-emerald-800", icon: CheckCircle2 },
};

export function Notice({
  tone = "info",
  title,
  children,
  className,
  live = false,
}: {
  tone?: NoticeTone;
  title?: string;
  children: ReactNode;
  className?: string;
  /** Announce to screen readers when the notice appears. */
  live?: boolean;
}) {
  const { classes, icon: Icon } = NOTICE_STYLES[tone];
  return (
    <div
      role={live ? (tone === "error" ? "alert" : "status") : undefined}
      className={clsx("flex gap-3 rounded-md border px-3.5 py-3 text-sm", classes, className)}
    >
      <Icon aria-hidden className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0">
        {title ? <p className="font-semibold">{title}</p> : null}
        <div className={clsx(title && "mt-0.5")}>{children}</div>
      </div>
    </div>
  );
}

export function DefinitionList({ items }: { items: Array<{ term: string; detail: ReactNode }> }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
      {items.map((item) => (
        <div key={item.term} className="min-w-0">
          <dt className="text-xs font-semibold tracking-wide text-ink-muted uppercase">{item.term}</dt>
          <dd className="mt-0.5 text-sm break-words">{item.detail}</dd>
        </div>
      ))}
    </dl>
  );
}
