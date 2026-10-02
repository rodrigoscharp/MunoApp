/**
 * Restrição do console da plataforma por IP.
 *
 * `permitidos` é a lista da variável PLATFORM_ALLOWED_IPS (separada por
 * vírgula). Vazia ou ausente = sem restrição. O IP vem do primeiro valor de
 * x-forwarded-for: a Vercel o sobrescreve na borda, então o primeiro é o IP
 * público do cliente e não um valor que ele escolha.
 *
 * Com a lista definida e sem IP na requisição, nega: quem não se identifica
 * não entra.
 */
export function ipPermitidoNoConsole(
  xForwardedFor: string | null,
  permitidos: string | undefined
): boolean {
  const lista = (permitidos ?? "")
    .split(",")
    .map((ip) => ip.trim())
    .filter(Boolean);
  if (lista.length === 0) return true;

  const ip = (xForwardedFor ?? "").split(",")[0].trim();
  return ip !== "" && lista.includes(ip);
}
