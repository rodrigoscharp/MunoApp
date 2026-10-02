import { describe, expect, it, vi, afterEach } from "vitest";
import { topicoSeguro } from "./realtime-topic";

afterEach(() => vi.unstubAllEnvs());

describe("topicoSeguro", () => {
  it("é determinístico: servidor e endpoint chegam ao mesmo nome", () => {
    expect(topicoSeguro("t1", "kitchen-orders")).toBe(topicoSeguro("t1", "kitchen-orders"));
  });

  it("muda com o tenant e com o canal", () => {
    const base = topicoSeguro("t1", "kitchen-orders");
    expect(topicoSeguro("t2", "kitchen-orders")).not.toBe(base);
    expect(topicoSeguro("t1", "order:o1")).not.toBe(base);
  });

  // O nome antigo era `tenant:<id>:<canal>`, montável por quem conhecesse o
  // tenantId (que a sessão e a página de acompanhamento entregam ao navegador).
  it("não é o nome legado montável a partir de dados que o navegador conhece", () => {
    const nome = topicoSeguro("t1", "kitchen-orders");
    expect(nome).not.toBe("tenant:t1:kitchen-orders");
    expect(nome.startsWith("tenant:t1:kitchen-orders:")).toBe(true);
    expect(nome.split(":").pop()!.length).toBeGreaterThanOrEqual(20);
  });

  it("depende do segredo: outro segredo, outro nome", () => {
    vi.stubEnv("REALTIME_TOPIC_SECRET", "segredo-a");
    const a = topicoSeguro("t1", "kitchen-orders");
    vi.stubEnv("REALTIME_TOPIC_SECRET", "segredo-b");
    expect(topicoSeguro("t1", "kitchen-orders")).not.toBe(a);
  });

  it("sem REALTIME_TOPIC_SECRET deriva da chave de criptografia de credenciais", () => {
    vi.stubEnv("REALTIME_TOPIC_SECRET", "");
    vi.stubEnv("PAYMENT_TOKEN_ENCRYPTION_KEY", "a".repeat(64));
    const a = topicoSeguro("t1", "kitchen-orders");
    vi.stubEnv("PAYMENT_TOKEN_ENCRYPTION_KEY", "b".repeat(64));
    expect(topicoSeguro("t1", "kitchen-orders")).not.toBe(a);
  });

  it("em produção, sem nenhum segredo, falha em vez de usar um valor público", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("REALTIME_TOPIC_SECRET", "");
    vi.stubEnv("PAYMENT_TOKEN_ENCRYPTION_KEY", "");
    expect(() => topicoSeguro("t1", "kitchen-orders")).toThrow();
  });
});
