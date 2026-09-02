"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Download, X } from "lucide-react";
import { useInstalacao } from "./useInstalacao";
import { InstrucaoIOS } from "./InstrucaoIOS";
import { anunciarFolha, consumirConvitePendente } from "./convitePosLogin";
import { ATRASO_DO_CONVITE_MS, CONVITE_POS_LOGIN } from "@/lib/pwa/config";

/**
 * A folha que sobe depois do login convidando a instalar o app.
 *
 * Ela mora no layout do cardápio, e não na tela de login, porque o login
 * redireciona no mesmo instante em que a senha é aceita: um convite lá sairia
 * da tela antes de ser lido. O LoginForm deixa o bilhete, esta folha o consome
 * na tela seguinte (ver convitePosLogin.ts).
 *
 * Dois estados possíveis, e eles não são o mesmo componente com outro texto:
 * no Android há um diálogo nativo para abrir, e no iOS não existe API nenhuma,
 * só um caminho manual para ensinar.
 */
export function ConviteDeInstalacao() {
  const { estado, instalar, dispensar } = useInstalacao();
  const [pedido, setPedido] = useState(false);

  useEffect(() => {
    if (!CONVITE_POS_LOGIN) return;
    // O bilhete é consumido na leitura, então a checagem acontece uma vez.
    if (!consumirConvitePendente()) return;

    const timer = setTimeout(() => setPedido(true), ATRASO_DO_CONVITE_MS);
    return () => clearTimeout(timer);
  }, []);

  const visivel = pedido && (estado === "android" || estado === "ios");

  // Avisa a faixa do cardápio para ela se calar enquanto esta folha está de
  // pé. Sem isto as duas pedem a mesma instalação na mesma tela, logo depois
  // do login.
  useEffect(() => {
    anunciarFolha(visivel);
    return () => anunciarFolha(false);
  }, [visivel]);

  if (!visivel) return null;

  return (
    <div
      /*
       * z-40 fica ABAIXO do Toaster do sonner de propósito. Os dois ocupam a
       * base da tela: o toast é passageiro e costuma confirmar a ação que a
       * pessoa acabou de fazer, então ele passa por cima; esta folha fica até
       * alguém decidir sobre ela.
       */
      className="fixed inset-x-0 bottom-0 z-40 p-3 sm:p-4 pointer-events-none"
      role="dialog"
      aria-label="Instalar o aplicativo"
    >
      <div className="pointer-events-auto mx-auto w-full max-w-md bg-white rounded-2xl border border-neutral-200 shadow-xl p-4 sm:p-5">
        <div className="flex items-start gap-3">
          {/*
            A marca sem fundo. Os ícones quadrados do manifest têm campo creme,
            que sumiria no branco deste cartão, e a 48px a palavra dentro deles
            não se leria de qualquer forma.
          */}
          <Image
            src="/icons/marca.png"
            alt="Muno"
            width={80}
            height={18}
            className="shrink-0 mt-1"
          />
          <div className="min-w-0 flex-1">
            <p className="font-bold text-neutral-900 leading-tight">
              Deixe na tela inicial
            </p>
            <p className="text-sm text-neutral-500 mt-0.5 leading-snug">
              Abre em tela cheia e pede mais rápido, sem procurar o endereço.
            </p>
          </div>
          <button
            type="button"
            onClick={dispensar}
            aria-label="Agora não"
            className="shrink-0 -mt-1 -mr-1 w-8 h-8 rounded-full flex items-center justify-center text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 transition"
          >
            <X size={18} />
          </button>
        </div>

        {estado === "android" ? (
          <button
            type="button"
            onClick={instalar}
            className="mt-4 w-full flex items-center justify-center gap-2 bg-brand hover:bg-brand-dark text-white font-semibold text-sm py-3 rounded-xl transition"
          >
            <Download size={18} />
            Instalar aplicativo
          </button>
        ) : (
          <div className="mt-4 pt-4 border-t border-neutral-100">
            <InstrucaoIOS />
          </div>
        )}
      </div>
    </div>
  );
}
