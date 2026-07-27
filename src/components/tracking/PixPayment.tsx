"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";

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
    <div className="bg-white rounded-xl border border-neutral-200 p-6 mb-6">
      <h2 className="text-center font-semibold text-neutral-900 mb-4">
        Pague com Pix
      </h2>

      {/* QR Code */}
      {qrSrc && (
        <div className="flex justify-center mb-4">
          <div className="p-3 border-2 border-neutral-200 rounded-xl">
            {/* <img> comum, não next/image: o src pode ser data URI ou um
                domínio de gateway que não está em remotePatterns. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrSrc} alt="QR Code Pix" width={200} height={200} className="rounded" />
          </div>
        </div>
      )}

      <p className="text-center text-xs text-neutral-500 mb-3">
        {qrSrc ? "Ou copie o código abaixo" : "Copie o código abaixo e pague no seu banco"}
      </p>

      {/* Copy & paste key */}
      <div className="flex gap-2">
        <div className="flex-1 bg-neutral-50 border border-neutral-200 rounded-lg px-3 py-2 text-xs text-neutral-600 truncate">
          {copyPaste}
        </div>
        <button
          onClick={handleCopy}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition ${
            copied
              ? "bg-green-100 text-green-700"
              : "bg-neutral-100 hover:bg-neutral-200 text-neutral-700"
          }`}
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
          {copied ? "Copiado!" : "Copiar"}
        </button>
      </div>

      <p className="text-center text-xs text-neutral-400 mt-4">
        O pagamento é confirmado automaticamente
      </p>
    </div>
  );
}
