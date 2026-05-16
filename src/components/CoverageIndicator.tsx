import type { ObjectiveCoverage } from "@/model/objectives";

export interface CoverageIndicatorProps {
  readonly coverage: ObjectiveCoverage;
  readonly showUnmappedOnly: boolean;
  readonly onToggleUnmappedOnly: () => void;
}

export function CoverageIndicator({
  coverage,
  showUnmappedOnly,
  onToggleUnmappedOnly,
}: CoverageIndicatorProps): JSX.Element {
  const { mappedCount, importedCount, unmapped, workingTotal } = coverage;
  const pct = importedCount === 0 ? 100 : Math.round((mappedCount / importedCount) * 100);
  const allMapped = unmapped.length === 0;

  return (
    <div className="flex items-center gap-4 px-4 py-2 border-b border-line bg-surface">
      <div className="flex items-baseline gap-2">
        <span className="font-mono text-[11px] text-ink-fade uppercase tracking-wider">Coverage</span>
        <span className="font-display text-lg text-navy">
          {mappedCount} <span className="text-ink-fade text-sm">/ {importedCount}</span>
        </span>
        <span className="text-xs text-ink-dim">spec objectives mapped ({pct}%)</span>
      </div>
      <div className="text-[11px] text-ink-fade">
        Working spec holds {workingTotal} objective{workingTotal === 1 ? "" : "s"} in total
        {workingTotal !== mappedCount && (
          <span className="ml-1">({workingTotal - mappedCount} user-added)</span>
        )}
      </div>
      <div className="flex-1" />
      <button
        onClick={onToggleUnmappedOnly}
        disabled={allMapped}
        className={
          "text-xs px-3 py-1 border rounded transition " +
          (showUnmappedOnly
            ? "bg-warn/10 border-warn text-warn"
            : "border-line hover:bg-surface-2 " + (allMapped ? "opacity-40 cursor-not-allowed" : ""))
        }
      >
        {unmapped.length} unmapped
        {showUnmappedOnly ? " — clear filter" : " — filter rows"}
      </button>
    </div>
  );
}
