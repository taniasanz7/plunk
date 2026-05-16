import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Checkbox,
  ConfirmDialog,
  IconSpinner,
  Input,
  Label,
  StickySaveBar,
} from '@plunk/ui';
import type {Layout} from '@plunk/db';
import {DashboardLayout} from '../../components/DashboardLayout';
import {HtmlEditor} from '../../components/EmailEditor/HtmlEditor';
import {network} from '../../lib/network';
import {useChangeTracking} from '../../lib/hooks/useChangeTracking';
import {ArrowLeft, Save, Trash2, TriangleAlert} from 'lucide-react';
import Link from 'next/link';
import {NextSeo} from 'next-seo';
import {useRouter} from 'next/router';
import {useEffect, useMemo, useState} from 'react';
import {toast} from 'sonner';
import useSWR from 'swr';
import {LayoutSchemas} from '@plunk/shared';

export default function LayoutEditorPage() {
  const router = useRouter();
  const {id} = router.query;

  const {data: layout, mutate} = useSWR<Layout>(id ? `/layouts/${id}` : null, {
    revalidateOnFocus: false,
  });

  const [editedLayout, setEditedLayout] = useState<Partial<Layout>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  // Initialize edit fields when layout loads
  useEffect(() => {
    if (layout && Object.keys(editedLayout).length === 0) {
      setEditedLayout({
        name: layout.name,
        body: layout.body,
        isDefault: layout.isDefault,
      });
    }
  }, [layout, editedLayout]);

  const hasContentSlot = useMemo(
    () => /\{\{\s*contentSlot\s*\}\}/.test(editedLayout.body ?? ''),
    [editedLayout.body],
  );

  const hasChanges = useMemo(() => {
    if (!layout || Object.keys(editedLayout).length === 0) return false;
    return (
      editedLayout.name !== layout.name ||
      editedLayout.body !== layout.body ||
      (editedLayout.isDefault ?? false) !== layout.isDefault
    );
  }, [editedLayout, layout]);

  useChangeTracking(hasChanges);

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!hasContentSlot) {
      toast.error('Layout body must contain a {{contentSlot}} placeholder');
      return;
    }
    setIsSubmitting(true);

    try {
      await network.fetch<Layout, typeof LayoutSchemas.update>('PATCH', `/layouts/${id}`, {
        name: editedLayout.name,
        body: editedLayout.body,
        isDefault: editedLayout.isDefault ?? false,
      });

      void mutate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save layout');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    try {
      await network.fetch('DELETE', `/layouts/${id}`);
      toast.success('Layout deleted successfully');
      void router.push('/layouts');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete layout');
    }
  };

  if (!layout || Object.keys(editedLayout).length === 0) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <IconSpinner />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <NextSeo title={layout.name} />
      <div className={`space-y-6 ${hasChanges ? 'pb-32' : ''}`}>
        {/* Header */}
        <div className="flex items-center gap-3 sm:gap-4">
          <Button asChild variant="ghost" size="sm">
            <Link href="/layouts">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl sm:text-3xl font-bold text-neutral-900">Edit Layout</h1>
            <p className="text-neutral-500 mt-1 text-sm sm:text-base">
              {isSubmitting ? (
                'Saving...'
              ) : hasChanges ? (
                <span className="text-amber-600">Unsaved changes</span>
              ) : (
                'All changes saved'
              )}
            </p>
          </div>
        </div>

        <form onSubmit={handleSave} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Basic Information</CardTitle>
              <CardDescription>Name and default status</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">
                  Layout Name <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="name"
                  type="text"
                  value={editedLayout.name || ''}
                  onChange={e => setEditedLayout({...editedLayout, name: e.target.value})}
                  required
                  placeholder="Brand Master Template"
                />
              </div>

              <div className="flex items-center gap-2">
                <Checkbox
                  id="isDefault"
                  checked={editedLayout.isDefault ?? false}
                  onCheckedChange={checked => setEditedLayout({...editedLayout, isDefault: checked === true})}
                />
                <Label htmlFor="isDefault" className="text-sm font-normal cursor-pointer">
                  Use as project default (auto-applied to templates with no explicit layout)
                </Label>
              </div>
            </CardContent>
          </Card>

          <Card className="overflow-visible">
            <CardHeader>
              <CardTitle>Layout HTML</CardTitle>
              <CardDescription>
                Insert <code className="text-xs bg-neutral-100 px-1 py-0.5 rounded">{'{{contentSlot}}'}</code> where
                per-template content should appear. Other variables like{' '}
                <code className="text-xs bg-neutral-100 px-1 py-0.5 rounded">{'{{unsubscribeUrl}}'}</code> are
                rendered here too.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="border rounded-md overflow-hidden">
                <HtmlEditor
                  value={editedLayout.body || ''}
                  onChange={body => setEditedLayout({...editedLayout, body})}
                />
              </div>
              {!hasContentSlot && (
                <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 flex items-start gap-2">
                  <TriangleAlert className="h-3.5 w-3.5 text-amber-600 mt-0.5 shrink-0" />
                  <p className="text-xs text-amber-800 leading-relaxed">
                    Layout body must contain a{' '}
                    <code className="bg-amber-100 px-1 py-0.5 rounded font-mono">{'{{contentSlot}}'}</code>{' '}
                    placeholder, otherwise the template body has no place to render.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Actions */}
          <div className="flex justify-between gap-3">
            <Button type="button" variant="destructive" onClick={() => setShowDeleteDialog(true)}>
              <Trash2 className="h-4 w-4" />
              Delete Layout
            </Button>
            <Button type="submit" disabled={!hasChanges || isSubmitting || !hasContentSlot}>
              <Save className="h-4 w-4" />
              {isSubmitting ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </form>
      </div>

      <StickySaveBar status={isSubmitting ? 'saving' : hasChanges ? 'dirty' : 'idle'} onSave={handleSave} />

      <ConfirmDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        onConfirm={handleDelete}
        title="Delete Layout"
        description="Are you sure you want to delete this layout? Templates that reference it must be detached first."
        confirmText="Delete Layout"
        variant="destructive"
      />
    </DashboardLayout>
  );
}
