import { prismaUnscoped } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { CouponsControl } from "@/components/adm/CouponsControl";
import { BannerControl, type BannerAutomatico } from "@/components/adm/BannerControl";
import { CabecalhoDaTela } from "@/components/painel/CabecalhoDaTela";
import { BANNER_PADRAO, bannerSchema, CHAVE_DO_BANNER, escolherItemDoBanner } from "@/lib/loja/banner";
import { escolherMaisPedidos, getMaisPedidosOuVazio } from "@/lib/loja/vitrine";
import { getCardapioOuVazio } from "@/lib/menu-cache";

/**
 * O que a loja anuncia acima do cardápio: o banner do topo e os cupons (um
 * deles pode ir no card de destaque). Os controles moravam em /adm/restaurante,
 * misturados com horário e entrega.
 *
 * A gravação do banner e dos cupons continua nas mesmas rotas
 * (/api/settings/banner e /api/coupons); esta página só lê.
 */
export default async function BannerECuponsPage() {
  const session = await auth();
  // tenantId é opcional no tipo Session (a sessão de plataforma não tem um);
  // aqui o proxy já garantiu sessão de restaurante com papel ADMIN.
  const tenantId = session!.user.tenantId!;

  const [coupons, bannerSetting, itensDoCardapio, cardapio, idsMaisPedidos] = await Promise.all([
    prismaUnscoped.coupon.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { orders: true } } },
    }),
    prismaUnscoped.setting.findUnique({ where: { tenantId_key: { tenantId, key: CHAVE_DO_BANNER } } }),
    prismaUnscoped.menuItem.findMany({
      where: { tenantId, available: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, price: true, imageUrl: true, imagemRecortadaUrl: true },
    }),
    // A prévia do modo automático lê o mesmo cardápio e os mesmos mais
    // pedidos que a loja, dos mesmos caches: o que aparece aqui é o que o
    // cliente vê.
    getCardapioOuVazio(tenantId),
    getMaisPedidosOuVazio(tenantId),
  ]);

  let banner = BANNER_PADRAO;
  try {
    const lido = bannerSetting ? bannerSchema.safeParse(JSON.parse(bannerSetting.value)) : null;
    if (lido?.success) banner = lido.data;
  } catch {
    // configuração ilegível: o controle abre no padrão
  }
  // O item gravado esgotou? A lista acima só tem os disponíveis; o nome vem à
  // parte para o painel dizer qual item saiu do banner. Apagado, fica sem nome.
  const itemSalvoEsgotado =
    banner.modo === "item" && banner.itemId && !itensDoCardapio.some((i) => i.id === banner.itemId)
      ? await prismaUnscoped.menuItem.findFirst({
          where: { id: banner.itemId, tenantId },
          select: { name: true },
        })
      : null;

  // O que o modo automático mostraria hoje, com a mesma escolha da Vitrine.
  const fileira = escolherMaisPedidos(cardapio, idsMaisPedidos);
  const doAutomatico = escolherItemDoBanner(BANNER_PADRAO, cardapio, fileira.itens.slice(0, fileira.vendidos));
  const automatico: BannerAutomatico | null =
    doAutomatico && doAutomatico.modo !== "item"
      ? {
          item: {
            id: doAutomatico.item.id,
            name: doAutomatico.item.name,
            price: doAutomatico.item.price,
            imageUrl: doAutomatico.item.imageUrl,
            imagemRecortadaUrl: doAutomatico.item.imagemRecortadaUrl,
          },
          modo: doAutomatico.modo,
        }
      : null;

  const agora = new Date();
  const noAr = coupons.filter(
    (c) => c.active && (!c.validFrom || c.validFrom <= agora) && (!c.validUntil || c.validUntil >= agora)
  ).length;
  const contexto = `${noAr} ${noAr === 1 ? "cupom valendo" : "cupons valendo"} · banner ${
    banner.modo === "item" ? "escolhido" : "automático"
  }`;

  return (
    <div>
      <CabecalhoDaTela contexto={contexto} titulo="Banner e cupons" />

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        <BannerControl
          initial={banner}
          itens={itensDoCardapio.map((i) => ({ ...i, price: Number(i.price) }))}
          nomeDoItemSalvo={itemSalvoEsgotado?.name ?? null}
          automatico={automatico}
          agora={agora.toISOString()}
        />
        <CouponsControl
          initialCoupons={coupons.map((c) => ({
            ...c,
            value: Number(c.value),
            minOrder: Number(c.minOrder),
            validFrom: c.validFrom?.toISOString() ?? null,
            validUntil: c.validUntil?.toISOString() ?? null,
          }))}
        />
      </div>
    </div>
  );
}
