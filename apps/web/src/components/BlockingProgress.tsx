import { useEffect } from "react";

type Props = {
  /** Small reference label above the phase, e.g. "Importing". */
  kicker: string;
  /** What is happening right now, in words. */
  phase: string;
  /** The consequence of interrupting, stated plainly. */
  note?: string;
};

/**
 * A full sheet over the app for an operation that must not be interrupted.
 *
 * There is deliberately no percentage. The import is one server call that
 * reports nothing back until it finishes, so any bar that filled up would be an
 * animation pretending to be a measurement — and this product's first principle
 * is that it does not make numbers up. The phases below are real client-side
 * transitions; the rule underneath is motion, not progress.
 */
export function BlockingProgress({ kicker, phase, note }: Props) {
  // Closing the tab mid-import leaves a half-rebuilt portfolio, because the
  // server clears the old rows before writing the new ones.
  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  return (
    <div className="blocking-progress" role="alertdialog" aria-modal="true" aria-live="assertive">
      <div className="blocking-progress-sheet">
        <p className="blocking-progress-kicker">{kicker}</p>
        <p className="blocking-progress-phase">{phase}</p>
        <div className="blocking-progress-rule" role="progressbar" aria-label={phase}>
          <span className="blocking-progress-run" />
        </div>
        {note && <p className="blocking-progress-note">{note}</p>}
      </div>
    </div>
  );
}
