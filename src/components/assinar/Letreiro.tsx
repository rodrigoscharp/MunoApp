/**
 * O endereço do restaurante, tratado como o letreiro da casa.
 *
 * Vive num componente próprio porque aparece em DUAS telas seguidas da mesma
 * jornada: a de obrigado, onde ele acende quando o provisionamento confirma, e
 * a de criar senha, para onde o e-mail manda em seguida. Ver o mesmo letreiro
 * nas duas faz delas um momento só; duas cópias divergiriam na primeira vez
 * que alguém mexesse numa e esquecesse a outra.
 *
 * `acende` liga a piscada de neon, que só a tela de obrigado usa — lá ela
 * marca a passagem de "montando" para "no ar". Na tela de senha o letreiro já
 * chega aceso: a casa abriu na tela anterior, e reacender seria contar a
 * mesma novidade duas vezes.
 */
export function Letreiro({
  endereco,
  acende = false,
}: {
  endereco: string;
  acende?: boolean;
}) {
  // Quebra no primeiro ponto, e não onde couber. Um `break-all` parte no meio
  // da palavra ("cantina-da-ana.local / host:3000"), que é ilegível e ainda
  // sugere um endereço que não existe. Separado assim, o nome da casa fica
  // grande e o domínio recua para o tamanho de rodapé de letreiro — que é a
  // hierarquia real: o que muda de cliente para cliente é o nome.
  const corte = endereco.indexOf(".");
  const nome = corte === -1 ? endereco : endereco.slice(0, corte);
  const dominio = corte === -1 ? "" : endereco.slice(corte);

  return (
    <p className={acende ? "letreiro-acende" : undefined}>
      <span className="display letreiro block break-words text-[1.75rem] leading-tight text-brand sm:text-[2.25rem]">
        {nome}
      </span>
      {dominio && (
        <span className="mt-1 block text-sm font-medium tracking-wide text-brand/70">
          {dominio}
        </span>
      )}
    </p>
  );
}
