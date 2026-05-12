import {Input} from '@plunk/ui';
import type {Workflow} from '@plunk/db';
import type {PaginatedResponse} from '@plunk/types';
import {Command, CommandGroup, CommandItem, CommandList} from '@plunk/ui';
import {ChevronDown} from 'lucide-react';
import {useCallback, useRef, useState} from 'react';
import useSWR from 'swr';

interface WorkflowSearchPickerProps {
  /** Currently selected workflow ID */
  value: string;
  /** Display name for the pre-selected workflow (avoids a fetch just to show the name) */
  initialName?: string;
  /** Optionally exclude one workflow from results (e.g. the current workflow being edited) */
  excludeWorkflowId?: string;
  onChange: (id: string, name: string) => void;
}

/**
 * Inline combobox for picking a workflow.
 * Fires a debounced server-side search (/workflows?search=…&pageSize=20)
 * so it works correctly regardless of how many workflows exist.
 */
export function WorkflowSearchPicker({value, initialName, excludeWorkflowId, onChange}: WorkflowSearchPickerProps) {
  const [query, setQuery] = useState(initialName ?? '');
  const [prevInitialName, setPrevInitialName] = useState(initialName);
  const [selectedName, setSelectedName] = useState(initialName ?? '');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  if (initialName !== prevInitialName) {
    setPrevInitialName(initialName);
    setQuery(initialName ?? '');
    if (initialName) setSelectedName(initialName);
  }

  const handleInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    setOpen(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedQuery(val), 300);
  }, []);

  const {data, isLoading} = useSWR<PaginatedResponse<Workflow>>(
    open || debouncedQuery
      ? `/workflows?pageSize=20${debouncedQuery ? `&search=${encodeURIComponent(debouncedQuery)}` : ''}`
      : null,
    {revalidateOnFocus: false},
  );

  const filtered = (data?.data ?? []).filter(w => w.id !== excludeWorkflowId);

  // When closed, show the selected workflow's name rather than the raw query
  const displayValue = open
    ? query
    : (value ? (filtered.find(w => w.id === value)?.name ?? selectedName ?? initialName ?? '') : '');

  return (
    <div className="relative">
      <Input
        type="text"
        value={displayValue}
        onChange={handleInput}
        onFocus={() => {
          setOpen(true);
          setDebouncedQuery(query);
        }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Search workflows…"
        autoComplete="off"
        className="pr-8"
      />
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />

      {open && (
        <div className="absolute z-50 w-full mt-1 rounded-md border border-neutral-200 bg-white shadow-md max-h-60 overflow-y-auto">
          {isLoading ? (
            <div className="px-3 py-2 text-sm text-neutral-500">Searching…</div>
          ) : !filtered.length ? (
            <div className="px-3 py-2 text-sm text-neutral-500">No workflows found</div>
          ) : (
            <Command>
              <CommandList>
                <CommandGroup>
                  {filtered.map(w => (
                    <CommandItem
                      key={w.id}
                      value={w.id}
                      onSelect={() => {
                        onChange(w.id, w.name);
                        setQuery(w.name);
                        setSelectedName(w.name);
                        setOpen(false);
                      }}
                    >
                      <span className="flex-1 truncate">{w.name}</span>
                      {!w.enabled && (
                        <span className="ml-2 text-xs text-neutral-400 shrink-0">disabled</span>
                      )}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          )}
          {(data?.total ?? 0) > 20 && (
            <div className="px-3 py-1.5 text-xs text-neutral-400 border-t border-neutral-100">
              Showing 20 of {data!.total} — type to narrow results
            </div>
          )}
        </div>
      )}
    </div>
  );
}
