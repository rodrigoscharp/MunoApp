import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { runWithTenant } from "@/lib/tenant-context";

export interface DaySchedule {
  open: boolean;
  from: string; // "HH:MM"
  to: string;   // "HH:MM"
}

export type WeekSchedule = Record<string, DaySchedule>;

export const DAY_KEYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;

export const DEFAULT_SCHEDULE: WeekSchedule = {
  monday:    { open: true, from: "11:00", to: "22:00" },
  tuesday:   { open: true, from: "11:00", to: "22:00" },
  wednesday: { open: true, from: "11:00", to: "22:00" },
  thursday:  { open: true, from: "11:00", to: "22:00" },
  friday:    { open: true, from: "11:00", to: "23:00" },
  saturday:  { open: true, from: "11:00", to: "23:00" },
  sunday:    { open: true, from: "11:00", to: "20:00" },
};

const DAY_INDEX_TO_KEY: Record<number, string> = {
  0: "sunday", 1: "monday", 2: "tuesday", 3: "wednesday",
  4: "thursday", 5: "friday", 6: "saturday",
};

export function checkIsOpen(schedule: WeekSchedule): boolean {
  // Horário de Brasília (UTC-3)
  const nowBRT = new Date(Date.now() - 3 * 60 * 60 * 1000);
  const dayKey = DAY_INDEX_TO_KEY[nowBRT.getUTCDay()];
  const day = schedule[dayKey];
  if (!day?.open) return false;

  const nowMin = nowBRT.getUTCHours() * 60 + nowBRT.getUTCMinutes();
  const [fh, fm] = day.from.split(":").map(Number);
  const [th, tm] = day.to.split(":").map(Number);
  return nowMin >= fh * 60 + fm && nowMin < th * 60 + tm;
}

// tenantId entra como argumento para que o unstable_cache diferencie o
// cache por tenant (ver mesma observação em src/lib/restaurant.ts).
const getBusinessHoursCached = unstable_cache(
  async (tenantId: string): Promise<WeekSchedule> => {
    try {
      const setting = await runWithTenant(tenantId, () =>
        prisma.setting.findUnique({ where: { tenantId_key: { tenantId, key: "business_hours" } } })
      );
      return setting ? { ...DEFAULT_SCHEDULE, ...JSON.parse(setting.value) } : DEFAULT_SCHEDULE;
    } catch {
      return DEFAULT_SCHEDULE;
    }
  },
  ["business_hours"],
  { revalidate: 60, tags: ["business_hours"] }
);

// runWithTenant precisa envolver a chamada por fora do unstable_cache: se
// ficar só dentro do callback cacheado, o contexto do AsyncLocalStorage se
// perde antes da extensão de tenant do Prisma rodar (getCurrentTenantId()
// lança "Nenhum tenant no contexto da request"), e a query cai silenciosamente
// no catch, retornando o valor default.
export function getBusinessHours(tenantId: string): Promise<WeekSchedule> {
  return runWithTenant(tenantId, () => getBusinessHoursCached(tenantId));
}
