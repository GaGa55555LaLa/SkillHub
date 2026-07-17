/*
  Warnings:

  - You are about to drop the column `grantee_id` on the `skill_shares` table. All the data in the column will be lost.
  - You are about to drop the column `grantee_type` on the `skill_shares` table. All the data in the column will be lost.
  - You are about to drop the column `owner_type` on the `skill_sources` table. All the data in the column will be lost.
  - Made the column `owner_user_id` on table `skill_sources` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "skill_sources" DROP CONSTRAINT "skill_sources_owner_user_id_fkey";

-- DropIndex
DROP INDEX "skill_shares_source_id_skill_id_grantee_type_grantee_id_key";

-- AlterTable
ALTER TABLE "skill_shares" DROP COLUMN "grantee_id",
DROP COLUMN "grantee_type",
ADD COLUMN     "grantee_group_id" TEXT,
ADD COLUMN     "grantee_user_id" TEXT;

-- AlterTable
ALTER TABLE "skill_sources" DROP COLUMN "owner_type",
ADD COLUMN     "is_public" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "owner_user_id" SET NOT NULL,
ALTER COLUMN "share_mode" SET DEFAULT 'selected_only';

-- AlterTable
ALTER TABLE "skills" ADD COLUMN     "is_public" BOOLEAN NOT NULL DEFAULT false;

-- DropEnum
DROP TYPE "GranteeType";

-- DropEnum
DROP TYPE "OwnerType";

-- CreateTable
CREATE TABLE "groups" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "owner_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "group_members" (
    "id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "added_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "group_members_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "groups_owner_user_id_name_key" ON "groups"("owner_user_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "group_members_group_id_user_id_key" ON "group_members"("group_id", "user_id");

-- AddForeignKey
ALTER TABLE "skill_sources" ADD CONSTRAINT "skill_sources_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "groups" ADD CONSTRAINT "groups_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skill_shares" ADD CONSTRAINT "skill_shares_grantee_user_id_fkey" FOREIGN KEY ("grantee_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skill_shares" ADD CONSTRAINT "skill_shares_grantee_group_id_fkey" FOREIGN KEY ("grantee_group_id") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
