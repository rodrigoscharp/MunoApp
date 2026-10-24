// @vitest-environment jsdom
/**
 * O carrinho.
 *
 * É o único estado do app que vive no navegador do cliente e sobrevive a um
 * refresh (zustand + persist em localStorage). O servidor recalcula tudo em
 * POST /api/orders, então um erro aqui não cobra errado — mas cobra **outra
 * coisa**: item somado na linha errada, quantidade que não zera, carrinho que
 * volta do localStorage com o que o cliente achava que tinha apagado.
 *
 * jsdom é pedido no topo porque o `persist` precisa de localStorage.
 */

import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  useCart,
  chaveDoCarrinho,
  contextoPeloCaminho,
  trocarContextoDoCarrinho,
} from "@/hooks/useCart";

const item = (over: Partial<{ id: string; name: string; price: number; notes: string }> = {}) => ({
  id: "item-1",
  name: "X-Salada",
  price: 25,
  imageUrl: null,
  ...over,
});

const carrinho = () => useCart.getState();

beforeEach(() => {
  useCart.setState({ items: [] });
  localStorage.clear();
});

describe("adicionar item", () => {
  it("entra no carrinho com quantidade 1 por padrão", () => {
    carrinho().addItem(item());

    expect(carrinho().items).toHaveLength(1);
    expect(carrinho().items[0]).toMatchObject({ id: "item-1", quantity: 1 });
  });

  it("aceita quantidade explícita", () => {
    carrinho().addItem(item(), 3);
    expect(carrinho().items[0].quantity).toBe(3);
  });

  it("soma na mesma linha quando o item se repete", () => {
    carrinho().addItem(item(), 2);
    carrinho().addItem(item(), 3);

    expect(carrinho().items).toHaveLength(1);
    expect(carrinho().items[0].quantity).toBe(5);
  });

  it("separa em linhas diferentes o mesmo item com observações diferentes", () => {
    // Duas linhas de propósito: a cozinha precisa ver "sem cebola" separado do
    // normal, senão o pedido chega como dois X-Salada iguais.
    carrinho().addItem(item({ notes: "sem cebola" }));
    carrinho().addItem(item({ notes: "sem tomate" }));

    expect(carrinho().items).toHaveLength(2);
  });

  it("soma na mesma linha quando a observação também se repete", () => {
    carrinho().addItem(item({ notes: "sem cebola" }));
    carrinho().addItem(item({ notes: "sem cebola" }));

    expect(carrinho().items).toHaveLength(1);
    expect(carrinho().items[0].quantity).toBe(2);
  });

  it("separa item com observação de item sem observação", () => {
    carrinho().addItem(item());
    carrinho().addItem(item({ notes: "bem passado" }));

    expect(carrinho().items).toHaveLength(2);
  });

  it("mantém itens diferentes em linhas próprias", () => {
    carrinho().addItem(item({ id: "item-1" }));
    carrinho().addItem(item({ id: "item-2", name: "Suco" }));

    expect(carrinho().items).toHaveLength(2);
  });
});

describe("mudar quantidade", () => {
  beforeEach(() => {
    carrinho().addItem(item(), 3);
  });

  it("grava a nova quantidade", () => {
    carrinho().updateQuantity(carrinho().items[0].cartId, 7);
    expect(carrinho().items[0].quantity).toBe(7);
  });

  it("remove a linha quando a quantidade chega a zero", () => {
    // É o que o botão de menos faz na última unidade — vira lixeira na UI.
    carrinho().updateQuantity(carrinho().items[0].cartId, 0);
    expect(carrinho().items).toHaveLength(0);
  });

  it("remove a linha quando a quantidade fica negativa", () => {
    carrinho().updateQuantity(carrinho().items[0].cartId, -2);
    expect(carrinho().items).toHaveLength(0);
  });

  it("ignora cartId que não está no carrinho", () => {
    carrinho().updateQuantity("nao-existe", 9);
    expect(carrinho().items[0].quantity).toBe(3);
  });

  it("mexe só na linha pedida", () => {
    carrinho().addItem(item({ id: "item-2", name: "Suco", price: 8 }), 2);
    const [primeira, segunda] = carrinho().items;

    carrinho().updateQuantity(primeira.cartId, 1);

    expect(carrinho().items.find((i) => i.cartId === segunda.cartId)!.quantity).toBe(2);
  });
});

describe("remover e limpar", () => {
  it("remove só a linha pedida", () => {
    carrinho().addItem(item({ id: "item-1" }));
    carrinho().addItem(item({ id: "item-2", name: "Suco" }));

    carrinho().removeItem(carrinho().items[0].cartId);

    expect(carrinho().items).toHaveLength(1);
    expect(carrinho().items[0].id).toBe("item-2");
  });

  it("esvazia o carrinho", () => {
    carrinho().addItem(item(), 5);
    carrinho().clearCart();

    expect(carrinho().items).toEqual([]);
    expect(carrinho().total()).toBe(0);
  });
});

describe("total e contagem", () => {
  it("soma preço vezes quantidade de cada linha", () => {
    carrinho().addItem(item({ id: "item-1", price: 25 }), 2);
    carrinho().addItem(item({ id: "item-2", name: "Suco", price: 8 }), 3);

    expect(carrinho().total()).toBe(74);
  });

  it("conta unidades, não linhas", () => {
    carrinho().addItem(item({ id: "item-1" }), 2);
    carrinho().addItem(item({ id: "item-2", name: "Suco" }), 3);

    expect(carrinho().itemCount()).toBe(5);
  });

  it("carrinho vazio soma zero e conta zero", () => {
    expect(carrinho().total()).toBe(0);
    expect(carrinho().itemCount()).toBe(0);
  });

  it("acompanha a mudança de quantidade", () => {
    carrinho().addItem(item({ price: 25 }), 2);
    carrinho().updateQuantity(carrinho().items[0].cartId, 4);

    expect(carrinho().total()).toBe(100);
    expect(carrinho().itemCount()).toBe(4);
  });

  it("lida com preço quebrado sem acumular erro visível", () => {
    carrinho().addItem(item({ price: 19.9 }), 3);
    expect(carrinho().total()).toBeCloseTo(59.7, 2);
  });
});

describe("o carrinho sobrevive ao refresh", () => {
  it("grava no localStorage sob a chave do app", () => {
    carrinho().addItem(item(), 2);

    const bruto = localStorage.getItem("muno-cart");
    expect(bruto).toBeTruthy();
    expect(JSON.parse(bruto!).state.items[0]).toMatchObject({ id: "item-1", quantity: 2 });
  });

  it("limpar o carrinho também limpa o que estava guardado", () => {
    carrinho().addItem(item(), 2);
    carrinho().clearCart();

    expect(JSON.parse(localStorage.getItem("muno-cart")!).state.items).toEqual([]);
  });
});

describe("um carrinho por contexto", () => {
  // O carrinho do delivery e o da mesa viviam na mesma chave: o que o cliente
  // separou em casa aparecia no pedido da mesa, e vice-versa. Cada mesa tem o
  // seu, e o delivery continua na chave antiga, que é a migração: quem já
  // tinha carrinho guardado o encontra no mesmo lugar.
  afterEach(() => trocarContextoDoCarrinho("delivery"));

  it("o caminho decide o contexto", () => {
    expect(contextoPeloCaminho("/")).toBe("delivery");
    expect(contextoPeloCaminho("/checkout")).toBe("delivery");
    expect(contextoPeloCaminho("/mesa/abc")).toBe("mesa:abc");
    expect(contextoPeloCaminho("/mesa/abc/cardapio")).toBe("mesa:abc");
  });

  it("o delivery fica na chave antiga e cada mesa na sua", () => {
    expect(chaveDoCarrinho("delivery")).toBe("muno-cart");
    expect(chaveDoCarrinho("mesa:abc")).toBe("muno-cart:mesa:abc");
  });

  it("encontra o carrinho que já estava guardado na chave antiga", () => {
    trocarContextoDoCarrinho("mesa:abc");
    localStorage.setItem(
      "muno-cart",
      JSON.stringify({ state: { items: [{ ...item(), cartId: "item-1::", quantity: 2 }] }, version: 0 })
    );

    trocarContextoDoCarrinho("delivery");
    expect(carrinho().items).toHaveLength(1);
    expect(carrinho().items[0].quantity).toBe(2);
  });

  it("a mesa começa vazia e não leva o carrinho do delivery", () => {
    carrinho().addItem(item({ id: "de-casa" }));

    trocarContextoDoCarrinho("mesa:abc");
    expect(carrinho().items).toEqual([]);

    carrinho().addItem(item({ id: "da-mesa" }));
    expect(JSON.parse(localStorage.getItem("muno-cart:mesa:abc")!).state.items[0].id).toBe("da-mesa");
    expect(JSON.parse(localStorage.getItem("muno-cart")!).state.items[0].id).toBe("de-casa");
  });

  it("voltar ao delivery devolve o carrinho de antes", () => {
    carrinho().addItem(item({ id: "de-casa" }));
    trocarContextoDoCarrinho("mesa:abc");
    carrinho().addItem(item({ id: "da-mesa" }));

    trocarContextoDoCarrinho("delivery");
    expect(carrinho().items.map((i) => i.id)).toEqual(["de-casa"]);
  });

  it("duas mesas não se misturam", () => {
    trocarContextoDoCarrinho("mesa:abc");
    carrinho().addItem(item({ id: "mesa-abc" }));

    trocarContextoDoCarrinho("mesa:xyz");
    expect(carrinho().items).toEqual([]);
  });
});
