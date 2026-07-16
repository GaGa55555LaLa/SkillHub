import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import { prisma } from "@/lib/prisma";

const GITHUB_ORG = process.env.GITHUB_ORG!;

/**
 * DESIGN.md §2.1：GitHub OAuth 純粹用來「認人」。
 * signIn callback 以使用者自己的 OAuth token 檢查是否為指定 org 的成員，
 * 非成員一律拒絕登入。
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    GitHub({
      authorization: { params: { scope: "read:user read:org" } },
    }),
  ],
  callbacks: {
    async signIn({ account, profile }) {
      if (!account?.access_token || !profile?.login) return false;

      // GET /orgs/{org}/memberships/{username} 需要 admin；
      // 改用使用者自己的 token 查自己的 membership。
      const res = await fetch(
        `https://api.github.com/user/memberships/orgs/${GITHUB_ORG}`,
        {
          headers: {
            Authorization: `Bearer ${account.access_token}`,
            Accept: "application/vnd.github+json",
          },
        }
      );
      if (!res.ok) return false;
      const membership = (await res.json()) as { state?: string };
      if (membership.state !== "active") return false;

      await prisma.user.upsert({
        where: { githubId: BigInt(Number(profile.id)) },
        update: {
          githubLogin: profile.login as string,
          githubAvatarUrl: (profile.avatar_url as string) ?? null,
        },
        create: {
          githubId: BigInt(Number(profile.id)),
          githubLogin: profile.login as string,
          githubAvatarUrl: (profile.avatar_url as string) ?? null,
        },
      });
      return true;
    },
    async jwt({ token, profile }) {
      if (profile?.login) {
        token.githubLogin = profile.login as string;
        token.githubId = Number(profile.id);
      }
      return token;
    },
    async session({ session, token }) {
      if (token.githubLogin) {
        session.user.githubLogin = token.githubLogin as string;
        session.user.githubId = token.githubId as number;
      }
      return session;
    },
  },
});

declare module "next-auth" {
  interface Session {
    user: {
      name?: string | null;
      email?: string | null;
      image?: string | null;
      githubLogin?: string;
      githubId?: number;
    };
  }
}
