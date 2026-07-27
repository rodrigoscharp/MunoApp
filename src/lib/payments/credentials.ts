import { encryptSecret, decryptSecret } from "@/lib/crypto";
import type { CredentialField } from "./types";

// As credenciais de cada gateway viram um único blob JSON criptografado,
// porque cada um pede campos diferentes (o MP quer token + webhook secret,
// o Asaas quer chave + ambiente). Uma coluna por campo obrigaria migration
// a cada gateway novo.
export function encryptCredentials(creds: Record<string, string>): string {
  return encryptSecret(JSON.stringify(creds));
}

export function decryptCredentials(payload: string): Record<string, string> {
  return JSON.parse(decryptSecret(payload)) as Record<string, string>;
}

// Nunca devolvemos segredo em claro pra UI — nem pro ADMIN do próprio
// tenant. Segredo com menos de 5 caracteres vira só bolinhas, pra não
// entregar o valor inteiro tentando mostrar "os últimos 4".
export function maskCredentials(
  creds: Record<string, string>,
  fields: CredentialField[]
): Record<string, string> {
  const secretKeys = new Set(fields.filter((f) => f.type === "secret").map((f) => f.key));

  return Object.fromEntries(
    Object.entries(creds).map(([key, value]) => {
      if (!secretKeys.has(key)) return [key, value];
      return [key, value.length > 4 ? `••••${value.slice(-4)}` : "••••"];
    })
  );
}
