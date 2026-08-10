/**
 * Limitador de taxa por janela deslizante, guardado em memória.
 *
 * Duas honestidades sobre este mecanismo, para quem for reavaliar depois:
 *
 * 1. O estado é por instância da função. O Fluid Compute reaproveita
 *    instâncias, então o limite morde na prática, mas várias instâncias
 *    significam vários contadores. Isto é proporcional ao volume de um
 *    primeiro lançamento, não a um ataque.
 * 2. Não substitui autenticação. Serve para conter envio repetido e ruído de
 *    bot em rota pública de escrita.
 *
 * O relógio é parâmetro, não `Date.now()` interno, para o teste não depender
 * de `sleep` — teste com espera real é lento e intermitente.
 */

export interface LimiteConfig {
  max: number;
  janelaMs: number;
}

export interface Limitador {
  permitir(chave: string, agora: number): boolean;
  readonly chaves: number;
}

export function criarLimitador({ max, janelaMs }: LimiteConfig): Limitador {
  const registros = new Map<string, number[]>();

  // Poda a cada chamada, e não por timer: sem processo de fundo, o mapa
  // encolhe no mesmo caminho que o faz crescer.
  function podar(agora: number): void {
    for (const [chave, marcas] of registros) {
      const vivas = marcas.filter((marca) => agora - marca < janelaMs);
      if (vivas.length === 0) registros.delete(chave);
      else registros.set(chave, vivas);
    }
  }

  return {
    permitir(chave: string, agora: number): boolean {
      podar(agora);
      const marcas = registros.get(chave) ?? [];
      if (marcas.length >= max) return false;
      marcas.push(agora);
      registros.set(chave, marcas);
      return true;
    },
    get chaves(): number {
      return registros.size;
    },
  };
}
