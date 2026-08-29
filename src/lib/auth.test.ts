/**
 * O `authorize` das credenciais é a fronteira entre "cliente do restaurante A" e
 * "cliente do restaurante B". Ele roda no bundle do proxy e por isso usa
 * `prismaUnscoped` — sem a extensão que injeta tenantId — com o tenant vindo do
 * header. Ou seja: aqui o escopo é manual, e nada corrige um esquecimento.
 *
 * O teste captura a configuração entregue ao NextAuth e chama o `authorize`
 * direto, sem subir servidor nem banco.
 */

import { describe, expect, it, vi, beforeEach, beforeAll } from "vitest";
import bcrypt from "bcryptjs";

const TENANT = "restaurante-a";
const SENHA = "senha-secreta";
let hashDaSenha: string;

const userFindUnique = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prismaUnscoped: { user: { findUnique: (...a: unknown[]) => userFindUnique(...a) } },
  prisma: {},
}));

type Autorizar = (
  credentials: Record<string, unknown> | undefined,
  request: Request
) => Promise<Record<string, unknown> | null>;

const capturado: { config?: { providers: { authorize: Autorizar }[] } } = {};

vi.mock("next-auth", () => ({
  default: (config: { providers: { authorize: Autorizar }[] }) => {
    capturado.config = config;
    return { handlers: {}, signIn: vi.fn(), signOut: vi.fn(), auth: vi.fn() };
  },
}));

let authorize: Autorizar;

beforeAll(async () => {
  hashDaSenha = await bcrypt.hash(SENHA, 10);
  const mod = await import("@/lib/auth");
  authorize = mod.autorizarCredenciais as unknown as Autorizar;
});

function requisicao(tenantId: string | null = TENANT) {
  return new Request("http://localhost/api/auth/callback/credentials", {
    headers: tenantId ? { "x-tenant-id": tenantId } : {},
  });
}

const usuarioDoBanco = () => ({
  id: "user-1",
  name: "Cliente",
  email: "cliente@exemplo.com",
  password: hashDaSenha,
  role: "CUSTOMER",
  tenantId: TENANT,
});

beforeEach(() => {
  vi.clearAllMocks();
  userFindUnique.mockResolvedValue(usuarioDoBanco());
});

describe("login com credenciais", () => {
  it("autentica com e-mail e senha corretos", async () => {
    const user = await authorize(
      { email: "cliente@exemplo.com", password: SENHA },
      requisicao()
    );
    expect(user).toMatchObject({ id: "user-1", role: "CUSTOMER", tenantId: TENANT });
  });

  it("nunca devolve o hash da senha para a sessão", async () => {
    const user = await authorize(
      { email: "cliente@exemplo.com", password: SENHA },
      requisicao()
    );
    expect(user).not.toHaveProperty("password");
  });

  it("recusa senha errada", async () => {
    const user = await authorize(
      { email: "cliente@exemplo.com", password: "outra-senha" },
      requisicao()
    );
    expect(user).toBeNull();
  });

  it("recusa e-mail que não existe", async () => {
    userFindUnique.mockResolvedValue(null);
    const user = await authorize(
      { email: "ninguem@exemplo.com", password: SENHA },
      requisicao()
    );
    expect(user).toBeNull();
  });

  it("recusa conta sem senha, criada por link de acesso", async () => {
    userFindUnique.mockResolvedValue({ ...usuarioDoBanco(), password: null });
    const user = await authorize(
      { email: "cliente@exemplo.com", password: SENHA },
      requisicao()
    );
    expect(user).toBeNull();
  });
});

describe("o login é preso ao restaurante do subdomínio", () => {
  it("procura o usuário pelo par tenant + e-mail", async () => {
    await authorize({ email: "cliente@exemplo.com", password: SENHA }, requisicao());
    expect(userFindUnique).toHaveBeenCalledWith({
      where: { tenantId_email: { tenantId: TENANT, email: "cliente@exemplo.com" } },
    });
  });

  it("usa o tenant do header, não um que venha nas credenciais", async () => {
    await authorize(
      { email: "cliente@exemplo.com", password: SENHA, tenantId: "restaurante-b" },
      requisicao(TENANT)
    );
    expect(userFindUnique.mock.calls[0][0].where.tenantId_email.tenantId).toBe(TENANT);
  });

  it("recusa quando o proxy não resolveu tenant nenhum", async () => {
    const user = await authorize(
      { email: "cliente@exemplo.com", password: SENHA },
      requisicao(null)
    );
    expect(user).toBeNull();
    expect(userFindUnique).not.toHaveBeenCalled();
  });

  it("não encontra o usuário quando ele é de outro restaurante", async () => {
    // O par (tenantId, email) é único: com o tenant do subdomínio A, o usuário
    // cadastrado em B simplesmente não existe para esta consulta.
    userFindUnique.mockResolvedValue(null);
    const user = await authorize(
      { email: "cliente@exemplo.com", password: SENHA },
      requisicao("restaurante-b")
    );
    expect(user).toBeNull();
  });
});

describe("credenciais malformadas nem chegam ao banco", () => {
  it.each([
    ["e-mail sem formato", { email: "cliente", password: SENHA }],
    ["senha curta", { email: "cliente@exemplo.com", password: "123" }],
    ["sem e-mail", { password: SENHA }],
    ["sem senha", { email: "cliente@exemplo.com" }],
    ["vazio", {}],
  ])("recusa %s", async (_nome, credenciais) => {
    const user = await authorize(credenciais, requisicao());
    expect(user).toBeNull();
    expect(userFindUnique).not.toHaveBeenCalled();
  });
});

describe("o token carrega o tenant para dentro da sessão", () => {
  it("copia id, role e tenantId do usuário para o JWT", async () => {
    const { callbacks } = capturado.config as unknown as {
      callbacks: {
        jwt: (p: Record<string, unknown>) => Promise<Record<string, unknown>>;
        session: (p: Record<string, unknown>) => Promise<Record<string, unknown>>;
      };
    };

    const token = await callbacks.jwt({
      token: {},
      user: { id: "user-1", role: "ADMIN", tenantId: TENANT },
    });
    expect(token).toMatchObject({ id: "user-1", role: "ADMIN", tenantId: TENANT });

    const session = await callbacks.session({
      session: { user: {} },
      token,
    });
    expect((session as { user: Record<string, unknown> }).user).toMatchObject({
      id: "user-1",
      role: "ADMIN",
      tenantId: TENANT,
    });
  });

  it("preserva o token quando a chamada não traz usuário (refresh)", async () => {
    const { callbacks } = capturado.config as unknown as {
      callbacks: { jwt: (p: Record<string, unknown>) => Promise<Record<string, unknown>> };
    };
    const anterior = { id: "user-1", role: "ADMIN", tenantId: TENANT };
    const token = await callbacks.jwt({ token: { ...anterior }, user: undefined });
    expect(token).toMatchObject(anterior);
  });
});
