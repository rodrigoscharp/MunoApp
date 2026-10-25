/**
 * O raminho desenhado em traço que aparece atrás do banner, do produto e do
 * topo do acompanhamento. Decoração pura: escondido de leitor de tela.
 */
export function Raminho({
  className,
  cheio = false,
}: {
  className?: string;
  /** Folhas preenchidas (sobre fundo claro de foto) ou só o contorno. */
  cheio?: boolean;
}) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 120 120"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      className={className}
    >
      <path d="M20 100C45 70 70 45 104 18" />
      <path
        d="M44 74c-10-16-6-30 6-36 6 14 2 28-6 36zM62 56c-4-18 4-30 18-32 2 16-6 26-18 32zM32 88c-18-4-26-16-24-28 16 0 24 12 24 28z"
        fill={cheio ? "currentColor" : "none"}
      />
    </svg>
  );
}
