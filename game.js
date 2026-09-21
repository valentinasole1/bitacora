/* The pond — a tiny retro fishing game at the end of the page.
   Vanilla JS, no dependencies. Pixel art is drawn on a low-res canvas
   and scaled up with image-rendering: pixelated. */
(() => {
  const canvas = document.getElementById('pond');
  const startBtn = document.getElementById('pond-start');
  if (!canvas || !canvas.getContext) return;
  const ctx = canvas.getContext('2d');
  const MONO = '"IBM Plex Mono", ui-monospace, Menlo, monospace';
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ── palette (site colours + water) ─────────────────────────────
  const C = {
    sky: '#2d2c2a', surf: '#c3cdf0', foam: '#7e93cf',
    water: ['#3d5aa8', '#2f478c', '#24356e', '#1a2750', '#121b3a'],
    sand: '#6f6a5e', sand2: '#5b574d', weed: '#3f7a5a', weed2: '#2f5e45',
    hull: '#8a5a3c', hullD: '#5b3a26', skin: '#e8b58f', hat: '#eae6df', eye: '#1c1b19',
    shirt: '#b5483a', pants: '#24356e', rod: '#d9c9a3', line: '#eae6df',
    bubble: '#9fb0e0', text: '#f1eee8'
  };

  // ── sprites ('.' = transparent) ────────────────────────────────
  const BOAT = [
    '..hhhhhhhhhhhhhhhhhhhhhh..',
    '.hHHHHHHHHHHHHHHHHHHHHHHh.',
    '..hHHHHHHHHHHHHHHHHHHHHh..',
    '...hhhhhhhhhhhhhhhhhhhh...'
  ];
  const GUY = [
    '..aaaa..',
    '.aaaaaa.',
    '..ssss..',
    '..sese..',
    '..ssss..',
    '.rrrrrr.',
    'rrrrrrrr',
    'rrrrrrrr',
    '.pp..pp.',
    '.pp..pp.'
  ];
  const FISH = {
    s: [
      't...fff..',
      'tt.fffef.',
      'tttffffff',
      'tt.ffff..',
      't...ff...'
    ],
    m: [
      't.....fffff..',
      'tt...fffffff.',
      'ttt.ffffffeff',
      'tttttfffffff.',
      'ttt.ffffffff.',
      'tt...fffffff.',
      't.....fffff..'
    ],
    l: [
      't.......ffffff....',
      'tt.....ffffffff...',
      'ttt...ffffffffff..',
      'tttt.ffffffffffeff',
      'ttttttfbbbbbbbbbf.',
      'tttt.ffbbbbbbbbff.',
      'ttt...ffbbbbbbff..',
      'tt.....ffffffff...',
      't.......ffffff....'
    ]
  };
  // small fish swim shallow and fast, big ones deep and slow
  const SPECIES = [
    { key: 's', body: '#e8853a', tail: '#c96a2a', speed: [16, 26], depth: [0, .45] },
    { key: 's', body: '#e6c454', tail: '#c9a83a', speed: [18, 28], depth: [0, .5] },
    { key: 'm', body: '#5fc2b5', tail: '#3f9c90', speed: [11, 18], depth: [.25, .75] },
    { key: 'm', body: '#d98bb0', tail: '#b76a90', speed: [10, 17], depth: [.3, .8] },
    { key: 'l', body: '#7e93cf', tail: '#5b6fa8', belly: '#c9d2ee', speed: [7, 12], depth: [.55, 1] },
    { key: 'l', body: '#c9c5bc', tail: '#9a968d', belly: '#eae6df', speed: [6, 11], depth: [.6, 1] }
  ];

  const HOOK_DX = 27;   // rod tip, relative to the boat's left edge
  const SAND = 10;

  // ── state ───────────────────────────────────────────────────────
  let W = 320, H = 200, SURF = 44;
  const boat = { x: 40, target: 40, w: BOAT[0].length };
  const hook = { state: 'idle', y: 0, fish: null };
  let fish = [], bubbles = [], weeds = [], parts = [], texts = [];
  let caught = 0, best = 0, started = false, inView = false, t = 0, last = 0, raf = 0;
  const keys = { left: false, right: false };
  try { best = parseInt(localStorage.getItem('pond.best'), 10) || 0; } catch (e) { /* private mode */ }

  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const pad = n => String(n).padStart(2, '0');

  // ── drawing helpers ─────────────────────────────────────────────
  function drawSprite(rows, pal, x, y, flip) {
    for (let r = 0; r < rows.length; r++) {
      const row = rows[r];
      for (let c = 0; c < row.length; c++) {
        const col = pal[row[c]];
        if (!col) continue;
        ctx.fillStyle = col;
        ctx.fillRect(x + (flip ? row.length - 1 - c : c), y + r, 1, 1);
      }
    }
  }
  function pixLine(x0, y0, x1, y1, col) {   // Bresenham, so the rod and line stay crisp
    ctx.fillStyle = col;
    let dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      ctx.fillRect(x0, y0, 1, 1);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }

  // ── world ───────────────────────────────────────────────────────
  const surfaceY = x => SURF + Math.sin(x * 0.09 + t * 2.2) * 1.4 + Math.sin(x * 0.031 - t * 1.1) * 1.1;
  const boatY = () => Math.round(surfaceY(boat.x + boat.w / 2)) - 3;
  function rodTip() {
    const gx = Math.round(boat.x) + 4, gy = boatY() - GUY.length + 1;
    return { x: gx + 23, y: gy - 6, hx: gx + 8, hy: gy + 6 };
  }
  function newBubble(anyY) {
    return { x: rand(0, W), y: anyY ? rand(SURF + 10, H - SAND) : H - SAND - 1, r: Math.random() < .3 ? 2 : 1, sp: rand(6, 14), ph: rand(0, 6.3) };
  }
  function spawnFish(fromEdge) {
    const sp = SPECIES[Math.floor(Math.random() * SPECIES.length)];
    const rows = FISH[sp.key], w = rows[0].length, h = rows.length;
    const top = SURF + 8, bot = H - SAND - h - 2;
    const baseY = Math.round(top + (bot - top) * rand(sp.depth[0], sp.depth[1]));
    const dir = Math.random() < .5 ? 1 : -1;
    const x = fromEdge ? (dir === 1 ? -w - 2 : W + 2) : rand(0, W - w);
    return { sp, rows, w, h, x, y: baseY, baseY, dir, speed: rand(sp.speed[0], sp.speed[1]), ph: rand(0, 6.3), fr: rand(1.2, 2.4) };
  }
  function spawnAll() {
    fish = [];
    const n = Math.max(4, Math.round(W / 40));
    for (let i = 0; i < n; i++) fish.push(spawnFish(false));
  }
  function resize() {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const scale = Math.max(2, Math.round(rect.width / 320));
    W = Math.max(160, Math.round(rect.width / scale));
    H = Math.max(120, Math.round(rect.height / scale));
    canvas.width = W; canvas.height = H;
    ctx.imageSmoothingEnabled = false;
    SURF = Math.round(H * 0.22);
    boat.x = clamp(boat.x, 0, W - boat.w);
    boat.target = clamp(boat.target, 0, W - boat.w);
    weeds = [];
    for (let i = 0, n = Math.round(W / 26); i < n; i++) weeds.push({ x: Math.round(rand(2, W - 3)), h: Math.round(rand(6, 18)), ph: rand(0, 6.3) });
    bubbles = [];
    for (let i = 0, n = Math.round(W / 40); i < n; i++) bubbles.push(newBubble(true));
    if (!fish.length) spawnAll();
    else for (const f of fish) f.baseY = clamp(f.baseY, SURF + 8, H - SAND - f.h - 2);
    if (hook.state === 'idle') hook.y = rodTip().y + 6;
    draw();
  }

  // ── game logic ──────────────────────────────────────────────────
  function cast() {
    if (hook.state === 'idle') hook.state = 'casting';
    else if (hook.state === 'casting') hook.state = 'reeling';
  }
  function hits(hx, hy, f) {
    return hx + 2 >= f.x && hx - 2 <= f.x + f.w && hy + 5 >= f.y && hy <= f.y + f.h;
  }
  function splash(x, y) {
    for (let i = 0; i < 7; i++) parts.push({ x, y, vx: rand(-22, 22), vy: rand(-45, -15), life: 1 });
  }
  function land(f) {
    caught++;
    if (caught > best) { best = caught; try { localStorage.setItem('pond.best', String(best)); } catch (e) { /* ignore */ } }
    const tip = rodTip();
    texts.push({ x: tip.x, y: tip.y - 4, s: '+1', life: 1 });
    fish.splice(fish.indexOf(f), 1);
    hook.fish = null;
    setTimeout(() => { if (fish.length < Math.max(4, Math.round(W / 40))) fish.push(spawnFish(true)); }, 1200);
  }
  function update(dt) {
    t += dt;
    if (keys.left) boat.target -= 70 * dt;
    if (keys.right) boat.target += 70 * dt;
    boat.target = clamp(boat.target, 0, W - boat.w);
    const d = boat.target - boat.x, step = 60 * dt;
    boat.x += Math.abs(d) < step ? d : Math.sign(d) * step;

    const pace = Math.min(1.6, 1 + caught * 0.03);
    for (const f of fish) {
      if (f === hook.fish) continue;
      f.x += f.dir * f.speed * pace * dt;
      f.y = f.baseY + Math.sin(t * f.fr + f.ph) * 2;
      if (f.dir === 1 && f.x > W + 4) { f.x = -f.w - 4; }
      else if (f.dir === -1 && f.x < -f.w - 4) { f.x = W + 4; }
    }

    const tip = rodTip();
    const maxY = H - SAND - 6;
    if (hook.state === 'casting') {
      const prev = hook.y;
      hook.y += 45 * dt;
      const sy = surfaceY(tip.x);
      if (prev < sy && hook.y >= sy) splash(tip.x, sy);
      if (hook.y >= maxY) { hook.y = maxY; hook.state = 'reeling'; }
    } else if (hook.state === 'reeling') {
      hook.y -= (hook.fish ? 40 : 60) * dt;
      if (hook.fish) { hook.fish.x = tip.x - hook.fish.w / 2; hook.fish.y = hook.y + 3; }
      if (hook.y <= tip.y + 6) {
        hook.y = tip.y + 6;
        if (hook.fish) land(hook.fish);
        hook.state = 'idle';
      }
    } else {
      hook.y = tip.y + 6;
    }
    if (hook.state !== 'idle' && !hook.fish && hook.y > surfaceY(tip.x)) {
      for (const f of fish) if (hits(tip.x, hook.y, f)) { hook.fish = f; hook.state = 'reeling'; break; }
    }

    for (const b of bubbles) {
      b.y -= b.sp * dt; b.x += Math.sin(t * 2 + b.ph) * 4 * dt;
      if (b.y < surfaceY(b.x) + 1) Object.assign(b, newBubble(false));
    }
    for (const p of parts) { p.vy += 70 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt * 1.8; }
    parts = parts.filter(p => p.life > 0);
    for (const tx of texts) { tx.y -= 12 * dt; tx.life -= dt * 0.9; }
    texts = texts.filter(tx => tx.life > 0);
  }

  // ── render ──────────────────────────────────────────────────────
  function draw() {
    ctx.clearRect(0, 0, W, H);
    // stepped water
    const top = SURF - 4, depth = H - SAND - top, n = C.water.length;
    for (let i = 0; i < n; i++) {
      const y0 = Math.round(top + depth * i / n), y1 = Math.round(top + depth * (i + 1) / n);
      ctx.fillStyle = C.water[i]; ctx.fillRect(0, y0, W, y1 - y0);
    }
    // sand
    ctx.fillStyle = C.sand; ctx.fillRect(0, H - SAND, W, SAND);
    ctx.fillStyle = C.sand2;
    for (let x = 0; x < W; x += 5) ctx.fillRect(x + (x % 2), H - SAND + 3 + ((x / 5) % 4), 2, 1);
    // sky + surface, column by column
    const shimmer = Math.floor(t * 6);
    for (let x = 0; x < W; x++) {
      const sy = Math.round(surfaceY(x));
      ctx.fillStyle = C.sky; ctx.fillRect(x, 0, 1, sy);
      ctx.fillStyle = C.surf; ctx.fillRect(x, sy, 1, 1);
      if ((x + shimmer) % 9 === 0) { ctx.fillStyle = C.foam; ctx.fillRect(x, sy + 1, 1, 1); }
    }
    // weeds
    for (const wd of weeds) {
      for (let i = 0; i < wd.h; i++) {
        const sway = Math.round(Math.sin(t * 1.5 + wd.ph + i * 0.35) * (i / wd.h) * 2);
        ctx.fillStyle = i % 3 === 0 ? C.weed2 : C.weed;
        ctx.fillRect(wd.x + sway, H - SAND - 1 - i, 1, 1);
      }
    }
    // bubbles
    ctx.fillStyle = C.bubble;
    for (const b of bubbles) ctx.fillRect(Math.round(b.x), Math.round(b.y), b.r, b.r);
    // fish
    for (const f of fish) {
      const pal = { f: f.sp.body, t: f.sp.tail, b: f.sp.belly || f.sp.body, e: C.eye };
      drawSprite(f.rows, pal, Math.round(f.x), Math.round(f.y), f.dir === -1);
    }
    // line + hook
    const tip = rodTip();
    const hx = Math.round(tip.x), hy = Math.round(hook.y);
    pixLine(hx, tip.y, hx, hy, C.line);
    ctx.fillStyle = C.line;
    ctx.fillRect(hx, hy, 1, 3); ctx.fillRect(hx - 1, hy + 3, 3, 1); ctx.fillRect(hx + 1, hy + 2, 1, 1);
    // splash
    ctx.fillStyle = C.surf;
    for (const p of parts) ctx.fillRect(Math.round(p.x), Math.round(p.y), 1, 1);
    // boat, guy, rod
    const by = boatY();
    drawSprite(BOAT, { h: C.hullD, H: C.hull }, Math.round(boat.x), by);
    const gx = Math.round(boat.x) + 4, gy = by - GUY.length + 1;
    drawSprite(GUY, { a: C.hat, s: C.skin, e: C.eye, r: C.shirt, p: C.pants }, gx, gy);
    pixLine(tip.hx, tip.hy, tip.x, tip.y, C.rod);
    // floating text + HUD
    ctx.font = `8px ${MONO}`; ctx.textBaseline = 'top'; ctx.fillStyle = C.text;
    for (const tx of texts) { ctx.globalAlpha = Math.max(0, tx.life); ctx.fillText(tx.s, Math.round(tx.x), Math.round(tx.y)); }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left'; ctx.fillText(`CAUGHT ${pad(caught)}`, 4, 4);
    ctx.textAlign = 'right'; ctx.fillText(`BEST ${pad(best)}`, W - 4, 4);
    ctx.textAlign = 'left';
  }

  // ── loop ────────────────────────────────────────────────────────
  function frame(now) {
    raf = 0;
    const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
    last = now;
    update(dt); draw();
    if (inView && (started || !reduceMotion)) raf = requestAnimationFrame(frame);
  }
  function play() {
    if (raf) return;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }
  function start() {
    if (started) return;
    started = true;
    if (startBtn) startBtn.hidden = true;
    canvas.focus({ preventScroll: true });
    play();
  }

  // ── input ───────────────────────────────────────────────────────
  const pointerX = e => (e.clientX - canvas.getBoundingClientRect().left) / canvas.getBoundingClientRect().width * W;
  const aim = e => { boat.target = clamp(pointerX(e) - HOOK_DX, 0, W - boat.w); };
  canvas.addEventListener('pointermove', e => { if (started && (e.pointerType === 'mouse' || e.buttons)) aim(e); });
  canvas.addEventListener('pointerdown', e => {
    if (e.button && e.button !== 0) return;
    e.preventDefault();
    const fresh = !started;
    start(); aim(e);
    if (!fresh) cast();
  });
  if (startBtn) startBtn.addEventListener('click', start);
  window.addEventListener('keydown', e => {
    if (!started || !inView || e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.target !== canvas && /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(e.target.tagName)) return;
    switch (e.key) {
      case 'ArrowLeft': case 'a': case 'A': keys.left = true; break;
      case 'ArrowRight': case 'd': case 'D': keys.right = true; break;
      case ' ': case 'Enter': if (!e.repeat) cast(); break;
      default: return;
    }
    e.preventDefault();
  });
  window.addEventListener('keyup', e => {
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') keys.left = false;
    if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') keys.right = false;
  });
  window.addEventListener('blur', () => { keys.left = keys.right = false; });

  // ── lifecycle: only animate while the pond is on screen ─────────
  new IntersectionObserver(entries => {
    inView = entries[0].isIntersecting;
    if (inView) play();
  }, { threshold: 0.05 }).observe(canvas);
  new ResizeObserver(resize).observe(canvas);
  resize();
})();
