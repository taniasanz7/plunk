/**
 * Campaign service types
 */

import type {CampaignAudienceType, TemplateType} from '@plunk/db';
import type {FilterCondition} from '../segments/index.js';

/**
 * Data for creating a new campaign
 */
export interface CreateCampaignData {
  name: string;
  description?: string;
  subject: string;
  body: string;
  from: string;
  fromName?: string | null;
  replyTo?: string | null;
  type?: TemplateType;
  audienceType: CampaignAudienceType;
  audienceCondition?: FilterCondition;
  segmentId?: string;
}

/**
 * Data for updating an existing campaign
 */
export interface UpdateCampaignData {
  name?: string;
  description?: string;
  subject?: string;
  body?: string;
  from?: string;
  fromName?: string | null;
  replyTo?: string | null;
  type?: TemplateType;
  audienceType?: CampaignAudienceType;
  audienceCondition?: FilterCondition;
  segmentId?: string;
}

/**
 * Patch #11: Options for sending or scheduling a campaign.
 * `scheduledFor` and `sendAtLocal` are mutually exclusive.
 */
export interface SendCampaignOptions {
  /** Absolute UTC instant. Mutually exclusive with sendAtLocal. */
  scheduledFor?: Date;
  /**
   * HH:MM 24-hour local time. When set, the campaign is fanned out per-Contact.timezone
   * group; each group is queued at the next UTC instant matching HH:MM in its timezone
   * (null/missing timezone => UTC). "Next occurrence": today if HH:MM hasn't yet passed
   * in that timezone, otherwise tomorrow.
   */
  sendAtLocal?: string;
}
