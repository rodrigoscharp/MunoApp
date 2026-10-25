"use client";

import { useEffect, useState } from "react";
import { useForm, type UseFormRegister } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { X, Upload, Wand2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { booleanParaTri, triParaBoolean } from "@/lib/restricoes";
import type { EtapaDoRecorte } from "@/lib/loja/remover-fundo";

// `.catch("nd")`: valor que não seja exatamente um dos três cai em "Não
// informado". Falhar a validação aqui travaria o botão sem mensagem nenhuma, e
// coagir para "Não" afirmaria algo que o dono não disse.
const triEstado = z.enum(["sim", "nao", "nd"]).catch("nd");

const schema = z.object({
  name: z.string().min(1, "Nome obrigatório"),
  description: z.string().optional(),
  price: z.string().refine((v) => !isNaN(Number(v)) && Number(v) > 0, "Preço deve ser positivo"),
  imageUrl: z.string().url("URL inválida").optional().or(z.literal("")),
  imagemRecortadaUrl: z.string().optional().or(z.literal("")),
  available: z.boolean(),
  categoryId: z.string().min(1, "Selecione uma categoria"),
  containsGluten: triEstado,
  containsLactose: triEstado,
  isVegan: triEstado,
});

type FormData = z.infer<typeof schema>;

interface MenuItem {
  id: string;
  name: string;
  description: string | null;
  price: number;
  imageUrl: string | null;
  imagemRecortadaUrl?: string | null;
  available: boolean;
  categoryId: string;
  containsGluten?: boolean | null;
  containsLactose?: boolean | null;
  isVegan?: boolean | null;
}

const OPCOES_ALIMENTARES = [
  { valor: "sim", rotulo: "Sim" },
  { valor: "nao", rotulo: "Não" },
  { valor: "nd", rotulo: "Não informado" },
] as const;

function PerguntaAlimentar({
  legenda,
  campo,
  register,
}: {
  legenda: string;
  campo: "containsGluten" | "containsLactose" | "isVegan";
  register: UseFormRegister<FormData>;
}) {
  return (
    <fieldset>
      <legend className="text-sm text-neutral-700 mb-1">{legenda}</legend>
      <div className="flex gap-2">
        {OPCOES_ALIMENTARES.map(({ valor, rotulo }) => (
          <label key={valor} className="flex-1 cursor-pointer">
            <input type="radio" value={valor} {...register(campo)} className="peer sr-only" />
            <span className="block text-center px-3 py-2 rounded-lg border border-neutral-200 bg-neutral-50 text-xs text-neutral-600 transition peer-checked:border-brand peer-checked:bg-brand-light peer-checked:text-brand-dark peer-focus-visible:ring-2 peer-focus-visible:ring-brand">
              {rotulo}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

interface Props {
  open: boolean;
  onClose: () => void;
  item: MenuItem | null;
  categories: { id: string; name: string; slug: string }[];
  onSaved: () => void;
}

export function MenuItemModal({ open, onClose, item, categories, onSaved }: Props) {
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } = useForm<FormData>({ resolver: zodResolver(schema) as any });

  const imageUrlValue = watch("imageUrl");
  const recorteValue = watch("imagemRecortadaUrl");
  const [recortando, setRecortando] = useState<{ etapa: EtapaDoRecorte; porcento?: number } | null>(null);

  async function enviar(file: Blob, nome: string): Promise<{ url: string; semFundo: boolean } | null> {
    const fd = new FormData();
    fd.append("file", file, nome);
    const res = await fetch("/api/upload", { method: "POST", body: fd });
    if (!res.ok) return null;
    return res.json();
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const enviado = await enviar(file, file.name);
    if (enviado) {
      setValue("imageUrl", enviado.url);
      // Foto que já chega sem fundo vira também a do banner. Foto comum troca
      // a foto do item, e o recorte da foto antiga deixa de valer.
      setValue("imagemRecortadaUrl", enviado.semFundo ? enviado.url : "");
      toast.success(enviado.semFundo ? "Imagem enviada, já sem fundo: vale também para o banner." : "Imagem enviada!");
    } else {
      toast.error("Erro ao enviar imagem");
    }
    setUploading(false);
  }

  async function enviarRecorte(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const enviado = await enviar(file, file.name);
    setUploading(false);
    if (!enviado) return toast.error("Erro ao enviar imagem");
    if (!enviado.semFundo) {
      return toast.error("Essa imagem ainda tem fundo. Envie um PNG com o fundo transparente, ou use Remover fundo.");
    }
    setValue("imagemRecortadaUrl", enviado.url);
    toast.success("Foto sem fundo salva para o banner.");
  }

  async function gerarRecorte() {
    if (!imageUrlValue) return;
    try {
      // Import dinâmico: o modelo e a biblioteca só existem para quem clicar.
      const { removerFundo } = await import("@/lib/loja/remover-fundo");
      const png = await removerFundo(imageUrlValue, (etapa, porcento) => setRecortando({ etapa, porcento }));
      setRecortando(null);
      setUploading(true);
      const enviado = await enviar(png, "recorte.png");
      setUploading(false);
      if (!enviado) return toast.error("Recorte pronto, mas não deu para enviar. Tente de novo.");
      setValue("imagemRecortadaUrl", enviado.url);
      toast.success("Fundo removido. Confira o resultado antes de salvar.");
    } catch (erro) {
      console.error("[remover-fundo]", erro);
      setRecortando(null);
      setUploading(false);
      toast.error("Não deu para remover o fundo neste navegador. Tente no Chrome atualizado ou envie a foto já sem fundo.");
    }
  }

  useEffect(() => {
    if (item) {
      reset({
        name: item.name,
        description: item.description ?? "",
        price: String(item.price),
        imageUrl: item.imageUrl ?? "",
        imagemRecortadaUrl: item.imagemRecortadaUrl ?? "",
        available: item.available,
        categoryId: item.categoryId,
        containsGluten: booleanParaTri(item.containsGluten),
        containsLactose: booleanParaTri(item.containsLactose),
        isVegan: booleanParaTri(item.isVegan),
      });
    } else {
      reset({
        name: "",
        description: "",
        price: "",
        imageUrl: "",
        imagemRecortadaUrl: "",
        available: true,
        categoryId: categories[0]?.id ?? "",
        containsGluten: "nd",
        containsLactose: "nd",
        isVegan: "nd",
      });
    }
    setError("");
  }, [item, open, reset, categories]);

  async function onSubmit(data: FormData) {
    setLoading(true);
    setError("");

    const { containsGluten, containsLactose, isVegan, ...resto } = data;
    const payload = {
      ...resto,
      price: Number(data.price),
      imageUrl: data.imageUrl || null,
      imagemRecortadaUrl: data.imagemRecortadaUrl || null,
      description: data.description || null,
      containsGluten: triParaBoolean(containsGluten),
      containsLactose: triParaBoolean(containsLactose),
      isVegan: triParaBoolean(isVegan),
    };

    const res = item
      ? await fetch(`/api/menu/${item.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
      : await fetch("/api/menu", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

    if (!res.ok) {
      // O `.catch` não é adorno: um 502 da plataforma responde HTML, `res.json()`
      // estoura, e a exceção escapa do onSubmit — `setLoading(false)` nunca roda
      // e o botão fica preso em "Salvando...". O dono não consegue nem tentar de
      // novo sem recarregar a página. CouponModal já tratava assim.
      const json = await res.json().catch(() => ({}));
      const msg = json.error?.[0]?.message ?? "Erro ao salvar";
      setError(msg);
      toast.error(msg);
      setLoading(false);
      return;
    }

    toast.success(item ? "Item atualizado!" : "Item criado!");
    setLoading(false);
    onSaved();
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-neutral-200 px-6 py-4 flex items-center justify-between rounded-t-2xl">
          <h2 className="text-lg font-semibold">
            {item ? "Editar Item" : "Novo Item"}
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-neutral-100 transition"
          >
            <X size={18} />
          </button>
        </div>

        {/* Form */}
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        <form onSubmit={(handleSubmit as any)(onSubmit)} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">
              Nome *
            </label>
            <input
              {...register("name")}
              className="w-full px-4 py-2.5 rounded-lg border border-neutral-200 bg-neutral-50 text-sm focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent transition"
            />
            {errors.name && (
              <p className="text-brand text-xs mt-1">{errors.name.message}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">
              Descrição
            </label>
            <textarea
              {...register("description")}
              rows={2}
              className="w-full px-4 py-2.5 rounded-lg border border-neutral-200 bg-neutral-50 text-sm focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent transition resize-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">
              Preço (R$) *
            </label>
            <input
              {...register("price")}
              type="number"
              step="0.01"
              min="0"
              className="w-full px-4 py-2.5 rounded-lg border border-neutral-200 bg-neutral-50 text-sm focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent transition"
            />
            {errors.price && (
              <p className="text-brand text-xs mt-1">{errors.price.message}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">
              Categoria *
            </label>
            <select
              {...register("categoryId")}
              className="w-full px-4 py-2.5 rounded-lg border border-neutral-200 bg-neutral-50 text-sm focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent transition"
            >
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
            {errors.categoryId && (
              <p className="text-brand text-xs mt-1">{errors.categoryId.message}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">
              Imagem
            </label>
            {/* Preview */}
            {imageUrlValue && (
              <div className="mb-2 relative h-28 w-full rounded-lg overflow-hidden border border-neutral-200 bg-neutral-50">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={imageUrlValue} alt="preview" className="w-full h-full object-cover" />
              </div>
            )}
            {/* Upload button */}
            <label className={`flex items-center gap-2 w-full px-4 py-2.5 rounded-lg border border-dashed border-neutral-300 bg-neutral-50 text-sm text-neutral-500 cursor-pointer hover:border-red-400 hover:text-brand transition ${uploading ? "opacity-50 pointer-events-none" : ""}`}>
              <Upload size={14} />
              {uploading ? "Enviando..." : "Clique para enviar imagem"}
              <input type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
            </label>
            {/* Or URL input */}
            <input
              {...register("imageUrl")}
              type="url"
              placeholder="Ou cole uma URL..."
              className="mt-2 w-full px-4 py-2 rounded-lg border border-neutral-200 bg-neutral-50 text-xs text-neutral-500 focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent transition"
            />
            {errors.imageUrl && (
              <p className="text-brand text-xs mt-1">{errors.imageUrl.message}</p>
            )}
          </div>

          <div>
            <span className="block text-sm font-medium text-neutral-700 mb-1">Foto sem fundo, para o banner</span>
            <p className="text-xs text-neutral-400 mb-2">
              Quando este item aparece no banner do cardápio, o lanche sai sem moldura. Envie um PNG já sem fundo ou gere o recorte daqui.
            </p>
            <div className="flex items-center gap-3">
              <div
                className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg border border-neutral-200"
                // Xadrez claro: é como se vê que o fundo ficou transparente.
                style={{ backgroundColor: "#F6DCC6", backgroundImage: "linear-gradient(45deg,#fbeadb 25%,transparent 25%,transparent 75%,#fbeadb 75%),linear-gradient(45deg,#fbeadb 25%,transparent 25%,transparent 75%,#fbeadb 75%)", backgroundSize: "12px 12px", backgroundPosition: "0 0,6px 6px" }}
              >
                {recorteValue ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={recorteValue} alt="Recorte para o banner" className="h-full w-full object-contain" />
                ) : (
                  <span className="flex h-full items-center justify-center text-center text-[10px] text-neutral-500">sem recorte</span>
                )}
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <button
                  type="button"
                  onClick={gerarRecorte}
                  disabled={!imageUrlValue || uploading || !!recortando}
                  className="flex items-center justify-center gap-2 rounded-lg bg-neutral-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"
                >
                  <Wand2 size={14} aria-hidden="true" />
                  {recortando
                    ? recortando.etapa === "baixando-modelo"
                      ? `Preparando (primeira vez)${recortando.porcento ? ` ${Math.round(recortando.porcento)}%` : "…"}`
                      : "Removendo o fundo… (até 1 min)"
                    : "Remover fundo da foto"}
                </button>
                <div className="flex gap-2">
                  <label className={`flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-dashed border-neutral-300 px-3 py-2 text-xs text-neutral-600 hover:border-brand ${uploading ? "pointer-events-none opacity-50" : ""}`}>
                    <Upload size={13} aria-hidden="true" />
                    Enviar PNG sem fundo
                    <input type="file" accept="image/png,image/webp" className="hidden" onChange={enviarRecorte} />
                  </label>
                  {recorteValue && (
                    <button
                      type="button"
                      onClick={() => setValue("imagemRecortadaUrl", "")}
                      aria-label="Tirar o recorte"
                      className="rounded-lg border border-neutral-200 px-2.5 text-neutral-500 hover:text-brand"
                    >
                      <Trash2 size={14} aria-hidden="true" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <h3 className="text-sm font-medium text-neutral-700">Informações para o cliente</h3>
              <p className="text-xs text-neutral-400 mt-0.5">
                Marque &quot;Não&quot; só se tiver certeza, incluindo contaminação cruzada na cozinha.
                Quem tem alergia vai confiar nisso.
              </p>
            </div>
            <PerguntaAlimentar legenda="Contém glúten?" campo="containsGluten" register={register} />
            <PerguntaAlimentar legenda="Contém lactose?" campo="containsLactose" register={register} />
            <PerguntaAlimentar legenda="É vegano?" campo="isVegan" register={register} />
          </div>

          <div className="flex items-center gap-3">
            <input
              {...register("available")}
              type="checkbox"
              id="available"
              className="w-4 h-4 accent-red-500"
            />
            <label htmlFor="available" className="text-sm text-neutral-700">
              Disponível no cardápio
            </label>
          </div>

          {error && (
            <div className="bg-brand-light border border-brand-muted rounded-lg px-4 py-2.5">
              <p className="text-brand-dark text-sm">{error}</p>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 rounded-lg border border-neutral-200 text-sm text-neutral-700 hover:bg-neutral-50 transition"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 bg-brand hover:bg-brand-dark disabled:opacity-50 text-white text-sm font-semibold py-2.5 rounded-lg transition"
            >
              {loading ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
