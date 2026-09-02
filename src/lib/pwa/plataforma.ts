/**
 * É um aparelho da Apple?
 *
 * A pergunta importa porque o iOS não tem `beforeinstallprompt`: não existe
 * API nenhuma para pedir a instalação, e o único caminho é ensinar o passo
 * manual do menu Compartilhar. Chrome e Firefox no iOS também são WebKit por
 * baixo e caem no mesmo caminho, então a checagem é do sistema, não do
 * navegador.
 *
 * `maxTouchPoints` entra porque desde o iPadOS 13 o Safari do iPad manda user
 * agent de Macintosh. Sem essa segunda pergunta, todo iPad moderno ficaria sem
 * instrução nenhuma; com ela sozinha, um Mac com tela de toque viraria iOS.
 */
export function ehIOS(userAgent: string, maxTouchPoints: number): boolean {
  if (/iphone|ipod|ipad/i.test(userAgent)) return true;
  return /macintosh/i.test(userAgent) && maxTouchPoints > 1;
}
