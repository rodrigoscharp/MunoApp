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

// Por tenant + e-mail, não por IP: o que se quer conter é tentativa repetida
// de senha contra UMA conta, sem punir várias contas atrás do mesmo NAT/rede
// de escritório digitando errado ao mesmo tempo.
const REVERIFICAR_A_CADA_MS = 5 * 60_000;

/**
 * O token foi emitido antes da última troca de senha? `iat` é em segundos, e a
 * comparação é com o segundo da troca, truncado: quem entra no mesmo segundo em
 * que a senha mudou acabou de usar a senha nova e não pode ser deslogado.
 */
function sessaoAnteriorATrocaDeSenha(iat: unknown, trocouEm: Date | null | undefined): boolean {
  if (!trocouEm || typeof iat !== "number") return false;
  return iat < Math.floor(trocouEm.getTime() / 1000);
}

const limitador = criarLimitador({ max: 10, janelaMs: 10 * 60 * 1000 });

// Por restaurante e IP, além do limite por conta acima: sem ele, quem sabe o
// e-mail do dono o tranca com 10 tentativas erradas, e quem testa muitos
// e-mails nunca esbarra no limite de nenhum deles. Folgado para a equipe de um
// salão inteiro atrás do mesmo wifi.
const limitadorPorIp = criarLimitador({ max: 30, janelaMs: 10 * 60 * 1000 });

// Hash bcrypt (12 rodadas) de uma string descartável. Existe só para gastar o
// mesmo tempo quando o e-mail não existe: sem isso, "usuário inexistente"
// responde ~200 ms mais rápido que "senha errada" e entrega quais contas
// existem.
const HASH_FALSO = "hash-descartavel";

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

  if (!limitador.permitir(`${tenantId}:${parsed.data.email}`, Date.now())) return null;

  const ip = (request.headers.get("x-forwarded-for") ?? "").split(",")[0].trim();
  if (ip && !limitadorPorIp.permitir(`${tenantId}:${ip}`, Date.now())) return null;

  // NextAuth roda esse callback dentro do bundle do proxy/middleware,
  // que tem seu próprio escopo global — por isso usa prismaUnscoped
  // (sem a extensão de tenant baseada em AsyncLocalStorage) com
  // tenantId explícito, em vez de runWithTenant().
  const user = await prismaUnscoped.user.findUnique({
    where: { tenantId_email: { tenantId, email: parsed.data.email } },
  });

  if (!user || !user.password) {
    await bcrypt.compare(parsed.data.password, HASH_FALSO);
    return null;
  }

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
  // 7 dias, e não os 30 do padrão: o JWT carrega o papel, e quanto mais vive,
  // mais tempo um acesso revogado continua valendo entre as reconferências.
  session: { strategy: "jwt", maxAge: 7 * 24 * 60 * 60 },
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
        token.verificadoEm = Date.now();
        return token;
      }

      // O papel mora no token e o token vive dias: sem reconferir, motoboy
      // demitido e ADMIN rebaixado continuam com o acesso antigo, e apagar o
      // usuário não derruba a sessão aberta. A cada 5 minutos, no máximo, uma
      // consulta confere se o usuário existe, é do mesmo tenant, e qual o papel.
      // Tokens emitidos antes desta checagem não têm verificadoEm e são
      // conferidos uma vez na próxima requisição.
      const verificadoEm = (token.verificadoEm as number | undefined) ?? 0;
      if (Date.now() - verificadoEm < REVERIFICAR_A_CADA_MS) return token;

      try {
        const atual = await prismaUnscoped.user.findUnique({
          where: { id: token.id as string },
          select: { role: true, tenantId: true, passwordChangedAt: true },
        });
        // null encerra a sessão.
        if (!atual || atual.tenantId !== token.tenantId) return null;
        if (sessaoAnteriorATrocaDeSenha(token.iat, atual.passwordChangedAt)) return null;
        token.role = atual.role;
        token.verificadoEm = Date.now();
      } catch {
        // Banco com soluço não pode deslogar todo mundo de uma vez. Mantém o
        // token como está; verificadoEm não avança, então a próxima
        // requisição tenta de novo.
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
