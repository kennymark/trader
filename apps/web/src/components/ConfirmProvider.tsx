import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

export type ConfirmRequest = {
  /** What is about to happen, as a short noun phrase. */
  title: string;
  /** What will be lost, named specifically. Say the consequence, not "are you sure". */
  body: React.ReactNode;
  /** The verb on the button that does it, e.g. "Remove NVDA". */
  confirmLabel: string;
  cancelLabel?: string;
  /** Irreversible actions get the danger treatment; a reversible reset does not. */
  tone?: "danger" | "neutral";
};

type Pending = ConfirmRequest & { resolve: (ok: boolean) => void };

const ConfirmContext = createContext<((req: ConfirmRequest) => Promise<boolean>) | null>(null);

/**
 * One dialog for the whole app, reached as `await confirm({...})`. Call sites
 * read as a guard clause rather than a state machine, which is what keeps the
 * check on every destructive path instead of the ones someone remembered.
 */
export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used inside ConfirmProvider");
  return ctx;
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  const confirm = useCallback(
    (req: ConfirmRequest) =>
      new Promise<boolean>((resolve) => setPending({ ...req, resolve })),
    [],
  );

  const settle = useCallback((ok: boolean) => {
    setPending((current) => {
      current?.resolve(ok);
      return null;
    });
  }, []);

  // Escape cancels, and the cancel button takes focus, so the safe outcome is
  // the one a stray keypress produces.
  useEffect(() => {
    if (!pending) return;
    cancelRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") settle(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [pending, settle]);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {pending ? (
        <div className="confirm-root" role="presentation">
          <button
            type="button"
            className="confirm-backdrop"
            aria-label="Cancel"
            onClick={() => settle(false)}
          />
          <div className="confirm-panel" role="alertdialog" aria-modal="true">
            <h2 className="confirm-title">{pending.title}</h2>
            <div className="confirm-body">{pending.body}</div>
            <div className="confirm-actions">
              <button
                type="button"
                className="btn"
                ref={cancelRef}
                onClick={() => settle(false)}
              >
                {pending.cancelLabel || "Cancel"}
              </button>
              <button
                type="button"
                className={`btn ${pending.tone === "neutral" ? "btn-primary" : "btn-danger"}`}
                onClick={() => settle(true)}
              >
                {pending.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </ConfirmContext.Provider>
  );
}
