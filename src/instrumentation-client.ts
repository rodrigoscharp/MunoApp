/**
 * DIAGNÓSTICO TEMPORÁRIO — investigação do crash:
 *   "NotFoundError: Failed to execute 'removeChild' on 'Node'"
 *
 * Roda antes da hidratação do React (ver docs do Next: instrumentation-client).
 * Só ativa em desenvolvimento. Remover quando a causa raiz estiver confirmada.
 *
 * O que ele faz:
 *  1. Intercepta removeChild/insertBefore e, quando a chamada VAI falhar,
 *     imprime quem chamou (stack) e quem é o pai REAL do nó naquele momento.
 *  2. Mantém um histórico das últimas mutações de DOM e despeja esse histórico
 *     no momento da falha, mostrando quem re-parenteou o nó.
 */

if (process.env.NODE_ENV === "development") {
  setupDomGuard();
}

type MutationRecordLog = {
  t: number;
  target: string;
  added: string[];
  removed: string[];
};

function setupDomGuard() {
  const HISTORY_LIMIT = 60;
  const history: MutationRecordLog[] = [];

  function describe(node: Node | null): string {
    if (!node) return "null";
    if (node.nodeType === Node.TEXT_NODE) {
      const text = (node.textContent ?? "").trim().slice(0, 40);
      return `#text("${text}")`;
    }
    if (node.nodeType === Node.COMMENT_NODE) {
      return `<!--${(node.textContent ?? "").slice(0, 40)}-->`;
    }
    if (!(node instanceof Element)) return node.nodeName;

    const id = node.id ? `#${node.id}` : "";
    const cls =
      typeof node.className === "string" && node.className
        ? `.${node.className.trim().split(/\s+/).slice(0, 3).join(".")}`
        : "";
    return `<${node.tagName.toLowerCase()}${id}${cls}>`;
  }

  function path(node: Node | null): string {
    const parts: string[] = [];
    let current: Node | null = node;
    while (current && parts.length < 6) {
      parts.unshift(describe(current));
      current = current.parentNode;
    }
    return parts.join(" > ");
  }

  function dumpHistory() {
    if (history.length === 0) {
      console.warn("[dom-guard] nenhuma mutação registrada no histórico");
      return;
    }
    const now = Date.now();
    console.warn(
      "[dom-guard] últimas mutações de DOM (mais recente por último):",
    );
    for (const entry of history) {
      console.warn(
        `  -${now - entry.t}ms  em ${entry.target}` +
          (entry.added.length ? `  +[${entry.added.join(", ")}]` : "") +
          (entry.removed.length ? `  -[${entry.removed.join(", ")}]` : ""),
      );
    }
  }

  function reportMismatch(kind: string, detail: Record<string, unknown>) {
    console.error(
      `[dom-guard] ${kind} VAI FALHAR — o DOM foi alterado por fora do React`,
      detail,
    );
    console.error("[dom-guard] quem chamou:", new Error("stack do chamador").stack);
    dumpHistory();
  }

  // ---------------------------------------------------------------- histórico
  try {
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        if (record.type !== "childList") continue;
        if (record.addedNodes.length === 0 && record.removedNodes.length === 0) {
          continue;
        }
        history.push({
          t: Date.now(),
          target: describe(record.target),
          added: Array.from(record.addedNodes, describe),
          removed: Array.from(record.removedNodes, describe),
        });
        if (history.length > HISTORY_LIMIT) history.shift();
      }
    });
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  } catch (error) {
    console.error("[dom-guard] falhou ao instalar o MutationObserver", error);
  }

  // ------------------------------------------------- interceptação das chamadas
  const originalRemoveChild = Node.prototype.removeChild;
  Node.prototype.removeChild = function removeChildGuard<T extends Node>(
    this: Node,
    child: T,
  ): T {
    if (child.parentNode !== this) {
      reportMismatch("removeChild", {
        "pai que o React acha que é": describe(this),
        "nó a remover": describe(child),
        "pai REAL do nó agora": describe(child.parentNode),
        "caminho real do nó": path(child),
      });
    }
    return originalRemoveChild.call(this, child) as T;
  };

  const originalInsertBefore = Node.prototype.insertBefore;
  Node.prototype.insertBefore = function insertBeforeGuard<T extends Node>(
    this: Node,
    node: T,
    reference: Node | null,
  ): T {
    if (reference && reference.parentNode !== this) {
      reportMismatch("insertBefore", {
        "pai esperado": describe(this),
        "nó a inserir": describe(node),
        "nó de referência": describe(reference),
        "pai REAL da referência agora": describe(reference.parentNode),
        "caminho real da referência": path(reference),
      });
    }
    return originalInsertBefore.call(this, node, reference) as T;
  };

  // ------------------------------------------------------ stack do erro real
  window.addEventListener("error", (event) => {
    if (event.error instanceof Error && event.error.name === "NotFoundError") {
      console.error("[dom-guard] stack completo do NotFoundError:", event.error.stack);
    }
  });

  console.info("[dom-guard] ativo — monitorando mutações de DOM (apenas em dev)");
}
