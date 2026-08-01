import { prismaUnscoped } from "@/lib/prisma";
import { authPlatform } from "@/lib/auth-platform";
import { buildTenantBaseUrl } from "@/lib/tenant-provisioning";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { LeadAcoes } from "@/components/platform/LeadAcoes";
import { ConverterLead } from "@/components/platform/ConverterLead";

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

  const contato = [lead.contato, lead.telefone, lead.email, lead.cidade].filter(
    Boolean
  );

  return (
    <div className="space-y-6">
      <Link
        href="/"
        className="flex items-center gap-2 text-sm text-neutral-500 hover:text-neutral-700"
      >
        <ArrowLeft size={16} />
        Voltar ao funil
      </Link>

      <div>
        <h1 className="text-2xl font-bold text-neutral-900">
          {lead.restaurante}
        </h1>
        {contato.length > 0 && (
          <p className="text-sm text-neutral-500 mt-1">{contato.join(" · ")}</p>
        )}
      </div>

      <div className="bg-white border border-neutral-200 rounded-xl p-5">
        <LeadAcoes leadId={lead.id} statusAtual={lead.status} />
      </div>

      {lead.tenant ? (
        <div className="bg-green-50 border border-green-200 rounded-xl p-5">
          <p className="font-semibold text-green-800">Cliente criado</p>
          <a
            href={buildTenantBaseUrl(lead.tenant.slug)}
            target="_blank"
            rel="noreferrer"
            className="text-sm text-green-700 underline"
          >
            {buildTenantBaseUrl(lead.tenant.slug)}
          </a>
        </div>
      ) : (
        <ConverterLead leadId={lead.id} restauranteNome={lead.restaurante} />
      )}

      <section>
        <h2 className="text-xs font-semibold text-neutral-400 uppercase tracking-wide mb-3">
          Histórico
        </h2>
        {lead.notas.length === 0 ? (
          <p className="text-sm text-neutral-400">Nenhuma anotação ainda.</p>
        ) : (
          <ul className="space-y-3">
            {lead.notas.map((nota) => (
              <li
                key={nota.id}
                className="bg-white border border-neutral-200 rounded-xl px-4 py-3"
              >
                <p className="text-xs text-neutral-400">
                  {nota.createdAt.toLocaleString("pt-BR")}
                </p>
                <p className="text-sm text-neutral-800 mt-1">{nota.texto}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
