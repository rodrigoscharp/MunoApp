"use client";

import { useEffect, useState } from "react";
import { useForm, type UseFormRegister } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { X, Upload, Wand2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { booleanParaTri, triParaBoolean } from "@/lib/restricoes";
import type { EtapaDoRecorte } from "@/lib/loja/remover-fundo";
import { cn } from "@/lib/utils";
import { botaoBrasa, botaoContorno, botaoFloresta, campo, kicker, rotulo } from "@/components/painel/estilos";

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
      <legend className={cn(rotulo, "mb-1.5 text-[13px]")}>{legenda}</legend>
      <div className="flex gap-2">
        {OPCOES_ALIMENTARES.map(({ valor, rotulo: texto }) => (
          <label key={valor} className="flex-1 cursor-pointer">
            <input type="radio" value={valor} {...register(campo)} className="peer sr-only" />
            <span className="flex min-h-11 items-center justify-center rounded-2xl border border-loja-linha bg-loja-papel px-2 text-center text-[12.5px] font-semibold text-loja-tinta transition peer-checked:border-forest-dark peer-checked:bg-forest-dark peer-checked:text-white peer-focus-visible:ring-2 peer-focus-visible:ring-brand">
              {texto}
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
      const { removerFundo, nomeDoRecorte } = await import("@/lib/loja/remover-fundo");
      const recorte = await removerFundo(imageUrlValue, (etapa, porcento) => setRecortando({ etapa, porcento }));
      setRecortando(null);
      setUploading(true);
      // WebP, ou PNG no navegador que não gera WebP: o nome segue o que veio.
      const enviado = await enviar(recorte, nomeDoRecorte(recorte));
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

  useEffect(() => {
    if (!open) return;
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [open, onClose]);

  if (!open) return null;

  const erroDoCampo = "mt-1.5 text-[12.5px] font-semibold text-loja-preco";
  const rotuloDoCampo = cn(rotulo, "mb-1.5 block text-[13px]");
  const bloco = "space-y-3 rounded-[22px] bg-loja-papel p-4 shadow-loja";

  return (
    // Folha lateral no desktop e folha de baixo no celular: o cardápio fica à
    // vista atrás, e o formulário comprido rola por dentro, com Salvar sempre
    // ao alcance.
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-stretch sm:justify-end">
      <div className="absolute inset-0 bg-forest-dark/40 backdrop-blur-[2px]" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-do-item"
        className="relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-[26px] bg-loja-creme shadow-loja-alta sm:max-h-none sm:max-w-[480px] sm:rounded-none sm:rounded-l-[26px]"
      >
        <div className="flex items-center justify-between gap-3 border-b border-loja-linha bg-loja-papel px-5 py-4 sm:px-6">
          <div className="flex flex-col gap-1">
            <span className={`${kicker} text-loja-preco`}>Cardápio</span>
            <h2 id="titulo-do-item" className="manchete text-[1.9rem] text-forest-dark">
              {item ? "Editar item" : "Novo item"}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="flex h-11 w-11 items-center justify-center rounded-full text-loja-tinta transition hover:bg-loja-creme"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        <form onSubmit={(handleSubmit as any)(onSubmit)} className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5 sm:px-6">
            <section className={cn(bloco, "space-y-4")}>
              <div>
                <label htmlFor="item-nome" className={rotuloDoCampo}>
                  Nome *
                </label>
                <input id="item-nome" {...register("name")} className={campo} />
                {errors.name && <p className={erroDoCampo}>{errors.name.message}</p>}
              </div>

              <div>
                <label htmlFor="item-descricao" className={rotuloDoCampo}>
                  Descrição
                </label>
                <textarea id="item-descricao" {...register("description")} rows={2} className={cn(campo, "resize-none")} />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="item-preco" className={rotuloDoCampo}>
                    Preço (R$) *
                  </label>
                  <input
                    id="item-preco"
                    {...register("price")}
                    type="number"
                    step="0.01"
                    min="0"
                    inputMode="decimal"
                    className={campo}
                  />
                  {errors.price && <p className={erroDoCampo}>{errors.price.message}</p>}
                </div>

                <div>
                  <label htmlFor="item-categoria" className={rotuloDoCampo}>
                    Categoria *
                  </label>
                  <select id="item-categoria" {...register("categoryId")} className={cn(campo, "h-[50px] py-0")}>
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                  </select>
                  {errors.categoryId && <p className={erroDoCampo}>{errors.categoryId.message}</p>}
                </div>
              </div>

              <label
                htmlFor="available"
                className="flex min-h-11 cursor-pointer items-center gap-3 text-[14px] font-semibold text-loja-tinta"
              >
                <input {...register("available")} type="checkbox" id="available" className="h-5 w-5 accent-[#2B5240]" />
                Disponível no cardápio
              </label>
            </section>

            <section className={bloco}>
              <span className={rotuloDoCampo}>Foto</span>
              {imageUrlValue && (
                <div className="relative h-36 w-full overflow-hidden rounded-2xl bg-loja-pessego">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={imageUrlValue} alt="preview" className="h-full w-full object-cover" />
                </div>
              )}
              <label
                className={cn(
                  "flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-2xl border-[1.5px] border-dashed border-[#B9A690] px-4 py-2.5 text-[13.5px] font-bold text-loja-tinta transition hover:border-brand hover:text-loja-preco",
                  uploading && "pointer-events-none opacity-50"
                )}
              >
                <Upload size={15} aria-hidden="true" />
                {uploading ? "Enviando..." : "Clique para enviar imagem"}
                <input type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
              </label>
              <input
                {...register("imageUrl")}
                type="url"
                aria-label="URL da foto"
                placeholder="Ou cole uma URL..."
                className={cn(campo, "py-2.5 text-[13px]")}
              />
              {errors.imageUrl && <p className={erroDoCampo}>{errors.imageUrl.message}</p>}
            </section>

            <section className={bloco}>
              <div>
                <span className={rotuloDoCampo}>Foto sem fundo, para o banner</span>
                <p className="text-[12.5px] text-loja-tinta-2">
                  Quando este item aparece no banner do cardápio, o lanche sai sem moldura. Envie um PNG já sem fundo ou gere o recorte daqui.
                </p>
              </div>
              <div className="flex items-center gap-3">
                <div
                  className="relative h-24 w-24 shrink-0 overflow-hidden rounded-2xl"
                  // Xadrez claro: é como se vê que o fundo ficou transparente.
                  style={{ backgroundColor: "#F6DCC6", backgroundImage: "linear-gradient(45deg,#fbeadb 25%,transparent 25%,transparent 75%,#fbeadb 75%),linear-gradient(45deg,#fbeadb 25%,transparent 25%,transparent 75%,#fbeadb 75%)", backgroundSize: "12px 12px", backgroundPosition: "0 0,6px 6px" }}
                >
                  {recorteValue ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={recorteValue} alt="Recorte para o banner" className="h-full w-full object-contain" />
                  ) : (
                    <span className="flex h-full items-center justify-center text-center text-[11px] font-semibold text-[#6A3A1E]">sem recorte</span>
                  )}
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <button
                    type="button"
                    onClick={gerarRecorte}
                    disabled={!imageUrlValue || uploading || !!recortando}
                    className={cn(botaoFloresta, "min-h-11 px-3 text-[12.5px] disabled:cursor-not-allowed")}
                  >
                    <Wand2 size={14} aria-hidden="true" />
                    {recortando
                      ? recortando.etapa === "baixando-modelo"
                        ? `Preparando (primeira vez)${recortando.porcento ? ` ${Math.round(recortando.porcento)}%` : "…"}`
                        : "Removendo o fundo… (até 1 min)"
                      : "Remover fundo da foto"}
                  </button>
                  <div className="flex gap-2">
                    <label
                      className={cn(
                        "flex min-h-11 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-full border-[1.5px] border-dashed border-[#B9A690] px-3 text-center text-[12.5px] font-bold text-loja-tinta hover:border-brand",
                        uploading && "pointer-events-none opacity-50"
                      )}
                    >
                      <Upload size={13} aria-hidden="true" />
                      Enviar PNG sem fundo
                      <input type="file" accept="image/png,image/webp" className="hidden" onChange={enviarRecorte} />
                    </label>
                    {recorteValue && (
                      <button
                        type="button"
                        onClick={() => setValue("imagemRecortadaUrl", "")}
                        aria-label="Tirar o recorte"
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-loja-linha text-loja-tinta-2 hover:text-loja-preco"
                      >
                        <Trash2 size={14} aria-hidden="true" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </section>

            <section className={bloco}>
              <div>
                <h3 className="text-[15px] font-extrabold text-loja-tinta">Informações para o cliente</h3>
                <p className="mt-0.5 text-[12.5px] text-loja-tinta-2">
                  Marque &quot;Não&quot; só se tiver certeza, incluindo contaminação cruzada na cozinha.
                  Quem tem alergia vai confiar nisso.
                </p>
              </div>
              <PerguntaAlimentar legenda="Contém glúten?" campo="containsGluten" register={register} />
              <PerguntaAlimentar legenda="Contém lactose?" campo="containsLactose" register={register} />
              <PerguntaAlimentar legenda="É vegano?" campo="isVegan" register={register} />
            </section>

            {error && (
              <div role="alert" className="rounded-2xl bg-loja-pessego-claro px-4 py-3">
                <p className="text-[13.5px] font-semibold text-[#8A3A12]">{error}</p>
              </div>
            )}
          </div>

          <div className="flex gap-3 border-t border-loja-linha bg-loja-papel px-5 py-4 sm:px-6">
            <button type="button" onClick={onClose} className={cn(botaoContorno, "h-12 flex-1 px-4 text-[14px]")}>
              Cancelar
            </button>
            <button type="submit" disabled={loading} className={cn(botaoBrasa, "h-12 flex-1 px-4 text-[14px] font-extrabold")}>
              {loading ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
