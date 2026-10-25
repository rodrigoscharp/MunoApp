"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { botaoBrasa, botaoFloresta, cartao } from "@/components/loja/estilos";

interface Props {
  // Já resolvido por toQrImageSrc: pode ser data URI (Mercado Pago, Asaas,
  // Abacate Pay) ou URL hospedada pelo gateway (PagBank).
  qrSrc: string | null;
  copyPaste: string;
}

export function PixPayment({ qrSrc, copyPaste }: Props) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(copyPaste);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <section aria-labelledby="titulo-pix" className={`${cartao} px-5 py-5`}>
      <h2 id="titulo-pix" className="manchete text-center text-[28px] text-forest-dark">
        Pague com Pix
      </h2>

      {/* QR Code */}
      {qrSrc && (
        <div className="mt-4 flex justify-center">
          {/* Fundo branco de verdade, e não o papel: leitor de QR de banco
              erra com borda clara colorida. */}
          <div className="rounded-2xl border border-loja-linha bg-white p-3">
            {/* <img> comum, não next/image: o src pode ser data URI ou um
                domínio de gateway que não está em remotePatterns. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrSrc} alt="QR Code Pix" width={200} height={200} className="rounded" />
          </div>
        </div>
      )}

      <p className="mt-4 text-center text-xs text-loja-tinta-2">
        {qrSrc ? "Ou copie o código abaixo" : "Copie o código abaixo e pague no seu banco"}
      </p>

      {/* Copy & paste key */}
      <div className="mt-2 flex gap-2">
        <div className="flex min-h-11 min-w-0 flex-1 items-center truncate rounded-2xl border border-loja-linha bg-loja-creme px-3 font-mono text-xs text-loja-tinta-2">
          <span className="truncate">{copyPaste}</span>
        </div>
        <button
          type="button"
          onClick={handleCopy}
          className={`${copied ? botaoFloresta : botaoBrasa} h-11 shrink-0 px-4 text-xs`}
        >
          {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
          <span aria-live="polite">{copied ? "Copiado!" : "Copiar"}</span>
        </button>
      </div>

      <p className="mt-4 text-center text-xs text-loja-tinta-2">
        O pagamento é confirmado automaticamente
      </p>
    </section>
  );
}
