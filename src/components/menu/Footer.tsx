import Image from "next/image";
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
    <footer className="bg-neutral-900 text-neutral-300 mt-16">
      <div className="max-w-5xl mx-auto px-4 py-10">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">

          {/* Brand */}
          <div className="flex flex-col gap-3">
            <Image
              src={restaurantInfo.logoUrl}
              alt={restaurantInfo.name}
              width={120}
              height={45}
              className="h-12 w-auto object-contain brightness-0 invert opacity-90"
              unoptimized={restaurantInfo.logoUrl.startsWith("http")}
            />
            <p className="text-sm text-neutral-400 leading-relaxed">
              Sabor e qualidade em cada prato. Venha nos visitar ou faça seu pedido online.
            </p>
          </div>

          {/* Contato */}
          <div className="flex flex-col gap-3">
            <h3 className="text-sm font-semibold text-white uppercase tracking-wider">Contato</h3>
            <ul className="space-y-2 text-sm">
              <li className="flex items-start gap-2">
                <MapPin size={14} className="text-brand mt-0.5 shrink-0" />
                <span>{restaurantInfo.address}</span>
              </li>
              <li className="flex items-center gap-2">
                <Phone size={14} className="text-brand shrink-0" />
                <span>{restaurantInfo.phone}</span>
              </li>
            </ul>
          </div>

          {/* Horários */}
          <div className="flex flex-col gap-3">
            <h3 className="text-sm font-semibold text-white uppercase tracking-wider">Horário de Funcionamento</h3>
            <ul className="space-y-2 text-sm">
              {groups.map((g) => (
                <li key={g.label} className="flex items-center gap-2">
                  <Clock size={14} className="text-brand shrink-0" />
                  <span>
                    {g.label}: {g.open ? `${formatTime(g.from)} às ${formatTime(g.to)}` : "Fechado"}
                  </span>
                </li>
              ))}
            </ul>
          </div>

        </div>

        <div className="border-t border-neutral-800 mt-8 pt-6 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-neutral-500">
          <span>© {new Date().getFullYear()} Muno Food. Todos os direitos reservados.</span>
          <span>Desenvolvido com ♥ para você</span>
        </div>
      </div>
    </footer>
  );
}
