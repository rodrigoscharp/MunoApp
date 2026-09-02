import sharp from "sharp";

/**
 * Transforma o logo que o dono do restaurante subiu num ícone de app.
 *
 * O trabalho aqui não é estético, é de contrato: o Chrome DESCARTA o ícone
 * cuja imagem não bate com o `sizes` declarado no manifest, e o sintoma disso
 * não é um ícone feio, é a instalação deixar de ser oferecida, em silêncio e
 * sem erro em lugar nenhum. Por isso a saída tem sempre o lado exato, venha o
 * que vier na entrada.
 *
 * Logo de restaurante é quase sempre retangular (letreiro, palavra, brasão),
 * então ele entra com `fit: "inside"`, preservando a proporção, e é centrado
 * num campo BRANCO. Branco porque não sabemos nada sobre a marca de terceiro:
 * é o que menos briga com logo transparente, com logo escuro e com logo que já
 * traz o próprio fundo branco.
 *
 * O campo é sempre opaco. PNG com alpha entregue ao Android acaba composto
 * sobre branco puro de qualquer jeito, e no iOS sobre PRETO: achatar aqui é o
 * que faz o resultado ser o mesmo nos dois.
 */

const CAMPO = "#FFFFFF";

export const MEDIDAS = {
  // Um respiro nas bordas: logo colado na borda parece cortado depois que o
  // aparelho aplica o próprio arredondamento.
  "192.png": { lado: 192, ocupacao: 0.86 },
  "512.png": { lado: 512, ocupacao: 0.86 },
  // 180 é o tamanho que o iOS pede no apple-touch-icon.
  "apple.png": { lado: 180, ocupacao: 0.86 },
  /*
   * A maskable é a única com conta, não com gosto.
   *
   * O Android recorta num círculo e só garante o círculo central de 80% do
   * lado, ou seja, raio 0,4·L. Um logo QUADRADO inscrito nesse círculo tem
   * lado máximo 2·0,4·L/√2 ≈ 0,565·L, e como o `fit: "inside"` usa uma caixa
   * quadrada, esse é o pior caso para qualquer proporção de entrada. 0,56
   * cabe com folga e vale para todo logo, largo ou alto.
   *
   * Errar para o outro lado corta o logo do cliente ao meio, o que é pior que
   * não ter ícone customizado nenhum.
   */
  "maskable.png": { lado: 512, ocupacao: 0.56 },
} as const;

export type Medida = keyof typeof MEDIDAS;

export function ehMedida(valor: string): valor is Medida {
  return valor in MEDIDAS;
}

/**
 * @throws se a entrada não for uma imagem que o sharp saiba ler. Quem chama
 * trata caindo no ícone da Muno: uma resposta de erro aqui tiraria a
 * instalação do ar.
 */
export async function normalizarIcone(
  entrada: Buffer,
  medida: string
): Promise<Buffer> {
  const spec = MEDIDAS[medida as Medida];
  if (!spec) throw new Error(`Medida desconhecida: ${medida}`);

  const caixa = Math.round(spec.lado * spec.ocupacao);

  // limitInputPixels segura a "bomba de descompressão": um PNG de poucos KB
  // pode declarar dimensões enormes e estourar a memória da função ao ser
  // decodificado. 50MP é muito mais que qualquer logo e muito menos que um
  // ataque.
  const conteudo = await sharp(entrada, { limitInputPixels: 50_000_000 })
    .resize(caixa, caixa, { fit: "inside", withoutEnlargement: false })
    .toBuffer();

  return sharp({
    create: {
      width: spec.lado,
      height: spec.lado,
      channels: 4,
      background: CAMPO,
    },
  })
    .composite([{ input: conteudo, gravity: "centre" }])
    .flatten({ background: CAMPO })
    .png()
    .toBuffer();
}
