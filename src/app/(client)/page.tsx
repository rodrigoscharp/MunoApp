import { Clock } from "lucide-react";
import { getCardapioOuVazio, itemParaFiltro } from "@/lib/menu-cache";
import { getRequestTenantId } from "@/lib/tenant-request";
import { getBusinessHours, checkIsOpen } from "@/lib/business-hours";
import { getMaisPedidosOuVazio, getCupomEmDestaqueOuNada } from "@/lib/loja/vitrine";
import { getBannerOuPadrao } from "@/lib/loja/banner";
import { FiltroDeRestricoes } from "@/components/menu/FiltroDeRestricoes";
import { FaixaDeInstalacao } from "@/components/pwa/FaixaDeInstalacao";
import { Vitrine } from "@/components/loja/Vitrine";
import { CardapioEmBreve } from "@/components/loja/SecoesDoCardapio";

export default async function MenuPage() {
  const tenantId = await getRequestTenantId();
  // O tempo de entrega da linha "Aberto · entrega em X min" é lido pelo
  // layout, que é quem monta o cabeçalho.
  const [categories, schedule, idsMaisPedidos, cupom, banner] = await Promise.all([
    getCardapioOuVazio(tenantId),
    getBusinessHours(tenantId),
    getMaisPedidosOuVazio(tenantId),
    getCupomEmDestaqueOuNada(tenantId),
    getBannerOuPadrao(tenantId),
  ]);
  const isOpen = checkIsOpen(schedule);
  const nonEmpty = categories.filter((c) => c.items.length > 0);

  return (
    <div className="min-h-screen">
      {!isOpen && (
        <div className="mx-auto max-w-5xl px-4 pt-3">
          <div role="status" className="flex items-start gap-3 rounded-[20px] bg-forest-dark p-4 text-white">
            <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10">
              <Clock size={20} />
            </span>
            <div>
              <h2 className="manchete text-[1.6rem]">Estamos fechados agora</h2>
              <p className="mt-1 text-sm text-white/85">
                Já já abriremos para matar sua fome! Enquanto isso, fique à vontade para explorar o cardápio.
              </p>
            </div>
          </div>
        </div>
      )}

      {nonEmpty.length > 0 ? (
        <Vitrine
          categorias={nonEmpty}
          idsMaisPedidos={idsMaisPedidos}
          banner={banner}
          cupom={cupom}
          restaurantOpen={isOpen}
          antesDasSecoes={
            <>
              <FiltroDeRestricoes
                // A lista inteira vai uma segunda vez no payload, para este
                // componente: só com o que o filtro lê (ver ItemDoFiltro).
                menuItems={nonEmpty.flatMap((c) => c.items.map((item) => itemParaFiltro(item, c)))}
                restaurantOpen={isOpen}
              />
              {/*
                Convite permanente de instalação. Fica aqui, e não no Header,
                porque a faixa some sozinha quando não há o que oferecer (app
                já instalado, convite dispensado, navegador sem suporte), sem
                deixar buraco no cabeçalho.
              */}
              <FaixaDeInstalacao />
            </>
          }
        />
      ) : (
        <CardapioEmBreve />
      )}
    </div>
  );
}
