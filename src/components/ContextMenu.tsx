import { useEffect, useRef } from "react";

export interface ContextMenuItem {
  readonly label: string;
  readonly onClick: () => void;
  /** Render as a destructive (warn-coloured) action. */
  readonly destructive?: boolean;
  /** Disable the item with a tooltip explaining why. */
  readonly disabled?: boolean;
  /** Optional separator drawn BEFORE this item. */
  readonly separatorBefore?: boolean;
}

export interface ContextMenuProps {
  /** Screen coords where the user invoked the menu (clientX / clientY). */
  readonly x: number;
  readonly y: number;
  readonly items: readonly ContextMenuItem[];
  readonly onClose: () => void;
}

/**
 * Lightweight right-click menu (DEC-052). Closes on:
 *   - Click outside
 *   - Escape key
 *   - Selecting any item (the item's onClick is called first)
 *
 * Positioned absolutely at the supplied client coords; flips horizontally /
 * vertically if it would overflow the viewport.
 */
export function ContextMenu({ x, y, items, onClose }: ContextMenuProps): JSX.Element {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleDocPointer(e: PointerEvent): void {
      if (!ref.current) return;
      if (e.target instanceof Node && ref.current.contains(e.target)) return;
      onClose();
    }
    function handleKey(e: KeyboardEvent): void {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("pointerdown", handleDocPointer);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("pointerdown", handleDocPointer);
      document.removeEventListener("keydown", handleKey);
    };
  }, [onClose]);

  // Flip into the viewport if the menu would overflow. Use a quick post-mount
  // measurement; default positioning is the click coords.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let nextLeft = x;
    let nextTop = y;
    if (rect.right > vw) nextLeft = Math.max(8, vw - rect.width - 8);
    if (rect.bottom > vh) nextTop = Math.max(8, vh - rect.height - 8);
    el.style.left = `${nextLeft}px`;
    el.style.top = `${nextTop}px`;
  }, [x, y, items.length]);

  return (
    <div
      ref={ref}
      role="menu"
      onContextMenu={(e) => e.preventDefault()}
      className="fixed z-[60] min-w-[180px] bg-surface border border-line rounded-card shadow-xl py-1 text-sm"
      style={{ left: x, top: y }}
    >
      {items.map((item, i) => (
        <div key={`${item.label}-${i}`}>
          {item.separatorBefore && i > 0 && (
            <div className="h-px bg-line my-1 mx-1" aria-hidden />
          )}
          <button
            role="menuitem"
            type="button"
            onClick={() => {
              if (item.disabled) return;
              item.onClick();
              onClose();
            }}
            disabled={item.disabled}
            className={
              "w-full text-left px-3 py-1.5 transition focus-visible:outline-none focus-visible:bg-surface-2 " +
              (item.disabled
                ? "text-ink-fade cursor-not-allowed"
                : item.destructive
                ? "text-warn hover:bg-warn/10"
                : "text-ink hover:bg-surface-2")
            }
          >
            {item.label}
          </button>
        </div>
      ))}
    </div>
  );
}
