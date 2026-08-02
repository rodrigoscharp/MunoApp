import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { get, list } from "@vercel/blob";

/**
 * Traz um dump de volta do Vercel Blob.
 *
 * É a outra metade do enviar-backup.ts, e a que importa: backup que ninguém sabe
 * restaurar não é backup. Funciona numa máquina zerada — só precisa do repo e do
 * BLOB_READ_WRITE_TOKEN, que sai de `vercel env pull`.
 *
 *   npm run db:recuperar            lista o que existe na nuvem
 *   npm run db:recuperar -- 0802    baixa o dump cujo nome casa com "0802"
 *
 * O arquivo cai em backups/ e o script imprime o comando de restauração. Ele não
 * restaura sozinho de propósito: escolher em qual banco despejar é decisão de
 * quem está no meio de um incidente, não de um script.
 */

dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

const PREFIXO = "dumps/";

async function main() {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    console.error(
      "\nerro: BLOB_READ_WRITE_TOKEN ausente.\n" +
        "      npx vercel link && npx vercel env pull .env.local --yes\n" +
        "      (depois apague DATABASE_URL e DIRECT_URL do .env.local)\n"
    );
    process.exit(1);
  }

  const { blobs } = await list({ prefix: PREFIXO });
  if (blobs.length === 0) {
    console.error("\nNenhum dump no Blob. Rode 'npm run db:backup' primeiro.\n");
    process.exit(1);
  }

  const ordenados = blobs.sort((a, b) => b.pathname.localeCompare(a.pathname));
  const filtro = process.argv[2];

  if (!filtro) {
    console.log(`\n${ordenados.length} dump(s) disponíveis:\n`);
    for (const b of ordenados) {
      const kb = Math.round(b.size / 1024);
      const dia = new Date(b.uploadedAt).toLocaleString("pt-BR");
      console.log(`  ${path.basename(b.pathname)}  ${kb} KB   ${dia}`);
    }
    console.log(`\nPara baixar:  npm run db:recuperar -- <trecho do nome>\n`);
    return;
  }

  const escolhido = ordenados.find((b) => b.pathname.includes(filtro));
  if (!escolhido) {
    console.error(`\nNenhum dump casa com "${filtro}". Rode sem argumento para listar.\n`);
    process.exit(1);
  }

  console.log(`Baixando ${path.basename(escolhido.pathname)}...`);

  // get() do SDK e não fetch na url: o store é privado, então a URL sozinha
  // devolve 403 — a leitura precisa ir assinada com o token.
  const arquivo = await get(escolhido.url, { access: "private" });
  if (!arquivo?.stream) {
    console.error("\nerro: download falhou — o Blob não devolveu conteúdo.\n");
    process.exit(1);
  }

  const partes: Buffer[] = [];
  for await (const pedaco of arquivo.stream as unknown as AsyncIterable<Uint8Array>) {
    partes.push(Buffer.from(pedaco));
  }
  const comprimido = Buffer.concat(partes);
  const sql = zlib.gunzipSync(comprimido);

  // Mesma checagem do backup: um download truncado não pode passar por dump bom.
  const fim = sql.subarray(-2000).toString();
  if (!fim.includes("PostgreSQL database dump complete")) {
    console.error("\nerro: o arquivo baixado está incompleto. Não use.\n");
    process.exit(1);
  }

  const dir = path.resolve(__dirname, "../backups");
  fs.mkdirSync(dir, { recursive: true });
  const destino = path.join(dir, path.basename(escolhido.pathname).replace(/\.gz$/, ""));
  fs.writeFileSync(destino, sql);

  console.log(`\nPronto: ${path.relative(process.cwd(), destino)} (${Math.round(sql.length / 1024)} KB)\n`);
  console.log("Para inspecionar num banco local descartável:");
  console.log("    docker compose up -d");
  console.log(`    docker exec -i muno-db-dev psql -U muno -d muno -q < ${path.relative(process.cwd(), destino)}\n`);
  console.log("Para restaurar em PRODUÇÃO (destrutivo, confira duas vezes):");
  console.log(`    set -a; . ./.env.prod; set +a`);
  console.log(`    psql "$DIRECT_URL" < ${path.relative(process.cwd(), destino)}\n`);
}

main().catch((err) => {
  console.error("\nerro:", err.message ?? err);
  process.exit(1);
});
