import { Share, SquarePlus } from "lucide-react";

/**
 * O passo a passo do iPhone.
 *
 * O iOS não tem `beforeinstallprompt`, nem equivalente: não existe API para
 * pedir a instalação, e nenhum botão nosso abre diálogo nenhum. O que resta é
 * ensinar onde ficam os dois toques, e para isso o ícone importa mais que o
 * texto, porque é o ícone que a pessoa vai procurar na barra do Safari.
 */
export function InstrucaoIOS({ compacto = false }: { compacto?: boolean }) {
  return (
    <ol className={compacto ? "space-y-2" : "space-y-3"}>
      <li className="flex items-center gap-3">
        <span className="shrink-0 w-6 h-6 rounded-full bg-brand-light text-brand text-xs font-bold flex items-center justify-center">
          1
        </span>
        <span className="text-sm text-neutral-700 flex items-center gap-1.5 flex-wrap">
          Toque em
          <Share size={16} className="text-brand inline-block" aria-hidden />
          <strong className="font-semibold">Compartilhar</strong>
          na barra do navegador
        </span>
      </li>
      <li className="flex items-center gap-3">
        <span className="shrink-0 w-6 h-6 rounded-full bg-brand-light text-brand text-xs font-bold flex items-center justify-center">
          2
        </span>
        <span className="text-sm text-neutral-700 flex items-center gap-1.5 flex-wrap">
          Escolha
          <SquarePlus size={16} className="text-brand inline-block" aria-hidden />
          <strong className="font-semibold">Adicionar à Tela de Início</strong>
        </span>
      </li>
    </ol>
  );
}
