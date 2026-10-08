  /* ============================================================
     キャリブレーション
     ============================================================ */
  function calPoints(n) {
    const m = 0.08, a = [m, 0.5, 1 - m];
    if (n === 3) return [[m, 0.5], [0.5, 0.5], [1 - m, 0.5]];
    if (n === 5) return [[m, m], [1 - m, m], [0.5, 0.5], [m, 1 - m], [1 - m, 1 - m]];
    const p = []; a.forEach(y => a.forEach(x => p.push([x, y]))); return p;
  }
  const VAL_PTS = n => n === 3 ? [[0.28, 0.5], [0.72, 0.5]] : [[0.3, 0.3], [0.7, 0.3], [0.3, 0.7], [0.7, 0.7]];
  // then(c)：キャリブレーションが おわったら よぶ（c は null の ことも ある＝しない で すすむ）
  async function runCalib(then, opt) {
    opt = opt || {};
    const S = await openStage({ showPv: true, onQuit: () => go(renderHome) });
    if (!S) return;
    const n = opt.points || st.calPts, mode = n === 3 ? 'x' : 'xy';
    let phase = 'check', f = null, raf = 0, seq = [], k = 0, t0 = 0, samples = [], vals = [], okT = 0;
    S.pv.style.cssText = 'width:min(420px,60vw);right:50%;transform:translateX(50%);bottom:auto;top:16%';
    const startBtn = h('button', { class: 'big-btn go', type: 'button', onclick: () => begin() }, '▶ はじめる');
    S.center.style.cssText = 'justify-content:flex-end;padding-bottom:6vh';
    S.center.append(h('h2', null, '👀 見る ばしょを あわせます'),
      h('p', null, '顔が 画面に うつるように して、iPad から 30〜50cm くらい（小さい iPad は ちかめ）に します。', h('br'), '「はじめる」の あと、出てくる ひよこを 目で おいかけて もらいます（' + n + 'か所・やく ' + Math.round(n * 2.1 + 9) + 'びょう）。'),
      h('div', { class: 'row', style: 'justify-content:center' }, startBtn, opt.skippable ? h('button', { class: 'pill', type: 'button', onclick: () => { cancelAnimationFrame(raf); then(null); } }, 'あわせないで すすむ') : null));
    runFace((ff, t) => {
      f = ff;
      const [txt, ok] = faceStatus(f); S.setPv(txt, ok);
      if (phase === 'pts' || phase === 'val') {
        const el = t - t0;
        if (el > 700 && el < 1950 && f) (phase === 'pts' ? samples : vals).push({ f, tx: seq[k][0], ty: seq[k][1] });
      }
    });
    function begin() {
      A(); S.center.innerHTML = ''; S.pv.style.cssText = ''; S.pv.hidden = !st.preview;
      seq = shuffle(calPoints(n)); k = 0; phase = 'pts'; t0 = performance.now(); SND.soft();
      say('ひよこを みてね');
      draw();
    }
    function draw() {
      raf = requestAnimationFrame(draw);
      const { W, H } = S.fit(); const g = S.g;
      g.clearRect(0, 0, W, H);
      if (phase !== 'pts' && phase !== 'val') return;
      const el = performance.now() - t0;
      if (el > 2100) {
        k++; t0 = performance.now();
        if (k >= seq.length) {
          if (phase === 'pts') { phase = 'val'; seq = VAL_PTS(n).map(p => p.slice()); k = 0; SND.soft(); }
          else { finish(); return; }
        } else SND.soft();
      }
      const [px, py] = seq[k], x = px * W, y = py * H, p = Math.min(1, (performance.now() - t0) / 2100);
      window.__calTarget = seq[k];   // テスト用
      const R = Math.min(W, H) * (0.07 - 0.045 * p);
      g.fillStyle = phase === 'val' ? 'rgba(12,166,120,.18)' : 'rgba(76,110,245,.16)'; g.beginPath(); g.arc(x, y, R * 2.2, 0, 7); g.fill();
      g.font = Math.round(R * 2) + 'px ' + 'Apple Color Emoji, Segoe UI Emoji, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(phase === 'val' ? '⭐' : '🐥', x, y + Math.sin(performance.now() / 120) * 3);
      g.fillStyle = '#212529'; g.beginPath(); g.arc(x, y, 3, 0, 7); g.fill();
    }
    function finish() {
      cancelAnimationFrame(raf); phase = 'done'; V.onFrame = null;
      // 9点で 計算 → のこりの 点で たしかめ → さいごは ぜんぶの 点で 計算しなおす（点が ふえるほど よい）
      const cal0 = ML.fitCalib(samples, mode);
      const q = cal0 ? ML.validate(cal0, vals) : { err: 1, ex: 1, ey: 1, grade: 'poor', gradeX: 'poor', points: 0 };
      const cal = cal0 ? (ML.fitCalib(samples.concat(vals), mode, { sets: [cal0.set] }) || cal0) : null;
      const { W, H } = S.fit(); S.g.clearRect(0, 0, W, H);
      const GR = { good: ['✅ よい', '3×3 の ばしょ・ヒートマップまで つかえます'], ok: ['🟡 ふつう', '左右・上下（4つ くらいの ばしょ）の くらべに つかえます'], poor: ['🔴 あらい', '顔の 向きだけを つかいます（視線の ばしょは あてに しない）'] }[q.grade];
      S.center.style.cssText = '';
      S.center.innerHTML = '';
      S.center.append(h('h2', null, '結果：' + GR[0]), h('p', null, GR[1], h('br'), 'ずれ：左右 やく ' + Math.round(q.ex * 100) + '%' + (q.ey != null ? '・上下 やく ' + Math.round(q.ey * 100) + '%' : '') + '（画面の 大きさに たいして）' + (q.grade === 'poor' && q.gradeX !== 'poor' ? '　→ 左右だけなら「' + { good: 'よい', ok: 'ふつう' }[q.gradeX] + '」（どっちを みる？ に つかえます）' : '') + (cal ? '' : '　※ 目の 記録が たりませんでした') + (st.debug && cal ? '　[' + cal.set + ' λ' + cal.lam + ' cv' + Math.round(cal.cvErr * 100) + '%]' : '')),
        h('div', { class: 'row', style: 'justify-content:center' },
          cal ? h('button', { class: 'pill', type: 'button', onclick: () => tryGaze(cal) }, '👁 ためしに 見る') : null,
          h('button', { class: 'pill', type: 'button', onclick: () => exportCalib(samples, vals, cal, q) }, '📤 しらべる データ')),
        h('div', { class: 'row', style: 'justify-content:center' },
          h('button', { class: 'big-btn go', type: 'button', disabled: !cal, onclick: async () => { const c = { id: st.kid, cal, quality: q, at: Date.now() }; CAL[st.kid] = c; try { await DB.put('calibs', c); } catch (e) { /* 無視 */ } then(c); } }, '✔ これで つかう'),
          h('button', { class: 'pill', type: 'button', onclick: () => go(() => runCalib(then, opt)) }, '🔁 もういちど'),
          opt.skippable ? h('button', { class: 'pill', type: 'button', onclick: () => then(null) }, 'あわせないで すすむ') : null));
      if (q.grade !== 'poor') SND.ding();
    }
    // 見ている ところに 点を 出す（15びょう）。3×3 の ます目つき
    function tryGaze(cal) {
      const sm = new ML.Smoother(0.25), keep = S.center.innerHTML === '' ? null : Array.from(S.center.childNodes);
      S.center.innerHTML = ''; let p = null, end = performance.now() + 15000, r2 = 0;
      runFace(f => { if (f && !f.blink) p = sm.push(ML.predict(cal, f)); S.setPv(faceStatus(f)[0], faceStatus(f)[1]); });
      const loop = () => {
        const now = performance.now();
        const { W, H } = S.fit(), g = S.g; g.clearRect(0, 0, W, H);
        g.strokeStyle = '#E9ECEF'; g.lineWidth = 2; [1, 2].forEach(i => { g.beginPath(); g.moveTo(W * i / 3, 0); g.lineTo(W * i / 3, H); g.moveTo(0, H * i / 3); g.lineTo(W, H * i / 3); g.stroke(); });
        g.fillStyle = '#868E96'; g.font = '600 16px sans-serif'; g.textAlign = 'center'; g.fillText('見ている ところに 赤い 点が 出ます（のこり ' + Math.ceil((end - now) / 1000) + 'びょう）', W / 2, 30);
        if (p) { const x = clamp(p.x, 0, 1) * W, y = (cal.mode === 'x' ? 0.5 : clamp(p.y, 0, 1)) * H; g.fillStyle = 'rgba(224,49,49,.75)'; g.beginPath(); g.arc(x, y, 22, 0, 7); g.fill(); g.fillStyle = 'rgba(224,49,49,.15)'; g.fillRect(Math.floor(x / (W / 3)) * W / 3, cal.mode === 'x' ? 0 : Math.floor(y / (H / 3)) * H / 3, W / 3, cal.mode === 'x' ? H : H / 3); }
        if (now < end) r2 = requestAnimationFrame(loop); else { V.onFrame = null; g.clearRect(0, 0, W, H); if (keep) keep.forEach(n => S.center.appendChild(n)); }
      };
      r2 = requestAnimationFrame(loop);
    }
    leave = () => { cancelAnimationFrame(raf); stopCam(); };
  }
  // 調整の ための データ（顔の 点から 計算した 数字だけ。映像は ふくまない）
  function exportCalib(samples, vals, cal, q) {
    const pick = s => { const f = s.f; return { tx: s.tx, ty: s.ty, f: { ix: r3(f.ix), ixr: r3(f.ixr), ixl: r3(f.ixl), iy: r3(f.iy), ic: r3(f.ic), icr: r3(f.icr), icl: r3(f.icl), open: r3(f.open), yaw: r1(f.yaw), pitch: r1(f.pitch), roll: r1(f.roll), hx: r1(f.hx), hy: r1(f.hy), hz: r1(f.hz), eyeW: r3(f.eyeW), blink: f.blink, pu: f.pu == null ? null : r3(f.pu), pv: f.pv == null ? null : r3(f.pv), pur: f.pur == null ? null : r3(f.pur), pul: f.pul == null ? null : r3(f.pul), pvr: f.pvr == null ? null : r3(f.pvr), pvl: f.pvl == null ? null : r3(f.pvl), pc: f.pc == null ? null : Math.round(f.pc) } }; };
    const data = { format: 'mieel-manazashi-calib', at: new Date().toISOString(), ua: navigator.userAgent, screen: { w: innerWidth, h: innerHeight, dpr: devicePixelRatio }, video: { w: video.videoWidth, h: video.videoHeight }, quality: q, set: cal && cal.set, samples: samples.map(pick), vals: vals.map(pick) };
    download('まなざしラボ_しらべるデータ_' + new Date().toISOString().slice(0, 16).replace(/[:T]/g, '') + '.json', JSON.stringify(data), 'application/json');
  }
  // 課題の まえ：45分 いないの あわせが あれば つかうか きく
  function withCalib(need, then) {
    const c = calOf(st.kid);
    if (c && (need !== 'xy' || c.cal.mode === 'xy')) {
      const scr = h('section', { class: 'screen', style: 'align-items:center;justify-content:center;gap:16px;text-align:center' },
        h('h2', { class: 't' }, '👀 さっきの 「見る ばしょ あわせ」が あります'),
        h('p', { class: 'help' }, fmtDate(c.at) + '・ずれ やく ' + Math.round(c.quality.err * 100) + '%（' + { good: 'よい', ok: 'ふつう', poor: 'あらい' }[c.quality.grade] + '）', h('br'), 'すわる 場所や iPad の 位置が かわった ときは、あわせなおして ください。'),
        h('div', { class: 'row', style: 'justify-content:center' }, h('button', { class: 'big-btn go', type: 'button', onclick: () => then(c) }, 'これを つかう'), h('button', { class: 'pill', type: 'button', onclick: () => go(() => runCalib(then, { skippable: need === 'opt', points: need === 'xy' && st.calPts === 3 ? 9 : st.calPts })) }, '🔁 あわせなおす')));
      main.appendChild(scr); return;
    }
    runCalib(then, { skippable: need === 'opt', points: need === 'xy' && st.calPts === 3 ? 9 : need === 'x' ? Math.max(3, st.calPts) : st.calPts });
  }
  function needKid() { if (curKid()) return true; toast('さいしょに こどもを えらんで ください'); return false; }
  // 記録を へらして 保存（1びょう 15コマ くらい）
  function thin(stream) { const out = []; let last = -1e9; stream.forEach(s => { if (s.t - last >= 60) { out.push(s); last = s.t; } }); return out; }
  async function saveSession(sess) {
    sess.id = sess.id || uid(); sess.kid = st.kid; sess.at = sess.at || Date.now();
    await DB.put('sessions', sess);
    return sess.id;
  }
  function calInfo(c) { return c ? { grade: c.quality.grade, err: r3(c.quality.err), mode: c.cal.mode } : null; }

  /* ============================================================
     1. どっちを みる？（みくらべ）
     ============================================================ */
  const PAIR_CATS = {
    face: { name: 'かお と もの', a: 'かお', b: 'もの', da: { e: '😊' }, db: { e: '🧸' } },
    move: { name: 'うごく と とまる', a: 'うごく', b: 'とまる', da: { e: '🐠', move: true }, db: { e: '🐠' } },
    color: { name: 'あか と あお', a: 'あか', b: 'あお', da: { circle: '#FA5252' }, db: { circle: '#339AF0' } },
    moji: { name: 'もじ と え', a: 'もじ', b: 'え', da: { text: 'あ' }, db: { e: '🍎' } },
    kira: { name: 'きらきら と ふつう', a: 'きらきら', b: 'ふつう', da: { e: '⭐', sparkle: true }, db: { e: '⭐' } },
    many: { name: 'たくさん と ひとつ', a: 'たくさん', b: 'ひとつ', da: { e: '🍬', grid: true }, db: { e: '🍬' } }
  };
  const IMGCACHE = {};
  async function imgOf(id) { if (IMGCACHE[id]) return IMGCACHE[id]; const r = await DB.get('images', id); if (!r) return null; const im = new Image(); im.src = URL.createObjectURL(r.blob); await new Promise(res => { im.onload = res; im.onerror = res; }); IMGCACHE[id] = im; return im; }
  function drawStim(g, d, x, y, w, hh, t) {
    const s = Math.min(w, hh);
    g.save(); g.textAlign = 'center'; g.textBaseline = 'middle';
    const E = (e, px, py, size) => { g.font = Math.round(size) + 'px Apple Color Emoji, Segoe UI Emoji, sans-serif'; g.fillText(e, px, py); };
    const cx = x + w / 2, cy = y + hh / 2;
    if (d.img) { const im = d.img, k = Math.min(w * 0.9 / im.width, hh * 0.9 / im.height); g.drawImage(im, cx - im.width * k / 2, cy - im.height * k / 2, im.width * k, im.height * k); }
    else if (d.circle) { g.fillStyle = d.circle; g.beginPath(); g.arc(cx, cy, s * 0.3, 0, 7); g.fill(); }
    else if (d.text) { g.fillStyle = '#212529'; g.font = '800 ' + Math.round(s * 0.5) + 'px "Hiragino Maru Gothic ProN", sans-serif'; g.fillText(d.text, cx, cy); }
    else if (d.grid) { for (let i = 0; i < 9; i++) E(d.e, cx + ((i % 3) - 1) * s * 0.22, cy + (Math.floor(i / 3) - 1) * s * 0.22, s * 0.15); }
    else if (d.move) { const a = t / 600; E(d.e, cx + Math.cos(a) * s * 0.18, cy + Math.sin(a * 1.3) * s * 0.12, s * 0.4); }
    else { E(d.e, cx, cy, s * 0.45); if (d.sparkle) for (let i = 0; i < 8; i++) { const a = i / 8 * 6.28 + t / 900, r = s * (0.3 + 0.05 * Math.sin(t / 150 + i)); g.globalAlpha = 0.5 + 0.5 * Math.sin(t / 120 + i * 2); E('✨', cx + Math.cos(a) * r, cy + Math.sin(a) * r, s * 0.1); } }
    g.restore();
  }
  function renderPairSetup() {
    if (!needKid()) { go(renderHome); return; }
    const scr = h('section', { class: 'screen scroll', style: 'gap:12px' });
    const draw = async () => {
      scr.innerHTML = '';
      const customs = (await DB.all('images')).filter(x => x.kind === 'pair');
      scr.append(h('h2', { class: 't' }, '👀 どっちを みる？（みくらべ）'),
        h('p', { class: 'help' }, '左右に 2つ ならべて 見せ、どちらを 長く 見たか・さきに 見たかを はかります。その子が「どんな ものに 目が いきやすいか」を さがします（1つの 組を 左右 入れかえて 2回 ずつ）。'),
        h('div', { class: 'card' }, h('b', null, 'くらべる 組'), h('div', { class: 'row', style: 'margin-top:8px' },
          Object.keys(PAIR_CATS).map(k => { const on = st.pairCats.includes(k); return h('button', { type: 'button', class: 'pill' + (on ? ' on' : ''), onclick: () => { st.pairCats = on ? st.pairCats.filter(x => x !== k) : st.pairCats.concat(k); saveSt(); draw(); } }, (on ? '✅ ' : '') + PAIR_CATS[k].name); }),
          customs.map(c => { const k = 'c:' + c.id, on = st.pairCats.includes(k); return h('button', { type: 'button', class: 'pill' + (on ? ' on' : ''), onclick: () => { st.pairCats = on ? st.pairCats.filter(x => x !== k) : st.pairCats.concat(k); saveSt(); draw(); } }, (on ? '✅ ' : '') + '🖼️ ' + c.name); })),
          h('div', { class: 'row', style: 'margin-top:10px' }, h('button', { class: 'pill', type: 'button', onclick: () => addCustomPair(draw) }, '➕ 写真で 組を つくる'), customs.length ? h('button', { class: 'pill danger', type: 'button', onclick: async () => { const n = prompt('けす 組の なまえ', customs[0].name); const c = customs.find(x => x.name === n); if (c) { await DB.del('images', c.id); await DB.del('images', c.id + ':b'); st.pairCats = st.pairCats.filter(x => x !== 'c:' + c.id); saveSt(); draw(); } } }, '🗑️ 組を けす') : null)),
        h('div', { class: 'card row' }, h('b', null, '1回の 時間'), h('div', { class: 'seg' }, [3, 5, 8].map(v => h('button', { type: 'button', class: st.pairSec === v ? 'on' : '', onclick: () => { st.pairSec = v; saveSt(); draw(); } }, v + 'びょう')))),
        h('div', { class: 'row' }, h('button', { class: 'big-btn go', type: 'button', disabled: !st.pairCats.length, onclick: () => go(() => withCalib('x', c => go(() => runPair(c)))) }, '▶ はじめる（やく ' + Math.round(st.pairCats.length * 2 * (st.pairSec + 1.4)) + 'びょう）')));
    };
    main.appendChild(scr); draw();
  }
  function pickImage() { return new Promise(res => { const fi = $('#fileIn'); fi.accept = 'image/*'; fi.value = ''; fi.onchange = () => res(fi.files && fi.files[0] || null); fi.click(); }); }
  async function shrinkImage(file, max) {
    const im = new Image(); im.src = URL.createObjectURL(file); await new Promise(r => { im.onload = r; im.onerror = r; });
    const k = Math.min(1, (max || 1600) / Math.max(im.width, im.height)), c = document.createElement('canvas'); c.width = Math.round(im.width * k); c.height = Math.round(im.height * k);
    c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
    return new Promise(r => c.toBlob(b => r(b), 'image/jpeg', 0.85));
  }
  async function addCustomPair(done) {
    const name = prompt('組の なまえ（れい：じぶんの かお と ともだち）'); if (!name) return;
    const aLabel = prompt('A の なまえ（れい：じぶん）', 'A') || 'A', bLabel = prompt('B の なまえ（れい：ともだち）', 'B') || 'B';
    toast('A の 写真を えらんで ください'); const fa = await pickImage(); if (!fa) return;
    toast('B の 写真を えらんで ください'); const fb = await pickImage(); if (!fb) return;
    const id = uid();
    await DB.put('images', { id, kind: 'pair', name, aLabel, bLabel, blob: await shrinkImage(fa, 900) });
    await DB.put('images', { id: id + ':b', kind: 'pairb', blob: await shrinkImage(fb, 900) });
    st.pairCats.push('c:' + id); saveSt(); done();
  }
  async function runPair(calib) {
    // じゅんび：カテゴリ → 刺激
    const list = [];
    for (const k of st.pairCats) {
      if (k.slice(0, 2) === 'c:') { const id = k.slice(2), meta = await DB.get('images', id); if (!meta) continue; list.push({ cat: k, name: meta.name, a: meta.aLabel, b: meta.bLabel, da: { img: await imgOf(id) }, db: { img: await imgOf(id + ':b') } }); }
      else if (PAIR_CATS[k]) list.push(Object.assign({ cat: k }, PAIR_CATS[k]));
    }
    const trials = shuffle(list.flatMap(c => [Object.assign({}, c, { aSide: 'L' }), Object.assign({}, c, { aSide: 'R' })]));
    const S = await openStage({ onQuit: () => go(renderHome) });
    if (!S) return;
    const cal = calib && calib.cal, sm = new ML.Smoother(0.25);
    let all = [], i = -1, phase = 'intro', t0 = 0, raf = 0, curStream = null;
    const out = [];
    S.center.append(h('h2', null, '🙂 がめんを みてね'), h('p', null, 'いろいろな ものが 出てきます。すきな ほうを みてね。'), h('button', { class: 'big-btn go', type: 'button', onclick: () => { S.center.innerHTML = ''; next(); } }, '▶ スタート'));
    runFace((f, t) => {
      const s = sampleOf(f, t, cal, sm); all.push(s);
      if (phase === 'show' && curStream) curStream.push(s);
      S.setPv(faceStatus(f)[0], faceStatus(f)[1]);
    });
    function next() {
      if (curStream && i >= 0) out.push({ cat: trials[i].cat, name: trials[i].name, a: trials[i].a, b: trials[i].b, aSide: trials[i].aSide, stream: curStream });
      i++;
      if (i >= trials.length) { finish(); return; }
      phase = 'attn'; t0 = performance.now(); curStream = null; SND.soft();
    }
    function draw() {
      raf = requestAnimationFrame(draw);
      const { W, H } = S.fit(), g = S.g, now = performance.now(), el = now - t0;
      g.clearRect(0, 0, W, H);
      if (phase === 'attn') {
        g.save(); g.translate(W / 2, H / 2); g.rotate(now / 400); g.font = Math.round(Math.min(W, H) * 0.12) + 'px Apple Color Emoji, Segoe UI Emoji, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('🌟', 0, 0); g.restore();
        if (el > 1400) { phase = 'show'; t0 = now; curStream = []; }
      } else if (phase === 'show') {
        const tr = trials[i], L = tr.aSide === 'L' ? tr.da : tr.db, R = tr.aSide === 'L' ? tr.db : tr.da;
        window.__pairNow = tr;   // テスト用
        g.fillStyle = '#F1F3F5'; g.fillRect(W / 2 - 1, H * 0.1, 2, H * 0.8);
        drawStim(g, L, 0, 0, W / 2, H, now); drawStim(g, R, W / 2, 0, W / 2, H, now);
        if (el > st.pairSec * 1000) next();
      }
      if (st.debug && all.length) { const s = all[all.length - 1]; if (s.g) { g.fillStyle = 'rgba(224,49,49,.5)'; g.beginPath(); g.arc(s.x * W, s.y * H, 14, 0, 7); g.fill(); } S.dbg.textContent = Math.round(V.fps) + 'fps'; }
    }
    raf = requestAnimationFrame(draw);
    async function finish() {
      cancelAnimationFrame(raf); V.onFrame = null;
      const id = await saveSession({ task: 'pair', dur: all.length ? Math.round((all[all.length - 1].t - all[0].t) / 1000) : 0, cal: calInfo(calib), stream: thin(all), trials: out.map(o => Object.assign({}, o, { stream: thin(o.stream) })) });
      go(renderSession, id);
    }
    leave = () => { cancelAnimationFrame(raf); stopCam(); };
  }

  /* ============================================================
     2. しゅうちゅう チャレンジ（Go/No-Go ＋ 頭の 動き）
     ============================================================ */
  const CPT_PAIRS = [{ go: '🐶', no: '🐱', goN: 'いぬ', noN: 'ねこ' }, { go: '⭐', no: '🌙', goN: 'ほし', noN: 'つき' }, { go: '🍎', no: '🍌', goN: 'りんご', noN: 'バナナ' }];
  function renderCptSetup() {
    if (!needKid()) { go(renderHome); return; }
    const scr = h('section', { class: 'screen scroll', style: 'gap:12px' });
    const draw = () => {
      scr.innerHTML = '';
      const P = CPT_PAIRS[st.cptPair] || CPT_PAIRS[0];
      scr.append(h('h2', { class: 't' }, '⭐ しゅうちゅう チャレンジ'),
        h('p', { class: 'help' }, P.go + 'が 出たら 画面を タッチ、' + P.no + 'の ときは タッチしない 課題（Go/No-Go 型の 持続的注意課題）。とちゅうの 頭の 動き・画面から 目が それた 時間も はかります。'),
        h('div', { class: 'card', style: 'display:flex;flex-direction:column;gap:10px' },
          h('div', { class: 'row' }, h('b', null, 'じかん'), h('div', { class: 'seg' }, [2, 3, 5].map(v => h('button', { type: 'button', class: st.cptMin === v ? 'on' : '', onclick: () => { st.cptMin = v; saveSt(); draw(); } }, v + 'ふん')))),
          h('div', { class: 'row' }, h('b', null, 'やりかた'), h('div', { class: 'seg' }, [['tap', '👆 タッチする'], ['watch', '👀 みるだけ']].map(([v, t]) => h('button', { type: 'button', class: st.cptMode === v ? 'on' : '', onclick: () => { st.cptMode = v; saveSt(); draw(); } }, t))), h('small', { class: 'help' }, 'タッチが むずかしい 子は「みるだけ」（画面を 見つづける 力・頭の 動き だけ はかる）')),
          h('div', { class: 'row' }, h('b', null, 'えがら'), h('div', { class: 'seg' }, CPT_PAIRS.map((p, i) => h('button', { type: 'button', class: st.cptPair === i ? 'on' : '', onclick: () => { st.cptPair = i; saveSt(); draw(); } }, p.go + ' / ' + p.no))))),
        h('p', { class: 'help' }, '見る ばしょ あわせ は しなくても できます（すると「画面の まんなかを 見ていたか」も わかります）。'),
        h('div', { class: 'row' }, h('button', { class: 'big-btn go', type: 'button', onclick: () => go(() => withCalib('opt', c => go(() => runCpt(c)))) }, '▶ はじめる')));
    };
    main.appendChild(scr); draw();
  }
  async function runCpt(calib) {
    const P = CPT_PAIRS[st.cptPair] || CPT_PAIRS[0], tap = st.cptMode === 'tap';
    const S = await openStage({ onQuit: () => finish(true) });
    if (!S) return;
    const cal = calib && calib.cal, sm = new ML.Smoother(0.25);
    let phase = 'intro', all = [], trials = [], curT = null, raf = 0, endAt = 0, nextAt = 0, practice = [], pi = 0, fb = null;
    const STIM = 800;
    runFace((f, t) => { const s = sampleOf(f, t, cal, sm); if (phase === 'main') all.push(s); S.setPv(faceStatus(f)[0], faceStatus(f)[1]); });
    S.center.append(h('h2', null, tap ? P.go + ' が でたら タッチ！' : P.go + ' と ' + P.no + ' を みてね'),
      h('p', null, tap ? P.no + ' の ときは タッチ しないでね。さいしょに れんしゅう します。' : 'がめんの まんなかを みていてね。'),
      h('div', { style: 'font-size:90px', class: 'emo' }, P.go + ' 👆　' + (tap ? P.no + ' ✋' : P.no)),
      h('button', { class: 'big-btn go', type: 'button', onclick: e => { e.stopPropagation(); S.center.innerHTML = ''; say(tap ? P.goN + ' が でたら タッチ' : 'がめんを みててね'); if (tap) { phase = 'prac'; practice = shuffle(['go', 'go', 'nogo', 'go', 'nogo']); pi = 0; nextAt = performance.now() + 1200; } else startMain(); } }, '▶ スタート'));
    function startMain() { phase = 'main'; all = []; trials = []; endAt = performance.now() + st.cptMin * 60000; nextAt = performance.now() + 1500; say('はじめ'); }
    // タッチ
    S.stage.addEventListener('pointerdown', e => {
      if (!tap || e.target.closest('.quit,button')) return;
      const now = performance.now();
      if (curT && now >= curT.on) { curT.rts.push(Math.round(now - curT.on)); if (phase === 'prac') fb = { ok: curT.type === 'go', at: now }; else SND.soft(); }
    });
    function newTrial(type) { curT = { type, on: performance.now(), rts: [] }; window.__cptCur = curT; return curT; }
    function draw() {
      raf = requestAnimationFrame(draw);
      const { W, H } = S.fit(), g = S.g, now = performance.now();
      g.clearRect(0, 0, W, H);
      if (phase === 'prac' || phase === 'main') {
        if (now >= nextAt) {
          if (curT && phase === 'prac' && !curT.rts.length && curT.type === 'go') fb = { ok: false, miss: true, at: now };
          if (curT && phase === 'prac' && !curT.rts.length && curT.type === 'nogo') fb = { ok: true, at: now };
          if (phase === 'prac') {
            if (pi >= practice.length) { curT = null; phase = 'ready'; S.center.append(h('h2', null, 'じょうず！ ほんばん だよ'), h('button', { class: 'big-btn go', type: 'button', onclick: e => { e.stopPropagation(); S.center.innerHTML = ''; startMain(); } }, '▶ ほんばん')); return; }
            newTrial(practice[pi++]);
          } else {
            if (now >= endAt) { finish(false); return; }
            trials.push(newTrial(Math.random() < 0.75 ? 'go' : 'nogo'));
          }
          nextAt = now + STIM + rnd(1000, 2000);
        }
        // 刺激（STIM ms）・まんなかの ＋
        if (curT && now - curT.on < STIM) { g.font = Math.round(Math.min(W, H) * 0.3) + 'px Apple Color Emoji, Segoe UI Emoji, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(curT.type === 'go' ? P.go : P.no, W / 2, H / 2); }
        else { g.strokeStyle = '#ADB5BD'; g.lineWidth = 4; g.beginPath(); g.moveTo(W / 2 - 14, H / 2); g.lineTo(W / 2 + 14, H / 2); g.moveTo(W / 2, H / 2 - 14); g.lineTo(W / 2, H / 2 + 14); g.stroke(); }
        if (fb && now - fb.at < 900) { g.font = '800 40px sans-serif'; g.textAlign = 'center'; g.fillStyle = fb.ok ? '#2F9E44' : '#E8590C'; g.fillText(fb.ok ? '⭕ いいね' : fb.miss ? (P.go + ' は タッチ！') : (P.no + ' は タッチ しないよ'), W / 2, H * 0.18); }
        if (phase === 'main') { const p = 1 - (endAt - now) / (st.cptMin * 60000); g.fillStyle = '#E9ECEF'; g.fillRect(0, H - 6, W, 6); g.fillStyle = '#74C0FC'; g.fillRect(0, H - 6, W * clamp(p, 0, 1), 6); }
      }
      if (st.debug) S.dbg.textContent = Math.round(V.fps) + 'fps ' + trials.length;
    }
    raf = requestAnimationFrame(draw);
    let done = false;
    async function finish(early) {
      if (done) return; done = true; cancelAnimationFrame(raf); V.onFrame = null;
      if (phase !== 'main' || all.length < 30) { go(renderHome); return; }
      SND.ding(); say('おしまい。がんばったね');
      const t0 = all[0].t;
      const id = await saveSession({ task: 'cpt', mode: st.cptMode, pair: P.go + P.no, early: !!early, dur: Math.round((all[all.length - 1].t - t0) / 1000), cal: calInfo(calib), stream: thin(all), trials: trials.map(t => ({ type: t.type, on: Math.round(t.on - (performance.timeOrigin ? 0 : 0)), rts: t.rts })) });
      go(renderSession, id);
    }
    leave = () => { cancelAnimationFrame(raf); stopCam(); };
  }

  /* ============================================================
     3. きょうざいを みる（どこを 見たか ヒートマップ）
     ============================================================ */
  function renderViewSetup() {
    if (!needKid()) { go(renderHome); return; }
    const scr = h('section', { class: 'screen scroll', style: 'gap:12px' });
    const draw = async () => {
      scr.innerHTML = '';
      const imgs = (await DB.all('images')).filter(x => x.kind === 'view').sort((a, b) => b.at - a.at);
      scr.append(h('h2', { class: 't' }, '🖼️ きょうざいを みる'),
        h('p', { class: 'help' }, 'プリントや 絵本・教材の 写真を 画面いっぱいに 見せて、どこを 見たかを ヒートマップに します。「どの 刺激に ひきつけられやすいか」「見てほしい ところを 見ているか」の 手がかりに。（見る ばしょ あわせ が「よい」か「ふつう」の ときに つかえます）'),
        h('div', { class: 'card', style: 'display:flex;flex-direction:column;gap:10px' },
          h('div', { class: 'row' }, h('button', { class: 'pill', type: 'button', onclick: async () => { const f = await pickImage(); if (!f) return; const name = prompt('きょうざいの なまえ', f.name.replace(/\.[^.]+$/, '')) || 'きょうざい'; await DB.put('images', { id: uid(), kind: 'view', name, at: Date.now(), blob: await shrinkImage(f, 1800) }); draw(); } }, '➕ 写真・画像を くわえる')),
          imgs.length ? h('div', { class: 'row' }, imgs.map(im => { const on = st.viewImg === im.id; const th = h('img', { style: 'width:120px;height:90px;object-fit:cover;border-radius:10px;display:block' }); th.src = URL.createObjectURL(im.blob); return h('button', { type: 'button', class: 'pill' + (on ? ' on' : ''), style: 'flex-direction:column;padding:6px;height:auto', onclick: () => { st.viewImg = im.id; saveSt(); draw(); } }, th, im.name); })) : h('p', { class: 'help' }, 'まだ 画像が ありません'),
          imgs.length ? h('div', { class: 'row' }, h('button', { class: 'pill danger', type: 'button', onclick: async () => { if (!st.viewImg || !confirm('えらんでいる 画像を けしますか？')) return; await DB.del('images', st.viewImg); st.viewImg = ''; saveSt(); draw(); } }, '🗑️ えらんだ 画像を けす')) : null,
          h('div', { class: 'row' }, h('b', null, '見せる 時間'), h('div', { class: 'seg' }, [10, 20, 30, 60].map(v => h('button', { type: 'button', class: st.viewSec === v ? 'on' : '', onclick: () => { st.viewSec = v; saveSt(); draw(); } }, v + 'びょう'))))),
        h('div', { class: 'row' }, h('button', { class: 'big-btn go', type: 'button', disabled: !imgs.some(x => x.id === st.viewImg), onclick: () => go(() => withCalib('xy', c => go(() => runView(c)))) }, '▶ はじめる')));
    };
    main.appendChild(scr); draw();
  }
  async function runView(calib) {
    const im = await imgOf(st.viewImg), meta = await DB.get('images', st.viewImg);
    if (!im) { go(renderHome); return; }
    const S = await openStage({ onQuit: () => finish(true) });
    if (!S) return;
    const cal = calib && calib.cal, sm = new ML.Smoother(0.3);
    let phase = 'intro', all = [], raf = 0, t0 = 0, rect = null;
    runFace((f, t) => { const s = sampleOf(f, t, cal, sm); if (phase === 'show') all.push(s); S.setPv(faceStatus(f)[0], faceStatus(f)[1]); });
    S.center.append(h('h2', null, '🙂 がめんを みてね'), h('button', { class: 'big-btn go', type: 'button', onclick: () => { S.center.innerHTML = ''; phase = 'show'; t0 = performance.now(); SND.soft(); } }, '▶ スタート'));
    function draw() {
      raf = requestAnimationFrame(draw);
      const { W, H } = S.fit(), g = S.g;
      g.clearRect(0, 0, W, H);
      if (phase !== 'show') return;
      const k = Math.min(W / im.width, H / im.height); rect = { x: (W - im.width * k) / 2 / W, y: (H - im.height * k) / 2 / H, w: im.width * k / W, h: im.height * k / H };
      g.drawImage(im, rect.x * W, rect.y * H, rect.w * W, rect.h * H);
      const p = (performance.now() - t0) / (st.viewSec * 1000);
      g.fillStyle = '#E9ECEF'; g.fillRect(0, H - 5, W, 5); g.fillStyle = '#74C0FC'; g.fillRect(0, H - 5, W * clamp(p, 0, 1), 5);
      if (st.debug && all.length) { const s = all[all.length - 1]; if (s.g) { g.fillStyle = 'rgba(224,49,49,.5)'; g.beginPath(); g.arc(s.x * W, s.y * H, 14, 0, 7); g.fill(); } }
      if (p >= 1) finish(false);
    }
    raf = requestAnimationFrame(draw);
    let done = false;
    async function finish(early) {
      if (done) return; done = true; cancelAnimationFrame(raf); V.onFrame = null;
      if (all.length < 20) { go(renderHome); return; }
      SND.ding();
      const id = await saveSession({ task: 'view', imgId: st.viewImg, imgName: meta ? meta.name : '', rect, early: !!early, dur: Math.round((all[all.length - 1].t - all[0].t) / 1000), cal: calInfo(calib), stream: thin(all) });
      go(renderSession, id);
    }
    leave = () => { cancelAnimationFrame(raf); stopCam(); };
  }
