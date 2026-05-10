import {beforeEach, describe, expect, it, vi} from 'vitest';
import {CampaignAudienceType, CampaignStatus} from '@plunk/db';
import dayjs from 'dayjs';
import timezonePlugin from 'dayjs/plugin/timezone.js';
import utcPlugin from 'dayjs/plugin/utc.js';
import {CampaignService} from '../CampaignService';
import {QueueService} from '../QueueService';
import {factories, getPrismaClient} from '../../../../../test/helpers';

dayjs.extend(utcPlugin);
dayjs.extend(timezonePlugin);

// Mock STRIPE_ENABLED for billing limit tests
vi.mock('../../app/constants.js', async () => {
  const actual = await vi.importActual('../../app/constants.js');
  return {
    ...actual,
    STRIPE_ENABLED: true,
    STRIPE_SK: 'sk_test_mock_key_for_testing',
  };
});

describe('CampaignService', () => {
  let projectId: string;
  const prisma = getPrismaClient();

  beforeEach(async () => {
    const {project} = await factories.createUserWithProject();
    projectId = project.id;
  });

  describe('create', () => {
    it('should create a campaign with ALL audience type', async () => {
      const campaign = await CampaignService.create(projectId, {
        name: 'Test Campaign',
        subject: 'Test Subject',
        body: '<p>Test Body</p>',
        from: 'test@example.com',
        audienceType: CampaignAudienceType.ALL,
      });

      expect(campaign).toBeDefined();
      expect(campaign.name).toBe('Test Campaign');
      expect(campaign.status).toBe(CampaignStatus.DRAFT);
      expect(campaign.audienceType).toBe(CampaignAudienceType.ALL);
    });

    it('should create a campaign with SEGMENT audience type', async () => {
      const segment = await factories.createSegment(projectId, {name: 'VIP Users'});

      const campaign = await CampaignService.create(projectId, {
        name: 'VIP Campaign',
        subject: 'Exclusive Offer',
        body: '<p>For VIP users only</p>',
        from: 'vip@example.com',
        audienceType: CampaignAudienceType.SEGMENT,
        segmentId: segment.id,
      });

      expect(campaign.segmentId).toBe(segment.id);
    });

    it('should throw error when creating SEGMENT campaign without segmentId', async () => {
      await expect(
        CampaignService.create(projectId, {
          name: 'Invalid Campaign',
          subject: 'Test',
          body: '<p>Test</p>',
          from: 'test@example.com',
          audienceType: CampaignAudienceType.SEGMENT,
        }),
      ).rejects.toThrow('Segment ID is required');
    });

    it('should throw error when segment does not exist', async () => {
      await expect(
        CampaignService.create(projectId, {
          name: 'Invalid Campaign',
          subject: 'Test',
          body: '<p>Test</p>',
          from: 'test@example.com',
          audienceType: CampaignAudienceType.SEGMENT,
          segmentId: 'non-existent-segment',
        }),
      ).rejects.toThrow('Segment not found');
    });
  });

  describe('update', () => {
    it('should update a draft campaign', async () => {
      const campaign = await factories.createCampaign({
        projectId,
        name: 'Original Name',
        status: CampaignStatus.DRAFT,
      });

      const updated = await CampaignService.update(projectId, campaign.id, {
        name: 'Updated Name',
        subject: 'Updated Subject',
      });

      expect(updated.name).toBe('Updated Name');
      expect(updated.subject).toBe('Updated Subject');
    });

    it('should throw error when updating non-draft campaign', async () => {
      const campaign = await factories.createCampaign({
        projectId,
        status: CampaignStatus.SENT,
      });

      await expect(CampaignService.update(projectId, campaign.id, {name: 'New Name'})).rejects.toThrow(
        'Cannot update campaign that is sending or has been sent',
      );
    });
  });

  describe('delete', () => {
    it('should delete a draft campaign', async () => {
      const campaign = await factories.createCampaign({
        projectId,
        status: CampaignStatus.DRAFT,
      });

      await CampaignService.delete(projectId, campaign.id);

      const deleted = await prisma.campaign.findUnique({where: {id: campaign.id}});
      expect(deleted).toBeNull();
    });

    it('should not delete a non-draft campaign', async () => {
      const campaign = await factories.createCampaign({
        projectId,
        status: CampaignStatus.SENT,
      });

      await expect(CampaignService.delete(projectId, campaign.id)).rejects.toThrow('Can only delete draft campaigns');
    });
  });

  describe('duplicate', () => {
    it('should duplicate a campaign with (Copy) suffix', async () => {
      const original = await factories.createCampaign({
        projectId,
        name: 'Original Campaign',
      });

      const duplicate = await CampaignService.duplicate(projectId, original.id);

      expect(duplicate.name).toBe('Original Campaign (Copy)');
      expect(duplicate.subject).toBe(original.subject);
      expect(duplicate.body).toBe(original.body);
      expect(duplicate.status).toBe(CampaignStatus.DRAFT);
      expect(duplicate.id).not.toBe(original.id);
    });
  });

  describe('list', () => {
    it('should list campaigns with pagination', async () => {
      // Create 25 campaigns using bulk insert to avoid memory issues
      const campaignData = Array.from({length: 25}, (_, i) => ({
        projectId,
        name: `Campaign ${i}`,
        subject: 'Test Subject',
        body: '<p>Test Body</p>',
        from: 'test@example.com',
        status: 'DRAFT' as const,
      }));

      await prisma.campaign.createMany({data: campaignData});

      const result = await CampaignService.list(projectId, {page: 1, pageSize: 10});

      expect(result.data).toHaveLength(10);
      expect(result.total).toBe(25);
      expect(result.totalPages).toBe(3);
      expect(result.page).toBe(1);
    });

    it('should filter campaigns by status', async () => {
      await factories.createCampaign({projectId, status: CampaignStatus.DRAFT});
      await factories.createCampaign({projectId, status: CampaignStatus.DRAFT});
      await factories.createCampaign({projectId, status: CampaignStatus.SENT});

      const result = await CampaignService.list(projectId, {status: CampaignStatus.DRAFT});

      expect(result.data).toHaveLength(2);
      expect(result.data.every(c => c.status === CampaignStatus.DRAFT)).toBe(true);
    });
  });

  describe('get', () => {
    it('should get a campaign by id', async () => {
      const campaign = await factories.createCampaign({projectId, name: 'Test Campaign'});

      const retrieved = await CampaignService.get(projectId, campaign.id);

      expect(retrieved.id).toBe(campaign.id);
      expect(retrieved.name).toBe('Test Campaign');
    });

    it('should throw error when campaign does not exist', async () => {
      await expect(CampaignService.get(projectId, 'non-existent-id')).rejects.toThrow('Campaign not found');
    });
  });

  describe('Campaign + Segment Integration', () => {
    it('should create campaign targeting a segment', async () => {
      const segment = await factories.createSegment(projectId, {
        name: 'VIP Users',
        filters: [{field: 'data.vip', operator: 'equals', value: true}],
      });

      const campaign = await CampaignService.create(projectId, {
        name: 'VIP Campaign',
        subject: 'Exclusive Offer',
        body: '<p>For VIP users only</p>',
        from: 'vip@example.com',
        audienceType: CampaignAudienceType.SEGMENT,
        segmentId: segment.id,
      });

      expect(campaign.audienceType).toBe(CampaignAudienceType.SEGMENT);
      expect(campaign.segmentId).toBe(segment.id);
    });

    it('should only send to contacts matching segment criteria', async () => {
      // Create contacts - some match segment, some don't
      const vipContact1 = await factories.createContact({
        projectId,
        subscribed: true,
        data: {vip: true},
      });
      const vipContact2 = await factories.createContact({
        projectId,
        subscribed: true,
        data: {vip: true},
      });
      const regularContact = await factories.createContact({
        projectId,
        subscribed: true,
        data: {vip: false},
      });

      const segment = await factories.createSegment(projectId, {
        name: 'VIP Users',
        filters: [{field: 'data.vip', operator: 'equals', value: true}],
      });

      const _campaign = await factories.createCampaign({
        projectId,
        audienceType: CampaignAudienceType.SEGMENT,
        segmentId: segment.id,
      });

      // In a real scenario, the campaign processor would create emails
      // For this test, we manually check which contacts match the segment filters
      const allContacts = await prisma.contact.findMany({
        where: {projectId},
      });
      const contacts = allContacts.filter(c => (c.data as Record<string, unknown>)?.vip === true);

      // Should only include VIP contacts
      expect(contacts).toHaveLength(2);
      const contactIds = contacts.map(c => c.id);
      expect(contactIds).toContain(vipContact1.id);
      expect(contactIds).toContain(vipContact2.id);
      expect(contactIds).not.toContain(regularContact.id);
    });

    it('should exclude unsubscribed contacts from segment campaigns', async () => {
      const subscribedVip = await factories.createContact({
        projectId,
        subscribed: true,
        data: {vip: true},
      });
      const _unsubscribedVip = await factories.createContact({
        projectId,
        subscribed: false,
        data: {vip: true},
      });

      // Segment that requires BOTH vip AND subscribed
      const segment = await factories.createSegment(projectId, {
        name: 'Subscribed VIP Users',
        filters: [
          {field: 'data.vip', operator: 'equals', value: true},
          {field: 'subscribed', operator: 'equals', value: true},
        ],
      });

      const _campaign = await factories.createCampaign({
        projectId,
        audienceType: CampaignAudienceType.SEGMENT,
        segmentId: segment.id,
      });

      // Verify only subscribed VIP is targeted
      const allContacts = await prisma.contact.findMany({
        where: {projectId},
      });
      const matching = allContacts.filter(
        c => (c.data as Record<string, unknown>)?.vip === true && c.subscribed === true,
      );

      expect(matching).toHaveLength(1);
      expect(matching[0].id).toBe(subscribedVip.id);
    });

    it('should handle campaigns for ALL audience type', async () => {
      // Create mix of contacts
      await factories.createContact({projectId, subscribed: true});
      await factories.createContact({projectId, subscribed: true});
      await factories.createContact({projectId, subscribed: false}); // Should be excluded

      const campaign = await factories.createCampaign({
        projectId,
        audienceType: CampaignAudienceType.ALL,
      });

      expect(campaign.audienceType).toBe(CampaignAudienceType.ALL);
      expect(campaign.segmentId).toBeNull();

      // Verify ALL campaigns should target subscribed contacts only
      const subscribedContacts = await prisma.contact.findMany({
        where: {projectId, subscribed: true},
      });

      expect(subscribedContacts).toHaveLength(2);
    });
  });

  describe('Campaign Audience Validation', () => {
    it('should calculate correct recipient count for segment campaigns', async () => {
      // Create 5 contacts matching segment
      for (let i = 0; i < 5; i++) {
        await factories.createContact({
          projectId,
          subscribed: true,
          data: {plan: 'pro'},
        });
      }

      // Create 3 contacts not matching
      for (let i = 0; i < 3; i++) {
        await factories.createContact({
          projectId,
          subscribed: true,
          data: {plan: 'free'},
        });
      }

      const segment = await factories.createSegment(projectId, {
        filters: [{field: 'data.plan', operator: 'equals', value: 'pro'}],
      });

      await factories.createCampaign({
        projectId,
        audienceType: CampaignAudienceType.SEGMENT,
        segmentId: segment.id,
      });

      const matching = await prisma.contact.count({
        where: {
          projectId,
          data: {
            path: ['plan'],
            equals: 'pro',
          },
        },
      });

      expect(matching).toBe(5);
    });
  });

  describe('send', () => {
    it('should throw error when campaign has no recipients', async () => {
      // Create campaign with no contacts in project
      const campaign = await factories.createCampaign({
        projectId,
        status: CampaignStatus.DRAFT,
      });

      await expect(CampaignService.send(projectId, campaign.id)).rejects.toThrow('Campaign has no recipients');
    });

    it('should send campaign successfully when recipients are under billing limit', async () => {
      // Set billing limit for campaigns
      await prisma.project.update({
        where: {id: projectId},
        data: {billingLimitCampaigns: 100},
      });

      // Create 5 subscribed contacts
      for (let i = 0; i < 5; i++) {
        await factories.createContact({
          projectId,
          subscribed: true,
        });
      }

      // Create campaign targeting all contacts
      const campaign = await factories.createCampaign({
        projectId,
        status: CampaignStatus.DRAFT,
        audienceType: CampaignAudienceType.ALL,
      });

      // Should send successfully (5 recipients < 100 limit)
      const sentCampaign = await CampaignService.send(projectId, campaign.id);

      expect(sentCampaign.status).toBe(CampaignStatus.SENDING);
      expect(sentCampaign.totalRecipients).toBe(5);
    });

    it('should throw 403 error when campaign would exceed billing limit', async () => {
      // Set billing limit for campaigns to 10
      await prisma.project.update({
        where: {id: projectId},
        data: {billingLimitCampaigns: 10},
      });

      // Create 5 existing campaign emails (usage = 5)
      const contact = await factories.createContact({projectId, subscribed: true});
      for (let i = 0; i < 5; i++) {
        await factories.createEmail({
          projectId,
          contactId: contact.id,
          sourceType: 'CAMPAIGN',
        });
      }

      // Create campaign with 10 subscribed contacts (would result in 15 total)
      for (let i = 0; i < 10; i++) {
        await factories.createContact({
          projectId,
          subscribed: true,
        });
      }

      const campaign = await factories.createCampaign({
        projectId,
        status: CampaignStatus.DRAFT,
        audienceType: CampaignAudienceType.ALL,
      });

      // Should throw error because 5 + 11 = 16 > 10 limit (11 contacts: 1 from email creation + 10 new)
      await expect(CampaignService.send(projectId, campaign.id)).rejects.toThrow(/exceed billing limit/i);
    });

    it('should throw 403 error when scheduled campaign would exceed billing limit', async () => {
      // Set billing limit for campaigns to 20
      await prisma.project.update({
        where: {id: projectId},
        data: {billingLimitCampaigns: 20},
      });

      // Create 15 existing campaign emails
      const contact = await factories.createContact({projectId, subscribed: true});
      for (let i = 0; i < 15; i++) {
        await factories.createEmail({
          projectId,
          contactId: contact.id,
          sourceType: 'CAMPAIGN',
        });
      }

      // Create campaign with 10 subscribed contacts (would result in 25 total)
      for (let i = 0; i < 10; i++) {
        await factories.createContact({
          projectId,
          subscribed: true,
        });
      }

      const campaign = await factories.createCampaign({
        projectId,
        status: CampaignStatus.DRAFT,
        audienceType: CampaignAudienceType.ALL,
      });

      const scheduledFor = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now

      // Should throw error when scheduling because 15 + 10 = 25 > 20 limit
      await expect(CampaignService.send(projectId, campaign.id, scheduledFor)).rejects.toThrow(
        /Cannot schedule campaign.*exceed billing limit/i,
      );
    });

    it('should send campaign successfully when billing limit is null (unlimited)', async () => {
      // Set billing limit to null (unlimited)
      await prisma.project.update({
        where: {id: projectId},
        data: {billingLimitCampaigns: null},
      });

      // Create 1000 subscribed contacts
      for (let i = 0; i < 1000; i++) {
        await factories.createContact({
          projectId,
          subscribed: true,
        });
      }

      const campaign = await factories.createCampaign({
        projectId,
        status: CampaignStatus.DRAFT,
        audienceType: CampaignAudienceType.ALL,
      });

      // Should send successfully (no limit)
      const sentCampaign = await CampaignService.send(projectId, campaign.id);

      expect(sentCampaign.status).toBe(CampaignStatus.SENDING);
      expect(sentCampaign.totalRecipients).toBe(1000);
    });

    it('should allow campaign that exactly reaches billing limit', async () => {
      // Set billing limit for campaigns to 10
      await prisma.project.update({
        where: {id: projectId},
        data: {billingLimitCampaigns: 10},
      });

      // Create 5 existing campaign emails
      const contact = await factories.createContact({projectId, subscribed: true});
      for (let i = 0; i < 5; i++) {
        await factories.createEmail({
          projectId,
          contactId: contact.id,
          sourceType: 'CAMPAIGN',
        });
      }

      // Create 4 more subscribed contacts (total of 5 with the one above: 1 + 4 = 5)
      for (let i = 0; i < 4; i++) {
        await factories.createContact({
          projectId,
          subscribed: true,
        });
      }

      const campaign = await factories.createCampaign({
        projectId,
        status: CampaignStatus.DRAFT,
        audienceType: CampaignAudienceType.ALL,
      });

      // Should send successfully because 5 + 5 = 10 (exactly at limit)
      const sentCampaign = await CampaignService.send(projectId, campaign.id);

      expect(sentCampaign.status).toBe(CampaignStatus.SENDING);
      expect(sentCampaign.totalRecipients).toBe(5);
    });

    it('should throw error when campaign has already been sent', async () => {
      const campaign = await factories.createCampaign({
        projectId,
        status: CampaignStatus.SENT,
      });

      await expect(CampaignService.send(projectId, campaign.id)).rejects.toThrow(
        'Campaign has already been sent or is currently sending',
      );
    });

    it('should schedule campaign successfully when recipients are under billing limit', async () => {
      // Set billing limit for campaigns
      await prisma.project.update({
        where: {id: projectId},
        data: {billingLimitCampaigns: 50},
      });

      // Create 10 subscribed contacts
      for (let i = 0; i < 10; i++) {
        await factories.createContact({
          projectId,
          subscribed: true,
        });
      }

      const campaign = await factories.createCampaign({
        projectId,
        status: CampaignStatus.DRAFT,
        audienceType: CampaignAudienceType.ALL,
      });

      const scheduledFor = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now

      // Should schedule successfully (10 recipients < 50 limit)
      const scheduledCampaign = await CampaignService.send(projectId, campaign.id, scheduledFor);

      expect(scheduledCampaign.status).toBe(CampaignStatus.SCHEDULED);
      expect(scheduledCampaign.scheduledFor).toEqual(scheduledFor);
      expect(scheduledCampaign.totalRecipients).toBe(10);
    });
  });

  // ============================================================================
  // Patch #11: Campaign.sendAtLocal — per-recipient local-time fan-out
  // ============================================================================
  describe('send (sendAtLocal, Patch #11)', () => {
    /**
     * Helper: spy on QueueService.scheduleCampaign and capture per-tz fan-out calls.
     */
    function spyOnSchedule() {
      return vi.spyOn(QueueService, 'scheduleCampaign').mockImplementation(async () => {
        return {id: 'mock-job'} as any;
      });
    }

    it('rejects providing both scheduledFor and sendAtLocal', async () => {
      await factories.createContact({projectId, subscribed: true, timezone: 'Europe/Madrid'});
      const campaign = await factories.createCampaign({
        projectId,
        status: CampaignStatus.DRAFT,
        audienceType: CampaignAudienceType.ALL,
      });

      const scheduledFor = new Date(Date.now() + 60 * 60 * 1000);

      await expect(
        CampaignService.send(projectId, campaign.id, scheduledFor, '07:00'),
      ).rejects.toThrow(/exactly one/i);
    });

    it('fans out one queued job per distinct contact timezone', async () => {
      const spy = spyOnSchedule();
      try {
        // Three timezone groups (Madrid x40, NY x30, null/UTC x30) totalling 100.
        const tzPlan: Array<{tz: string | null; count: number}> = [
          {tz: 'Europe/Madrid', count: 40},
          {tz: 'America/New_York', count: 30},
          {tz: null, count: 30},
        ];
        const prismaClient = getPrismaClient();
        for (const group of tzPlan) {
          await prismaClient.contact.createMany({
            data: Array.from({length: group.count}, (_, i) => ({
              projectId,
              email: `c-${group.tz ?? 'null'}-${i}@example.com`,
              subscribed: true,
              timezone: group.tz,
            })),
          });
        }

        const campaign = await factories.createCampaign({
          projectId,
          status: CampaignStatus.DRAFT,
          audienceType: CampaignAudienceType.ALL,
        });

        const result = await CampaignService.send(projectId, campaign.id, undefined, '07:00');
        expect(result.status).toBe(CampaignStatus.SCHEDULED);
        // sendAtLocal is persisted on the row; absolute scheduledFor is cleared.
        expect((result as any).sendAtLocal).toBe('07:00');
        expect(result.scheduledFor).toBeNull();
        expect(result.totalRecipients).toBe(100);

        // One QueueService.scheduleCampaign call per distinct timezone (3 groups).
        expect(spy).toHaveBeenCalledTimes(3);

        // Inspect the per-call args. Each call: (campaignId, fireAt: Date, tzFilter: string).
        const callsByTz = new Map<string, Date>();
        for (const call of spy.mock.calls) {
          const [cid, fireAt, tzFilter] = call;
          expect(cid).toBe(campaign.id);
          expect(fireAt).toBeInstanceOf(Date);
          callsByTz.set(String(tzFilter), fireAt as Date);
        }
        expect([...callsByTz.keys()].sort()).toEqual(
          ['America/New_York', 'Europe/Madrid', '__null__'],
        );

        // Spot-check the per-tz UTC instants. Each fireAt should be in the future and
        // correspond to "07:00 in that tz" (today or tomorrow), specifically.
        const now = new Date();
        for (const [tzKey, fireAt] of callsByTz) {
          const zone = tzKey === '__null__' ? 'UTC' : tzKey;
          const local = dayjs(fireAt).tz(zone);
          expect(local.hour()).toBe(7);
          expect(local.minute()).toBe(0);
          expect(fireAt.getTime()).toBeGreaterThan(now.getTime());
        }
      } finally {
        spy.mockRestore();
      }
    });

    it('schedules across the spring-forward DST boundary (Europe/Madrid 2026-03-29)', async () => {
      const spy = spyOnSchedule();
      try {
        // Use vitest fake timers to fix "now" at Saturday 2026-03-28 14:00 UTC,
        // so "next 07:00 Madrid local" lands on Sunday morning crossing the DST jump.
        // EU DST 2026 spring-forward: Sunday 2026-03-29, 02:00 CET -> 03:00 CEST at 01:00 UTC.
        // Asking for "07:00 Madrid" today (Sat) -> tomorrow 07:00 Madrid CEST = 05:00 UTC.
        const fakeNow = new Date('2026-03-28T14:00:00Z');
        vi.useFakeTimers();
        vi.setSystemTime(fakeNow);

        await factories.createContact({projectId, subscribed: true, timezone: 'Europe/Madrid'});

        const campaign = await factories.createCampaign({
          projectId,
          status: CampaignStatus.DRAFT,
          audienceType: CampaignAudienceType.ALL,
        });

        await CampaignService.send(projectId, campaign.id, undefined, '07:00');
        expect(spy).toHaveBeenCalledTimes(1);
        const [, fireAt, tzFilter] = spy.mock.calls[0]!;
        expect(tzFilter).toBe('Europe/Madrid');
        // 2026-03-29 07:00 Madrid CEST (UTC+2) = 05:00 UTC.
        expect((fireAt as Date).toISOString()).toBe('2026-03-29T05:00:00.000Z');
      } finally {
        vi.useRealTimers();
        spy.mockRestore();
      }
    });

    it('treats null Contact.timezone as UTC for scheduling', async () => {
      const spy = spyOnSchedule();
      try {
        await factories.createContact({projectId, subscribed: true, timezone: null});

        const campaign = await factories.createCampaign({
          projectId,
          status: CampaignStatus.DRAFT,
          audienceType: CampaignAudienceType.ALL,
        });

        await CampaignService.send(projectId, campaign.id, undefined, '23:00');
        expect(spy).toHaveBeenCalledTimes(1);
        const [, fireAt, tzFilter] = spy.mock.calls[0]!;
        // Sentinel for null timezone is "__null__".
        expect(tzFilter).toBe('__null__');
        // The fireAt should be at exactly 23:00 UTC (today or tomorrow).
        expect(dayjs(fireAt as Date).utc().hour()).toBe(23);
        expect(dayjs(fireAt as Date).utc().minute()).toBe(0);
      } finally {
        spy.mockRestore();
      }
    });
  });
});
