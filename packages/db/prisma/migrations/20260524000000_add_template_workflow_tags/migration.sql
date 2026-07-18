-- AlterTable
ALTER TABLE "templates" ADD COLUMN     "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "workflows" ADD COLUMN     "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
