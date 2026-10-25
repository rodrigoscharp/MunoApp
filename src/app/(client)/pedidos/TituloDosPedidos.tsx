import { kicker } from "@/components/loja/estilos";

/**
 * O topo de "Meus pedidos", o mesmo na página e no carregamento: a pessoa
 * clicou em "Meus pedidos" e o que ela precisa saber primeiro é que chegou no
 * lugar certo.
 */
export function TituloDosPedidos() {
  return (
    <div className="mb-8">
      <p className={`${kicker} text-loja-preco`}>Sua conta</p>
      <h1 className="manchete mt-2 text-[44px] text-forest-dark">Meus pedidos</h1>
    </div>
  );
}
