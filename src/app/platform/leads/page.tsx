import { prismaUnscoped } from "@/lib/prisma";
import { authPlatform } from "@/lib/auth-platform";
import Link from "next/link";
import { NovoLeadForm } from "@/components/platform/NovoLeadForm";

const ORDEM = ["NOVO", "CONTATADO", "NEGOCIACAO", "FECHADO", "PERDIDO"] as const;

const ROTULOS: Record<(typeof ORDEM)[number], string> = {
  NOVO: "Novo",
  CONTATADO: "Contatado",
  NEGOCIACAO: "Em negociação",
  FECHADO: "Fechado",
  PERDIDO: "Perdido",
};

export default async function LeadsPage() {
  const session = await authPlatform();
  if (!session?.user) return null;

  const leads = await prismaUnscoped.lead.findMany({
    orderBy: { updatedAt: "desc" },
  });

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-4">
        <h1 className="display text-[2rem] leading-none">funil</h1>
        <NovoLeadForm />
      </div>

      {ORDEM.map((status) => {
        const doStatus = leads.filter((l) => l.status === status);
        if (doStatus.length === 0) return null;

        return (
          <section key={status}>
            <h2 className="text-xs font-semibold text-neutral-400 uppercase tracking-wide mb-3">
              {ROTULOS[status]} · {doStatus.length}
            </h2>
            <div className="space-y-2">
              {doStatus.map((lead) => (
                <Link
                  key={lead.id}
                  href={`/leads/${lead.id}`}
                  className="block bg-console-cartao border border-console-linha rounded-xl px-5 py-4 hover:border-console-campo/40 transition"
                >
                  <p className="font-semibold text-neutral-900">
                    {lead.restaurante}
                  </p>
                  <p className="text-xs text-neutral-400 mt-1">
                    {[lead.cidade, lead.origem].filter(Boolean).join(" · ")}
                  </p>
                </Link>
              ))}
            </div>
          </section>
        );
      })}

      {leads.length === 0 && (
        <p className="text-neutral-500 text-center py-16">
          Nenhum lead ainda. Cadastre o primeiro.
        </p>
      )}
    </div>
  );
}
