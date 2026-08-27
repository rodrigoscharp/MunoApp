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

  // Existe para uma decisão de uma via só: o cron apaga inscrição vencida
  // para soltar o slug, e apagar a de quem já pagou destrói o único vínculo
  // entre aquele dinheiro e um cliente. Por isso a pergunta é "há pagamento
  // pago?", e a resposta em dúvida tem que ser sim.
  describe("assinaturaTemPagamentoConfirmado", () => {
    function respostaCom(status: string[]) {
      return new Response(
        JSON.stringify({ data: status.map((s, i) => ({ id: `pay_${i}`, status: s })) }),
        { status: 200 }
      );
    }

    it.each(["CONFIRMED", "RECEIVED", "RECEIVED_IN_CASH"])(
      "%s conta como pago",
      async (status) => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(respostaCom([status]));

        const { assinaturaTemPagamentoConfirmado } = await import("./asaas");

        expect(await assinaturaTemPagamentoConfirmado("sub_1")).toBe(true);
      }
    );

    it.each(["PENDING", "OVERDUE", "REFUNDED"])(
      "%s não conta como pago",
      async (status) => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(respostaCom([status]));

        const { assinaturaTemPagamentoConfirmado } = await import("./asaas");

        expect(await assinaturaTemPagamentoConfirmado("sub_1")).toBe(false);
      }
    );

    it("basta uma cobrança paga entre várias", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        respostaCom(["OVERDUE", "PENDING", "RECEIVED"])
      );

      const { assinaturaTemPagamentoConfirmado } = await import("./asaas");

      expect(await assinaturaTemPagamentoConfirmado("sub_1")).toBe(true);
    });

    // A falha aqui é ambígua, e ambiguidade não pode virar exclusão. Quem
    // chama usa isto para decidir se APAGA a inscrição: em dúvida, o certo é
    // segurar. Um slug preso por mais um dia é irrelevante; um cliente
    // pagante sem rastro, não.
    it("propaga o erro em vez de responder false quando o Asaas falha", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(JSON.stringify({ errors: [{ description: "fora do ar" }] }), { status: 500 })
      );

      const { assinaturaTemPagamentoConfirmado } = await import("./asaas");

      await expect(assinaturaTemPagamentoConfirmado("sub_1")).rejects.toThrow();
    });
  });
  // Sem callback, quem paga fica parado na página do Asaas: nenhuma tela diz
  // que o restaurante está sendo criado, e a única ponte de volta vira o
  // e-mail de boas-vindas. Se ele atrasar, o cliente pagou e está olhando
  // para o nada.
  it("manda o cliente de volta para a página de obrigado depois de pagar", async () => {
    vi.stubEnv("ROOT_DOMAIN", "www.munoapp.com.br,munoapp.com.br");
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: "sub_1" }), { status: 200 })
    );

    const { criarAssinatura } = await import("./asaas");
    await criarAssinatura({
      customerId: "cus_1",
      valorCentavos: 11999,
      ciclo: "MENSAL",
      descricao: "Muno Membro",
      externalReference: "insc-1",
    });

    const corpo = JSON.parse(fetchSpy.mock.calls[0][1]!.body as string);
    expect(corpo.callback.successUrl).toBe(
      "https://munoapp.com.br/assinar/obrigado"
    );
    expect(corpo.callback.autoRedirect).toBe(true);
  });

  // CONVENIÊNCIA NÃO DERRUBA RECEITA — a mesma regra do Lead no checkout e do
  // e-mail no provisionamento, agora aqui.
  //
  // O callback exige que a conta Asaas tenha um site cadastrado em Minha
  // Conta > Informações. Sem isso o POST inteiro volta 400 e NENHUMA
  // assinatura é criada: o checkout morre por causa da página de obrigado.
  // Descoberto contra o sandbox real — o teste que só afirmava o corpo
  // enviado passava feliz.
  it("assinatura nasce mesmo quando o Asaas recusa o callback", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            errors: [{ description: "Não há nenhum domínio configurado em sua conta." }],
          }),
          { status: 400 }
        )
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "sub_sem_callback" }), { status: 200 })
      );

    const { criarAssinatura } = await import("./asaas");
    const assinatura = await criarAssinatura({
      customerId: "cus_1",
      valorCentavos: 11999,
      ciclo: "MENSAL",
      descricao: "Muno Membro",
      externalReference: "insc-1",
    });

    expect(assinatura.id).toBe("sub_sem_callback");
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    const segundoCorpo = JSON.parse(fetchSpy.mock.calls[1][1]!.body as string);
    expect(segundoCorpo.callback).toBeUndefined();
    // O resto do pedido é idêntico: só o callback sai.
    expect(segundoCorpo.value).toBe(119.99);
    expect(segundoCorpo.externalReference).toBe("insc-1");
  });

  it("erro que persiste sem o callback propaga, em vez de virar sucesso falso", async () => {
    // mockImplementation, e não mockResolvedValue: o corpo de uma Response só
    // pode ser lido uma vez, e a retentativa recebe a MESMA instância — o
    // segundo res.json() falharia e a mensagem viraria o texto genérico, por
    // artefato do teste e não por comportamento do código.
    vi.spyOn(globalThis, "fetch").mockImplementation(
      async () =>
        new Response(JSON.stringify({ errors: [{ description: "CPF inválido" }] }), {
          status: 400,
        })
    );

    const { criarAssinatura } = await import("./asaas");

    await expect(
      criarAssinatura({
        customerId: "cus_1",
        valorCentavos: 11999,
        ciclo: "MENSAL",
        descricao: "Muno Membro",
        externalReference: "insc-1",
      })
    ).rejects.toThrow("CPF inválido");
  });

  // Falha de REDE é diferente de recusa do gateway: o POST pode ter chegado e
  // criado a assinatura antes de a conexão cair. Repetir ali cobraria o
  // cliente duas vezes. Só recusa com resposta HTTP autoriza a segunda
  // tentativa.
  it("falha de rede não vira retentativa, para não duplicar assinatura", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("ECONNRESET"));

    const { criarAssinatura } = await import("./asaas");

    await expect(
      criarAssinatura({
        customerId: "cus_1",
        valorCentavos: 11999,
        ciclo: "MENSAL",
        descricao: "Muno Membro",
        externalReference: "insc-1",
      })
    ).rejects.toThrow("ECONNRESET");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
