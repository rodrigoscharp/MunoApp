import { Check, QrCode } from "lucide-react";
import { PLANO_BENEFICIOS, PRECOS, formatarBRL } from "@/lib/plans";
import { cn } from "@/lib/utils";
import { botaoBrasa, cartaoPainel, kicker } from "@/components/painel/estilos";

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
    <section
      aria-labelledby="oferta-mesas-qr"
      className={cn(cartaoPainel, "mb-6 overflow-hidden")}
    >
      <div className="flex flex-col gap-6 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-7">
        <div className="min-w-0">
          <p className={cn(kicker, "flex items-center gap-2 text-loja-preco")}>
            <QrCode size={14} aria-hidden="true" />
            Disponível para o seu restaurante
          </p>
          <h2 id="oferta-mesas-qr" className="manchete mt-2 text-[2rem] text-forest-dark">
            Mesas com QR Code
          </h2>
          {/* O delta, e não o preço cheio: quem já paga a mensalidade decide
              por quanto ela AUMENTA. "R$ 149,99" soa como uma segunda conta. */}
          <p className="mt-1 text-sm text-loja-tinta-2">
            Por{" "}
            <strong className="font-extrabold text-loja-preco">
              R$ {formatarBRL(diferencaCentavos)} a mais
            </strong>{" "}
            por mês.
          </p>

          <ul className="mt-4 space-y-2">
            {ganhos.map((ganho) => (
              <li
                key={ganho}
                className="flex items-start gap-2.5 text-sm text-loja-tinta"
              >
                <Check size={16} className="mt-0.5 shrink-0 text-forest" aria-hidden="true" />
                {ganho}
              </li>
            ))}
          </ul>
        </div>

        <a
          href={`https://wa.me/${WHATSAPP}?text=${encodeURIComponent(mensagem)}`}
          target="_blank"
          rel="noopener"
          className={cn(botaoBrasa, "h-12 shrink-0 text-sm")}
        >
          Quero migrar
        </a>
      </div>
    </section>
  );
}
