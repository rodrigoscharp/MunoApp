import { describe, it, expect } from "vitest";
import sharp from "sharp";
import { normalizarIcone, MEDIDAS } from "./normalizar-icone";

/** Um logo de proporção arbitrária, como os que os donos sobem. */
async function logoFalso(largura: number, altura: number, alpha = true) {
  return sharp({
    create: {
      width: largura,
      height: altura,
      channels: 4,
      background: alpha ? { r: 0, g: 90, b: 200, alpha: 0.6 } : "#005AC8",
    },
  })
    .png()
    .toBuffer();
}

describe("normalizarIcone", () => {
  it.each(Object.keys(MEDIDAS))(
    "%s sai exatamente no tamanho declarado",
    async (medida) => {
      // É isto que decide a instalabilidade: o Chrome descarta o ícone cuja
      // imagem não bate com o `sizes` do manifest, e o sintoma não é um ícone
      // feio, é a instalação deixar de ser oferecida sem erro nenhum.
      const png = await normalizarIcone(await logoFalso(1000, 240), medida);
      const m = await sharp(png).metadata();
      const esperado = MEDIDAS[medida as keyof typeof MEDIDAS].lado;
      expect([m.width, m.height]).toEqual([esperado, esperado]);
    }
  );

  it.each([
    ["muito largo", 1200, 200],
    ["muito alto", 200, 1200],
    ["quadrado", 600, 600],
    ["minúsculo", 32, 18],
  ])("aceita logo %s sem distorcer", async (_nome, w, h) => {
    const png = await normalizarIcone(await logoFalso(w, h), "192.png");
    const m = await sharp(png).metadata();
    expect([m.width, m.height]).toEqual([192, 192]);
  });

  it("achata a transparência sobre branco", async () => {
    // PNG com alpha entregue ao Android acaba composto sobre branco puro de
    // qualquer jeito, e no iOS sobre PRETO. Achatar aqui é o que torna o
    // resultado igual nos dois.
    const png = await normalizarIcone(await logoFalso(400, 400), "512.png");
    const stats = await sharp(png).stats();
    expect(stats.isOpaque).toBe(true);
  });

  it("na maskable o logo cabe no círculo seguro de 80%", async () => {
    // O Android recorta a maskable num círculo. Qualquer coisa fora do círculo
    // central de 80% pode ser cortada, e um logo de cliente cortado ao meio é
    // pior que não ter ícone customizado.
    const lado = MEDIDAS["maskable.png"].lado;
    const png = await normalizarIcone(await logoFalso(600, 600), "maskable.png");

    // Mede o desenho: tudo que não é o branco do campo.
    const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
    let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
    for (let y = 0; y < info.height; y++) {
      for (let x = 0; x < info.width; x++) {
        const i = (y * info.width + x) * info.channels;
        if (data[i] < 240 || data[i + 1] < 240 || data[i + 2] < 240) {
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
      }
    }
    const centro = lado / 2;
    const raioSeguro = lado * 0.4;
    const cantos = [[x0, y0], [x1, y0], [x0, y1], [x1, y1]] as const;
    for (const [x, y] of cantos) {
      const dist = Math.hypot(x - centro, y - centro);
      expect(dist).toBeLessThanOrEqual(raioSeguro);
    }
  });

  it("recusa o que não é imagem, em vez de devolver lixo", async () => {
    await expect(
      normalizarIcone(Buffer.from('{"erro":"nao autorizado"}'), "192.png")
    ).rejects.toThrow();
  });
});
