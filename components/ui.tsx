"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, type ReactNode } from "react";

export function AdminHeader({ year, step, actions }: { year: number | null; step: 1 | 2 | 3; actions?: ReactNode }) {
  const steps = ["Set up", "Draw", "Share links"];
  return (
    <>
      <div className="candy-stripe" />
      <header className="bg-evergreen text-cream">
        <div className="mx-auto flex max-w-[1160px] flex-wrap items-end justify-between gap-6 px-4 pb-8 pt-9 sm:px-8">
          <div className="flex flex-col gap-1.5">
            <p className="text-[13px] uppercase tracking-[0.12em] text-gold">{year ?? ""} · Admin</p>
            <h1 className="font-display text-4xl font-bold leading-[1.05] sm:text-[44px]">Family Christmas Draw</h1>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <ol className="flex flex-wrap gap-2 text-sm">
              {steps.map((label, i) => (
                <li
                  key={label}
                  aria-current={i + 1 === step ? "step" : undefined}
                  className={
                    i + 1 === step
                      ? "rounded-full bg-cream px-3.5 py-2 font-semibold text-evergreen"
                      : "rounded-full border border-[#5E8576] px-3.5 py-2 text-[#D7E3DC]"
                  }
                >
                  {i + 1} · {label}
                </li>
              ))}
            </ol>
            {actions}
          </div>
        </div>
      </header>
    </>
  );
}

export function SignOut() {
  const router = useRouter();
  return (
    <button
      type="button"
      className="min-h-11 px-2 text-sm text-sage underline"
      onClick={async () => {
        await fetch("/api/admin/logout", { method: "POST" });
        router.replace("/admin/login");
      }}
    >
      Sign out
    </button>
  );
}

export function Switch({
  label,
  sub,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  sub: string;
  checked: boolean;
  disabled?: boolean;
  onChange?: (v: boolean) => void;
}) {
  const id = useId();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={`${id}-l`}
      aria-describedby={`${id}-d`}
      disabled={disabled}
      onClick={() => onChange?.(!checked)}
      className="flex min-h-14 w-full items-center justify-between gap-4 border-b border-line-soft py-2.5 text-left text-ink disabled:cursor-not-allowed"
    >
      <span className="flex flex-col gap-0.5">
        <span id={`${id}-l`} className="text-[15px] font-medium">{label}</span>
        <span id={`${id}-d`} className="text-[13px] text-muted">{sub}</span>
      </span>
      <span
        className={`flex h-[26px] w-[46px] flex-none items-center rounded-full p-[3px] transition-colors ${
          checked ? "justify-end bg-pine" : "justify-start bg-[#B9B09D]"
        } ${disabled ? "opacity-70" : ""}`}
      >
        <span className="block h-5 w-5 rounded-full bg-white" />
      </span>
    </button>
  );
}

/** Native <dialog> modal. */
export function Modal({ open, onClose, children, label }: { open: boolean; onClose: () => void; children: ReactNode; label: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      aria-label={label}
      onClose={onClose}
      className="m-auto w-[min(92vw,460px)] rounded-[14px] border border-line bg-cream p-6 text-ink shadow-xl"
    >
      {open ? children : null}
    </dialog>
  );
}

export const card = "rounded-[14px] border border-line bg-cream";
export const input =
  "min-h-11 w-full rounded-[10px] border border-field bg-white px-3.5 py-3 text-[15px] text-ink disabled:bg-[#F6F1E6] disabled:text-muted";
export const primaryBtn =
  "min-h-14 rounded-xl bg-cranberry px-5 text-[17px] font-semibold text-white hover:bg-cranberry-dark disabled:cursor-not-allowed disabled:bg-[#B9B09D] disabled:text-white";
export const secondaryBtn =
  "min-h-11 rounded-[10px] border-[1.5px] border-evergreen bg-white px-3.5 text-sm font-medium text-evergreen hover:bg-mint disabled:cursor-not-allowed disabled:opacity-60";

export function formatDate(iso: string | null | undefined, withYear = false) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", ...(withYear ? { year: "numeric" } : {}) });
}
