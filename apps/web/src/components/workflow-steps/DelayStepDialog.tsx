import {
  Checkbox,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@plunk/ui';
import {useState} from 'react';
import {toast} from 'sonner';

import {type EditStepDialogProps, getStepConfig, StepDialogShell, useStepUpdate} from './shared';

type DelayUnit = 'minutes' | 'hours' | 'days';
type DelayMode = 'relative' | 'localTime';

const MAX_DELAY_BY_UNIT: Record<DelayUnit, number> = {
  minutes: 525600,
  hours:   8760,
  days:    365,
};

// ISO 8601: 1 = Mon, ..., 7 = Sun.
const WEEKDAYS: {iso: number; short: string; long: string}[] = [
  {iso: 1, short: 'Mon', long: 'Monday'},
  {iso: 2, short: 'Tue', long: 'Tuesday'},
  {iso: 3, short: 'Wed', long: 'Wednesday'},
  {iso: 4, short: 'Thu', long: 'Thursday'},
  {iso: 5, short: 'Fri', long: 'Friday'},
  {iso: 6, short: 'Sat', long: 'Saturday'},
  {iso: 7, short: 'Sun', long: 'Sunday'},
];

function isDelayUnit(value: unknown): value is DelayUnit {
  return value === 'minutes' || value === 'hours' || value === 'days';
}

function isLocalTimeConfig(config: Record<string, unknown>): boolean {
  return config.type === 'localTime';
}

function clampInt(value: string, min: number, max: number): number | null {
  const n = parseInt(value, 10);
  if (Number.isNaN(n) || n < min || n > max) return null;
  return n;
}

export function DelayStepDialog({step, workflowId, open, onOpenChange, onSuccess}: EditStepDialogProps) {
  const config = getStepConfig(step);
  const initialMode: DelayMode = isLocalTimeConfig(config) ? 'localTime' : 'relative';

  const [name, setName] = useState(step.name);
  const [mode, setMode] = useState<DelayMode>(initialMode);

  // Relative delay state
  const [delayAmount, setDelayAmount] = useState(String(config.amount ?? '24'));
  const [delayUnit, setDelayUnit] = useState<DelayUnit>(isDelayUnit(config.unit) ? config.unit : 'hours');

  // Local-time state — preserves what was stored even if user toggles modes
  const initialHour = typeof config.hour === 'number' ? config.hour : 9;
  const initialMinute = typeof config.minute === 'number' ? config.minute : 0;
  const initialDays = Array.isArray(config.allowedDaysOfWeek)
    ? (config.allowedDaysOfWeek as unknown[]).filter((d): d is number => typeof d === 'number')
    : [];
  const [localHour, setLocalHour] = useState(String(initialHour).padStart(2, '0'));
  const [localMinute, setLocalMinute] = useState(String(initialMinute).padStart(2, '0'));
  const [allowedDays, setAllowedDays] = useState<number[]>(initialDays);

  const {update, isSubmitting} = useStepUpdate(workflowId, step.id);

  const toggleDay = (iso: number) => {
    setAllowedDays(prev => (prev.includes(iso) ? prev.filter(d => d !== iso) : [...prev, iso].sort()));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    let nextConfig: Record<string, unknown>;

    if (mode === 'relative') {
      const amount = parseInt(delayAmount, 10);
      if (!Number.isFinite(amount) || amount < 1) {
        toast.error('Delay amount must be a positive integer');
        return;
      }
      if (amount > MAX_DELAY_BY_UNIT[delayUnit]) {
        toast.error(`Delay cannot exceed 365 days (${MAX_DELAY_BY_UNIT[delayUnit]} ${delayUnit})`);
        return;
      }
      nextConfig = {amount, unit: delayUnit};
    } else {
      const hour = clampInt(localHour, 0, 23);
      const minute = clampInt(localMinute, 0, 59);
      if (hour === null) {
        toast.error('Hour must be 0–23');
        return;
      }
      if (minute === null) {
        toast.error('Minute must be 0–59');
        return;
      }
      nextConfig = {
        type: 'localTime',
        hour,
        minute,
        ...(allowedDays.length > 0 ? {allowedDaysOfWeek: allowedDays} : {}),
      };
    }

    const ok = await update({name, config: nextConfig});
    if (ok) {
      onOpenChange(false);
      onSuccess();
    }
  };

  return (
    <StepDialogShell
      step={step}
      open={open}
      onOpenChange={onOpenChange}
      name={name}
      onNameChange={setName}
      onSubmit={handleSubmit}
      isSubmitting={isSubmitting}
    >
      {/* Mode selector */}
      <div>
        <Label>Delay type</Label>
        <div className="mt-1.5 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setMode('relative')}
            className={`min-h-[40px] px-3 py-2 rounded-lg border text-sm text-left transition-colors ${
              mode === 'relative'
                ? 'border-neutral-900 bg-neutral-50 text-neutral-900 font-medium'
                : 'border-neutral-200 text-neutral-700 hover:border-neutral-400 hover:text-neutral-900'
            }`}
          >
            After a delay
          </button>
          <button
            type="button"
            onClick={() => setMode('localTime')}
            className={`min-h-[40px] px-3 py-2 rounded-lg border text-sm text-left transition-colors ${
              mode === 'localTime'
                ? 'border-neutral-900 bg-neutral-50 text-neutral-900 font-medium'
                : 'border-neutral-200 text-neutral-700 hover:border-neutral-400 hover:text-neutral-900'
            }`}
          >
            At a local time
          </button>
        </div>
      </div>

      {mode === 'relative' ? (
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="editDelayAmount">Amount</Label>
            <Input
              id="editDelayAmount"
              type="number"
              value={delayAmount}
              onChange={e => setDelayAmount(e.target.value)}
              required
              min="1"
              max={MAX_DELAY_BY_UNIT[delayUnit]}
              className="mt-1.5"
            />
          </div>
          <div>
            <Label htmlFor="editDelayUnit">Unit</Label>
            <Select value={delayUnit} onValueChange={value => setDelayUnit(value as DelayUnit)}>
              <SelectTrigger id="editDelayUnit" className="mt-1.5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="minutes">Minutes</SelectItem>
                <SelectItem value="hours">Hours</SelectItem>
                <SelectItem value="days">Days</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="editLocalHour">Hour (0–23)</Label>
              <Input
                id="editLocalHour"
                type="number"
                value={localHour}
                onChange={e => setLocalHour(e.target.value)}
                required
                min="0"
                max="23"
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="editLocalMinute">Minute (0–59)</Label>
              <Input
                id="editLocalMinute"
                type="number"
                value={localMinute}
                onChange={e => setLocalMinute(e.target.value)}
                required
                min="0"
                max="59"
                className="mt-1.5"
              />
            </div>
          </div>

          <div>
            <Label>Only on these days (optional)</Label>
            <div className="mt-1.5 grid grid-cols-7 gap-2">
              {WEEKDAYS.map(({iso, short, long}) => (
                <label
                  key={iso}
                  className="flex flex-col items-center gap-1 px-2 py-2 rounded-lg border border-neutral-200 hover:border-neutral-400 cursor-pointer text-xs"
                  title={long}
                >
                  <Checkbox
                    checked={allowedDays.includes(iso)}
                    onCheckedChange={() => toggleDay(iso)}
                  />
                  <span>{short}</span>
                </label>
              ))}
            </div>
            <p className="mt-1.5 text-xs text-neutral-500">
              Leave all unchecked to fire at the next matching hour and minute on any day.
            </p>
          </div>

          <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs text-neutral-600">
            Time is per-recipient in <strong>Contact.timezone</strong>. Contacts without a timezone fall back to UTC.
          </div>
        </div>
      )}
    </StepDialogShell>
  );
}
