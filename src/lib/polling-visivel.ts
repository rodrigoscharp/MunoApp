/**
 * setInterval que não consulta o servidor com a aba escondida.
 *
 * Cada aba aberta no celular de um cliente (chat, acompanhamento, sino) fazia
 * uma consulta a cada 10 a 60 segundos o dia inteiro, vendo ou não. Aqui o
 * tique é pulado enquanto `document.hidden`, e ao voltar para a aba a consulta
 * roda uma vez na hora, para a tela não mostrar dado velho.
 *
 * Fica de fora a tela da cozinha: um tablet fixo no balcão precisa continuar
 * atualizando mesmo que o navegador o considere em segundo plano.
 *
 * @returns função que cancela o polling.
 */
export function iniciarPollingVisivel(fn: () => void, intervaloMs: number): () => void {
  const timer = setInterval(() => {
    if (typeof document !== "undefined" && document.hidden) return;
    fn();
  }, intervaloMs);

  const aoVoltar = () => {
    if (!document.hidden) fn();
  };
  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", aoVoltar);
  }

  return () => {
    clearInterval(timer);
    if (typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", aoVoltar);
    }
  };
}
