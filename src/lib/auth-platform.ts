import NextAuth from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { prismaUnscoped } from "@/lib/prisma";
import { criarLimitador } from "@/lib/rate-limit";
import bcrypt from "bcryptjs";
import { z } from "zod";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

// Por e-mail, não por IP: o console da plataforma tem poucos admins
// cadastrados (às vezes um só — ver platform:senha em AGENTS.md), e o que
// importa conter é tentativa repetida de senha contra UMA conta, não volume
// por origem de rede.
const REVERIFICAR_A_CADA_MS = 5 * 60_000;

const limitador = criarLimitador({ max: 10, janelaMs: 10 * 60 * 1000 });

// Instância separada da autenticação de restaurante (src/lib/auth.ts) de
// propósito. O nome de cookie próprio é o que garante o isolamento: uma sessão
// de restaurante nunca é aceita aqui, e vice-versa, sem depender de nenhuma
// checagem que alguém possa esquecer.
export const {
  handlers: platformHandlers,
  signIn: signInPlatform,
  signOut: signOutPlatform,
  auth: authPlatform,
} = NextAuth({
  // 7 dias, e não os 30 do padrão: esta sessão enxerga todos os restaurantes.
  session: { strategy: "jwt", maxAge: 7 * 24 * 60 * 60 },
  pages: { signIn: "/platform/login" },
  cookies: {
    sessionToken: {
      name: "muno-platform.session-token",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: process.env.NODE_ENV === "production",
      },
    },
  },
  basePath: "/api/platform/auth",
  providers: [
    CredentialsProvider({
      name: "platform-credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Senha", type: "password" },
      },
      async authorize(credentials) {
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) return null;

        if (!limitador.permitir(parsed.data.email, Date.now())) return null;

        const admin = await prismaUnscoped.platformAdmin.findUnique({
          where: { email: parsed.data.email },
        });
        if (!admin) return null;

        const ok = await bcrypt.compare(parsed.data.password, admin.password);
        if (!ok) return null;

        return { id: admin.id, name: admin.nome, email: admin.email };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.verificadoEm = Date.now();
        return token;
      }

      // Admin removido, ou sessão roubada de quem saiu, não pode valer até o
      // token expirar. A cada 5 minutos, no máximo, confere se ele ainda
      // existe; null encerra a sessão. Banco com soluço mantém o token e tenta
      // de novo na próxima requisição (verificadoEm não avança).
      const verificadoEm = (token.verificadoEm as number | undefined) ?? 0;
      if (Date.now() - verificadoEm < REVERIFICAR_A_CADA_MS) return token;
      try {
        const admin = await prismaUnscoped.platformAdmin.findUnique({
          where: { id: token.id as string },
          select: { id: true, passwordChangedAt: true },
        });
        if (!admin) return null;
        // Token emitido antes da última troca de senha: encerra. Truncado ao
        // segundo porque `iat` é em segundos.
        if (
          admin.passwordChangedAt &&
          typeof token.iat === "number" &&
          token.iat < Math.floor(admin.passwordChangedAt.getTime() / 1000)
        ) {
          return null;
        }
        token.verificadoEm = Date.now();
      } catch {
        // mantém
      }
      return token;
    },
    async session({ session, token }) {
      if (token) session.user.id = token.id as string;
      return session;
    },
  },
});
