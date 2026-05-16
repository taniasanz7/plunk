import {Controller, Delete, Get, Middleware, Patch, Post} from '@overnightjs/core';
import {LayoutSchemas} from '@plunk/shared';
import type {NextFunction, Request, Response} from 'express';

import {requireAuth, requireEmailVerified} from '../middleware/auth.js';
import {LayoutService} from '../services/LayoutService.js';
import {CatchAsync} from '../utils/asyncHandler.js';

@Controller('layouts')
export class Layouts {
  /**
   * GET /layouts
   * List layouts for the authenticated project.
   */
  @Get('')
  @Middleware([requireAuth, requireEmailVerified])
  @CatchAsync
  public async list(req: Request, res: Response, _next: NextFunction) {
    const auth = res.locals.auth;
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = Math.min(parseInt(req.query.pageSize as string) || 20, 100);
    const search = req.query.search as string | undefined;

    const result = await LayoutService.list(auth.projectId!, page, pageSize, search);

    return res.status(200).json(result);
  }

  /**
   * GET /layouts/:id
   * Get a single layout by ID.
   */
  @Get(':id')
  @Middleware([requireAuth, requireEmailVerified])
  @CatchAsync
  public async get(req: Request, res: Response, _next: NextFunction) {
    const auth = res.locals.auth;
    const layoutId = req.params.id;

    if (!layoutId) {
      return res.status(400).json({error: 'Layout ID is required'});
    }

    const layout = await LayoutService.get(auth.projectId!, layoutId);

    return res.status(200).json(layout);
  }

  /**
   * POST /layouts
   * Create a new layout.
   */
  @Post('')
  @Middleware([requireAuth, requireEmailVerified])
  @CatchAsync
  public async create(req: Request, res: Response, _next: NextFunction) {
    const auth = res.locals.auth;
    const {name, body, isDefault} = LayoutSchemas.create.parse(req.body);

    const layout = await LayoutService.create(auth.projectId!, {
      name,
      body,
      isDefault,
    });

    return res.status(201).json(layout);
  }

  /**
   * PATCH /layouts/:id
   * Update a layout.
   */
  @Patch(':id')
  @Middleware([requireAuth, requireEmailVerified])
  @CatchAsync
  public async update(req: Request, res: Response, _next: NextFunction) {
    const auth = res.locals.auth;
    const layoutId = req.params.id;
    const {name, body, isDefault} = LayoutSchemas.update.parse(req.body);

    if (!layoutId) {
      return res.status(400).json({error: 'Layout ID is required'});
    }

    const layout = await LayoutService.update(auth.projectId!, layoutId, {
      name,
      body,
      isDefault,
    });

    return res.status(200).json(layout);
  }

  /**
   * DELETE /layouts/:id
   * Delete a layout. Refuses with 400 if any template still references it.
   */
  @Delete(':id')
  @Middleware([requireAuth, requireEmailVerified])
  @CatchAsync
  public async delete(req: Request, res: Response, _next: NextFunction) {
    const auth = res.locals.auth;
    const layoutId = req.params.id;

    if (!layoutId) {
      return res.status(400).json({error: 'Layout ID is required'});
    }

    await LayoutService.delete(auth.projectId!, layoutId);

    return res.status(204).send();
  }
}
