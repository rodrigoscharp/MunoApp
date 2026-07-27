// Marca visual do gateway: quadrado com a cor da marca e a inicial.
// Não é o logo oficial — é um identificador desenhado aqui, pra não
// depender de arquivo de marca de terceiro no repositório. Para usar o logo
// real, solte um SVG em /public/gateways/<id>.svg: o componente passa a
// preferir o arquivo e só cai no quadrado se ele não existir.
"use client";

import { useState } from "react";

interface Props {
  id: string;
  label: string;
  color: string;
  size?: number;
}

// Duas letras, não uma: "Asaas" e "Abacate Pay" começam com A, e distinguir
// só pela cor falha pra quem não enxerga cor. Nome composto vira as iniciais
// das palavras (Mercado Pago → MP), nome simples vira as duas primeiras
// letras (Asaas → As).
function initials(label: string): string {
  const words = label.trim().split(/\s+/);
  if (words.length > 1) {
    return (words[0][0] + words[1][0]).toUpperCase();
  }
  return words[0].slice(0, 2).replace(/^./, (c) => c.toUpperCase());
}

export function GatewayMark({ id, label, color, size = 44 }: Props) {
  const [hasLogo, setHasLogo] = useState(true);

  if (hasLogo) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={`/gateways/${id}.svg`}
        alt=""
        width={size}
        height={size}
        onError={() => setHasLogo(false)}
        className="rounded-xl shrink-0 object-contain"
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <div
      aria-hidden
      className="rounded-xl shrink-0 flex items-center justify-center font-bold text-white"
      style={{
        width: size,
        height: size,
        background: color,
        fontSize: size * 0.34,
        // Sombra na própria cor: liga o quadrado à marca sem virar borda.
        boxShadow: `0 2px 8px ${color}40`,
      }}
    >
      {initials(label)}
    </div>
  );
}
