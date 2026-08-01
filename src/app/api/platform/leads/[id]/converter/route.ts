import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prismaUnscoped } from "@/lib/prisma";
import { authPlatform } from "@/lib/auth-platform";
import { ProvisionError, provisionTenant } from "@/lib/tenant-provisioning";

const schema = z.object({
  slug: z.string().min(1),
  email: z.string().email(),
  nome: z.string().min(2).optional(),
  // Teto casa com o DECIMAL(10,2) da coluna: acima disso o Postgres estoura
  // e viraria um 500 no meio da conversão. Melhor recusar já na entrada.
  valorMensal: z.number().min(0).max(99999999.99).optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await authPlatform();
  if (!session?.user) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { id } = await params;
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  }

  const lead = await prismaUnscoped.lead.findUnique({ where: { id } });
  if (!lead) {
    return NextResponse.json({ error: "Lead não encontrado" }, { status: 404 });
  }
  if (lead.tenantId) {
    return NextResponse.json(
      { error: "Este lead já foi convertido em cliente." },
      { status: 409 }
    );
  }

  try {
    const { tenant, admin, url, senha } = await provisionTenant({
      nome: parsed.data.nome ?? lead.restaurante,
      slug: parsed.data.slug,
      email: parsed.data.email,
    });

    // provisionTenant não conhece mensalidade — é compartilhado com o script
    // de CLI, que não tem noção de cobrança. Gravamos aqui, logo depois.
    //
    // A senha só existe em memória neste ponto. Falhar aqui e abortar perderia
    // as credenciais de um restaurante que já foi criado de verdade — o mesmo
    // motivo pelo qual o vínculo do lead, mais abaixo, também não aborta.
    let avisoMensalidade: string | undefined;
    if (parsed.data.valorMensal !== undefined) {
      try {
        await prismaUnscoped.tenant.update({
          where: { id: tenant.id },
          data: { valorMensal: parsed.data.valorMensal },
        });
      } catch {
        avisoMensalidade =
          "O restaurante foi criado, mas a mensalidade não foi salva. Ajuste em Clientes.";
      }
    }

    // Vínculo atômico: o updateMany só casa se o lead ainda estiver sem tenant.
    // Duas requisições concorrentes chegam aqui cada uma com o seu tenant já
    // criado; só uma consegue o vínculo, e a perdedora desfaz o que criou.
    let vinculado = false;
    let aviso: string | undefined;

    try {
      const { count } = await prismaUnscoped.lead.updateMany({
        where: { id, tenantId: null },
        data: { tenantId: tenant.id, status: "FECHADO" },
      });
      vinculado = count === 1;
    } catch {
      // O restaurante já existe e é válido. A senha só existe nesta variável —
      // no banco só há o hash — então não podemos abortar e perdê-la.
      aviso =
        "O restaurante foi criado, mas não conseguimos marcar o lead como fechado. Anote as credenciais e ajuste o lead manualmente.";
    }

    if (!vinculado && !aviso) {
      // Perdemos a corrida: outra requisição já converteu este lead. Desfaz o
      // tenant que acabamos de criar para não deixar um restaurante fantasma.
      try {
        await prismaUnscoped.$transaction([
          prismaUnscoped.user.deleteMany({ where: { tenantId: tenant.id } }),
          prismaUnscoped.tenant.delete({ where: { id: tenant.id } }),
        ]);
      } catch {
        // Se nem a limpeza funcionou, o fantasma existe de fato. Melhor dizer
        // exatamente qual é do que devolver um 500 mudo — sem o slug, achar
        // esse tenant no banco depois vira caça ao tesouro.
        return NextResponse.json(
          {
            error:
              `Este lead já foi convertido, e não conseguimos remover o restaurante duplicado "${tenant.slug}" que acabou de ser criado. Apague-o manualmente.`,
          },
          { status: 409 }
        );
      }

      return NextResponse.json(
        { error: "Este lead já foi convertido em cliente." },
        { status: 409 }
      );
    }

    // Os dois avisos são independentes e podem acontecer juntos: juntamos num
    // campo só para que nenhum deles seja engolido pelo outro.
    const avisoFinal =
      [avisoMensalidade, aviso].filter(Boolean).join(" ") || undefined;

    // Senha devolvida uma única vez: não fica recuperável depois.
    return NextResponse.json(
      { tenant, url, email: admin.email, senha, aviso: avisoFinal },
      { status: 201 }
    );
  } catch (err) {
    if (err instanceof ProvisionError) {
      const status = err.code === "SLUG_EM_USO" ? 409 : 400;
      return NextResponse.json({ error: err.message }, { status });
    }
    throw err;
  }
}
