interface BillItem {
  quantity: number;
  name: string;
  unitPrice: number;
}

interface BillPersonGroup {
  name: string;
  items: BillItem[];
  subtotal: number;
}

const currency = (value: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

export function printTableBill(
  tableLabel: string,
  groups: BillPersonGroup[],
  includeService: boolean,
  paperWidth: "58mm" | "80mm" = "80mm"
) {
  const width = paperWidth === "58mm" ? "52mm" : "72mm";
  const fontSize = paperWidth === "58mm" ? "11px" : "13px";

  const itemsTotal = groups.reduce((sum, g) => sum + g.subtotal, 0);
  const serviceTotal = includeService ? itemsTotal * 0.1 : 0;
  const grandTotal = itemsTotal + serviceTotal;

  const groupsHtml = groups
    .map((group) => {
      const service = includeService ? group.subtotal * 0.1 : 0;
      const personTotal = group.subtotal + service;
      const itemsHtml = group.items
        .map(
          (item) => `
        <div class="item">
          <span class="qty">${item.quantity}x</span>
          <span class="name">${item.name}</span>
          <span>${currency(item.unitPrice * item.quantity)}</span>
        </div>`
        )
        .join("");

      return `
      <div class="bold" style="margin-top:6px">${group.name}</div>
      ${itemsHtml}
      <div class="row" style="margin-top:2px">
        <span>Subtotal</span>
        <span>${currency(group.subtotal)}</span>
      </div>
      ${
        includeService
          ? `<div class="row"><span>Serviço (10%)</span><span>${currency(service)}</span></div>`
          : ""
      }
      <div class="row bold">
        <span>Total ${group.name}</span>
        <span>${currency(personTotal)}</span>
      </div>
      <hr class="divider" />`;
    })
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
  <title>Conta · ${tableLabel}</title>
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
      justify-content: space-between;
    }
    .qty  { min-width: 20px; font-weight: bold; }
    .name { flex: 1; }

    .total {
      font-size: 1.15em;
      font-weight: bold;
    }
  </style>
</head>
<body>

  <div class="center bold large">CONTA</div>
  <div class="center">${tableLabel}</div>
  <div class="center">${now}</div>

  <hr class="divider" />
  ${groupsHtml}

  <div class="row">
    <span>Subtotal geral</span>
    <span>${currency(itemsTotal)}</span>
  </div>
  ${
    includeService
      ? `<div class="row"><span>Serviço (10%)</span><span>${currency(serviceTotal)}</span></div>`
      : ""
  }
  <div class="row total">
    <span>TOTAL</span>
    <span>${currency(grandTotal)}</span>
  </div>

  <hr class="divider" />
  <div class="center" style="margin-top:4px;font-size:0.85em">*** FIM DA CONTA ***</div>

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
