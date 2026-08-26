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
    throw new Error(
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
  return chamar<{ id: string }>("/subscriptions", {
    customer: input.customerId,
    billingType: input.billingType ?? "CREDIT_CARD",
    value: emReais(input.valorCentavos),
    nextDueDate: proximoVencimentoISO(),
    cycle: input.ciclo === "ANUAL" ? "YEARLY" : "MONTHLY",
    description: input.descricao,
    externalReference: input.externalReference,
  });
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
