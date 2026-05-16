import {Input} from '@plunk/ui';
import {X} from 'lucide-react';
import {useCallback, useState} from 'react';

interface TagInputProps {
  /** Currently selected tags */
  value: string[];
  /** Called with the new list (already normalized + de-duplicated) when tags change */
  onChange: (next: string[]) => void;
  /** Optional id for the underlying input (so a <Label> can target it) */
  id?: string;
  /** Placeholder for the input. Defaults to "Add a tag and press Enter" */
  placeholder?: string;
  /** Maximum length of a single tag. Defaults to 50 (matches the Zod schema). */
  maxTagLength?: number;
}

/**
 * Chip-style tag editor.
 *
 * - Press Enter or comma to add the current input as a new tag.
 * - Click the X on a chip to remove it.
 * - Press Backspace with an empty input to remove the last chip.
 * - Whitespace is trimmed; duplicates are silently ignored.
 */
export function TagInput({value, onChange, id, placeholder, maxTagLength = 50}: TagInputProps) {
  const [draft, setDraft] = useState('');

  const addTag = useCallback(
    (raw: string) => {
      const trimmed = raw.trim().slice(0, maxTagLength);
      if (!trimmed) return;
      if (value.includes(trimmed)) {
        setDraft('');
        return;
      }
      onChange([...value, trimmed]);
      setDraft('');
    },
    [value, onChange, maxTagLength],
  );

  const removeTag = useCallback(
    (tag: string) => {
      onChange(value.filter(t => t !== tag));
    },
    [value, onChange],
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag(draft);
    } else if (e.key === 'Backspace' && draft === '' && value.length > 0) {
      // Remove the last chip on backspace when the input is empty
      e.preventDefault();
      const last = value[value.length - 1];
      if (last !== undefined) {
        removeTag(last);
      }
    }
  };

  const handleBlur = () => {
    // Convert any leftover text into a tag when the user clicks away.
    if (draft.trim()) {
      addTag(draft);
    }
  };

  return (
    <div className="flex min-h-9 flex-wrap items-center gap-1.5 rounded-md border border-neutral-200 bg-white px-2 py-1 focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
      {value.map(tag => (
        <span
          key={tag}
          className="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-700"
        >
          {tag}
          <button
            type="button"
            aria-label={`Remove tag ${tag}`}
            onClick={() => removeTag(tag)}
            className="rounded-full text-neutral-400 hover:text-neutral-900 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      <Input
        id={id}
        type="text"
        value={draft}
        onChange={e => setDraft(e.target.value.slice(0, maxTagLength))}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        placeholder={placeholder ?? 'Add a tag and press Enter'}
        className="h-7 flex-1 min-w-[140px] border-0 px-1 py-0 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
      />
    </div>
  );
}
