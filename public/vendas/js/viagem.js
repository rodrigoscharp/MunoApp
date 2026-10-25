/* ======================================================
   Muno — a viagem do pedido

   Um trilho desce pela página e passa por sete paradas ([data-parada]):
   celular, cozinha, restaurante no mapa, casa da cliente, painel, cupom e
   plano. A rolagem aponta um ponto do trilho, e o pedido (#viajante) persegue
   esse ponto com atraso, o que dá o movimento de "vida". Perto de cada parada
   ele segura um pouco (ímã cúbico), e é nessa janela que a seção roda a sua
   cena.

   O pedido muda de forma no caminho: tíquete até a rua, motoboy entre o
   restaurante e a cliente, moeda no caixa, e a cliente que volta até o plano.

   Também mora aqui a entrada do hero (window.munoHero, que o intro.js chama
   quando o painel da abertura sobe) e o celular que faz o pedido sozinho.

   Sem GSAP, ou com movimento reduzido, nada disso anima: o pedido segue a
   rolagem sem atraso e as cenas ficam no estado parado, que é legível.
   ====================================================== */
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const raiz = document.documentElement;
  const temGsap = typeof gsap !== 'undefined';
  const reduz = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const anima = temGsap && !reduz;
  const EASE = 'expo.out';
  const brl = (v) => 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  /* O dia do banner sai de Brasília, como na loja: em UTC, quinta 22h já é
     sexta. */
  try {
    const dia = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', timeZone: 'America/Sao_Paulo' }).format(new Date());
    $('#diaKick').textContent = dia.replace('-feira', '').toUpperCase() + ' · O MAIS PEDIDO';
  } catch (e) { /* fica o texto do HTML */ }

  /* ================= hero: título palavra a palavra ================= */
  // Cada palavra leva junto o espaço que vem depois, e .tr tem white-space:
  // pre: num inline-block o espaço do fim colapsa, e "Do pedido" virava
  // "Dopedido".
  const unidades = [];
  $$('.hl-linha').forEach(linha => {
    const texto = linha.textContent; linha.textContent = '';
    (texto.match(/\S+\s*/g) || []).forEach(p => {
      const s = document.createElement('span'); s.className = 'tr'; s.textContent = p;
      linha.appendChild(s); unidades.push(s);
    });
  });

  let heroRodou = false;
  const iniciar = () => {
    if (heroRodou) return; heroRodou = true;
    if (!anima) { raiz.removeAttribute('data-hero'); return; }
    const tl = gsap.timeline({ defaults: { ease: EASE } });
    tl.set(['.hero-anim', '.hl-linha', '#cel', '.flutua'], { opacity: 1 })
      .call(() => raiz.removeAttribute('data-hero'))
      .fromTo(unidades, { yPercent: 40, opacity: 0, filter: 'blur(12px)' }, { yPercent: 0, opacity: 1, filter: 'blur(0px)', duration: 1, stagger: 0.09 }, 0)
      .fromTo('.hero-anim', { y: 18, opacity: 0 }, { y: 0, opacity: 1, duration: .8, stagger: .1 }, .3)
      .fromTo('#cel', { y: 80, rotate: 4, opacity: 0 }, { y: 0, rotate: 0, opacity: 1, duration: 1.3 }, .15)
      .fromTo('.flutua', { y: 30, opacity: 0, scale: .92 }, { y: 0, opacity: 1, scale: 1, duration: 1, stagger: .15 }, .7)
      .fromTo('.ramo', { scale: 0, rotate: -30, transformOrigin: '0% 100%' }, { scale: 1, rotate: 0, duration: 1.2 }, .8);
  };
  // pularMarca vem do contrato do intro.js; aqui não há logo no hero para pular.
  window.munoHero = { iniciar: () => iniciar() };

  /* ================= celular: o cliente faz o pedido ================= */
  const tela = $('#tela'), dedo = $('#dedo');
  const slides = $$('.slide'), pontos = $$('.pontos i');
  const conta = $('#conta'), barra = $('#barra'), barraTxt = $('#barraTxt');
  let slideAtual = 0;

  const trocarSlide = () => {
    const prox = (slideAtual + 1) % slides.length;
    const a = slides[slideAtual], b = slides[prox];
    gsap.to(a, { opacity: 0, x: -24, duration: .5, ease: 'power2.in' });
    gsap.fromTo(b, { opacity: 0, x: 30 }, { opacity: 1, x: 0, duration: .8, ease: EASE, delay: .25 });
    gsap.fromTo($('img', b), { scale: .7, rotate: -12 }, { scale: 1, rotate: 0, duration: 1.1, ease: 'back.out(1.6)', delay: .25 });
    pontos.forEach((p, i) => p.classList.toggle('ativo', i === prox));
    slideAtual = prox;
  };
  const centroEm = (el) => {
    const r = el.getBoundingClientRect(), t = tela.getBoundingClientRect();
    return { x: r.left - t.left + r.width / 2, y: r.top - t.top + r.height / 2 };
  };
  // A posição é medida na hora do toque, não na montagem da timeline: a
  // entrada do hero ainda está girando o celular quando a timeline nasce.
  const tocar = (el) => gsap.timeline()
    .to(dedo, { left: () => centroEm(el).x - 17, top: () => centroEm(el).y - 17, opacity: 1, duration: .7, ease: 'power3.inOut' })
    .to(dedo, { scale: .75, duration: .1 })
    .to(el, { scale: .85, duration: .1 }, '<')
    .to([dedo, el], { scale: 1, duration: .3, ease: 'back.out(3)' });
  const voar = (de) => {
    const img = $('img', de.closest('.item'));
    const a = centroEm(img), b = centroEm($('#sacola'));
    const v = document.createElement('img'); v.src = img.src; v.className = 'voo'; v.alt = ''; tela.appendChild(v);
    gsap.timeline({ onComplete: () => v.remove() })
      .set(v, { left: a.x - 20, top: a.y - 20 })
      .to(v, { left: b.x - 20, duration: .75, ease: 'power1.inOut' })
      .to(v, { top: b.y - 20, duration: .75, ease: 'power2.in' }, '<')
      .to(v, { scale: .3, opacity: .4, duration: .75, ease: 'power2.in' }, '<');
  };
  const somar = (n, txt) => {
    conta.textContent = n; barraTxt.textContent = txt;
    gsap.fromTo(conta, { scale: 1.8 }, { scale: 1, duration: .6, ease: 'elastic.out(1, .4)' });
    gsap.fromTo('#sacola', { rotate: -12 }, { rotate: 0, duration: .6, ease: 'elastic.out(1, .4)' });
  };
  const enviar = () => {
    barra.classList.add('enviado'); barraTxt.textContent = 'Pedido enviado ✓';
    gsap.fromTo('#onda', { scale: .2, opacity: .8 }, { scale: 1.4, opacity: 0, duration: 1.4, ease: 'power2.out' });
    if (viagem.l < 30) gsap.fromTo('.via', { scale: 1 }, { scale: 1.12, yoyo: true, repeat: 1, duration: .25, ease: 'power2.out' });
  };
  let demo = null;
  const montarDemo = () => {
    if (!anima || demo) return;
    const mais = $('#maisA');
    demo = gsap.timeline({ repeat: -1, repeatDelay: .4, delay: raiz.hasAttribute('data-intro') ? 3.6 : 1.8 });
    demo.call(() => { barra.classList.remove('enviado'); conta.textContent = '0'; barraTxt.textContent = 'Sacola vazia'; })
      .add(tocar(mais), .4).add(() => voar(mais)).call(() => somar(1, '1 item · R$ 34,90'), null, '+=.8')
      .add(tocar(mais), '+=.2').add(() => voar(mais)).call(() => somar(2, '2 itens · R$ 69,80'), null, '+=.8')
      .add(tocar(barraTxt), '+=.3').call(enviar)
      .to(dedo, { opacity: 0, duration: .4 }, '+=.3')
      .call(trocarSlide, null, '+=1.2').call(trocarSlide, null, '+=2.4').call(trocarSlide, null, '+=2.4')
      .to({}, { duration: .6 });
    // Fora da tela, o celular não gasta quadro de ninguém.
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(([e]) => { e.isIntersecting ? demo.play() : demo.pause(); }).observe($('#cena'));
    }
  };

  /* ================= o trilho ================= */
  const trilho = $('#trilho'), svg = $('#trilhoSvg'), base = $('#trilhoBase'), feito = $('#trilhoFeito');
  const viajante = $('#viajante'), via = $('.via', viajante);
  const paradas = $$('[data-parada]').sort((a, b) => a.dataset.parada - b.dataset.parada);
  const viagem = { l: 0, alvo: 0, total: 1, pts: [], stopL: [], amostras: [], zona: [] };

  const pontoDe = (el) => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2 + scrollX, y: r.top + r.height / 2 + scrollY }; };
  const lenAtY = (y) => {
    const am = viagem.amostras; let lo = 0, hi = am.length - 1;
    if (y <= am[0].y) return 0; if (y >= am[hi].y) return am[hi].L;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (am[m].y < y) lo = m; else hi = m; }
    const a = am[lo], b = am[hi], t = (y - a.y) / ((b.y - a.y) || 1);
    return a.L + (b.L - a.L) * t;
  };
  /* Curvas com as alças na vertical: o y só cresce ao longo do trilho, e é
     isso que deixa achar o comprimento a partir do y por busca binária. */
  const montarTrilho = () => {
    const W = raiz.clientWidth;
    trilho.style.height = '0px';
    const H = raiz.scrollHeight;
    trilho.style.height = H + 'px';
    svg.setAttribute('width', W); svg.setAttribute('height', H); svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    const pts = paradas.map(pontoDe);
    let d = `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i], dy = (b.y - a.y) * .5;
      d += ` C${a.x.toFixed(1)},${(a.y + dy).toFixed(1)} ${b.x.toFixed(1)},${(b.y - dy).toFixed(1)} ${b.x.toFixed(1)},${b.y.toFixed(1)}`;
    }
    base.setAttribute('d', d); feito.setAttribute('d', d);
    const total = base.getTotalLength(), N = 900, am = [];
    let maxY = -Infinity;
    for (let k = 0; k <= N; k++) { const L = total * k / N, p = base.getPointAtLength(L); maxY = Math.max(maxY, p.y); am.push({ L, y: maxY }); }
    viagem.total = total; viagem.pts = pts; viagem.amostras = am;
    viagem.stopL = pts.map(p => lenAtY(p.y));
    feito.style.strokeDasharray = `${total} ${total}`;
    viagem.l = Math.min(viagem.l, total);
  };
  const alvoDaRolagem = () => {
    const vh = innerHeight, Z = vh * .32, pts = viagem.pts;
    let y = scrollY + vh * .52;
    viagem.zona = pts.map(() => null);
    pts.forEach((p, i) => {
      const d = y - p.y;
      if (Math.abs(d) < Z) { viagem.zona[i] = d / Z; y = p.y + Z * Math.sign(d) * Math.pow(Math.abs(d) / Z, 3); }
    });
    return lenAtY(clamp(y, pts[0].y, pts[pts.length - 1].y));
  };

  const viaStatus = $('#viaStatus'), viaEta = $('#viaEta');
  const regua = $$('#regua span');
  let ultimoStatus = '', ultimoModo = 'pedido', ultimaRegua = -1;
  const setStatus = (t) => { if (t !== ultimoStatus) { viaStatus.textContent = t; ultimoStatus = t; } };
  const setModo = (m) => { if (m !== ultimoModo) { viajante.dataset.modo = m; ultimoModo = m; } };
  const setRegua = (i) => {
    if (i === ultimaRegua) return; ultimaRegua = i;
    regua.forEach((s, k) => { s.classList.toggle('agora', k === i); s.classList.toggle('feito', k < i); });
  };

  /* --- cozinha --- */
  const alarme = $('#alarme'), cols = [$('#colNovos'), $('#colPreparo'), $('#colProntos')];
  let cozinhaAtiva = false;
  const chegarCozinha = (sim) => {
    if (sim === cozinhaAtiva) return; cozinhaAtiva = sim;
    if (!temGsap) { alarme.style.height = sim ? '48px' : '0'; return; }
    gsap.to(alarme, { height: sim ? 48 : 0, duration: .6, ease: EASE });
    if (sim && anima) gsap.fromTo('#cozinhaTela', { boxShadow: '0 0 0 0 rgba(191,83,33,.7)' }, { boxShadow: '0 0 0 22px rgba(191,83,33,0)', duration: 1, repeat: 2, ease: 'power2.out' });
  };
  const etapaCozinha = (z) => {
    const k = z < 0 ? 0 : z < .5 ? 1 : 2;
    cols.forEach((c, i) => c.classList.toggle('acesa', i === k));
    return ['Na cozinha · novo', 'Em preparo', 'Pronto'][k];
  };

  /* --- rua --- */
  const etaEl = $('#eta'), etaBarra = $('#etaBarra');
  const rua = (t) => {
    const min = Math.max(0, Math.round(18 * (1 - t)));
    const txt = t >= .995 ? 'Entregue' : `${min} min`;
    if (etaEl.textContent !== txt) etaEl.textContent = txt;
    etaBarra.style.width = (t * 100).toFixed(1) + '%';
    viaEta.textContent = t >= .995 ? 'entregue ✓' : `chega em ${min} min`;
    $('#etapaRua').classList.toggle('on', t > 0); $('#etapaFim').classList.toggle('on', t >= .995);
  };

  /* --- caixa --- */
  const fatEl = $('#fat'), pedEl = $('#ped'), rFat = $('#rFat');
  const caixa = { v: 1170.2, p: 23 };
  let caixaAtivo = false;
  const pintarCaixa = () => { fatEl.textContent = brl(caixa.v); rFat.textContent = brl(caixa.v); pedEl.textContent = Math.round(caixa.p); };
  const chegarCaixa = (sim) => {
    if (sim === caixaAtivo) return; caixaAtivo = sim;
    $('#cardFat').classList.toggle('chegou', sim);
    $('#fatSelo').textContent = sim ? '↑ 18% sobre a última sexta' : '↑ 12% sobre a última sexta';
    $('#rNovos').textContent = sim ? '6 de 24' : '5 de 23';
    $('#topA').textContent = sim ? '144' : '142'; $('#topB').textContent = sim ? '98' : '97';
    const fim = { v: sim ? 1240 : 1170.2, p: sim ? 24 : 23 };
    if (!temGsap) { Object.assign(caixa, fim); pintarCaixa(); return; }
    gsap.to(caixa, { ...fim, duration: anima ? 1.4 : 0, ease: 'power3.out', overwrite: true, onUpdate: pintarCaixa });
    gsap.to('#barraHoje', { height: sim ? '100%' : '80%', duration: anima ? 1.2 : 0, ease: 'elastic.out(1, .6)' });
  };

  /* --- volta --- */
  let voltaAtiva = false;
  const chegarVolta = (sim) => {
    if (sim === voltaAtiva) return; voltaAtiva = sim;
    if (!sim || !anima) return;
    gsap.fromTo('#mpNovo', { y: -16, opacity: 0, scale: .96 }, { y: 0, opacity: 1, scale: 1, duration: .8, ease: 'back.out(1.8)' });
    gsap.fromTo('#cupom', { rotate: -2 }, { rotate: 0, duration: .9, ease: 'elastic.out(1, .4)' });
  };

  /* --- parallax do hero, sem ScrollTrigger: só o que a primeira dobra usa --- */
  const hero = $('#topo'), cel = $('#cel'), fat = $('.flutua--fat'), av = $('.flutua--av'), bolha = $('.bolha--a');
  let ultimoHero = -1;
  const parallax = () => {
    if (!anima) return;
    const p = clamp(scrollY / (hero.offsetHeight || 1), 0, 1);
    if (Math.abs(p - ultimoHero) < .002) return; ultimoHero = p;
    gsap.set(cel, { y: -40 * p }); gsap.set(fat, { y: -90 * p }); gsap.set(av, { y: 60 * p }); gsap.set(bolha, { yPercent: 40 * p });
  };

  let antes = { x: 0, y: 0 };
  const quadro = () => {
    const v = viagem;
    v.alvo = alvoDaRolagem();
    v.l += (v.alvo - v.l) * (anima ? .12 : 1);
    if (Math.abs(v.alvo - v.l) < .2) v.l = v.alvo;
    const p = base.getPointAtLength(v.l);
    const vx = p.x - antes.x; antes = p;
    viajante.style.transform = `translate(${(p.x - viajante.offsetWidth / 2).toFixed(1)}px, ${(p.y - viajante.offsetHeight / 2).toFixed(1)}px)`;
    if (anima) via.style.rotate = clamp(vx * .6, -10, 10).toFixed(2) + 'deg';
    feito.style.strokeDashoffset = (v.total - v.l).toFixed(1);

    const S = v.stopL, l = v.l, z = v.zona;
    let fase = 0; for (let i = 0; i < S.length; i++) if (l >= S[i] - 6) fase = i;
    const entre = (i) => clamp((l - S[i]) / ((S[i + 1] - S[i]) || 1), 0, 1);

    if (fase === 0) { setModo('pedido'); setStatus(l > 12 ? 'Indo para a cozinha' : 'Pedido feito no celular'); setRegua(l > S[1] * .5 ? 1 : 0); rua(0); }
    if (fase === 1) { setModo('pedido'); setStatus(etapaCozinha(z[1] ?? 1)); setRegua(1); rua(0); }
    if (fase === 2) { const t = entre(2); setModo(t > .02 ? 'moto' : 'pedido'); setStatus('Pronto, chamando motoboy'); setRegua(2); rua(t); }
    if (fase === 3) { const t = entre(3); setModo(t < .12 ? 'moto' : 'moeda'); setStatus('Entregue'); setRegua(3); rua(1); }
    if (fase === 4) { const t = entre(4); setModo(t < .15 ? 'moeda' : 'aval'); setRegua(t > .5 ? 4 : 3); }
    if (fase === 5) { setModo('aval'); setRegua(entre(5) > .5 ? 5 : 4); }
    if (fase === 6) { setModo('aval'); setRegua(5); }
    chegarCozinha(fase >= 1 && fase <= 2 && l < S[2] - 40);
    chegarCaixa(fase >= 4);
    chegarVolta(fase >= 5);
    parallax();
    requestAnimationFrame(quadro);
  };

  /* ================= peças menores ================= */
  addEventListener('scroll', () => $('#nav').classList.toggle('solida', scrollY > 20), { passive: true });

  // Relógios dos pedidos em preparo, para a cozinha parecer viva.
  if (!reduz) setInterval(() => $$('[data-relogio]').forEach(el => {
    const s = +el.dataset.relogio + 1; el.dataset.relogio = s;
    el.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }), 1000);

  // As barras do painel crescem quando o painel aparece.
  if (anima && 'IntersectionObserver' in window) {
    const barras = $$('.barras i:not(.hoje)');
    new IntersectionObserver((entradas, obs) => {
      if (!entradas.some(e => e.isIntersecting)) return; obs.disconnect();
      gsap.fromTo(barras, { scaleY: .1 }, { scaleY: 1, stagger: .06, duration: 1, ease: 'elastic.out(1, .7)' });
    }, { threshold: .3 }).observe($('#painel'));
  }

  // Mensal ou anual: o preço rola, e o link do /assinar leva o ciclo.
  const bola = $('#cicloBola');
  const posBola = (btn) => { bola.style.left = btn.offsetLeft + 'px'; bola.style.width = btn.offsetWidth + 'px'; };
  $$('#ciclo button').forEach(b => b.addEventListener('click', () => {
    $$('#ciclo button').forEach(x => x.setAttribute('aria-pressed', String(x === b))); posBola(b);
    const anual = b.dataset.ciclo === 'ANUAL';
    $$('.preco .man').forEach(el => {
      const novo = anual ? el.dataset.anual : el.dataset.mensal;
      if (anima) gsap.timeline().to(el, { yPercent: -60, opacity: 0, duration: .22, ease: 'power2.in' })
        .call(() => { el.textContent = novo; })
        .fromTo(el, { yPercent: 60, opacity: 0 }, { yPercent: 0, opacity: 1, duration: .5, ease: EASE });
      else el.textContent = novo;
    });
    $$('[data-sufixo]').forEach(s => { s.textContent = anual ? '/ano' : '/mês'; });
    $$('.preco__alt').forEach(s => { s.textContent = anual ? s.dataset.altAnual : s.dataset.altMensal; });
    $$('.cta-plano').forEach(a => { a.href = `/assinar?plano=${a.dataset.plano}&ciclo=${b.dataset.ciclo}`; });
  }));

  // Cartões de plano inclinam com o cursor e os botões principais são
  // magnéticos. Só com mouse: em toque o "hover" dispara no toque e fica preso.
  if (anima && matchMedia('(hover: hover)').matches) {
    $$('[data-tilt]').forEach(c => {
      // rotationX/rotationY, não rotateX: com "rotate" o GSAP escreve uma
      // propriedade CSS que o navegador ignora, e a falha é muda.
      const rx = gsap.quickTo(c, 'rotationX', { duration: .4, ease: 'power3.out' });
      const ry = gsap.quickTo(c, 'rotationY', { duration: .4, ease: 'power3.out' });
      c.addEventListener('mousemove', e => { const r = c.getBoundingClientRect(); ry(((e.clientX - r.left) / r.width - .5) * 10); rx((.5 - (e.clientY - r.top) / r.height) * 10); });
      c.addEventListener('mouseleave', () => { rx(0); ry(0); });
    });
    $$('.ima').forEach(b => {
      const mx = gsap.quickTo(b, 'x', { duration: .5, ease: 'power3.out' }), my = gsap.quickTo(b, 'y', { duration: .5, ease: 'power3.out' });
      b.addEventListener('mousemove', e => { const r = b.getBoundingClientRect(); mx((e.clientX - r.left - r.width / 2) * .25); my((e.clientY - r.top - r.height / 2) * .35); });
      b.addEventListener('mouseleave', () => { mx(0); my(0); });
    });
  }

  // FAQ: <details> de verdade, com a altura animada por cima.
  $$('.faq details').forEach(d => {
    const s = $('summary', d), resp = $('.faq__resp', d);
    s.addEventListener('click', e => {
      if (!anima) return;
      e.preventDefault();
      if (d.open) gsap.to(resp, { height: 0, duration: .45, ease: 'power3.inOut', onComplete: () => { d.open = false; resp.style.height = ''; } });
      else { d.open = true; gsap.fromTo(resp, { height: 0 }, { height: resp.scrollHeight, duration: .6, ease: EASE, onComplete: () => { resp.style.height = ''; } }); }
    });
  });

  /* ================= partida ================= */
  const partir = () => {
    posBola($('#ciclo button'));
    montarTrilho();
    viagem.l = alvoDaRolagem();
    requestAnimationFrame(quadro);
    montarDemo();
    // Sem abertura armada, ninguém mais dá a partida no hero.
    if (!raiz.hasAttribute('data-intro')) iniciar();
  };
  let espera;
  const remontar = () => {
    clearTimeout(espera);
    espera = setTimeout(() => { montarTrilho(); posBola($('#ciclo button[aria-pressed="true"]')); }, 150);
  };
  addEventListener('resize', remontar);
  // Fonte e foto que chegam depois mudam a altura das seções, e com ela as
  // paradas: o trilho se remonta sozinho.
  if ('ResizeObserver' in window) new ResizeObserver(remontar).observe(document.body);
  if (document.readyState === 'complete') partir(); else addEventListener('load', partir);
})();
