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
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type RowSelectionState,
  type SortingState,
  type VisibilityState,
} from '@tanstack/react-table';
import {DashboardLayout} from '../../components/DashboardLayout';
import {ColumnVisibilityMenu} from '../../components/ColumnVisibilityMenu';
import {SortableHeader} from '../../components/SortableHeader';
import {network} from '../../lib/network';
import {formatRelativeTime} from '../../lib/dateUtils';
import {useColumnVisibility} from '../../lib/hooks/useColumnVisibility';
import {Edit, LayoutGrid, LayoutPanelTop, List, Plus, Search, Trash2, X} from 'lucide-react';
import {NextSeo} from 'next-seo';
import Link from 'next/link';
import {useEffect, useMemo, useState} from 'react';
import {toast} from 'sonner';
import useSWR from 'swr';
import dayjs from 'dayjs';

type ViewMode = 'card' | 'table';
const VIEW_STORAGE_KEY = 'plunk:layouts:view';
const COLUMNS_STORAGE_KEY = 'plunk:layouts:columns';

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
  const [view, setView] = useState<ViewMode>('card');
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [layoutToDelete, setLayoutToDelete] = useState<string | null>(null);

  // Tanstack table state.
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnVisibility, setColumnVisibility] = useColumnVisibility(
    COLUMNS_STORAGE_KEY,
    DEFAULT_COLUMN_VISIBILITY,
  );
  // Row-selection primitive plumbed through for patch #25 (bulk-action UI lives there).
  // Intentionally not surfaced in the UI here — only the state is wired up.
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = window.localStorage.getItem(VIEW_STORAGE_KEY);
    if (stored === 'card' || stored === 'table') setView(stored);
  }, []);

  const handleViewChange = (next: ViewMode) => {
    setView(next);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(VIEW_STORAGE_KEY, next);
    }
  };

  // Build sort query string from tanstack state. The backend (fork patch #9 / selfhost)
  // accepts `?sort=<field>&dir=asc|desc`. Without those params it falls back to default order.
  const sortParam = sorting[0]?.id ?? '';
  const dirParam = sorting[0] ? (sorting[0].desc ? 'desc' : 'asc') : '';

  const {data, mutate, isLoading} = useSWR<PaginatedResponse<LayoutWithUsage>>(
    `/layouts?page=${page}&pageSize=20${search ? `&search=${search}` : ''}${sortParam ? `&sort=${sortParam}&dir=${dirParam}` : ''}`,
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

  const columns = useMemo<Array<ColumnDef<LayoutWithUsage>>>(
    () => [
      {
        id: 'name',
        accessorKey: 'name',
        enableHiding: false, // Name column is locked-visible.
        meta: {label: 'Name'},
        header: ({column}) => <SortableHeader column={column}>Name</SortableHeader>,
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
        meta: {label: 'Default'},
        header: ({column}) => <SortableHeader column={column}>Default</SortableHeader>,
        cell: ({row}) =>
          row.original.isDefault ? (
            <Badge variant="neutral">Default</Badge>
          ) : (
            <span className="text-sm text-neutral-400">—</span>
          ),
      },
      {
        id: 'usage',
        accessorFn: row => row._count?.templates ?? 0,
        meta: {label: 'Used by'},
        header: ({column}) => <SortableHeader column={column}>Used by</SortableHeader>,
        cell: ({row}) => {
          const usageCount = row.original._count?.templates ?? 0;
          return (
            <span className="text-sm text-neutral-700 tabular-nums">
              {usageCount === 0 ? (
                <span className="text-neutral-400">0 templates</span>
              ) : (
                `${usageCount.toLocaleString()} template${usageCount === 1 ? '' : 's'}`
              )}
            </span>
          );
        },
      },
      {
        id: 'updatedAt',
        accessorKey: 'updatedAt',
        meta: {label: 'Updated'},
        header: ({column}) => <SortableHeader column={column}>Updated</SortableHeader>,
        cell: ({row}) => (
          <div className="group relative inline-block cursor-help text-sm text-neutral-500">
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
        enableHiding: false,
        meta: {label: 'Actions'},
        header: () => <span className="flex justify-end">Actions</span>,
        cell: ({row}) => (
          <div className="flex items-center justify-end gap-2">
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
    state: {sorting, columnVisibility, rowSelection},
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    enableRowSelection: true,
    enableMultiSort: false,
    manualSorting: true, // Backend handles sorting; client just exposes ?sort=&dir=.
    getCoreRowModel: getCoreRowModel(),
    getRowId: row => row.id,
  });

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

          {/* Search */}
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
                <ColumnVisibilityMenu table={table} lockedColumnIds={['name', 'actions']} />
              </div>
            )}
            <div className="flex gap-0.5 shrink-0 rounded-md border border-neutral-200 p-px">
              <Button
                type="button"
                onClick={() => handleViewChange('card')}
                variant={view === 'card' ? 'default' : 'ghost'}
                size="sm"
                className="h-7 px-2"
                aria-label="Card view"
                aria-pressed={view === 'card'}
                title="Card view"
              >
                <LayoutGrid className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                onClick={() => handleViewChange('table')}
                variant={view === 'table' ? 'default' : 'ghost'}
                size="sm"
                className="h-7 px-2"
                aria-label="Table view"
                aria-pressed={view === 'table'}
                title="Table view"
              >
                <List className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Layouts */}
          {isLoading ? (
            <Card>
              <CardContent className="p-0">
                <div className="flex items-center justify-center py-16">
                  <IconSpinner />
                </div>
              </CardContent>
            </Card>
          ) : data?.data.length === 0 ? (
            <Card>
              <CardContent className="p-0">
                <div className="px-6 py-12">
                  <EmptyState
                    icon={LayoutPanelTop}
                    title={search ? 'No layouts match' : 'No layouts yet'}
                    description={
                      search
                        ? 'Try a different search term.'
                        : 'Create a master template scaffold once, reuse it across all your templates.'
                    }
                    action={
                      !search ? (
                        <Button asChild>
                          <Link href="/layouts/create">
                            <Plus className="h-4 w-4" />
                            Create Layout
                          </Link>
                        </Button>
                      ) : undefined
                    }
                  />
                </div>
              </CardContent>
            </Card>
          ) : view === 'card' ? (
            <>
                  {/* Card Grid View */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {data?.data.map(layout => {
                      const usageCount = layout._count?.templates ?? 0;
                      return (
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
                            <div className="flex items-start justify-between gap-3 mb-2">
                              <h3 className="font-semibold text-neutral-900 leading-snug">{layout.name}</h3>
                              {layout.isDefault ? (
                                <Badge className="shrink-0 mt-0.5" variant="neutral">Default</Badge>
                              ) : null}
                            </div>
                            <p className="text-xs text-neutral-500">
                              Used by{' '}
                              <span className="font-medium text-neutral-700 tabular-nums">
                                {usageCount.toLocaleString()}
                              </span>{' '}
                              template{usageCount === 1 ? '' : 's'}
                            </p>
                          </Link>
                          <div className="px-6 py-3 border-t border-neutral-100 flex items-center justify-between">
                            <div className="group relative inline-block cursor-help">
                              <span className="text-xs text-neutral-400">
                                Updated {formatRelativeTime(layout.updatedAt)}
                              </span>
                              <div className="hidden group-hover:block absolute z-10 w-48 p-2 bg-neutral-900 text-white text-xs rounded shadow-md bottom-full left-0 mb-1 whitespace-nowrap">
                                {dayjs(layout.updatedAt).format('DD MMMM YYYY, hh:mm')}
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
                                aria-label="Delete layout"
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
                      );
                    })}
                  </div>

                  {/* Pagination */}
                  {data && data.totalPages > 1 && (
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 px-6 py-4 border-t border-neutral-200">
                      <p className="text-xs sm:text-sm text-neutral-600 text-center sm:text-left">
                        Showing{' '}
                        <span className="font-medium text-neutral-900">{(page - 1) * data.pageSize + 1}</span> to{' '}
                        <span className="font-medium text-neutral-900">
                          {Math.min(page * data.pageSize, data.total)}
                        </span>{' '}
                        of <span className="font-medium text-neutral-900">{data.total}</span> layouts
                      </p>
                      <div className="flex items-center gap-2 justify-center sm:justify-end">
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
                <Card>
                  <CardContent className="p-0">
                  {/* Desktop Table View (tanstack-driven) - Hidden on mobile */}
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-neutral-50 border-b border-neutral-200">
                        {table.getHeaderGroups().map(headerGroup => (
                          <tr key={headerGroup.id}>
                            {headerGroup.headers.map(header => {
                              const isActions = header.column.id === 'actions';
                              const sorted = header.column.getIsSorted();
                              return (
                                <th
                                  key={header.id}
                                  aria-sort={
                                    sorted === 'asc'
                                      ? 'ascending'
                                      : sorted === 'desc'
                                        ? 'descending'
                                        : header.column.getCanSort()
                                          ? 'none'
                                          : undefined
                                  }
                                  className={
                                    'px-6 py-3 text-xs font-medium text-neutral-500 uppercase tracking-wider ' +
                                    (isActions ? 'text-right' : 'text-left')
                                  }
                                >
                                  {header.isPlaceholder
                                    ? null
                                    : flexRender(header.column.columnDef.header, header.getContext())}
                                </th>
                              );
                            })}
                          </tr>
                        ))}
                      </thead>
                      <tbody className="bg-white divide-y divide-neutral-200">
                        {table.getRowModel().rows.map(row => (
                          <tr key={row.id} className="hover:bg-neutral-50 transition-colors">
                            {row.getVisibleCells().map(cell => {
                              const id = cell.column.id;
                              const cellClass =
                                id === 'actions'
                                  ? 'px-6 py-4 whitespace-nowrap text-right text-sm font-medium'
                                  : 'px-6 py-4 whitespace-nowrap';
                              return (
                                <td key={cell.id} className={cellClass}>
                                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile Card View - Only visible on mobile */}
                  <div className="md:hidden space-y-3 p-4">
                    {data?.data.map(layout => {
                      const usageCount = layout._count?.templates ?? 0;
                      return (
                        <div
                          key={layout.id}
                          className="border border-neutral-200 rounded-lg p-4 bg-white hover:bg-neutral-50 transition-colors"
                        >
                          <div className="flex items-start justify-between gap-3 mb-2">
                            <Link
                              href={`/layouts/${layout.id}`}
                              className="text-sm font-semibold text-neutral-900 leading-snug flex-1 min-w-0 hover:text-neutral-700"
                            >
                              {layout.name}
                            </Link>
                            {layout.isDefault ? (
                              <Badge className="shrink-0 mt-0.5" variant="neutral">
                                Default
                              </Badge>
                            ) : null}
                          </div>
                          <p className="text-xs text-neutral-500 mb-3">
                            Used by{' '}
                            <span className="font-medium text-neutral-700 tabular-nums">
                              {usageCount.toLocaleString()}
                            </span>{' '}
                            template{usageCount === 1 ? '' : 's'}
                          </p>
                          <div className="flex items-center justify-between">
                            <div className="group relative inline-block cursor-help">
                              <span className="text-xs text-neutral-500">
                                Updated {formatRelativeTime(layout.updatedAt)}
                              </span>
                              <div className="hidden group-hover:block absolute z-10 w-48 p-2 bg-neutral-900 text-white text-xs rounded shadow-md bottom-full left-0 mb-1 whitespace-nowrap">
                                {dayjs(layout.updatedAt).format('DD MMMM YYYY, hh:mm')}
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
                                aria-label="Delete layout"
                                onClick={() => {
                                  setLayoutToDelete(layout.id);
                                  setShowDeleteDialog(true);
                                }}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Pagination */}
                  {data && data.totalPages > 1 && (
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 px-6 py-4 border-t border-neutral-200">
                      <p className="text-xs sm:text-sm text-neutral-600 text-center sm:text-left">
                        Showing{' '}
                        <span className="font-medium text-neutral-900">{(page - 1) * data.pageSize + 1}</span> to{' '}
                        <span className="font-medium text-neutral-900">
                          {Math.min(page * data.pageSize, data.total)}
                        </span>{' '}
                        of <span className="font-medium text-neutral-900">{data.total}</span> layouts
                      </p>
                      <div className="flex items-center gap-2 justify-center sm:justify-end">
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
                  </CardContent>
                </Card>
              )}
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
