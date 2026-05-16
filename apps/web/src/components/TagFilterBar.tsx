import {Button} from '@plunk/ui';
import {Tag, X} from 'lucide-react';

interface TagFilterBarProps {
  /** Distinct tags to render as filter chips */
  tags: string[];
  /** Currently selected tag, or null when no filter is active */
  selected: string | null;
  /** Called with the tag to activate, or null to clear */
  onChange: (next: string | null) => void;
}

/**
 * Single-select tag filter rendered as a horizontal chip row.
 *
 * - Click a chip to activate the filter.
 * - Click the active chip (or the "Clear" button) to remove it.
 * - Renders nothing when there are no tags to show.
 */
export function TagFilterBar({tags, selected, onChange}: TagFilterBarProps) {
  if (tags.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="inline-flex items-center gap-1 text-xs font-medium text-neutral-500">
        <Tag className="h-3 w-3" />
        Tags:
      </span>
      {tags.map(tag => {
        const active = tag === selected;
        return (
          <Button
            key={tag}
            type="button"
            size="sm"
            variant={active ? 'default' : 'secondary'}
            onClick={() => onChange(active ? null : tag)}
            aria-pressed={active}
            className="h-7 px-2.5 text-xs"
          >
            {tag}
          </Button>
        );
      })}
      {selected && (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => onChange(null)}
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
