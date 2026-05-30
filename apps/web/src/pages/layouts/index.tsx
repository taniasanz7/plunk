import {
  Badge,
  Button,
  Card,
  CardContent,
  ConfirmDialog,
  EmptyState,
  IconSpinner,
  Input,
} from '@plunk/ui';
import type {LayoutWithUsage, PaginatedResponse} from '@plunk/types';
import {
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
  type VisibilityState,
} from '@tanstack/react-table';
import {DashboardLayout} from '../../components/DashboardLayout';
import {
  DataTable,
  DataTableColumnHeader,
  DataTableViewOptions,
  DataTableViewSwitcher,
  NoResultsState,
  isDataTableView,
  type DataTableColumnMeta,
  type DataTableView,
} from '../../components/data-table';
import {network} from '../../lib/network';
import {formatRelativeTime} from '../../lib/dateUtils';
import {useColumnVisibility} from '../../lib/hooks/useColumnVisibility';
import {usePersistentState} from '../../lib/hooks/usePersistentState';
import {Calendar, Edit, LayoutPanelTop, Plus, Search, Trash2, X} from 'lucide-react';
import {NextSeo} from 'next-seo';
import Link from 'next/link';
import {useEffect, useMemo, useState} from 'react';
import {toast} from 'sonner';
import useSWR from 'swr';
import dayjs from 'dayjs';

const VIEW_STORAGE_KEY = 'plunk:layouts:view';
const COLUMNS_STORAGE_KEY = 'plunk:layouts:columns';

// Name + Actions are locked-visible (see lockedColumnIds below). Everything
// starts visible. Layouts has no selection column (no bulk ops) and no faceted
// filter (no fixed-value filter column).
const DEFAULT_COLUMN_VISIBILITY: VisibilityState = {
  name: true,
  isDefault: true,
  usage: true,
  updatedAt: true,
  actions: true,
};

export default function LayoutsPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [view, setView] = usePersistentState<DataTableView>(VIEW_STORAGE_KEY, 'card', isDataTableView);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [layoutToDelete, setLayoutToDelete] = useState<string | null>(null);

  // Tanstack table state.
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnVisibility, setColumnVisibility] = useColumnVisibility(COLUMNS_STORAGE_KEY, DEFAULT_COLUMN_VISIBILITY);

  // Build the sort query string from tanstack state. The backend is
  // authoritative (`?sort=<field>&dir=asc|desc`); without those params it keeps
  // its default ordering (default layout first, then newest). manualSorting is
  // on, so the client only mirrors.
  const sortParam = sorting[0]?.id ?? '';
  const dirParam = sorting[0] ? (sorting[0].desc ? 'desc' : 'asc') : '';

  const {data, mutate, isLoading} = useSWR<PaginatedResponse<LayoutWithUsage>>(
    `/layouts?page=${page}&pageSize=20${search ? `&search=${encodeURIComponent(search)}` : ''}${
      sortParam ? `&sort=${sortParam}&dir=${dirParam}` : ''
    }`,
    {revalidateOnFocus: false},
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const handleDelete = async () => {
    if (!layoutToDelete) return;

    try {
      await network.fetch('DELETE', `/layouts/${layoutToDelete}`);
      toast.success('Layout deleted successfully');
      void mutate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete layout');
    } finally {
      setLayoutToDelete(null);
    }
  };

  const columns = useMemo<Array<ColumnDef<LayoutWithUsage, unknown>>>(
    () => [
      {
        id: 'name',
        accessorKey: 'name',
        enableHiding: false, // Name column is locked-visible.
        meta: {label: 'Name'} satisfies DataTableColumnMeta,
        header: ({column}) => <DataTableColumnHeader column={column}>Name</DataTableColumnHeader>,
        cell: ({row}) => (
          <Link
            href={`/layouts/${row.original.id}`}
            className="text-sm font-medium text-neutral-900 hover:text-neutral-700 focus-visible:outline-none focus-visible:underline"
          >
            {row.original.name}
          </Link>
        ),
      },
      {
        id: 'isDefault',
        accessorKey: 'isDefault',
        enableSorting: false, // Boolean flag — not a useful header sort.
        meta: {label: 'Default'} satisfies DataTableColumnMeta,
        header: ({column}) => <DataTableColumnHeader column={column}>Default</DataTableColumnHeader>,
        cell: ({row}) =>
          row.original.isDefault ? (
            <Badge variant="neutral">Default</Badge>
          ) : (
            <span className="text-sm text-neutral-400">—</span>
          ),
      },
      {
        id: 'usage',
        enableSorting: false, // Computed count — no backend sort field.
        meta: {label: 'Used by'} satisfies DataTableColumnMeta,
        header: ({column}) => <DataTableColumnHeader column={column}>Used by</DataTableColumnHeader>,
        cell: ({row}) => {
          const count = row.original._count?.templates ?? 0;
          return (
            <span className="text-sm text-neutral-700 whitespace-nowrap">
              {count} template{count === 1 ? '' : 's'}
            </span>
          );
        },
      },
      {
        id: 'updatedAt',
        accessorKey: 'updatedAt',
        // ISO-string values sort ascending on first click by default; flip so
        // the first click on "Updated" surfaces the most recently edited rows.
        sortDescFirst: true,
        meta: {label: 'Updated'} satisfies DataTableColumnMeta,
        header: ({column}) => <DataTableColumnHeader column={column}>Updated</DataTableColumnHeader>,
        cell: ({row}) => (
          <div className="group relative inline-block cursor-help text-sm text-neutral-500 whitespace-nowrap">
            {formatRelativeTime(row.original.updatedAt)}
            <div className="hidden group-hover:block absolute z-10 w-48 p-2 bg-neutral-900 text-white text-xs rounded shadow-md bottom-full left-1/2 transform -translate-x-1/2 mb-1 whitespace-nowrap">
              {dayjs(row.original.updatedAt).format('DD MMMM YYYY, hh:mm')}
            </div>
          </div>
        ),
      },
      {
        id: 'actions',
        enableSorting: false,
        enableHiding: false, // Actions column is locked-visible.
        meta: {label: 'Actions', headClassName: 'text-right', cellClassName: 'text-right'} satisfies DataTableColumnMeta,
        header: () => <span className="flex justify-end">Actions</span>,
        cell: ({row}) => (
          <div className="flex items-center justify-end gap-1">
            <Button asChild variant="ghost" size="sm" title="Edit layout">
              <Link href={`/layouts/${row.original.id}`} aria-label="Edit layout">
                <Edit className="h-4 w-4" />
              </Link>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              title="Delete layout"
              aria-label="Delete layout"
              onClick={() => {
                setLayoutToDelete(row.original.id);
                setShowDeleteDialog(true);
              }}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ),
      },
    ],
    [],
  );

  const table = useReactTable<LayoutWithUsage>({
    data: data?.data ?? [],
    columns,
    state: {sorting, columnVisibility},
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    enableMultiSort: false,
    manualSorting: true, // Backend handles sorting; client just exposes ?sort=&dir=.
    getCoreRowModel: getCoreRowModel(),
    getRowId: row => row.id,
  });

  const hasData = data && data.data.length > 0;

  // Whether a search is currently narrowing the list. Layouts has no facet/tag
  // filters, so search is the only thing that can hide rows. Drives the "no
  // results vs first-run empty" distinction below.
  const hasActiveFilters = search !== '';

  // Reset search + pagination so the user can recover from a search that matched
  // nothing.
  const clearFilters = () => {
    setSearchInput('');
    setSearch('');
    setPage(1);
  };

  return (
    <>
      <NextSeo title="Layouts" />
      <DashboardLayout>
        <div className="space-y-6">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl sm:text-3xl font-bold text-neutral-900">Layouts</h1>
              <p className="text-neutral-500 mt-2 text-sm sm:text-base">
                Reusable HTML scaffolds (header, footer, branding) that wrap your templates via a{' '}
                <code className="text-xs bg-neutral-100 px-1 py-0.5 rounded">{'{{contentSlot}}'}</code> placeholder.{' '}
                {data?.total ? `${data.total} total` : ''}
              </p>
            </div>
            <Button asChild className="w-full sm:w-auto">
              <Link href="/layouts/create">
                <Plus className="h-4 w-4" />
                <span className="hidden sm:inline">Create Layout</span>
                <span className="sm:hidden">Create</span>
              </Link>
            </Button>
          </div>

          {/* Control row.
              - Search input: always present (both views).
              - Columns selector: table view only.
              - View switcher rounds out the row.
              Layouts has no faceted filter column, so the table-view top row is
              just search + Columns + switcher. */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
              <Input
                type="text"
                placeholder="Search layouts..."
                value={searchInput}
                onChange={e => setSearchInput(e.target.value)}
                className="pl-10 pr-10 h-8 text-xs"
              />
              {searchInput && (
                <button
                  type="button"
                  aria-label="Clear search"
                  onClick={() => {
                    setSearchInput('');
                    setSearch('');
                    setPage(1);
                  }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            {view === 'table' && (
              <div className="shrink-0">
                <DataTableViewOptions table={table} lockedColumnIds={['name', 'actions']} />
              </div>
            )}
            <DataTableViewSwitcher view={view} onChange={setView} />
          </div>

          {/* Layouts */}
          <div>
            {isLoading ? (
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-center py-12">
                    <IconSpinner />
                  </div>
                </CardContent>
              </Card>
            ) : !hasData ? (
              <Card>
                <CardContent>
                  {hasActiveFilters ? (
                    // Layouts exist, but the active search matched none — offer a
                    // one-click recovery.
                    <NoResultsState icon={LayoutPanelTop} itemNoun="layouts" onClear={clearFilters} />
                  ) : (
                    // Genuinely empty project — first-run state.
                    <EmptyState
                      icon={LayoutPanelTop}
                      title="No layouts yet"
                      description="Create a master template scaffold once, reuse it across all your templates."
                      action={
                        <Button asChild>
                          <Link href="/layouts/create">
                            <Plus className="h-4 w-4" />
                            Create Layout
                          </Link>
                        </Button>
                      }
                    />
                  )}
                </CardContent>
              </Card>
            ) : view === 'card' ? (
              <>
                {/* Card Grid View */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {data?.data.map(layout => (
                    <Card
                      key={layout.id}
                      className="transition-colors hover:border-neutral-300 flex flex-col [&:has([data-card-link]:focus-visible)]:ring-2 [&:has([data-card-link]:focus-visible)]:ring-ring [&:has([data-card-link]:focus-visible)]:ring-offset-2"
                    >
                      <Link
                        href={`/layouts/${layout.id}`}
                        data-card-link=""
                        className="flex-1 block p-6 pb-4 hover:bg-neutral-50/50 transition-colors rounded-t-xl focus-visible:outline-none"
                        aria-label={`Edit ${layout.name}`}
                      >
                        <div className="flex items-start justify-between gap-3 mb-3">
                          <h3 className="font-semibold text-neutral-900 leading-snug">{layout.name}</h3>
                          {layout.isDefault ? (
                            <Badge className="shrink-0 mt-0.5" variant="neutral">
                              Default
                            </Badge>
                          ) : null}
                        </div>
                        <p className="text-sm text-neutral-500">
                          Used by {layout._count?.templates ?? 0} template
                          {(layout._count?.templates ?? 0) === 1 ? '' : 's'}
                        </p>
                      </Link>
                      <div className="px-6 py-3 border-t border-neutral-100 flex items-center justify-between">
                        <div className="flex items-center gap-1.5 text-xs text-neutral-400">
                          <Calendar className="h-3 w-3" />
                          <div className="group relative inline-block cursor-help">
                            <span>Updated {formatRelativeTime(layout.updatedAt)}</span>
                            <div className="hidden group-hover:block absolute z-10 w-48 p-2 bg-neutral-900 text-white text-xs rounded shadow-md bottom-full left-0 mb-1 whitespace-nowrap">
                              {dayjs(layout.updatedAt).format('DD MMMM YYYY, hh:mm')}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button asChild variant="ghost" size="sm" title="Edit layout">
                            <Link href={`/layouts/${layout.id}`} aria-label="Edit layout">
                              <Edit className="h-4 w-4" />
                            </Link>
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            title="Delete layout"
                            onClick={() => {
                              setLayoutToDelete(layout.id);
                              setShowDeleteDialog(true);
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>

                {/* Pagination */}
                {data && data.totalPages > 1 && (
                  <div className="flex items-center justify-between mt-6">
                    <p className="text-sm text-neutral-500">
                      Showing {(page - 1) * data.pageSize + 1} to {Math.min(page * data.pageSize, data.total)} of{' '}
                      {data.total} layouts
                    </p>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" onClick={() => setPage(p => p - 1)} disabled={page === 1}>
                        Previous
                      </Button>
                      <span className="text-sm text-neutral-700">
                        Page {page} of {data.totalPages}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage(p => p + 1)}
                        disabled={page === data.totalPages}
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <>
                {/* Table View (tanstack-driven) */}
                <Card>
                  <CardContent className="p-0">
                    <DataTable table={table} />
                  </CardContent>
                </Card>

                {/* Pagination */}
                {data && data.totalPages > 1 && (
                  <div className="flex items-center justify-between mt-6">
                    <p className="text-sm text-neutral-500">
                      Showing {(page - 1) * data.pageSize + 1} to {Math.min(page * data.pageSize, data.total)} of{' '}
                      {data.total} layouts
                    </p>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" onClick={() => setPage(p => p - 1)} disabled={page === 1}>
                        Previous
                      </Button>
                      <span className="text-sm text-neutral-700">
                        Page {page} of {data.totalPages}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage(p => p + 1)}
                        disabled={page === data.totalPages}
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        <ConfirmDialog
          open={showDeleteDialog}
          onOpenChange={setShowDeleteDialog}
          onConfirm={handleDelete}
          title="Delete Layout"
          description="Are you sure you want to delete this layout? Templates that reference it must be detached first."
          confirmText="Delete"
          variant="destructive"
        />
      </DashboardLayout>
    </>
  );
}
