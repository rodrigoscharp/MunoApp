import Image from "next/image";
import { ConfirmacaoAssinatura } from "@/components/assinar/ConfirmacaoAssinatura";

/**
 * Para onde o Asaas devolve o cliente depois do pagamento (successUrl em
 * criarAssinatura). Antes dela, quem pagava ficava parado na página do
 * gateway, sem nenhuma tela dizendo o que tinha acontecido — e a única ponte
 * de volta era o e-mail de boas-vindas, que só sai depois de o webhook
 * chegar.
 *
 * Ela NÃO afirma que o restaurante está pronto, e essa é a decisão central:
 * quando o cliente chega aqui, o webhook pode não ter sido entregue ainda.
 * Afirmar "seu restaurante está no ar" e mandá-lo tentar entrar produziria um
 * endereço que ainda dá 404 — pior que não dizer nada. O texto descreve o que
 * vem a seguir e assume que pode demorar.
 *
 * O `?i=` que o gateway devolve é o id da Inscricao, e serve para UMA coisa:
 * dizer qual registro verificar. Ele não autoriza nada — quem decide se o
 * restaurante nasce é o Asaas, consultado do nosso lado. Sem ele, a página
 * continua correta, só não consegue antecipar o desfecho.
 */
export default async function ObrigadoPage({
  searchParams,
}: {
  searchParams: Promise<{ i?: string }>;
}) {
  const { i } = await searchParams;
  return (
    <div className="min-h-screen bg-neutral-50 flex flex-col items-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-8">
          <Image
            src="/munowbg.png"
            alt="Muno"
            width={160}
            height={60}
            className="h-14 w-auto object-contain"
          />
        </div>

        <div className="bg-white border border-neutral-200 rounded-2xl p-6">
          <ConfirmacaoAssinatura inscricaoId={i} />

          <div className="mt-6 rounded-xl bg-neutral-50 border border-neutral-200 p-4">
            <p className="text-sm text-neutral-600">
              <strong className="text-neutral-900">Não chegou?</strong> Confira
              o spam e aguarde alguns minutos. Se ainda assim não aparecer,
              chame a gente no WhatsApp — seu pagamento já está registrado e
              resolvemos na hora.
            </p>
            <a
              href="https://wa.me/5512996419003"
              className="mt-3 inline-block text-sm font-semibold text-brand hover:underline"
            >
              Falar no WhatsApp
            </a>
          </div>

          <p className="mt-6 text-xs text-neutral-400">
            Você pode fechar esta página. O e-mail chega de qualquer forma.
          </p>
        </div>
      </div>
    </div>
  );
}
