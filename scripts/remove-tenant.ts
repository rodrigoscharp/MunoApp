import "dotenv/config";
import { RemocaoError, contarDadosDoTenant, removeTenant } from "../src/lib/tenant-removal";
import { prismaUnscoped } from "../src/lib/prisma";

function parseArgs(argv: string[]): Record<string, string> {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const value = argv[i + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`Faltou valor para --${key}`);
      }
      args[key] = value;
      i++;
    }
  }
  return args;
}

function hostDoBanco(): string {
  try {
    return new URL(process.env.DATABASE_URL ?? "").hostname || "desconhecido";
  } catch {
    return "desconhecido";
  }
}

const USO =
  'Uso: npm run tenant:remove -- --slug "restaurante-x" [--confirmar "restaurante-x"]';

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.slug) {
    console.error(USO);
    process.exit(1);
  }

  const { tenant, contagens, leadsDesvinculados } = await contarDadosDoTenant(
    args.slug
  );

  const total = Object.values(contagens).reduce((a, b) => a + b, 0);

  console.log(`\n  Banco:  ${hostDoBanco()}`);
  console.log(`  Tenant: ${tenant.nome} (${tenant.slug})\n`);
  console.log("  Será apagado:");
  for (const [modelo, n] of Object.entries(contagens)) {
    if (n > 0) console.log(`    ${String(n).padStart(6)}  ${modelo}`);
  }
  if (total === 0) console.log("         0  (nenhum dado além do próprio tenant)");
  if (leadsDesvinculados > 0) {
    console.log(
      `\n  ${leadsDesvinculados} lead(s) perdem o vínculo, mas continuam no funil.`
    );
  }

  // A confirmação é o slug digitado de novo, não um "s/n": o erro que ela
  // precisa pegar é o de ter escolhido o tenant errado, e para isso quem
  // confirma tem que ler o nome na tela e repeti-lo.
  if (args.confirmar !== tenant.slug) {
    console.log(
      `\n  Nada foi apagado. Para confirmar, repita o slug:\n\n    npm run tenant:remove -- --slug "${tenant.slug}" --confirmar "${tenant.slug}"\n`
    );
    process.exit(1);
  }

  const resumo = await removeTenant(args.slug);

  console.log(`\n  Removido: ${resumo.tenant.nome} (${resumo.tenant.slug})`);
  console.log(
    `  ${total} registro(s) apagado(s) em ${Object.keys(contagens).length} tabelas.\n`
  );
}

main()
  .catch((err) => {
    if (err instanceof RemocaoError) {
      console.error(`\n  ${err.message}\n`);
      process.exit(1);
    }
    console.error(err);
    process.exit(1);
  })
  .finally(() => prismaUnscoped.$disconnect());
