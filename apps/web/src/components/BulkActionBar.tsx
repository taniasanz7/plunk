import {Button} from '@plunk/ui';
import {X} from 'lucide-react';
import type {ReactNode} from 'react';

interface BulkActionBarProps {
  /** Number of currently selected rows. The bar should typically only be rendered when this is > 0. */
  selectedCount: number;
  /** Singular noun for the selected item type (e.g. "template"). Pluralized internally with a trailing 's'. */
  itemNoun: string;
  /** Clears the row selection state. */
  onClear: () => void;
  /**
   * Action slot. Render whatever Buttons / Popovers belong to the bar here.
   * Kept as `children` (rather than an `actions` prop) so the selfhost
   * follow-up can splice in "Add tags…" / "Remove tags…" popovers next to
   * the delete button without touching this component.
   */
  children?: ReactNode;
}

/**
 * Slim selection-driven action bar that sits above a table when one or
 * more rows are selected. Patch #25 wires it up for the templates table
 * with a single "Delete selected" action; the selfhost follow-up (which
 * composes with the template-tags patch) layers tag-add / tag-remove
 * affordances into the `children` slot.
 *
 * Visually it's a neutral pill above the table — not sticky, so it
 * scrolls with the rest of the page. That matches the rest of the
 * dashboard's affordances (search, filter chips) and keeps tab order
 * predictable.
 */
export function BulkActionBar({selectedCount, itemNoun, onClear, children}: BulkActionBarProps) {
  if (selectedCount <= 0) return null;

  const noun = selectedCount === 1 ? itemNoun : `${itemNoun}s`;

  return (
    <div
      role="region"
      aria-label="Bulk actions"
      className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-md border border-neutral-200 bg-neutral-50 px-4 py-2.5"
    >
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onClear}
          aria-label="Clear selection"
          title="Clear selection"
        >
          <X className="h-4 w-4" />
        </Button>
        <span className="text-sm font-medium text-neutral-900">
          {selectedCount} {noun} selected
        </span>
      </div>
      {children ? <div className="flex flex-wrap items-center gap-2">{children}</div> : null}
    </div>
  );
}
