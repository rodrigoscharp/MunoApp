// Marca visual do gateway: quadrado na cor da marca com o símbolo em branco
// por cima. Se não existir /public/gateways/<id>.svg, o quadrado mostra as
// iniciais — mesma linguagem visual, então a grade não fica desalinhada
// quando um gateway tem arquivo e outro não.
//
// O quadrado é sempre a base e o símbolo entra só depois de carregar de
// verdade: assim um arquivo ausente nunca pisca imagem quebrada, e soltar o
// SVG na pasta passa a funcionar sem tocar em código.
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
  const [logoLoaded, setLogoLoaded] = useState(false);

  return (
    <div
      className="relative rounded-xl shrink-0 overflow-hidden flex items-center justify-center"
      style={{
        width: size,
        height: size,
        background: color,
        // Sombra na própria cor: liga o quadrado à marca sem virar borda.
        boxShadow: `0 2px 8px ${color}40`,
      }}
    >
      <span
        aria-hidden
        className="font-bold text-white transition-opacity"
        style={{ fontSize: size * 0.34, opacity: logoLoaded ? 0 : 1 }}
      >
        {initials(label)}
      </span>

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/gateways/${id}.svg`}
        alt=""
        onLoad={() => setLogoLoaded(true)}
        className="absolute inset-0 w-full h-full object-contain transition-opacity"
        style={{ padding: size * 0.24, opacity: logoLoaded ? 1 : 0 }}
      />
    </div>
  );
}
