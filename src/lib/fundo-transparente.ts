import sharp from "sharp";

/**
 * A foto enviada já vem sem fundo? É o que decide se ela vira, sozinha, a foto
 * do banner (MenuItem.imagemRecortadaUrl).
 *
 * Ter canal alfa não basta, e um pixel transparente também não: logo de
 * cantos arredondados, PNG exportado com uma borda de 1px vazia ou um furo
 * qualquer marcavam a foto como recortada, e o banner mostrava o retângulo
 * inteiro "saindo" dele. Recorte de verdade tem as duas coisas: uma parte
 * relevante da imagem vazia, e esse vazio encostando na borda, onde o fundo
 * estava.
 */

/** Alfa abaixo disso conta como transparente. */
const ALFA_TRANSPARENTE = 16;
/** Fração mínima de pixels transparentes na imagem toda. */
const FRACAO_MINIMA = 0.08;
/**
 * Fração mínima de pixels transparentes na moldura de 1px. Cantos
 * arredondados chegam perto disso só com raio enorme, e aí quem os barra é a
 * fração da imagem toda.
 */
const FRACAO_MINIMA_NA_BORDA = 0.3;
/** O lado maior da amostra analisada: contar 256² pixels custa nada. */
export const LADO_DA_AMOSTRA = 256;

/**
 * A regra, sobre pixels crus (`canais` por pixel, o alfa no último). Pura,
 * para o teste não depender de codificar imagem.
 */
export function pixelsSemFundo(pixels: Uint8Array, largura: number, altura: number, canais: number): boolean {
  if (canais !== 2 && canais !== 4) return false;
  if (largura === 0 || altura === 0) return false;
  const alfa = (x: number, y: number) => pixels[(y * largura + x) * canais + canais - 1];

  let transparentes = 0;
  for (let y = 0; y < altura; y++) {
    for (let x = 0; x < largura; x++) if (alfa(x, y) < ALFA_TRANSPARENTE) transparentes++;
  }
  if (transparentes / (largura * altura) < FRACAO_MINIMA) return false;

  let naBorda = 0;
  let borda = 0;
  for (let y = 0; y < altura; y++) {
    for (let x = 0; x < largura; x++) {
      if (y !== 0 && y !== altura - 1 && x !== 0 && x !== largura - 1) continue;
      borda++;
      if (alfa(x, y) < ALFA_TRANSPARENTE) naBorda++;
    }
  }
  return naBorda / borda >= FRACAO_MINIMA_NA_BORDA;
}

/**
 * A mesma pergunta sobre a imagem já decodificada pelo upload (pixels crus).
 * Reduz para uma amostra pequena antes de contar, em vez de decodificar o
 * original de novo: a resposta não muda com a resolução, e o custo sim.
 */
export async function temFundoTransparente(
  pixels: Buffer,
  raw: { width: number; height: number; channels: 1 | 2 | 3 | 4 }
): Promise<boolean> {
  if (raw.channels !== 2 && raw.channels !== 4) return false;
  try {
    const { data, info } = await sharp(pixels, { raw })
      .resize({ width: LADO_DA_AMOSTRA, height: LADO_DA_AMOSTRA, fit: "inside", withoutEnlargement: true })
      .raw()
      .toBuffer({ resolveWithObject: true });
    return pixelsSemFundo(data, info.width, info.height, info.channels);
  } catch {
    return false;
  }
}
