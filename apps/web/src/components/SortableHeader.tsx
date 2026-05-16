import type {Column} from '@tanstack/react-table';
import {ChevronDown, ChevronUp, ChevronsUpDown} from 'lucide-react';

interface SortableHeaderProps<TData> {
  column: Column<TData, unknown>;
  children: React.ReactNode;
  /** When set, override the column's `enableSorting` flag. */
  disableSort?: boolean;
  /** Align the header content (defaults to `left`). */
  align?: 'left' | 'right' | 'center';
}

/**
 * Renders the inner content of a tanstack-driven `<th>`: a click target that
 * cycles through asc → desc → unsorted, with chevron indicators. Designed to
 * be placed inside a `<th>` already styled with table-header classes.
 */
export function SortableHeader<TData>({column, children, disableSort, align = 'left'}: SortableHeaderProps<TData>) {
  const canSort = !disableSort && column.getCanSort();
  const sorted = column.getIsSorted();

  if (!canSort) {
    return (
      <span
        className={
          align === 'right'
            ? 'flex justify-end'
            : align === 'center'
              ? 'flex justify-center'
              : 'inline-flex'
        }
      >
        {children}
      </span>
    );
  }

  const Icon = sorted === 'asc' ? ChevronUp : sorted === 'desc' ? ChevronDown : ChevronsUpDown;
  const sortLabel = sorted === 'asc' ? 'sorted ascending' : sorted === 'desc' ? 'sorted descending' : 'not sorted';

  return (
    <button
      type="button"
      onClick={column.getToggleSortingHandler()}
      className={
        'group inline-flex items-center gap-1 select-none transition-colors hover:text-neutral-700 focus-visible:outline-none focus-visible:underline ' +
        (align === 'right' ? 'justify-end w-full' : align === 'center' ? 'justify-center w-full' : '')
      }
    >
      <span>{children}</span>
      <Icon
        className={
          'h-3.5 w-3.5 shrink-0 ' +
          (sorted ? 'text-neutral-700' : 'text-neutral-400 opacity-60 group-hover:opacity-100')
        }
        aria-hidden="true"
      />
      <span className="sr-only">, {sortLabel}</span>
    </button>
  );
}
