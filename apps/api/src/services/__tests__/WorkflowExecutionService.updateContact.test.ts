import {beforeEach, describe, expect, it, vi} from 'vitest';
import {WorkflowExecutionStatus, WorkflowStepType} from '@plunk/db';
import {WorkflowStepConfigSchemas} from '@plunk/shared';
import {toPrismaJson} from '@plunk/types';
import {WorkflowExecutionService} from '../WorkflowExecutionService';
import {factories, getPrismaClient} from '../../../../../test/helpers';

vi.mock('node:dns/promises', () => ({
  default: {
    lookup: vi.fn(async () => ({address: '1.2.3.4', family: 4})),
  },
}));

vi.mock('../QueueService', () => ({
  QueueService: {
    queueWorkflowStep: vi.fn(async () => ({id: 'mock-job-id'})),
    queueEmail: vi.fn(async () => ({id: 'mock-email-job-id'})),
    queueWorkflowTimeout: vi.fn(async () => ({id: 'mock-timeout-job-id'})),
    cancelWorkflowTimeout: vi.fn(async () => true),
  },
}));

/**
 * Tests for the UPDATE_CONTACT step's arithmetic operator support
 * (`{increment: N}` / `{decrement: N}`) plus regression coverage for
 * the existing direct-assignment behavior.
 */
describe('WorkflowExecutionService - executeUpdateContact', () => {
  const prisma = getPrismaClient();
  let projectId: string;

  beforeEach(async () => {
    const {project} = await factories.createUserWithProject();
    projectId = project.id;
  });

  /**
   * Wire up TRIGGER → UPDATE_CONTACT → EXIT, run it for `contact`, and
   * return the post-execution contact row.
   */
  async function runUpdateContactWorkflow(
    contactId: string,
    updateConfig: Record<string, unknown>,
  ) {
    const workflow = await factories.createWorkflow({projectId});
    const triggerStep = await prisma.workflowStep.findFirstOrThrow({
      where: {workflowId: workflow.id, type: WorkflowStepType.TRIGGER},
    });

    const updateStep = await prisma.workflowStep.create({
      data: {
        workflowId: workflow.id,
        type: WorkflowStepType.UPDATE_CONTACT,
        name: 'Update Contact',
        position: {x: 100, y: 0},
        config: toPrismaJson(updateConfig),
      },
    });

    const exitStep = await prisma.workflowStep.create({
      data: {
        workflowId: workflow.id,
        type: WorkflowStepType.EXIT,
        name: 'Done',
        position: {x: 200, y: 0},
        config: toPrismaJson({}),
      },
    });

    await prisma.workflowTransition.create({
      data: {fromStepId: triggerStep.id, toStepId: updateStep.id},
    });
    await prisma.workflowTransition.create({
      data: {fromStepId: updateStep.id, toStepId: exitStep.id},
    });

    const execution = await prisma.workflowExecution.create({
      data: {
        workflowId: workflow.id,
        contactId,
        status: WorkflowExecutionStatus.RUNNING,
        currentStepId: triggerStep.id,
        context: toPrismaJson({}),
      },
    });

    return {execution, triggerStepId: triggerStep.id};
  }

  describe('direct assignment (regression)', () => {
    it('still merges plain values into Contact.data', async () => {
      const contact = await factories.createContact({
        projectId,
        data: {existing: 'keep', leadScore: 10},
      });

      const {execution, triggerStepId} = await runUpdateContactWorkflow(contact.id, {
        updates: {tier: 'gold', leadScore: 42},
      });

      await WorkflowExecutionService.processStepExecution(execution.id, triggerStepId);

      const updated = await prisma.contact.findUniqueOrThrow({where: {id: contact.id}});
      expect(updated.data).toMatchObject({
        existing: 'keep',
        tier: 'gold',
        leadScore: 42,
      });
    });
  });

  describe('arithmetic operators', () => {
    it('increments an existing numeric field', async () => {
      const contact = await factories.createContact({
        projectId,
        data: {leadScore: 10},
      });

      const {execution, triggerStepId} = await runUpdateContactWorkflow(contact.id, {
        updates: {leadScore: {increment: 5}},
      });

      await WorkflowExecutionService.processStepExecution(execution.id, triggerStepId);

      const updated = await prisma.contact.findUniqueOrThrow({where: {id: contact.id}});
      expect((updated.data as Record<string, unknown>).leadScore).toBe(15);
    });

    it('treats a missing field as 0 when incrementing', async () => {
      const contact = await factories.createContact({
        projectId,
        data: {firstName: 'Alice'},
      });

      const {execution, triggerStepId} = await runUpdateContactWorkflow(contact.id, {
        updates: {leadScore: {increment: 5}},
      });

      await WorkflowExecutionService.processStepExecution(execution.id, triggerStepId);

      const updated = await prisma.contact.findUniqueOrThrow({where: {id: contact.id}});
      expect((updated.data as Record<string, unknown>).leadScore).toBe(5);
      // Sibling fields untouched.
      expect((updated.data as Record<string, unknown>).firstName).toBe('Alice');
    });

    it('allows decrement to take a value below zero (no clamping)', async () => {
      const contact = await factories.createContact({
        projectId,
        data: {leadScore: 2},
      });

      const {execution, triggerStepId} = await runUpdateContactWorkflow(contact.id, {
        updates: {leadScore: {decrement: 3}},
      });

      await WorkflowExecutionService.processStepExecution(execution.id, triggerStepId);

      const updated = await prisma.contact.findUniqueOrThrow({where: {id: contact.id}});
      expect((updated.data as Record<string, unknown>).leadScore).toBe(-1);
    });

    it('throws when arithmetic targets an existing non-numeric field', async () => {
      const contact = await factories.createContact({
        projectId,
        data: {leadScore: 'high'},
      });

      const {execution, triggerStepId} = await runUpdateContactWorkflow(contact.id, {
        updates: {leadScore: {increment: 5}},
      });

      await expect(
        WorkflowExecutionService.processStepExecution(execution.id, triggerStepId),
      ).rejects.toThrow(/non-numeric/);

      // Contact.data.leadScore must remain its original string value.
      const after = await prisma.contact.findUniqueOrThrow({where: {id: contact.id}});
      expect((after.data as Record<string, unknown>).leadScore).toBe('high');

      // Workflow execution should be marked FAILED by the engine's catch.
      const failed = await prisma.workflowExecution.findUniqueOrThrow({where: {id: execution.id}});
      expect(failed.status).toBe(WorkflowExecutionStatus.FAILED);
    });
  });

  describe('schema-level rejection', () => {
    it('rejects {increment, decrement} on the same field', () => {
      expect(() =>
        WorkflowStepConfigSchemas.updateContact.parse({
          updates: {leadScore: {increment: 5, decrement: 5}},
        }),
      ).toThrow();
    });

    it('rejects extra keys alongside an arithmetic operator', () => {
      expect(() =>
        WorkflowStepConfigSchemas.updateContact.parse({
          updates: {leadScore: {increment: 5, note: 'bonus'}},
        }),
      ).toThrow();
    });

    it('rejects a non-numeric arithmetic amount', () => {
      expect(() =>
        WorkflowStepConfigSchemas.updateContact.parse({
          updates: {leadScore: {increment: 'lots'}},
        }),
      ).toThrow();
    });

    it('accepts a plain numeric value (regression on schema shape)', () => {
      expect(() =>
        WorkflowStepConfigSchemas.updateContact.parse({
          updates: {leadScore: 5},
        }),
      ).not.toThrow();
    });

    it('accepts an arithmetic operator on its own', () => {
      expect(() =>
        WorkflowStepConfigSchemas.updateContact.parse({
          updates: {leadScore: {increment: 5}},
        }),
      ).not.toThrow();
    });
  });
});
