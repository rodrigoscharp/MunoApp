import { prismaUnscoped } from "@/lib/prisma";
import { getResend } from "@/lib/resend";
import { buildTenantBaseUrl } from "@/lib/tenant-provisioning";

/**
 * Sete dias, e não a uma hora do "esqueci a senha" (ver
 * src/app/api/auth/forgot-password/route.ts).
 *
 * Aquela é curta porque a pessoa acabou de pedir e está na frente da tela,
 * pronta para usar o link em minutos. Esta precisa sobreviver a quem paga
 * meia-noite e só lê o e-mail de manhã — um link expirado aqui não é
 * inconveniência, é um cliente que pagou e não consegue entrar.
 */
const VALIDADE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Escapa as cinco entidades HTML. `nome` e `email` chegam aqui a partir do
 * que o cliente digitou no checkout (`Inscricao.nome`/`.email`, texto livre
 * validado só por tamanho — ver o schema de `/api/assinar`), e vão direto
 * para dentro de tags. Sem isto, um restaurante chamado `Bar do "Zé" <Centro>`
 * quebra a marcação do e-mail, e um nome deliberadamente malformado injeta
 * conteúdo HTML numa mensagem que sai com o remetente da Muno.
 */
function escapeHtml(valor: string): string {
  return valor
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * `subject` não é HTML — escapar entidades ali não protege nada. O risco em
 * campo de cabeçalho de e-mail é outro: uma quebra de linha no valor
 * interpolado permite injetar um cabeçalho novo (ex.: um segundo `Bcc:`).
 * Remover `\r` e `\n` fecha essa porta sem mexer no resto do texto.
 */
function paraAssunto(valor: string): string {
  return valor.replace(/[\r\n]+/g, " ");
}

/**
 * E-mail de boas-vindas enviado depois que o pagamento confirma e o
 * restaurante é provisionado. É a única coisa que o cliente recebe depois
 * de pagar — se este envio falhar, ele pagou e não tem como entrar.
 *
 * Leva um LINK para o cliente criar a própria senha, nunca a senha em si.
 * O caminho manual (ConverterLead.tsx) gera a senha e mostra uma vez na
 * tela, porque ela "não é recuperável depois" — mandá-la por e-mail a
 * faria viver para sempre numa caixa de entrada, e criaria um desfecho sem
 * saída: um envio que falhasse depois do tenant já criado deixaria uma
 * credencial que ninguém mais tem. Com link de criação, um envio que falha
 * é só reenviar — o token continua válido, gravado no banco.
 */
export async function enviarBoasVindas(input: {
  tenantId: string;
  slug: string;
  email: string;
  nome: string;
}): Promise<void> {
  const token = await prismaUnscoped.passwordResetToken.create({
    data: {
      tenantId: input.tenantId,
      email: input.email,
      expiresAt: new Date(Date.now() + VALIDADE_MS),
    },
  });

  // buildTenantBaseUrl monta a URL a partir da ÚLTIMA entrada de
  // ROOT_DOMAIN, o domínio nu do qual os restaurantes pendem — o link
  // precisa cair no host do restaurante, não no da plataforma, senão o
  // token chega numa origem onde a sessão dele não vale.
  const base = buildTenantBaseUrl(input.slug);
  const link = `${base}/redefinir-senha?token=${token.token}`;

  const nome = escapeHtml(input.nome);
  const email = escapeHtml(input.email);

  await getResend().emails.send({
    // Remetente fixo da Muno, e não process.env.RESEND_FROM_EMAIL (a
    // convenção de forgot-password): aquele e-mail é disparado em nome do
    // restaurante (é o restaurante "esquecendo a senha" do próprio
    // funcionário), enquanto este é a própria plataforma se apresentando a
    // um cliente que acabou de assinar — não faz sentido variar por
    // configuração de ambiente/tenant.
    from: "Muno <contato@munoapp.com.br>",
    to: input.email,
    subject: `A Muno do ${paraAssunto(input.nome)} está no ar`,
    html: `
      <h1>Bem-vindo à Muno, ${nome}!</h1>
      <p>Seu restaurante já está no ar em <a href="${base}">${base}</a>.</p>
      <p>Seu login é <strong>${email}</strong>. Crie sua senha para entrar:</p>
      <p><a href="${link}"
            style="background:#D4612A;color:#fff;padding:12px 24px;border-radius:12px;text-decoration:none;display:inline-block">
        Criar minha senha
      </a></p>
      <p style="color:#666;font-size:13px">Este link vale por 7 dias.</p>
    `,
  });
}
