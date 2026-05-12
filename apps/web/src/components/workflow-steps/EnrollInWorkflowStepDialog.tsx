import {Label, Textarea} from '@plunk/ui';
import {useState} from 'react';
import {toast} from 'sonner';

import {WorkflowSearchPicker} from '../WorkflowSearchPicker';

import {type EditStepDialogProps, getStepConfig, StepDialogShell, useStepUpdate} from './shared';

export function EnrollInWorkflowStepDialog({step, workflowId, open, onOpenChange, onSuccess}: EditStepDialogProps) {
  const config = getStepConfig(step);

  const initialWorkflowId = typeof config.workflowId === 'string' ? config.workflowId : '';
  const initialEventData =
    config.eventData && typeof config.eventData === 'object' && !Array.isArray(config.eventData)
      ? JSON.stringify(config.eventData, null, 2)
      : '';

  const [name, setName] = useState(step.name);
  const [targetWorkflowId, setTargetWorkflowId] = useState(initialWorkflowId);
  const [targetWorkflowName, setTargetWorkflowName] = useState<string>('');
  const [eventDataText, setEventDataText] = useState(initialEventData);

  const {update, isSubmitting} = useStepUpdate(workflowId, step.id);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!targetWorkflowId) {
      toast.error('Please select a workflow to enroll the contact in');
      return;
    }

    let eventData: Record<string, unknown> | undefined;
    if (eventDataText.trim()) {
      try {
        const parsed = JSON.parse(eventDataText);
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
          toast.error('Event data must be a JSON object');
          return;
        }
        eventData = parsed as Record<string, unknown>;
      } catch {
        toast.error('Event data is not valid JSON');
        return;
      }
    }

    const ok = await update({
      name,
      config: {
        workflowId: targetWorkflowId,
        ...(eventData ? {eventData} : {}),
      },
    });

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
      <div className="space-y-4">
        <div>
          <Label htmlFor="editEnrollWorkflow">Workflow</Label>
          <p className="text-xs text-neutral-500 mt-0.5 mb-1.5">
            The contact will be enrolled in this workflow. The target workflow&apos;s{' '}
            <span className="font-mono">allowReentry</span> setting still applies.
          </p>
          <WorkflowSearchPicker
            value={targetWorkflowId}
            initialName={targetWorkflowName || undefined}
            excludeWorkflowId={workflowId}
            onChange={(id, wfName) => {
              setTargetWorkflowId(id);
              setTargetWorkflowName(wfName);
            }}
          />
        </div>

        <div>
          <Label htmlFor="editEnrollEventData">Event Data (optional)</Label>
          <p className="text-xs text-neutral-500 mt-0.5 mb-1.5">
            Optional JSON object merged on top of the current execution&apos;s context (addressable as{' '}
            <span className="font-mono">{'{{key}}'}</span> in templates). Keys you provide here override matching keys
            from the trigger event.
          </p>
          <Textarea
            id="editEnrollEventData"
            value={eventDataText}
            onChange={e => setEventDataText(e.target.value)}
            placeholder={'{\n  "courseId": "intro-101"\n}'}
            className="mt-1.5 font-mono text-xs min-h-[120px]"
          />
        </div>
      </div>
    </StepDialogShell>
  );
}
