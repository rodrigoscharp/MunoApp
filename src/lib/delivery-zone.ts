import { z } from "zod";

// O corpo destas rotas ia direto para o `data` do Prisma com um `as` de
// TypeScript no caminho — que não existe em runtime. Como tenantId é campo do
// modelo DeliveryZone, ele passava: bastava mandá-lo no PATCH para mover a
// zona de entrega para outro restaurante, onde ela passava a valer no checkout
// de quem nunca a cadastrou. A extensão de tenant escopa o `where`, nunca o
// `data` — o mesmo motivo do cuidado com categoryId em menu/[id]/route.ts.
//
// O schema resolve as duas coisas de uma vez: derruba campo que não pertence
// ao formulário e garante que preço é número não-negativo, em vez de aceitar o
// que o cliente mandar.

export const deliveryZoneCreateSchema = z.object({
  name: z.string().trim().min(1, "Informe o nome do bairro"),
  price: z.number().nonnegative("O preço não pode ser negativo"),
});

// Todos opcionais: o PATCH é parcial, e o mapa de mesas manda só `active`.
export const deliveryZoneUpdateSchema = z.object({
  name: z.string().trim().min(1, "Informe o nome do bairro").optional(),
  price: z.number().nonnegative("O preço não pode ser negativo").optional(),
  active: z.boolean().optional(),
});
