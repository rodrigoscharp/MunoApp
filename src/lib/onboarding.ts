/**
 * O onboarding de quem acabou de comprar.
 *
 * A regra recebe o estado por parâmetro em vez de consultar o banco: assim é
 * testável sem banco, e quem chama decide de onde os dados vêm. Mesma
 * convenção de `checarSlug` (inscricao/slug.ts) e `escolhaDaQueryString`
 * (plans.ts), e pelo mesmo motivo: é a parte que precisa de teste, não a
 * marcação em volta dela.
 *
 * Ver docs/superpowers/specs/2026-08-30-onboarding-do-cliente-novo-design.md.
 */

/**
 * A única coisa do onboarding que fica guardada. Se ele TERMINOU se descobre
 * olhando os dados; só a decisão de adiar precisa de memória, e ela cabe numa
 * linha de Setting, sem migração.
 */
export const ONBOARDING_DISPENSADO = "onboarding_dispensado";

export type EstadoOnboarding = {
  enderecoPreenchido: boolean;
  temItem: boolean;
  dispensado: boolean;
};

/**
 * Pendência é DERIVADA dos dados, nunca de uma flag de conclusão.
 *
 * O dono que preenche o endereço em /adm/restaurante e cadastra um item em
 * /adm/cardapio, sem nunca abrir o onboarding, sai de pendente sozinho. Com
 * uma flag `onboardingConcluido` ele continuaria sendo lembrado de terminar
 * uma coisa que já está feita.
 *
 * As duas condições são as únicas sem as quais a loja está quebrada (endereço
 * vazio aparece no cardápio) ou vazia (nenhum item para vender). Horário já
 * nasce com padrão, e frete só importa para quem entrega.
 */
export function estaPendente(e: EstadoOnboarding): boolean {
  return !e.enderecoPreenchido || !e.temItem;
}

/**
 * Dispensar desliga o REDIRECIONAMENTO, e só ele. O bloco de progresso do
 * painel continua aparecendo enquanto a casa não estiver montada: "deixar para
 * depois" é adiar, não desistir, e sumir com o lembrete junto transformaria um
 * clique distraído num restaurante que nunca é configurado.
 */
export function deveRedirecionar(e: EstadoOnboarding): boolean {
  return estaPendente(e) && !e.dispensado;
}
