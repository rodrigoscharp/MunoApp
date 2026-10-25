import type { ReactNode } from "react";
import { AlertCircle } from "lucide-react";
import { campo, kicker } from "@/components/loja/estilos";

/**
 * As peças que se repetem nas telas de conta (login, cadastro, esqueci e
 * redefinir senha). Só aparência: o `input` continua no formulário, com o
 * `register` do react-hook-form espalhado nele, sem wrapper que esconda a ref.
 */

/** Campo com ícone à esquerda. A altura mínima é a do alvo de toque. */
export const campoComIcone = `${campo} min-h-12 pl-11`;

/** O ícone dentro do campo. */
export const iconeDoCampo =
  "pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-forest";

export function Rotulo({ htmlFor, children }: { htmlFor: string; children: ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-bold text-loja-tinta">
      {children}
    </label>
  );
}

/**
 * Erro de um campo. Terracota fundo, e não vermelho: lido sobre o papel passa
 * de 5:1, e a tela continua com a cara da loja em vez de a de um alarme.
 */
export function ErroDoCampo({ children }: { children?: ReactNode }) {
  if (!children) return null;
  return (
    <p className="mt-1.5 flex items-center gap-1.5 text-[13px] font-semibold text-loja-preco">
      <AlertCircle size={14} aria-hidden="true" className="shrink-0" /> {children}
    </p>
  );
}

/** Erro do formulário inteiro (credencial errada, falha de rede). */
export function AvisoDeErro({ children }: { children?: ReactNode }) {
  if (!children) return null;
  return (
    <div
      role="alert"
      className="flex items-start gap-2.5 rounded-2xl bg-loja-pessego-claro px-4 py-3"
    >
      <AlertCircle size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-loja-preco" />
      <p className="text-sm font-semibold text-loja-preco">{children}</p>
    </div>
  );
}

/** O título da tela, com o rótulo pequeno em cima. */
export function TituloDaTela({
  rotulo,
  titulo,
  subtitulo,
}: {
  rotulo: string;
  titulo: ReactNode;
  subtitulo: ReactNode;
}) {
  return (
    <div className="mb-6">
      <p className={`${kicker} text-loja-preco`}>{rotulo}</p>
      <h1 className="manchete mt-2 break-words text-[40px] text-forest-dark">{titulo}</h1>
      <p className="mt-2 text-sm leading-relaxed text-loja-tinta-2">{subtitulo}</p>
    </div>
  );
}
