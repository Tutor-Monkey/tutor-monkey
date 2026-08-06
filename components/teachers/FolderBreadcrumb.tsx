"use client";

import { ChevronRight, Folder } from "lucide-react";
import { buildBreadcrumbItems } from "@/lib/teachers/fileBrowser";

type FolderBreadcrumbProps = {
  /** Current folder segments ([] = the Documents root). */
  segments: string[];
  /** Navigate to a folder; [] resets to the root. */
  onNavigate: (segments: string[]) => void;
  /**
   * Optional trailing label rendered as the current (non-clickable) step,
   * e.g. "Import" while the manual upload flow is open.
   */
  activeLabel?: string;
};

/**
 * File-browser breadcrumb for the Documents view: the root is always the
 * clickable "Documents" chip, then one clickable chip per folder level, and
 * an optional non-clickable trailing label (e.g. "Import"). Pure rendering —
 * navigation targets are computed by buildBreadcrumbItems + the caller.
 */
export function FolderBreadcrumb({
  segments,
  onNavigate,
  activeLabel,
}: FolderBreadcrumbProps) {
  const items = buildBreadcrumbItems(segments);

  return (
    <nav aria-label="Documents breadcrumb" className="flex min-w-0 flex-wrap items-center gap-1">
      {items.map((item, index) => (
        <span key={item.key} className="flex min-w-0 items-center gap-1">
          {index > 0 && (
            <ChevronRight
              className="h-3.5 w-3.5 shrink-0 text-gray-300"
              aria-hidden="true"
            />
          )}
          <button
            type="button"
            onClick={() => onNavigate(segments.slice(0, item.depth))}
            className={`inline-flex max-w-[180px] items-center gap-1.5 truncate rounded-full px-3 py-1 text-sm transition-colors ${
              item.depth === 0
                ? "font-semibold text-gray-900 hover:bg-gray-200/70"
                : "font-medium text-gray-600 hover:bg-gray-200/70 hover:text-gray-900"
            }`}
          >
            {item.depth === 0 && (
              <Folder className="h-3.5 w-3.5 shrink-0 text-gray-400" aria-hidden="true" />
            )}
            <span className="truncate">{item.label}</span>
          </button>
        </span>
      ))}
      {activeLabel && (
        <span className="flex min-w-0 items-center gap-1">
          <ChevronRight
            className="h-3.5 w-3.5 shrink-0 text-gray-300"
            aria-hidden="true"
          />
          <span className="truncate rounded-full bg-gray-100 px-3 py-1 text-sm font-medium text-gray-700">
            {activeLabel}
          </span>
        </span>
      )}
    </nav>
  );
}
