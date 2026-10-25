import { MarcaDoRestaurante } from "@/components/loja/MarcaDoRestaurante";
import { MapPin, Clock, Phone } from "lucide-react";
import type { RestaurantInfo } from "@/lib/restaurant";
import type { WeekSchedule } from "@/lib/business-hours";

const ORDERED = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const SHORT: Record<string, string> = {
  monday: "Seg", tuesday: "Ter", wednesday: "Qua",
  thursday: "Qui", friday: "Sex", saturday: "Sáb", sunday: "Dom",
};

function formatTime(time: string): string {
  const [h, m] = time.split(":");
  return m === "00" ? `${parseInt(h)}h` : `${parseInt(h)}h${m}`;
}

function groupDays(schedule: WeekSchedule) {
  const groups: { label: string; from: string; to: string; open: boolean }[] = [];
  let i = 0;
  while (i < ORDERED.length) {
    const key = ORDERED[i];
    const day = schedule[key];
    let j = i + 1;
    while (
      j < ORDERED.length &&
      schedule[ORDERED[j]]?.open === day?.open &&
      schedule[ORDERED[j]]?.from === day?.from &&
      schedule[ORDERED[j]]?.to === day?.to
    ) j++;
    const label = j - i === 1 ? SHORT[key] : `${SHORT[key]} – ${SHORT[ORDERED[j - 1]]}`;
    groups.push({ label, from: day?.from ?? "11:00", to: day?.to ?? "22:00", open: day?.open ?? false });
    i = j;
  }
  return groups;
}

interface FooterProps {
  restaurantInfo: RestaurantInfo;
  schedule: WeekSchedule;
}

export function Footer({ restaurantInfo, schedule }: FooterProps) {
  const groups = groupDays(schedule);
  return (
    <footer className="mt-12 rounded-t-[30px] bg-loja-papel text-loja-tinta">
      <div className="mx-auto max-w-5xl px-4 py-10">
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-3">

          {/* Marca: o logo do restaurante, ou o nome em manchete, e a frase
              que o dono escreveu no cadastro. Sem frase, nada no lugar: um
              texto genérico aqui falaria por todos os restaurantes. */}
          <div className="flex flex-col gap-3">
            <MarcaDoRestaurante info={restaurantInfo} tamanho="pequena" />
            {restaurantInfo.slogan && (
              <p className="text-[10.5px] font-extrabold uppercase tracking-[0.2em] text-forest-dark">
                {restaurantInfo.slogan}
              </p>
            )}
          </div>

          {/* Contato */}
          {(restaurantInfo.address || restaurantInfo.phone) && (
            <div className="flex flex-col gap-3">
              <h2 className="text-[13px] font-extrabold uppercase tracking-[0.08em] text-loja-tinta-2">Contato</h2>
              <ul className="space-y-2 text-sm">
                {/* Só o que existe. Ver a nota em src/lib/restaurant.ts: contato
                    ausente virou ausente de verdade, em vez de herdar o do
                    restaurante do seed. */}
                {restaurantInfo.address && (
                  <li className="flex items-start gap-2">
                    <MapPin size={15} aria-hidden="true" className="mt-0.5 shrink-0 text-forest" />
                    <span>{restaurantInfo.address}</span>
                  </li>
                )}
                {restaurantInfo.phone && (
                  <li className="flex items-center gap-2">
                    <Phone size={15} aria-hidden="true" className="shrink-0 text-forest" />
                    <a href={`tel:${restaurantInfo.phone.replace(/[^\d+]/g, "")}`} className="hover:text-loja-preco hover:underline">
                      {restaurantInfo.phone}
                    </a>
                  </li>
                )}
              </ul>
            </div>
          )}

          {/* Horários */}
          <div className="flex flex-col gap-3">
            <h2 className="text-[13px] font-extrabold uppercase tracking-[0.08em] text-loja-tinta-2">Horário de funcionamento</h2>
            <ul className="space-y-2 text-sm">
              {groups.map((g) => (
                <li key={g.label} className="flex items-center gap-2">
                  <Clock size={15} aria-hidden="true" className="shrink-0 text-forest" />
                  <span>
                    <span className="font-semibold">{g.label}:</span>{" "}
                    {g.open ? `${formatTime(g.from)} às ${formatTime(g.to)}` : "Fechado"}
                  </span>
                </li>
              ))}
            </ul>
          </div>

        </div>

        <div className="mt-8 border-t border-loja-linha pt-6 text-xs text-loja-tinta-2">
          <span>© {new Date().getFullYear()} Muno</span>
        </div>
      </div>
    </footer>
  );
}
