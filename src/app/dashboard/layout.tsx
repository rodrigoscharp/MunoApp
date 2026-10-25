import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { fontesDaLoja } from "@/lib/loja/fontes";

/**
 * O invólucro da cozinha: só a guarda de papel, as fontes e o fundo creme. O
 * topo (COZINHA, restaurante, tempo real, som, relógio) mora no próprio
 * quadro, porque metade dele é estado de cliente: o canal e o alarme.
 */
export default async function KitchenLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (
    !session ||
    (session.user.role !== "ADMIN" && session.user.role !== "KITCHEN")
  ) {
    // Com o callbackUrl, quem entra pela tela de login volta ao quadro, e não
    // ao destino padrão do papel.
    redirect(`/login?callbackUrl=${encodeURIComponent("/dashboard")}`);
  }

  return (
    <div className={`loja ${fontesDaLoja} min-h-screen`}>
      {/* Sem padding no topo: o cabeçalho do quadro é sticky e traz o próprio. */}
      <main className="px-4 pb-6 sm:px-6">{children}</main>
    </div>
  );
}
