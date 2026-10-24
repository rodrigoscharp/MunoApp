import { describe, expect, it } from "vitest";
import { cursorDoChat, intervaloDoChat, juntarMensagens, type ChatMessageData } from "./useChat";

const m = (id: string, createdAt: string, extra: Partial<ChatMessageData> = {}): ChatMessageData => ({
  id,
  orderId: "o1",
  senderRole: "ADMIN",
  senderId: null,
  senderName: null,
  content: id,
  createdAt,
  ...extra,
});

describe("cursorDoChat", () => {
  it("sem mensagem confirmada não há cursor: a primeira busca é o histórico inteiro", () => {
    expect(cursorDoChat([])).toBeNull();
    expect(cursorDoChat([m("t", "2026-10-24T10:00:00.000Z", { pending: true })])).toBeNull();
  });

  it("é a mais recente confirmada, 1ms antes, para não perder a do mesmo milissegundo", () => {
    const cursor = cursorDoChat([
      m("a", "2026-10-24T10:00:00.000Z"),
      m("b", "2026-10-24T10:05:00.000Z"),
      m("falhou", "2026-10-24T11:00:00.000Z", { failed: true }),
    ]);
    expect(cursor).toBe("2026-10-24T10:04:59.999Z");
  });
});

describe("juntarMensagens", () => {
  it("não repete a que voltou pela folga do cursor e mantém a ordem", () => {
    const juntas = juntarMensagens(
      [m("a", "2026-10-24T10:00:00.000Z"), m("b", "2026-10-24T10:05:00.000Z")],
      [m("b", "2026-10-24T10:05:00.000Z"), m("c", "2026-10-24T10:06:00.000Z")]
    );
    expect(juntas.map((x) => x.id)).toEqual(["a", "b", "c"]);
  });
});

describe("intervaloDoChat", () => {
  it("esparso com o canal de pé, apertado sem ele", () => {
    expect(intervaloDoChat(true)).toBeGreaterThan(intervaloDoChat(false));
    expect(intervaloDoChat(false)).toBe(15_000);
  });
});
