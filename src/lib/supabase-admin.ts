import { createClient, SupabaseClient } from "@supabase/supabase-js";

// Inicialização lazy — o cliente só é criado na primeira chamada,
// evitando falha de build quando as env vars não estão presentes
let _client: SupabaseClient | null = null;

function getClient(): SupabaseClient {
  if (!_client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !key) {
      throw new Error(
        "Supabase env vars ausentes: NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórias."
      );
    }

    _client = createClient(url, key);
  }
  return _client;
}

// Proxy mantém a API existente (supabaseAdmin.storage, supabaseAdmin.from, etc.)
// mas adia a criação do cliente até o primeiro uso em runtime
export const supabaseAdmin = new Proxy({} as SupabaseClient, {
  get(_target, prop: string) {
    const client = getClient();
    const value = (client as unknown as Record<string, unknown>)[prop];
    return typeof value === "function"
      ? (value as (...args: unknown[]) => unknown).bind(client)
      : value;
  },
});
