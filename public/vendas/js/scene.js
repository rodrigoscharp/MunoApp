/* ======================================================
   MUNOFOOD — Cena 3D (Three.js)
   Hamburguer cinematográfico com:
   - Camadas independentes flutuando
   - Iluminação key/fill/rim/bounce
   - Paralaxe suavizado com mouse
   - Pizza detalhada ao lado
   - Materiais físicos (clearcoat) + geometria com leve
     ruído orgânico + sombras de contato suaves, pra fugir
     do look "plástico perfeito" de primitivas puras
   ====================================================== */

(function initScene() {
  const container = document.getElementById('canvas-container');
  if (!container || typeof THREE === 'undefined') return;

  /* ── Renderer ─────────────────────────────────────── */
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  container.appendChild(renderer.domElement);

  /* ── Cena & Câmera ────────────────────────────────── */
  const scene  = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(0, 0.4, 6);

  /* ── Iluminação Cinematográfica ───────────────────── */
  // Luz ambiente suave — quente
  scene.add(new THREE.AmbientLight(0xffeedd, 0.42));

  // Key light — quente, de cima-direita
  const keyLight = new THREE.DirectionalLight(0xfff8e8, 1.6);
  keyLight.position.set(4, 6, 5);
  scene.add(keyLight);

  // Fill light — fria, da esquerda
  const fillLight = new THREE.DirectionalLight(0xd0e4ff, 0.40);
  fillLight.position.set(-5, 2, 3);
  scene.add(fillLight);

  // Rim light — terracota, de trás (dá brilho característico da marca)
  const rimLight = new THREE.PointLight(0xc6562a, 2.2, 20);
  rimLight.position.set(-3, 4, -5);
  scene.add(rimLight);

  // Bounce light — quente embaixo (simula balcão)
  const bounceLight = new THREE.PointLight(0xffaa44, 0.55, 14);
  bounceLight.position.set(1, -5, 3);
  scene.add(bounceLight);

  // Specular light — ponto pequeno e forte só pra criar highlight
  // definido (brilho de "foto de cardápio") no queijo/molho/tomate
  const specLight = new THREE.PointLight(0xffffff, 0.9, 10);
  specLight.position.set(2, 3, 6);
  scene.add(specLight);

  /* ── Ruído barato (determinístico, sem lib externa) ─── */
  // Soma de senoides em frequências diferentes — não é Perlin de
  // verdade, mas quebra a perfeição das primitivas por uma fração
  // do custo, o suficiente pra crosta/queijo pararem de parecer
  // extrudados no torno.
  function noise3(x, y, z) {
    return (
      Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 0.5 +
      Math.sin(x * 4.5 - y * 3.1 + z * 6.2) * 0.3 +
      Math.sin(x * 20.1 + y * 11.7 - z * 9.4) * 0.2
    );
  }

  // Desloca cada vértice ao longo de Y usando ruído de (x, z) — dá
  // ondulação orgânica vertical (crosta, queijo, carne) sem alterar
  // o contorno/silhueta da peça.
  function wobbleY(geometry, amount, freq = 3, seed = 0) {
    const pos = geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const n = noise3(x * freq + seed, z * freq + seed, seed * 0.7);
      pos.setY(i, y + n * amount);
    }
    pos.needsUpdate = true;
    geometry.computeVertexNormals();
    return geometry;
  }

  // Desloca radialmente a partir da origem — usado no domo do pão
  // (esfera) pra tirar a curvatura perfeita de bolha de sabão.
  function wobbleRadial(geometry, amount, freq = 4, seed = 0) {
    const pos = geometry.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const n = noise3(v.x * freq + seed, v.y * freq, v.z * freq + seed);
      const len = v.length() || 1;
      v.addScaledVector(v, (n * amount) / len);
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    pos.needsUpdate = true;
    geometry.computeVertexNormals();
    return geometry;
  }

  /* ── Texturas procedurais (canvas, sem assets externos) ── */
  // Crosta do pão: gradiente de tostado + manchas aleatórias, usado
  // como color map — sem isso todo pão é uma cor sólida uniforme.
  function makeBunTexture(base, toasted) {
    const size = 256;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d');
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, size, size);
    const grad = ctx.createRadialGradient(size / 2, size / 2, size * 0.1, size / 2, size / 2, size * 0.6);
    grad.addColorStop(0, base);
    grad.addColorStop(1, toasted);
    ctx.fillStyle = grad;
    ctx.globalAlpha = 0.55;
    ctx.fillRect(0, 0, size, size);
    ctx.globalAlpha = 1;
    // manchas de tostado aleatórias
    for (let i = 0; i < 60; i++) {
      const x = Math.random() * size, y = Math.random() * size;
      const r = 3 + Math.random() * 9;
      ctx.beginPath();
      ctx.fillStyle = toasted;
      ctx.globalAlpha = 0.10 + Math.random() * 0.18;
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    const tex = new THREE.CanvasTexture(c);
    tex.encoding = THREE.sRGBEncoding;
    return tex;
  }

  // Sombra de contato: disco com borda esmaecida em vez de opacidade
  // plana — uma sombra "dura" de disco sólido é o que mais entrega
  // "objeto 3D colado num fundo 2D".
  function makeSoftShadowTexture() {
    const size = 256;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d');
    const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grad.addColorStop(0, 'rgba(6,18,9,0.38)');
    grad.addColorStop(0.6, 'rgba(6,18,9,0.20)');
    grad.addColorStop(1, 'rgba(6,18,9,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
    return new THREE.CanvasTexture(c);
  }
  const softShadowTex = makeSoftShadowTexture();

  function addContactShadow(parent, radius, y) {
    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(radius, 40),
      new THREE.MeshBasicMaterial({ map: softShadowTex, transparent: true, depthWrite: false })
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = y;
    parent.add(shadow);
    return shadow;
  }

  /* ── Helpers de Material ───────────────────────────── */
  // Fosco (pão, carne, bacon) — sem brilho de plástico
  const matteMat = (color, roughness = 0.8, map = null) =>
    new THREE.MeshStandardMaterial({ color, roughness, metalness: 0, map });

  // Glossy/molhado (queijo, molho, tomate, pepperoni) — clearcoat
  // simula a camada de gordura/suco que reflete luz de verdade
  const glossyMat = (color, roughness = 0.35, clearcoat = 0.6) =>
    new THREE.MeshPhysicalMaterial({
      color, roughness, metalness: 0,
      clearcoat, clearcoatRoughness: 0.25,
    });

  /* ── HAMBURGUER ────────────────────────────────────── */
  function createBurger() {
    const root   = new THREE.Group();
    const layers = []; // para float independente por camada
    let y = -1.05;     // posição inicial (base do pão de baixo)

    function addLayer(mesh, amp, speed, phase) {
      mesh.position.y = y;
      root.add(mesh);
      layers.push({ mesh, baseY: y, amp, speed, phase });
    }

    const bunTex = makeBunTexture('#d49030', '#93591c');

    // --- Pão de baixo ---
    const bbGrp = new THREE.Group();
    const bbBase = new THREE.Mesh(
      wobbleY(new THREE.CylinderGeometry(0.84, 0.78, 0.30, 48, 4), 0.012, 5, 1.1),
      matteMat(0xffffff, 0.80, bunTex)
    );
    bbGrp.add(bbBase);
    const toastDisc = new THREE.Mesh(
      new THREE.CylinderGeometry(0.83, 0.83, 0.022, 48),
      matteMat(0xb87020, 0.90)
    );
    toastDisc.position.y = 0.16;
    bbGrp.add(toastDisc);
    addLayer(bbGrp, 0.010, 1.00, 0.00);
    y += 0.26;

    // --- Hambúrguer 1 (carne grelhada) ---
    const p1Grp = new THREE.Group();
    const patty1 = new THREE.Mesh(
      wobbleY(new THREE.CylinderGeometry(0.92, 0.88, 0.22, 48, 3), 0.020, 3.5, 2.4),
      matteMat(0x3e1a08, 0.92)
    );
    p1Grp.add(patty1);
    const char1 = new THREE.Mesh(
      new THREE.TorusGeometry(0.90, 0.045, 6, 48),
      matteMat(0x1a0602, 1.0)
    );
    char1.rotation.x = Math.PI / 2;
    p1Grp.add(char1);
    addLayer(p1Grp, 0.009, 0.93, 0.35);
    y += 0.24;

    // --- Queijo com gotinhos derretidos ---
    const cheeseGrp = new THREE.Group();
    const cheeseMatShared = glossyMat(0xffc21a, 0.32, 0.7);
    cheeseGrp.add(new THREE.Mesh(
      wobbleY(new THREE.BoxGeometry(1.58, 0.065, 1.58, 12, 1, 12), 0.014, 4, 3.3),
      cheeseMatShared
    ));
    [[1, 0], [0, 1], [-1, 0], [0, -1]].forEach(([cx, cz]) => {
      const drip = new THREE.Mesh(new THREE.ConeGeometry(0.10, 0.22, 6), cheeseMatShared);
      drip.position.set(cx * 0.72, -0.13, cz * 0.72);
      if (cx !== 0) drip.rotation.z = cx * 0.55;
      if (cz !== 0) drip.rotation.x = cz * 0.55;
      cheeseGrp.add(drip);
    });
    addLayer(cheeseGrp, 0.008, 1.12, 0.70);
    y += 0.12;

    // --- Bacon (2 tiras cruzadas) ---
    const baconGrp = new THREE.Group();
    [{ rx: 0.22, color: 0xa03018 }, { rx: -0.22, color: 0x7a1e08 }].forEach(({ rx, color }, i) => {
      const strip = new THREE.Mesh(
        wobbleY(new THREE.BoxGeometry(1.65, 0.055, 0.27, 14, 1, 3), 0.018, 6, i * 5),
        glossyMat(color, 0.5, 0.4)
      );
      strip.rotation.y = rx;
      baconGrp.add(strip);
    });
    addLayer(baconGrp, 0.010, 0.87, 1.05);
    y += 0.11;

    // --- Tomate com sementes ---
    const tomGrp = new THREE.Group();
    tomGrp.add(new THREE.Mesh(
      new THREE.CylinderGeometry(0.80, 0.80, 0.11, 48),
      glossyMat(0xd42818, 0.28, 0.75)
    ));
    const seedMat = matteMat(0xffcc88, 0.65);
    for (let i = 0; i < 7; i++) {
      const a    = (i / 7) * Math.PI * 2;
      const seed = new THREE.Mesh(
        new THREE.CylinderGeometry(0.035, 0.035, 0.025, 6),
        seedMat
      );
      seed.position.set(Math.cos(a) * 0.44, 0.07, Math.sin(a) * 0.44);
      tomGrp.add(seed);
    }
    addLayer(tomGrp, 0.011, 1.04, 1.40);
    y += 0.15;

    // --- Alface frisada (9 folhas em arco de torus) ---
    const letGrp = new THREE.Group();
    for (let i = 0; i < 9; i++) {
      const angle = (i / 9) * Math.PI * 2;
      const leaf  = new THREE.Mesh(
        new THREE.TorusGeometry(0.52, 0.20, 5, 7, Math.PI * 0.65),
        matteMat(i % 2 === 0 ? 0x4a9e40 : 0x327830, 0.75)
      );
      leaf.rotation.y = angle;
      leaf.rotation.x = 0.32 + (i % 3) * 0.10;
      leaf.position.set(Math.cos(angle) * 0.28, 0, Math.sin(angle) * 0.28);
      letGrp.add(leaf);
    }
    addLayer(letGrp, 0.013, 0.91, 1.75);
    y += 0.32;

    // --- Hambúrguer 2 ---
    const p2Grp = new THREE.Group();
    const patty2 = new THREE.Mesh(
      wobbleY(new THREE.CylinderGeometry(0.90, 0.86, 0.20, 48, 3), 0.020, 3.5, 5.1),
      matteMat(0x3e1a08, 0.92)
    );
    p2Grp.add(patty2);
    const char2 = new THREE.Mesh(
      new THREE.TorusGeometry(0.88, 0.040, 6, 48),
      matteMat(0x1a0602, 1.0)
    );
    char2.rotation.x = Math.PI / 2;
    p2Grp.add(char2);
    addLayer(p2Grp, 0.009, 0.96, 2.10);
    y += 0.22;

    // --- Pão de cima (domo) + gergelim ---
    const tbGrp = new THREE.Group();
    const domeGeo = wobbleRadial(
      new THREE.SphereGeometry(0.90, 48, 24, 0, Math.PI * 2, 0, Math.PI * 0.56),
      0.018, 3.2, 7.7
    );
    tbGrp.add(new THREE.Mesh(domeGeo, matteMat(0xffffff, 0.68, bunTex)));
    // Anel da base do pão
    const bunRing = new THREE.Mesh(
      new THREE.CylinderGeometry(0.89, 0.89, 0.065, 48),
      matteMat(0xc88020, 0.80)
    );
    bunRing.position.y = -0.02;
    tbGrp.add(bunRing);
    // Gergelim (14 sementes distribuídas na curvatura)
    const sesMat = matteMat(0xf2e090, 0.42);
    for (let i = 0; i < 14; i++) {
      const theta = (0.15 + Math.random() * 0.38) * Math.PI;
      const phi   = Math.random() * Math.PI * 2;
      const s = new THREE.Mesh(new THREE.SphereGeometry(0.048, 7, 5), sesMat);
      s.position.set(
        0.90 * Math.sin(theta) * Math.cos(phi),
        0.90 * Math.cos(theta),
        0.90 * Math.sin(theta) * Math.sin(phi)
      );
      tbGrp.add(s);
    }
    addLayer(tbGrp, 0.015, 1.00, 2.45);

    // Sombra de contato suave embaixo
    addContactShadow(root, 1.05, -1.18);

    root.userData.layers = layers;
    return root;
  }

  /* ── PIZZA ─────────────────────────────────────────── */
  function createPizza() {
    const g = new THREE.Group();
    const doughTex = makeBunTexture('#dfb070', '#a8702e');

    // Massa
    g.add(new THREE.Mesh(
      wobbleY(new THREE.CylinderGeometry(1.28, 1.22, 0.13, 52, 3), 0.015, 3, 9.4),
      matteMat(0xffffff, 0.82, doughTex)
    ));
    // Borda elevada
    const edge = new THREE.Mesh(new THREE.TorusGeometry(1.20, 0.11, 8, 52), matteMat(0xc99040, 0.78, doughTex));
    edge.rotation.x = Math.PI / 2;
    edge.position.y  = 0.05;
    g.add(edge);

    // Molho
    const sauce = new THREE.Mesh(new THREE.CylinderGeometry(1.13, 1.13, 0.025, 52), glossyMat(0xc42818, 0.40, 0.5));
    sauce.position.y = 0.08;
    g.add(sauce);

    // Queijo (levemente ondulado, como queijo derretido de verdade)
    const cheese = new THREE.Mesh(
      wobbleY(new THREE.CylinderGeometry(1.10, 1.10, 0.025, 52, 4), 0.020, 3.5, 4.2),
      glossyMat(0xfff0c0, 0.30, 0.65)
    );
    cheese.position.y = 0.10;
    g.add(cheese);

    // Pepperoni
    const pepMat = glossyMat(0xb02018, 0.35, 0.6);
    [{ x: .5, z: .4 }, { x: -.45, z: .55 }, { x: -.6, z: -.3 },
     { x: .35, z: -.65 }, { x: 0, z: 0 }, { x: .7, z: -.1 }, { x: -.15, z: .8 }]
      .forEach(p => {
        const pep = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.045, 20), pepMat);
        pep.position.set(p.x, 0.13, p.z);
        g.add(pep);
      });

    // Manjericão
    const leafMat = matteMat(0x2e7a28, 0.75);
    for (let i = 0; i < 4; i++) {
      const a    = (i / 4) * Math.PI * 2 + 0.5;
      const leaf = new THREE.Mesh(new THREE.CylinderGeometry(0.10, 0.10, 0.015, 6), leafMat);
      leaf.position.set(Math.cos(a) * 0.55, 0.13, Math.sin(a) * 0.55);
      leaf.scale.set(1, 1, 0.55);
      g.add(leaf);
    }

    addContactShadow(g, 1.35, -0.10);

    g.rotation.x = 0.48;
    return g;
  }

  /* ── Instanciar objetos ─────────────────────────────── */
  const burger = createBurger();
  const pizza  = createPizza();
  scene.add(burger, pizza);

  /* ── Posicionamento responsivo ──────────────────────── */
  let burgerHomeX = 3.9, burgerHomeY = -0.2;
  let pizzaHomeX  = -4.1, pizzaHomeY  = 0.9;

  function updatePositions() {
    const mobile = window.innerWidth < 768;
    if (mobile) {
      burgerHomeX = 1.3;  burgerHomeY = -2.6;
      burger.position.set(burgerHomeX, burgerHomeY, -0.5);
      burger.scale.setScalar(1.1);
      pizzaHomeX = -1.4;  pizzaHomeY = 3.0;
      pizza.position.set(pizzaHomeX, pizzaHomeY, -2);
      pizza.scale.setScalar(0.9);
    } else {
      burgerHomeX = 3.9;  burgerHomeY = -0.2;
      burger.position.set(burgerHomeX, burgerHomeY, 0);
      burger.scale.setScalar(1.75);
      pizzaHomeX = -4.1;  pizzaHomeY = 0.9;
      pizza.position.set(pizzaHomeX, pizzaHomeY, -1.5);
      pizza.scale.setScalar(1.42);
    }
  }
  updatePositions();

  /* ── Mouse com lerp suave ───────────────────────────── */
  let tMX = 0, tMY = 0, cMX = 0, cMY = 0;
  document.addEventListener('mousemove', e => {
    tMX = (e.clientX - window.innerWidth  / 2) / window.innerWidth;
    tMY = (e.clientY - window.innerHeight / 2) / window.innerHeight;
  });

  /* ── Loop de animação ───────────────────────────────── */
  const clock = new THREE.Clock();

  function animate() {
    requestAnimationFrame(animate);
    const t = clock.getElapsedTime();

    // Lerp do mouse
    cMX += (tMX - cMX) * 0.04;
    cMY += (tMY - cMY) * 0.04;

    // ── Burger ──────────────────────────────────────────
    burger.rotation.y  = t * 0.20;
    burger.rotation.x  =  cMY * 0.18;   // inclina para o mouse
    burger.rotation.z  = -cMX * 0.12;

    // Float do grupo (sem acúmulo — usa sin do tempo)
    burger.position.y  = burgerHomeY + Math.sin(t * 0.55) * 0.18;

    // Parallax horizontal suave
    burger.position.x += (burgerHomeX + cMX * 0.35 - burger.position.x) * 0.025;

    // Cada camada respira de forma independente (efeito "exploded")
    (burger.userData.layers || []).forEach(({ mesh, baseY, amp, speed, phase }) => {
      mesh.position.y = baseY + Math.sin(t * speed + phase) * amp;
    });

    // ── Pizza ────────────────────────────────────────────
    pizza.rotation.y  += 0.005;
    pizza.position.y   = pizzaHomeY + Math.sin(t * 0.68 + 2.1) * 0.22;
    pizza.position.x  += (pizzaHomeX - cMX * 0.28 - pizza.position.x) * 0.025;

    renderer.render(scene, camera);
  }

  animate();

  /* ── Redimensionamento ──────────────────────────────── */
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    updatePositions();
  });
})();
