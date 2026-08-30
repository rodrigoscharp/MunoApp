# O onboarding de quem acabou de comprar

## Problema

O cliente paga, cria a senha e é solto. O caminho de hoje termina assim:

```
paga -> tela de obrigado -> e-mail -> cria senha -> login -> vitrine
```

Repare no último salto: o login manda para `/` (`LoginForm.tsx`,
`callbackUrl ?? "/"`), que é o **cardápio**. O dono entra na Muno pela primeira
vez e cai na própria vitrine, como se fosse cliente dele. Para chegar ao painel
precisa descobrir sozinho que existe um `/adm`.

E se chegar, encontra um Dashboard zerado. As informações do restaurante moram
em `/adm/restaurante`, uma tela chamada "Gerenciamento do Restaurante" com seis
blocos lado a lado, todos no mesmo peso visual: previsão de entrega, informações,
impressora, horários, bairros e cupons. Nada ali diz por onde começar, nada
avisa que o endereço está vazio, e nada menciona que o cardápio não tem um único
item. É uma tela para quem já conhece o sistema e vem ajustar uma configuração.

O resultado é que `provisionTenant` entrega três coisas — Tenant, usuário ADMIN
e o Setting com o nome — e o resto fica por conta de alguém que acabou de gastar
R$ 1.649,89 e não sabe o que fazer em seguida. Endereço e telefone nascem
vazios de propósito (`SEM_CADASTRO`), o cardápio nasce sem categoria nenhuma, e
a vitrine anuncia "Cardápio em breve. Os itens serão adicionados pelo
administrador".

O momento de maior boa vontade da relação inteira — os minutos logo depois do
pagamento — é gasto pedindo para a pessoa esperar um e-mail e depois se virar.

## Decisão

Uma tela de onboarding em `/adm/comecar`, alcançada na primeira entrada no
painel, com dois passos e uma saída.

```
cria senha -> login -> /adm -> pendente? -> /adm/comecar
                                 |              |
                                 |        [deixar para depois]
                                 v              v
                              painel  <---------+
                              + bloco de progresso enquanto pendente
```

Não é obrigatório: "deixar para depois" leva ao painel e mantém um bloco de
progresso lá até a casa estar montada. Prender quem só queria dar uma olhada
troca um problema por outro, e quem travar num campo ficaria sem saída.

## O login passa a levar ADMIN para o painel

Sem isso o onboarding não é alcançado, porque a primeira parada depois do login
é a vitrine. Muda para todos os admins, não só os novos, e isso é deliberado: o
comportamento atual parece descuido, não decisão. Dono que faz login quer
gerenciar; para ver o cardápio como cliente ele abre o endereço, que é público e
não pede senha.

`callbackUrl` continua mandando quando existe — quem foi barrado numa página
específica volta para ela, não para o painel.

## Estado derivado, não flag

O sistema decide se o onboarding está pendente **olhando os dados**, não um
campo de controle:

- identidade pronta = `restaurant_info.address` preenchido
- cardápio pronto = existe ao menos um `MenuItem`

Uma flag explícita (`onboardingConcluido` no Tenant) seria mais simples de ler e
erraria mais: o dono que preenchesse tudo pelo caminho normal, sem passar pelo
onboarding, continuaria vendo "pendente" com a casa inteira montada. Derivar
resolve isso sozinho, e não custa migração.

O "deixar para depois" é a única coisa que precisa ser lembrada, e vira uma
linha em `Setting` (`onboarding_dispensado`), que já é o par chave-valor por
tenant, com `@@unique([tenantId, key])`. Também sem migração.

As duas condições entram em lugares diferentes de propósito:

| | redireciona para `/adm/comecar` | mostra o bloco no painel |
|---|---|---|
| pendente, não dispensado | sim | sim |
| pendente, dispensado | não | sim |
| pronto | não | não |

## Onde mora o redirecionamento

No Dashboard (`/adm/page.tsx`), que é Server Component, e **não no proxy**.

O proxy roda em toda requisição e já faz um `findUnique` de tenant; somar duas
consultas ali para uma tela que cada cliente vê uma vez na vida é caro no lugar
errado. E o efeito seria pior: quem digita `/adm/cardapio` direto seria
sequestrado no meio do caminho. Só quem chega na porta do painel é levado ao
onboarding.

A guarda de acesso continua sendo a do proxy, que já exige `role === "ADMIN"`
em todo `/adm` — `/adm/comecar` nasce protegida sem código novo.

## Os dois passos

**1. Sua casa** — logo, endereço e telefone. Salva em `/api/settings/restaurant`,
a mesma rota que o `RestaurantInfoControl` já usa.

**2. Seu primeiro item** — nome, preço e a categoria.

A categoria não é enfeite do passo: `/api/menu` exige `categoryId`, e
`provisionTenant` não cria categoria nenhuma. Um restaurante recém-nascido tem
zero, então o passo pede o nome da categoria ("Lanches", "Pizzas") e cria as
duas coisas, via `/api/categories` e depois `/api/menu`.

Nenhuma rota de API nova. As três já existem, já validam, e já exigem ADMIN.

## Por que só dois passos

Horário de funcionamento já nasce com um padrão razoável e não impede vender.
Bairros e fretes só importam para quem entrega, e nem todo restaurante entrega.
Formas de pagamento são a conversa mais longa de todas.

Os dois passos escolhidos são os únicos sem os quais a loja está quebrada
(endereço vazio na vitrine) ou vazia (nenhum item). Cada passo a mais é uma
chance de abandono no meio, e o que sobrar continua alcançável pelo painel, que
é onde essas coisas já moram.

## Fora de escopo

- **Avisar a equipe da Muno** quando alguém assina. O lead vai para `FECHADO` no
  provisionamento e some do funil, então ninguém fica sabendo que há cliente novo
  esperando. É um buraco real e é trabalho separado, decidido nesta mesma
  conversa.
- Conectar gateway de pagamento do restaurante.
- Qualquer mudança em `/adm/restaurante`, que continua sendo a tela de
  gerenciamento que é.

## Testes

A regra de "está pendente?" vira função pura, recebendo o que precisa por
parâmetro em vez de consultar o banco — mesma convenção de `checarSlug` em
`slug.ts` e de `escolhaDaQueryString` em `plans.ts`, e pelo mesmo motivo: é a
parte que precisa de teste, não a marcação em volta dela.

- a função de pendência, nas quatro combinações da tabela acima
- render dos dois passos: o que salvam e o que exigem antes de liberar
- o passo do cardápio cria categoria antes do item, e não tenta o item sozinho
- o Dashboard redireciona quando pendente e não dispensado, e não redireciona
  nos outros três casos
- o login leva ADMIN para `/adm`, e continua respeitando `callbackUrl`
