import "dotenv/config";
import bcrypt from "bcryptjs";
import { prismaUnscoped } from "../src/lib/prisma";
import { gerarSenha } from "../src/lib/tenant-provisioning";

async function main() {
  const [nome, email, senhaArg] = process.argv.slice(2);

  if (!nome || !email) {
    console.error(
      'Uso: npm run platform:create-admin -- "Rodrigo Scharp" "rodrigo@munoapp.com.br" [senha]'
    );
    process.exit(1);
  }

  const existing = await prismaUnscoped.platformAdmin.findUnique({
    where: { email },
  });
  if (existing) {
    console.error(`Já existe um admin de plataforma com o e-mail ${email}.`);
    process.exit(1);
  }

  const senha = senhaArg ?? gerarSenha();
  const admin = await prismaUnscoped.platformAdmin.create({
    data: { nome, email, password: await bcrypt.hash(senha, 12) },
  });

  console.log("\nAdmin de plataforma criado!\n");
  console.log(`  Nome:  ${admin.nome}`);
  console.log(`  Email: ${admin.email}`);
  console.log(`  Senha: ${senha}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prismaUnscoped.$disconnect());
