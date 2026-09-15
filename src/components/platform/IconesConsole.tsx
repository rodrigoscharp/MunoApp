/**
 * Os ícones da barra lateral, no traço do Core 2.0.
 *
 * Desenhados aqui, e não tirados do lucide, porque os do Core têm formas que o
 * lucide não tem (a grade de quatro círculos, a carteira inclinada) e um traço
 * de 1,6 com cantos bem redondos. Misturar os dois conjuntos na mesma coluna
 * faz a diferença de peso aparecer justamente onde o olho compara.
 */

type Props = { size?: number; className?: string };

function Base({
  size = 22,
  className,
  children,
}: Props & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
    >
      {children}
    </svg>
  );
}

export function IconeGrade(props: Props) {
  return (
    <Base {...props}>
      <circle cx="7" cy="7" r="3.25" />
      <circle cx="17" cy="7" r="3.25" />
      <circle cx="7" cy="17" r="3.25" />
      <circle cx="17" cy="17" r="3.25" />
    </Base>
  );
}

export function IconePessoa(props: Props) {
  return (
    <Base {...props}>
      <circle cx="12" cy="8" r="3.75" />
      <path d="M5 19.25c0-2.35 1.9-4.25 4.25-4.25h5.5c2.35 0 4.25 1.9 4.25 4.25v0c0 .97-.78 1.75-1.75 1.75H6.75C5.78 21 5 20.22 5 19.25Z" />
    </Base>
  );
}

export function IconeGrafico(props: Props) {
  return (
    <Base {...props}>
      <rect x="3" y="4" width="18" height="16" rx="4" />
      <path d="m7 15 3.2-3.6 2.8 2.4L17 9" />
    </Base>
  );
}

export function IconeLoja(props: Props) {
  return (
    <Base {...props}>
      <path d="M4 9.5c0-1.93 1.57-3.5 3.5-3.5h9C18.43 6 20 7.57 20 9.5v7c0 1.93-1.57 3.5-3.5 3.5h-9A3.5 3.5 0 0 1 4 16.5v-7Z" />
      <path d="M5 7.2 14.6 4.1c1.3-.42 2.7.3 3.1 1.6l.2.7" />
      <path d="M4 11h16" />
    </Base>
  );
}

export function IconeSelo(props: Props) {
  return (
    <Base {...props}>
      <path d="M10.3 3.2a2.4 2.4 0 0 1 3.4 0l.9.9c.45.45 1.06.7 1.7.7h1.2A2.4 2.4 0 0 1 19.9 7.2v1.2c0 .64.25 1.25.7 1.7l.9.9a2.4 2.4 0 0 1 0 3.4l-.9.9c-.45.45-.7 1.06-.7 1.7v1.2a2.4 2.4 0 0 1-2.4 2.4h-1.2c-.64 0-1.25.25-1.7.7l-.9.9a2.4 2.4 0 0 1-3.4 0l-.9-.9a2.4 2.4 0 0 0-1.7-.7H6.5a2.4 2.4 0 0 1-2.4-2.4v-1.2c0-.64-.25-1.25-.7-1.7l-.9-.9a2.4 2.4 0 0 1 0-3.4l.9-.9c.45-.45.7-1.06.7-1.7V7.2A2.4 2.4 0 0 1 6.5 4.8h1.2c.64 0 1.25-.25 1.7-.7l.9-.9Z" />
    </Base>
  );
}

export function IconeChevron(props: Props) {
  return (
    <Base {...props}>
      <path d="m7 10 5 5 5-5" />
    </Base>
  );
}
