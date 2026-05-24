import type {Template} from '@plunk/db';
import {Prisma} from '@plunk/db';
import type {PaginatedResponse} from '@plunk/types';

import {prisma} from '../database/prisma.js';
import {HttpException} from '../exceptions/index.js';
import type {ListSort} from '../utils/listSort.js';
import {buildEmailFieldsUpdate} from '../utils/modelUpdate.js';
import {normalizeTags} from '../utils/tags.js';

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
    sort: ListSort = {field: 'createdAt', direction: 'desc'},
    // Multi-tag filter with OR semantics: a template matches if it carries ANY
    // of the requested tags. Accepts a single tag (back-compat) or an array.
    tags?: string | string[],
  ): Promise<PaginatedResponse<Template>> {
    const skip = (page - 1) * pageSize;

    // Normalize to a non-empty array; an empty list means "no tag filter".
    const tagList = (Array.isArray(tags) ? tags : tags ? [tags] : []).filter(Boolean);

    const where: Prisma.TemplateWhereInput = {
      projectId,
      ...(type ? {type} : {}),
      ...(tagList.length > 0 ? {tags: {hasSome: tagList}} : {}),
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
        orderBy: {[sort.field]: sort.direction} as Prisma.TemplateOrderByWithRelationInput,
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
   * List distinct tags currently in use across the project's templates.
   * Returned sorted alphabetically.
   */
  public static async listTags(projectId: string): Promise<string[]> {
    const rows = await prisma.template.findMany({
      where: {projectId},
      select: {tags: true},
    });

    const set = new Set<string>();
    for (const row of rows) {
      for (const t of row.tags) {
        set.add(t);
      }
    }

    return Array.from(set).sort((a, b) => a.localeCompare(b));
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
      tags?: string[];
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
        tags: normalizeTags(data.tags) ?? [],
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
      tags?: string[];
      layoutId?: string | null;
    },
  ): Promise<Template> {
    // Verify template exists and belongs to project
    await this.get(projectId, templateId);

    if (data.layoutId) {
      await this.assertLayoutBelongsToProject(projectId, data.layoutId);
    }

    const normalizedTags = normalizeTags(data.tags);

    const updateData = {
      ...buildEmailFieldsUpdate(data),
      ...(data.type !== undefined ? {type: data.type} : {}),
      ...(normalizedTags !== undefined ? {tags: {set: normalizedTags}} : {}),
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
   * Apply a bulk operation to multiple templates at once.
   *
   * Supported modes (a single endpoint):
   * - `delete: true` — bulk delete (see guards below).
   * - `addTags` / `removeTags` — union/subtract the given tags on every selected
   *   row. Both may be present in one call; the union is applied first, then the
   *   subtraction. Each row's resulting tag list is normalized + de-duplicated.
   *
   * Atomicity (delete): every selected template must belong to the requesting
   * project AND none of them may currently be referenced by a workflow step.
   * Both checks plus the `deleteMany` are folded into a single Prisma
   * transaction, so a partial bulk delete is impossible — either every selected
   * template is removed, or the whole operation rolls back.
   *
   * - 404 if any id is missing from this project (foreign / cross-project id).
   * - 409 if any selected template is still referenced by a workflow step
   *   (mirrors the single-template `delete()` guard above).
   *
   * Atomicity (tags): every selected template's tag list is rewritten inside one
   * transaction. An ownership check (`projectId`) scopes the rows; cross-project
   * ids simply fall outside the update and never see their tags touched.
   */
  public static async bulkUpdate(
    projectId: string,
    options: {ids: string[]; delete?: boolean; addTags?: string[]; removeTags?: string[]},
  ): Promise<{deleted?: number; updated?: number}> {
    const {ids, delete: shouldDelete, addTags, removeTags} = options;

    // Dedup defensively — the schema permits the same id twice and we don't
    // want duplicates inflating the ownership/row counts below.
    const uniqueIds = Array.from(new Set(ids));

    if (uniqueIds.length === 0) {
      return {updated: 0};
    }

    if (shouldDelete) {
      return prisma.$transaction(async tx => {
        // 1. Ownership / project-scope check. Cross-project leaks are the main
        //    thing this endpoint must defend against.
        const owned = await tx.template.findMany({
          where: {id: {in: uniqueIds}, projectId},
          select: {id: true},
        });

        if (owned.length !== uniqueIds.length) {
          throw new HttpException(404, 'One or more templates not found in this project');
        }

        // 2. Reject the whole bulk delete if ANY selected template is still
        //    referenced by a workflow step. Mirrors the single delete()
        //    behavior — no partial wipes.
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
            `Cannot delete: ${count} of the selected template${
              count === 1 ? ' is' : 's are'
            } currently used in workflow steps. Remove from workflows first.`,
          );
        }

        const result = await tx.template.deleteMany({
          where: {id: {in: uniqueIds}, projectId},
        });

        return {deleted: result.count};
      });
    }

    // Tag add/remove mode. Normalize the requested tag deltas once; an empty
    // delta on both sides is a no-op.
    const toAdd = normalizeTags(addTags) ?? [];
    const toRemove = new Set(normalizeTags(removeTags) ?? []);

    if (toAdd.length > 0 || toRemove.size > 0) {
      return prisma.$transaction(async tx => {
        // Scope to this project's rows. Cross-project ids silently fall outside
        // this query and are never touched.
        const rows = await tx.template.findMany({
          where: {id: {in: uniqueIds}, projectId},
          select: {id: true, tags: true},
        });

        let updated = 0;
        for (const row of rows) {
          // Union the additions, then subtract the removals, normalizing the
          // result to keep ordering stable and drop duplicates.
          const merged = normalizeTags([...row.tags, ...toAdd]) ?? [];
          const next = merged.filter(t => !toRemove.has(t));

          // Skip the write when the tag list is unchanged.
          const unchanged = next.length === row.tags.length && next.every((t, i) => t === row.tags[i]);
          if (unchanged) continue;

          await tx.template.update({
            where: {id: row.id},
            data: {tags: {set: next}},
          });
          updated += 1;
        }

        return {updated};
      });
    }

    // No-op shape: no recognized operation. Returning {updated: 0} keeps the
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
        tags: template.tags,
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
