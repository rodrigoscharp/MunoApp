import type { IconeDeCategoria } from "@/lib/loja/icone-da-categoria";

/**
 * Os ícones de categoria, em traço, no mesmo peso dos ícones da barra de baixo.
 * Desenhados aqui, e não tirados do lucide, porque o lucide não tem porção de
 * batata, açaí nem marmita, e misturar dois estilos de traço na mesma grade
 * aparece.
 */
const DESENHOS: Record<IconeDeCategoria, React.ReactNode> = {
  combo: (
    <>
      <path d="M4 8l8-4 8 4v9l-8 4-8-4z" />
      <path d="M4 8l8 4 8-4M12 12v9" />
    </>
  ),
  lanche: (
    <>
      <path d="M4 11a8 6 0 0 1 16 0z" />
      <path d="M3.5 14.5h17" />
      <path d="M4.5 17.5a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2z" />
    </>
  ),
  pizza: (
    <>
      <path d="M12 21L3.5 6.5a14 14 0 0 1 17 0z" />
      <circle cx="10" cy="10" r="1.2" />
      <circle cx="14" cy="12.5" r="1.2" />
      <circle cx="12" cy="16" r="1" />
    </>
  ),
  porcao: (
    <>
      <path d="M6 10l1.5 11h9L18 10z" />
      <path d="M8 10V4M11 10V3M14 10V4M16.5 10V6" />
    </>
  ),
  bebida: (
    <>
      <path d="M6 7h12l-1.5 14h-9z" />
      <path d="M12 7l2-4h3" />
      <path d="M6.6 12h10.8" />
    </>
  ),
  doce: (
    <>
      <path d="M6 11a6 5 0 0 1 12 0" />
      <path d="M5 11h14l-2 9H7z" />
      <path d="M12 4v2" />
    </>
  ),
  acai: (
    <>
      <path d="M5 10h14l-2 10H7z" />
      <path d="M7 10a5 4 0 0 1 10 0" />
      <path d="M15 4l-2 5" />
    </>
  ),
  salgado: (
    <>
      <path d="M12 4c4 4 7 8 7 11a7 5 0 0 1-14 0c0-3 3-7 7-11z" />
      <path d="M9 15h6" />
    </>
  ),
  prato: (
    <>
      <circle cx="12" cy="13" r="7" />
      <circle cx="12" cy="13" r="3.5" />
      <path d="M3 4v5M3 4c1.5 0 1.5 3 0 5M21 4v16" />
    </>
  ),
  salada: (
    <>
      <path d="M3 12h18a9 8 0 0 1-18 0z" />
      <path d="M9 12c-1-3 0-6 3-7 1 3 0 5-1 7M14 12c0-2 2-4 4-4 0 2-1 3-2 4" />
    </>
  ),
  japones: (
    <>
      <ellipse cx="12" cy="14" rx="8" ry="4" />
      <path d="M4 14v2a8 4 0 0 0 16 0v-2" />
      <path d="M5 4l9 7M9 3l7 8" />
    </>
  ),
  cafe: (
    <>
      <path d="M4 9h12v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z" />
      <path d="M16 11h1.5a2.5 2.5 0 0 1 0 5H16" />
      <path d="M8 3v3M12 3v3" />
    </>
  ),
  generico: (
    <>
      <path d="M4 15a8 8 0 0 1 16 0z" />
      <path d="M2.5 15h19M12 7V5" />
    </>
  ),
};

export function IconeDaCategoria({
  icone,
  className,
}: {
  icone: IconeDeCategoria;
  className?: string;
}) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {DESENHOS[icone]}
    </svg>
  );
}
