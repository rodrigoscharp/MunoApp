import { z } from "zod";
import type { CredentialField } from "./types";

// Regras de persistência de PaymentConnection. Vivem fora do route handler
// porque um arquivo de rota do Next só pode exportar os handlers HTTP e as
// configs conhecidas — qualquer outro export quebra o type check gerado.

// O schema de credencial é montado a partir do que o adapter declara, não
// de um record aberto: campo obrigatório passa a ser exigido de verdade, e
// chave que o gateway não conhece é recusada em vez de ser guardada e
// devolvida em claro no GET (maskCredentials só mascara o que está
// declarado como 'secret').
export function buildCredentialsSchema(fields: CredentialField[]) {
  return z
    .object(
      Object.fromEntries(
        fields.map((field) => [
          field.key,
          field.required ? z.string().min(1, `${field.label} é obrigatório`) : z.string().optional(),
        ])
      )
    )
    .strict();
}

// Só vira 'active' quando o webhook secret estiver presente — sem ele não
// conseguiríamos confirmar pagamento nenhum, então é melhor não oferecer
// pagamento online do que oferecer quebrado.
export function resolveConnectionStatus(
  credentials: Record<string, string | undefined>
): "active" | "pending_webhook" {
  return credentials.webhookSecret ? "active" : "pending_webhook";
}

// A UI mostra a mensagem direto pro lojista, então o erro sai como string,
// nunca como o array de issues do Zod.
export function firstIssueMessage(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) return "Dados inválidos";
  const field = issue.path.join(".");
  return field ? `${field}: ${issue.message}` : issue.message;
}
