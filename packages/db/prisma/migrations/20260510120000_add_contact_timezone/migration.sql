-- Patch #11: Per-contact timezone + Campaign.sendAtLocal
--
-- Adds:
--   - contacts.timezone (IANA tz name, nullable; null = UTC)
--   - campaigns.sendAtLocal (HH:MM string, nullable; mutually exclusive with scheduledFor)
--   - Index on contacts(projectId, timezone) to support per-timezone fan-out in
--     CampaignService when scheduling via sendAtLocal.
--
-- All new columns are nullable so existing rows stay valid without backfill.

-- AlterTable
ALTER TABLE "contacts" ADD COLUMN "timezone" TEXT;

-- AlterTable
ALTER TABLE "campaigns" ADD COLUMN "sendAtLocal" TEXT;

-- CreateIndex
CREATE INDEX "contacts_projectId_timezone_idx" ON "contacts"("projectId", "timezone");
