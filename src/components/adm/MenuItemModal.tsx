"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { X, Upload } from "lucide-react";
import { toast } from "sonner";

const schema = z.object({
  name: z.string().min(1, "Nome obrigatório"),
  description: z.string().optional(),
  price: z.string().refine((v) => !isNaN(Number(v)) && Number(v) > 0, "Preço deve ser positivo"),
  imageUrl: z.string().url("URL inválida").optional().or(z.literal("")),
  available: z.boolean(),
  categoryId: z.string().min(1, "Selecione uma categoria"),
});

type FormData = z.infer<typeof schema>;

interface MenuItem {
  id: string;
  name: string;
  description: string | null;
  price: number;
  imageUrl: string | null;
  available: boolean;
  categoryId: string;
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

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/upload", { method: "POST", body: fd });
    if (res.ok) {
      const { url } = await res.json();
      setValue("imageUrl", url);
      toast.success("Imagem enviada!");
    } else {
      toast.error("Erro ao enviar imagem");
    }
    setUploading(false);
  }

  useEffect(() => {
    if (item) {
      reset({
        name: item.name,
        description: item.description ?? "",
        price: String(item.price),
        imageUrl: item.imageUrl ?? "",
        available: item.available,
        categoryId: item.categoryId,
      });
    } else {
      reset({
        name: "",
        description: "",
        price: "",
        imageUrl: "",
        available: true,
        categoryId: categories[0]?.id ?? "",
      });
    }
    setError("");
  }, [item, open, reset, categories]);

  async function onSubmit(data: FormData) {
    setLoading(true);
    setError("");

    const payload = {
      ...data,
      price: Number(data.price),
      imageUrl: data.imageUrl || null,
      description: data.description || null,
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
