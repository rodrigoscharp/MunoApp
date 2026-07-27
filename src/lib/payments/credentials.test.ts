import { describe, expect, it } from "vitest";
import {
  encryptCredentials,
  decryptCredentials,
  maskCredentials,
} from "@/lib/payments/credentials";
import type { CredentialField } from "@/lib/payments/types";

const fields: CredentialField[] = [
  { key: "accessToken", label: "Access token", help: "", type: "secret", required: true },
  { key: "environment", label: "Ambiente", help: "", type: "select", required: true },
];

describe("credentials", () => {
  it("faz round-trip de encrypt/decrypt", () => {
    const creds = { accessToken: "APP_USR-123456789", environment: "production" };
    const payload = encryptCredentials(creds);

    expect(payload).not.toContain("APP_USR");
    expect(decryptCredentials(payload)).toEqual(creds);
  });

  it("mascara só os campos secretos, preservando os últimos 4", () => {
    const masked = maskCredentials(
      { accessToken: "APP_USR-123456789", environment: "production" },
      fields
    );

    expect(masked.accessToken).toBe("••••6789");
    expect(masked.environment).toBe("production");
  });

  it("não vaza tamanho de segredo curto", () => {
    const masked = maskCredentials({ accessToken: "ab" }, fields);

    expect(masked.accessToken).toBe("••••");
  });

  it("rejeita payload corrompido", () => {
    expect(() => decryptCredentials("lixo")).toThrow();
  });
});
