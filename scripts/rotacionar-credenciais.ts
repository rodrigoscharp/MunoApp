import "dotenv/config";
import { decryptSecret, encryptSecret, precisaReencriptar } from "../src/lib/crypto";
import { prismaUnscoped } from "../src/lib/prisma";

/**
 * Regrava com a chave atual as credenciais de gateway que só abrem com a chave
 * anterior (PAYMENT_TOKEN_ENCRYPTION_KEY_ANTERIOR). Passo 2 de uma rotação:
 *
 *   1. mover a chave em uso para PAYMENT_TOKEN_ENCRYPTION_KEY_ANTERIOR e pôr a
 *      nova em PAYMENT_TOKEN_ENCRYPTION_KEY (a leitura já abre as duas);
 *   2. rodar este script;
 *   3. remover PAYMENT_TOKEN_ENCRYPTION_KEY_ANTERIOR.
 *
 * Sem --confirmar só conta.
 */
function hostDoBanco(): string {
  try {
    return new URL(process.env.DATABASE_URL ?? "").hostname || "desconhecido";
  } catch {
    return "desconhecido";
  }
}

async function main() {
  const conexoes = await prismaUnscoped.paymentConnection.findMany({
    select: { id: true, tenantId: true, provider: true, credentials: true },
  });
  const pendentes = conexoes.filter((c) => precisaReencriptar(c.credentials));

  console.log(`\n  Banco: ${hostDoBanco()}`);
  console.log(`  ${conexoes.length} conexão(ões) de gateway, ${pendentes.length} ainda na chave anterior.\n`);

  if (pendentes.length === 0) return;

  if (!process.argv.includes("--confirmar")) {
    console.log("  Nada foi alterado. Para regravar:\n\n    npm run credenciais:rotacionar -- --confirmar\n");
    process.exit(1);
  }

  for (const c of pendentes) {
    const novo = encryptSecret(decryptSecret(c.credentials));
    await prismaUnscoped.paymentConnection.update({
      where: { id: c.id },
      data: { credentials: novo },
    });
  }
  console.log(`  ${pendentes.length} credencial(is) regravada(s) com a chave atual.\n`);
}

main()
  .catch((erro) => {
    console.error(erro);
    process.exit(1);
  })
  .finally(() => prismaUnscoped.$disconnect());
