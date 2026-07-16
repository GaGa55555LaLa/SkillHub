import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { visibleSkillsWhere, canViewSkill } from "@/lib/visibility";

/**
 * 整合測試：直接打真實的 Postgres（沒有另外配獨立測試庫），所有 fixture
 * 都用不會跟真實資料衝突的 githubId / repoFullName，並在 afterAll 清乾淨。
 * DESIGN.md §8 要求的情境：org 成員可見性、被分享/未被分享、
 * team 成員/非成員、以及「未發布 = 即使被分享也看不到」這條硬規則。
 */

const TEST_TAG = "__vitest_visibility__";
const TEAM_ID = BigInt(900001);
const OTHER_TEAM_ID = BigInt(900002);

let ownerUser: { id: string };
let viewerUser: { id: string; githubId: bigint };
let teammateViewer: { id: string; githubId: bigint };
let outsiderViewer: { id: string; githubId: bigint };

let orgSource: { id: string };
let orgPublishedSkill: { id: string };
let orgUnpublishedSkill: { id: string };

let noShareSource: { id: string };
let noShareSkill: { id: string };

let skillShareSource: { id: string };
let sharedSkill: { id: string };
let notSharedSiblingSkill: { id: string };

let repoShareSource: { id: string };
let repoSharedSkillA: { id: string };
let repoSharedSkillB: { id: string };

let teamShareSource: { id: string };
let teamSharedSkill: { id: string };

let unpublishedSharedSource: { id: string };
let unpublishedSharedSkill: { id: string };

let ownedByViewerSource: { id: string };
let ownedByViewerSkill: { id: string };

const createdSourceIds: string[] = [];
const createdUserIds: string[] = [];

async function makeSource(
  repoSuffix: string,
  overrides: Partial<Prisma.SkillSourceUncheckedCreateInput> = {}
) {
  const source = await prisma.skillSource.create({
    data: {
      repoFullName: `${TEST_TAG}/${repoSuffix}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      ownerType: "org",
      installationId: BigInt(1),
      visibility: "private",
      ...overrides,
    },
  });
  createdSourceIds.push(source.id);
  return source;
}

beforeAll(async () => {
  const owner = await prisma.user.create({
    data: { githubId: BigInt(900101), githubLogin: `${TEST_TAG}_owner` },
  });
  const viewer = await prisma.user.create({
    data: { githubId: BigInt(900102), githubLogin: `${TEST_TAG}_viewer` },
  });
  const teammate = await prisma.user.create({
    data: { githubId: BigInt(900103), githubLogin: `${TEST_TAG}_teammate` },
  });
  const outsider = await prisma.user.create({
    data: { githubId: BigInt(900104), githubLogin: `${TEST_TAG}_outsider` },
  });
  ownerUser = owner;
  viewerUser = viewer;
  teammateViewer = teammate;
  outsiderViewer = outsider;
  createdUserIds.push(owner.id, viewer.id, teammate.id, outsider.id);

  // org 來源：已發布 / 未發布各一個
  orgSource = await makeSource("org-repo", { ownerType: "org" });
  orgPublishedSkill = await prisma.skill.create({
    data: { sourceId: orgSource.id, path: "published", name: "org-published", isPublished: true },
  });
  orgUnpublishedSkill = await prisma.skill.create({
    data: { sourceId: orgSource.id, path: "unpublished", name: "org-unpublished", isPublished: false },
  });

  // 完全沒分享
  noShareSource = await makeSource("no-share", {
    ownerType: "user",
    ownerUserId: ownerUser.id,
    shareMode: "selected_only",
  });
  noShareSkill = await prisma.skill.create({
    data: { sourceId: noShareSource.id, path: "a", name: "no-share", isPublished: true },
  });

  // skill 層級分享：兩個 skill，只分享其中一個給 viewer
  skillShareSource = await makeSource("skill-share", {
    ownerType: "user",
    ownerUserId: ownerUser.id,
    shareMode: "selected_only",
  });
  sharedSkill = await prisma.skill.create({
    data: { sourceId: skillShareSource.id, path: "shared", name: "skill-shared", isPublished: true },
  });
  notSharedSiblingSkill = await prisma.skill.create({
    data: { sourceId: skillShareSource.id, path: "sibling", name: "skill-not-shared", isPublished: true },
  });
  await prisma.skillShare.create({
    data: {
      skillId: sharedSkill.id,
      sourceId: skillShareSource.id,
      granteeType: "user",
      granteeId: viewerUser.githubId,
      grantedById: ownerUser.id,
    },
  });

  // source 層級分享：整個 repo 分享給 viewer，底下所有 skill 都該可見
  repoShareSource = await makeSource("repo-share", {
    ownerType: "user",
    ownerUserId: ownerUser.id,
    shareMode: "whole_repo",
  });
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
      granteeType: "user",
      granteeId: viewerUser.githubId,
      grantedById: ownerUser.id,
    },
  });

  // team 分享：分享給 TEAM_ID，teammateViewer 屬於這個 team，outsiderViewer 不屬於
  teamShareSource = await makeSource("team-share", {
    ownerType: "user",
    ownerUserId: ownerUser.id,
    shareMode: "selected_only",
  });
  teamSharedSkill = await prisma.skill.create({
    data: { sourceId: teamShareSource.id, path: "a", name: "team-shared", isPublished: true },
  });
  await prisma.skillShare.create({
    data: {
      skillId: teamSharedSkill.id,
      sourceId: teamShareSource.id,
      granteeType: "team",
      granteeId: TEAM_ID,
      grantedById: ownerUser.id,
    },
  });

  // 未發布但被分享：published 這個硬規則要贏過分享
  unpublishedSharedSource = await makeSource("unpublished-shared", {
    ownerType: "user",
    ownerUserId: ownerUser.id,
    shareMode: "selected_only",
  });
  unpublishedSharedSkill = await prisma.skill.create({
    data: { sourceId: unpublishedSharedSource.id, path: "a", name: "unpublished-shared", isPublished: false },
  });
  await prisma.skillShare.create({
    data: {
      skillId: unpublishedSharedSkill.id,
      sourceId: unpublishedSharedSource.id,
      granteeType: "user",
      granteeId: viewerUser.githubId,
      grantedById: ownerUser.id,
    },
  });

  // 自己的 skill：viewer 自己是 owner，即使未發布、沒分享，也該看得到
  ownedByViewerSource = await makeSource("owned-by-viewer", {
    ownerType: "user",
    ownerUserId: viewerUser.id,
    shareMode: "selected_only",
  });
  ownedByViewerSkill = await prisma.skill.create({
    data: { sourceId: ownedByViewerSource.id, path: "a", name: "owned-by-viewer", isPublished: false },
  });
});

afterAll(async () => {
  await prisma.skillShare.deleteMany({ where: { sourceId: { in: createdSourceIds } } });
  await prisma.skill.deleteMany({ where: { sourceId: { in: createdSourceIds } } });
  await prisma.skillSource.deleteMany({ where: { id: { in: createdSourceIds } } });
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
});

function viewerFor(user: { id: string; githubId: bigint }, teamIds: bigint[] = []) {
  return { userId: user.id, githubId: user.githubId, teamIds };
}

describe("visibility", () => {
  it("org 已發布 skill 對任何人可見", async () => {
    expect(await canViewSkill(orgPublishedSkill.id, viewerFor(viewerUser))).toBe(true);
    expect(await canViewSkill(orgPublishedSkill.id, viewerFor(outsiderViewer))).toBe(true);
  });

  it("org 未發布 skill 不可見", async () => {
    expect(await canViewSkill(orgUnpublishedSkill.id, viewerFor(viewerUser))).toBe(false);
  });

  it("完全沒分享的個人 skill，非擁有者看不到", async () => {
    expect(await canViewSkill(noShareSkill.id, viewerFor(viewerUser))).toBe(false);
  });

  it("skill 層級分享：只有被分享的那個 skill 可見，同 source 的手足不可見", async () => {
    expect(await canViewSkill(sharedSkill.id, viewerFor(viewerUser))).toBe(true);
    expect(await canViewSkill(notSharedSiblingSkill.id, viewerFor(viewerUser))).toBe(false);
  });

  it("skill 層級分享：分享給別人，我看不到", async () => {
    expect(await canViewSkill(sharedSkill.id, viewerFor(outsiderViewer))).toBe(false);
  });

  it("source 層級分享：整個 repo 底下的 skill 都可見", async () => {
    expect(await canViewSkill(repoSharedSkillA.id, viewerFor(viewerUser))).toBe(true);
    expect(await canViewSkill(repoSharedSkillB.id, viewerFor(viewerUser))).toBe(true);
  });

  it("source 層級分享：沒被分享到的人看不到", async () => {
    expect(await canViewSkill(repoSharedSkillA.id, viewerFor(outsiderViewer))).toBe(false);
  });

  it("team 分享：team 成員看得到", async () => {
    expect(
      await canViewSkill(teamSharedSkill.id, viewerFor(teammateViewer, [TEAM_ID]))
    ).toBe(true);
  });

  it("team 分享：非 team 成員看不到（即使帶了別的 team id）", async () => {
    expect(
      await canViewSkill(teamSharedSkill.id, viewerFor(outsiderViewer, [OTHER_TEAM_ID]))
    ).toBe(false);
    expect(await canViewSkill(teamSharedSkill.id, viewerFor(outsiderViewer, []))).toBe(false);
  });

  it("未發布的 skill 即使被分享也不可見（published 是硬規則）", async () => {
    expect(await canViewSkill(unpublishedSharedSkill.id, viewerFor(viewerUser))).toBe(false);
  });

  it("擁有者永遠看得到自己的 skill，即使未發布、沒分享", async () => {
    expect(await canViewSkill(ownedByViewerSkill.id, viewerFor(viewerUser))).toBe(true);
  });

  it("visibleSkillsWhere 撈出的清單跟 canViewSkill 逐一檢查的結果一致", async () => {
    const viewer = viewerFor(viewerUser);
    const allTestSkillIds = [
      orgPublishedSkill.id,
      orgUnpublishedSkill.id,
      noShareSkill.id,
      sharedSkill.id,
      notSharedSiblingSkill.id,
      repoSharedSkillA.id,
      repoSharedSkillB.id,
      teamSharedSkill.id,
      unpublishedSharedSkill.id,
      ownedByViewerSkill.id,
    ];

    const visible = await prisma.skill.findMany({
      where: { AND: [{ id: { in: allTestSkillIds } }, visibleSkillsWhere(viewer)] },
      select: { id: true },
    });
    const visibleIds = new Set(visible.map((s) => s.id));

    for (const id of allTestSkillIds) {
      expect(visibleIds.has(id)).toBe(await canViewSkill(id, viewer));
    }
  });
});
