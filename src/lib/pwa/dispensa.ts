/**
 * Quanto tempo o convite de instalação fica calado depois de dispensado.
 *
 * O convite reaparece porque a intenção muda: quem recusou na primeira compra
 * pode querer o atalho na quinta. O que não pode é reaparecer na sessão
 * seguinte, que é o que transforma o convite em propaganda.
 */
export const DIAS_DE_SILENCIO = 14;

/** Segue a convenção das outras chaves do app: muno-tema, muno-cart. */
export const CHAVE_DISPENSA = "muno-pwa-dispensado";

const DIA_EM_MS = 24 * 60 * 60 * 1000;

/**
 * O valor a gravar quando alguém dispensa o convite.
 *
 * Um carimbo de tempo, e não um "1": a flag booleana que MenuAIAssistant usa
 * cala o aviso para sempre, e aqui queremos que ele volte.
 */
export function marcarDispensa(agora: number): string {
  return String(agora);
}

/**
 * O convite deve ficar calado agora?
 *
 * Recebe o valor bruto do localStorage porque ele é editável por qualquer
 * script e sobrevive a mudanças de formato: qualquer coisa que não seja um
 * carimbo plausível volta a convidar, em vez de silenciar para sempre. Carimbo
 * no futuro entra na mesma regra, senão um relógio adiantado tranca o convite
 * até a data chegar.
 */
export function dispensaAtiva(bruto: string | null, agora: number): boolean {
  if (!bruto) return false;

  const quando = Number(bruto);
  if (!Number.isFinite(quando) || quando <= 0 || quando > agora) return false;

  return agora - quando < DIAS_DE_SILENCIO * DIA_EM_MS;
}
