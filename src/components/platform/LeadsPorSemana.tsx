"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { SemanaDoFunil } from "@/lib/platform-metrics";

/**
 * Entrada de leads nas últimas 8 semanas.
 *
 * Área porque a pergunta é ritmo ao longo do tempo, não comparação entre
 * categorias. Série única: sem legenda, o título nomeia o que está no gráfico.
 * Eixos e grade recessivos — a linha é o dado, o resto é referência.
 */

const COR = "#2B5240";

export function LeadsPorSemana({ dados }: { dados: SemanaDoFunil[] }) {
  const total = dados.reduce((s, d) => s + d.leads, 0);

  return (
    <section className="bg-console-cartao rounded-2xl border border-console-linha px-6 py-5">
      <div className="flex items-baseline justify-between mb-4">
        <p className="text-[13px] text-neutral-400">entrada de leads</p>
        <p className="text-[13px] text-neutral-400">8 semanas</p>
      </div>

      {total === 0 ? (
        <p className="text-sm text-neutral-400 py-10 text-center">
          Nada ainda. Assim que os leads começarem a entrar, o ritmo aparece aqui.
        </p>
      ) : (
        <div className="h-44">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={dados}
              margin={{ top: 4, right: 4, bottom: 0, left: -22 }}
            >
              <defs>
                <linearGradient id="preenchimentoLeads" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={COR} stopOpacity={0.18} />
                  <stop offset="100%" stopColor={COR} stopOpacity={0.02} />
                </linearGradient>
              </defs>

              <CartesianGrid stroke="#E9E2DB" vertical={false} />
              <XAxis
                dataKey="semana"
                tickLine={false}
                axisLine={false}
                tick={{ fill: "#A3A3A3", fontSize: 11 }}
              />
              <YAxis
                allowDecimals={false}
                tickLine={false}
                axisLine={false}
                width={38}
                tick={{ fill: "#A3A3A3", fontSize: 11 }}
              />
              <Tooltip
                cursor={{ stroke: "#D6CEC6" }}
                contentStyle={{
                  borderRadius: 12,
                  border: "1px solid #E9E2DB",
                  fontSize: 13,
                }}
                labelFormatter={(v) => `semana de ${v}`}
                formatter={(v) => {
                  const n = Number(v ?? 0);
                  return [`${n} ${n === 1 ? "lead" : "leads"}`, ""] as [
                    string,
                    string,
                  ];
                }}
              />
              <Area
                type="monotone"
                dataKey="leads"
                stroke={COR}
                strokeWidth={2}
                fill="url(#preenchimentoLeads)"
                dot={{ r: 3, fill: COR, strokeWidth: 0 }}
                activeDot={{ r: 5 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}
