import crypto from "node:crypto";

// Assina/valida o `state` do fluxo OAuth do Mercado Pago — protege o
// callback contra CSRF (alguém forjando um redirect com um `code` próprio
// pra conectar a conta MP dele na conta de outro tenant) e amarra o
// tenantId com expiração curta em vez de trafegar em texto puro.
const SECRET = process.env.NEXTAUTH_SECRET;
const STATE_TTL_MS = 15 * 60 * 1000; // 15 minutos pra completar a autorização no MP

export function signOAuthState(tenantId: string): string {
  if (!SECRET) throw new Error("NEXTAUTH_SECRET não configurado.");

  const payload = JSON.stringify({ tenantId, exp: Date.now() + STATE_TTL_MS });
  const payloadB64 = Buffer.from(payload).toString("base64url");
  const signature = crypto.createHmac("sha256", SECRET).update(payloadB64).digest("base64url");

  return `${payloadB64}.${signature}`;
}

export function verifyOAuthState(state: string): { tenantId: string } | null {
  if (!SECRET) return null;

  const [payloadB64, signature] = state.split(".");
  if (!payloadB64 || !signature) return null;

  const expected = crypto.createHmac("sha256", SECRET).update(payloadB64).digest("base64url");
  const expectedBuf = Buffer.from(expected);
  const signatureBuf = Buffer.from(signature);
  if (expectedBuf.length !== signatureBuf.length || !crypto.timingSafeEqual(expectedBuf, signatureBuf)) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString());
    if (typeof payload.tenantId !== "string" || typeof payload.exp !== "number") return null;
    if (Date.now() > payload.exp) return null;
    return { tenantId: payload.tenantId };
  } catch {
    return null;
  }
}
