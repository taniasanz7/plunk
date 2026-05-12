import {Controller, Middleware, Post} from '@overnightjs/core';
import type {NextFunction, Request, Response} from 'express';

import {requireAuth, requireEmailVerified} from '../middleware/auth.js';
import {EmailService} from '../services/EmailService.js';
import {CatchAsync} from '../utils/asyncHandler.js';

@Controller('emails')
export class Emails {
  /**
   * POST /emails/:id/resend
   * Resend a previously sent email.
   *
   * Loads the email by id (scoped to the authenticated project) and re-sends
   * it as a fresh TRANSACTIONAL email with the same recipient, subject, body,
   * from/replyTo, headers, attachments and templateId. The resend creates a
   * new email row with its own id and its own tracking lifecycle.
   *
   * Subscription policy is enforced by EmailService.sendTransactionalEmail:
   * marketing templates can't be re-sent to unsubscribed contacts;
   * transactional templates can.
   */
  @Post(':id/resend')
  @Middleware([requireAuth, requireEmailVerified])
  @CatchAsync
  public async resend(req: Request, res: Response, _next: NextFunction) {
    const auth = res.locals.auth;
    const emailId = req.params.id;

    if (!emailId) {
      return res.status(400).json({error: 'Email ID is required'});
    }

    const email = await EmailService.resend(auth.projectId!, emailId);

    return res.status(200).json(email);
  }
}
