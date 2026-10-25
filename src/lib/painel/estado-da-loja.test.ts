import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SCHEDULE, type WeekSchedule } from "@/lib/business-hours";
import { estadoDaLoja } from "./estado-da-loja";

// As horas abaixo são de Brasília; o relógio do teste anda em UTC (+3h).
function as(isoBRT: string) {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(new Date(`${isoBRT}Z`).getTime() + 3 * 3600_000));
}

afterEach(() => vi.useRealTimers());

const semana = (dia: WeekSchedule): WeekSchedule => ({ ...DEFAULT_SCHEDULE, ...dia });

describe("estadoDaLoja", () => {
  it("aberto mostra a hora de fechar de hoje", () => {
    as("2026-10-24T20:00:00"); // sábado
    expect(estadoDaLoja(semana({ saturday: { open: true, from: "11:00", to: "23:30" } }))).toEqual({
      aberto: true,
      rotulo: "Aberto · fecha 23:30",
    });
  });

  it("depois da meia-noite vale a janela de ontem que virou o dia", () => {
    as("2026-10-25T01:00:00"); // domingo, 01:00
    const s = semana({
      saturday: { open: true, from: "18:00", to: "02:00" },
      sunday: { open: true, from: "18:00", to: "23:00" },
    });
    expect(estadoDaLoja(s)).toEqual({ aberto: true, rotulo: "Aberto · fecha 02:00" });
  });

  it("antes de abrir diz a hora de abrir", () => {
    as("2026-10-24T09:00:00");
    expect(estadoDaLoja(semana({ saturday: { open: true, from: "11:00", to: "23:00" } }))).toEqual({
      aberto: false,
      rotulo: "Fechado · abre 11:00",
    });
  });

  it("depois de fechar, ou em dia de folga, só diz fechado", () => {
    as("2026-10-24T23:45:00");
    expect(estadoDaLoja(semana({ saturday: { open: true, from: "11:00", to: "23:00" } })).rotulo).toBe(
      "Fechado agora"
    );
    as("2026-10-24T12:00:00");
    expect(estadoDaLoja(semana({ saturday: { open: false, from: "11:00", to: "23:00" } })).rotulo).toBe(
      "Fechado agora"
    );
  });
});
