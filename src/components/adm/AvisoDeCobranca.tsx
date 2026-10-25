"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AlertTriangle, Info, Lock } from "lucide-react";
import type { TomDoAviso } from "@/lib/assinatura/aviso";
import { BLOQUEIO_DIAS_UTEIS } from "@/lib/assinatura/regua";

interface Props {
  tom: TomDoAviso;
  dias: number;
}

// As três cores do sistema da loja, que diferem em claridade e não só em
// matiz: pêssego claro para o lembrete, pêssego cheio para o firme e o marrom
// fundo do selo de alerta para o bloqueio. Todo par texto/fundo passa de 4,5:1.
const ESTILO: Record<TomDoAviso, { caixa: string; icone: string; link: string }> = {
  INFORMATIVO: {
    caixa: "bg-loja-pessego-claro text-loja-tinta",
    icone: "bg-loja-papel text-loja-preco",
    link: "text-loja-preco",
  },
  FIRME: {
    caixa: "bg-loja-pessego text-[#4A2412]",
    icone: "bg-loja-papel text-loja-brasa",
    link: "text-[#4A2412]",
  },
  BLOQUEIO: {
    caixa: "bg-[#5A2A14] text-[#FBEADB]",
    icone: "bg-[#7A3A1C] text-[#FDBA8C]",
    link: "text-[#FDBA8C]",
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

  const { caixa, icone, link } = ESTILO[tom];
  const Icone = ICONE[tom];

  return (
    <div role="status" className={`mb-6 flex gap-3.5 rounded-[20px] p-4 shadow-loja sm:p-5 ${caixa}`}>
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${icone}`}>
        <Icone size={18} aria-hidden="true" />
      </span>
      <div className="text-[13.5px] leading-relaxed">
        {tom === "INFORMATIVO" && (
          <p>
            Sua mensalidade da Muno venceu <strong>{emAtraso(dias)}</strong>.
            Pague para manter o acesso à gestão do restaurante.
          </p>
        )}
        {tom === "FIRME" && (
          <p>
            Sua mensalidade da Muno está vencida <strong>{emAtraso(dias)}</strong>.
            Com {BLOQUEIO_DIAS_UTEIS} dias úteis de atraso o acesso às telas de gestão é
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
          className={`mt-1 inline-flex min-h-11 items-center font-extrabold underline underline-offset-4 ${link}`}
        >
          Ver assinatura
        </Link>
      </div>
    </div>
  );
}
