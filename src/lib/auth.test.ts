/**
 * O `authorize` das credenciais é a fronteira entre "cliente do restaurante A" e
 * "cliente do restaurante B". Ele roda no bundle do proxy e por isso usa
 * `prismaUnscoped` — sem a extensão que injeta tenantId — com o tenant vindo do
 * header. Ou seja: aqui o escopo é manual, e nada corrige um esquecimento.
 *
 * O teste captura a configuração entregue ao NextAuth e chama o `authorize`
 * direto, sem subir servidor nem banco.
 */

import { describe, expect, it, vi, beforeEach, beforeAll, afterEach } from "vitest";
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

type Jwt = (args: {
  token: Record<string, unknown>;
  user?: Record<string, unknown>;
}) => Promise<Record<string, unknown> | null>;

const capturado: {
  config?: {
    providers: { authorize: Autorizar }[];
    session: { maxAge?: number };
    callbacks: { jwt: Jwt };
  };
} = {};

vi.mock("next-auth", () => ({
  default: (config: NonNullable<typeof capturado.config>) => {
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
    // Verificado agora há pouco: a reconferência de 5 minutos não dispara.
    const anterior = { id: "user-1", role: "ADMIN", tenantId: TENANT, verificadoEm: Date.now() };
    const token = await callbacks.jwt({ token: { ...anterior }, user: undefined });
    expect(token).toMatchObject(anterior);
  });
});


// O papel mora no JWT, e o JWT vive dias. Sem reconferir, o motoboy demitido e o
// ADMIN rebaixado continuam com o acesso antigo até o token expirar, e apagar o
// usuário não derruba a sessão que ele já tem aberta.
describe("sessão: o JWT é reconferido contra o banco", () => {
  const AGORA = new Date("2026-10-02T12:00:00Z").getTime();
  const CINCO_MIN = 5 * 60_000;

  function jwt() {
    return capturado.config!.callbacks.jwt;
  }
  const tokenRecente = () => ({
    id: "u1",
    role: "ADMIN",
    tenantId: TENANT,
    verificadoEm: AGORA - 60_000,
  });
  const tokenVelho = () => ({ ...tokenRecente(), verificadoEm: AGORA - CINCO_MIN - 1 });

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(AGORA);
    userFindUnique.mockReset();
  });
  afterEach(() => vi.useRealTimers());

  it("a sessão dura 7 dias, não os 30 do padrão", () => {
    expect(capturado.config!.session.maxAge).toBe(7 * 24 * 60 * 60);
  });

  it("no login carimba o momento da verificação", async () => {
    const token = await jwt()({
      token: {},
      user: { id: "u1", role: "ADMIN", tenantId: TENANT },
    });
    expect(token).toMatchObject({ id: "u1", role: "ADMIN", tenantId: TENANT, verificadoEm: AGORA });
    expect(userFindUnique).not.toHaveBeenCalled();
  });

  it("não vai ao banco enquanto a verificação é recente", async () => {
    await jwt()({ token: tokenRecente() });
    expect(userFindUnique).not.toHaveBeenCalled();
  });

  it("depois de 5 minutos reconfere e atualiza o papel", async () => {
    userFindUnique.mockResolvedValue({ role: "CUSTOMER", tenantId: TENANT });

    const token = await jwt()({ token: tokenVelho() });

    expect(userFindUnique).toHaveBeenCalledWith({
      where: { id: "u1" },
      select: { role: true, tenantId: true },
    });
    expect(token).toMatchObject({ role: "CUSTOMER", verificadoEm: AGORA });
  });

  it("usuário apagado perde a sessão", async () => {
    userFindUnique.mockResolvedValue(null);
    expect(await jwt()({ token: tokenVelho() })).toBeNull();
  });

  it("usuário que mudou de tenant perde a sessão", async () => {
    userFindUnique.mockResolvedValue({ role: "ADMIN", tenantId: "outro-restaurante" });
    expect(await jwt()({ token: tokenVelho() })).toBeNull();
  });

  // Um solavanco no banco não pode deslogar todo mundo de uma vez no sábado à
  // noite. A próxima requisição tenta de novo, porque verificadoEm não avançou.
  it("falha do banco mantém a sessão e tenta de novo na próxima", async () => {
    userFindUnique.mockRejectedValue(new Error("timeout"));
    const antigo = tokenVelho();

    const token = await jwt()({ token: antigo });

    expect(token).toMatchObject({ role: "ADMIN", verificadoEm: antigo.verificadoEm });
  });
});
