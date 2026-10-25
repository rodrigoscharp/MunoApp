import { prismaUnscoped } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { DeliveryTimeControl } from "@/components/adm/DeliveryTimeControl";
import { BusinessHoursControl, WeekSchedule } from "@/components/adm/BusinessHoursControl";
import { RestaurantInfoControl } from "@/components/adm/RestaurantInfoControl";
import { DeliveryZonesControl } from "@/components/adm/DeliveryZonesControl";
import { PrinterControl } from "@/components/adm/PrinterControl";
import Link from "next/link";
import { ArrowRight, Ticket } from "lucide-react";
import { CabecalhoDaTela } from "@/components/painel/CabecalhoDaTela";
import { botaoContorno, cartaoPainel, kicker } from "@/components/painel/estilos";
import { cn } from "@/lib/utils";
import { getRestaurantInfo } from "@/lib/restaurant";
import type { PrinterConfig } from "@/app/api/settings/printer/route";

const DEFAULT_HOURS: WeekSchedule = {
  monday:    { open: true,  from: "11:00", to: "22:00" },
  tuesday:   { open: true,  from: "11:00", to: "22:00" },
  wednesday: { open: true,  from: "11:00", to: "22:00" },
  thursday:  { open: true,  from: "11:00", to: "22:00" },
  friday:    { open: true,  from: "11:00", to: "23:00" },
  saturday:  { open: true,  from: "11:00", to: "23:00" },
  sunday:    { open: true,  from: "11:00", to: "20:00" },
};

export default async function RestauranteAdminPage() {
  const session = await auth();
  // tenantId é opcional no tipo Session (a sessão de plataforma não tem um);
  // aqui o proxy já garantiu sessão de restaurante com papel ADMIN.
  const tenantId = session!.user.tenantId!;

  const [deliveryTimeSetting, businessHoursSetting, restaurantInfo, deliveryZones, printerSetting] = await Promise.all([
    prismaUnscoped.setting.findUnique({ where: { tenantId_key: { tenantId, key: "delivery_time_minutes" } } }),
    prismaUnscoped.setting.findUnique({ where: { tenantId_key: { tenantId, key: "business_hours" } } }),
    getRestaurantInfo(tenantId),
    prismaUnscoped.deliveryZone.findMany({ where: { active: true, tenantId }, orderBy: { position: "asc" } }),
    prismaUnscoped.setting.findUnique({ where: { tenantId_key: { tenantId, key: "printer_config" } } }),
  ]);

  const printerConfig: PrinterConfig = printerSetting
    ? { enabled: false, paperWidth: "80mm", ...JSON.parse(printerSetting.value) }
    : { enabled: false, paperWidth: "80mm" };

  const deliveryMinutes = deliveryTimeSetting
    ? parseInt(deliveryTimeSetting.value, 10)
    : 45;

  const schedule: WeekSchedule = businessHoursSetting
    ? JSON.parse(businessHoursSetting.value)
    : DEFAULT_HOURS;

  return (
    <div className="flex flex-col gap-9">
      <CabecalhoDaTela contexto="Configurações da loja" titulo="Restaurante" />

      <Secao
        id="dados"
        titulo="Dados do restaurante"
        descricao="Nome, logo e contato que aparecem no topo do cardápio."
      >
        <RestaurantInfoControl initial={restaurantInfo} />
      </Secao>

      <Secao
        id="horario"
        titulo="Horário e entrega"
        descricao="Quando a loja recebe pedidos e quanto tempo o cliente espera."
      >
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <BusinessHoursControl initialSchedule={schedule} />
          </div>
          <DeliveryTimeControl initialMinutes={deliveryMinutes} />
        </div>
      </Secao>

      <Secao
        id="zonas"
        titulo="Zonas de entrega"
        descricao="Os bairros atendidos e o frete de cada um."
      >
        <DeliveryZonesControl
          initialZones={deliveryZones.map((z) => ({ ...z, price: Number(z.price) }))}
        />
      </Secao>

      <Secao
        id="impressora"
        titulo="Impressora"
        descricao="Impressão do pedido direto da tela da cozinha."
      >
        <div className="max-w-2xl">
          <PrinterControl initial={printerConfig} />
        </div>
      </Secao>

      <Link
        href="/adm/banner-cupons"
        className={cn(
          cartaoPainel,
          "group flex flex-col gap-4 p-5 transition hover:bg-white sm:flex-row sm:items-center sm:p-6"
        )}
      >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-loja-pessego-claro text-loja-preco">
          <Ticket size={19} aria-hidden />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className={cn(kicker, "text-loja-preco")}>Mudou de lugar</span>
          <span className="text-[15px] font-extrabold text-loja-tinta">Banner e cupons</span>
          <span className="text-[13px] text-loja-tinta-2">
            O destaque do topo do cardápio e os cupons de desconto agora têm uma tela própria.
          </span>
        </span>
        <span className={cn(botaoContorno, "h-11 shrink-0 self-start px-5 text-[13px] sm:self-center")}>
          Abrir banner e cupons
          <ArrowRight size={15} aria-hidden className="transition group-hover:translate-x-0.5" />
        </span>
      </Link>
    </div>
  );
}

function Secao({
  id,
  titulo,
  descricao,
  children,
}: {
  id: string;
  titulo: string;
  descricao: string;
  children: React.ReactNode;
}) {
  const tituloId = `secao-${id}`;
  return (
    <section aria-labelledby={tituloId} className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <h2 id={tituloId} className="manchete text-[1.6rem] text-forest-dark">
          {titulo}
        </h2>
        <p className="text-[13px] text-loja-tinta-2">{descricao}</p>
      </div>
      {children}
    </section>
  );
}
