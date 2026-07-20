-- 移除「發布」概念：連結 repo 後新掃到的 skill 預設就不公開、不分享，
-- 本來就沒人看得到，不需要額外的發布開關再保護一次。可見性改為純粹由
-- 公開(is_public)與分享(skill_shares)決定。
ALTER TABLE "skills" DROP COLUMN "is_published";
