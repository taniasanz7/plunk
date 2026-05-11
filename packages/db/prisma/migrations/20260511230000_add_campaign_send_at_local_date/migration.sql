-- Patch #11 (date extension): Campaign.sendAtLocalDate
--
-- Adds an optional YYYY-MM-DD local calendar date to pair with the existing
-- sendAtLocal HH:MM time. When set together, the campaign fan-out targets a
-- specific local wall-clock instant per timezone group (e.g. "Tuesday May 12
-- at 06:00 in each contact's local timezone") instead of the default
-- "next occurrence of HH:MM in each contact's local timezone".
--
-- Nullable so existing rows stay valid without backfill.

-- AlterTable
ALTER TABLE "campaigns" ADD COLUMN "sendAtLocalDate" TEXT;
