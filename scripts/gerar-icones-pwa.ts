import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

/**
 * Deriva todos os ícones do projeto do logotipo da Muno.
 *
 *     npx tsx scripts/gerar-icones-pwa.ts
 *
 * A fonte é public/munowbg.png, o logotipo de verdade: a palavra "muno" em
 * terracota com o "u" sendo um garfo em verde. Nada aqui é desenhado à mão, e
 * é esse o ponto — até 02/09/2026 o favicon era o garfo isolado e pintado de
 * BRANCO, uma peça que não existe em lugar nenhum da marca e que apagava
 * justamente a cor que identifica a Muno.
 *
 * ---------------------------------------------------------------------------
 * Por que a aba e a tela inicial recebem imagens DIFERENTES
 *
 * A palavra "muno" é 4,43:1. Dentro de um quadrado ela ocupa cerca de 22% da
 * altura: a 192px isso é o logotipo inconfundível, e a 16px, que é o tamanho
 * real do favicon numa aba, é um borrão terracota que não se lê.
 *
 * Então:
 *
 * - **Tela inicial** (manifest 192/512, maskable e apple-touch): a PALAVRA.
 *   São os tamanhos em que ela funciona, e é onde a pessoa precisa reconhecer
 *   a marca entre dezenas de ícones.
 *
 * - **Aba do navegador** (src/app/icon.png): o GARFO verde, sobre um azulejo
 *   CREME arredondado. É a única forma que sobrevive a 16px.
 *
 *   O creme, e não o terracota, por contraste medido: verde #2B5240 sobre
 *   terracota #D4612A dá 2,26:1, e a 16px os dentes do garfo desaparecem;
 *   sobre o creme #F5F2EE dá 7,69:1 e a forma se mantém. É também como o
 *   garfo aparece dentro do próprio logotipo, que nunca o põe sobre terracota.
 *
 * - **Dentro de página** (public/icons/marca.png): a palavra recortada, COM
 *   transparência. A tela de offline e a folha de convite têm fundo creme ou
 *   branco, e qualquer azulejo creme sumiria neles; um asset sem fundo
 *   funciona nos dois, e no tema escuro também.
 *
 * O Next serve os dois por convenção de arquivo e o manifest aponta para
 * public/icons/, então eles podem divergir sem nenhuma gambiarra.
 *
 * ---------------------------------------------------------------------------
 * Os fundos
 *
 * `purpose: "any"` e o favicon achatam sobre um fundo opaco porque o sistema
 * desenha o arquivo como ele é, e PNG com alpha entregue ao Android acaba
 * composto sobre branco puro, que briga com o papel da marca.
 *
 * A maskable sangra até a borda e ainda encolhe a palavra para caber no
 * círculo central de 80%, que é a zona segura que o Android garante. Quem
 * arredonda é o aparelho: um canto redondo no arquivo, por baixo da máscara,
 * deixa uma casca clara acompanhando a curva.
 *
 * Rodar de novo é idempotente: tudo é derivado de munowbg.png, que este script
 * nunca escreve.
 */

// Caminhos relativos à raiz do repo, como os outros scripts do projeto
// (enviar-backup.ts lê ".env.local" do mesmo jeito). O tsx compila para CJS
// aqui, então import.meta.dirname não existe.
const RAIZ = process.cwd();
const LOGO = path.join(RAIZ, "public/munowbg.png");
const DESTINO = path.join(RAIZ, "public/icons");

// O mesmo --background de src/app/globals.css. Repetido aqui porque o sharp
// não lê CSS, e um ícone que destoa do papel do app é o tipo de divergência
// que ninguém nota até ver o aparelho de alguém.
const PAPEL = "#F5F2EE";
// O verde da marca. No logotipo ele é o garfo, o detalhe preciso dentro da
// palavra; no console ele é quem carrega o dado (ver AGENTS.md). "GESTÃO" é
// qualificador, então é papel dele. Em terracota a palavra competiria com o
// próprio logotipo, que já é terracota.
const VERDE = "#2B5240";

/**
 * Onde está o garfo verde dentro do logotipo.
 *
 * Por varredura de pixel, e não por coordenada fixa: coordenada fixa vira
 * mentira silenciosa no dia em que o logotipo for reexportado com outra
 * margem, e o favicon passaria a ser um recorte torto que ninguém relaciona
 * com este arquivo. A checagem de plausibilidade no fim é o que transforma
 * esse dia num erro em vez de num ícone errado.
 */
async function acharGarfoVerde() {
  const { data, info } = await sharp(LOGO)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const i = (y * info.width + x) * info.channels;
      const [r, g, b, a] = [data[i], data[i + 1], data[i + 2], data[i + 3]];
      // O verde da marca (#2B5240): verde domina, e tudo é escuro. O terracota
      // das letras tem o vermelho dominante e não entra.
      const verdeDaMarca = g > r && g > b && r < 120 && g < 130 && b < 120;
      if (a > 128 && verdeDaMarca) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }

  const width = x1 - x0 + 1;
  const height = y1 - y0 + 1;
  // O garfo é aproximadamente quadrado e ocupa um pedaço pequeno do logotipo.
  // Qualquer coisa muito fora disso significa que a varredura pegou outra
  // coisa, e um ícone errado é pior que um script que falha.
  const proporcao = width / height;
  if (x1 < 0 || proporcao < 0.6 || proporcao > 1.6 || width < info.width * 0.05) {
    throw new Error(
      `Não encontrei o garfo verde em ${path.relative(RAIZ, LOGO)} ` +
        `(achei ${width}x${height}). O logotipo mudou?`
    );
  }
  return { left: x0, top: y0, width, height };
}

/**
 * A palavra "muno" com "GESTÃO" embaixo: o ícone do console.
 *
 * O console é outra ORIGEM (admin.munoapp.com.br), então ele instala como um
 * app separado e fica na tela inicial ao lado dos outros. Sem o rótulo, o
 * ícone dele é idêntico ao da landing e a pessoa abre um achando que é o
 * outro.
 *
 * O texto é desenhado por SVG na hora da geração. O PNG resultante é
 * commitado, então a fonte só precisa existir em quem RODA este script: se
 * alguém regerar noutra máquina e a fonte cair para outra, o rótulo muda de
 * desenho. É o preço de não carregar um arquivo de fonte no repositório por
 * causa de seis letras.
 */
async function comAPalavraEGestao(
  tamanho: number,
  ocupacao: number,
  saida: string
) {
  const marca = await sharp(LOGO)
    .trim({ threshold: 10 })
    .resize({ width: Math.round(tamanho * ocupacao) })
    .toBuffer();
  const { width = 0, height = 0 } = await sharp(marca).metadata();

  const corpo = Math.round(tamanho * 0.095);
  const respiro = Math.round(tamanho * 0.045);
  const bloco = height + respiro + corpo;
  const topo = Math.round((tamanho - bloco) / 2);

  const rotulo = Buffer.from(
    `<svg width="${tamanho}" height="${tamanho}">` +
      `<text x="${tamanho / 2}" y="${topo + height + respiro + corpo * 0.82}" ` +
      `font-family="Helvetica, Arial, sans-serif" font-size="${corpo}" ` +
      `font-weight="700" letter-spacing="${corpo * 0.16}" fill="${VERDE}" ` +
      `text-anchor="middle">GESTÃO</text></svg>`
  );

  await sharp({
    create: { width: tamanho, height: tamanho, channels: 4, background: PAPEL },
  })
    .composite([
      { input: marca, left: Math.round((tamanho - width) / 2), top: topo },
      { input: rotulo, top: 0, left: 0 },
    ])
    .png()
    .toFile(saida);
  console.log(`  ${path.relative(RAIZ, saida)}  ${tamanho}  palavra + GESTÃO`);
}

/** A palavra "muno" centrada num quadrado de fundo opaco. */
async function comAPalavra(
  tamanho: number,
  fundo: string,
  ocupacao: number,
  saida: string
) {
  const marca = await sharp(LOGO)
    .trim({ threshold: 10 })
    .resize({ width: Math.round(tamanho * ocupacao) })
    .toBuffer();

  await sharp({
    create: { width: tamanho, height: tamanho, channels: 4, background: fundo },
  })
    .composite([{ input: marca, gravity: "centre" }])
    .png()
    .toFile(saida);
  console.log(`  ${path.relative(RAIZ, saida)}  ${tamanho}  palavra sobre ${fundo}`);
}

/**
 * O garfo verde num azulejo creme de cantos arredondados.
 *
 * Sai pequeno de propósito. Favicon é desenhado a 16 ou 32px, e mesmo numa
 * tela 4x isso é 128: gerar 512 custava 60KB entregues em toda visita de todo
 * cardápio e da landing, contra menos de 5KB aqui. `palette: true` reduz para
 * a paleta indexada, que é exatamente o caso de uma peça de duas cores chapadas.
 */
async function comOGarfo(tamanho: number, recorte: sharp.Region, saida: string) {
  const garfo = await sharp(LOGO)
    .extract(recorte)
    .resize({ height: Math.round(tamanho * 0.58) })
    .toBuffer();

  const raio = Math.round(tamanho * 0.22);
  const cantos = Buffer.from(
    `<svg width="${tamanho}" height="${tamanho}">` +
      `<rect width="${tamanho}" height="${tamanho}" rx="${raio}" ry="${raio}"/>` +
      `</svg>`
  );

  await sharp({
    create: { width: tamanho, height: tamanho, channels: 4, background: PAPEL },
  })
    .composite([
      { input: garfo, gravity: "centre" },
      // dest-in recorta o azulejo pelo retângulo arredondado. Precisa vir
      // DEPOIS do garfo: aplicado antes, o composite seguinte pintaria por
      // cima dos cantos já removidos.
      { input: cantos, blend: "dest-in" },
    ])
    .png({ compressionLevel: 9, palette: true })
    .toFile(saida);
  console.log(`  ${path.relative(RAIZ, saida)}  ${tamanho}  garfo verde sobre ${PAPEL}`);
}

async function main() {
  if (!fs.existsSync(LOGO)) {
    console.error(`Logotipo não encontrado: ${path.relative(RAIZ, LOGO)}`);
    process.exit(1);
  }
  fs.mkdirSync(DESTINO, { recursive: true });

  console.log("Gerando ícones a partir de public/munowbg.png:");

  // Tela inicial: a palavra.
  await comAPalavra(192, PAPEL, 0.9, path.join(DESTINO, "icone-192.png"));
  await comAPalavra(512, PAPEL, 0.9, path.join(DESTINO, "icone-512.png"));

  // Maskable: a palavra tem que caber no círculo de 80%. Com 4,43:1, a largura
  // máxima cujo retângulo inteiro entra nesse círculo é ~76% do lado.
  await comAPalavra(512, PAPEL, 0.74, path.join(DESTINO, "icone-maskable-512.png"));

  // apple-touch-icon, pela convenção de arquivo do Next. 180 é o tamanho que o
  // iOS pede, e opaco porque o iOS compõe alpha sobre preto.
  await comAPalavra(180, PAPEL, 0.9, path.join(RAIZ, "src/app/apple-icon.png"));

  // Aba do navegador: o garfo, que é o que sobrevive a 16px.
  const recorte = await acharGarfoVerde();
  console.log(
    `  (garfo verde localizado em ${recorte.width}x${recorte.height} ` +
      `no ponto ${recorte.left},${recorte.top})`
  );
  await comOGarfo(128, recorte, path.join(RAIZ, "src/app/icon.png"));

  /*
   * O console (admin.munoapp.com.br). Outra origem, outro app instalável.
   *
   * O bloco aqui é mais alto que a palavra sozinha (logotipo + rótulo), então
   * a maskable encolhe mais: o que precisa caber no círculo de 80% é a
   * DIAGONAL do bloco inteiro, não a largura do logotipo.
   */
  await comAPalavraEGestao(192, 0.7, path.join(DESTINO, "gestao-192.png"));
  await comAPalavraEGestao(512, 0.7, path.join(DESTINO, "gestao-512.png"));
  await comAPalavraEGestao(
    512,
    0.56,
    path.join(DESTINO, "gestao-maskable-512.png")
  );
  await comAPalavraEGestao(180, 0.7, path.join(RAIZ, "public/icons/gestao-apple-180.png"));

  // Dentro de página: a palavra sem fundo nenhum.
  const marca = path.join(DESTINO, "marca.png");
  await sharp(LOGO)
    .trim({ threshold: 10 })
    .resize({ width: 480 })
    .png()
    .toFile(marca);
  console.log(`  ${path.relative(RAIZ, marca)}  480 de largura, com transparência`);
}

main();
