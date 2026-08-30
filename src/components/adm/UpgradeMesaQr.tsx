import { Check, QrCode } from "lucide-react";
import { PLANO_BENEFICIOS, PRECOS, formatarBRL } from "@/lib/plans";

/**
 * A oferta de Mesas QR para quem está no Membro MUNO, na tela de assinatura.
 *
 * Preço e benefícios saem de plans.ts, a fonte única que plans.test.ts cruza
 * com public/vendas/index.html. Escrevê-los à mão aqui recriaria a divergência
 * que a landing já teve com o CRM antes de 26/08/2026, num lugar onde ninguém
 * confere: a tela que o cliente pagante abre.
 *
 * **Não existe upgrade self-service.** Nada no código altera o plano de um
 * Tenant depois do provisionamento: mudar de plano exige trocar o valor da
 * assinatura no Asaas e decidir a proporcionalidade do mês em curso. Enquanto
 * isso não existir, o botão leva ao WhatsApp com a mensagem pronta, que é o
 * mesmo caminho da consultoria na landing. Um botão que prometesse a migração
 * na hora seria a promessa sem entrega que a página de vendas acabou de
 * deixar de fazer.
 */
const WHATSAPP = "5512996419003";

export function UpgradeMesaQr() {
  const diferencaCentavos =
    PRECOS.MEMBRO_MESA_QR.mensalCentavos - PRECOS.MEMBRO.mensalCentavos;

  // "Tudo do Membro MUNO" é um ponteiro para o outro plano, não uma
  // funcionalidade. Para quem JÁ é Membro MUNO ele não oferece nada, e gastaria
  // a primeira linha da lista com uma obviedade.
  const ganhos = PLANO_BENEFICIOS.MEMBRO_MESA_QR.filter(
    (b) => !b.startsWith("Tudo do")
  );

  const mensagem = `Olá! Sou cliente Muno e quero migrar para o plano Membro + Mesas QR.`;

  return (
    <div className="mb-6 overflow-hidden rounded-3xl border border-neutral-200/80 bg-white shadow-[0_1px_2px_rgba(30,61,47,0.04),0_12px_32px_-12px_rgba(30,61,47,0.14)]">
      <div className="flex flex-col gap-6 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-7">
        <div>
          <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-forest/60">
            <QrCode size={14} />
            Disponível para o seu restaurante
          </p>
          <h2 className="display mt-2 text-xl text-forest-dark">
            Mesas com QR Code
          </h2>
          {/* O delta, e não o preço cheio: quem já paga a mensalidade decide
              por quanto ela AUMENTA. "R$ 149,99" soa como uma segunda conta. */}
          <p className="mt-1 text-sm text-neutral-600">
            Por{" "}
            <strong className="font-semibold text-brand">
              R$ {formatarBRL(diferencaCentavos)} a mais
            </strong>{" "}
            por mês.
          </p>

          <ul className="mt-4 space-y-2">
            {ganhos.map((ganho) => (
              <li
                key={ganho}
                className="flex items-start gap-2.5 text-sm text-neutral-700"
              >
                <Check size={16} className="mt-0.5 shrink-0 text-forest" />
                {ganho}
              </li>
            ))}
          </ul>
        </div>

        <a
          href={`https://wa.me/${WHATSAPP}?text=${encodeURIComponent(mensagem)}`}
          target="_blank"
          rel="noopener"
          className="shrink-0 rounded-xl bg-brand px-6 py-3 text-center text-sm font-semibold text-white transition hover:bg-brand-dark"
        >
          Quero migrar
        </a>
      </div>
    </div>
  );
}
