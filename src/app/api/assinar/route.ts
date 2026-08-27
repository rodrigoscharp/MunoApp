import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prismaUnscoped } from "@/lib/prisma";
import { criarLimitador } from "@/lib/rate-limit";
import { checarSlug } from "@/lib/inscricao/slug";
import { isValidCpfCnpj, stripDocumento } from "@/lib/cpf";
import { precoDoCiclo, PLANO_LABELS } from "@/lib/plans";
import {
  criarAssinatura,
  criarCliente,
  listarCobrancasDaAssinatura,
} from "@/lib/assinatura/asaas";

/**
 * Rota que transforma o formulário de checkout em cliente cobrando: reserva
 * o slug, cria o cliente e a assinatura no Asaas, e devolve para onde
 * mandar o navegador pagar. Pública, sem tenant — o mesmo motivo de
 * /api/leads/publico e /api/assinar/slug: quem chega aqui ainda não é
 * restaurante nenhum.
 */
const limitador = criarLimitador({ max: 5, janelaMs: 10 * 60 * 1000 });

const schema = z.object({
  nome: z.string().trim().min(2).max(120),
  email: z.string().trim().email(),
  // toLowerCase aqui, e não dentro de checarSlug: o contrato dela exige
  // slug já normalizado (ver o JSDoc em src/lib/inscricao/slug.ts) — ela
  // recusa maiúscula como INVALIDO em vez de corrigir. Normalizar depois da
  // checagem devolveria "livre" para um slug diferente do que de fato será
  // gravado.
  slug: z.string().trim().toLowerCase(),
  cpfCnpj: z.string().trim().refine(isValidCpfCnpj, "Documento inválido"),
  plano: z.enum(["MEMBRO", "MEMBRO_MESA_QR"]),
  ciclo: z.enum(["MENSAL", "ANUAL"]),
  metodo: z.enum(["CREDIT_CARD", "PIX"]),
});

// Cartão resolve em minutos; PIX gerado à noite é pago de manhã. Segurar o
// slug por só uma hora num PIX legítimo devolveria o endereço para outra
// pessoa no meio do pagamento.
const VALIDADE_MS = { CREDIT_CARD: 60 * 60 * 1000, PIX: 24 * 60 * 60 * 1000 };

export async function POST(req: NextRequest) {
  // A Vercel sobrescreve X-Forwarded-For na borda em vez de acrescentar a
  // ele, então o primeiro valor é sempre o IP público do cliente (mesmo
  // raciocínio de /api/leads/publico e /api/assinar/slug).
  const ip = (req.headers.get("x-forwarded-for") ?? "desconhecido")
    .split(",")[0]
    .trim();
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
  }

  // O limitador vem DEPOIS da validação de propósito. O teto existe para
  // conter quem cria inscrição e assinatura no Asaas em série — trabalho real,
  // com custo de banco e de gateway. Um corpo malformado morre no zod acima
  // sem tocar em nenhum dos dois, e cobrá-lo da mesma cota gastava as
  // tentativas de quem está comprando: cinco requisições quebradas de um
  // script, ou um retry mal-comportado, e o comprador legítimo levava
  // "Muitas tentativas" no meio da compra.
  if (!limitador.permitir(ip, Date.now())) {
    return NextResponse.json(
      { error: "Muitas tentativas. Tente de novo em alguns minutos." },
      { status: 429 }
    );
  }
  const { nome, email, slug, cpfCnpj, plano, ciclo, metodo } = parsed.data;

  // Mensal em PIX não existe: o Asaas só cobra sozinho no cartão. Assinatura
  // mensal em PIX geraria um QR novo a cada mês para o cliente pagar na mão
  // — quem esquecer é bloqueado pela régua, e a plataforma vira cobradora
  // manual do próprio produto que vende para automatizar isso.
  if (ciclo === "MENSAL" && metodo === "PIX") {
    return NextResponse.json(
      {
        error:
          "O plano mensal só aceita cartão. Para pagar via PIX, escolha o plano anual.",
      },
      { status: 400 }
    );
  }

  const disponibilidade = await checarSlug(slug, {
    tenant: async (s) =>
      (await prismaUnscoped.tenant.findUnique({
        where: { slug: s },
        select: { id: true },
      })) !== null,
    inscricao: async (s) =>
      (await prismaUnscoped.inscricao.findUnique({
        where: { slug: s },
        select: { id: true },
      })) !== null,
  });
  if (!disponibilidade.livre) {
    return NextResponse.json(
      { error: "Endereço indisponível", motivo: disponibilidade.motivo },
      { status: disponibilidade.motivo === "EM_USO" ? 409 : 400 }
    );
  }

  // A Inscricao nasce ANTES de qualquer chamada ao Asaas, e é o @unique do
  // slug nela que segura o endereço. Se a cobrança fosse criada primeiro,
  // abriria uma janela em que dois clientes pagam pelo mesmo endereço — e um
  // dos dois pagou por nada, sem nenhum jeito de saber até tentar publicar.
  //
  // O documento NÃO entra aqui: ele não é persistido em lugar nenhum desta
  // rota, só viaja até o Asaas via criarCliente logo abaixo — mesma regra que
  // src/lib/cpf.ts documenta. O que fica gravado é o asaasCustomerId.
  let inscricao;
  try {
    inscricao = await prismaUnscoped.inscricao.create({
      data: {
        nome,
        email,
        slug,
        plano,
        ciclo,
        expiraEm: new Date(Date.now() + VALIDADE_MS[metodo]),
      },
    });
  } catch (err) {
    // O checarSlug acima é só atalho: entre ele e este create cabe outra
    // requisição inteira (check-then-act — READ COMMITTED não impede). Quem
    // perde essa corrida bate no @unique do slug e recebe um P2002 cru, que
    // aqui é traduzido para o mesmo 409 do atalho — não para 500, e não
    // silenciosamente para "indisponível" quando o erro é outra coisa (banco
    // fora do ar, por exemplo), o que mandaria o cliente trocar de nome por
    // um problema que não é do slug. Mesmo raciocínio de provisionTenant em
    // src/lib/tenant-provisioning.ts.
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      return NextResponse.json(
        { error: "Endereço indisponível", motivo: "EM_USO" },
        { status: 409 }
      );
    }
    // Qualquer outro erro (conexão recusada, etc.) não é "slug em uso" — 500
    // genérico, e não um 409 que mandaria o cliente trocar de nome por um
    // problema que não tem nada a ver com o slug escolhido.
    console.error("Falha ao gravar a Inscricao:", err);
    return NextResponse.json(
      { error: "Erro ao processar o pedido" },
      { status: 500 }
    );
  }

  // O Lead entra aqui, logo depois da Inscricao e ANTES de qualquer chamada
  // ao Asaas — não junto do bloco que fala com o gateway. Um registro de CRM
  // não pode ter poder de abortar um checkout que já virou cobrança: se o
  // create do Lead ficasse no try do Asaas e falhasse depois da assinatura
  // já criada lá, o catch abaixo apagaria a Inscricao e devolveria 502 com a
  // cobrança viva no Asaas — o cliente paga, o webhook não acha Inscricao
  // nenhuma para casar o pagamento, e o restaurante nunca é criado. Lead é
  // relatório; cobrança é receita, e o caminho que gera receita não pode
  // depender do que gera relatório.
  //
  // Colocado antes do Asaas, ele também sobrevive a uma falha de pagamento:
  // se o Asaas falhar mais abaixo, a Inscricao é apagada mas o Lead fica,
  // registrando a tentativa abandonada — dado de funil que hoje se perderia
  // se o Lead só nascesse depois de pagar.
  try {
    await prismaUnscoped.lead.create({
      data: {
        restaurante: nome,
        email,
        plano: PLANO_LABELS[plano],
        origem: "checkout",
        status: "NEGOCIACAO",
      },
    });
  } catch (err) {
    // Não-fatal, no mesmo espírito do vínculo de lead em
    // src/app/api/platform/leads/[id]/converter/route.ts: o que importa
    // (aqui, a Inscricao que segura o slug e vai virar cobrança) já existe.
    // Perder a foto do CRM não pode derrubar o checkout do cliente.
    console.error(
      `Falha ao gravar o Lead da inscrição ${inscricao.id} (${email}):`,
      err
    );
  }

  // A REGRA (daqui até o fim da função): enquanto não existe nada cobrável
  // no Asaas, soltar o slug apagando a Inscricao é o desfecho certo — não
  // sobra nada para o webhook precisar achar. A partir do instante em que a
  // assinatura existe lá, é o oposto: a Inscricao precisa sobreviver, porque
  // é ela que o webhook usa para casar o pagamento com o pedido. Apagá-la
  // depois desse instante é o pior cenário possível — cliente cobrado (o
  // Asaas manda e-mail de cobrança sozinho, e a tela de pagamento pode já
  // estar aberta) e zero linhas locais apontando para a assinatura.
  //
  // Por isso o try/catch é dividido em duas fases, e não um bloco só: a
  // fase 1 (cliente + assinatura) ainda pode desfazer a Inscricao; a fase 2
  // (a partir do momento em que a assinatura existe) nunca mais pode.

  let cliente: Awaited<ReturnType<typeof criarCliente>> | undefined;
  let assinatura: Awaited<ReturnType<typeof criarAssinatura>> | undefined;
  try {
    cliente = await criarCliente({
      nome,
      email,
      cpfCnpj: stripDocumento(cpfCnpj),
    });

    const descricao = `Muno — ${PLANO_LABELS[plano]} (${ciclo === "ANUAL" ? "anual" : "mensal"})`;
    const valorCentavos = precoDoCiclo(plano, ciclo);

    // Os dois ciclos criam assinatura, nunca cobrança avulsa. O anual em
    // avulso nasceria sem asaasSubscriptionId, e o cron — que só pula a
    // geração de cobrança quando esse id existe — emitiria uma cobrança
    // MENSAL para quem pagou o ano inteiro, bloqueando pela régua em 15 dias
    // um cliente que já tinha pago.
    assinatura = await criarAssinatura({
      customerId: cliente.id,
      valorCentavos,
      ciclo,
      billingType: metodo,
      descricao,
      externalReference: inscricao.id,
    });
  } catch (erro) {
    // Nada cobrável existe ainda (falhou em criarCliente, ou o próprio
    // criarAssinatura): soltar o slug é o desfecho certo, em vez de deixá-lo
    // preso até o cron de inscrições vencidas passar.
    await desfazerInscricao(inscricao.id, erro);
    logFalhaAsaas("criar cliente/assinatura no Asaas", erro, {
      inscricaoId: inscricao.id,
      clienteId: cliente?.id,
    });
    return NextResponse.json(
      { error: "Não foi possível iniciar o pagamento. Tente de novo." },
      { status: 502 }
    );
  }

  try {
    // A partir daqui a assinatura já existe e é cobrável no Asaas. Gravar os
    // ids na Inscricao é o primeiro passo, ANTES de listar as cobranças: a
    // linha local passa a apontar para a assinatura no exato momento em que
    // ela passa a existir, e não depois de mais uma chamada de rede que pode
    // falhar.
    await prismaUnscoped.inscricao.update({
      where: { id: inscricao.id },
      data: {
        asaasCustomerId: cliente.id,
        asaasSubscriptionId: assinatura.id,
      },
    });

    const checkoutUrl = await urlDaPrimeiraCobranca(assinatura.id);

    return NextResponse.json(
      { inscricaoId: inscricao.id, checkoutUrl },
      { status: 201 }
    );
  } catch (erro) {
    // A assinatura já existe no Asaas — a Inscricao NÃO é apagada aqui, nem
    // se o próprio update acima tiver falhado. O slug fica preso até
    // expirar (expiraEm cuida disso, e é barato), mas se o cliente pagar o
    // webhook consegue achar esta linha pelo asaasSubscriptionId. Apagar
    // aqui reproduziria exatamente o defeito que este código corrige.
    logFalhaAsaas(
      "processar a assinatura já criada no Asaas (Inscricao NÃO apagada de propósito)",
      erro,
      { inscricaoId: inscricao.id, clienteId: cliente.id, assinaturaId: assinatura.id }
    );
    return NextResponse.json(
      { error: "Não foi possível iniciar o pagamento. Tente de novo." },
      { status: 502 }
    );
  }
}

/**
 * Apaga a Inscricao para soltar o slug. Só deve ser chamada enquanto ainda
 * NÃO existe nada cobrável no Asaas — depois desse ponto a Inscricao precisa
 * sobreviver (ver a REGRA no corpo de POST).
 */
async function desfazerInscricao(inscricaoId: string, causa: unknown) {
  await prismaUnscoped.inscricao.delete({ where: { id: inscricaoId } }).catch((delErro) => {
    // Se nem o delete de recuperação funcionar, o slug fica preso E ninguém
    // fica sabendo — pior que os dois problemas separados. Isto não pode
    // sumir num `.catch(() => {})` silencioso.
    console.error(
      `Falha ao apagar a Inscricao ${inscricaoId} ao tentar soltar o slug (causa original abaixo):`,
      delErro,
      "causa original:",
      causa
    );
  });
}

/**
 * Log único para as falhas do Asaas nesta rota. Carrega todo id disponível
 * (cliente, assinatura, inscrição) porque quem ler isto às 2 da manhã não
 * tem mais nenhum contexto — só o texto do console.
 */
function logFalhaAsaas(
  contexto: string,
  erro: unknown,
  info: { inscricaoId: string; clienteId?: string; assinaturaId?: string }
) {
  console.error(
    `Falha ao ${contexto} — inscricao=${info.inscricaoId} cliente=${info.clienteId ?? "(nenhum)"} assinatura=${info.assinaturaId ?? "(nenhuma)"}:`,
    erro
  );
}

/** A URL onde o cliente paga a primeira cobrança da assinatura. */
async function urlDaPrimeiraCobranca(subscriptionId: string): Promise<string> {
  const { data } = await listarCobrancasDaAssinatura(subscriptionId);
  const primeira = data[0];
  if (!primeira?.invoiceUrl) {
    // Assinatura criada e nenhuma cobrança: não há para onde mandar o
    // cliente. O catch acima solta o slug e devolve 502 — melhor que uma
    // tela em branco sem explicação.
    throw new Error(
      `Assinatura ${subscriptionId} criada sem cobrança: não há onde mandar o cliente pagar.`
    );
  }
  return primeira.invoiceUrl;
}
