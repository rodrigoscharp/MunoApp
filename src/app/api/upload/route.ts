import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { authPlatform } from "@/lib/auth-platform";
import { supabaseAdmin } from "@/lib/supabase-admin";
import sharp from "sharp";

// Largura máxima gravada. O cardápio mostra a imagem em poucas centenas de
// pixels; guardar o original de 5 MB só multiplica armazenamento e tráfego.
const LARGURA_MAXIMA = 1280;
// Contra "bomba de descompressão": PNG pequeno em bytes e enorme em pixels.
const PIXELS_MAXIMOS = 50_000_000;

export async function POST(req: NextRequest) {
  const tenantSession = await auth();
  // Pasta do dono no bucket. Upload de plataforma não tem tenant.
  let pasta = "plataforma";
  if (tenantSession?.user.role === "ADMIN" && tenantSession.user.tenantId) {
    pasta = tenantSession.user.tenantId;
  }
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

  // O tipo declarado só decide se vale a pena tentar: o que vale é o conteúdo.
  const TIPOS_ACEITOS = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
  if (!TIPOS_ACEITOS.has(file.type)) {
    return NextResponse.json({ error: "Tipo de arquivo não permitido" }, { status: 400 });
  }

  if (file.size > 5 * 1024 * 1024) {
    return NextResponse.json({ error: "Arquivo muito grande (máx. 5MB)" }, { status: 400 });
  }

  // Decodifica e regrava como WebP. Quem não for imagem de verdade falha aqui
  // (400), e o que sai é sempre um WebP gerado por nós, sem EXIF/GPS e sem
  // nada que o cliente tenha embutido. Nome e extensão saem do resultado, não
  // do que foi enviado.
  let buffer: Buffer;
  try {
    buffer = await sharp(Buffer.from(await file.arrayBuffer()), {
      limitInputPixels: PIXELS_MAXIMOS,
      animated: file.type === "image/gif",
    })
      .rotate()
      .resize({ width: LARGURA_MAXIMA, withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer();
  } catch {
    return NextResponse.json({ error: "O arquivo não é uma imagem válida" }, { status: 400 });
  }

  const filename = `${pasta}/${Date.now()}-${Math.random().toString(36).slice(2)}.webp`;

  const { error } = await supabaseAdmin.storage
    .from("product-images")
    .upload(filename, buffer, { contentType: "image/webp", upsert: false });

  if (error) {
    console.error("Storage error:", error);
    return NextResponse.json({ error: "Erro ao fazer upload" }, { status: 500 });
  }

  const { data } = supabaseAdmin.storage
    .from("product-images")
    .getPublicUrl(filename);

  return NextResponse.json({ url: data.publicUrl });
}
