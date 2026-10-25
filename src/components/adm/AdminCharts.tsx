/**
 * Os gráficos do dashboard do /adm, em HTML e CSS puros, desenhados no
 * servidor.
 *
 * Eram recharts, carregado à parte no navegador. Barras, rosca e grade de
 * calor não pedem biblioteca: com `div`, `conic-gradient` e altura em
 * porcentagem o gráfico chega pronto no HTML, sem esperar JavaScript, e as
 * cores são as classes da loja como no resto da tela. Cada gráfico traz o
 * mesmo dado em texto para leitor de tela (tabela escondida ou rótulo).
 */

import type { DadosDoPainel } from "@/lib/analytics";
import { nivelDoCalor, type MapaDeCalor } from "@/lib/painel/periodo";
import { cn } from "@/lib/utils";

const DIAS_CURTOS = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"];
const DIAS_POR_EXTENSO = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

/** Valor de barra e de rótulo: sem centavos, "R$ 1.133". */
export function moedaSemCentavos(valor: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(valor);
}

function diaDaSemana(dia: string): number {
  return new Date(`${dia}T12:00:00.000Z`).getUTCDay();
}

// ---------------------------------------------------------------------------

/** As barrinhas de tendência de cada número do topo. Decoração: o número já diz. */
export function MiniBarras({ valores, cor }: { valores: number[]; cor: string }) {
  const maior = Math.max(...valores, 0);
  return (
    <div aria-hidden="true" className="flex h-[30px] items-end gap-[3px]">
      {valores.map((v, i) => (
        <span
          key={i}
          className={cn("min-h-[3px] flex-1 rounded-[3px]", i === valores.length - 1 ? cor : "bg-loja-pessego")}
          style={{ height: maior > 0 ? `${Math.round((v / maior) * 100)}%` : "3px" }}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------

const ALTURA_DO_GRAFICO = 160;

export function GraficoDeFaturamento({ dias }: { dias: DadosDoPainel["porDia"] }) {
  const maior = Math.max(...dias.map((d) => d.receita), 0);
  const media = dias.length > 0 ? dias.reduce((s, d) => s + d.receita, 0) / dias.length : 0;
  const poucos = dias.length <= 10;

  const rotulo = (dia: string, i: number) => {
    if (i === dias.length - 1) return "HOJE";
    if (poucos) return DIAS_CURTOS[diaDaSemana(dia)];
    // Em 30 barras, um rótulo a cada cinco dias, contando de hoje para trás.
    return (dias.length - 1 - i) % 5 === 0 ? String(Number(dia.slice(8))) : "";
  };

  return (
    <>
      <div
        aria-hidden="true"
        className={cn(
          "relative mt-[18px] flex items-end border-b border-loja-linha pb-[26px]",
          poucos ? "gap-2 sm:gap-3.5" : "gap-[3px] sm:gap-1"
        )}
        style={{ height: ALTURA_DO_GRAFICO + 60 }}
      >
        {maior > 0 && (
          <span
            className="absolute inset-x-0 border-t-[1.5px] border-dashed border-[#C9A685]"
            style={{ bottom: 26 + Math.round((media / maior) * ALTURA_DO_GRAFICO) }}
          />
        )}
        {dias.map((d, i) => {
          const hoje = i === dias.length - 1;
          const altura = maior > 0 ? Math.round((d.receita / maior) * ALTURA_DO_GRAFICO) : 0;
          return (
            <div key={d.dia} className="relative flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1.5">
              {(poucos || hoje) && d.receita > 0 && (
                <span className="whitespace-nowrap text-[10.5px] font-extrabold text-[#4E4038] sm:text-[11px]">
                  {moedaSemCentavos(d.receita)}
                </span>
              )}
              <span
                className={cn(
                  "w-full max-w-14",
                  poucos ? "rounded-t-xl rounded-b-[4px]" : "rounded-t-[4px] rounded-b-[2px]",
                  hoje ? "bg-loja-brasa" : "bg-[#F2C9AE]"
                )}
                style={{ height: Math.max(altura, d.receita > 0 ? 3 : 1) }}
              />
              <span
                className={cn(
                  "absolute -bottom-[22px] whitespace-nowrap text-[11px] font-bold",
                  hoje ? "text-loja-preco" : "text-loja-tinta-2"
                )}
              >
                {rotulo(d.dia, i)}
              </span>
            </div>
          );
        })}
      </div>
      <table className="sr-only">
        <caption>Faturamento por dia. Média: {moedaSemCentavos(media)}.</caption>
        <thead>
          <tr>
            <th scope="col">Dia</th>
            <th scope="col">Faturamento</th>
          </tr>
        </thead>
        <tbody>
          {dias.map((d) => (
            <tr key={d.dia}>
              <td>{d.dia.split("-").reverse().join("/")}</td>
              <td>{moedaSemCentavos(d.receita)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

// ---------------------------------------------------------------------------

const TIPOS = [
  { tipo: "DELIVERY", rotulo: "Entrega", cor: "#D4612A" },
  { tipo: "PICKUP", rotulo: "Retirada", cor: "#1E3D2F" },
  { tipo: "DINE_IN", rotulo: "Mesa", cor: "#F2A67F" },
] as const;

const FORMAS = [
  { forma: "PIX", rotulo: "Pix", cor: "bg-forest" },
  { forma: "CREDIT_CARD", rotulo: "Cartão", cor: "bg-[#9CBBA9]" },
  { forma: "CASH", rotulo: "Dinheiro", cor: "bg-loja-folha" },
] as const;

function porcentagens(valores: number[]): number[] {
  const total = valores.reduce((a, b) => a + b, 0);
  return valores.map((v) => (total > 0 ? Math.round((v / total) * 100) : 0));
}

export function ComoPediram({
  porTipo,
  porPagamento,
}: {
  porTipo: DadosDoPainel["porTipo"];
  porPagamento: DadosDoPainel["porPagamento"];
}) {
  const contagens = TIPOS.map((t) => porTipo.find((x) => x.tipo === t.tipo)?.pedidos ?? 0);
  const total = contagens.reduce((a, b) => a + b, 0);
  const pcts = porcentagens(contagens);

  // A rosca é um conic-gradient: cada fatia começa onde a anterior termina.
  let acumulado = 0;
  const fatias = TIPOS.map((t, i) => {
    const de = acumulado;
    acumulado += total > 0 ? (contagens[i] / total) * 100 : 0;
    return `${t.cor} ${de}% ${acumulado}%`;
  });
  const fundo = total > 0 ? `conic-gradient(${fatias.join(", ")})` : "#F4EBDF";
  const descricao =
    total > 0
      ? TIPOS.map((t, i) => `${t.rotulo} ${pcts[i]}%`).join(", ")
      : "Nenhum pedido neste período";

  const formas = FORMAS.map((f) => porPagamento.find((x) => x.forma === f.forma)?.pedidos ?? 0);
  const totalFormas = formas.reduce((a, b) => a + b, 0);
  const pctsFormas = porcentagens(formas);

  return (
    <>
      <div className="flex items-center gap-[18px]">
        <div
          role="img"
          aria-label={descricao}
          className="relative h-[132px] w-[132px] shrink-0 rounded-full"
          style={{ background: fundo }}
        >
          <span className="absolute inset-[22px] flex flex-col items-center justify-center rounded-full bg-loja-papel">
            <span className="manchete text-[26px] leading-none text-forest-dark">{total}</span>
            <span className="text-[10.5px] text-loja-tinta-2">{total === 1 ? "pedido" : "pedidos"}</span>
          </span>
        </div>
        <ul className="flex min-w-0 flex-1 flex-col gap-2.5 text-[13px]">
          {TIPOS.map((t, i) => (
            <li key={t.tipo} className="flex items-center gap-2">
              <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: t.cor }} />
              {t.rotulo}
              <strong className="ml-auto">{pcts[i]}%</strong>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex flex-col gap-2 border-t border-dashed border-[#E2D2BF] pt-3">
        <span className="text-[12.5px] font-extrabold">Pagamento</span>
        <div aria-hidden="true" className="flex h-3 overflow-hidden rounded-md bg-loja-creme">
          {totalFormas > 0 &&
            FORMAS.map((f, i) => (
              <span key={f.forma} className={f.cor} style={{ width: `${(formas[i] / totalFormas) * 100}%` }} />
            ))}
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11.5px] text-[#4E4038]">
          {FORMAS.map((f, i) => (
            <span key={f.forma}>
              <strong>{f.rotulo}</strong> {pctsFormas[i]}%
            </span>
          ))}
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------

// Do vazio ao pico, em claridade decrescente: o tom diz a intensidade mesmo
// para quem não distingue o matiz.
const TONS_DO_CALOR = ["bg-loja-creme", "bg-[#F6DCC6]", "bg-[#F2B48F]", "bg-[#E3804E]", "bg-loja-brasa"];

export function descreverPico(mapa: MapaDeCalor): string {
  if (!mapa.pico) return "Ainda sem pedidos nos últimos 30 dias";
  return `${DIAS_POR_EXTENSO[mapa.pico.diaDaSemana]} ${mapa.pico.hora}h é o seu pico`;
}

export function MapaDeCalorDosPedidos({ mapa }: { mapa: MapaDeCalor }) {
  const rotulo = mapa.pico
    ? `Pedidos por dia da semana e hora, nos últimos 30 dias. O pico é ${DIAS_POR_EXTENSO[mapa.pico.diaDaSemana]} às ${mapa.pico.hora}h, com ${mapa.pico.pedidos} ${mapa.pico.pedidos === 1 ? "pedido" : "pedidos"}.`
    : "Pedidos por dia da semana e hora: ainda sem pedidos nos últimos 30 dias.";

  return (
    <>
      <div className="mt-3.5 overflow-x-auto">
        <div
          role="img"
          aria-label={rotulo}
          className="grid gap-1"
          style={{
            gridTemplateColumns: `40px repeat(${mapa.horas.length}, minmax(26px, 1fr))`,
            minWidth: 40 + mapa.horas.length * 30,
          }}
        >
          <span />
          {mapa.horas.map((h) => (
            <span key={h} className="text-center text-[10.5px] font-bold text-loja-tinta-2">
              {h}h
            </span>
          ))}
          {DIAS_CURTOS.map((dia, d) => (
            <Linha key={dia} dia={dia} valores={mapa.horas.map((h) => mapa.celulas[d][h])} maximo={mapa.maximo} />
          ))}
        </div>
      </div>
      <div aria-hidden="true" className="mt-3 flex items-center gap-2 text-[11px] text-loja-tinta-2">
        menos
        {TONS_DO_CALOR.slice(1).map((t) => (
          <span key={t} className={cn("h-2.5 w-[18px] rounded-[3px]", t)} />
        ))}
        mais
      </div>
    </>
  );
}

function Linha({ dia, valores, maximo }: { dia: string; valores: number[]; maximo: number }) {
  return (
    <>
      <span className="flex items-center text-[10.5px] font-extrabold text-loja-tinta-2">{dia}</span>
      {valores.map((v, i) => (
        <span
          key={i}
          title={`${v} ${v === 1 ? "pedido" : "pedidos"}`}
          className={cn("h-[30px] rounded-md", TONS_DO_CALOR[nivelDoCalor(v, maximo)])}
        />
      ))}
    </>
  );
}
