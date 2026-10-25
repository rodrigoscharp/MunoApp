"use client";

import { useState, useTransition } from "react";
import { Clock, Check } from "lucide-react";
import { toast } from "sonner";
import type { WeekSchedule } from "@/lib/business-hours";
import { botaoBrasa, campo, cartaoPainel, tituloDeSecao } from "@/components/painel/estilos";
import { Selo } from "@/components/painel/Selo";
import { cn } from "@/lib/utils";

export type { DaySchedule, WeekSchedule } from "@/lib/business-hours";

const DAYS: { key: string; label: string }[] = [
  { key: "monday",    label: "Segunda" },
  { key: "tuesday",   label: "Terça"   },
  { key: "wednesday", label: "Quarta"  },
  { key: "thursday",  label: "Quinta"  },
  { key: "friday",    label: "Sexta"   },
  { key: "saturday",  label: "Sábado"  },
  { key: "sunday",    label: "Domingo" },
];

interface Props {
  initialSchedule: WeekSchedule;
}

export function BusinessHoursControl({ initialSchedule }: Props) {
  const [schedule, setSchedule] = useState<WeekSchedule>(initialSchedule);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  function toggleDay(key: string) {
    setSchedule((prev) => ({
      ...prev,
      [key]: { ...prev[key], open: !prev[key].open },
    }));
    setSaved(false);
  }

  function setTime(key: string, field: "from" | "to", value: string) {
    setSchedule((prev) => ({
      ...prev,
      [key]: { ...prev[key], [field]: value },
    }));
    setSaved(false);
  }

  async function save() {
    startTransition(async () => {
      const res = await fetch("/api/settings/business-hours", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(schedule),
      });

      if (res.ok) {
        setSaved(true);
        toast.success("Horários salvos com sucesso");
      } else {
        toast.error("Erro ao salvar horários");
      }
    });
  }

  return (
    <div className={`${cartaoPainel} p-5 sm:p-6`}>
      <div className="mb-4 flex items-center gap-2">
        <Clock size={17} className="text-loja-preco" aria-hidden />
        <h3 className={tituloDeSecao}>Horário de funcionamento</h3>
      </div>

      <ul className="flex flex-col">
        {DAYS.map(({ key, label }) => {
          const day = schedule[key];
          return (
            <li
              key={key}
              className="grid grid-cols-[52px_minmax(64px,88px)_1fr] items-center gap-2 border-t border-[#F0E6DA] py-2 first:border-t-0 sm:gap-3"
            >
              {/* Toggle aberto/fechado */}
              <button
                type="button"
                role="switch"
                aria-checked={day.open}
                aria-label={`${label}: ${day.open ? "aberto" : "fechado"}`}
                onClick={() => toggleDay(key)}
                className="flex h-11 w-[52px] items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              >
                <span
                  aria-hidden
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 ${
                    day.open ? "bg-forest-dark" : "bg-[#D9CCBC]"
                  }`}
                >
                  <span
                    className={`inline-block h-[18px] w-[18px] rounded-full bg-white shadow transition-transform duration-200 ${
                      day.open ? "translate-x-[23px]" : "translate-x-[3px]"
                    }`}
                  />
                </span>
              </button>

              {/* Nome do dia */}
              <span className={`text-[14px] font-bold ${day.open ? "text-loja-tinta" : "text-loja-tinta-2"}`}>
                {label}
              </span>

              {/* Horários */}
              {day.open ? (
                <div className="flex min-w-0 items-center gap-2">
                  <input
                    type="time"
                    value={day.from}
                    aria-label={`${label}: abre às`}
                    onChange={(e) => setTime(key, "from", e.target.value)}
                    className={cn(campo, "h-11 min-w-0 px-2 py-0 text-[14px] sm:px-3")}
                  />
                  <span className="shrink-0 text-[12px] text-loja-tinta-2">até</span>
                  <input
                    type="time"
                    value={day.to}
                    aria-label={`${label}: fecha às`}
                    onChange={(e) => setTime(key, "to", e.target.value)}
                    className={cn(campo, "h-11 min-w-0 px-2 py-0 text-[14px] sm:px-3")}
                  />
                </div>
              ) : (
                <Selo tom="neutro" className="justify-self-start">Fechado</Selo>
              )}
            </li>
          );
        })}
      </ul>

      <button
        type="button"
        onClick={save}
        disabled={pending || saved}
        className={`${botaoBrasa} mt-5 h-12 w-full text-[14px]`}
      >
        {saved ? (
          <><Check size={16} aria-hidden /> Salvo</>
        ) : pending ? (
          "Salvando..."
        ) : (
          "Salvar horários"
        )}
      </button>
    </div>
  );
}
