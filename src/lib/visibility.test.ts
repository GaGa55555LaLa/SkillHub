import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { visibleSkillsWhere, canViewSkill } from "@/lib/visibility";
import type { Viewer } from "@/lib/viewer";

/**
 * 整合測試：直接打真實的 Postgres（沒有另外配獨立測試庫），所有 fixture
 * 都用不會跟真實資料衝突的 githubId / repoFullName，並在 afterAll 清乾淨。
 * DESIGN.md §8（v2）要求的情境：公開/私有、個人分享/群組分享、
 * 群組成員/非成員、「未發布即使被分享或公開也不可見」的硬規則、
 * 擁有者永遠可見。
 */

const TEST_TAG = "__vitest_visibility__";

let ownerUser: { id: string; githubId: bigint };
let granteeUser: { id: string; githubId: bigint };
let strangerUser: { id: string; githubId: bigint };

let group: { id: string };
let otherGroup: { id: string };

let publicSource: { id: string };
let publicSourceSkill: { id: string };
let publicSourceUnpublishedSkill: { id: string };

let privateSource: { id: string };
let publicSkill: { id: string };
let noShareSkill: { id: string };
let userSharedSkill: { id: string };
let groupSharedSkill: { id: string };
let unpublishedSharedSkill: { id: string };

let repoShareSource: { id: string };
let repoSharedSkillA: { id: string };
let repoSharedSkillB: { id: string };

const createdSourceIds: string[] = [];
const createdUserIds: string[] = [];
const createdGroupIds: string[] = [];

async function makeSource(
  repoSuffix: string,
  overrides: Partial<Prisma.SkillSourceUncheckedCreateInput> = {}
) {
  const source = await prisma.skillSource.create({
    data: {
      repoFullName: `${TEST_TAG}/${repoSuffix}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      ownerUserId: ownerUser.id,
      installationId: BigInt(1),
      visibility: "private",
      ...overrides,
    },
  });
  createdSourceIds.push(source.id);
  return source;
}

beforeAll(async () => {
  ownerUser = await prisma.user.create({
    data: { githubId: BigInt(900101), githubLogin: `${TEST_TAG}_owner` },
  });
  granteeUser = await prisma.user.create({
    data: { githubId: BigInt(900102), githubLogin: `${TEST_TAG}_grantee` },
  });
  strangerUser = await prisma.user.create({
    data: { githubId: BigInt(900103), githubLogin: `${TEST_TAG}_stranger` },
  });
  createdUserIds.push(ownerUser.id, granteeUser.id, strangerUser.id);

  // 群組：granteeUser 是 group 成員；otherGroup 沒有任何測試對象加入
  group = await prisma.group.create({
    data: { name: `${TEST_TAG}_group`, ownerUserId: ownerUser.id },
  });
  otherGroup = await prisma.group.create({
    data: { name: `${TEST_TAG}_other_group`, ownerUserId: ownerUser.id },
  });
  createdGroupIds.push(group.id, otherGroup.id);
  await prisma.groupMember.create({
    data: { groupId: group.id, userId: granteeUser.id },
  });

  // 公開 source：已發布 skill 全平台可見；未發布 skill 即使 source 公開也不可見
  publicSource = await makeSource("public-source", { isPublic: true });
  publicSourceSkill = await prisma.skill.create({
    data: { sourceId: publicSource.id, path: "a", name: "public-source-skill", isPublished: true },
  });
  publicSourceUnpublishedSkill = await prisma.skill.create({
    data: { sourceId: publicSource.id, path: "b", name: "public-source-unpublished", isPublished: false },
  });

  // 私有 source：混合各種 skill 情境
  privateSource = await makeSource("private-source");
  publicSkill = await prisma.skill.create({
    data: { sourceId: privateSource.id, path: "public", name: "public-skill", isPublished: true, isPublic: true },
  });
  noShareSkill = await prisma.skill.create({
    data: { sourceId: privateSource.id, path: "noshare", name: "no-share", isPublished: true },
  });
  userSharedSkill = await prisma.skill.create({
    data: { sourceId: privateSource.id, path: "usershared", name: "user-shared", isPublished: true },
  });
  groupSharedSkill = await prisma.skill.create({
    data: { sourceId: privateSource.id, path: "groupshared", name: "group-shared", isPublished: true },
  });
  unpublishedSharedSkill = await prisma.skill.create({
    data: { sourceId: privateSource.id, path: "unpubshared", name: "unpublished-shared", isPublished: false },
  });

  await prisma.skillShare.create({
    data: {
      skillId: userSharedSkill.id,
      sourceId: privateSource.id,
      granteeUserId: granteeUser.id,
      grantedById: ownerUser.id,
    },
  });
  await prisma.skillShare.create({
    data: {
      skillId: groupSharedSkill.id,
      sourceId: privateSource.id,
      granteeGroupId: group.id,
      grantedById: ownerUser.id,
    },
  });
  await prisma.skillShare.create({
    data: {
      skillId: unpublishedSharedSkill.id,
      sourceId: privateSource.id,
      granteeUserId: granteeUser.id,
      grantedById: ownerUser.id,
    },
  });

  // source 層級分享（skillId = null）：底下所有已發布 skill 對 grantee 可見
  repoShareSource = await makeSource("repo-share");
  repoSharedSkillA = await prisma.skill.create({
    data: { sourceId: repoShareSource.id, path: "a", name: "repo-share-a", isPublished: true },
  });
  repoSharedSkillB = await prisma.skill.create({
    data: { sourceId: repoShareSource.id, path: "b", name: "repo-share-b", isPublished: true },
  });
  await prisma.skillShare.create({
    data: {
      skillId: null,
      sourceId: repoShareSource.id,
      granteeUserId: granteeUser.id,
      grantedById: ownerUser.id,
    },
  });
});

afterAll(async () => {
  await prisma.skillShare.deleteMany({ where: { sourceId: { in: createdSourceIds } } });
  await prisma.skill.deleteMany({ where: { sourceId: { in: createdSourceIds } } });
  await prisma.skillSource.deleteMany({ where: { id: { in: createdSourceIds } } });
  await prisma.group.deleteMany({ where: { id: { in: createdGroupIds } } });
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
});

function viewerFor(user: { id: string; githubId: bigint }, groupIds: string[] = []): Viewer {
  return { userId: user.id, githubId: user.githubId, githubLogin: "test", groupIds };
}

describe("visibility (v2)", () => {
  it("公開 source 的已發布 skill 對任何登入使用者可見", async () => {
    expect(await canViewSkill(publicSourceSkill.id, viewerFor(strangerUser))).toBe(true);
  });

  it("公開 source 的未發布 skill 對非擁有者不可見", async () => {
    expect(await canViewSkill(publicSourceUnpublishedSkill.id, viewerFor(strangerUser))).toBe(false);
  });

  it("單一 skill 設公開（source 未公開）對任何登入使用者可見", async () => {
    expect(await canViewSkill(publicSkill.id, viewerFor(strangerUser))).toBe(true);
  });

  it("私有且未分享的 skill 對非擁有者不可見", async () => {
    expect(await canViewSkill(noShareSkill.id, viewerFor(strangerUser))).toBe(false);
    expect(await canViewSkill(noShareSkill.id, viewerFor(granteeUser))).toBe(false);
  });

  it("個人分享：被分享者可見，其他人不可見", async () => {
    expect(await canViewSkill(userSharedSkill.id, viewerFor(granteeUser))).toBe(true);
    expect(await canViewSkill(userSharedSkill.id, viewerFor(strangerUser))).toBe(false);
  });

  it("群組分享：群組成員可見", async () => {
    expect(await canViewSkill(groupSharedSkill.id, viewerFor(granteeUser, [group.id]))).toBe(true);
  });

  it("群組分享：非成員不可見（即使帶了別的群組）", async () => {
    expect(await canViewSkill(groupSharedSkill.id, viewerFor(strangerUser, [otherGroup.id]))).toBe(false);
    expect(await canViewSkill(groupSharedSkill.id, viewerFor(strangerUser, []))).toBe(false);
  });

  it("source 層級分享：底下所有已發布 skill 都對被分享者可見", async () => {
    expect(await canViewSkill(repoSharedSkillA.id, viewerFor(granteeUser))).toBe(true);
    expect(await canViewSkill(repoSharedSkillB.id, viewerFor(granteeUser))).toBe(true);
  });

  it("source 層級分享：沒被分享到的人不可見", async () => {
    expect(await canViewSkill(repoSharedSkillA.id, viewerFor(strangerUser))).toBe(false);
  });

  it("未發布的 skill 即使被分享也不可見（硬規則）", async () => {
    expect(await canViewSkill(unpublishedSharedSkill.id, viewerFor(granteeUser))).toBe(false);
  });

  it("擁有者永遠看得到自己的 skill，即使未發布、未分享", async () => {
    expect(await canViewSkill(publicSourceUnpublishedSkill.id, viewerFor(ownerUser))).toBe(true);
    expect(await canViewSkill(unpublishedSharedSkill.id, viewerFor(ownerUser))).toBe(true);
    expect(await canViewSkill(noShareSkill.id, viewerFor(ownerUser))).toBe(true);
  });

  it("visibleSkillsWhere 撈出的清單跟 canViewSkill 逐一檢查的結果一致", async () => {
    const allTestSkillIds = [
      publicSourceSkill.id,
      publicSourceUnpublishedSkill.id,
      publicSkill.id,
      noShareSkill.id,
      userSharedSkill.id,
      groupSharedSkill.id,
      unpublishedSharedSkill.id,
      repoSharedSkillA.id,
      repoSharedSkillB.id,
    ];

    for (const viewer of [
      viewerFor(granteeUser, [group.id]),
      viewerFor(strangerUser),
      viewerFor(ownerUser),
    ]) {
      const visible = await prisma.skill.findMany({
        where: { AND: [{ id: { in: allTestSkillIds } }, visibleSkillsWhere(viewer)] },
        select: { id: true },
      });
      const visibleIds = new Set(visible.map((s) => s.id));
      for (const id of allTestSkillIds) {
        expect(visibleIds.has(id)).toBe(await canViewSkill(id, viewer));
      }
    }
  });
});
