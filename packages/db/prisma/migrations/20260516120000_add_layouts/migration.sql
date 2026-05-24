-- CreateTable
CREATE TABLE "layouts" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "projectId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "layouts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "layouts_projectId_idx" ON "layouts"("projectId");

-- CreateIndex
CREATE INDEX "layouts_projectId_isDefault_idx" ON "layouts"("projectId", "isDefault");

-- CreateIndex
-- Enforce at most one default layout per project at the database level. Prisma
-- cannot express partial unique indexes declaratively, so this is created in
-- raw SQL here; the service layer's unset-then-set transaction handles the
-- happy path, and this index closes the concurrent-write race that READ
-- COMMITTED would otherwise allow.
CREATE UNIQUE INDEX "layouts_projectId_default_key" ON "layouts" ("projectId") WHERE "isDefault";

-- AddForeignKey
ALTER TABLE "layouts" ADD CONSTRAINT "layouts_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "templates" ADD COLUMN "layoutId" TEXT;

-- CreateIndex
CREATE INDEX "templates_layoutId_idx" ON "templates"("layoutId");

-- AddForeignKey
ALTER TABLE "templates" ADD CONSTRAINT "templates_layoutId_fkey" FOREIGN KEY ("layoutId") REFERENCES "layouts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
