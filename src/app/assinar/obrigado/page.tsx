import Image from "next/image";
import { ConfirmacaoAssinatura } from "@/components/assinar/ConfirmacaoAssinatura";

/**
 * Para onde o Asaas devolve o cliente depois do pagamento (successUrl em
 * criarAssinatura). Antes dela, quem pagava ficava parado na página do
 * gateway, sem nenhuma tela dizendo o que tinha acontecido — e a única ponte
 * de volta era o e-mail de boas-vindas, que só sai depois de o webhook
 * chegar.
 *
 * A moldura fica aqui e o desfecho vive no ConfirmacaoAssinatura, porque é ele
 * que sabe se o restaurante já nasceu. Ver lá o porquê de a tela não afirmar
 * que está pronto antes de ter certeza.
 */
export default async function ObrigadoPage({
  searchParams,
}: {
  searchParams: Promise<{ i?: string }>;
}) {
  const { i } = await searchParams;

  return (
    <div className="flex min-h-screen flex-col items-center bg-brand-light px-4 py-10 sm:py-14">
      <div className="mb-9 flex justify-center">
        <Image
          src="/munowbg.png"
          alt="Muno"
          width={160}
          height={60}
          className="h-16 w-auto object-contain"
          priority
        />
      </div>

      <div className="w-full max-w-md">
        <div className="rounded-3xl border border-neutral-200/80 bg-white p-6 shadow-[0_1px_2px_rgba(30,61,47,0.04),0_12px_32px_-12px_rgba(30,61,47,0.14)] sm:p-8">
          <ConfirmacaoAssinatura inscricaoId={i} />

          {/* O único caminho de saída que a tela oferece, e de propósito: o
              próximo passo real está no e-mail, então o que sobra aqui é
              resolver o e-mail que não chegou. */}
          <div className="mt-8 rounded-2xl bg-forest-light/60 p-4">
            <p className="text-sm leading-relaxed text-forest-dark">
              <strong className="font-semibold">Não chegou?</strong> Confira o
              spam e aguarde alguns minutos. Se ainda assim não aparecer, chame
              a gente no WhatsApp. Seu pagamento já está registrado e resolvemos
              na hora.
            </p>
            <a
              href="https://wa.me/5512996419003"
              className="mt-3 inline-block text-sm font-semibold text-brand hover:underline"
            >
              Falar no WhatsApp
            </a>
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-neutral-500">
          Você pode fechar esta página. O e-mail chega de qualquer forma.
        </p>
      </div>
    </div>
  );
}
