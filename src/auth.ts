import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import { prisma } from "@/lib/prisma";

/**
 * DESIGN.md §2.1（v2）：GitHub OAuth 純粹用來「認人」，任何 GitHub 帳號
 * 都可登入，登入即 upsert 平台的 users 記錄。
 * （v1 的 org member 檢查已移除，scope 也不再需要 read:org。）
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    GitHub({
      authorization: { params: { scope: "read:user" } },
    }),
  ],
  callbacks: {
    async signIn({ profile }) {
      if (!profile?.login) return false;

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
