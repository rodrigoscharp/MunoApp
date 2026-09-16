import { prismaUnscoped } from "@/lib/prisma";
import { authPlatform } from "@/lib/auth-platform";
import { buildTenantBaseUrl } from "@/lib/tenant-provisioning";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { LeadAcoes } from "@/components/platform/LeadAcoes";
import { ConverterLead } from "@/components/platform/ConverterLead";
import { PlanoInline } from "@/components/platform/PlanoInline";
import { podeMoverAMao } from "@/lib/funil/estagio";

export default async function LeadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await authPlatform();
  if (!session?.user) return null;

  const { id } = await params;
  const lead = await prismaUnscoped.lead.findUnique({
    where: { id },
    include: {
      notas: { orderBy: { createdAt: "asc" } },
      tenant: true,
    },
  });

  if (!lead) notFound();

  const contato = [
    lead.contato,
    lead.telefone,
    lead.email,
    lead.cidade,
    lead.plano,
  ].filter(Boolean);

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* Alvo de 40px de altura: no celular esta é a única saída da ficha, e
          um link de texto de 16px é um alvo de 16px. */}
      <Link
        href="/leads"
        className="inline-flex items-center gap-2 h-10 -ml-1 px-1 text-[14px] font-medium text-console-segunda hover:text-console-tinta transition"
      >
        <ArrowLeft size={17} />
        Voltar ao funil
      </Link>

      <div>
        <h1 className="text-[26px] sm:text-[36px] font-semibold tracking-[-0.035em] leading-tight">
          {lead.restaurante}
        </h1>
        {contato.length > 0 && (
          // Uma linha por dado no celular: telefone e e-mail separados por
          // ponto viram uma parede de texto que ninguém consegue tocar para
          // copiar.
          <ul className="mt-2 flex flex-col sm:flex-row sm:flex-wrap gap-x-2 gap-y-1 text-[14px] text-console-segunda">
            {contato.map((dado) => (
              <li key={dado} className="sm:after:content-['·'] sm:after:ml-2 sm:after:text-console-mudo last:sm:after:content-['']">
                {dado}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="console-vidro rounded-[22px] sm:rounded-[28px] p-4 sm:p-6">
        <LeadAcoes
          leadId={lead.id}
          statusAtual={lead.status}
          podeMoverStatus={podeMoverAMao(lead)}
        />
      </div>

      {lead.tenant ? (
        <div className="rounded-[22px] sm:rounded-[28px] bg-console-positivo-fundo border border-console-positivo/25 p-4 sm:p-6 space-y-3">
          <p className="font-semibold text-console-positivo">Cliente criado</p>
          <a
            href={buildTenantBaseUrl(lead.tenant.slug)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-[14px] text-console-tinta underline decoration-console-mudo underline-offset-4 break-all"
          >
            {buildTenantBaseUrl(lead.tenant.slug)}
            <ExternalLink size={14} className="shrink-0" />
          </a>
          <PlanoInline leadId={lead.id} planoAtual={lead.tenant.plano} />
        </div>
      ) : (
        <ConverterLead leadId={lead.id} restauranteNome={lead.restaurante} />
      )}

      <section className="pt-1">
        <h2 className="text-[17px] sm:text-[20px] font-semibold tracking-[-0.015em] mb-3">
          Histórico
        </h2>
        {lead.notas.length === 0 ? (
          <p className="text-[14px] text-console-mudo">Nenhuma anotação ainda.</p>
        ) : (
          <ul className="space-y-2.5">
            {lead.notas.map((nota) => (
              <li
                key={nota.id}
                className="console-vidro rounded-[18px] sm:rounded-[22px] px-4 py-3.5"
              >
                <p className="text-[12px] text-console-mudo tabular">
                  {nota.createdAt.toLocaleString("pt-BR")}
                </p>
                <p className="text-[15px] leading-snug mt-1.5">{nota.texto}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
