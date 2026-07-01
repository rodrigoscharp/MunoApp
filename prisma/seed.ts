import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding database...");

  const tenant = await prisma.tenant.upsert({
    where: { slug: "default" },
    update: {},
    create: { nome: "Muno Food Restaurante", slug: "default" },
  });
  const tenantId = tenant.id;

  const adminPassword = await bcrypt.hash("admin123", 12);
  await prisma.user.upsert({
    where: { tenantId_email: { tenantId, email: "admin@muno.com" } },
    update: {},
    create: { tenantId, name: "Administrador", email: "admin@muno.com", password: adminPassword, role: "ADMIN" },
  });

  const kitchenPassword = await bcrypt.hash("cozinha123", 12);
  await prisma.user.upsert({
    where: { tenantId_email: { tenantId, email: "cozinha@muno.com" } },
    update: {},
    create: { tenantId, name: "Cozinha", email: "cozinha@muno.com", password: kitchenPassword, role: "KITCHEN" },
  });

  const lanches = await prisma.category.upsert({
    where: { tenantId_slug: { tenantId, slug: "lanches" } },
    update: {},
    create: { tenantId, name: "Lanches", slug: "lanches", position: 1 },
  });

  const porcoes = await prisma.category.upsert({
    where: { tenantId_slug: { tenantId, slug: "porcoes" } },
    update: {},
    create: { tenantId, name: "Porções", slug: "porcoes", position: 2 },
  });

  const bebidas = await prisma.category.upsert({
    where: { tenantId_slug: { tenantId, slug: "bebidas" } },
    update: {},
    create: { tenantId, name: "Bebidas", slug: "bebidas", position: 3 },
  });

  const items = [
    { name: "X-Burguer", description: "Pão brioche, hambúrguer 150g, queijo, alface e tomate", price: 22.9, categoryId: lanches.id },
    { name: "X-Bacon", description: "Pão brioche, hambúrguer 150g, queijo, bacon crocante e maionese", price: 26.9, categoryId: lanches.id },
    { name: "X-Tudo", description: "Pão brioche, hambúrguer 150g, ovo, queijo, bacon, alface e tomate", price: 31.9, categoryId: lanches.id },
    { name: "Batata Frita P", description: "Porção pequena de batata frita crocante (200g)", price: 14.9, categoryId: porcoes.id },
    { name: "Batata Frita G", description: "Porção grande de batata frita crocante (400g)", price: 22.9, categoryId: porcoes.id },
    { name: "Onion Rings", description: "Anéis de cebola empanados e fritos (200g)", price: 18.9, categoryId: porcoes.id },
    { name: "Refrigerante Lata", description: "Coca-Cola, Guaraná ou Sprite 350ml", price: 6.9, categoryId: bebidas.id },
    { name: "Suco Natural", description: "Laranja, limão ou maracujá 400ml", price: 9.9, categoryId: bebidas.id },
    { name: "Água Mineral", description: "500ml com ou sem gás", price: 4.9, categoryId: bebidas.id },
  ];

  for (const item of items) {
    await prisma.menuItem.create({ data: { ...item, tenantId } });
  }

  console.log("✓ Seed concluído!");
  console.log("  Admin:   admin@muno.com / admin123");
  console.log("  Cozinha: cozinha@muno.com / cozinha123");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
