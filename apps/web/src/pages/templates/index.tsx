import {
  Badge,
  Button,
  Card,
  CardContent,
  ConfirmDialog,
  IconSpinner,
  Input,
} from '@plunk/ui';
import type {Template} from '@plunk/db';
import type {PaginatedResponse} from '@plunk/types';
import {EmptyState} from '@plunk/ui';
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
import {Calendar, Copy, Edit, FileText, LayoutGrid, List, Plus, Search, Trash2, X} from 'lucide-react';
import {NextSeo} from 'next-seo';
import Link from 'next/link';
import {useEffect, useMemo, useState} from 'react';
import {toast} from 'sonner';
import useSWR from 'swr';
import dayjs from 'dayjs';

type ViewMode = 'card' | 'table';
const VIEW_STORAGE_KEY = 'plunk:templates:view';
const COLUMNS_STORAGE_KEY = 'plunk:templates:columns';

const DEFAULT_COLUMN_VISIBILITY: VisibilityState = {
  name: true,
  type: true,
  subject: true,
  updatedAt: true,
  actions: true,
};

export default function TemplatesPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'TRANSACTIONAL' | 'MARKETING' | 'HEADLESS'>('ALL');
  const [view, setView] = useState<ViewMode>('card');
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [templateToDelete, setTemplateToDelete] = useState<string | null>(null);

  // Tanstack table state.
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnVisibility, setColumnVisibility] = useColumnVisibility(
    COLUMNS_STORAGE_KEY,
    DEFAULT_COLUMN_VISIBILITY,
  );
  // Row-selection primitive plumbed through for patch #25 (bulk-action UI lives there).
  // Intentionally not surfaced in the UI here — only the state is wired up.
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

  // Restore the view preference from localStorage on first mount (client only).
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

  const {data, mutate, isLoading} = useSWR<PaginatedResponse<Template>>(
    `/templates?page=${page}&pageSize=20${search ? `&search=${search}` : ''}${typeFilter !== 'ALL' ? `&type=${typeFilter}` : ''}${sortParam ? `&sort=${sortParam}&dir=${dirParam}` : ''}`,
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
    if (!templateToDelete) return;

    try {
      await network.fetch('DELETE', `/templates/${templateToDelete}`);
      toast.success('Template deleted successfully');
      void mutate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete template');
    } finally {
      setTemplateToDelete(null);
    }
  };

  const handleDuplicate = async (templateId: string) => {
    try {
      await network.fetch('POST', `/templates/${templateId}/duplicate`);
      toast.success('Template duplicated successfully');
      void mutate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to duplicate template');
    }
  };

  const columns = useMemo<Array<ColumnDef<Template>>>(
    () => [
      {
        id: 'name',
        accessorKey: 'name',
        enableHiding: false, // Name column is locked-visible.
        meta: {label: 'Name'},
        header: ({column}) => <SortableHeader column={column}>Name</SortableHeader>,
        cell: ({row}) => (
          <Link
            href={`/templates/${row.original.id}`}
            className="text-sm font-medium text-neutral-900 hover:text-neutral-700 focus-visible:outline-none focus-visible:underline"
          >
            {row.original.name}
          </Link>
        ),
      },
      {
        id: 'type',
        accessorKey: 'type',
        meta: {label: 'Type'},
        header: ({column}) => <SortableHeader column={column}>Type</SortableHeader>,
        cell: ({row}) => (
          <Badge className="capitalize" variant="neutral">
            {row.original.type.toLowerCase()}
          </Badge>
        ),
      },
      {
        id: 'subject',
        accessorKey: 'subject',
        meta: {label: 'Subject'},
        header: ({column}) => <SortableHeader column={column}>Subject</SortableHeader>,
        cell: ({row}) => (
          <p className="text-sm text-neutral-700 truncate" title={row.original.subject}>
            {row.original.subject}
          </p>
        ),
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
            <Button asChild variant="ghost" size="sm" title="Edit template">
              <Link href={`/templates/${row.original.id}`} aria-label="Edit template">
                <Edit className="h-4 w-4" />
              </Link>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              title="Duplicate template"
              aria-label="Duplicate template"
              onClick={() => handleDuplicate(row.original.id)}
            >
              <Copy className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              title="Delete template"
              aria-label="Delete template"
              onClick={() => {
                setTemplateToDelete(row.original.id);
                setShowDeleteDialog(true);
              }}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ),
      },
    ],
    // handleDuplicate is stable enough for this list — re-creating columns on every render
    // is cheap and avoids stale-closure bugs for the delete handler.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const table = useReactTable<Template>({
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
      <NextSeo title="Templates" />
      <DashboardLayout>
        <div className="space-y-6">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl sm:text-3xl font-bold text-neutral-900">Email Templates</h1>
              <p className="text-neutral-500 mt-2 text-sm sm:text-base">
                Create and manage reusable email templates for your campaigns and workflows.{' '}
                {data?.total ? `${data.total} total templates` : ''}
              </p>
            </div>
            <Button asChild className="w-full sm:w-auto">
              <Link href="/templates/create">
                <Plus className="h-4 w-4" />
                <span className="hidden sm:inline">Create Template</span>
                <span className="sm:hidden">Create</span>
              </Link>
            </Button>
          </div>

          {/* Search & Filters */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
              <Input
                type="text"
                placeholder="Search templates..."
                value={searchInput}
                onChange={e => setSearchInput(e.target.value)}
                className="pl-10 pr-10"
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
            <div className="flex gap-1.5 shrink-0">
              {(['ALL', 'MARKETING', 'TRANSACTIONAL', 'HEADLESS'] as const).map(type => (
                <Button
                  key={type}
                  type="button"
                  onClick={() => { setTypeFilter(type); setPage(1); }}
                  variant={typeFilter === type ? 'default' : 'secondary'}
                  size="sm"
                >
                  {type === 'ALL' ? 'All' : type.charAt(0) + type.slice(1).toLowerCase()}
                </Button>
              ))}
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

          {/* Templates */}
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
                    icon={FileText}
                    title={search ? 'No templates match' : 'No templates yet'}
                    description={search ? 'Try a different search term.' : 'Create reusable email designs for campaigns.'}
                    action={
                      !search ? (
                        <Button asChild>
                          <Link href="/templates/create">
                            <Plus className="h-4 w-4" />
                            Create Template
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
              {/* Card Grid View - rendered directly on the page background */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {data?.data.map(template => (
                      <Card
                        key={template.id}
                        className="transition-colors hover:border-neutral-300 flex flex-col [&:has([data-card-link]:focus-visible)]:ring-2 [&:has([data-card-link]:focus-visible)]:ring-ring [&:has([data-card-link]:focus-visible)]:ring-offset-2"
                      >
                        <Link
                          href={`/templates/${template.id}`}
                          data-card-link=""
                          className="flex-1 block p-6 pb-4 hover:bg-neutral-50/50 transition-colors rounded-t-xl focus-visible:outline-none"
                          aria-label={`Edit ${template.name}`}
                        >
                          <div className="flex items-start justify-between gap-3 mb-3">
                            <h3 className="font-semibold text-neutral-900 leading-snug">{template.name}</h3>
                            <Badge className="capitalize shrink-0 mt-0.5" variant="neutral">
                              {template.type.toLowerCase()}
                            </Badge>
                          </div>
                          <p className="text-sm font-medium text-neutral-700 truncate">{template.subject}</p>
                        </Link>
                        <div className="px-6 py-3 border-t border-neutral-100 flex items-center justify-between">
                          <div className="flex items-center gap-1.5 text-xs text-neutral-400">
                            <Calendar className="h-3 w-3" />
                            <div className="group relative inline-block cursor-help">
                              <span>Updated {formatRelativeTime(template.updatedAt)}</span>
                              <div className="hidden group-hover:block absolute z-10 w-48 p-2 bg-neutral-900 text-white text-xs rounded shadow-md bottom-full left-0 mb-1 whitespace-nowrap">
                                {dayjs(template.updatedAt).format('DD MMMM YYYY, hh:mm')}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            <Button asChild variant="ghost" size="sm" title="Edit template">
                              <Link href={`/templates/${template.id}`} aria-label="Edit template">
                                <Edit className="h-4 w-4" />
                              </Link>
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              title="Duplicate template"
                              aria-label="Duplicate template"
                              onClick={() => handleDuplicate(template.id)}
                            >
                              <Copy className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              title="Delete template"
                              aria-label="Delete template"
                              onClick={() => {
                                setTemplateToDelete(template.id);
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
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 px-6 py-4 border-t border-neutral-200">
                      <p className="text-xs sm:text-sm text-neutral-600 text-center sm:text-left">
                        Showing{' '}
                        <span className="font-medium text-neutral-900">{(page - 1) * data.pageSize + 1}</span> to{' '}
                        <span className="font-medium text-neutral-900">
                          {Math.min(page * data.pageSize, data.total)}
                        </span>{' '}
                        of <span className="font-medium text-neutral-900">{data.total}</span> templates
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
                                id === 'subject'
                                  ? 'px-6 py-4 max-w-xs'
                                  : id === 'actions'
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
                    {data?.data.map(template => (
                      <div
                        key={template.id}
                        className="border border-neutral-200 rounded-lg p-4 bg-white hover:bg-neutral-50 transition-colors"
                      >
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <Link
                            href={`/templates/${template.id}`}
                            className="text-sm font-semibold text-neutral-900 leading-snug flex-1 min-w-0 hover:text-neutral-700"
                          >
                            {template.name}
                          </Link>
                          <Badge className="capitalize shrink-0 mt-0.5" variant="neutral">
                            {template.type.toLowerCase()}
                          </Badge>
                        </div>
                        <p className="text-sm text-neutral-700 truncate mb-3">{template.subject}</p>
                        <div className="flex items-center justify-between">
                          <div className="group relative inline-block cursor-help">
                            <span className="text-xs text-neutral-500">
                              Updated {formatRelativeTime(template.updatedAt)}
                            </span>
                            <div className="hidden group-hover:block absolute z-10 w-48 p-2 bg-neutral-900 text-white text-xs rounded shadow-md bottom-full left-0 mb-1 whitespace-nowrap">
                              {dayjs(template.updatedAt).format('DD MMMM YYYY, hh:mm')}
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            <Button asChild variant="ghost" size="sm" title="Edit template">
                              <Link href={`/templates/${template.id}`} aria-label="Edit template">
                                <Edit className="h-4 w-4" />
                              </Link>
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              title="Duplicate template"
                              aria-label="Duplicate template"
                              onClick={() => handleDuplicate(template.id)}
                            >
                              <Copy className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              title="Delete template"
                              aria-label="Delete template"
                              onClick={() => {
                                setTemplateToDelete(template.id);
                                setShowDeleteDialog(true);
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
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
                        of <span className="font-medium text-neutral-900">{data.total}</span> templates
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
          title="Delete Template"
          description="Are you sure you want to delete this template? This action cannot be undone."
          confirmText="Delete"
          variant="destructive"
        />
      </DashboardLayout>
    </>
  );
}
