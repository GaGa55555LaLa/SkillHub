-- CreateEnum
CREATE TYPE "OwnerType" AS ENUM ('org', 'user');

-- CreateEnum
CREATE TYPE "ShareMode" AS ENUM ('whole_repo', 'selected_only');

-- CreateEnum
CREATE TYPE "RepoVisibility" AS ENUM ('public', 'private');

-- CreateEnum
CREATE TYPE "GranteeType" AS ENUM ('user', 'team');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('view', 'download');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "github_id" BIGINT NOT NULL,
    "github_login" TEXT NOT NULL,
    "github_avatar_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "skill_sources" (
    "id" TEXT NOT NULL,
    "repo_full_name" TEXT NOT NULL,
    "owner_type" "OwnerType" NOT NULL,
    "owner_user_id" TEXT,
    "installation_id" BIGINT NOT NULL,
    "share_mode" "ShareMode" NOT NULL DEFAULT 'whole_repo',
    "visibility" "RepoVisibility" NOT NULL DEFAULT 'private',
    "last_synced_at" TIMESTAMP(3),
    "last_commit_sha" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "skill_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "skills" (
    "id" TEXT NOT NULL,
    "source_id" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "content_sha" TEXT,
    "is_published" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "skills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "skill_content_cache" (
    "id" TEXT NOT NULL,
    "skill_id" TEXT NOT NULL,
    "file_path" TEXT NOT NULL,
    "file_content" TEXT NOT NULL,
    "cached_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "skill_content_cache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "skill_shares" (
    "id" TEXT NOT NULL,
    "skill_id" TEXT,
    "source_id" TEXT NOT NULL,
    "grantee_type" "GranteeType" NOT NULL,
    "grantee_id" BIGINT NOT NULL,
    "granted_by" TEXT NOT NULL,
    "granted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "skill_shares_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_tokens" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "api_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "access_audit_log" (
    "id" TEXT NOT NULL,
    "actor_user_id" TEXT NOT NULL,
    "skill_id" TEXT NOT NULL,
    "action" "AuditAction" NOT NULL,
    "accessed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "access_audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_github_id_key" ON "users"("github_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_github_login_key" ON "users"("github_login");

-- CreateIndex
CREATE UNIQUE INDEX "skill_sources_repo_full_name_key" ON "skill_sources"("repo_full_name");

-- CreateIndex
CREATE UNIQUE INDEX "skills_source_id_path_key" ON "skills"("source_id", "path");

-- CreateIndex
CREATE UNIQUE INDEX "skill_content_cache_skill_id_file_path_key" ON "skill_content_cache"("skill_id", "file_path");

-- CreateIndex
CREATE UNIQUE INDEX "skill_shares_source_id_skill_id_grantee_type_grantee_id_key" ON "skill_shares"("source_id", "skill_id", "grantee_type", "grantee_id");

-- CreateIndex
CREATE UNIQUE INDEX "api_tokens_token_hash_key" ON "api_tokens"("token_hash");

-- AddForeignKey
ALTER TABLE "skill_sources" ADD CONSTRAINT "skill_sources_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skills" ADD CONSTRAINT "skills_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "skill_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skill_content_cache" ADD CONSTRAINT "skill_content_cache_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "skills"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skill_shares" ADD CONSTRAINT "skill_shares_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "skills"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skill_shares" ADD CONSTRAINT "skill_shares_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "skill_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skill_shares" ADD CONSTRAINT "skill_shares_granted_by_fkey" FOREIGN KEY ("granted_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_tokens" ADD CONSTRAINT "api_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_audit_log" ADD CONSTRAINT "access_audit_log_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_audit_log" ADD CONSTRAINT "access_audit_log_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "skills"("id") ON DELETE CASCADE ON UPDATE CASCADE;
