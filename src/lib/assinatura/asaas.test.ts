import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

describe("cliente Asaas da plataforma", () => {
  beforeEach(() => {
    vi.stubEnv("ASAAS_API_KEY", "chave-de-teste");
    vi.stubEnv("ASAAS_ENV", "sandbox");
    vi.stubEnv("ASAAS_WEBHOOK_TOKEN", "token-secreto");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    // Sem isto, vi.spyOn repetido em globalThis.fetch reaproveita o mesmo
    // spy entre os `it`: o histórico de chamadas do teste anterior continua
    // em mock.calls, e "calls[0]" deixa de ser a primeira chamada DESTE
    // teste. Descoberto rodando a suíte inteira, não teste a teste.
    vi.restoreAllMocks();
  });

  it("cria cliente no host de sandbox, autenticando por access_token", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: "cus_1" }), { status: 200 })
    );

    const { criarCliente } = await import("./asaas");
    const cliente = await criarCliente({
      nome: "Pizzaria do João",
      email: "joao@pizzaria.com",
      cpfCnpj: "11222333000181",
    });

    expect(cliente.id).toBe("cus_1");
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://api-sandbox.asaas.com/v3/customers");
    expect((init!.headers as Record<string, string>).access_token).toBe(
      "chave-de-teste"
    );
  });

  it("manda o valor em reais, não em centavos", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: "sub_1" }), { status: 200 })
    );

    const { criarAssinatura } = await import("./asaas");
    await criarAssinatura({
      customerId: "cus_1",
      valorCentavos: 11999,
      ciclo: "MENSAL",
      descricao: "Membro MUNO",
      externalReference: "insc_1",
    });

    const corpo = JSON.parse(String(fetchSpy.mock.calls[0][1]!.body));
    expect(corpo.value).toBe(119.99);
    expect(corpo.cycle).toBe("MONTHLY");
  });

  it("o anual é assinatura YEARLY, e respeita o método escolhido", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: "sub_2" }), { status: 200 })
    );

    const { criarAssinatura } = await import("./asaas");
    await criarAssinatura({
      customerId: "cus_1",
      valorCentavos: 131989,
      ciclo: "ANUAL",
      billingType: "PIX",
      descricao: "Membro MUNO",
      externalReference: "insc_1",
    });

    const corpo = JSON.parse(String(fetchSpy.mock.calls[0][1]!.body));
    expect(corpo.cycle).toBe("YEARLY");
    expect(corpo.billingType).toBe("PIX");
    expect(corpo.value).toBe(1319.89);
  });

  it("lista as cobranças de uma assinatura", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ data: [{ id: "pay_1", invoiceUrl: "https://x/i/1" }] }),
        { status: 200 }
      )
    );

    const { listarCobrancasDaAssinatura } = await import("./asaas");
    const { data } = await listarCobrancasDaAssinatura("sub_1");

    expect(data[0].invoiceUrl).toBe("https://x/i/1");
    expect(fetchSpy.mock.calls[0][0]).toBe(
      "https://api-sandbox.asaas.com/v3/subscriptions/sub_1/payments"
    );
  });

  it("propaga a descrição do erro do Asaas em vez de engolir", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ errors: [{ description: "CPF/CNPJ inválido" }] }),
        { status: 400 }
      )
    );

    const { criarCliente } = await import("./asaas");
    await expect(
      criarCliente({ nome: "x", email: "a@b.c", cpfCnpj: "1" })
    ).rejects.toThrow("CPF/CNPJ inválido");
  });

  it("recusa webhook com token errado, e aceita o certo", async () => {
    const { webhookAutorizado } = await import("./asaas");
    expect(webhookAutorizado("token-secreto")).toBe(true);
    expect(webhookAutorizado("outro")).toBe(false);
    expect(webhookAutorizado(null)).toBe(false);
  });
});
