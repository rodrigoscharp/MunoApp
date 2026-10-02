/**
 * A guarda dos testes de integração: só roda em banco local e com nome de
 * teste. Um `DATABASE_URL_TESTE` apontando para produção por engano seria o
 * pior erro possível deste diretório, porque os testes criam e apagam linhas.
 */
/** O Postgres do docker-compose, num banco só para teste. */
export const URL_PADRAO_DO_BANCO_DE_TESTE =
  "postgresql://localhost:5433/muno_teste";

export function urlDoBancoDeTeste(
  env: Record<string, string | undefined> = process.env
): string {
  const url = env.DATABASE_URL_TESTE;
  if (!url) {
    throw new Error("DATABASE_URL_TESTE não definida. Veja vitest.integration.config.mts.");
  }
  const { hostname, pathname } = new URL(url);
  const local = ["localhost", "127.0.0.1", "::1", "postgres", "db"].includes(hostname);
  if (!local) {
    throw new Error(
      `Recusado: os testes de integração só rodam em banco local (host "${hostname}" não é).`
    );
  }
  if (!/test/i.test(pathname)) {
    throw new Error(
      `Recusado: o banco de teste precisa ter "test" no nome (recebi "${pathname.slice(1)}").`
    );
  }
  return url;
}
