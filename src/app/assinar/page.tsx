import Image from "next/image";
import {
  PLANO_LABELS,
  escolhaDaQueryString,
  formatarBRL,
  precoDoCiclo,
} from "@/lib/plans";
import { FormularioAssinatura } from "@/components/assinar/FormularioAssinatura";

// Fora de src/app/(client)/, de propósito: aquele layout chama
// getRequestTenantId() e devolve notFound() sem x-tenant-id — correto para o
// cardápio, que não existe sem restaurante. /assinar é o oposto: só responde
// justamente onde NÃO existe tenant (proxy.ts tira este caminho do pipeline
// antes do findUnique, no mesmo padrão de /api/leads/publico). Aninhar sob
// (client) faria a página cair 404 em produção, mesmo com a guarda do proxy
// certa.
export default async function AssinarPage({
  searchParams,
}: {
  searchParams: Promise<{ plano?: string; ciclo?: string }>;
}) {
  const params = await searchParams;

  // O fail-closed de plano/ciclo (link velho, parâmetro cortado, valor de uma
  // versão futura do enum) vive em plans.ts, com teste — ver
  // escolhaDaQueryString.
  const { plano, ciclo } = escolhaDaQueryString(params);

  const precoCentavos = precoDoCiclo(plano, ciclo);

  return (
    <div className="min-h-screen bg-neutral-50 flex flex-col items-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-8">
          <Image
            src="/munowbg.png"
            alt="Muno"
            width={160}
            height={60}
            className="h-14 w-auto object-contain"
          />
        </div>

        <div className="bg-white border border-neutral-200 rounded-2xl p-6 mb-6">
          <p className="text-sm text-neutral-500">Você está assinando</p>
          <h1 className="text-xl font-bold text-neutral-900 mt-1">
            {PLANO_LABELS[plano]}
          </h1>
          <div className="mt-3 flex items-baseline gap-1">
            <span className="text-3xl font-black text-brand">
              R$ {formatarBRL(precoCentavos)}
            </span>
            <span className="text-sm text-neutral-400">
              {ciclo === "ANUAL" ? "/ano" : "/mês"}
            </span>
          </div>
          {ciclo === "ANUAL" && (
            <p className="mt-1 text-xs text-neutral-400">
              equivalente a 11 mensalidades — um mês de desconto pelo compromisso anual
            </p>
          )}
        </div>

        <FormularioAssinatura plano={plano} ciclo={ciclo} />
      </div>
    </div>
  );
}
