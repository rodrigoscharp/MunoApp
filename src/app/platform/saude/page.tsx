import { authPlatform } from "@/lib/auth-platform";
import { avaliarSaude } from "@/lib/saude/avaliar";
import { coletarDadosDeSaude, coletarPedidosPorHora, listarEventos } from "@/lib/saude/coletar";
import { lerFiltros } from "@/lib/saude/filtros";
import { Painel } from "@/components/platform/Painel";
import { GraficoBarras } from "@/components/platform/GraficoBarras";
import { GradeDaSaude } from "@/components/platform/saude/GradeDaSaude";
import { FeedDeEventos } from "@/components/platform/saude/FeedDeEventos";
import { AtualizarSozinho } from "@/components/platform/saude/AtualizarSozinho";
import { TOM_DA_COR } from "@/components/platform/saude/cores";

/**
 * Leitura que falha vira texto na tela, e vira linha no log: sem ela, uma
 * consulta quebrada (coluna que não existe, SQL errado) mostraria "não foi
 * possível ler" para sempre e ninguém saberia por quê. Só a classe do erro,
 * porque a mensagem do Prisma pode trazer o SQL. Sem `reportarErro` de
 * propósito: ele grava na tabela de eventos, que pode ser justamente o que
 * está falhando.
 */
function leituraFalhou(qual: string, erro: unknown): null {
  console.error(`[saude] ${qual} falhou`, erro instanceof Error ? erro.name : "erro");
  return null;
}

/**
 * A saúde do sistema: semáforo das peças, volume de pedidos e o feed.
 *
 * A regra mora em src/lib/saude/avaliar.ts, a mesma que a rota do monitor
 * usa. Esta página só busca e desenha. Leitura que falha vira texto na tela,
 * nunca erro de página: é justamente quando algo está quebrado que esta tela
 * precisa abrir.
 */
export default async function SaudePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await authPlatform();
  if (!session?.user) return null;

  const agora = new Date();
  const filtros = lerFiltros(await searchParams);
  const [dados, porHora, eventos] = await Promise.all([
    coletarDadosDeSaude(agora),
    coletarPedidosPorHora(agora).catch((erro) => leituraFalhou("pedidos por hora", erro)),
    listarEventos(filtros).catch((erro) => leituraFalhou("feed de eventos", erro)),
  ]);
  const saude = avaliarSaude(dados, agora);

  return (
    <div className="space-y-5">
      <AtualizarSozinho />
      <h1 className="text-[30px] sm:text-[40px] font-semibold tracking-[-0.04em] leading-none pt-2 pb-1 sm:pb-3">
        Saúde
      </h1>

      <section className="console-vidro console-entra rounded-[22px] sm:rounded-[28px] p-4 sm:p-6 flex items-center gap-3">
        <span aria-hidden className={`size-3.5 shrink-0 rounded-full ${TOM_DA_COR[saude.geral]}`} />
        <p className="text-[17px] sm:text-[20px] font-semibold tracking-[-0.015em]">{saude.resumo}</p>
      </section>

      <GradeDaSaude saude={saude} agora={agora} />

      <Painel titulo="Pedidos por hora" subtitulo="hoje, na plataforma inteira; passe o cursor para ver a média das 4 semanas">
        {porHora === null ? (
          <p className="text-sm text-console-mudo py-6">Não foi possível ler os pedidos agora.</p>
        ) : (
          <GraficoBarras
            barras={porHora.map((b) => ({
              rotulo: `${String(b.hora).padStart(2, "0")}h`,
              valor: b.hoje,
              // O balão mostra o título no lugar do rótulo, então a hora vai junto.
              titulo: `${String(b.hora).padStart(2, "0")}h · média das 4 semanas: ${b.media}`,
            }))}
            unidade={["pedido", "pedidos"]}
            ultimaEmCurso
          />
        )}
      </Painel>

      <Painel titulo="Eventos" subtitulo="os 100 mais recentes; por padrão, só avisos e erros">
        <FeedDeEventos linhas={eventos} filtros={filtros} agora={agora} />
      </Painel>
    </div>
  );
}
