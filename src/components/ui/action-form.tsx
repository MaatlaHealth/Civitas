"use client";

import { Loader2 } from "lucide-react";
import { createContext, startTransition, useActionState, useContext, useEffect, useRef, type FormEvent, type ReactNode } from "react";
import type { ActionState } from "@/lib/actions/result";
import { Button } from "./button";
import { Notice } from "./layout";

type FormAction = (state: ActionState, formData: FormData) => Promise<ActionState>;

/** Whether the enclosing ActionForm is currently submitting. */
const PendingContext = createContext(false);

interface ActionFormProps {
  action: FormAction;
  children: ReactNode;
  className?: string;
  /** Clear the form's fields after a successful submission. */
  resetOnSuccess?: boolean;
  /** Ask for confirmation before submitting (used for destructive actions). */
  confirmMessage?: string;
}

/**
 * A form bound to a server action. Shows the action's success or error
 * message in a live region and, for validation failures, lists the fields
 * that need attention.
 *
 * The action is dispatched from the submit handler rather than the form's
 * `action` prop, because React clears a form after every action, including
 * a failed one, and people should not have to retype everything to fix one
 * field. Fields are cleared only on success, and only when asked.
 */
export function ActionForm({ action, children, className, resetOnSuccess = false, confirmMessage }: ActionFormProps) {
  const [state, dispatch, pending] = useActionState(action, null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok && resetOnSuccess) formRef.current?.reset();
  }, [state, resetOnSuccess]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    if (confirmMessage && !window.confirm(confirmMessage)) return;
    // Passing the submitter includes the clicked button's own name and value.
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    const formData = new FormData(event.currentTarget, submitter);
    startTransition(() => dispatch(formData));
  };

  return (
    <form ref={formRef} className={className} onSubmit={handleSubmit}>
      <PendingContext.Provider value={pending}>{children}</PendingContext.Provider>
      {state ? (
        <Notice tone={state.ok ? "success" : "error"} live className="mt-3">
          {state.message}
          {state.fieldErrors && Object.keys(state.fieldErrors).length > 1 ? (
            <ul className="mt-1 list-disc pl-5">
              {Object.entries(state.fieldErrors).map(([field, message]) => (
                <li key={field}>{message}</li>
              ))}
            </ul>
          ) : null}
        </Notice>
      ) : null}
    </form>
  );
}

interface SubmitButtonProps {
  children: ReactNode;
  variant?: "primary" | "secondary" | "accent" | "danger" | "ghost";
  size?: "sm" | "md" | "lg";
  className?: string;
  name?: string;
  value?: string;
}

/** Submit button that disables itself and shows progress while its ActionForm is submitting. */
export function SubmitButton({ children, variant, size, className, name, value }: SubmitButtonProps) {
  const pending = useContext(PendingContext);
  return (
    <Button type="submit" variant={variant} size={size} className={className} disabled={pending} aria-busy={pending} name={name} value={value}>
      {pending ? <Loader2 aria-hidden className="size-4 animate-spin" /> : null}
      {children}
    </Button>
  );
}
