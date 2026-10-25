// @vitest-environment jsdom
/**
 * A folha do produto fica na tela durante a animação de saída (280ms), com o
 * botão ainda clicável. Dois toques rápidos em "Pôr na sacola" punham o item
 * duas vezes na sacola.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

import { AddToCartModal } from "./AddToCartModal";

const ITEM = { id: "a", name: "X-Bacon", description: null, price: 30, imageUrl: null, available: true };

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function montar() {
  vi.useFakeTimers();
  const onConfirm = vi.fn();
  const onClose = vi.fn();
  render(<AddToCartModal item={ITEM} onConfirm={onConfirm} onClose={onClose} />);
  const confirmar = screen.getByRole("button", { name: /pôr na sacola/i });
  return { onConfirm, onClose, confirmar };
}

describe("AddToCartModal", () => {
  it("dois toques em 'Pôr na sacola' durante a saída confirmam uma vez só", () => {
    const { onConfirm, confirmar } = montar();
    fireEvent.click(confirmar);
    fireEvent.click(confirmar);
    act(() => vi.advanceTimersByTime(400));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledWith("", 1);
  });

  it("confirmar e logo fechar não faz as duas coisas", () => {
    const { onConfirm, onClose, confirmar } = montar();
    fireEvent.click(confirmar);
    fireEvent.click(screen.getByRole("button", { name: "Fechar" }));
    fireEvent.keyDown(document, { key: "Escape" });
    act(() => vi.advanceTimersByTime(400));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("fechar duas vezes chama onClose uma vez", () => {
    const { onClose } = montar();
    fireEvent.click(screen.getByRole("button", { name: "Fechar" }));
    fireEvent.keyDown(document, { key: "Escape" });
    act(() => vi.advanceTimersByTime(400));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
