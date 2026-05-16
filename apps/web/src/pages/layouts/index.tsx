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
import type {Layout} from '@plunk/db';
import type {PaginatedResponse} from '@plunk/types';
import {DashboardLayout} from '../../components/DashboardLayout';
import {network} from '../../lib/network';
import {formatRelativeTime} from '../../lib/dateUtils';
import {Calendar, Edit, LayoutPanelTop, Plus, Search, Trash2, X} from 'lucide-react';
import {NextSeo} from 'next-seo';
import Link from 'next/link';
import {useEffect, useState} from 'react';
import {toast} from 'sonner';
import useSWR from 'swr';
import dayjs from 'dayjs';

export default function LayoutsPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [layoutToDelete, setLayoutToDelete] = useState<string | null>(null);

  const {data, mutate, isLoading} = useSWR<PaginatedResponse<Layout>>(
    `/layouts?page=${page}&pageSize=20${search ? `&search=${search}` : ''}`,
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
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
              <Input
                type="text"
                placeholder="Search layouts..."
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
            ) : data?.data.length === 0 ? (
              <Card>
                <CardContent>
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
                </CardContent>
              </Card>
            ) : (
              <>
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
