import { cn } from "@/lib/utils";

export type TomDoSelo = "novo" | "andamento" | "pronto" | "rua" | "alerta" | "neutro" | "pago";

const TONS: Record<TomDoSelo, string> = {
  novo: "bg-brand text-white",
  andamento: "bg-loja-pessego-claro text-[#8A3A12]",
  pronto: "bg-loja-folha text-forest-dark",
  rua: "bg-forest-dark text-white",
  alerta: "bg-[#5A2A14] text-[#FDBA8C]",
  neutro: "bg-[#EFE4D7] text-loja-tinta",
  pago: "bg-loja-folha text-forest-dark",
};

/** Pílula de status do painel. Os tons diferem em claridade, não só em matiz. */
export function Selo({ tom, children, className }: { tom: TomDoSelo; children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center whitespace-nowrap rounded-full px-2.5 text-[11.5px] font-extrabold",
        TONS[tom],
        className
      )}
    >
      {children}
    </span>
  );
}
