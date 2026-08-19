import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiError, getTenantIdFromRequest, withTenant } from "@/lib/api";
import { criarLimitador } from "@/lib/rate-limit";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

// Teto de itens enviados ao modelo. Cardápio maior que isso é truncado em vez
// de recusado: recomendar a partir de 150 itens continua útil, estourar o
// contexto do modelo não.
const MAX_ITENS_NO_PROMPT = 150;

// Rota pública que gasta dinheiro a cada chamada (chave da Groq, cobrada por
// token). Sem teto, um laço de `curl` vira fatura — e é a única rota do app
// cujo custo marginal não é CPU. Escopo de módulo de propósito: o estado
// precisa sobreviver entre requisições da mesma instância (ver
// src/lib/rate-limit.ts para o alcance real disso).
const limitador = criarLimitador({ max: 15, janelaMs: 10 * 60 * 1000 });

const historyMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  // O limite não é decoração: sem ele o histórico é um campo de texto livre
  // sem teto que a rota repassa a um modelo cobrado por token.
  content: z.string().max(2000),
});

const schema = z.object({
  message: z.string().min(1).max(500),
  history: z.array(historyMessageSchema).max(10).optional(),
});

const SYSTEM_PROMPT = `Você é o Muno 🍔, assistente de pedidos de um restaurante brasileiro. É animado, usa emojis e fala português.

Sua função: analisar o cardápio e recomendar os itens mais adequados para o cliente.

REGRAS:
- Leia o nome E a descrição de cada item antes de recomendar
- Escolha 1 a 4 itens dependendo da fome/pedido
- Calibração por fome: "pouca fome" = 1 item leve | "com fome" = 1-2 itens | "faminto" = 2-3 itens | "esfomeado" = 3-4 itens (os maiores)
- Para restrições (vegano, sem glúten, sem lactose, sem carne): analise a descrição com cuidado. Se não houver item compatível, diga isso com simpatia
- Responda SOMENTE com JSON válido, sem nenhum texto fora do JSON:
{"message":"sua resposta em 1-2 frases animadas","ids":["id_real_1","id_real_2"]}`;

export async function POST(req: NextRequest) {
  const tenantId = getTenantIdFromRequest(req);
  if (!tenantId) return apiError("Tenant não identificado", 400);

  // Ver a nota sobre X-Forwarded-For em /api/leads/publico: na Vercel a borda
  // sobrescreve o cabeçalho, então o primeiro valor é o IP real do cliente.
  const ip = (req.headers.get("x-forwarded-for") ?? "desconhecido")
    .split(",")[0]
    .trim();
  if (!limitador.permitir(`${tenantId}:${ip}`, Date.now())) {
    return NextResponse.json(
      { error: "Muitas perguntas seguidas. Tente de novo em alguns minutos." },
      { status: 429 }
    );
  }

  return withTenant(tenantId, () => handlePost(req));
}

async function handlePost(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    console.error("[AI] Zod error:", JSON.stringify(parsed.error.issues));
    return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
  }

  const { message, history = [] } = parsed.data;
  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey) {
    return NextResponse.json({ error: "IA não configurada no servidor" }, { status: 500 });
  }

  // O cardápio vem do banco, nunca do corpo da requisição. Antes ele chegava
  // pronto do navegador: quem chamasse a rota direto escolhia o texto de cada
  // "item" e usava o prompt do restaurante como campo livre para o modelo —
  // além de poder anunciar preço que não existe na resposta da própria IA.
  const itens = await prisma.menuItem.findMany({
    where: { available: true },
    select: {
      id: true,
      name: true,
      description: true,
      price: true,
      category: { select: { name: true } },
    },
    orderBy: { name: "asc" },
    take: MAX_ITENS_NO_PROMPT,
  });

  if (itens.length === 0) {
    return NextResponse.json(
      { error: "Este cardápio ainda não tem itens para recomendar." },
      { status: 409 }
    );
  }

  const menuJson = JSON.stringify(
    itens.map((item) => ({
      id: item.id,
      name: item.name,
      description: item.description,
      price: Number(item.price),
      category: item.category.name,
    }))
  );

  // First message includes the full menu. Follow-up messages are lightweight.
  const isFirstMessage = history.length === 0;

  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    ...(isFirstMessage
      ? [{ role: "user", content: `Cardápio completo:\n${menuJson}\n\nPedido do cliente: ${message}` }]
      : [
          // Inject the menu only in the first turn so history stays compact
          { role: "user", content: `Cardápio completo:\n${menuJson}\n\nPedido do cliente: ${history[0]?.content ?? message}` },
          ...history.slice(1),
          { role: "user", content: message },
        ]),
  ];

  try {
    const res = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages,
        max_tokens: 400,
        temperature: 0.7,
        response_format: { type: "json_object" },
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      console.error("[AI] Groq error:", data.error?.message);
      return NextResponse.json({ error: "Erro ao consultar a IA. Tente novamente!" }, { status: 500 });
    }

    const raw: string = data.choices?.[0]?.message?.content?.trim() ?? "";

    let result: { message: string; ids: string[] };
    try {
      result = JSON.parse(raw);
    } catch {
      console.error("[AI] JSON parse failed. Raw:", raw);
      return NextResponse.json({ error: "A IA retornou resposta inválida. Tente novamente!" }, { status: 500 });
    }

    // O modelo às vezes inventa id. Cruzar com o cardápio real evita que a UI
    // tente montar um card para um item que não existe.
    const idsValidos = new Set(itens.map((item) => item.id));
    const ids = Array.isArray(result.ids)
      ? result.ids.filter((id): id is string => typeof id === "string" && idsValidos.has(id))
      : [];

    return NextResponse.json({ text: result.message ?? "", ids });
  } catch (err) {
    console.error("[AI] fetch error:", err);
    return NextResponse.json({ error: "Não consegui consultar a IA agora. Tente novamente!" }, { status: 500 });
  }
}
