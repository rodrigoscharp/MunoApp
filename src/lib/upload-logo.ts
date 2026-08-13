export async function uploadLogo(file: File): Promise<string> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch("/api/upload", { method: "POST", body: fd });
  if (!res.ok) {
    throw new Error("Erro ao enviar imagem");
  }
  const { url } = (await res.json()) as { url: string };
  return url;
}
