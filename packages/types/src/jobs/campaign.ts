/**
 * Campaign queue job data types
 */

/**
 * Job data for processing a batch of campaign recipients
 * Used by: campaignQueue worker
 */
export interface CampaignBatchJobData {
  campaignId: string;
  batchNumber: number;
  offset: number;
  limit: number;
  cursor?: string; // For cursor-based pagination
  /**
   * Patch #11: when set, this batch is constrained to recipients with the given
   * Contact.timezone. Special sentinel `__null__` means "contacts with NULL timezone"
   * (treated as UTC). Undefined means "all recipients regardless of timezone" (legacy
   * behavior, used for absolute-UTC and immediate sends).
   */
  timezoneFilter?: string;
}

/**
 * Job data for sending a scheduled campaign
 * Used by: scheduledQueue worker
 */
export interface ScheduledCampaignJobData {
  campaignId: string;
  /**
   * Patch #11: when set, the scheduled-campaign worker dispatches only the recipients
   * with this Contact.timezone (sentinel `__null__` => null/UTC). Used by sendAtLocal
   * fan-out so each timezone group fires at its own UTC instant.
   */
  timezoneFilter?: string;
}

/**
 * Patch #11: sentinel string for null timezone in BullMQ jobIds + batch filters.
 * BullMQ jobIds must be strings, and we want a stable, collision-free way to denote
 * "the contacts whose timezone column IS NULL" (which we treat as UTC).
 */
export const NULL_TIMEZONE_SENTINEL = '__null__';
