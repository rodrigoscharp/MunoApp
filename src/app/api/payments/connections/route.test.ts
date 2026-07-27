import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { encryptCredentials } from "@/lib/payments/credentials";
import type { PaymentProvider } from "@/lib/payments/types";

const TENANT = "tenant-1";

// --- mocks -----------------------------------------------------------------

const auth = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => auth() }));

const findMany = vi.fn();
const upsert = vi.fn();
const updateMany = vi.fn();
const deleteMany = vi.fn();
const findUnique = vi.fn();
const $transaction = vi.fn(async (ops: unknown[]) => Promise.all(ops as Promise<unknown>[]));

vi.mock("@/lib/prisma", () => ({
  prismaUnscoped: {
    paymentConnection: {
      findMany: (...args: unknown[]) => findMany(...args),
      findUnique: (...args: unknown[]) => findUnique(...args),
      upsert: (...args: unknown[]) => upsert(...args),
      updateMany: (...args: unknown[]) => updateMany(...args),
      deleteMany: (...args: unknown[]) => deleteMany(...args),
    },
    $transaction: (ops: unknown[]) => $transaction(ops),
  },
}));

const validateCredentials = vi.fn();

const fakeProvider = {
  meta: {
    id: "fake_gw",
    label: "Fake Gateway",
    docsUrl: "https://example.com",
    methods: ["PIX"],
    credentialFields: [
      { key: "apiKey", label: "Chave", help: "", type: "secret", required: true },
      { key: "webhookSecret", label: "Secret", help: "", type: "secret", required: false },
      { key: "environment", label: "Ambiente", help: "", type: "select", required: false },
    ],
  },
  validateCredentials: (creds: Record<string, string>) => validateCredentials(creds),
} as unknown as PaymentProvider;

vi.mock("@/lib/payments/factory", () => ({
  listPaymentProviders: () => [fakeProvider],
  getPaymentProvider: (id: string) => {
    if (id !== "fake_gw") throw new Error(`Provider de pagamento desconhecido: ${id}`);
    return fakeProvider;
  },
}));

const { GET, POST, DELETE } = await import("@/app/api/payments/connections/route");

// --- helpers ---------------------------------------------------------------

function postRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/payments/connections", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function deleteRequest(provider: string): NextRequest {
  return new NextRequest(
    `http://localhost/api/payments/connections?provider=${provider}`,
    { method: "DELETE" }
  );
}

function storedConnection(creds: Record<string, string>, overrides = {}) {
  return {
    id: "conn-1",
    tenantId: TENANT,
    provider: "fake_gw",
    credentials: encryptCredentials(creds),
    externalAccountId: "acc-9",
    status: "active",
    lastCheckedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  auth.mockResolvedValue({ user: { role: "ADMIN", tenantId: TENANT } });
  validateCredentials.mockResolvedValue({ ok: true, externalAccountId: "acc-9" });
  findMany.mockResolvedValue([]);
  findUnique.mockResolvedValue(null);
  upsert.mockResolvedValue({});
  updateMany.mockResolvedValue({ count: 0 });
  deleteMany.mockResolvedValue({ count: 1 });
});

// --- (a) credencial nunca volta em claro -----------------------------------

describe("GET", () => {
  it("devolve a credencial salva MASCARADA, nunca em claro", async () => {
    findMany.mockResolvedValue([storedConnection({ apiKey: "chave-secreta-123456" })]);

    const body = await (await GET()).json();
    const connection = body.providers[0].connection;

    expect(connection.credentials.apiKey).toBe("••••3456");
    expect(JSON.stringify(body)).not.toContain("chave-secreta-123456");
  });

  it("recusa quem não é ADMIN", async () => {
    auth.mockResolvedValue({ user: { role: "USER", tenantId: TENANT } });

    expect((await GET()).status).toBe(403);
  });
});

// --- (b) transição de status é dirigida por credencial ----------------------

describe("POST — status da conexão", () => {
  it("COM webhookSecret a conexão fica active", async () => {
    await POST(postRequest({ provider: "fake_gw", credentials: { apiKey: "k", webhookSecret: "s" } }));

    expect(upsert.mock.calls[0][0].create.status).toBe("active");
    expect(upsert.mock.calls[0][0].update.status).toBe("active");
  });

  it("SEM webhookSecret a conexão fica pending_webhook", async () => {
    await POST(postRequest({ provider: "fake_gw", credentials: { apiKey: "k" } }));

    expect(upsert.mock.calls[0][0].create.status).toBe("pending_webhook");
  });

  it("credencial recusada pelo gateway NÃO chega no banco", async () => {
    validateCredentials.mockResolvedValue({ ok: false, reason: "Token recusado" });

    const res = await POST(postRequest({ provider: "fake_gw", credentials: { apiKey: "ruim" } }));

    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: "Token recusado" });
    expect(upsert).not.toHaveBeenCalled();
    expect($transaction).not.toHaveBeenCalled();
  });
});

// --- (c) lastCheckedAt volta a null ao trocar credencial --------------------

describe("POST — prova do webhook", () => {
  it("trocar credencial reseta lastCheckedAt", async () => {
    await POST(postRequest({ provider: "fake_gw", credentials: { apiKey: "k", webhookSecret: "s" } }));

    expect(upsert.mock.calls[0][0].update.lastCheckedAt).toBeNull();
  });

  it("nunca carimba lastCheckedAt ao criar — só o webhook prova isso", async () => {
    await POST(postRequest({ provider: "fake_gw", credentials: { apiKey: "k", webhookSecret: "s" } }));

    expect(upsert.mock.calls[0][0].create).not.toHaveProperty("lastCheckedAt");
  });
});

// --- (d) um gateway ativo por vez ------------------------------------------

describe("POST — exclusividade", () => {
  it("ativar um gateway desativa os outros, na mesma transação", async () => {
    await POST(postRequest({ provider: "fake_gw", credentials: { apiKey: "k", webhookSecret: "s" } }));

    expect(updateMany).toHaveBeenCalledWith({
      where: { tenantId: TENANT, provider: { not: "fake_gw" } },
      data: { status: "disabled" },
    });
    expect($transaction).toHaveBeenCalledOnce();
  });
});

// --- schema ligado aos campos declarados pelo adapter ----------------------

describe("POST — validação de credencial", () => {
  it("recusa campo obrigatório ausente", async () => {
    const res = await POST(postRequest({ provider: "fake_gw", credentials: { webhookSecret: "s" } }));

    expect(res.status).toBe(422);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("recusa chave que o gateway não declara, em vez de guardar e devolver em claro", async () => {
    const res = await POST(
      postRequest({ provider: "fake_gw", credentials: { apiKey: "k", apelido: "minha conta" } })
    );

    expect(res.status).toBe(422);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("recusa provider desconhecido", async () => {
    const res = await POST(postRequest({ provider: "nubank", credentials: { apiKey: "k" } }));

    expect(res.status).toBe(400);
  });

  it("erro de validação sai como string, não como array de issues", async () => {
    const res = await POST(postRequest({ provider: "fake_gw", credentials: {} }));

    expect(typeof (await res.json()).error).toBe("string");
  });
});

// --- DELETE apaga a credencial ---------------------------------------------

describe("DELETE", () => {
  it("apaga a linha em vez de só marcar disabled", async () => {
    await DELETE(deleteRequest("fake_gw"));

    expect(deleteMany).toHaveBeenCalledWith({
      where: { tenantId: TENANT, provider: "fake_gw" },
    });
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("depois de desconectar, o provider volta sem conexão nenhuma", async () => {
    findMany.mockResolvedValue([]);
  findUnique.mockResolvedValue(null);

    const body = await (await DELETE(deleteRequest("fake_gw"))).json();

    expect(body.providers[0].connection).toBeNull();
  });
});

// --- fluxo de duas etapas -------------------------------------------------

describe("POST — cadastro em duas etapas", () => {
  it("na segunda etapa aceita só o webhookSecret, sem exigir recolar a chave", async () => {
    // Etapa 1 já aconteceu: a conexão existe com a chave salva.
    findUnique.mockResolvedValue(storedConnection({ apiKey: "chave-ja-salva" }));

    const res = await POST(postRequest({ provider: "fake_gw", credentials: { webhookSecret: "s" } }));

    expect(res.status).toBe(200);
    expect(upsert.mock.calls[0][0].update.status).toBe("active");
  });

  it("mescla: a chave antiga é preservada ao salvar só o secret", async () => {
    findUnique.mockResolvedValue(storedConnection({ apiKey: "chave-ja-salva" }));

    await POST(postRequest({ provider: "fake_gw", credentials: { webhookSecret: "s" } }));

    // validateCredentials recebe a credencial completa, não só o pedaço novo.
    expect(validateCredentials).toHaveBeenCalledWith({
      apiKey: "chave-ja-salva",
      webhookSecret: "s",
    });
  });

  it("sem conexão prévia, campo obrigatório ausente ainda é recusado", async () => {
    findUnique.mockResolvedValue(null);

    const res = await POST(postRequest({ provider: "fake_gw", credentials: { webhookSecret: "s" } }));

    expect(res.status).toBe(422);
    expect(upsert).not.toHaveBeenCalled();
  });
});
