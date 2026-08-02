import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { put, list, del } from "@vercel/blob";

/**
 * Manda os dumps para o Vercel Blob, para o backup deixar de morrer junto com a
 * máquina.
 *
 * Sobe os arquivos versionados, não um espelho: guardar os 7 dias é o que
 * permite recuperar de um erro que ninguém notou na hora. Um banco espelhado
 * diariamente teria sobrescrito o estado bom antes de alguém perceber.
 *
 * O store é privado (`--access private` na criação). Isto aqui é dado pessoal de
 * cliente de restaurante — nome, telefone, endereço — e não pode ficar atrás de
 * uma URL adivinhável.
 *
 * Chamado no fim de scripts/backup-producao.sh. Sozinho:
 *     npm run db:enviar
 */

// Mesma precedência do Next: .env.local primeiro, .env depois. O
// BLOB_READ_WRITE_TOKEN só existe no .env.local, escrito pelo CLI da Vercel, e
// o dotenv não sobrescreve o que já foi definido.
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

const PREFIXO = "dumps/";
const MANTER = 7;

function dumpsLocais(): string[] {
  const dir = path.resolve(__dirname, "../backups");
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.startsWith("muno-") && f.endsWith(".sql"))
    .sort()
    .reverse()
    .slice(0, MANTER)
    .map((f) => path.join(dir, f));
}

async function main() {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    console.error(
      "\nerro: BLOB_READ_WRITE_TOKEN ausente.\n" +
        "      Rode 'npx vercel env pull .env.local --yes' e apague de lá as\n" +
        "      linhas DATABASE_URL e DIRECT_URL, que sequestram o banco local.\n"
    );
    process.exit(1);
  }

  const locais = dumpsLocais();
  if (locais.length === 0) {
    console.error("\nerro: nenhum dump em backups/. Rode 'npm run db:backup'.\n");
    process.exit(1);
  }

  const remotos = await list({ prefix: PREFIXO });
  const jaEnviados = new Set(remotos.blobs.map((b) => path.basename(b.pathname)));

  let enviados = 0;
  for (const arquivo of locais) {
    const nome = path.basename(arquivo) + ".gz";
    if (jaEnviados.has(nome)) continue;

    // Gzip antes de subir: dump SQL comprime muito, e o que trafega e o que fica
    // guardado encolhem junto.
    const comprimido = zlib.gzipSync(fs.readFileSync(arquivo));

    await put(PREFIXO + nome, comprimido, {
      access: "private",
      contentType: "application/gzip",
      // O nome já carrega data e hora; sufixo aleatório só atrapalharia na hora
      // de achar o dump de um dia específico.
      addRandomSuffix: false,
    });

    const kb = Math.round(comprimido.length / 1024);
    console.log(`  enviado ${nome} (${kb} KB)`);
    enviados++;
  }

  if (enviados === 0) console.log("  nada novo para enviar");

  // Retenção remota: os MANTER mais recentes por nome, que já é a data.
  //
  // Deliberadamente NÃO é "apagar o que não existe em backups/". O backup roda
  // no GitHub Actions, onde o repositório é clonado limpo e só existe o dump do
  // dia — espelhar o diretório local ali apagaria os outros seis da nuvem toda
  // madrugada, deixando um único ponto no tempo. A nuvem é a cópia boa e manda
  // na própria retenção.
  const depoisDoEnvio = await list({ prefix: PREFIXO });
  const excedente = depoisDoEnvio.blobs
    .sort((a, b) => b.pathname.localeCompare(a.pathname))
    .slice(MANTER);

  if (excedente.length > 0) {
    await del(excedente.map((b) => b.url));
    console.log(`  removidos ${excedente.length} dump(s) antigos do Blob`);
  }

  const restantes = depoisDoEnvio.blobs.length - excedente.length;
  const total = depoisDoEnvio.blobs
    .filter((b) => !excedente.includes(b))
    .reduce((s, b) => s + b.size, 0);
  console.log(`  Blob: ${restantes} dump(s), ${Math.round(total / 1024)} KB`);
}

main().catch((err) => {
  console.error("\nerro ao enviar para o Blob:", err.message ?? err);
  process.exit(1);
});
