import "dotenv/config";
import { prismaUnscoped } from "../src/lib/prisma";
import { precoDoCiclo } from "../src/lib/plans";

/**
 * Dispara à mão o webhook que o Asaas dispararia quando um pagamento é
 * confirmado, contra uma Inscricao real do banco local.
 *
 * Existe porque o provisionamento inteiro — webhook, tenant, e-mail de
 * boas-vindas, idempotência da reentrega — não depende da conta Asaas: o
 * handler só precisa de um corpo com o evento certo e do token no header. O
 * que a conta destrava é o outro lado, a saída (criarCliente, criarAssinatura
 * e o pagamento de verdade). Enquanto ela não existe, isto cobre metade do
 * bloco "Verificação final" do plano de checkout self-service.
 *
 * Rodar duas vezes é o teste que importa: a segunda entrega tem que sair 200
 * SEM criar um segundo restaurante — é a garantia contra o cliente que paga
 * uma vez e ganha dois tenants.
 *
 *   npm run assinatura:webhook-teste                    a inscrição mais recente aguardando pagamento
 *   npm run assinatura:webhook-teste -- --slug "x"      uma inscrição específica
 *   npm run assinatura:webhook-teste -- --evento PAYMENT_RECEIVED
 */

function arg(nome: string): string | undefined {
  const i = process.argv.indexOf(`--${nome}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

async function main() {
  const token = process.env.ASAAS_WEBHOOK_TOKEN;
  if (!token) {
    console.error(
      "ASAAS_WEBHOOK_TOKEN não está no .env — o handler responderia 401."
    );
    process.exit(1);
  }

  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const slug = arg("slug");
  const evento = arg("evento") ?? "PAYMENT_CONFIRMED";

  const inscricao = slug
    ? await prismaUnscoped.inscricao.findUnique({ where: { slug } })
    : await prismaUnscoped.inscricao.findFirst({
        where: { status: "AGUARDANDO_PAGAMENTO" },
        orderBy: { createdAt: "desc" },
      });

  if (!inscricao) {
    console.error(
      slug
        ? `Nenhuma inscrição com o slug "${slug}".`
        : "Nenhuma inscrição aguardando pagamento. Assine em localhost:3000/assinar primeiro."
    );
    process.exit(1);
  }

  const valor = precoDoCiclo(inscricao.plano, inscricao.ciclo) / 100;

  // O externalReference é o campo que o handler procura primeiro, e é o id da
  // própria Inscricao — a rede de segurança que funciona mesmo quando nenhum
  // id do Asaas chegou a ser gravado. Por isso é ele que este script manda.
  const corpo = {
    event: evento,
    payment: {
      id: inscricao.asaasPaymentId ?? `pay_teste_${inscricao.id.slice(-8)}`,
      value: valor,
      subscription: inscricao.asaasSubscriptionId ?? undefined,
      externalReference: inscricao.id,
    },
  };

  console.log(`\n→ ${evento} para "${inscricao.slug}" (${inscricao.status})`);
  console.log(`  ${base}/api/assinaturas/webhook/asaas\n`);

  const res = await fetch(`${base}/api/assinaturas/webhook/asaas`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "asaas-access-token": token,
    },
    body: JSON.stringify(corpo),
  });

  console.log(`  HTTP ${res.status} ${await res.text()}\n`);

  const depois = await prismaUnscoped.inscricao.findUnique({
    where: { id: inscricao.id },
    include: { tenant: { select: { slug: true, nome: true } } },
  });

  console.log(`  status:  ${inscricao.status} → ${depois?.status}`);
  console.log(
    `  tenant:  ${depois?.tenant ? `${depois.tenant.nome} (${depois.tenant.slug})` : "nenhum"}`
  );

  const quantos = await prismaUnscoped.tenant.count({
    where: { slug: inscricao.slug },
  });
  console.log(
    `  tenants com o slug "${inscricao.slug}": ${quantos}${quantos > 1 ? "  ← DUPLICOU" : ""}\n`
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prismaUnscoped.$disconnect());
