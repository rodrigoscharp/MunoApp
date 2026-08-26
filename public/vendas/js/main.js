/* ======================================================
   MUNOFOOD — Scripts Principais
   ====================================================== */

document.addEventListener('DOMContentLoaded', () => {

  /* ── Lucide Icons ─────────────────────────────────── */
  if (typeof lucide !== 'undefined') lucide.createIcons();

  /* ── Scroll Progress Bar ──────────────────────────── */
  const progressBar = document.getElementById('scrollProgress');
  if (progressBar) {
    window.addEventListener('scroll', () => {
      const scrolled = window.scrollY;
      const total    = document.documentElement.scrollHeight - window.innerHeight;
      progressBar.style.width = (scrolled / total * 100) + '%';
    }, { passive: true });
  }

  /* ── Fade-out cena 3D ao sair do hero ────────────── */
  const canvasContainer = document.getElementById('canvas-container');
  const heroSection     = document.querySelector('header');
  if (canvasContainer && heroSection) {
    window.addEventListener('scroll', () => {
      const heroHeight = heroSection.offsetHeight;
      const fadeStart  = heroHeight * 0.55;
      const fadeEnd    = heroHeight * 0.80;
      const scrollY    = window.scrollY;
      const opacity    = 1 - Math.min(1, Math.max(0, (scrollY - fadeStart) / (fadeEnd - fadeStart)));
      canvasContainer.style.opacity = opacity;
    }, { passive: true });
  }

  /* ── Sticky Navbar ────────────────────────────────── */
  const nav            = document.querySelector('nav');
  const announcementH  = document.querySelector('.announcement-bar')?.offsetHeight || 36;
  if (nav) {
    window.addEventListener('scroll', () => {
      nav.classList.toggle('sticky-active', window.scrollY > announcementH + 10);
    }, { passive: true });
  }

  /* ── Mobile Sticky CTA Bar — só aparece depois que rolar ── */
  const mobileCta = document.querySelector('.mobile-cta-bar');
  if (mobileCta) {
    window.addEventListener('scroll', () => {
      mobileCta.classList.toggle('visible', window.scrollY > 80);
    }, { passive: true });
  }

  /* ── Countdown Timer ──────────────────────────────── */
  const timerEl = document.getElementById('countdownTimer');
  if (timerEl) {
    const KEY = 'muno_deadline';
    let deadline = sessionStorage.getItem(KEY);
    if (!deadline) {
      deadline = Date.now() + (23 * 3600 + 47 * 60 + 12) * 1000;
      sessionStorage.setItem(KEY, deadline);
    }
    const tick = () => {
      const diff = Math.max(0, parseInt(deadline) - Date.now());
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      timerEl.textContent =
        String(h).padStart(2, '0') + ':' +
        String(m).padStart(2, '0') + ':' +
        String(s).padStart(2, '0');
    };
    tick();
    setInterval(tick, 1000);
  }

  /* ── Vagas restantes (urgência) ───────────────────── */
  const spotsEls = [
    document.getElementById('spotsLeft'),
    document.getElementById('spotsLeft2'),
  ].filter(Boolean);

  if (spotsEls.length) {
    const SPOTS_KEY = 'muno_spots';
    let spots = parseInt(sessionStorage.getItem(SPOTS_KEY)) || 7;
    sessionStorage.setItem(SPOTS_KEY, spots);
    spotsEls.forEach(el => (el.textContent = spots));

    setInterval(() => {
      if (Math.random() < 0.003 && spots > 2) {
        spots -= 1;
        sessionStorage.setItem(SPOTS_KEY, spots);
        spotsEls.forEach(el => (el.textContent = spots));
      }
    }, 5000);
  }

  /* ── Scroll Reveal ────────────────────────────────── */
  const revealObserver = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.classList.add('visible');
        revealObserver.unobserve(e.target);
      }
    });
  }, { threshold: 0.12 });
  document.querySelectorAll('.reveal').forEach(el => revealObserver.observe(el));

  /* ── Exit Intent Popup ────────────────────────────── */
  const exitPopup  = document.getElementById('exitPopup');
  const closeBtn   = document.getElementById('closeExitPopup');
  const exitCTA    = document.getElementById('exitPopupCTA');
  let popupShown   = false;

  function showExitPopup() {
    if (popupShown || sessionStorage.getItem('exit_shown')) return;
    popupShown = true;
    sessionStorage.setItem('exit_shown', '1');
    exitPopup.classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  function hideExitPopup() {
    exitPopup.classList.remove('active');
    document.body.style.overflow = '';
  }

  if (exitPopup) {
    // Desktop: mouse sai pelo topo
    document.addEventListener('mouseleave', e => {
      if (e.clientY <= 0) showExitPopup();
    });
    // Mobile: depois de 45s de inatividade
    setTimeout(showExitPopup, 45000);

    closeBtn?.addEventListener('click', hideExitPopup);
    exitPopup.addEventListener('click', e => { if (e.target === exitPopup) hideExitPopup(); });
    exitCTA?.addEventListener('click', () => {
      hideExitPopup();
      setTimeout(() => {
        document.getElementById('contato')?.scrollIntoView({ behavior: 'smooth' });
      }, 200);
    });
  }

  /* ── Formulário → WhatsApp + CRM ──────────────────── */
  // Caminho relativo, e não o host de produção.
  //
  // Desde 26/08/2026 esta página é servida pelo próprio app (public/vendas/),
  // então a rota é same-origin e o endereço absoluto virou um perigo: aberta em
  // localhost durante o desenvolvimento, a página gravaria o lead no banco de
  // produção — o mesmo acidente que guard-local-db.js existe para impedir do
  // outro lado.
  //
  // Vale nos dois hosts em que a página responde. O que muda é o Origin que o
  // navegador manda, e origemPermitida() em src/app/api/leads/publico/route.ts
  // compara com LANDING_ORIGIN: localhost passa fora de produção, o apex está
  // na lista, e app.munoapp.com.br só precisa entrar nela enquanto o apex
  // ainda pertencer ao projeto antigo.
  const ENDPOINT_LEAD = '/api/leads/publico';

  document.getElementById('leadForm')?.addEventListener('submit', e => {
    e.preventDefault();
    const name  = document.getElementById('restaurantName').value.trim();
    const phone = document.getElementById('whatsappNumber').value.trim();
    const plan  = document.getElementById('planInterest').value;
    const trap  = document.getElementById('website')?.value ?? '';
    const msg   = `Olá! Tenho interesse no plano *${plan}* do MUNOFOOD para o estabelecimento *${name}*. Meu contato é ${phone}.`;

    // O window.open vem PRIMEIRO e síncrono, dentro do gesto do submit. Depois
    // de um await ou .then() o Safari do iOS trata a janela como não
    // solicitada e bloqueia — e iPhone é de onde vem o tráfego de Instagram.
    window.open(`https://wa.me/5512996419003?text=${encodeURIComponent(msg)}`, '_blank');

    // Grava em paralelo, sem esperar e sem poder atrapalhar: se o endpoint
    // estiver fora do ar, o lead se perde mas a conversa acontece. O caminho
    // que gera receita não depende do que gera relatório. keepalive para a
    // requisição sobreviver se a aba for descarregada.
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
