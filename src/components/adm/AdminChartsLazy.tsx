"use client";

import dynamic from "next/dynamic";
import type { DadosDosGraficos } from "@/lib/analytics";

function Esqueleto() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {[0, 1].map((i) => (
        <div key={i} className="bg-white rounded-xl border border-neutral-200 p-5 h-64 animate-pulse" />
      ))}
    </div>
  );
}

// O recharts é a maior dependência do painel, e só os gráficos precisam dele.
// Importado direto, ele entrava no bundle da página e atrasava a hidratação dos
// cards, que são o que o dono olha primeiro. `ssr: false` porque o
// ResponsiveContainer mede o elemento no navegador: renderizado no servidor ele
// sai com largura zero e redesenha de qualquer jeito. O `ssr: false` só é
// aceito dentro de Client Component, daí este arquivo.
const AdminCharts = dynamic(() => import("./AdminCharts"), {
  ssr: false,
  loading: Esqueleto,
});

export function AdminChartsLazy({ data }: { data: DadosDosGraficos }) {
  return <AdminCharts data={data} />;
}
