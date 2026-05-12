import {Label} from '@plunk/ui';
import {useState} from 'react';
import {toast} from 'sonner';

import {WorkflowSearchPicker} from '../WorkflowSearchPicker';

import {type EditStepDialogProps, getStepConfig, StepDialogShell, useStepUpdate} from './shared';

export function RemoveFromWorkflowStepDialog({step, workflowId, open, onOpenChange, onSuccess}: EditStepDialogProps) {
  const config = getStepConfig(step);
  const initialWorkflowId = typeof config.workflowId === 'string' ? config.workflowId : '';
  const [name, setName] = useState(step.name);
  const [targetWorkflowId, setTargetWorkflowId] = useState(initialWorkflowId);
  const [targetWorkflowName, setTargetWorkflowName] = useState(step.targetWorkflow?.name ?? '');
  const {update, isSubmitting} = useStepUpdate(workflowId, step.id);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetWorkflowId) {
      toast.error('Please select a workflow to remove the contact from');
      return;
    }

    const ok = await update({name, config: {workflowId: targetWorkflowId}});
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
      <div>
        <Label htmlFor="editRemoveWorkflow">Workflow</Label>
        <p className="text-xs text-neutral-500 mt-0.5 mb-1.5">
          Active executions for this contact in the selected workflow will be cancelled. This workflow continues.
        </p>
        <WorkflowSearchPicker
          value={targetWorkflowId}
          initialName={targetWorkflowName || undefined}
          excludeWorkflowId={workflowId}
          onChange={(id, workflowName) => {
            setTargetWorkflowId(id);
            setTargetWorkflowName(workflowName);
          }}
        />
      </div>
    </StepDialogShell>
  );
}
