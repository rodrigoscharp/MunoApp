import type { Cor } from "@/lib/saude/avaliar";

/** Os mesmos tokens que a pauta da visão geral usa para o mesmo sentido. */
export const TOM_DA_COR: Record<Cor, string> = {
  verde: "bg-console-grafico",
  amarelo: "bg-console-aviso",
  vermelho: "bg-console-alerta",
  neutro: "bg-console-mudo",
};

export const ROTULO_DA_COR: Record<Cor, string> = {
  verde: "funcionando",
  amarelo: "atenção",
  vermelho: "parado",
  neutro: "sem cor",
};
