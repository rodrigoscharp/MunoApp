/**
 * Cache em memória do restaurante que o proxy resolve a partir do host.
 *
 * O proxy roda em TODA requisição de TODO restaurante (página, API, cada tick
 * de polling da cozinha) e fazia uma consulta ao banco por requisição só para
 * achar o tenant, o plano e o status da assinatura. Com centenas de telas de
 * cozinha abertas isso era a maior fonte de consultas do sistema.
 *
 * A troca: uma mudança de status, de plano ou de bloqueio por inadimplência
 * demora até 30 segundos para valer em cada instância. Para cobrança isso é
 * irrelevante (o prazo é em dias úteis), e desativar um restaurante tem a
 * mesma defasagem.
 *
 * Por instância, como o resto do estado em memória (rate-limit.ts): cada
 * instância serverless tem o seu.
 */

const VALIDADE_MS = 30_000;
// Restaurante inexistente: curto, para um varredor de subdomínios não bater no
// banco a cada tentativa e, ao mesmo tempo, um restaurante recém-provisionado
// não fique "não encontrado" por meio minuto.
const VALIDADE_NEGATIVA_MS = 5_000;
const LIMITE_DE_ENTRADAS = 1000;

type Entrada<T> = { valor: T | null; expiraEm: number };

const guardados = new Map<string, Entrada<unknown>>();
const emVoo = new Map<string, Promise<unknown>>();

export async function buscarTenantComCache<T>(
  slug: string,
  buscar: () => Promise<T | null>
): Promise<T | null> {
  const agora = Date.now();
  const guardado = guardados.get(slug);
  if (guardado && guardado.expiraEm > agora) return guardado.valor as T | null;

  // Requisições simultâneas ao mesmo restaurante esperam a mesma consulta.
  const pendente = emVoo.get(slug);
  if (pendente) return pendente as Promise<T | null>;

  const consulta = buscar()
    .then((valor) => {
      if (guardados.size >= LIMITE_DE_ENTRADAS) guardados.clear();
      guardados.set(slug, {
        valor,
        expiraEm: Date.now() + (valor ? VALIDADE_MS : VALIDADE_NEGATIVA_MS),
      });
      return valor;
    })
    .finally(() => {
      emVoo.delete(slug);
    });

  emVoo.set(slug, consulta);
  return consulta;
}

/** Para os testes: esquece tudo. */
export function limparCacheDeTenants() {
  guardados.clear();
  emVoo.clear();
}
