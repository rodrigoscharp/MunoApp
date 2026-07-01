import { OrderWithItems } from "@/types";
import { getCustomerDisplayName } from "@/lib/utils";

type PrintableOrder = OrderWithItems & { deliveryAddress?: string | null };

const DELIVERY_LABELS: Record<string, string> = {
  DELIVERY: "Entrega",
  PICKUP: "Retirada",
  DINE_IN: "Mesa",
};

export function printOrder(order: PrintableOrder, paperWidth: "58mm" | "80mm" = "80mm") {
  const width = paperWidth === "58mm" ? "52mm" : "72mm";
  const fontSize = paperWidth === "58mm" ? "11px" : "13px";

  const itemsHtml = order.items
    .map(
      (item) => `
      <div class="item">
        <span class="qty">${item.quantity}x</span>
        <span class="name">${item.menuItem.name}</span>
      </div>
      ${item.notes ? `<div class="notes">↳ ${item.notes}</div>` : ""}
    `
    )
    .join("");

  const now = new Date().toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <title>Pedido #${order.id.slice(-6).toUpperCase()}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      font-family: 'Courier New', Courier, monospace;
      font-size: ${fontSize};
      width: ${width};
      padding: 4mm 2mm;
      color: #000;
    }

    .center { text-align: center; }
    .bold   { font-weight: bold; }
    .large  { font-size: 1.3em; font-weight: bold; }

    .divider {
      border: none;
      border-top: 1px dashed #000;
      margin: 4px 0;
    }

    .row {
      display: flex;
      justify-content: space-between;
      margin: 1px 0;
    }

    .item {
      display: flex;
      gap: 4px;
      margin: 2px 0;
    }
    .qty  { min-width: 20px; font-weight: bold; }
    .name { flex: 1; }

    .notes {
      font-size: 0.9em;
      color: #444;
      margin-left: 24px;
      margin-bottom: 2px;
    }

    .obs {
      border: 1px dashed #000;
      padding: 3px 5px;
      margin: 4px 0;
      font-size: 0.9em;
    }

    .total {
      font-size: 1.15em;
      font-weight: bold;
    }
  </style>
</head>
<body>

  <div class="center bold large">PEDIDO #${order.id.slice(-6).toUpperCase()}</div>
  <div class="center">${now}</div>

  <hr class="divider" />

  <div class="row">
    <span class="bold">Tipo:</span>
    <span>${DELIVERY_LABELS[order.deliveryType] ?? order.deliveryType}</span>
  </div>
  ${
    (() => {
      const customerName = getCustomerDisplayName(order);
      return customerName
        ? `<div class="row"><span class="bold">Cliente:</span><span>${customerName}</span></div>`
        : "";
    })()
  }
  ${
    order.deliveryAddress
      ? `<div class="row"><span class="bold">Endereço:</span><span style="max-width:65%;text-align:right">${order.deliveryAddress}</span></div>`
      : ""
  }

  <hr class="divider" />

  <div class="bold" style="margin-bottom:3px">ITENS</div>
  ${itemsHtml}

  ${
    order.notes
      ? `<hr class="divider"/><div class="obs"><span class="bold">OBS:</span> ${order.notes}</div>`
      : ""
  }

  <hr class="divider" />

  <div class="row total">
    <span>TOTAL</span>
    <span>${new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(order.total)}</span>
  </div>

  <hr class="divider" />
  <div class="center" style="margin-top:4px;font-size:0.85em">*** FIM DO PEDIDO ***</div>

</body>
</html>`;

  const win = window.open("", "_blank", "width=400,height=600");
  if (!win) return;
  win.document.write(html);
  win.document.close();
  win.focus();
  win.print();
  win.onafterprint = () => win.close();
}
