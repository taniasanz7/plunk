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

-- AddForeignKey
ALTER TABLE "layouts" ADD CONSTRAINT "layouts_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "templates" ADD COLUMN "layoutId" TEXT;

-- CreateIndex
CREATE INDEX "templates_layoutId_idx" ON "templates"("layoutId");

-- AddForeignKey
ALTER TABLE "templates" ADD CONSTRAINT "templates_layoutId_fkey" FOREIGN KEY ("layoutId") REFERENCES "layouts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
