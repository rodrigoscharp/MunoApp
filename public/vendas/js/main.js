/* ======================================================
   Muno — funil e captação de lead

   O que a landing grava. A animação mora em js/viagem.js; este arquivo não
   depende dela, e uma falha lá não pode custar uma visita contada nem um lead.
   ====================================================== */

document.addEventListener('DOMContentLoaded', () => {

  /* ── Eventos do funil ─────────────────────────────── */
  // Caminho relativo pelo mesmo motivo do endpoint de lead: a página é
  // servida pelo próprio app desde 26/08/2026, e um endereço absoluto de
  // produção faria a página aberta em localhost gravar no banco dos clientes.
  const ENDPOINT_EVENTO = '/api/funil/evento';

  const params = new URLSearchParams(location.search);
  const utm = {
    source: params.get('utm_source') || undefined,
    medium: params.get('utm_medium') || undefined,
    campaign: params.get('utm_campaign') || undefined,
  };

  // Só o host de quem indicou, nunca a URL inteira: o caminho pode carregar
  // dado de quem navegava, e para saber "veio do Instagram" o host basta.
  let referrer;
  try {
    referrer = document.referrer ? new URL(document.referrer).hostname : undefined;
  } catch (_) {
    referrer = undefined;
  }

  const dispositivo = window.matchMedia('(max-width: 767px)').matches
    ? 'celular'
    : 'desktop';

  // Dispara e esquece. keepalive para sobreviver à aba sendo descarregada,
  // sem await e com catch vazio: se a ingestão estiver fora do ar, a visita
  // não é contada e a venda acontece igual. O caminho que gera receita nunca
  // depende do que gera relatório.
  function evento(tipo, detalhe) {
    try {
      fetch(ENDPOINT_EVENTO, {
        method: 'POST',
        keepalive: true,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo, detalhe, utm, referrer, dispositivo }),
      }).catch(() => {});
    } catch (_) {
      /* navegador antigo sem fetch: a página segue funcionando */
    }
  }

  evento('VISITA');

  // Rolou até os planos. IntersectionObserver e não scroll listener: uma vez
  // por visita, sem custo a cada quadro de rolagem.
  const secaoPlanos = document.getElementById('planos');
  if (secaoPlanos && 'IntersectionObserver' in window) {
    const observador = new IntersectionObserver((entradas) => {
      if (entradas.some((e) => e.isIntersecting)) {
        evento('VIU_PRECO');
        observador.disconnect(); // uma vez por visita, não uma por rolagem
      }
    }, { threshold: 0.4 });
    observador.observe(secaoPlanos);
  }

  // Intenção declarada: o clique que leva ao checkout. Delegado no documento
  // para pegar qualquer botão de assinar da página, inclusive os que uma
  // edição futura acrescentar.
  document.addEventListener('click', (e) => {
    const alvo = e.target instanceof Element ? e.target.closest('a[href^="/assinar"]') : null;
    if (alvo) evento('CLICOU_ASSINAR');
  });

  /* ── Formulário → WhatsApp + CRM ──────────────────── */
  // Caminho relativo, e não o host de produção: aberta em localhost durante o
  // desenvolvimento, a página gravaria o lead no banco de produção — o mesmo
  // acidente que guard-local-db.js existe para impedir do outro lado.
  //
  // origemPermitida() em src/app/api/leads/publico/route.ts compara o Origin
  // com LANDING_ORIGIN: localhost passa fora de produção e o apex está na lista.
  const ENDPOINT_LEAD = '/api/leads/publico';

  const form = document.getElementById('leadForm');
  form?.addEventListener('submit', e => {
    e.preventDefault();
    const name  = document.getElementById('restaurantName').value.trim();
    const phone = document.getElementById('whatsappNumber').value.trim();
    const plan  = document.getElementById('planInterest').value;
    const trap  = document.getElementById('website')?.value ?? '';
    const aviso = document.getElementById('leadOk');

    // O form é novalidate para o aviso ser nosso, no mesmo tom da página, e
    // não o balão do navegador.
    if (!name || phone.replace(/\D/g, '').length < 10) {
      if (aviso) aviso.textContent = 'Preencha o nome do estabelecimento e um WhatsApp com DDD.';
      (name ? document.getElementById('whatsappNumber') : document.getElementById('restaurantName')).focus();
      return;
    }

    const msg = `Olá! Tenho interesse no plano *${plan}* da Muno para o estabelecimento *${name}*. Meu contato é ${phone}.`;

    // O window.open vem PRIMEIRO e síncrono, dentro do gesto do submit. Depois
    // de um await ou .then() o Safari do iOS trata a janela como não
    // solicitada e bloqueia — e iPhone é de onde vem o tráfego de Instagram.
    window.open(`https://wa.me/5512996419003?text=${encodeURIComponent(msg)}`, '_blank');
    if (aviso) aviso.textContent = 'Abrimos o WhatsApp. É só enviar a mensagem.';

    // O evento e o Lead nascem do mesmo clique, e os dois são gravados. Não é
    // redundância: o lead é a pessoa, o evento é o momento dentro da sessão.
    evento('ABRIU_WHATSAPP', plan);

    // Grava em paralelo, sem esperar e sem poder atrapalhar: se o endpoint
    // estiver fora do ar, o lead se perde mas a conversa acontece.
    fetch(ENDPOINT_LEAD, {
      method: 'POST',
      keepalive: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        restaurante: name,
        telefone: phone,
        plano: plan,
        website: trap,
      }),
    }).catch(() => {});
  });

});
