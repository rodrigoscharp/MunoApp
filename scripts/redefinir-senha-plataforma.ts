import "dotenv/config";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { prismaUnscoped } from "../src/lib/prisma";

/**
 * Redefine a senha de um admin de plataforma.
 *
 *   npm run platform:senha -- --email "x@y.com"                   mostra o alvo e sai
 *   npm run platform:senha -- --email "x@y.com" --confirmar "x@y.com"
 *   npm run platform:senha:prod -- --email "x@y.com" --confirmar "x@y.com"
 *
 * Existe porque não havia caminho de volta. `platform:create-admin` recusa
 * e-mail que já existe, e o console da plataforma não tem tela de "esqueci
 * minha senha" (a que existe é a dos restaurantes). Com um único admin
 * cadastrado, uma senha perdida trancava o console até alguém abrir o psql na
 * mão — que é justamente o que os outros scripts de produção existem para
 * evitar.
 *
 * A confirmação repete o e-mail, como em tenant:remove. O erro que ela pega é
 * o de redefinir a senha do admin errado num dia em que existam vários, e para
 * isso é preciso LER o nome na tela antes de digitar.
 */

// Sem 0/O e 1/l/I: esta senha vai ser digitada num teclado de celular, já que
// o console instala na tela inicial. Ambiguidade aqui não é elegância, é o
// motivo de a pessoa achar que errou a senha.
const ALFABETO = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
const GRUPOS = 4;
const POR_GRUPO = 5;

/**
 * 20 caracteres de um alfabeto de 57, agrupados: ~116 bits de entropia.
 *
 * `randomInt` e não `Math.random`: o segundo é previsível a partir de algumas
 * saídas, e uma senha de console não pode depender disso. O laço de rejeição
 * não é necessário porque randomInt já distribui uniformemente no intervalo.
 */
function gerarSenhaForte(): string {
  const grupo = () =>
    Array.from(
      { length: POR_GRUPO },
      () => ALFABETO[crypto.randomInt(ALFABETO.length)]
    ).join("");
  return Array.from({ length: GRUPOS }, grupo).join("-");
}

function argumento(nome: string): string | undefined {
  const i = process.argv.indexOf(`--${nome}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

async function main() {
  const email = argumento("email");
  const confirmar = argumento("confirmar");
  const senhaArg = argumento("senha");

  if (!email) {
    console.error(
      'Uso: npm run platform:senha -- --email "x@y.com" --confirmar "x@y.com"'
    );
    process.exit(1);
  }

  const alvo = await prismaUnscoped.platformAdmin.findUnique({
    where: { email },
    // Nunca selecionamos password: não há o que ler ali (é hash bcrypt) e não
    // há motivo para o valor passar perto de um log.
    select: { id: true, nome: true, email: true, createdAt: true },
  });

  if (!alvo) {
    console.error(`Nenhum admin de plataforma com o e-mail ${email}.`);
    process.exit(1);
  }

  const host = new URL(process.env.DATABASE_URL ?? "postgres://local").hostname;
  console.log(`\n  Banco: ${host}`);
  console.log(`  Admin: ${alvo.nome} <${alvo.email}>`);
  console.log(`  Criado em: ${alvo.createdAt.toISOString().slice(0, 10)}\n`);

  if (confirmar !== email) {
    console.log("Nada foi alterado.");
    console.log(
      `Para trocar a senha, repita o e-mail: --confirmar "${email}"\n`
    );
    return;
  }

  const senha = senhaArg ?? gerarSenhaForte();
  await prismaUnscoped.platformAdmin.update({
    where: { id: alvo.id },
    data: { password: await bcrypt.hash(senha, 12) },
  });

  console.log("Senha redefinida.\n");
  console.log(`  Email: ${alvo.email}`);
  console.log(`  Senha: ${senha}\n`);
  console.log("Guarde no gerenciador de senhas. Ela não é recuperável depois:");
  console.log("o banco guarda só o hash bcrypt.\n");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prismaUnscoped.$disconnect());
