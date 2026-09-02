import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

/**
 * Deriva os ícones do PWA do ícone oficial da marca.
 *
 *     npx tsx scripts/gerar-icones-pwa.ts
 *
 * A fonte é src/app/icon.png, o mesmo arquivo que o Next já serve como favicon
 * pela convenção de arquivo. Ele é o azulejo terracota com o glifo branco:
 * opaco no miolo, com alpha só nos cantos arredondados.
 *
 * Isso é o que separa as duas famílias geradas aqui:
 *
 * - `purpose: "any"` (192 e 512) achata sobre o CREME. O sistema desenha o
 *   arquivo como ele é, então o canto arredondado precisa aparecer, e um PNG
 *   com alpha entregue ao Android acaba composto sobre branco puro, que briga
 *   com o papel da marca.
 *
 * - maskable e apple-touch-icon achatam sobre o TERRACOTA, sangrando até a
 *   borda. Nos dois casos quem arredonda é o sistema operacional, e deixar o
 *   canto redondo do arquivo por baixo da máscara do aparelho produz a borda
 *   suja clássica: uma casca clara acompanhando a curva.
 *
 * O glifo não precisa ser reduzido para caber na zona segura do maskable (o
 * círculo central de 80%): ele já ocupa cerca de 30% do quadro, centrado.
 * Encolher de novo só o deixaria pequeno à toa.
 *
 * Rodar de novo é idempotente: tudo é derivado de icon.png, que este script
 * nunca escreve.
 */

// Caminhos relativos à raiz do repo, como os outros scripts do projeto
// (enviar-backup.ts lê ".env.local" do mesmo jeito). O tsx compila para CJS
// aqui, então import.meta.dirname não existe.
const RAIZ = process.cwd();
const ORIGEM = path.join(RAIZ, "src/app/icon.png");
const DESTINO = path.join(RAIZ, "public/icons");

// Os mesmos valores de src/app/globals.css. Repetidos aqui porque o sharp não
// lê CSS, e um ícone que destoa do papel do app é o tipo de divergência que
// ninguém nota até ver o aparelho de alguém.
const PAPEL = "#F5F2EE";
const TERRACOTA = "#D4612A";

async function achatar(tamanho: number, fundo: string, saida: string) {
  await sharp(ORIGEM)
    .resize(tamanho, tamanho, { fit: "contain", background: fundo })
    .flatten({ background: fundo })
    .png()
    .toFile(saida);
  console.log(`  ${path.relative(RAIZ, saida)}  ${tamanho}x${tamanho}  ${fundo}`);
}

async function main() {
  if (!fs.existsSync(ORIGEM)) {
    console.error(`Ícone de origem não encontrado: ${path.relative(RAIZ, ORIGEM)}`);
    process.exit(1);
  }
  fs.mkdirSync(DESTINO, { recursive: true });

  console.log("Gerando ícones do PWA a partir de src/app/icon.png:");

  await achatar(192, PAPEL, path.join(DESTINO, "icone-192.png"));
  await achatar(512, PAPEL, path.join(DESTINO, "icone-512.png"));
  await achatar(512, TERRACOTA, path.join(DESTINO, "icone-maskable-512.png"));

  // Substitui o apple-icon.png da convenção de arquivo do Next. Ele estava em
  // 512x512 COM alpha, e o iOS compõe alpha sobre preto: o resultado era o
  // azulejo terracota com quatro cunhas pretas nos cantos, na tela inicial de
  // quem instalasse. 180 é o tamanho que o iOS pede hoje.
  await achatar(180, TERRACOTA, path.join(RAIZ, "src/app/apple-icon.png"));
}

main();
