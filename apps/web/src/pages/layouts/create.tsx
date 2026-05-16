import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Checkbox,
  Input,
  Label,
} from '@plunk/ui';
import {NextSeo} from 'next-seo';
import {DashboardLayout} from '../../components/DashboardLayout';
import {HtmlEditor} from '../../components/EmailEditor/HtmlEditor';
import {network} from '../../lib/network';
import {ArrowLeft, TriangleAlert} from 'lucide-react';
import Link from 'next/link';
import {useRouter} from 'next/router';
import {useState} from 'react';
import {toast} from 'sonner';
import {LayoutSchemas} from '@plunk/shared';

const DEFAULT_LAYOUT_BODY = `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
  </head>
  <body style="margin:0;padding:0;background:#f6f7f9;font-family:ui-sans-serif,system-ui,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f7f9;">
      <tr>
        <td align="center">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;padding:32px;border-radius:8px;">
            <tr>
              <td>
                {{contentSlot}}
              </td>
            </tr>
            <tr>
              <td style="padding-top:24px;border-top:1px solid #e5e7eb;color:#9ca3af;font-size:12px;">
                You're receiving this email because you subscribed.
                <a href="{{unsubscribeUrl}}">Unsubscribe</a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

export default function CreateLayoutPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [body, setBody] = useState(DEFAULT_LAYOUT_BODY);
  const [isDefault, setIsDefault] = useState(false);
  const [saving, setSaving] = useState(false);

  const hasContentSlot = /\{\{\s*contentSlot\s*\}\}/.test(body);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      toast.error('Name is required');
      return;
    }
    if (!body.trim()) {
      toast.error('Layout body is required');
      return;
    }
    if (!hasContentSlot) {
      toast.error('Layout body must contain a {{contentSlot}} placeholder');
      return;
    }

    setSaving(true);

    try {
      const layout = await network.fetch<{id: string}, typeof LayoutSchemas.create>('POST', '/layouts', {
        name,
        body,
        isDefault,
      });

      toast.success('Layout created successfully');
      void router.push(`/layouts/${layout.id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create layout');
      setSaving(false);
    }
  };

  return (
    <>
      <NextSeo title="Create Layout" />
      <DashboardLayout>
        <div className="space-y-6">
          {/* Header */}
          <div className="flex items-center gap-3 sm:gap-4">
            <Button asChild variant="ghost" size="sm">
              <Link href="/layouts">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl sm:text-3xl font-bold text-neutral-900">Create Layout</h1>
              <p className="text-neutral-500 mt-1 text-sm sm:text-base">
                Create a master template scaffold that wraps your templates.
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Basic Information</CardTitle>
                <CardDescription>Name your layout</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">
                    Layout Name <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="name"
                    type="text"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    required
                    placeholder="Brand Master Template"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <Checkbox
                    id="isDefault"
                    checked={isDefault}
                    onCheckedChange={checked => setIsDefault(checked === true)}
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
                  Paste your master template HTML. Insert{' '}
                  <code className="text-xs bg-neutral-100 px-1 py-0.5 rounded">{'{{contentSlot}}'}</code> where the
                  per-template content should appear. Variables like{' '}
                  <code className="text-xs bg-neutral-100 px-1 py-0.5 rounded">{'{{unsubscribeUrl}}'}</code> render
                  here too.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="border rounded-md overflow-hidden">
                  <HtmlEditor value={body} onChange={setBody} />
                </div>
                {!hasContentSlot && body.length > 0 && (
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

            <div className="flex justify-end gap-3">
              <Button asChild variant="outline">
                <Link href="/layouts">Cancel</Link>
              </Button>
              <Button type="submit" disabled={saving || !hasContentSlot}>
                {saving ? 'Creating...' : 'Create Layout'}
              </Button>
            </div>
          </form>
        </div>
      </DashboardLayout>
    </>
  );
}
