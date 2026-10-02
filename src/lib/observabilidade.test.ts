import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { reportarErro, _limparLimiteDeEnvio } from "./observabilidade";

let log: ReturnType<typeof vi.spyOn>;
let fetchSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  _limparLimiteDeEnvio();
  log = vi.spyOn(console, "error").mockImplementation(() => {});
  fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("ok"));
  vi.stubEnv("ERROR_WEBHOOK_URL", "");
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("reportarErro", () => {
  it("escreve uma linha JSON com a origem, a mensagem e os ids", async () => {
    await reportarErro({ origem: "cron/assinaturas", erro: new Error("boom"), extra: { tenantId: "t1" } });

    const linha = JSON.parse(log.mock.calls[0][0] as string);
    expect(linha).toMatchObject({ nivel: "erro", origem: "cron/assinaturas", mensagem: "boom", tenantId: "t1" });
  });

  it("não chama a rede quando ERROR_WEBHOOK_URL não está definida", async () => {
    await reportarErro({ origem: "x", erro: new Error("a") });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("avisa o canal quando a URL está definida", async () => {
    vi.stubEnv("ERROR_WEBHOOK_URL", "https://hooks.example/abc");
    await reportarErro({ origem: "webhook/pagamento", erro: new Error("estornar") });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://hooks.example/abc");
    expect(JSON.parse((init as RequestInit).body as string).text).toContain("webhook/pagamento: estornar");
  });

  it("o mesmo erro repetido no mesmo minuto manda uma mensagem só", async () => {
    vi.stubEnv("ERROR_WEBHOOK_URL", "https://hooks.example/abc");
    await reportarErro({ origem: "cron", erro: new Error("igual") });
    await reportarErro({ origem: "cron", erro: new Error("igual") });
    await reportarErro({ origem: "cron", erro: new Error("outro") });

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(log).toHaveBeenCalledTimes(3); // o log local nunca é suprimido
  });

  it("e-mail dentro da mensagem do erro é mascarado, no log e no canal", async () => {
    vi.stubEnv("ERROR_WEBHOOK_URL", "https://hooks.example/abc");
    await reportarErro({ origem: "x", erro: new Error("falha ao enviar para ana@pizzaria.com") });

    expect(log.mock.calls[0][0]).not.toContain("ana@pizzaria.com");
    expect((fetchSpy.mock.calls[0][1] as RequestInit).body).not.toContain("ana@pizzaria.com");
  });

  it("nunca lança, nem quando o canal está fora do ar", async () => {
    vi.stubEnv("ERROR_WEBHOOK_URL", "https://hooks.example/abc");
    fetchSpy.mockRejectedValue(new Error("rede"));

    await expect(reportarErro({ origem: "x", erro: new Error("a") })).resolves.toBeUndefined();
  });

  it("guarda o digest do erro do React", async () => {
    await reportarErro({ origem: "render", erro: Object.assign(new Error("x"), { digest: "abc123" }) });
    expect(JSON.parse(log.mock.calls[0][0] as string).digest).toBe("abc123");
  });
});

describe("reportarErro com erro de SDK", () => {
  it("usa a message do objeto simples, em vez de [object Object]", async () => {
    await reportarErro({ origem: "x", erro: { name: "validation_error", message: "domain is not verified" } });
    expect(JSON.parse(log.mock.calls[0][0] as string).mensagem).toBe("domain is not verified");
  });
});
