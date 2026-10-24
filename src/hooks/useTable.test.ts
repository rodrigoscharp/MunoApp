// @vitest-environment jsdom
/**
 * A mesa guardada na aba.
 *
 * O QR de mesa abre o cardápio numa aba, e a aba guarda qual mesa é para o
 * checkout não precisar perguntar de novo. O perigo é a aba sobreviver à mesa:
 * o cliente lê o QR da mesa 3, troca de lugar, lê o QR da mesa 8 na mesma aba,
 * e o pedido sai para a mesa 3. Quem manda é o token da URL, sempre.
 */

import { describe, expect, it, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useTable } from "@/hooks/useTable";

const mesa3 = { tableId: "id-3", tableNumber: 3, tableName: null, tableToken: "token-3" };

beforeEach(() => sessionStorage.clear());

describe("useTable", () => {
  it("devolve a mesa guardada quando o token é o da URL", () => {
    const { result } = renderHook(() => useTable());
    result.current.setTable(mesa3);

    expect(result.current.getTable("token-3")).toEqual(mesa3);
  });

  it("ignora a mesa guardada quando a URL é de outra mesa", () => {
    const { result } = renderHook(() => useTable());
    result.current.setTable(mesa3);

    expect(result.current.getTable("token-8")).toBeNull();
  });

  it("devolve null sem nada guardado ou com lixo na chave", () => {
    const { result } = renderHook(() => useTable());
    expect(result.current.getTable("token-3")).toBeNull();

    sessionStorage.setItem("muno-table", "{quebrado");
    expect(result.current.getTable("token-3")).toBeNull();
  });
});
