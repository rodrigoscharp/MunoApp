import { auth } from "@/lib/auth";
import { prismaUnscoped } from "@/lib/prisma";
import { getRestaurantInfo } from "@/lib/restaurant";
import { Comecar } from "@/components/adm/Comecar";

/**
 * O onboarding de quem acabou de comprar, alcançado na primeira entrada no
 * painel (ver o redirecionamento em src/app/adm/page.tsx).
 *
 * A guarda de acesso é a do proxy, que já exige role === "ADMIN" em todo
 * /adm: a rota nasce protegida sem código novo aqui. Repetir a checagem seria
 * uma segunda fonte de verdade para a mesma regra.
 *
 * O estado vem dos dados, não de flag, então esta página é sempre correta
 * mesmo que a pessoa tenha preenchido tudo por outro caminho no meio do
 * processo.
 */
export default async function ComecarPage() {
  const session = await auth();
  // tenantId é opcional no tipo Session (a sessão de plataforma não tem um);
  // aqui o proxy já garantiu um ADMIN de tenant antes de a página rodar.
  const tenantId = session!.user.tenantId!;

  const [info, itens] = await Promise.all([
    getRestaurantInfo(tenantId),
    prismaUnscoped.menuItem.count({ where: { tenantId } }),
  ]);

  return (
    <Comecar
      nomeRestaurante={info.name}
      enderecoPreenchido={info.address.trim().length > 0}
      temItem={itens > 0}
    />
  );
}
