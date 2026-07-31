import { describe, expect, it } from "vitest";
import { canViewOrder } from "./order-access";

const dono = { id: "u1", role: "CUSTOMER" };
const outroCliente = { id: "u2", role: "CUSTOMER" };
const admin = { id: "u3", role: "ADMIN" };

describe("canViewOrder", () => {
  it("libera pedido sem dono para visitante anônimo", () => {
    expect(canViewOrder({ userId: null }, null)).toBe(true);
  });

  it("libera pedido sem dono para qualquer usuário logado", () => {
    expect(canViewOrder({ userId: null }, outroCliente)).toBe(true);
  });

  it("nega pedido com dono para visitante anônimo", () => {
    expect(canViewOrder({ userId: "u1" }, null)).toBe(false);
  });

  it("libera pedido com dono para o próprio dono", () => {
    expect(canViewOrder({ userId: "u1" }, dono)).toBe(true);
  });

  it("nega pedido com dono para outro cliente", () => {
    expect(canViewOrder({ userId: "u1" }, outroCliente)).toBe(false);
  });

  it("libera pedido com dono para ADMIN", () => {
    expect(canViewOrder({ userId: "u1" }, admin)).toBe(true);
  });
});
