// @vitest-environment jsdom
/**
 * O registro do service worker.
 *
 * O caso que importa aqui não é o registro: é o DESREGISTRO em
 * desenvolvimento. localhost é a única origem onde o build de produção e o
 * `npm run dev` compartilham o mesmo host, e service worker vive por origem,
 * não por build. Quem rodasse `next build && next start` uma vez ficaria com
 * ele interceptando o dev server para sempre, servindo a tela de offline a
 * cada vez que o servidor estivesse fora do ar.
 *
 * NODE_ENV é "test" aqui, que é justamente o ramo de não-produção.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { RegistroServiceWorker } from "./RegistroServiceWorker";

const unregister = vi.fn().mockResolvedValue(true);
const register = vi.fn().mockResolvedValue({});
const getRegistrations = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  getRegistrations.mockResolvedValue([{ unregister }]);
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: { register, getRegistrations },
  });
});

afterEach(cleanup);

describe("RegistroServiceWorker", () => {
  it("fora de produção, apaga o service worker que sobrou", async () => {
    render(<RegistroServiceWorker />);
    await vi.waitFor(() => expect(unregister).toHaveBeenCalled());
    expect(register).not.toHaveBeenCalled();
  });

  it("não registra nada fora de produção", async () => {
    render(<RegistroServiceWorker />);
    await new Promise((r) => setTimeout(r, 10));
    expect(register).not.toHaveBeenCalled();
  });

  it("sobrevive a navegador sem serviceWorker", () => {
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: undefined,
    });
    expect(() => render(<RegistroServiceWorker />)).not.toThrow();
  });
});
