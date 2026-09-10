import crypto from "node:crypto";

// Criptografia simétrica pra segredos persistidos no banco (hoje só os
// tokens do Mercado Pago em PaymentConnection). Usa AES-256-GCM: mesmo
// que alguém consiga ler a tabela diretamente (dump, vazamento de backup),
// não recupera o token sem a chave, que só existe como variável de
// ambiente da aplicação.
const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // recomendado pro GCM

function getKey(): Buffer {
  const raw = process.env.PAYMENT_TOKEN_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error("PAYMENT_TOKEN_ENCRYPTION_KEY não configurado.");
  }
  const key = Buffer.from(raw, "hex");
  if (key.length !== 32) {
    throw new Error("PAYMENT_TOKEN_ENCRYPTION_KEY precisa ter 32 bytes (64 caracteres hex). Gere com: openssl rand -hex 32");
  }
  return key;
}

// Formato: iv.authTag.ciphertext, cada parte em base64.
export function encryptSecret(plaintext: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [iv, authTag, ciphertext].map((buf) => buf.toString("base64")).join(".");
}

export function decryptSecret(payload: string): string {
  const [ivB64, tagB64, dataB64] = payload.split(".");
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error("Segredo criptografado em formato inválido.");
  }

  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));

  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]);

  return plaintext.toString("utf8");
}

/**
 * Token para link de e-mail sensível (redefinição de senha, criação de senha
 * do link de boas-vindas). 32 bytes de `crypto.randomBytes` — puramente
 * aleatório, sem timestamp/contador embutido — em vez do `cuid()` que o
 * Prisma geraria como default para PasswordResetToken.token: cuid foi
 * desenhado para ser um id único e ordenável, não um segredo, e carrega
 * estrutura previsível que um gerador de segurança não deveria ter.
 */
export function gerarTokenSeguro(): string {
  return crypto.randomBytes(32).toString("hex");
}
