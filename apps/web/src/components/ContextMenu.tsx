import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type ContextMenuItem = {
  label: string;
  onSelect: () => void;
  /** Shown to the right in muted type — a state, not a keyboard hint. */
  hint?: string;
  disabled?: boolean;
};

type Props = {
  /** Viewport coordinates of the click that opened the menu. */
  x: number;
  y: number;
  /** Names what the menu acts on, so the menu isn't an anonymous list. */
  heading?: string;
  items: ContextMenuItem[];
  onClose: () => void;
};

const MARGIN = 8;

/**
 * A small menu anchored to a right-click. It closes on anything that would
 * move the thing it points at — a scroll, a resize, a click elsewhere — since
 * a menu left hanging over unrelated rows would act on the wrong stock.
 */
export function ContextMenu({ x, y, heading, items, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });

  // Flip back inside the viewport before the first paint, so the menu never
  // appears off-screen and then jumps.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    setPos({
      left: Math.max(MARGIN, Math.min(x, window.innerWidth - width - MARGIN)),
      top: Math.max(MARGIN, Math.min(y, window.innerHeight - height - MARGIN)),
    });
  }, [x, y]);

  useEffect(() => {
    ref.current?.querySelector<HTMLButtonElement>("button:not([disabled])")?.focus();
  }, []);

  useEffect(() => {
    function onPointerDown(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onClose);
    window.addEventListener("scroll", onClose, true);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onClose);
      window.removeEventListener("scroll", onClose, true);
    };
  }, [onClose]);

  function onMenuKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const buttons = Array.from(
      ref.current?.querySelectorAll<HTMLButtonElement>("button:not([disabled])") ?? [],
    );
    if (!buttons.length) return;
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next =
      e.key === "ArrowDown"
        ? (current + 1) % buttons.length
        : (current - 1 + buttons.length) % buttons.length;
    buttons[next]?.focus();
  }

  return createPortal(
    <div
      ref={ref}
      className="context-menu"
      role="menu"
      aria-label={heading}
      style={{ left: pos.left, top: pos.top }}
      onKeyDown={onMenuKeyDown}
      onContextMenu={(e) => e.preventDefault()}
    >
      {heading ? <div className="context-menu-heading">{heading}</div> : null}
      {items.map((item) => (
        <button
          key={item.label}
          type="button"
          role="menuitem"
          className="context-menu-item"
          disabled={item.disabled}
          onClick={() => {
            item.onSelect();
            onClose();
          }}
        >
          <span>{item.label}</span>
          {item.hint ? <span className="context-menu-hint">{item.hint}</span> : null}
        </button>
      ))}
    </div>,
    document.body,
  );
}
