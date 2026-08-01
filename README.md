# Muno V2 — Plataforma de Pedidos e Delivery

> "Bateu fome né?" — Sistema completo de gestão de restaurante com delivery, cardápio digital, rastreamento em tempo real e IA integrada.

---

## Visão Geral

O **Muno V2** é uma plataforma full-stack para restaurantes que cobre toda a jornada do pedido: do cardápio digital com recomendações por IA até a entrega com rastreamento GPS em tempo real.

### Funcionalidades por perfil

| Perfil | Funcionalidades |
|--------|-----------------|
| **Cliente** | Navegar cardápio, chat com IA para recomendações, carrinho, checkout, pagamento via PIX/Cartão/Dinheiro, rastrear pedido |
| **Cliente na mesa** | Escaneia o QR Code, pede sem login, acompanha a conta em tempo real |
| **Admin** | Dashboard com métricas, gerenciar cardápio/categorias, pedidos, mesas (status livre/em aberto, fechar conta), motoboys, zonas de entrega, horários, configurações |
| **Cozinha** | Visualizar fila de pedidos (com número da mesa) e atualizar status de preparo |
| **Motoboy** | Aceitar entregas, atualizar localização GPS em tempo real, finalizar entrega |

### Destaques

- **IA no Cardápio** — Assistente "Muno" powered by Groq LLaMA 3.3 70B que entende restrições alimentares, nível de fome e sugere itens automaticamente
- **QR Code para Mesas** — Cada mesa tem token único; cliente escaneia, faz pedido sem login e acompanha a própria conta
- **Gestão de Mesas no Admin** — cards com flag de status (livre/em aberto), quantidade de pedidos e total em aberto por mesa
- **Fechar Conta** — agrupa os pedidos por cliente, permite 10% de serviço opcional, divide o pagamento em múltiplas formas (Pix/Cartão/Dinheiro) e imprime o recibo
- **Rastreamento em Tempo Real** — Mapa Leaflet com atualização de GPS do motoboy
- **Pagamentos Integrados** — PIX (QR Code), Cartão de Crédito (Mercado Pago) e Dinheiro

---

## Stack Tecnológica

- **Framework:** Next.js 16 (App Router) + React 19
- **Linguagem:** TypeScript 6
- **Estilização:** Tailwind CSS 4
- **Banco de Dados:** PostgreSQL via Supabase
- **ORM:** Prisma 6
- **Autenticação:** NextAuth v5 (JWT + Credentials)
- **Estado:** Zustand
- **Formulários/Validação:** React Hook Form + Zod
- **Pagamentos:** Mercado Pago SDK
- **E-mail:** Resend
- **IA:** Groq API (LLaMA 3.3 70B)
- **Mapas:** Leaflet + React Leaflet
- **Gráficos:** Recharts
- **Armazenamento de Imagens:** Supabase Storage
- **Deploy:** Vercel (região São Paulo)

---

## Estrutura do Projeto

```
src/
├── app/
│   ├── api/                    # API Routes (REST)
│   │   ├── ai/                 # Recomendações via Groq
│   │   ├── auth/               # Registro, reset de senha
│   │   ├── categories/
│   │   ├── delivery-zones/
│   │   ├── menu/
│   │   ├── motoboy/orders/
│   │   ├── orders/
│   │   ├── payments/           # Mercado Pago + webhook
│   │   ├── settings/
│   │   ├── tables/
│   │   └── users/motoboys/
│   ├── (client)/               # Páginas do cliente
│   │   ├── login/ register/
│   │   ├── cart/ checkout/
│   │   ├── pedidos/            # Histórico de pedidos
│   │   ├── track/[orderId]/    # Rastreamento
│   │   └── esqueci-senha/ redefinir-senha/
│   ├── adm/                    # Painel administrativo
│   │   ├── menu/ orders/ mesas/ motoboys/ restaurante/
│   ├── mesa/[token]/           # Experiência de mesa (QR Code)
│   │   ├── cardapio/ checkout/ pedido/[orderId]/
│   ├── motoboy/                # Páginas do entregador
│   │   └── login/ pedidos/ delivery/[orderId]/
│   └── dashboard/               # Painel da cozinha (KDS)
├── components/
│   ├── adm/                    # Componentes do painel admin
│   ├── menu/                   # Cardápio + IA Assistant
│   ├── kitchen/                 # Kanban de pedidos (usado por app/dashboard)
│   └── cart/ checkout/ tracking/ motoboy/ mesa/ auth/ chat/
├── hooks/                      # useCart, useKitchenOrders, useDeliveryTracking...
├── lib/                        # auth, prisma, supabase, mercadopago, resend...
└── types/                      # Tipos compartilhados (OrderStatus, Role, etc.)
prisma/
├── schema.prisma               # Schema do banco (9 modelos)
└── seed.ts                     # Dados de demonstração
```

---

## Banco de Dados

Principais modelos Prisma:

- **User** — roles: `CUSTOMER`, `ADMIN`, `KITCHEN`, `MOTOBOY`
- **Order** — status: `PENDING → CONFIRMED → IN_PREPARATION → READY → OUT_FOR_DELIVERY → DELIVERED/CANCELLED`
- **MenuItem** / **Category**
- **OrderItem** — com campo `notes` para customizações
- **Table** — token único para QR Code; pedidos em aberto definem se está livre ou ocupada
- **Payment** — formas de pagamento usadas no fechamento de conta de uma mesa
- **ChatMessage** — chat por pedido entre cliente e admin
- **DeliveryTracking** — lat/lng em tempo real
- **DeliveryZone** — zonas com preços distintos
- **Setting** — configurações chave-valor do restaurante
- **PasswordResetToken**

---

## Instalação e Configuração

### Pré-requisitos

- Node.js 20+
- Conta no Supabase (banco + storage)
- Conta no Mercado Pago (payments)
- Conta no Resend (e-mails)
- Conta no Groq (IA)

### 1. Clone e instale dependências

```bash
git clone <repo-url>
cd Muno-V2
npm install
```

O `postinstall` gera o cliente Prisma e aplica fixes de build automaticamente.

### 2. Configure as variáveis de ambiente

Copie o arquivo de exemplo e preencha com suas credenciais:

```bash
cp .env.example .env
```

```env
# Banco de dados (Supabase)
DATABASE_URL="postgresql://postgres:[SENHA]@db.[PROJETO].supabase.co:5432/postgres"
DIRECT_URL="postgresql://postgres:[SENHA]@db.[PROJETO].supabase.co:5432/postgres"

# Supabase (armazenamento de imagens)
NEXT_PUBLIC_SUPABASE_URL="https://[PROJETO].supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY=""
SUPABASE_SERVICE_ROLE_KEY=""

# Autenticação
NEXTAUTH_SECRET=""        # gerar com: openssl rand -base64 32
NEXTAUTH_URL="http://localhost:3000"

# Pagamentos (Mercado Pago)
MERCADOPAGO_ACCESS_TOKEN=""
MERCADOPAGO_WEBHOOK_SECRET=""

# E-mail (Resend)
RESEND_API_KEY=""

# IA (Groq — tier gratuito: 14.400 req/dia)
GROQ_API_KEY=""

# URL da aplicação
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

### 3. Configure o banco de dados

```bash
# Aplicar schema
npm run db:push

# (Opcional) Popular com dados de demonstração
npm run db:seed
```

### 4. Inicie o servidor

```bash
npm run dev
```

Acesse [http://localhost:3000](http://localhost:3000).

---

## Scripts Disponíveis

```bash
npm run dev          # Servidor de desenvolvimento
npm run build        # Build de produção
npm run start        # Servidor de produção
npm run lint         # Verificação ESLint

npm run db:migrate   # Criar e aplicar migrations
npm run db:push      # Push do schema sem migration (dev)
npm run db:seed      # Popular banco com dados demo
npm run db:studio    # Abrir Prisma Studio (localhost:5555)
```

---

## Fluxo de Autenticação

1. Registro via `POST /api/auth/register` (senha hasheada com bcrypt, custo 12)
2. Login com e-mail + senha via NextAuth Credentials
3. JWT com `id` e `role` do usuário
4. Rotas protegidas verificam `session?.user?.role`
5. Recuperação de senha via e-mail (Resend + token temporário)

---

## Integrações

| Serviço | Finalidade |
|---------|-----------|
| **Supabase** | PostgreSQL gerenciado + armazenamento de imagens |
| **Mercado Pago** | PIX (QR Code) e Cartão de Crédito |
| **Resend** | E-mails transacionais (reset de senha) |
| **Groq** | LLM para o assistente de cardápio (gratuito) |
| **Leaflet / OSM** | Mapas de rastreamento de entrega |

---

## Deploy

O projeto está configurado para deploy no **Vercel** (região `gru1` — São Paulo):

```bash
npm run build
```

Configure todas as variáveis de ambiente no painel da Vercel antes do deploy. O webhook do Mercado Pago deve apontar para `https://[seu-dominio]/api/payments/webhook`.

---

## Licença

Projeto privado — todos os direitos reservados.
