"use client";

import { useEffect, useState } from "react";

/**
 * Fecha a janela entre pagar e ter o restaurante.
 *
 * A página de obrigado não pode afirmar que ficou pronto: quando o cliente
 * chega nela, o webhook do Asaas pode não ter sido entregue ainda, e mandá-lo
 * tentar entrar produziria um endereço em 404. Então ela pergunta — uma vez,
 * ao montar — e só troca a mensagem quando a resposta é boa.
 *
 * O `id` vem da URL montada pelo próprio gateway. Ele não autoriza nada: a
 * rota o usa só para saber QUAL inscrição verificar, e quem decide se
 * provisiona é o Asaas. Ver o comentário em /api/assinar/reconciliar.
 *
 * Falha silenciosa de propósito: o job diário é a rede atrás desta. Mostrar
 * erro aqui assustaria quem acabou de pagar por um problema que provavelmente
 * já vai estar resolvido quando o e-mail chegar.
 */
export function ConfirmacaoAssinatura({ inscricaoId }: { inscricaoId?: string }) {
  const [url, setUrl] = useState<string | null>(null);

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
        if (body?.provisionada && typeof body.url === "string") setUrl(body.url);
      })
      .catch(() => {});

    return () => controller.abort();
  }, [inscricaoId]);

  // O título faz parte do desfecho, não da moldura: dizer "estamos montando"
  // acima de "já está no ar" seria contradizer a própria página.
  if (!url) {
    return (
      <>
        <h1 className="text-xl font-bold text-neutral-900">
          Pagamento recebido. Estamos montando seu restaurante.
        </h1>
        <p className="mt-4 text-sm text-neutral-600">
        Em alguns minutos você recebe um e-mail com o endereço do seu cardápio e
          um link para criar sua senha. É por ele que você entra pela primeira
          vez.
        </p>
      </>
    );
  }

  return (
    <>
      <h1 className="text-xl font-bold text-neutral-900">
        Pronto! Seu restaurante está no ar.
      </h1>
      <p className="mt-4 text-sm text-neutral-600">
        Ele fica em{" "}
        <a href={url} className="font-semibold text-brand hover:underline">
          {url.replace(/^https?:\/\//, "")}
        </a>
        .
      </p>
      <p className="mt-2 text-sm text-neutral-600">
        O e-mail com o link para criar sua senha está a caminho — é por ele que
        você entra pela primeira vez.
      </p>
    </>
  );
}
