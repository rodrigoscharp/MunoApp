import { describe, expect, it } from "vitest";
import { ipPermitidoNoConsole } from "./ip-permitido";

describe("ipPermitidoNoConsole", () => {
  it("sem lista definida, qualquer origem entra", () => {
    expect(ipPermitidoNoConsole("203.0.113.9", undefined)).toBe(true);
    expect(ipPermitidoNoConsole(null, "")).toBe(true);
    expect(ipPermitidoNoConsole("203.0.113.9", " , ")).toBe(true);
  });

  it("com lista, só o IP listado entra", () => {
    expect(ipPermitidoNoConsole("203.0.113.9", "203.0.113.9,198.51.100.1")).toBe(true);
    expect(ipPermitidoNoConsole("192.0.2.5", "203.0.113.9,198.51.100.1")).toBe(false);
  });

  it("tolera espaços na lista", () => {
    expect(ipPermitidoNoConsole("198.51.100.1", "203.0.113.9 , 198.51.100.1")).toBe(true);
  });

  it("usa o primeiro IP do x-forwarded-for, que a borda define", () => {
    expect(ipPermitidoNoConsole("203.0.113.9, 10.0.0.1", "203.0.113.9")).toBe(true);
    // O cliente não consegue entrar acrescentando um IP permitido no fim.
    expect(ipPermitidoNoConsole("192.0.2.5, 203.0.113.9", "203.0.113.9")).toBe(false);
  });

  it("com lista definida e sem IP, nega", () => {
    expect(ipPermitidoNoConsole(null, "203.0.113.9")).toBe(false);
    expect(ipPermitidoNoConsole("", "203.0.113.9")).toBe(false);
  });
});
