import {
  Button,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@plunk/ui';
import type {Table} from '@tanstack/react-table';
import {Columns3} from 'lucide-react';

interface ColumnVisibilityMenuProps<TData> {
  table: Table<TData>;
  /** Column IDs that are pinned visible (checkbox disabled). Always includes the column with `enableHiding: false`. */
  lockedColumnIds?: ReadonlyArray<string>;
}

/**
 * Dropdown listing every hideable column on `table` with a checkbox per
 * column. Honours each column's `enableHiding` flag (a column with
 * `enableHiding: false` is rendered disabled).
 */
export function ColumnVisibilityMenu<TData>({table, lockedColumnIds = []}: ColumnVisibilityMenuProps<TData>) {
  const lockedSet = new Set(lockedColumnIds);

  // We render every leaf column, with hide-locked ones disabled & forced visible.
  const columns = table.getAllLeafColumns();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-label="Toggle column visibility"
          title="Columns"
        >
          <Columns3 className="h-4 w-4" />
          <span className="hidden sm:inline">Columns</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Visible columns</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {columns.map(column => {
          const id = column.id;
          const locked = lockedSet.has(id) || !column.getCanHide();
          const header = (column.columnDef.meta as {label?: string} | undefined)?.label ?? id;
          return (
            <DropdownMenuCheckboxItem
              key={id}
              checked={locked ? true : column.getIsVisible()}
              disabled={locked}
              onCheckedChange={value => {
                if (locked) return;
                column.toggleVisibility(!!value);
              }}
              onSelect={e => e.preventDefault()}
              className="capitalize"
            >
              {header}
            </DropdownMenuCheckboxItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
