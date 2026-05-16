import type {Template} from '@plunk/db';
import {Prisma} from '@plunk/db';
import type {PaginatedResponse} from '@plunk/types';

import {prisma} from '../database/prisma.js';
import {HttpException} from '../exceptions/index.js';
import {buildEmailFieldsUpdate} from '../utils/modelUpdate.js';

export class TemplateService {
  /**
   * Get all templates for a project with pagination
   */
  public static async list(
    projectId: string,
    page = 1,
    pageSize = 20,
    search?: string,
    type?: Template['type'],
  ): Promise<PaginatedResponse<Template>> {
    const skip = (page - 1) * pageSize;

    const where: Prisma.TemplateWhereInput = {
      projectId,
      ...(type ? {type} : {}),
      ...(search
        ? {
            OR: [
              {name: {contains: search, mode: 'insensitive' as const}},
              {description: {contains: search, mode: 'insensitive' as const}},
              {subject: {contains: search, mode: 'insensitive' as const}},
            ],
          }
        : {}),
    };

    const [templates, total] = await Promise.all([
      prisma.template.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: {createdAt: 'desc'},
      }),
      prisma.template.count({where}),
    ]);

    return {
      data: templates,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  /**
   * Get a single template by ID
   */
  public static async get(projectId: string, templateId: string): Promise<Template> {
    const template = await prisma.template.findFirst({
      where: {
        id: templateId,
        projectId,
      },
    });

    if (!template) {
      throw new HttpException(404, 'Template not found');
    }

    return template;
  }

  /**
   * Create a new template
   */
  public static async create(
    projectId: string,
    data: {
      name: string;
      description?: string;
      subject: string;
      body: string;
      from: string;
      fromName?: string | null;
      replyTo?: string | null;
      type?: Template['type'];
      layoutId?: string | null;
    },
  ): Promise<Template> {
    if (data.layoutId) {
      await this.assertLayoutBelongsToProject(projectId, data.layoutId);
    }

    return prisma.template.create({
      data: {
        projectId,
        name: data.name,
        description: data.description,
        subject: data.subject,
        body: data.body,
        from: data.from,
        fromName: data.fromName,
        replyTo: data.replyTo,
        type: data.type ?? 'MARKETING',
        layoutId: data.layoutId ?? null,
      },
    });
  }

  /**
   * Verify that a given layoutId exists and belongs to the same project as
   * the template being created/updated. Prevents callers from referencing
   * a layout from a different project.
   */
  private static async assertLayoutBelongsToProject(projectId: string, layoutId: string): Promise<void> {
    const layout = await prisma.layout.findFirst({
      where: {id: layoutId, projectId},
      select: {id: true},
    });

    if (!layout) {
      throw new HttpException(400, 'Layout not found or does not belong to this project');
    }
  }

  /**
   * Update a template
   */
  public static async update(
    projectId: string,
    templateId: string,
    data: {
      name?: string;
      description?: string;
      subject?: string;
      body?: string;
      from?: string;
      fromName?: string | null;
      replyTo?: string | null;
      type?: Template['type'];
      layoutId?: string | null;
    },
  ): Promise<Template> {
    // Verify template exists and belongs to project
    await this.get(projectId, templateId);

    if (data.layoutId) {
      await this.assertLayoutBelongsToProject(projectId, data.layoutId);
    }

    const updateData = {
      ...buildEmailFieldsUpdate(data),
      ...(data.type !== undefined ? {type: data.type} : {}),
      ...(data.layoutId !== undefined ? {layoutId: data.layoutId} : {}),
    } as Prisma.TemplateUpdateInput;

    return prisma.template.update({
      where: {id: templateId},
      data: updateData,
    });
  }

  /**
   * Delete a template
   */
  public static async delete(projectId: string, templateId: string): Promise<void> {
    // Verify template exists and belongs to project
    await this.get(projectId, templateId);

    // Check if template is used in any workflows
    const workflowSteps = await prisma.workflowStep.count({
      where: {
        templateId,
        workflow: {projectId},
      },
    });

    if (workflowSteps > 0) {
      throw new HttpException(
        409,
        'Cannot delete template: it is currently used in workflow steps. Remove it from workflows first.',
      );
    }

    await prisma.template.delete({
      where: {id: templateId},
    });
  }

  /**
   * Bulk-update templates. Single endpoint by design so future tag-related
   * fields (addTags / removeTags) can stack on the same payload once the
   * Template.tags column exists. For now, only the `delete: true` mode
   * is supported.
   *
   * Atomicity: all selected templates must belong to the requesting
   * project AND none of them may currently be referenced by a workflow
   * step. Both checks are folded into a single transaction so a partial
   * delete is impossible — either every selected template is removed, or
   * the whole operation rolls back.
   */
  public static async bulkUpdate(
    projectId: string,
    options: {ids: string[]; delete?: boolean},
  ): Promise<{deleted?: number; updated?: number}> {
    const {ids, delete: shouldDelete} = options;

    if (ids.length === 0) {
      return {updated: 0};
    }

    // Dedup defensively — the schema allows the same id twice in theory
    // and we don't want it to inflate row counts.
    const uniqueIds = Array.from(new Set(ids));

    if (shouldDelete) {
      return prisma.$transaction(async tx => {
        // 1. Verify every id belongs to this project. Cross-project
        //    leaks are the main thing this endpoint must defend against.
        const owned = await tx.template.findMany({
          where: {id: {in: uniqueIds}, projectId},
          select: {id: true},
        });

        if (owned.length !== uniqueIds.length) {
          throw new HttpException(404, 'One or more templates not found in this project');
        }

        // 2. Reject the bulk delete if ANY of the selected templates is
        //    still referenced by a workflow step. Mirrors the single
        //    delete() behavior — no partial wipes.
        const referenced = await tx.workflowStep.findMany({
          where: {
            templateId: {in: uniqueIds},
            workflow: {projectId},
          },
          select: {templateId: true},
          distinct: ['templateId'],
        });

        if (referenced.length > 0) {
          const count = referenced.length;
          throw new HttpException(
            409,
            `Cannot delete: ${count} of the selected template${count === 1 ? ' is' : 's are'} currently used in workflow steps. Remove from workflows first.`,
          );
        }

        const result = await tx.template.deleteMany({
          where: {id: {in: uniqueIds}, projectId},
        });

        return {deleted: result.count};
      });
    }

    // No-op shape for forward-compat: when tag-add/tag-remove ship on
    // selfhost they'll branch off here. Returning {updated: 0} keeps the
    // response shape stable.
    return {updated: 0};
  }

  /**
   * Duplicate a template
   */
  public static async duplicate(projectId: string, templateId: string): Promise<Template> {
    const template = await this.get(projectId, templateId);

    // Create a new template with the same data
    return prisma.template.create({
      data: {
        projectId,
        name: `${template.name} (Copy)`,
        description: template.description,
        subject: template.subject,
        body: template.body,
        from: template.from,
        fromName: template.fromName,
        replyTo: template.replyTo,
        type: template.type,
        layoutId: template.layoutId,
      },
    });
  }

  /**
   * Get template usage statistics
   */
  public static async getUsage(projectId: string, templateId: string) {
    // Verify template exists and belongs to project
    await this.get(projectId, templateId);

    const [workflowStepsCount, emailsCount] = await Promise.all([
      prisma.workflowStep.count({
        where: {
          templateId,
          workflow: {projectId},
        },
      }),
      prisma.email.count({
        where: {
          templateId,
          projectId,
        },
      }),
    ]);

    return {
      workflowSteps: workflowStepsCount,
      emailsSent: emailsCount,
    };
  }
}
