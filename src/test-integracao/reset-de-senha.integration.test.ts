/**
 * Redefinição de senha: o link vale uma vez só e a troca é atômica, conferidos
 * contra o banco (os testes de unidade mockam a transação).
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import { NextRequest } from "next/server";
import { prismaUnscoped } from "@/lib/prisma";
import { POST } from "@/app/api/auth/reset-password/route";
import { criarTenant, limparTenants } from "./apoio";

const EMAIL = "dono@exemplo.com";
let tenantId: string;
let token: string;

function redefinir(senha: string, t = token, ip = Math.random().toString()) {
  return POST(
    new NextRequest("http://localhost/api/auth/reset-password", {
      method: "POST",
      headers: { "x-tenant-id": tenantId, "x-forwarded-for": ip, "Content-Type": "application/json" },
      body: JSON.stringify({ token: t, password: senha }),
    })
  );
}

beforeEach(async () => {
  const t = await criarTenant("reset");
  tenantId = t.id;
  token = `tok_${t.slug}`;
  await prismaUnscoped.user.create({
    data: { tenantId, name: "Dono", email: EMAIL, password: await bcrypt.hash("senha-antiga-1", 4), role: "ADMIN" },
  });
  await prismaUnscoped.passwordResetToken.create({
    data: { tenantId, email: EMAIL, token, expiresAt: new Date(Date.now() + 3_600_000) },
  });
});

afterAll(limparTenants);

const senhaGravada = async () =>
  (await prismaUnscoped.user.findUniqueOrThrow({ where: { tenantId_email: { tenantId, email: EMAIL } } }));

describe("redefinição de senha", () => {
  it("troca a senha, queima o token e carimba passwordChangedAt", async () => {
    const res = await redefinir("senha-nova-123");

    expect(res.status).toBe(200);
    const u = await senhaGravada();
    expect(await bcrypt.compare("senha-nova-123", u.password!)).toBe(true);
    expect(u.passwordChangedAt).toBeInstanceOf(Date);
    expect(await prismaUnscoped.passwordResetToken.count({ where: { token } })).toBe(0);
  });

  it("dois pedidos simultâneos com o mesmo link: só um troca a senha", async () => {
    const [a, b] = await Promise.all([redefinir("primeira-senha-1"), redefinir("segunda-senha-2")]);

    expect([a.status, b.status].sort()).toEqual([200, 400]);
    const vencedora = a.status === 200 ? "primeira-senha-1" : "segunda-senha-2";
    expect(await bcrypt.compare(vencedora, (await senhaGravada()).password!)).toBe(true);
  });

  it("link usado de novo depois é recusado", async () => {
    await redefinir("senha-nova-123");
    expect((await redefinir("outra-senha-456")).status).toBe(400);
  });

  it("se a troca falhar, o token NÃO é queimado (a transação desfaz)", async () => {
    // O usuário some entre a leitura do token e a troca: o update falha.
    await prismaUnscoped.user.delete({ where: { tenantId_email: { tenantId, email: EMAIL } } });

    const res = await redefinir("senha-nova-123");

    expect(res.status).toBe(500);
    expect(await prismaUnscoped.passwordResetToken.count({ where: { token } })).toBe(1);
  });
});
