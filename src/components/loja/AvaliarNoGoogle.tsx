import { normalizarLinkDeAvaliacao } from "@/lib/avaliacao-google";
import { cartao } from "@/components/loja/estilos";

/** O "G" de quatro cores do Google, como aparece nos selos de avaliação. */
export function LogoDoGoogle({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" className={className}>
      <path fill="#FBBC05" d="M43.6 20.1H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.7-.4-3.9z" />
      <path fill="#EA4335" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#34A853" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2c-2 1.5-4.5 2.4-7.2 2.4-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#4285F4" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.7-.4-3.9z" />
    </svg>
  );
}

interface Props {
  /** O link gravado no cadastro do restaurante. Inválido ou vazio, nada aparece. */
  url: string | null | undefined;
  restaurante?: string;
}

/**
 * O convite para avaliar no Google, depois da entrega e na conta da mesa.
 *
 * Vai para todo cliente, sem perguntar antes se ele gostou. Filtrar quem vê o
 * botão pela satisfação ("review gating") e dar desconto em troca de avaliação
 * violam a política do Google, e a punição cai sobre as avaliações do
 * restaurante, não sobre a Muno.
 *
 * O link é validado de novo aqui, e não só ao gravar: o cadastro é um JSON num
 * Setting, e um valor que entrou por outro caminho não vira botão.
 */
export function AvaliarNoGoogle({ url, restaurante }: Props) {
  const link = url ? normalizarLinkDeAvaliacao(url) : null;
  if (!link) return null;
  const quem = restaurante?.trim() || "o restaurante";

  return (
    <section aria-labelledby="avaliar-no-google" className={`${cartao} p-5`}>
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white shadow-[0_0_0_1px_var(--color-loja-linha)]">
          <LogoDoGoogle className="h-6 w-6" />
        </span>
        <div className="min-w-0">
          <h2 id="avaliar-no-google" className="font-extrabold text-loja-tinta">
            Gostou do pedido?
          </h2>
          <p className="text-[13px] text-loja-tinta-2">
            Conte no Google. Leva um minuto e ajuda {quem} a ser encontrado.
          </p>
        </div>
      </div>
      <a
        href={link}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-4 flex h-13 w-full items-center justify-center gap-2.5 rounded-full border border-loja-linha bg-white text-[15px] font-bold text-loja-tinta transition hover:border-loja-tinta-2/40 hover:shadow-loja active:scale-[0.98]"
      >
        <LogoDoGoogle className="h-5 w-5" />
        Avaliar no Google
        <span aria-hidden="true" className="tracking-[2px] text-[#FBBC05]">★★★★★</span>
        <span className="sr-only">(abre em nova aba)</span>
      </a>
    </section>
  );
}
