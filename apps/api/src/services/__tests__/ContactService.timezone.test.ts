/**
 * Patch #11 — Contact.timezone tests.
 *
 * Covers:
 *  - Upsert / create with valid IANA timezone succeeds and persists the field.
 *  - Validation (zod, at API boundary) rejects invalid timezones with a clear error.
 *  - Default (null) timezone is honored as "treat as UTC" by downstream consumers.
 */

import {beforeEach, describe, expect, it} from 'vitest';

import {ActionSchemas, ContactSchemas, resolveTimezone} from '@plunk/shared';

import {ContactService} from '../ContactService';
import {factories, getPrismaClient} from '../../../../../test/helpers';

describe('ContactService — Patch #11 timezone field', () => {
  let projectId: string;
  const prisma = getPrismaClient();

  beforeEach(async () => {
    const {project} = await factories.createUserWithProject();
    projectId = project.id;
  });

  describe('upsert / create persists the field', () => {
    it('upsert with valid IANA timezone succeeds and persists', async () => {
      const contact = await ContactService.upsert(
        projectId,
        'tz-user@example.com',
        undefined,
        undefined,
        true,
        'Europe/Madrid',
      );
      expect(contact.timezone).toBe('Europe/Madrid');

      const reread = await prisma.contact.findUnique({where: {id: contact.id}});
      expect(reread?.timezone).toBe('Europe/Madrid');
    });

    it('upsert leaves timezone null by default', async () => {
      const contact = await ContactService.upsert(projectId, 'no-tz@example.com');
      expect(contact.timezone).toBeNull();
    });

    it('upsert with explicit null clears the timezone', async () => {
      const created = await ContactService.upsert(
        projectId,
        'clear-tz@example.com',
        undefined,
        undefined,
        true,
        'America/New_York',
      );
      expect(created.timezone).toBe('America/New_York');

      const cleared = await ContactService.upsert(
        projectId,
        'clear-tz@example.com',
        undefined,
        undefined,
        true,
        null,
      );
      expect(cleared.timezone).toBeNull();
    });

    it('create() respects the timezone field', async () => {
      const contact = await ContactService.create(projectId, {
        email: 'create-tz@example.com',
        timezone: 'Pacific/Auckland',
      });
      expect(contact.timezone).toBe('Pacific/Auckland');
    });

    it('update() can change timezone independently', async () => {
      const contact = await ContactService.create(projectId, {
        email: 'update-tz@example.com',
        timezone: 'UTC',
      });
      const updated = await ContactService.update(projectId, contact.id, {
        timezone: 'Asia/Tokyo',
      });
      expect(updated.timezone).toBe('Asia/Tokyo');
    });
  });

  describe('schema validation (API boundary)', () => {
    it('ContactSchemas.create accepts valid IANA tz', () => {
      const parsed = ContactSchemas.create.parse({
        email: 'a@example.com',
        timezone: 'Europe/Madrid',
      });
      expect(parsed.timezone).toBe('Europe/Madrid');
    });

    it('ContactSchemas.create rejects invalid timezone with a clear error', () => {
      const result = ContactSchemas.create.safeParse({
        email: 'a@example.com',
        timezone: 'Not/A_Real_Zone',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const msg = result.error.issues.map(i => i.message).join(' ');
        expect(msg).toMatch(/IANA/i);
      }
    });

    it('ActionSchemas.track rejects invalid timezone', () => {
      const result = ActionSchemas.track.safeParse({
        event: 'signup',
        email: 'a@example.com',
        timezone: 'PST', // Abbreviation, not IANA name.
      });
      expect(result.success).toBe(false);
    });

    it('ActionSchemas.track accepts valid IANA timezone', () => {
      const result = ActionSchemas.track.safeParse({
        event: 'signup',
        email: 'a@example.com',
        timezone: 'America/New_York',
      });
      expect(result.success).toBe(true);
    });

    it('ContactSchemas.create allows omitting the field', () => {
      const result = ContactSchemas.create.safeParse({
        email: 'a@example.com',
      });
      expect(result.success).toBe(true);
    });

    it('ContactSchemas.create allows null to clear the field', () => {
      const result = ContactSchemas.create.safeParse({
        email: 'a@example.com',
        timezone: null,
      });
      expect(result.success).toBe(true);
    });
  });

  describe('downstream UTC fallback for null timezone', () => {
    it('resolveTimezone(null) === "UTC"', () => {
      expect(resolveTimezone(null)).toBe('UTC');
    });

    it('a contact with null timezone is treated as UTC by helpers', async () => {
      const contact = await ContactService.create(projectId, {
        email: 'utc-default@example.com',
      });
      expect(contact.timezone).toBeNull();
      // Downstream (CampaignService, WorkflowExecutionService) feed contact.timezone into
      // resolveTimezone() / nextLocalTime() which fall back to UTC for null.
      expect(resolveTimezone(contact.timezone)).toBe('UTC');
    });
  });
});
