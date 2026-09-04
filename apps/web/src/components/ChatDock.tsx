import { useEffect, useRef, useState } from "react";
import { PortfolioChat } from "./PortfolioChat";

/**
 * The analyst is available from anywhere in the terminal, so it docks rather
 * than occupying a place in the navigation. Closed it is one control; open it
 * is a panel over the work, never a page you have to leave to get back.
 */
export function ChatDock() {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  // Land the caret in the composer, so opening the panel is one gesture.
  useEffect(() => {
    if (open) panelRef.current?.querySelector("input")?.focus();
  }, [open]);

  return (
    <>
      {open && (
        <div className="chat-dock-panel" ref={panelRef} role="dialog" aria-label="Ask about your portfolio">
          <div className="chat-dock-head">
            <h2>Ask</h2>
            <button type="button" className="chat-dock-close" aria-label="Close" onClick={() => setOpen(false)}>
              <span aria-hidden="true">×</span>
            </button>
          </div>
          <PortfolioChat />
        </div>
      )}

      <button
        type="button"
        ref={buttonRef}
        className={`chat-dock-button ${open ? "open" : ""}`}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? "Close" : "Ask"}
      </button>
    </>
  );
}
