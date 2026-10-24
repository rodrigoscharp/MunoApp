"use client";

import { useEffect } from "react";
import { useTable, type TableContext } from "@/hooks/useTable";

/**
 * Guarda na aba a mesa que o layout acabou de ler no servidor.
 *
 * Antes a tela de boas-vindas buscava a mesma mesa de novo em
 * /api/tables/token, e só ela guardava: quem entrava direto no cardápio de
 * outra mesa ficava com a anterior na aba. No layout, toda tela da mesa grava a
 * mesa do token da URL. Não renderiza nada.
 */
export function MesaDaAba({ tableId, tableNumber, tableName, tableToken }: TableContext) {
  const { setTable } = useTable();
  useEffect(() => {
    setTable({ tableId, tableNumber, tableName, tableToken });
  }, [setTable, tableId, tableNumber, tableName, tableToken]);
  return null;
}
