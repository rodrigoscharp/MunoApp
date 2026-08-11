"use client";

import {
  Bar,
  BarChart,
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
 * Barras, e não área: a pergunta que se faz aqui é "quantos entraram naquela
 * semana", uma contagem discreta por balde. Área sugere um valor contínuo
 * medido entre os pontos, que não existe — ninguém recebe meio lead na
 * quarta-feira.
 *
 * A última barra é a semana corrente, que ainda não terminou. Ela vai
 * hachurada porque comparar uma semana pela metade com semanas inteiras é o
 * erro que este gráfico convida, e a textura avisa sem precisar de legenda:
 * listrado é o que ainda está acontecendo.
 */

const COR = "#2B5240";

export function LeadsPorSemana({ dados }: { dados: SemanaDoFunil[] }) {
  const total = dados.reduce((s, d) => s + d.leads, 0);
  const ultima = dados.length - 1;

  // Duas séries empilhadas em vez de <Cell> por índice: semana com zero lead
  // não gera retângulo, e aí o índice do Cell deixa de corresponder ao da
  // série — a hachura acabava numa barra qualquer, ou em nenhuma. Como uma das
  // duas é sempre zero, o empilhamento desenha uma barra só por semana.
  const series = dados.map((d, i) => ({
    ...d,
    fechadas: i === ultima ? 0 : d.leads,
    emCurso: i === ultima ? d.leads : 0,
  }));

  return (
    <section className="bg-console-cartao rounded-2xl border border-console-linha px-5 py-4 h-full">
      <div className="flex items-baseline justify-between mb-3">
        <p className="text-[13px] text-console-tinta/45">entrada de leads</p>
        <p className="text-[13px] text-console-tinta/45">
          {total === 0 ? "8 semanas" : "semana corrente em aberto"}
        </p>
      </div>

      {total === 0 ? (
        <p className="text-sm text-console-tinta/45 py-12 text-center">
          Nada ainda. Assim que os leads começarem a entrar, o ritmo aparece
          aqui.
        </p>
      ) : (
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={series}
              margin={{ top: 4, right: 4, bottom: 0, left: -22 }}
              barCategoryGap="28%"
            >
              <defs>
                {/* A hachura da semana em curso. Diagonal fina no mesmo verde:
                    distingue por textura, não por outra cor — cor nova aqui
                    seria lida como outra categoria de lead. */}
                <pattern
                  id="semanaEmCurso"
                  patternUnits="userSpaceOnUse"
                  width={6}
                  height={6}
                  patternTransform="rotate(45)"
                >
                  <rect width={6} height={6} fill={COR} opacity={0.1} />
                  <line
                    x1={0}
                    y1={0}
                    x2={0}
                    y2={6}
                    stroke={COR}
                    strokeWidth={2.5}
                    opacity={0.55}
                  />
                </pattern>
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
                cursor={{ fill: "#23201E", fillOpacity: 0.04 }}
                contentStyle={{
                  borderRadius: 12,
                  border: "1px solid #E9E2DB",
                  fontSize: 13,
                }}
                labelFormatter={(v) => `semana de ${v}`}
                formatter={(v, nome) => {
                  const n = Number(v ?? 0);
                  // A série zerada não interessa a ninguém: some do tooltip
                  // em vez de mostrar "0 leads" ao lado do número real.
                  if (n === 0) return [null, ""] as unknown as [string, string];
                  return [
                    `${n} ${n === 1 ? "lead" : "leads"}${
                      nome === "emCurso" ? " — semana em curso" : ""
                    }`,
                    "",
                  ] as [string, string];
                }}
              />
              <Bar
                dataKey="fechadas"
                stackId="semana"
                fill={COR}
                radius={[5, 5, 0, 0]}
                maxBarSize={54}
              />
              <Bar
                dataKey="emCurso"
                stackId="semana"
                fill="url(#semanaEmCurso)"
                stroke={COR}
                strokeOpacity={0.35}
                radius={[5, 5, 0, 0]}
                maxBarSize={54}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}
