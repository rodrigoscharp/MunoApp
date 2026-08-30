"use client";

import { useEffect, useState } from "react";
import { Letreiro } from "./Letreiro";

/**
 * O desfecho da compra, na volta do gateway.
 *
 * Dois estados, e eles não são "carregando" e "pronto": são a casa antes e
 * depois de abrir. O que a pessoa acabou de comprar é um endereço, que é o
 * letreiro do restaurante dela, então o painel mostra o letreiro apagado
 * enquanto o provisionamento não confirma e aceso quando confirma.
 *
 * O texto NÃO afirma que está pronto no primeiro estado, e essa é a decisão
 * central da tela: quando o cliente chega aqui o webhook pode não ter sido
 * entregue ainda. Dizer "seu restaurante está no ar" e mandá-lo entrar
 * produziria um endereço que responde 404, o que é pior que não dizer nada.
 *
 * O `?i=` que o gateway devolve é o id da Inscricao e serve para UMA coisa:
 * dizer qual registro verificar. Ele não autoriza nada — quem decide se o
 * restaurante nasce é o Asaas, consultado do nosso lado. Sem ele a página
 * continua correta, só nunca sai do letreiro apagado.
 */
export function ConfirmacaoAssinatura({ inscricaoId }: { inscricaoId?: string }) {
  const [casa, setCasa] = useState<{ nome: string; url: string } | null>(null);

  useEffect(() => {
    if (!inscricaoId) return;
    const controller = new AbortController();

    fetch("/api/assinar/reconciliar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inscricaoId }),
      signal: controller.signal,
    })
      .then((res) => res.json())
      .then((body) => {
        if (body?.provisionada && typeof body.url === "string") {
          setCasa({ nome: body.nome ?? "", url: body.url });
        }
      })
      .catch(() => {});

    return () => controller.abort();
  }, [inscricaoId]);

  const aceso = casa !== null;
  // Sem o protocolo: é o endereço como a pessoa vai dizer para os clientes
  // dela, não como o navegador escreve.
  const endereco = casa?.url.replace(/^https?:\/\//, "") ?? "";

  return (
    <>
      <div className="overflow-hidden rounded-3xl bg-forest-dark px-6 py-11 text-center sm:px-10 sm:py-14">
        {aceso ? (
          <>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/45">
              Sua casa está no ar
            </p>
            {/* O endereço é o troféu da tela: é o que a pessoa vai digitar,
                mandar no WhatsApp e imprimir no cardápio. */}
            <div className="mt-4">
              <Letreiro endereco={endereco} acende />
            </div>
          </>
        ) : (
          <>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/45">
              Acendendo as luzes
            </p>
            {/* Letreiro ainda sem texto: o endereço só é conhecido quando o
                provisionamento confirma, e a rota não confirma nem nega a
                existência do id antes disso. As três marcas seguram o lugar
                dele sem inventar um endereço que talvez não exista. */}
            <p className="letreiro-espera mt-5 flex justify-center gap-2" aria-hidden="true">
              {[0, 1, 2].map((i) => (
                <span key={i} className="h-2.5 w-2.5 rounded-full bg-brand" />
              ))}
            </p>
          </>
        )}
      </div>

      <h1 className="display mt-8 text-2xl leading-tight text-forest-dark">
        {aceso && casa.nome ? `Pronto, ${casa.nome}.` : "Pagamento confirmado."}
        <br />
        {aceso ? "Seu restaurante abriu." : "Estamos montando seu restaurante."}
      </h1>

      <p className="mt-4 text-sm leading-relaxed text-neutral-600">
        {aceso
          ? "O e-mail com o link para criar sua senha está a caminho. É por ele que você entra pela primeira vez."
          : "Em alguns minutos você recebe um e-mail com o endereço do seu cardápio e um link para criar sua senha. É por ele que você entra pela primeira vez."}
      </p>
    </>
  );
}
