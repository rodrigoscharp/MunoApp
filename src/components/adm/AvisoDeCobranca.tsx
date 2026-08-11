"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AlertTriangle, Info, Lock } from "lucide-react";
import type { TomDoAviso } from "@/lib/assinatura/aviso";
import { BLOQUEIO_DIAS } from "@/lib/assinatura/regua";

interface Props {
  tom: TomDoAviso;
  dias: number;
}

const ESTILO: Record<TomDoAviso, { caixa: string; icone: string }> = {
  INFORMATIVO: {
    caixa: "bg-amber-50 border-amber-200 text-amber-900",
    icone: "text-amber-600",
  },
  FIRME: {
    caixa: "bg-orange-50 border-orange-200 text-orange-900",
    icone: "text-orange-600",
  },
  BLOQUEIO: {
    caixa: "bg-red-50 border-red-300 text-red-900",
    icone: "text-red-600",
  },
};

const ICONE = { INFORMATIVO: Info, FIRME: AlertTriangle, BLOQUEIO: Lock };

function emAtraso(dias: number): string {
  return dias === 1 ? "há 1 dia" : `há ${dias} dias`;
}

/**
 * A faixa de inadimplência do /adm.
 *
 * Quem decide o tom é avisoDeAtraso(), a partir da cobrança em aberto mais
 * antiga — nunca de assinatura.status, que fica em ATIVA nos seis primeiros
 * dias de atraso e deixaria a faixa muda justo quando ela ainda resolve.
 *
 * Nenhum texto aqui pode sugerir que o cardápio saiu do ar: ele não sai, em
 * nenhum dos três tons. Bloqueio é de gestão. Um dono de restaurante que lê
 * "sua loja está fora" no meio do almoço liga com raiva — e com razão, porque
 * não é verdade.
 */
export function AvisoDeCobranca({ tom, dias }: Props) {
  const pathname = usePathname();
  // Na própria tela de assinatura a faixa seria eco: a página inteira já é o
  // aviso, com os números e o que fazer.
  if (pathname.startsWith("/adm/assinatura")) return null;

  const { caixa, icone } = ESTILO[tom];
  const Icone = ICONE[tom];

  return (
    <div className={`flex gap-3 border rounded-xl p-4 mb-6 ${caixa}`}>
      <Icone size={18} className={`${icone} shrink-0 mt-0.5`} />
      <div className="text-sm leading-relaxed">
        {tom === "INFORMATIVO" && (
          <p>
            Sua mensalidade da Muno venceu <strong>{emAtraso(dias)}</strong>.
            Pague para manter o acesso à gestão do restaurante.
          </p>
        )}
        {tom === "FIRME" && (
          <p>
            Sua mensalidade da Muno está vencida <strong>{emAtraso(dias)}</strong>.
            Com {BLOQUEIO_DIAS} dias de atraso o acesso às telas de gestão é
            suspenso — seu cardápio continua no ar recebendo pedidos, mas você
            perde o painel.
          </p>
        )}
        {tom === "BLOQUEIO" && (
          <p>
            Sua mensalidade da Muno está vencida <strong>{emAtraso(dias)}</strong> e
            a gestão do restaurante está suspensa.{" "}
            <strong>Seu cardápio continua no ar e os pedidos seguem entrando
            normalmente.</strong>{" "}
            Assim que o pagamento for registrado, o acesso volta sozinho.
          </p>
        )}
        <Link
          href="/adm/assinatura"
          className="inline-block mt-2 font-semibold underline underline-offset-2"
        >
          Ver assinatura
        </Link>
      </div>
    </div>
  );
}
