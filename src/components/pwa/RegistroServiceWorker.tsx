"use client";

import { useEffect } from "react";

/**
 * Registra o service worker. Não desenha nada.
 *
 * Mora no layout raiz porque o registro é por ORIGEM, e o layout raiz é o
 * único ponto que cobre os quatro hosts do projeto: a landing, o console da
 * plataforma, o cardápio do restaurante e o painel de gestão. Cada origem
 * ganha o seu, isolado pelo navegador.
 *
 * Só em produção. Em desenvolvimento um service worker interceptando
 * navegação briga com o hot reload e esconde mudança recém-salva atrás de uma
 * resposta que o worker ainda estava resolvendo.
 */
export function RegistroServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    // Depois do load: o registro concorre com o carregamento do cardápio pela
    // mesma banda, e nada aqui é urgente.
    const registrar = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Falha de registro não é problema do usuário. O app funciona inteiro
        // sem service worker; o que se perde é a tela de offline e o convite
        // de instalação no Android.
      });
    };

    if (document.readyState === "complete") registrar();
    else window.addEventListener("load", registrar);

    return () => window.removeEventListener("load", registrar);
  }, []);

  return null;
}
