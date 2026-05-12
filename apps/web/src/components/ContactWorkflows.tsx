import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  ConfirmDialog,
  EmptyState,
  IconSpinner,
} from '@plunk/ui';
import type {WorkflowExecution} from '@plunk/db';
import dayjs from 'dayjs';
import {Workflow as WorkflowIcon} from 'lucide-react';
import Link from 'next/link';
import {useState} from 'react';
import {toast} from 'sonner';
import useSWR from 'swr';

import {network} from '../lib/network';

type ContactExecutionRow = WorkflowExecution & {
  workflow: {id: string; name: string};
  currentStep?: {id: string; name: string; type: string} | null;
};

interface PaginatedExecutions {
  executions: ContactExecutionRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

const ACTIVE_STATUSES = new Set(['RUNNING', 'WAITING']);
const HISTORY_STATUSES = new Set(['COMPLETED', 'EXITED', 'CANCELLED', 'FAILED']);

interface ContactWorkflowsProps {
  contactId: string;
}

export function ContactWorkflows({contactId}: ContactWorkflowsProps) {
  // Fetch a reasonable batch — most contacts will have a handful of executions.
  // We split client-side into active vs history so we don't need two requests.
  const {data, isLoading, mutate} = useSWR<PaginatedExecutions>(
    contactId ? `/contacts/${contactId}/executions?page=1&pageSize=50` : null,
    {revalidateOnFocus: false},
  );

  const [pendingCancelId, setPendingCancelId] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const executions = data?.executions ?? [];
  const active = executions.filter(e => ACTIVE_STATUSES.has(e.status));
  const history = executions.filter(e => HISTORY_STATUSES.has(e.status));
  const pendingExecution = pendingCancelId ? executions.find(e => e.id === pendingCancelId) : undefined;

  const handleCancel = async () => {
    if (!pendingExecution) {
      return;
    }
    setCancelling(true);
    try {
      await network.fetch(
        'DELETE',
        `/workflows/${pendingExecution.workflow.id}/executions/${pendingExecution.id}`,
      );
      toast.success('Workflow cancelled');
      setPendingCancelId(null);
      void mutate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to cancel workflow');
    } finally {
      setCancelling(false);
    }
  };

  const statusBadge = (status: WorkflowExecution['status']) => {
    const variant: 'default' | 'success' | 'destructive' | 'warning' | 'neutral' =
      status === 'COMPLETED'
        ? 'success'
        : status === 'FAILED'
          ? 'destructive'
          : status === 'WAITING'
            ? 'warning'
            : status === 'RUNNING'
              ? 'default'
              : 'neutral';
    return <Badge variant={variant}>{status}</Badge>;
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Workflows</CardTitle>
          <CardDescription>Workflow executions this contact is in or has completed</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-6">
              <IconSpinner />
            </div>
          ) : executions.length === 0 ? (
            <EmptyState
              icon={WorkflowIcon}
              title="No workflow executions"
              description="This contact hasn't entered any workflows yet."
            />
          ) : (
            <>
              <section>
                <h3 className="text-sm font-medium text-neutral-900 mb-2">
                  Active{active.length > 0 ? ` (${active.length})` : ''}
                </h3>
                {active.length === 0 ? (
                  <p className="text-sm text-neutral-500">No active workflows.</p>
                ) : (
                  <div className="overflow-x-auto rounded-md border border-neutral-200">
                    <table className="w-full">
                      <thead className="bg-neutral-50 border-b border-neutral-200">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                            Workflow
                          </th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                            Status
                          </th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                            Current Step
                          </th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                            Started
                          </th>
                          <th className="px-4 py-2 text-right text-xs font-medium text-neutral-500 uppercase tracking-wider">
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-neutral-200">
                        {active.map(execution => (
                          <tr key={execution.id} className="hover:bg-neutral-50 transition-colors">
                            <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-neutral-900">
                              <Link
                                href={`/workflows/${execution.workflow.id}`}
                                className="text-neutral-900 hover:underline"
                              >
                                {execution.workflow.name}
                              </Link>
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">{statusBadge(execution.status)}</td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-neutral-500">
                              {execution.currentStep?.name ?? '-'}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-neutral-500">
                              <div className="group relative inline-block cursor-help">
                                {dayjs(execution.startedAt).fromNow()}
                                <div className="hidden group-hover:block absolute z-10 w-48 p-2 bg-neutral-900 text-white text-xs rounded shadow-md bottom-full left-1/2 transform -translate-x-1/2 mb-1 whitespace-nowrap">
                                  {dayjs(execution.startedAt).format('DD MMMM YYYY, hh:mm')}
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-right text-sm font-medium">
                              <Button
                                variant="destructiveGhost"
                                size="sm"
                                onClick={() => setPendingCancelId(execution.id)}
                              >
                                Cancel
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              <section>
                <h3 className="text-sm font-medium text-neutral-900 mb-2">
                  History{history.length > 0 ? ` (${history.length})` : ''}
                </h3>
                {history.length === 0 ? (
                  <p className="text-sm text-neutral-500">No completed or cancelled workflows.</p>
                ) : (
                  <div className="overflow-x-auto rounded-md border border-neutral-200">
                    <table className="w-full">
                      <thead className="bg-neutral-50 border-b border-neutral-200">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                            Workflow
                          </th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                            Status
                          </th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                            Started
                          </th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                            Completed
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-neutral-200">
                        {history.map(execution => (
                          <tr key={execution.id} className="hover:bg-neutral-50 transition-colors">
                            <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-neutral-900">
                              <Link
                                href={`/workflows/${execution.workflow.id}`}
                                className="text-neutral-900 hover:underline"
                              >
                                {execution.workflow.name}
                              </Link>
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">{statusBadge(execution.status)}</td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-neutral-500">
                              <div className="group relative inline-block cursor-help">
                                {dayjs(execution.startedAt).fromNow()}
                                <div className="hidden group-hover:block absolute z-10 w-48 p-2 bg-neutral-900 text-white text-xs rounded shadow-md bottom-full left-1/2 transform -translate-x-1/2 mb-1 whitespace-nowrap">
                                  {dayjs(execution.startedAt).format('DD MMMM YYYY, hh:mm')}
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-neutral-500">
                              {execution.completedAt ? (
                                <div className="group relative inline-block cursor-help">
                                  {dayjs(execution.completedAt).fromNow()}
                                  <div className="hidden group-hover:block absolute z-10 w-48 p-2 bg-neutral-900 text-white text-xs rounded shadow-md bottom-full left-1/2 transform -translate-x-1/2 mb-1 whitespace-nowrap">
                                    {dayjs(execution.completedAt).format('DD MMMM YYYY, hh:mm')}
                                  </div>
                                </div>
                              ) : (
                                '-'
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={pendingCancelId !== null}
        onOpenChange={open => {
          if (!open) {
            setPendingCancelId(null);
          }
        }}
        onConfirm={handleCancel}
        title="Cancel Workflow"
        description={
          pendingExecution ? (
            <div className="space-y-2">
              <p>
                Are you sure you want to cancel <strong>{pendingExecution.workflow.name}</strong> for this contact?
              </p>
              <p className="text-sm text-neutral-600">
                The contact will not receive any remaining emails or actions from this workflow. This action cannot be
                undone.
              </p>
            </div>
          ) : (
            'Are you sure you want to cancel this workflow?'
          )
        }
        confirmText="Cancel Workflow"
        cancelText="Keep Running"
        variant="destructive"
        status={cancelling ? 'loading' : 'idle'}
      />
    </>
  );
}
