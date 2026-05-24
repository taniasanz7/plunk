import {Button, Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, Label} from '@plunk/ui';
import {useEffect, useState} from 'react';
import {toast} from 'sonner';

import {TagInput} from './TagInput';

interface BulkTagDialogProps {
  /** Which operation to run, or null to keep the dialog closed. */
  mode: 'add' | 'remove' | null;
  /** Close the dialog (clears `mode` in the parent). */
  onClose: () => void;
  /** Number of items the operation applies to (shown in the copy). */
  selectedCount: number;
  /** Singular noun for the item type (e.g. "template"). Pluralized with a trailing 's'. */
  itemNoun: string;
  /**
   * Applies the tags. Resolves on success (the parent refreshes its list +
   * tag-options SWR). Rejects on failure so we can surface a toast and keep the
   * dialog open.
   */
  onApply: (mode: 'add' | 'remove', tags: string[]) => Promise<void>;
}

/**
 * Tag add/remove dialog for the bulk action bar. A single dialog drives both
 * modes — the title/CTA flip on `mode`. The tag chips are collected with the
 * same `TagInput` used in the editors so the entry UX is consistent.
 */
export function BulkTagDialog({mode, onClose, selectedCount, itemNoun, onApply}: BulkTagDialogProps) {
  const [tags, setTags] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Reset the draft tags whenever the dialog (re)opens.
  useEffect(() => {
    if (mode) setTags([]);
  }, [mode]);

  const noun = selectedCount === 1 ? itemNoun : `${itemNoun}s`;
  const isAdd = mode === 'add';

  const handleApply = async () => {
    if (!mode || tags.length === 0) return;
    setIsSubmitting(true);
    try {
      await onApply(mode, tags);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update tags');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={mode !== null} onOpenChange={open => (open ? undefined : onClose())}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle>
            {isAdd ? 'Add tags' : 'Remove tags'} · {selectedCount} {noun}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="bulkTags">Tags</Label>
          <TagInput id="bulkTags" value={tags} onChange={setTags} placeholder="Press Enter to add" />
          <p className="text-xs text-neutral-500">
            {isAdd
              ? `These tags will be added to all ${selectedCount} selected ${noun}.`
              : `These tags will be removed from all ${selectedCount} selected ${noun} (if present).`}
          </p>
        </div>
        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting} className="w-full sm:w-auto">
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleApply}
            disabled={isSubmitting || tags.length === 0}
            className="w-full sm:w-auto"
          >
            {isSubmitting ? 'Saving…' : isAdd ? 'Add tags' : 'Remove tags'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
