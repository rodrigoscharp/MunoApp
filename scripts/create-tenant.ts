import "dotenv/config";
import {
  ProvisionError,
  provisionTenant,
} from "../src/lib/tenant-provisioning";
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

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.nome || !args.slug || !args.email) {
    console.error(
      'Uso: npm run tenant:create -- --nome "Restaurante X" --slug "restaurante-x" --email "admin@restaurantex.com" [--senha "..."]'
    );
    process.exit(1);
  }

  try {
    const { tenant, admin, url, senha } = await provisionTenant({
      nome: args.nome,
      slug: args.slug,
      email: args.email,
      senha: args.senha,
    });

    console.log("\nTenant criado com sucesso!\n");
    console.log(`  Nome:   ${tenant.nome}`);
    console.log(`  Slug:   ${tenant.slug}`);
    console.log(`  URL:    ${url}`);
    console.log(`  Admin:  ${admin.email}`);
    console.log(`  Senha:  ${senha}`);
    console.log(
      "\nLembre-se: o subdomínio só responde se o domínio curinga (*.<domínio raiz>) estiver apontado para o projeto na Vercel."
    );
  } catch (err) {
    if (err instanceof ProvisionError) {
      console.error(err.message);
      process.exit(1);
    }
    throw err;
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prismaUnscoped.$disconnect());
