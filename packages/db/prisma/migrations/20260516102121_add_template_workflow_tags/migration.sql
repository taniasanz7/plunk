-- AlterTable
ALTER TABLE "templates" ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "workflows" ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];
