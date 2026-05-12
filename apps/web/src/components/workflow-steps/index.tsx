import {ConditionStepDialog} from './ConditionStepDialog';
import {DelayStepDialog} from './DelayStepDialog';
import {EnrollInWorkflowStepDialog} from './EnrollInWorkflowStepDialog';
import {ExitStepDialog} from './ExitStepDialog';
import {RemoveFromWorkflowStepDialog} from './RemoveFromWorkflowStepDialog';
import {SendEmailStepDialog} from './SendEmailStepDialog';
import {UpdateContactStepDialog} from './UpdateContactStepDialog';
import {WaitForEventStepDialog} from './WaitForEventStepDialog';
import {WebhookStepDialog} from './WebhookStepDialog';
import {type EditStepDialogProps} from './shared';

export function EditStepDialog(props: EditStepDialogProps) {
  switch (props.step.type) {
    case 'SEND_EMAIL':
      return <SendEmailStepDialog {...props} />;
    case 'DELAY':
      return <DelayStepDialog {...props} />;
    case 'CONDITION':
      return <ConditionStepDialog {...props} />;
    case 'WAIT_FOR_EVENT':
      return <WaitForEventStepDialog {...props} />;
    case 'WEBHOOK':
      return <WebhookStepDialog {...props} />;
    case 'UPDATE_CONTACT':
      return <UpdateContactStepDialog {...props} />;
    case 'ENROLL_IN_WORKFLOW':
      return <EnrollInWorkflowStepDialog {...props} />;
    case 'REMOVE_FROM_WORKFLOW':
      return <RemoveFromWorkflowStepDialog {...props} />;
    case 'EXIT':
      return <ExitStepDialog {...props} />;
    default:
      return null;
  }
}
