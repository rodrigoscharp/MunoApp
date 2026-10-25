/**
 * Remove o fundo de uma foto de produto, no navegador do dono.
 *
 * Roda só no painel, só quando o dono clica em "Remover fundo". Nada daqui
 * entra no código da loja: a biblioteca (transformers.js, Apache-2.0) vem da
 * CDN por import dinâmico, com a versão fixada, e o webpack não a empacota
 * (`webpackIgnore`). É o build empacotado (`transformers.min.js`): o `.web`
 * importa o onnxruntime pelo nome do pacote, e a CDN não resolve.
 *
 * O modelo é o ormbg (Apache-2.0), na versão uint8 de ~44 MB, que baixa na
 * primeira vez e fica no cache do navegador. Licença foi o critério: o RMBG é
 * de uso não comercial, e o ISNet e a biblioteca pronta mais conhecida são
 * AGPL, problema para a Muno, que é SaaS. O BiRefNet (MIT) foi testado e
 * estourou a memória do navegador na execução, na GPU e no processador.
 *
 * Roda no processador (wasm), perto de 30 s por foto numa máquina comum. A GPU
 * ficou de fora de propósito: o ONNX Runtime para WebGPU não implementa uma
 * operação do modelo ("using ceil() in shape computation is not yet supported
 * for MaxPool"), e a tentativa que falha deixa o runtime preso a ela, a ponto
 * de a volta para o processador também falhar na mesma página.
 *
 * Devolve um WebP com o fundo transparente (PNG no navegador que não gera
 * WebP), já cortado em volta do produto (com folga), para o lanche ocupar o
 * banner em vez de nadar num quadro vazio, e com no máximo 1280 px no lado
 * maior. Um PNG do tamanho que o modelo devolve passava fácil dos 5 MB do
 * /api/upload, e o dono via "não deu para enviar" depois de esperar o recorte.
 */

const BIBLIOTECA =
  "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/dist/transformers.min.js";
const MODELO = "onnx-community/ormbg-ONNX";

export type EtapaDoRecorte = "baixando-modelo" | "recortando";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Recortador = (imagem: string) => Promise<any[]>;
const recortadores = new Map<string, Promise<Recortador>>();

function recortador(device: "wasm", aoBaixar?: (porcento: number) => void): Promise<Recortador> {
  let pronto = recortadores.get(device);
  if (!pronto) {
    pronto = (async () => {
      const tf: any = await import(/* webpackIgnore: true */ BIBLIOTECA);
      return tf.pipeline("background-removal", MODELO, {
        device,
        dtype: "uint8",
        progress_callback: (p: { status?: string; progress?: number }) => {
          if (p.status === "progress" && typeof p.progress === "number") aoBaixar?.(p.progress);
        },
      });
    })();
    // Falhou (rede, navegador sem suporte): a próxima tentativa recomeça.
    pronto.catch(() => recortadores.delete(device));
    recortadores.set(device, pronto);
  }
  return pronto;
}

async function recortarCom(
  device: "wasm",
  url: string,
  aoMudar?: (etapa: EtapaDoRecorte, porcento?: number) => void
) {
  aoMudar?.("baixando-modelo");
  const rodar = await recortador(device, (p) => aoMudar?.("baixando-modelo", p));
  aoMudar?.("recortando");
  const [saida] = await rodar(url);
  return saida;
}

export async function removerFundo(
  origem: Blob | string,
  aoMudar?: (etapa: EtapaDoRecorte, porcento?: number) => void
): Promise<Blob> {
  const url = typeof origem === "string" ? origem : URL.createObjectURL(origem);
  try {
    const saida = await recortarCom("wasm", url, aoMudar);

    // A saída é RGBA: o canal alfa é a máscara do produto.
    const recortada = saida.toCanvas() as HTMLCanvasElement | OffscreenCanvas;
    const alfa = new Uint8Array(saida.width * saida.height);
    for (let i = 0; i < alfa.length; i++) alfa[i] = saida.data[4 * i + 3];
    const caixa = caixaDoProduto(alfa, saida.width, saida.height);

    return await codificar(recortada as CanvasImageSource, caixa);
  } finally {
    if (typeof origem !== "string") URL.revokeObjectURL(url);
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** O lado maior do recorte gravado: o mesmo teto do /api/upload. */
export const LADO_MAXIMO_DO_RECORTE = 1280;
/** O limite do /api/upload, com folga para o cabeçalho do multipart. */
const LIMITE_DO_UPLOAD = 5 * 1024 * 1024 - 64 * 1024;

/** O tamanho final, sem ampliar, com o lado maior em `lado` no máximo. */
export function tamanhoDoRecorte(largura: number, altura: number, lado = LADO_MAXIMO_DO_RECORTE) {
  const escala = Math.min(1, lado / Math.max(largura, altura));
  return {
    largura: Math.max(1, Math.round(largura * escala)),
    altura: Math.max(1, Math.round(altura * escala)),
  };
}

/** O nome do arquivo enviado, pela extensão do que o navegador gerou de fato. */
export function nomeDoRecorte(blob: Blob): string {
  return blob.type === "image/webp" ? "recorte.webp" : "recorte.png";
}

function paraBlob(canvas: HTMLCanvasElement, tipo: string, qualidade?: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, tipo, qualidade));
}

async function codificar(
  origem: CanvasImageSource,
  caixa: { x: number; y: number; largura: number; altura: number }
): Promise<Blob> {
  // Lados decrescentes: se nem o WebP nem o PNG couberem no limite (PNG de
  // foto grande no Safari antigo, que não gera WebP), tenta menor.
  for (const lado of [LADO_MAXIMO_DO_RECORTE, 960, 640]) {
    const alvo = tamanhoDoRecorte(caixa.largura, caixa.altura, lado);
    const final = document.createElement("canvas");
    final.width = alvo.largura;
    final.height = alvo.altura;
    const ctx = final.getContext("2d")!;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(origem, caixa.x, caixa.y, caixa.largura, caixa.altura, 0, 0, alvo.largura, alvo.altura);

    // O navegador que não sabe gerar WebP devolve PNG (ou null) em silêncio:
    // o tipo do blob é o que vale, não o que foi pedido.
    let blob = await paraBlob(final, "image/webp", 0.9);
    if (!blob || (blob.type !== "image/webp" && blob.type !== "image/png")) {
      blob = await paraBlob(final, "image/png");
    }
    if (blob && blob.size <= LIMITE_DO_UPLOAD) return blob;
  }
  throw new Error("Não foi possível gerar o recorte");
}

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
