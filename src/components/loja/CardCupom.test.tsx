// @vitest-environment jsdom
/**
 * O card do cupom em destaque. O campo do cupom só existe no checkout, e o
 * card mandava a pessoa colar "na sacola", onde não há campo nenhum.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { toastSuccess, toastSimples } = vi.hoisted(() => ({ toastSuccess: vi.fn(), toastSimples: vi.fn() }));
vi.mock("sonner", () => ({ toast: Object.assign(toastSimples, { success: toastSuccess }) }));

import { CardCupom } from "./CardCupom";

const CUPOM = { code: "BEMVINDO", beneficio: "10% off" };

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("CardCupom", () => {
  it("diz que o cupom vale no checkout, não na sacola", () => {
    const { container } = render(<CardCupom cupom={CUPOM} />);
    expect(container.textContent).toContain("no checkout");
    expect(container.textContent).not.toMatch(/sacola/i);
  });

  it("copiar avisa onde colar", async () => {
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    render(<CardCupom cupom={CUPOM} />);
    await userEvent.click(screen.getByRole("button", { name: "Copiar cupom BEMVINDO" }));
    await waitFor(() => expect(toastSuccess).toHaveBeenCalled());
    expect(writeText).toHaveBeenCalledWith("BEMVINDO");
    expect(String(toastSuccess.mock.calls[0][0])).toMatch(/finalizar o pedido/);
    expect(String(toastSuccess.mock.calls[0][0])).not.toMatch(/sacola/i);
  });

  it("sem área de transferência, diz o código e onde usar", async () => {
    Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
    render(<CardCupom cupom={CUPOM} />);
    await userEvent.click(screen.getByRole("button", { name: "Copiar cupom BEMVINDO" }));
    await waitFor(() => expect(toastSimples).toHaveBeenCalled());
    expect(String(toastSimples.mock.calls[0][0])).toMatch(/BEMVINDO.*finalizar o pedido/);
  });
});
