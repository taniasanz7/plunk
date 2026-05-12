-- Patch #4: Auto-annotate <a href> with contact id in compiled emails
--
-- Adds per-project overrides for the outbound-link CID annotation feature:
--   - projects.linkCidEnabled (nullable bool)
--       null  = inherit env default (feature on)
--       true  = explicitly enabled
--       false = explicitly disabled (opt-out)
--   - projects.linkCidParam (nullable text)
--       null  = use the env default param name (PLUNK_LINK_CID_PARAM, fallback "cid")
--       other = custom query-string key for this project
--
-- Both columns are nullable so existing rows stay valid without backfill.

-- AlterTable
ALTER TABLE "projects" ADD COLUMN "linkCidEnabled" BOOLEAN;
ALTER TABLE "projects" ADD COLUMN "linkCidParam" TEXT;
