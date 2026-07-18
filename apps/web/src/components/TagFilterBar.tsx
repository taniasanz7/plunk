import {Button} from '@plunk/ui';
import {Tag, X} from 'lucide-react';

interface TagFilterBarProps {
  /** Distinct tags to render as filter chips */
  tags: string[];
  /** Currently selected tags (empty when no filter is active) */
  selected: string[];
  /** Called with the full next selection whenever a chip is toggled or cleared */
  onChange: (next: string[]) => void;
}

/**
 * Multi-select tag filter rendered as a horizontal chip row.
 *
 * Multi-select with OR semantics to mirror the table-view Tags facet and the
 * API's `?tag=a&tag=b` filter (Prisma `tags: {hasSome}`): a row matches if it
 * carries ANY of the selected tags.
 *
 * - Click a chip to add it to the filter.
 * - Click an active chip (or the "Clear" button) to remove it / clear all.
 * - Renders nothing when there are no tags to show.
 */
export function TagFilterBar({tags, selected, onChange}: TagFilterBarProps) {
  if (tags.length === 0) return null;

  const selectedSet = new Set(selected);

  const toggle = (tag: string) => {
    if (selectedSet.has(tag)) {
      onChange(selected.filter(t => t !== tag));
    } else {
      onChange([...selected, tag]);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="inline-flex items-center gap-1 text-xs font-medium text-neutral-500">
        <Tag className="h-3 w-3" />
        Tags:
      </span>
      {tags.map(tag => {
        const active = selectedSet.has(tag);
        return (
          <Button
            key={tag}
            type="button"
            size="sm"
            variant={active ? 'default' : 'secondary'}
            onClick={() => toggle(tag)}
            aria-pressed={active}
            className="h-7 px-2.5 text-xs"
          >
            {tag}
          </Button>
        );
      })}
      {selected.length > 0 && (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => onChange([])}
          className="h-7 px-1.5 text-xs text-neutral-500"
          aria-label="Clear tag filter"
        >
          <X className="h-3 w-3" />
          Clear
        </Button>
      )}
    </div>
  );
}
