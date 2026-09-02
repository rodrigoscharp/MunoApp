/**
 * Os interruptores do convite de instalação, num lugar só.
 *
 * Convite de instalação é a fronteira entre ajudar e importunar, e essa
 * fronteira se ajusta olhando número de conversão, não relendo componente. Por
 * isso os dois pontos de disparo ligam e desligam daqui, e o atraso é um valor
 * e não um número solto dentro do JSX.
 *
 * O terceiro interruptor, DIAS_DE_SILENCIO, mora em ./dispensa.ts, junto da
 * lógica que o usa.
 */

/**
 * A folha que sobe depois de entrar na conta.
 *
 * Depois do login, e não na primeira visita: quem acabou de criar conta já
 * demonstrou intenção, e quem só está olhando o cardápio não deve receber
 * pedido nenhum antes de ter pedido comida.
 */
export const CONVITE_POS_LOGIN = true;

/** A faixa discreta e permanente no cardápio, para quem procurar sozinho. */
export const FAIXA_NO_CARDAPIO = true;

/**
 * Quanto o convite espera antes de subir, depois do login.
 *
 * Zero faria a folha aparecer junto com a navegação, competindo com o próprio
 * carregamento da tela e lendo como interstício de anúncio. Este intervalo dá
 * tempo do cardápio pintar e da pessoa entender onde chegou.
 */
export const ATRASO_DO_CONVITE_MS = 2500;
