/**
 * Quando uma foto enviada conta como "já sem fundo". Errar para o lado do sim
 * põe no banner um retângulo com cantos arredondados como se fosse um lanche
 * recortado; por isso um pixel transparente não basta.
 */

import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { pixelsSemFundo, temFundoTransparente } from "./fundo-transparente";

async function crus(svg: string) {
  const { data, info } = await sharp(Buffer.from(svg))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, raw: { width: info.width, height: info.height, channels: info.channels } };
}

const svg = (corpo: string, w = 400, h = 300) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${corpo}</svg>`;

describe("temFundoTransparente", () => {
  it("lanche recortado no meio de um fundo vazio: sim", async () => {
    const { data, raw } = await crus(svg(`<circle cx="200" cy="150" r="110" fill="#c83c1e"/>`));
    expect(await temFundoTransparente(data, raw)).toBe(true);
  });

  it("recorte que encosta embaixo (prato cortado na borda): sim", async () => {
    const { data, raw } = await crus(svg(`<ellipse cx="200" cy="300" rx="170" ry="160" fill="#c83c1e"/>`));
    expect(await temFundoTransparente(data, raw)).toBe(true);
  });

  it("foto com cantos arredondados: não", async () => {
    const { data, raw } = await crus(svg(`<rect width="400" height="300" rx="36" fill="#c83c1e"/>`));
    expect(await temFundoTransparente(data, raw)).toBe(false);
  });

  it("canal alfa todo opaco: não", async () => {
    const { data, raw } = await crus(svg(`<rect width="400" height="300" fill="#c83c1e"/>`));
    expect(await temFundoTransparente(data, raw)).toBe(false);
  });

  it("foto com moldura de 1px vazia: não", async () => {
    const { data, raw } = await crus(svg(`<rect x="1" y="1" width="398" height="298" fill="#c83c1e"/>`));
    expect(await temFundoTransparente(data, raw)).toBe(false);
  });

  it("sem canal alfa, nem olha", async () => {
    expect(await temFundoTransparente(Buffer.alloc(12), { width: 2, height: 2, channels: 3 })).toBe(false);
  });
});

describe("pixelsSemFundo", () => {
  /** Imagem RGBA lado×lado, com os pixels de `vazio` transparentes. */
  function imagem(lado: number, vazio: (x: number, y: number) => boolean) {
    const px = new Uint8Array(lado * lado * 4);
    for (let y = 0; y < lado; y++)
      for (let x = 0; x < lado; x++) px[(y * lado + x) * 4 + 3] = vazio(x, y) ? 0 : 255;
    return px;
  }

  it("um pixel transparente só não basta", () => {
    expect(pixelsSemFundo(imagem(100, (x, y) => x === 0 && y === 0), 100, 100, 4)).toBe(false);
  });

  it("muito vazio, mas só no miolo (um furo), não é fundo removido", () => {
    expect(pixelsSemFundo(imagem(100, (x, y) => x > 20 && x < 80 && y > 20 && y < 80), 100, 100, 4)).toBe(false);
  });

  it("vazio em volta do objeto: sim", () => {
    expect(pixelsSemFundo(imagem(100, (x, y) => (x - 50) ** 2 + (y - 50) ** 2 > 35 ** 2), 100, 100, 4)).toBe(true);
  });

  it("lê o alfa no último canal também em cinza com alfa", () => {
    const px = new Uint8Array(10 * 10 * 2); // tudo alfa 0
    expect(pixelsSemFundo(px, 10, 10, 2)).toBe(true);
  });
});
