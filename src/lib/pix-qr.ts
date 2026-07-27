// Cada gateway entrega o QR do PIX num formato diferente: o Mercado Pago e o
// Asaas mandam base64 cru, o Abacate Pay pode mandar já com o prefixo data:,
// e o PagBank hospeda a imagem e devolve uma URL. Normalizar num lugar só
// evita que a tela do cliente quebre por causa da casca de cada um.
export function toQrImageSrc(value: string | undefined | null): string | null {
  const raw = value?.trim();
  if (!raw) return null;

  if (raw.startsWith("data:")) {
    // Só imagem: um data: de outro tipo viraria conteúdo arbitrário na
    // página do cliente.
    return raw.startsWith("data:image/") ? raw : null;
  }

  if (raw.startsWith("https://") || raw.startsWith("http://")) {
    return raw;
  }

  // Sobrou base64 cru. Qualquer outra coisa (javascript:, caminho relativo)
  // não vira src de imagem.
  if (!/^[A-Za-z0-9+/=\s]+$/.test(raw)) return null;

  return `data:image/png;base64,${raw}`;
}
