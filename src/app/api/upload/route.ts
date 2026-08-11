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

  const formData = await req.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json({ error: "Nenhum arquivo enviado" }, { status: 400 });
  }

  const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
  if (!allowedTypes.includes(file.type)) {
    return NextResponse.json({ error: "Tipo de arquivo não permitido" }, { status: 400 });
  }

  if (file.size > 5 * 1024 * 1024) {
    return NextResponse.json({ error: "Arquivo muito grande (máx. 5MB)" }, { status: 400 });
  }

  const ext = file.name.split(".").pop();
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
