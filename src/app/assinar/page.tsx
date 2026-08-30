import Image from "next/image";
import { escolhaDaQueryString } from "@/lib/plans";
import { Checkout } from "@/components/assinar/Checkout";

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

  return (
    // O fundo quente (brand-light) em vez do neutral-50 de antes: a landing
    // que trouxe a pessoa até aqui é verde e terracota, e cair num cinza de
    // formulário genérico no passo do pagamento derruba a confiança justamente
    // onde ela é mais cara.
    <div className="flex min-h-screen flex-col items-center bg-brand-light px-4 py-10 sm:py-14">
      <div className="mb-9 flex justify-center">
        <Image
          src="/munowbg.png"
          alt="Muno"
          width={160}
          height={60}
          className="h-16 w-auto object-contain"
          priority
        />
      </div>

      {/* A partir daqui é Client Component: o ciclo vira estado para que o
          toggle não desmonte o formulário. Ver Checkout.tsx. */}
      <Checkout planoInicial={plano} cicloInicial={ciclo} />

      <p className="mt-8 text-center text-xs text-neutral-500">
        Dúvidas? Chame a gente no WhatsApp antes de assinar.
      </p>
    </div>
  );
}
