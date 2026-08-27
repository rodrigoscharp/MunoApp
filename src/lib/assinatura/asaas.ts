import crypto from "node:crypto";
import type { Ciclo } from "@/lib/plans";

/**
 * O Asaas da própria Muno — ela cobrando o restaurante.
 *
 * NÃO é src/lib/payments/asaas-adapter.ts. Aquele implementa PaymentProvider,
 * lê credencial criptografada de PaymentConnection por tenant, e serve o
 * restaurante cobrando o cliente dele. Aqui existe uma conta só, a da
 * plataforma, com a chave em env. Fundir os dois faria a credencial da
 * plataforma trafegar pelo caminho desenhado para credencial de tenant.
 *
 * As convenções são as mesmas de propósito (header `access_token`, hosts de
 * sandbox e produção, tradução de errors[].description): é a mesma API.
 */

const BASE_URLS = {
  sandbox: "https://api-sandbox.asaas.com/v3",
  production: "https://api.asaas.com/v3",
} as const;

function baseUrl(): string {
  return process.env.ASAAS_ENV === "production"
    ? BASE_URLS.production
    : BASE_URLS.sandbox;
}

/**
 * Recusa COM resposta HTTP — o gateway leu o pedido e disse não.
 *
 * Distinguir isso de falha de rede é o que autoriza uma segunda tentativa:
 * numa conexão que cai, o POST pode ter chegado e criado a assinatura antes,
 * e repetir cobraria o cliente duas vezes.
 */
class AsaasRecusou extends Error {}

async function chamar<T>(caminho: string, body?: unknown): Promise<T> {
  const res = await fetch(`${baseUrl()}${caminho}`, {
    method: body ? "POST" : "GET",
    headers: {
      "Content-Type": "application/json",
      access_token: process.env.ASAAS_API_KEY ?? "",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  if (!res.ok) {
    const corpo = (await res.json().catch(() => null)) as
      | { errors?: { description?: string }[] }
      | null;
    throw new AsaasRecusou(
      corpo?.errors?.[0]?.description ??
        `Asaas respondeu ${res.status} em ${caminho}`
    );
  }
  return (await res.json()) as T;
}

/** O Asaas fala em reais com duas casas; nós guardamos centavos inteiros. */
function emReais(centavos: number): number {
  return centavos / 100;
}

/**
 * A URL pública da plataforma — o domínio nu, sem subdomínio de tenant.
 *
 * Mesma leitura de ROOT_DOMAIN que buildTenantBaseUrl: a ÚLTIMA entrada é o
 * domínio do qual tudo pende. Aqui não se acrescenta slug nenhum, porque a
 * página de obrigado é da Muno, não de um restaurante — ele ainda nem existe
 * quando o cliente volta.
 */
function urlDaPlataforma(caminho: string): string {
  const roots = (process.env.ROOT_DOMAIN ?? "localhost:3000").split(",");
  const root = roots[roots.length - 1].trim();
  const protocolo = root.startsWith("localhost") ? "http" : "https";
  return `${protocolo}://${root}${caminho}`;
}

function proximoVencimentoISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function criarCliente(input: {
  nome: string;
  email: string;
  cpfCnpj: string;
}): Promise<{ id: string }> {
  return chamar<{ id: string }>("/customers", {
    name: input.nome,
    email: input.email,
    cpfCnpj: input.cpfCnpj,
  });
}

/**
 * Os dois ciclos são assinatura, nunca cobrança avulsa.
 *
 * O anual em avulso nasceria sem asaasSubscriptionId, e o cron — que só pula a
 * geração de cobrança quando esse id existe — emitiria cobrança MENSAL para
 * quem pagou o ano inteiro, bloqueando o cliente em 15 dias pela régua.
 * Assinatura anual ainda renova sozinha; avulsa morreria calada aos 12 meses.
 *
 * billingType vem de fora porque o mensal só aceita cartão (é o único que o
 * Asaas cobra sozinho) e o anual aceita PIX — no anual, um QR por ano com
 * antecedência é aceitável; por mês, não.
 */
export async function criarAssinatura(input: {
  customerId: string;
  valorCentavos: number;
  ciclo: Ciclo;
  // Opcional porque o mensal só tem uma opção sensata (cartão, cobrado
  // sozinho pelo Asaas): quem chama para o mensal não devia precisar
  // escolher. O anual, que aceita PIX, sempre informa explicitamente. O
  // caminho que importa — a rota de checkout — sempre passa o valor; o
  // default abaixo é rede de segurança para quem esquecer, não descuido.
  billingType?: "PIX" | "CREDIT_CARD";
  descricao: string;
  externalReference: string;
}): Promise<{ id: string }> {
  const pedido = {
    customer: input.customerId,
    billingType: input.billingType ?? "CREDIT_CARD",
    value: emReais(input.valorCentavos),
    nextDueDate: proximoVencimentoISO(),
    cycle: input.ciclo === "ANUAL" ? "YEARLY" : "MONTHLY",
    description: input.descricao,
    externalReference: input.externalReference,
    // Sem isto o cliente paga e fica parado na página do Asaas, sem nenhuma
    // tela dizendo que o restaurante está sendo criado — e a única ponte de
    // volta seria o e-mail de boas-vindas, que depende do webhook ter
    // chegado. A página de obrigado não afirma que ficou pronto: ela explica
    // o que vem a seguir, e é honesta sobre o e-mail poder demorar.
  };

  try {
    return await chamar<{ id: string }>("/subscriptions", {
      ...pedido,
      callback: {
        successUrl: urlDaPlataforma("/assinar/obrigado"),
        autoRedirect: true,
      },
    });
  } catch (erro) {
    // CONVENIÊNCIA NÃO DERRUBA RECEITA. O callback exige que a conta Asaas
    // tenha um site cadastrado (Minha Conta > Informações); sem isso o POST
    // inteiro volta 400 e NENHUMA assinatura é criada — o checkout morre por
    // causa da página de obrigado. Descoberto contra o sandbox real, com o
    // teste de unidade passando: ele afirmava o corpo enviado, não que o
    // gateway aceita.
    //
    // Só recusa COM resposta repete. Falha de rede não: o POST pode ter
    // chegado e criado a assinatura antes de a conexão cair, e a segunda
    // tentativa cobraria o cliente duas vezes. Se o erro persistir sem o
    // callback, ele propaga — a causa era outra.
    if (!(erro instanceof AsaasRecusou)) throw erro;
    console.error(
      "[asaas] Assinatura recusada com callback; repetindo sem ele. " +
        "O cliente não será devolvido para /assinar/obrigado depois de pagar. " +
        `Cadastre o site da Muno em Minha Conta > Informações. Motivo: ${erro.message}`
    );
    return chamar<{ id: string }>("/subscriptions", pedido);
  }
}

/**
 * Os status que o Asaas considera dinheiro dentro. RECEIVED_IN_CASH entra
 * porque baixa manual também é pagamento — quem deu baixa quis dizer que
 * recebeu.
 */
const PAGOS = new Set(["CONFIRMED", "RECEIVED", "RECEIVED_IN_CASH"]);

/**
 * Alguma cobrança desta assinatura já foi paga?
 *
 * Existe para uma decisão de uma via só: a limpeza de inscrição vencida no
 * cron apaga a linha para soltar o slug, e a linha da Inscricao é o único
 * lugar onde moram externalReference, asaasPaymentId e asaasSubscriptionId.
 * Apagar a de quem já pagou destrói o vínculo entre aquele dinheiro e um
 * cliente — e o webhook que chegar depois não tem mais como casar com nada.
 *
 * Por isso a falha PROPAGA em vez de virar `false`. Quem chama decide se
 * apaga; em dúvida, o certo é não apagar. Slug preso por mais um dia é
 * irrelevante, cliente pagante sem rastro não é.
 */
export async function assinaturaTemPagamentoConfirmado(
  subscriptionId: string
): Promise<boolean> {
  const { data } = await chamar<{ data: { status?: string }[] }>(
    `/subscriptions/${subscriptionId}/payments`
  );
  return (data ?? []).some((c) => PAGOS.has(c.status ?? ""));
}

/**
 * A primeira cobrança da assinatura é onde o cliente paga. Confirmar com a
 * chave de sandbox se POST /subscriptions já devolve a invoiceUrl direto; até
 * lá, este caminho funciona nos dois casos.
 */
export async function listarCobrancasDaAssinatura(
  subscriptionId: string
): Promise<{ data: { id: string; invoiceUrl: string }[] }> {
  return chamar(`/subscriptions/${subscriptionId}/payments`);
}

/**
 * O Asaas autentica webhook por token estático no header, não por assinatura
 * do corpo. timingSafeEqual porque comparação de string vaza o prefixo certo
 * pelo tempo de resposta.
 */
export function webhookAutorizado(tokenRecebido: string | null): boolean {
  const esperado = process.env.ASAAS_WEBHOOK_TOKEN;
  if (!esperado || !tokenRecebido) return false;
  const a = Buffer.from(tokenRecebido);
  const b = Buffer.from(esperado);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
