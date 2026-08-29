import NextAuth from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { prismaUnscoped } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { z } from "zod";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

/**
 * Exportada para ser testável: dentro do objeto do CredentialsProvider a função
 * fica embrulhada pelo next-auth, e o teste só a alcançaria por
 * `provider.options.authorize` — um interno da biblioteca. Esta é a fronteira
 * entre um restaurante e outro, e precisa de teste direto (src/lib/auth.test.ts).
 */
export async function autorizarCredenciais(
  credentials: Partial<Record<string, unknown>> | undefined,
  request: Request
) {
  const parsed = loginSchema.safeParse(credentials);
  if (!parsed.success) return null;

  // Preenchido pelo proxy.ts a partir do subdomínio da request.
  const tenantId = request.headers.get("x-tenant-id");
  if (!tenantId) return null;

  // NextAuth roda esse callback dentro do bundle do proxy/middleware,
  // que tem seu próprio escopo global — por isso usa prismaUnscoped
  // (sem a extensão de tenant baseada em AsyncLocalStorage) com
  // tenantId explícito, em vez de runWithTenant().
  const user = await prismaUnscoped.user.findUnique({
    where: { tenantId_email: { tenantId, email: parsed.data.email } },
  });

  if (!user || !user.password) return null;

  const passwordMatch = await bcrypt.compare(parsed.data.password, user.password);
  if (!passwordMatch) return null;

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    tenantId: user.tenantId,
  };
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      authorize: autorizarCredenciais,
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as { role: string }).role;
        token.tenantId = (user as { tenantId: string }).tenantId;
      }
      return token;
    },
    async session({ session, token }) {
      if (token) {
        session.user.id = token.id as string;
        session.user.role = token.role as string;
        session.user.tenantId = token.tenantId as string;
      }
      return session;
    },
  },
});
