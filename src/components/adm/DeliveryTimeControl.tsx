"use client";

import { useState, useTransition } from "react";
import { Clock, Minus, Plus, Check } from "lucide-react";
import { toast } from "sonner";
import { botaoBrasa, cartaoPainel, tituloDeSecao } from "@/components/painel/estilos";

interface Props {
  initialMinutes: number;
}

export function DeliveryTimeControl({ initialMinutes }: Props) {
  const [minutes, setMinutes] = useState(initialMinutes);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  function adjust(delta: number) {
    setMinutes((prev) => Math.min(180, Math.max(5, prev + delta)));
    setSaved(false);
  }

  async function save() {
    startTransition(async () => {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ minutes }),
      });

      if (res.ok) {
        setSaved(true);
        toast.success(`Previsão atualizada para ${minutes} minutos`);
      } else {
        toast.error("Erro ao salvar");
      }
    });
  }

  const label =
    minutes < 60
      ? `${minutes} min`
      : `${Math.floor(minutes / 60)}h${minutes % 60 > 0 ? ` ${minutes % 60}min` : ""}`;

  const botaoAjuste =
    "flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-[1.5px] border-loja-linha bg-white text-loja-tinta transition hover:border-brand hover:text-loja-preco disabled:cursor-not-allowed disabled:opacity-40";

  return (
    <div className={`${cartaoPainel} flex h-full flex-col p-5 sm:p-6`}>
      <div className="flex items-center gap-2">
        <Clock size={17} className="text-loja-preco" aria-hidden />
        <h3 className={tituloDeSecao}>Previsão de entrega</h3>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={() => adjust(-5)}
          disabled={minutes <= 5}
          aria-label="Diminuir 5 minutos"
          className={botaoAjuste}
        >
          <Minus size={16} aria-hidden />
        </button>

        <div className="flex-1 text-center" aria-live="polite">
          <p className="manchete text-[2.6rem] leading-none text-forest-dark">{label}</p>
          <p className="mt-1 text-[12px] text-loja-tinta-2">tempo estimado</p>
        </div>

        <button
          type="button"
          onClick={() => adjust(5)}
          disabled={minutes >= 180}
          aria-label="Aumentar 5 minutos"
          className={botaoAjuste}
        >
          <Plus size={16} aria-hidden />
        </button>
      </div>

      <div className="mt-auto pt-5">
        <button
          type="button"
          onClick={save}
          disabled={pending || saved}
          className={`${botaoBrasa} h-12 w-full text-[14px]`}
        >
          {saved ? (
            <>
              <Check size={16} aria-hidden /> Salvo
            </>
          ) : pending ? (
            "Salvando..."
          ) : (
            "Salvar previsão"
          )}
        </button>

        <p className="mt-2 text-center text-[12px] text-loja-tinta-2">
          Aplica a todos os novos pedidos
        </p>
      </div>
    </div>
  );
}
