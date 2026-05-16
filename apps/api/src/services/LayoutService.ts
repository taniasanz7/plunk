import type {Layout, Prisma} from '@plunk/db';
import type {LayoutWithUsage, PaginatedResponse} from '@plunk/types';

import {prisma} from '../database/prisma.js';
import {HttpException} from '../exceptions/index.js';

export class LayoutService {
  /**
   * Get all layouts for a project with pagination. The list payload also
   * includes a `_count.templates` reference count so the dashboard can show
   * "Used by N templates" without needing a separate per-row request.
   */
  public static async list(
    projectId: string,
    page = 1,
    pageSize = 20,
    search?: string,
  ): Promise<PaginatedResponse<LayoutWithUsage>> {
    const skip = (page - 1) * pageSize;

    const where: Prisma.LayoutWhereInput = {
      projectId,
      ...(search
        ? {
            name: {contains: search, mode: 'insensitive' as const},
          }
        : {}),
    };

    const [layouts, total] = await Promise.all([
      prisma.layout.findMany({
        where,
        skip,
        take: pageSize,
        // Default layout floats to the top, then newest first.
        orderBy: [{isDefault: 'desc'}, {createdAt: 'desc'}],
        include: {
          _count: {select: {templates: true}},
        },
      }),
      prisma.layout.count({where}),
    ]);

    return {
      data: layouts,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  /**
   * Get a single layout by ID, scoped to the project.
   */
  public static async get(projectId: string, layoutId: string): Promise<Layout> {
    const layout = await prisma.layout.findFirst({
      where: {
        id: layoutId,
        projectId,
      },
    });

    if (!layout) {
      throw new HttpException(404, 'Layout not found');
    }

    return layout;
  }

  /**
   * Get the project's default layout, if one is set.
   */
  public static async getDefault(projectId: string): Promise<Layout | null> {
    return prisma.layout.findFirst({
      where: {projectId, isDefault: true},
    });
  }

  /**
   * Create a new layout. If isDefault is true, clears the flag on any other
   * layout of the same project in the same transaction so only one default
   * remains.
   */
  public static async create(
    projectId: string,
    data: {
      name: string;
      body: string;
      isDefault?: boolean;
    },
  ): Promise<Layout> {
    return prisma.$transaction(async tx => {
      if (data.isDefault) {
        await tx.layout.updateMany({
          where: {projectId, isDefault: true},
          data: {isDefault: false},
        });
      }

      return tx.layout.create({
        data: {
          projectId,
          name: data.name,
          body: data.body,
          isDefault: data.isDefault ?? false,
        },
      });
    });
  }

  /**
   * Update a layout. If isDefault transitions to true, clears the flag on
   * sibling layouts in the same transaction.
   */
  public static async update(
    projectId: string,
    layoutId: string,
    data: {
      name?: string;
      body?: string;
      isDefault?: boolean;
    },
  ): Promise<Layout> {
    // Verify layout exists and belongs to project
    await this.get(projectId, layoutId);

    return prisma.$transaction(async tx => {
      if (data.isDefault === true) {
        await tx.layout.updateMany({
          where: {projectId, isDefault: true, NOT: {id: layoutId}},
          data: {isDefault: false},
        });
      }

      const updateData: Prisma.LayoutUpdateInput = {};
      if (data.name !== undefined) updateData.name = data.name;
      if (data.body !== undefined) updateData.body = data.body;
      if (data.isDefault !== undefined) updateData.isDefault = data.isDefault;

      return tx.layout.update({
        where: {id: layoutId},
        data: updateData,
      });
    });
  }

  /**
   * Delete a layout. Refuses with a 400 if any Template still references it,
   * forcing the caller to detach those templates first. We don't auto-detach
   * because that would silently change which scaffold those templates send
   * with.
   */
  public static async delete(projectId: string, layoutId: string): Promise<void> {
    // Verify layout exists and belongs to project
    await this.get(projectId, layoutId);

    const templateCount = await prisma.template.count({
      where: {
        layoutId,
        projectId,
      },
    });

    if (templateCount > 0) {
      throw new HttpException(
        400,
        `Cannot delete layout: ${templateCount} template${
          templateCount === 1 ? '' : 's'
        } still reference it. Detach the layout from those templates first.`,
      );
    }

    await prisma.layout.delete({
      where: {id: layoutId},
    });
  }

  /**
   * Resolve the layout body to use for a template. Returns null when no
   * layout should be applied (template has no explicit layoutId AND the
   * project has no default layout).
   */
  public static async resolveLayoutBody(
    projectId: string,
    layoutId: string | null | undefined,
  ): Promise<string | null> {
    if (layoutId) {
      const layout = await prisma.layout.findFirst({
        where: {id: layoutId, projectId},
        select: {body: true},
      });
      return layout?.body ?? null;
    }

    const defaultLayout = await prisma.layout.findFirst({
      where: {projectId, isDefault: true},
      select: {body: true},
    });
    return defaultLayout?.body ?? null;
  }
}
