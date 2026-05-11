import {Controller, Delete, Get, Middleware, Post, Put} from '@overnightjs/core';
import {CampaignAudienceType, CampaignStatus, TemplateType} from '@plunk/db';
import {CampaignSchemas, UtilitySchemas} from '@plunk/shared';
import type {NextFunction, Request, Response} from 'express';

import {HttpException} from '../exceptions/index.js';
import {requireAuth, requireEmailVerified} from '../middleware/auth.js';
import {CampaignService} from '../services/CampaignService.js';
import {DomainService} from '../services/DomainService.js';
import {CatchAsync} from '../utils/asyncHandler.js';

@Controller('campaigns')
export class Campaigns {
  /**
   * Create a new campaign
   * POST /campaigns
   */
  @Post('')
  @Middleware([requireAuth, requireEmailVerified])
  @CatchAsync
  private async create(req: Request, res: Response, _next: NextFunction) {
    const auth = res.locals.auth;
    const {name, description, subject, body, from, fromName, replyTo, type, audienceType, audienceCondition, segmentId} =
      CampaignSchemas.create.parse(req.body);

    if (audienceType === CampaignAudienceType.SEGMENT && !segmentId) {
      throw new HttpException(400, 'Segment ID is required for SEGMENT audience type');
    }

    if (audienceType === CampaignAudienceType.FILTERED && !audienceCondition) {
      throw new HttpException(400, 'Audience condition is required for FILTERED audience type');
    }

    // Verify domain ownership and verification
    await DomainService.verifyEmailDomain(from, auth.projectId);

    const campaign = await CampaignService.create(auth.projectId, {
      name,
      description,
      subject,
      body,
      from,
      fromName,
      replyTo,
      type,
      audienceType,
      audienceCondition,
      segmentId,
    });

    return res.status(201).json({
      success: true,
      data: campaign,
    });
  }

  /**
   * Get all campaigns for a project
   * GET /campaigns
   */
  @Get('')
  @Middleware([requireAuth, requireEmailVerified])
  @CatchAsync
  private async list(req: Request, res: Response, _next: NextFunction) {
    const auth = res.locals.auth;
    const status = req.query.status as CampaignStatus | undefined;
    const search = typeof req.query.search === 'string' ? req.query.search.trim() || undefined : undefined;
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = parseInt(req.query.pageSize as string) || 20;

    // Validate status if provided
    if (status && !Object.values(CampaignStatus).includes(status)) {
      throw new HttpException(400, 'Invalid status value');
    }

    const result = await CampaignService.list(auth.projectId, {
      status,
      search,
      page,
      pageSize,
    });

    return res.json(result);
  }

  /**
   * Get a specific campaign
   * GET /campaigns/:id
   */
  @Get(':id')
  @Middleware([requireAuth, requireEmailVerified])
  @CatchAsync
  private async get(req: Request, res: Response, _next: NextFunction) {
    const auth = res.locals.auth;
    const {id} = UtilitySchemas.id.parse(req.params);

    const campaign = await CampaignService.get(auth.projectId, id!);

    return res.json({
      success: true,
      data: campaign,
    });
  }

  /**
   * Update a campaign
   * PUT /campaigns/:id
   */
  @Put(':id')
  @Middleware([requireAuth, requireEmailVerified])
  @CatchAsync
  private async update(req: Request, res: Response, _next: NextFunction) {
    const auth = res.locals.auth;
    const {id} = UtilitySchemas.id.parse(req.params);
    const {name, description, subject, body, from, fromName, replyTo, type, audienceType, audienceCondition, segmentId} =
      req.body;

    // Validate audience-specific fields if audienceType is being updated
    if (audienceType === CampaignAudienceType.SEGMENT && segmentId === undefined) {
      throw new HttpException(400, 'Segment ID is required for SEGMENT audience type');
    }

    if (audienceType === CampaignAudienceType.FILTERED && audienceCondition === undefined) {
      throw new HttpException(400, 'Audience condition is required for FILTERED audience type');
    }

    // Verify domain ownership and verification if 'from' is being updated
    if (from) {
      await DomainService.verifyEmailDomain(from, auth.projectId);
    }

    const campaign = await CampaignService.update(auth.projectId, id!, {
      name,
      description,
      subject,
      body,
      from,
      fromName,
      replyTo,
      type: type as TemplateType | undefined,
      audienceType,
      audienceCondition,
      segmentId,
    });

    return res.json({
      success: true,
      data: campaign,
    });
  }

  /**
   * Delete a campaign
   * DELETE /campaigns/:id
   */
  @Delete(':id')
  @Middleware([requireAuth, requireEmailVerified])
  @CatchAsync
  private async delete(req: Request, res: Response, _next: NextFunction) {
    const auth = res.locals.auth;
    const {id} = UtilitySchemas.id.parse(req.params);

    await CampaignService.delete(auth.projectId, id!);

    return res.json({
      success: true,
      message: 'Campaign deleted successfully',
    });
  }

  /**
   * Duplicate a campaign
   * POST /campaigns/:id/duplicate
   */
  @Post(':id/duplicate')
  @Middleware([requireAuth, requireEmailVerified])
  @CatchAsync
  private async duplicate(req: Request, res: Response, _next: NextFunction) {
    const auth = res.locals.auth;
    const {id} = UtilitySchemas.id.parse(req.params);

    const campaign = await CampaignService.duplicate(auth.projectId, id!);

    return res.status(201).json({
      success: true,
      data: campaign,
      message: 'Campaign duplicated successfully',
    });
  }

  /**
   * Send or schedule a campaign
   * POST /campaigns/:id/send
   */
  @Post(':id/send')
  @Middleware([requireAuth, requireEmailVerified])
  @CatchAsync
  private async send(req: Request, res: Response, _next: NextFunction) {
    const auth = res.locals.auth;
    const {id} = UtilitySchemas.id.parse(req.params);
    const scheduledFor = req.body?.scheduledFor;
    const sendAtLocal = req.body?.sendAtLocal;
    const sendAtLocalDate = req.body?.sendAtLocalDate;

    // Patch #11: scheduledFor and sendAtLocal are mutually exclusive.
    if (scheduledFor && sendAtLocal) {
      throw new HttpException(
        400,
        'Provide exactly one of `scheduledFor` (absolute UTC) or `sendAtLocal` (HH:MM, per-recipient local-time fan-out)',
      );
    }

    // sendAtLocalDate only makes sense alongside sendAtLocal.
    if (sendAtLocalDate && !sendAtLocal) {
      throw new HttpException(400, 'sendAtLocalDate is only valid alongside sendAtLocal');
    }

    // Parse scheduledFor if provided
    let scheduledDate: Date | undefined;
    if (scheduledFor) {
      scheduledDate = new Date(scheduledFor);

      if (isNaN(scheduledDate.getTime())) {
        throw new HttpException(400, 'Invalid scheduledFor date format');
      }
    }

    // Validate sendAtLocal HH:MM format at the boundary; service will re-parse.
    if (sendAtLocal !== undefined && sendAtLocal !== null) {
      if (typeof sendAtLocal !== 'string' || !/^([0-1]?[0-9]|2[0-3]):([0-5][0-9])$/.test(sendAtLocal)) {
        throw new HttpException(400, 'sendAtLocal must be in HH:MM 24-hour format (e.g. "07:00")');
      }
    }

    // Validate sendAtLocalDate YYYY-MM-DD format at the boundary; service will re-parse.
    if (sendAtLocalDate !== undefined && sendAtLocalDate !== null) {
      if (typeof sendAtLocalDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(sendAtLocalDate)) {
        throw new HttpException(400, 'sendAtLocalDate must be in YYYY-MM-DD format (e.g. "2026-05-12")');
      }
    }

    const campaign = await CampaignService.send(
      auth.projectId,
      id!,
      scheduledDate,
      sendAtLocal ?? undefined,
      sendAtLocalDate ?? undefined,
    );

    return res.json({
      success: true,
      data: campaign,
      message: scheduledDate
        ? `Campaign scheduled for ${scheduledDate.toISOString()}`
        : sendAtLocal
          ? sendAtLocalDate
            ? `Campaign scheduled for ${sendAtLocalDate} ${sendAtLocal} in each recipient's local timezone`
            : `Campaign scheduled for ${sendAtLocal} in each recipient's local timezone`
          : 'Campaign is being sent',
    });
  }

  /**
   * Cancel a campaign
   * POST /campaigns/:id/cancel
   */
  @Post(':id/cancel')
  @Middleware([requireAuth, requireEmailVerified])
  @CatchAsync
  private async cancel(req: Request, res: Response, _next: NextFunction) {
    const auth = res.locals.auth;
    const {id} = UtilitySchemas.id.parse(req.params);

    const campaign = await CampaignService.cancel(auth.projectId, id!);

    return res.json({
      success: true,
      data: campaign,
      message: 'Campaign cancelled successfully',
    });
  }

  /**
   * Get campaign statistics
   * GET /campaigns/:id/stats
   */
  @Get(':id/stats')
  @Middleware([requireAuth, requireEmailVerified])
  @CatchAsync
  private async stats(req: Request, res: Response, _next: NextFunction) {
    const auth = res.locals.auth;
    const {id} = UtilitySchemas.id.parse(req.params);

    const stats = await CampaignService.getStats(auth.projectId, id!);

    return res.json({
      success: true,
      data: stats,
    });
  }

  /**
   * Send a test email for a campaign
   * POST /campaigns/:id/test
   */
  @Post(':id/test')
  @Middleware([requireAuth, requireEmailVerified])
  @CatchAsync
  private async sendTest(req: Request, res: Response, _next: NextFunction) {
    const auth = res.locals.auth;
    const {id} = UtilitySchemas.id.parse(req.params);
    const {email} = CampaignSchemas.sendTest.parse(req.body);

    await CampaignService.sendTest(auth.projectId, id!, email);

    return res.json({
      success: true,
      message: `Test email sent to ${email}`,
    });
  }
}
