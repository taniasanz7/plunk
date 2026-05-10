/**
 * Patch #11 — workflow DELAY localTime variant tests.
 *
 * The DELAY step accepts a new variant alongside the legacy {amount, unit} shape:
 *   {type: "localTime", hour: 7, minute: 0, allowedDaysOfWeek: [1]}
 *
 * Numbering follows ISO 8601: 1=Monday, ..., 7=Sunday — matching the
 * Dittofeed `LocalTime{hour, minute, allowedDaysOfWeek}` semantics from
 * `dittofeed_inventory/migration_notes.md`.
 *
 * The executor reads the contact's IANA Contact.timezone (null => UTC), computes the
 * next instant matching HH:MM constrained to the allowed weekdays, and queues the next
 * workflow step with the resulting BullMQ `delay`.
 */

import {beforeEach, describe, expect, it, vi} from 'vitest';

import {StepExecutionStatus, WorkflowExecutionStatus, WorkflowStepType} from '@plunk/db';
import {WorkflowStepConfigSchemas} from '@plunk/shared';

import {QueueService} from '../QueueService';
import {WorkflowExecutionService} from '../WorkflowExecutionService';
import {factories, getPrismaClient} from '../../../../../test/helpers';

describe('WorkflowExecutionService — DELAY localTime variant (Patch #11)', () => {
  let projectId: string;
  const prisma = getPrismaClient();

  beforeEach(async () => {
    const {project} = await factories.createUserWithProject();
    projectId = project.id;
  });

  describe('schema parsing', () => {
    it('accepts the legacy absolute shape unchanged', () => {
      const ok = WorkflowStepConfigSchemas.delay.safeParse({amount: 24, unit: 'hours'});
      expect(ok.success).toBe(true);
    });

    it('accepts the localTime shape', () => {
      const ok = WorkflowStepConfigSchemas.delay.safeParse({
        type: 'localTime',
        hour: 7,
        minute: 0,
        allowedDaysOfWeek: [1],
      });
      expect(ok.success).toBe(true);
    });

    it('accepts localTime without allowedDaysOfWeek (any-day)', () => {
      const ok = WorkflowStepConfigSchemas.delay.safeParse({
        type: 'localTime',
        hour: 23,
        minute: 30,
      });
      expect(ok.success).toBe(true);
    });

    it('rejects out-of-range hour/minute', () => {
      expect(
        WorkflowStepConfigSchemas.delay.safeParse({type: 'localTime', hour: 25, minute: 0}).success,
      ).toBe(false);
      expect(
        WorkflowStepConfigSchemas.delay.safeParse({type: 'localTime', hour: 7, minute: 60}).success,
      ).toBe(false);
    });

    it('rejects out-of-range allowedDaysOfWeek values', () => {
      expect(
        WorkflowStepConfigSchemas.delay.safeParse({
          type: 'localTime',
          hour: 7,
          minute: 0,
          allowedDaysOfWeek: [0, 1], // 0 is Sunday in some locales but ISO is 1..7
        }).success,
      ).toBe(false);
    });
  });

  describe('execution: Monday 7am in Europe/Madrid from a Saturday afternoon', () => {
    it('queues the next step with a delay covering Sat -> Mon span', async () => {
      // Saturday 2026-05-09 14:00 UTC.
      const fakeNow = new Date('2026-05-09T14:00:00Z');
      vi.useFakeTimers();
      vi.setSystemTime(fakeNow);
      const queueSpy = vi.spyOn(QueueService, 'queueWorkflowStep').mockResolvedValue({id: 'mock'} as any);

      try {
        const template = await factories.createTemplate({projectId});
        const {workflow, steps} = await factories.createWorkflowWithSteps(projectId, [
          {
            type: WorkflowStepType.DELAY,
            config: {type: 'localTime', hour: 7, minute: 0, allowedDaysOfWeek: [1]},
          },
          {type: WorkflowStepType.SEND_EMAIL, templateId: template.id},
        ]);

        // Wire transitions step[0] -> step[1].
        await prisma.workflowTransition.create({
          data: {fromStepId: steps[0].id, toStepId: steps[1].id, priority: 0},
        });

        const contact = await factories.createContact({
          projectId,
          timezone: 'Europe/Madrid',
        });
        const execution = await factories.createWorkflowExecution(workflow.id, contact.id);
        const stepExec = await prisma.workflowStepExecution.create({
          data: {
            executionId: execution.id,
            stepId: steps[0].id,
            status: StepExecutionStatus.RUNNING,
            startedAt: new Date(),
          },
        });

        // Reach into the private executeDelay via the public processStep entry path.
        // Easiest: call the static method directly through `(WorkflowExecutionService as any)`.
        await (WorkflowExecutionService as any).executeDelay(
          steps[0],
          {
            ...execution,
            contact,
            workflow,
          },
          stepExec,
          steps[0].config,
        );

        // Madrid 2026-05-11 07:00 CEST = 2026-05-11 05:00 UTC.
        // Delay = 39 hours = 39 * 3600 * 1000 ms.
        expect(queueSpy).toHaveBeenCalledTimes(1);
        const [, , delayMs] = queueSpy.mock.calls[0]!;
        expect(delayMs).toBe(39 * 60 * 60 * 1000);

        // Workflow execution flips to WAITING.
        const reread = await prisma.workflowExecution.findUnique({where: {id: execution.id}});
        expect(reread?.status).toBe(WorkflowExecutionStatus.WAITING);
      } finally {
        queueSpy.mockRestore();
        vi.useRealTimers();
      }
    });
  });

  describe('null timezone falls back to UTC', () => {
    it('Monday 7am with contact.timezone === null queues UTC-relative delay', async () => {
      // Saturday 2026-05-09 14:00 UTC. Next Mon 07:00 UTC = 2026-05-11 07:00 UTC.
      // Delay = 41 hours.
      const fakeNow = new Date('2026-05-09T14:00:00Z');
      vi.useFakeTimers();
      vi.setSystemTime(fakeNow);
      const queueSpy = vi.spyOn(QueueService, 'queueWorkflowStep').mockResolvedValue({id: 'mock'} as any);

      try {
        const template = await factories.createTemplate({projectId});
        const {workflow, steps} = await factories.createWorkflowWithSteps(projectId, [
          {
            type: WorkflowStepType.DELAY,
            config: {type: 'localTime', hour: 7, minute: 0, allowedDaysOfWeek: [1]},
          },
          {type: WorkflowStepType.SEND_EMAIL, templateId: template.id},
        ]);

        await prisma.workflowTransition.create({
          data: {fromStepId: steps[0].id, toStepId: steps[1].id, priority: 0},
        });

        const contact = await factories.createContact({
          projectId,
          timezone: null,
        });
        const execution = await factories.createWorkflowExecution(workflow.id, contact.id);
        const stepExec = await prisma.workflowStepExecution.create({
          data: {
            executionId: execution.id,
            stepId: steps[0].id,
            status: StepExecutionStatus.RUNNING,
            startedAt: new Date(),
          },
        });

        await (WorkflowExecutionService as any).executeDelay(
          steps[0],
          {...execution, contact, workflow},
          stepExec,
          steps[0].config,
        );

        const [, , delayMs] = queueSpy.mock.calls[0]!;
        // 2026-05-09T14:00:00Z -> 2026-05-11T07:00:00Z = 1 day 17 h = 41 h.
        expect(delayMs).toBe(41 * 60 * 60 * 1000);
      } finally {
        queueSpy.mockRestore();
        vi.useRealTimers();
      }
    });
  });

  describe('DST transition during the delay window', () => {
    it('Monday 7am Madrid from the Saturday before EU DST jump = post-jump CEST instant', async () => {
      // 2026-03-28 Saturday 14:00 UTC. EU DST: Sun 2026-03-29 jumps 02:00 CET -> 03:00 CEST at 01:00 UTC.
      // So Monday 2026-03-30 07:00 Madrid is in CEST = UTC+2 = 05:00 UTC.
      // Sat 14:00 UTC -> Mon 05:00 UTC = 39 hours (same as the non-DST case because the
      // jump *removes* an hour from the local-clock perspective but the helper computes
      // wall-clock 07:00 in the post-jump zone, which lands 1h earlier in UTC than it
      // would in CET).
      const fakeNow = new Date('2026-03-28T14:00:00Z');
      vi.useFakeTimers();
      vi.setSystemTime(fakeNow);
      const queueSpy = vi.spyOn(QueueService, 'queueWorkflowStep').mockResolvedValue({id: 'mock'} as any);

      try {
        const template = await factories.createTemplate({projectId});
        const {workflow, steps} = await factories.createWorkflowWithSteps(projectId, [
          {
            type: WorkflowStepType.DELAY,
            config: {type: 'localTime', hour: 7, minute: 0, allowedDaysOfWeek: [1]},
          },
          {type: WorkflowStepType.SEND_EMAIL, templateId: template.id},
        ]);

        await prisma.workflowTransition.create({
          data: {fromStepId: steps[0].id, toStepId: steps[1].id, priority: 0},
        });

        const contact = await factories.createContact({
          projectId,
          timezone: 'Europe/Madrid',
        });
        const execution = await factories.createWorkflowExecution(workflow.id, contact.id);
        const stepExec = await prisma.workflowStepExecution.create({
          data: {
            executionId: execution.id,
            stepId: steps[0].id,
            status: StepExecutionStatus.RUNNING,
            startedAt: new Date(),
          },
        });

        await (WorkflowExecutionService as any).executeDelay(
          steps[0],
          {...execution, contact, workflow},
          stepExec,
          steps[0].config,
        );

        const [, , delayMs] = queueSpy.mock.calls[0]!;
        // 2026-03-28T14:00:00Z -> 2026-03-30T05:00:00Z = 1 day 15 h = 39 h.
        expect(delayMs).toBe(39 * 60 * 60 * 1000);
      } finally {
        queueSpy.mockRestore();
        vi.useRealTimers();
      }
    });
  });

  describe('legacy absolute delay continues to work', () => {
    it('queues a delay with the legacy {amount: 1, unit: "hours"} shape', async () => {
      const queueSpy = vi.spyOn(QueueService, 'queueWorkflowStep').mockResolvedValue({id: 'mock'} as any);
      try {
        const template = await factories.createTemplate({projectId});
        const {workflow, steps} = await factories.createWorkflowWithSteps(projectId, [
          {type: WorkflowStepType.DELAY, config: {amount: 1, unit: 'hours'}},
          {type: WorkflowStepType.SEND_EMAIL, templateId: template.id},
        ]);

        await prisma.workflowTransition.create({
          data: {fromStepId: steps[0].id, toStepId: steps[1].id, priority: 0},
        });

        const contact = await factories.createContact({projectId});
        const execution = await factories.createWorkflowExecution(workflow.id, contact.id);
        const stepExec = await prisma.workflowStepExecution.create({
          data: {
            executionId: execution.id,
            stepId: steps[0].id,
            status: StepExecutionStatus.RUNNING,
            startedAt: new Date(),
          },
        });

        await (WorkflowExecutionService as any).executeDelay(
          steps[0],
          {...execution, contact, workflow},
          stepExec,
          steps[0].config,
        );

        const [, , delayMs] = queueSpy.mock.calls[0]!;
        expect(delayMs).toBe(60 * 60 * 1000);
      } finally {
        queueSpy.mockRestore();
      }
    });
  });
});
