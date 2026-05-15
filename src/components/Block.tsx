export interface BlockProps {
  readonly code: string;
  readonly name: string;
  readonly lessons: number;
  readonly colour: string;
  readonly variant?: "pool" | "placed" | "eoht" | "custom";
  readonly splitBadge?: "auto" | "manual" | null;
  readonly onClick?: () => void;
  readonly dragging?: boolean;
}

export function Block({
  code,
  name,
  lessons,
  colour,
  variant = "placed",
  splitBadge,
  onClick,
  dragging,
}: BlockProps): JSX.Element {
  const isEoht = variant === "eoht";
  return (
    <div
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      className={
        "group relative flex items-center gap-2 px-2 py-1.5 rounded-card border bg-surface text-ink " +
        "cursor-pointer select-none transition " +
        (dragging
          ? "opacity-40 ring-2 ring-navy"
          : "hover:bg-surface-2") +
        (isEoht ? " border-dashed border-line-2 italic text-ink-dim" : " border-line")
      }
      style={isEoht ? undefined : { borderLeft: `4px solid ${colour}` }}
    >
      <span className="font-mono text-[10px] tracking-wider text-ink-fade uppercase">
        {code}
      </span>
      <span className="flex-1 text-xs leading-tight truncate" title={name}>
        {name}
      </span>
      <span className="text-[10px] text-ink-dim font-mono tabular-nums">
        {lessons}L
      </span>
      {splitBadge && (
        <span
          className={
            "text-[9px] font-mono uppercase px-1 rounded " +
            (splitBadge === "auto" ? "bg-line text-ink-dim" : "bg-gold/20 text-gold")
          }
          title={splitBadge === "auto" ? "Auto-split (drag to recombine)" : "Manually split"}
        >
          {splitBadge === "auto" ? "auto" : "split"}
        </span>
      )}
    </div>
  );
}
