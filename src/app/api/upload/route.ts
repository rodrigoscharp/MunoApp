import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { authPlatform } from "@/lib/auth-platform";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function POST(req: NextRequest) {
  const tenantSession = await auth();
  if (tenantSession?.user.role !== "ADMIN") {
    const platformSession = await authPlatform();
    if (!platformSession?.user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 403 });
    }
  }

  // formData() lança TypeError quando o Content-Type não é multipart. Sem esta
  // guarda o erro subia e a rota respondia 500 — um pedido malformado
  // registrado como falha do servidor, no log junto com as falhas de verdade.
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "Envie o arquivo como multipart/form-data" },
      { status: 400 }
    );
  }

  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json({ error: "Nenhum arquivo enviado" }, { status: 400 });
  }

  // A extensão sai DAQUI, do tipo já validado — nunca do nome enviado. Antes
  // era `file.name.split(".").pop()`: o cliente escolhia o sufixo do arquivo
  // gravado no bucket (ou nenhum, e o nome terminava em ".undefined"), e o
  // Content-Type declarado não tinha relação nenhuma com ele.
  const EXTENSAO_POR_TIPO: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
  };

  const ext = EXTENSAO_POR_TIPO[file.type];
  if (!ext) {
    return NextResponse.json({ error: "Tipo de arquivo não permitido" }, { status: 400 });
  }

  if (file.size > 5 * 1024 * 1024) {
    return NextResponse.json({ error: "Arquivo muito grande (máx. 5MB)" }, { status: 400 });
  }

  const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const { error } = await supabaseAdmin.storage
    .from("product-images")
    .upload(filename, buffer, { contentType: file.type, upsert: false });

  if (error) {
    console.error("Storage error:", error);
    return NextResponse.json({ error: "Erro ao fazer upload" }, { status: 500 });
  }

  const { data } = supabaseAdmin.storage
    .from("product-images")
    .getPublicUrl(filename);

  return NextResponse.json({ url: data.publicUrl });
}
