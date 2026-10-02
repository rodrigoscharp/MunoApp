import { describe, expect, it, vi, afterEach } from "vitest";
import crypto from "node:crypto";
import { decryptSecret, encryptSecret, precisaReencriptar } from "./crypto";

const chave = () => crypto.randomBytes(32).toString("hex");

afterEach(() => vi.unstubAllEnvs());

describe("criptografia de segredos", () => {
  it("ida e volta", () => {
    vi.stubEnv("PAYMENT_TOKEN_ENCRYPTION_KEY", chave());
    expect(decryptSecret(encryptSecret('{"token":"abc"}'))).toBe('{"token":"abc"}');
  });

  it("cada criptografia usa um IV novo", () => {
    vi.stubEnv("PAYMENT_TOKEN_ENCRYPTION_KEY", chave());
    expect(encryptSecret("x")).not.toBe(encryptSecret("x"));
  });

  it("adulteração do texto cifrado é detectada", () => {
    vi.stubEnv("PAYMENT_TOKEN_ENCRYPTION_KEY", chave());
    const [iv, tag, dados] = encryptSecret("segredo").split(".");
    const adulterado = [iv, tag, Buffer.from("outra-coisa").toString("base64")].join(".");
    expect(() => decryptSecret(adulterado)).toThrow();
    expect(dados).toBeTruthy();
  });

  it("sem chave configurada falha alto", () => {
    vi.stubEnv("PAYMENT_TOKEN_ENCRYPTION_KEY", "");
    expect(() => encryptSecret("x")).toThrow("PAYMENT_TOKEN_ENCRYPTION_KEY");
  });
});

/**
 * Trocar a chave invalidava toda credencial de gateway de uma vez (nenhum
 * lojista conseguia mais cobrar). Com a chave anterior à mão, a troca deixa de
 * ser um salto no escuro: lê com as duas, e um script regrava com a nova.
 */
describe("rotação da chave", () => {
  it("lê um segredo gravado com a chave anterior quando ela está configurada", () => {
    const antiga = chave();
    vi.stubEnv("PAYMENT_TOKEN_ENCRYPTION_KEY", antiga);
    const cifrado = encryptSecret("token-do-lojista");

    vi.stubEnv("PAYMENT_TOKEN_ENCRYPTION_KEY", chave());
    vi.stubEnv("PAYMENT_TOKEN_ENCRYPTION_KEY_ANTERIOR", antiga);

    expect(decryptSecret(cifrado)).toBe("token-do-lojista");
  });

  it("sem a chave anterior, o segredo antigo não abre", () => {
    vi.stubEnv("PAYMENT_TOKEN_ENCRYPTION_KEY", chave());
    const cifrado = encryptSecret("x");

    vi.stubEnv("PAYMENT_TOKEN_ENCRYPTION_KEY", chave());
    vi.stubEnv("PAYMENT_TOKEN_ENCRYPTION_KEY_ANTERIOR", "");

    expect(() => decryptSecret(cifrado)).toThrow();
  });

  it("o que é gravado depois da troca usa sempre a chave nova", () => {
    const antiga = chave();
    const nova = chave();
    vi.stubEnv("PAYMENT_TOKEN_ENCRYPTION_KEY", nova);
    vi.stubEnv("PAYMENT_TOKEN_ENCRYPTION_KEY_ANTERIOR", antiga);
    const cifrado = encryptSecret("x");

    // Só a chave nova, sem a anterior, ainda abre.
    vi.stubEnv("PAYMENT_TOKEN_ENCRYPTION_KEY_ANTERIOR", "");
    expect(decryptSecret(cifrado)).toBe("x");
  });

  it("precisaReencriptar é verdadeiro só para o que a chave nova não abre", () => {
    const antiga = chave();
    vi.stubEnv("PAYMENT_TOKEN_ENCRYPTION_KEY", antiga);
    const velho = encryptSecret("x");

    const nova = chave();
    vi.stubEnv("PAYMENT_TOKEN_ENCRYPTION_KEY", nova);
    vi.stubEnv("PAYMENT_TOKEN_ENCRYPTION_KEY_ANTERIOR", antiga);

    expect(precisaReencriptar(velho)).toBe(true);
    expect(precisaReencriptar(encryptSecret("y"))).toBe(false);
  });

  it("chave anterior com tamanho errado é recusada com mensagem clara", () => {
    vi.stubEnv("PAYMENT_TOKEN_ENCRYPTION_KEY", chave());
    const outra = encryptSecret("x");
    vi.stubEnv("PAYMENT_TOKEN_ENCRYPTION_KEY", chave());
    vi.stubEnv("PAYMENT_TOKEN_ENCRYPTION_KEY_ANTERIOR", "curta");
    expect(() => decryptSecret(outra)).toThrow("PAYMENT_TOKEN_ENCRYPTION_KEY_ANTERIOR");
  });
});
