"use client";

import { useCallback } from "react";

const SESSION_KEY = "muno-table";

export interface TableContext {
  tableId: string;
  tableNumber: number;
  tableName: string | null;
  tableToken: string;
}

export function useTable() {
  // O token é obrigatório: a aba sobrevive à mesa. Quem lê o QR da mesa 3 e
  // depois o da mesa 8 na mesma aba ainda tem a 3 guardada, e devolvê-la sem
  // conferir mandava o pedido para a mesa errada. Mesa de outro token é tratada
  // como ausente, e o chamador resolve pelo token da URL.
  const getTable = useCallback((token: string): TableContext | null => {
    if (typeof window === "undefined") return null;
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    try {
      const ctx = JSON.parse(raw) as TableContext;
      return ctx?.tableToken === token ? ctx : null;
    } catch {
      return null;
    }
  }, []);

  const setTable = useCallback((ctx: TableContext) => {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(ctx));
  }, []);

  const clearTable = useCallback(() => {
    sessionStorage.removeItem(SESSION_KEY);
  }, []);

  return { getTable, setTable, clearTable };
}
