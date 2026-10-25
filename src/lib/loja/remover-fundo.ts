/**
 * Remove o fundo de uma foto de produto, no navegador do dono.
 *
 * Roda só no painel, só quando o dono clica em "Remover fundo". Nada daqui
 * entra no código da loja: a biblioteca vem da CDN por import dinâmico, com a
 * versão fixada, e o webpack não a empacota (`webpackIgnore`). O modelo
 * (BiRefNet lite, licença MIT, ~115 MB em fp16) baixa na primeira vez e fica
 * no cache do navegador.
 *
 * Licença foi o critério da escolha: o modelo mais usado para isso (RMBG) é
 * de uso não comercial, e a biblioteca pronta mais conhecida é AGPL. Os dois
 * seriam problema para a Muno, que é SaaS.
 *
 * Devolve um PNG com o fundo transparente, já cortado em volta do produto
 * (com folga), para o lanche ocupar o banner em vez de nadar num quadro vazio.
 */

const BIBLIOTECA =
  "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/dist/transformers.web.min.js";
const MODELO = "onnx-community/BiRefNet_lite-ONNX";

export type EtapaDoRecorte = "baixando-modelo" | "recortando";

/* eslint-disable @typescript-eslint/no-explicit-any */
let carregado: Promise<{ model: any; processor: any; RawImage: any }> | null = null;

function carregar(aoBaixar?: (porcento: number) => void) {
  if (!carregado) {
    carregado = (async () => {
      const tf: any = await import(/* webpackIgnore: true */ BIBLIOTECA);
      const temWebGpu = typeof navigator !== "undefined" && "gpu" in navigator;
      const model = await tf.AutoModel.from_pretrained(MODELO, {
        // fp16 na GPU; no processador, fp32, porque o wasm não roda todas as
        // operações do modelo em meia precisão.
        dtype: temWebGpu ? "fp16" : "fp32",
        device: temWebGpu ? "webgpu" : "wasm",
        progress_callback: (p: { status?: string; progress?: number }) => {
          if (p.status === "progress" && typeof p.progress === "number") aoBaixar?.(p.progress);
        },
      });
      const processor = await tf.AutoProcessor.from_pretrained(MODELO);
      return { model, processor, RawImage: tf.RawImage };
    })().catch((erro) => {
      // Falhou (rede, navegador sem suporte): a próxima tentativa recomeça.
      carregado = null;
      throw erro;
    });
  }
  return carregado;
}

export async function removerFundo(
  origem: Blob | string,
  aoMudar?: (etapa: EtapaDoRecorte, porcento?: number) => void
): Promise<Blob> {
  aoMudar?.("baixando-modelo");
  const { model, processor, RawImage } = await carregar((p) => aoMudar?.("baixando-modelo", p));
  aoMudar?.("recortando");

  const imagem = typeof origem === "string" ? await RawImage.fromURL(origem) : await RawImage.fromBlob(origem);
  const { pixel_values } = await processor(imagem);
  const { output_image } = await model({ input_image: pixel_values });
  const mascara = await RawImage.fromTensor(output_image[0].sigmoid().mul(255).to("uint8")).resize(
    imagem.width,
    imagem.height
  );

  const canvas = imagem.toCanvas() as HTMLCanvasElement | OffscreenCanvas;
  const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
  const pixels = ctx.getImageData(0, 0, imagem.width, imagem.height);
  for (let i = 0; i < mascara.data.length; i++) pixels.data[4 * i + 3] = mascara.data[i];
  ctx.putImageData(pixels, 0, 0);

  const caixa = caixaDoProduto(mascara.data, imagem.width, imagem.height);
  const saida = document.createElement("canvas");
  saida.width = caixa.largura;
  saida.height = caixa.altura;
  saida.getContext("2d")!.drawImage(canvas as CanvasImageSource, caixa.x, caixa.y, caixa.largura, caixa.altura, 0, 0, caixa.largura, caixa.altura);

  return new Promise((resolve, reject) =>
    saida.toBlob((b) => (b ? resolve(b) : reject(new Error("Não foi possível gerar o recorte"))), "image/png")
  );
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * O retângulo que contém o produto (alfa acima de um limiar), com 4% de
 * folga. Sem nada reconhecido, a imagem inteira: o dono vê o resultado e
 * decide se usa.
 */
export function caixaDoProduto(alfa: ArrayLike<number>, largura: number, altura: number) {
  let x0 = largura, y0 = altura, x1 = -1, y1 = -1;
  for (let y = 0; y < altura; y++) {
    for (let x = 0; x < largura; x++) {
      if (alfa[y * largura + x] > 24) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return { x: 0, y: 0, largura, altura };
  const folga = Math.round(Math.max(x1 - x0, y1 - y0) * 0.04);
  const x = Math.max(0, x0 - folga);
  const y = Math.max(0, y0 - folga);
  return {
    x,
    y,
    largura: Math.min(largura, x1 + folga + 1) - x,
    altura: Math.min(altura, y1 + folga + 1) - y,
  };
}
