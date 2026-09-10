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
  session: { strategy: "jwt" },
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
      if (user) token.id = user.id;
      return token;
    },
    async session({ session, token }) {
      if (token) session.user.id = token.id as string;
      return session;
    },
  },
});
