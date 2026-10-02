import bcrypt from "bcryptjs";
import crypto from "node:crypto";

/**
 * Gasta o tempo de um `bcrypt.compare` quando o e-mail não existe, para o
 * cronômetro não distinguir "conta inexistente" de "senha errada" (a diferença
 * é de ~200 ms e entrega quais contas existem).
 *
 * O hash de comparação é gerado uma vez por processo, na primeira necessidade,
 * em vez de ficar escrito no código: um hash bcrypt literal no repositório é o
 * que um varredor de segredos (e um leitor apressado) lê como credencial.
 */
let hashDescartavel: Promise<string> | undefined;

export async function gastarUmBcrypt(senha: string): Promise<void> {
  hashDescartavel ??= bcrypt.hash(crypto.randomBytes(16).toString("hex"), 12);
  await bcrypt.compare(senha, await hashDescartavel);
}
