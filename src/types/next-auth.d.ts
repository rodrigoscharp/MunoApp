import "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      // Opcionais porque a sessão da plataforma (src/lib/auth-platform.ts) só
      // preenche id/email: declará-los obrigatórios fazia session.user.tenantId
      // compilar no código de plataforma e ser undefined em runtime, escondendo
      // justamente a distinção em que o modelo de segurança se apoia.
      role?: string;
      tenantId?: string;
    };
  }

  interface User {
    role?: string;
    tenantId?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    role?: string;
    tenantId?: string;
  }
}
