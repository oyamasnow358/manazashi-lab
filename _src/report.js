  /* ============================================================
     レポート
     ============================================================ */
  const TASKS = { pair: { e: '👀', name: 'どっちを みる？' }, cpt: { e: '⭐', name: 'しゅうちゅう チャレンジ' }, view: { e: '🖼️', name: 'きょうざいを みる' } };
  const GRADE = { good: 'よい', ok: 'ふつう', poor: 'あらい' };
  const fmt = (v, d) => (v == null || isNaN(v)) ? '―' : (d ? v.toFixed(d) : String(Math.round(v)));
  // 1つの 記録から 共通の 指標を 計算
  function metricsOf(s) {
    const S = s.stream || [];
    const a = ML.attention(S), hm = ML.headMotion(S), bl = ML.blinks(S), la = ML.lookAways(S, 1000), sp = ML.gazeSpread(S);
    const m = { facing: a.facingPct, present: a.presentPct, onScreen: a.onScreenPct, lookAway: la.count, lookAwayMs: la.totalMs, longestAway: la.longestMs, headCm: hm.cmPerMin, headMoves: hm.movesPerMin, headDeg: hm.degPerMin, blink: bl.perMin, spread: (sp.sx + sp.sy) / 2 };
    if (s.task === 'cpt' && s.mode === 'tap') Object.assign(m, ML.cptScore(s.trials || []));
    return m;
  }
  // 指標の 説明（レポートに 出す）
  const MDEF = [
    { k: 'facing', name: '画面を 向いていた 割合', unit: '%', d: 0, better: 'high', tip: '顔が 画面の ほうを 向いていた 時間の 割合。ちゅうい（注意）を むける ことの めやす。' },
    { k: 'lookAway', name: 'よそ見（1びょう いじょう）', unit: '回', d: 0, better: 'low', tip: '画面から 顔が 1びょう いじょう それた 回数。' },
    { k: 'longestAway', name: 'いちばん 長い よそ見', unit: 'びょう', d: 1, scale: 0.001, better: 'low', tip: '' },
    { k: 'headCm', name: '頭の 動き（きょり）', unit: 'cm/分', d: 0, better: 'low', tip: '頭の 位置が 1分間に 動いた きょりの 合計（多動の めやすとして CPT と あわせて 使われる 考え方）。' },
    { k: 'headMoves', name: '頭が 大きく 動いた 回数', unit: '回/分', d: 1, better: 'low', tip: '0.5びょうで 1.5cm いじょう 動いた 回数。' },
    { k: 'blink', name: 'まばたき', unit: '回/分', d: 0, better: null, tip: '課題や つかれで かわります。よい／わるいでは なく、その子の ふだんとの ちがいを 見ます。' },
    { k: 'onScreen', name: '視線が 画面の 中', unit: '%', d: 0, better: 'high', tip: '見る ばしょ あわせ を した ときだけ。' },
    { k: 'spread', name: '視線の ちらばり', unit: '', d: 2, better: null, tip: '視線の ばらつき（画面の はば＝1）。あちこち 見るほど 大きい。' },
    { k: 'omissionPct', name: '見のがし（不注意の めやす）', unit: '%', d: 0, better: 'low', tip: 'タッチ する ときに しなかった 割合。' },
    { k: 'commissionPct', name: 'おしまちがい（衝動性の めやす）', unit: '%', d: 0, better: 'low', tip: 'タッチ しない ときに タッチした 割合。' },
    { k: 'rtMean', name: '反応の はやさ（平均）', unit: 'ms', d: 0, better: null, tip: '' },
    { k: 'rtCv', name: '反応の ばらつき', unit: '', d: 2, better: 'low', tip: '反応時間の ばらつき（標準偏差÷平均）。集中が とぎれると 大きく なりやすい。' }
  ];
  function renderReport() {
    const scr = h('section', { class: 'screen scroll rep' });
    main.appendChild(scr);
    (async () => {
      const ss = (await DB.all('sessions')).filter(s => !st.kid || s.kid === st.kid).sort((a, b) => b.at - a.at);
      const k = curKid();
      scr.append(h('div', { class: 'rephead' }, h('h2', null, '📊 きろく' + (k ? '：' + k.name : '')),
        h('button', { class: 'pill', type: 'button', onclick: () => exportCsv(ss) }, '📄 まとめを CSV')));
      if (!ss.length) { scr.append(h('p', { class: 'help' }, 'まだ 記録が ありません。')); return; }
      // 課題ごとの うつりかわり
      ['cpt', 'pair', 'view'].forEach(task => {
        const list = ss.filter(s => s.task === task).reverse();
        if (list.length >= 2 && task !== 'view') scr.append(trendCard(task, list));
      });
      scr.append(h('div', { class: 'slist' }, ss.map(s => h('button', { class: 'sitem', type: 'button', onclick: () => go(renderSession, s.id) },
        h('span', { class: 'emo' }, TASKS[s.task].e), h('span', { style: 'flex:1' }, h('b', null, TASKS[s.task].name + (s.imgName ? '：' + s.imgName : '')), h('small', null, fmtDate(s.at) + '・' + s.dur + 'びょう' + (s.cal ? '・あわせ ' + GRADE[s.cal.grade] : '・あわせ なし') + (s.early ? '・とちゅうで おわり' : ''))), '›'))));
    })();
  }
  function trendCard(task, list) {
    const ms = list.map(metricsOf);
    const keys = task === 'cpt' ? ['facing', 'headCm', 'omissionPct', 'commissionPct'] : ['facing', 'headCm', 'lookAway'];
    const cv = h('canvas', { class: 'chart' });
    setTimeout(() => lineChart(cv, list.map(s => new Date(s.at).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' })), keys.map(k => ({ name: MDEF.find(d => d.k === k).name, vals: ms.map(m => m[k]) }))), 30);
    return h('div', { class: 'section card' }, h('h3', null, TASKS[task].e + ' ' + TASKS[task].name + ' の うつりかわり（' + list.length + '回）'), cv, h('p', { class: 'help' }, 'それぞれの 線は、その指標の いちばん 大きい 回を 上に して ならべています（単位は ちがいます）。'));
  }
  async function renderSession(id) {
    const s = await DB.get('sessions', id);
    if (!s) { go(renderReport); return; }
    const k = kidOf(s.kid), m = metricsOf(s);
    const prev = (await DB.all('sessions')).filter(x => x.kid === s.kid && x.task === s.task && x.at < s.at && (s.task !== 'cpt' || x.mode === s.mode));
    const pm = prev.map(metricsOf);
    const scr = h('section', { class: 'screen scroll rep' });
    main.appendChild(scr);
    scr.append(h('div', { class: 'rephead' }, h('h2', null, TASKS[s.task].e + ' ' + TASKS[s.task].name + (s.imgName ? '：' + s.imgName : '')),
      h('button', { class: 'pill noprint', type: 'button', onclick: () => window.print() }, '🖨️ いんさつ'),
      h('button', { class: 'pill noprint', type: 'button', onclick: () => exportRaw(s) }, '📄 生データ CSV'),
      h('button', { class: 'pill danger noprint', type: 'button', onclick: async () => { if (!confirm('この 記録を けしますか？')) return; await DB.del('sessions', s.id); go(renderReport); } }, '🗑️')),
      h('p', { class: 'help' }, (k ? k.name + '　' : '') + fmtDate(s.at) + '　' + s.dur + 'びょう' + (s.task === 'cpt' ? '　' + (s.mode === 'tap' ? 'タッチ' : 'みるだけ') + '・' + (s.pair || '') : '') + '　見る ばしょ あわせ：' + (s.cal ? GRADE[s.cal.grade] + '（ずれ やく ' + Math.round(s.cal.err * 100) + '%）' : 'なし') + (s.early ? '　※ とちゅうで おわり' : '')));
    // 信頼度の ちゅうい
    const warns = [];
    if (m.present < 80) warns.push('顔が うつっていた 時間が ' + fmt(m.present) + '% でした。カメラの 位置を 見なおすと、より 正確に なります。');
    if (s.cal && s.cal.grade === 'poor') warns.push('見る ばしょ あわせ が「あらい」ので、視線の ばしょの 指標は 参考に しないで ください。');
    if (s.dur < 40) warns.push('時間が みじかいので、数字が ぶれやすいです。');
    if (warns.length) scr.append(h('div', { class: 'note' }, '⚠️ ' + warns.join(' ')));
    // 指標
    const show = MDEF.filter(d => m[d.k] != null && !isNaN(m[d.k]) && !(d.k === 'onScreen' && !s.cal) && !(d.k === 'spread' && (!s.cal || s.cal.mode !== 'xy')));
    scr.append(h('div', { class: 'section' }, h('h3', null, '📌 けっか'), h('div', { class: 'metrics' }, show.map(d => {
      const v = m[d.k] * (d.scale || 1);
      const pv = pm.map(x => x[d.k] * (d.scale || 1)).filter(x => x != null && !isNaN(x));
      let cmp = null;
      if (pv.length) {
        const av = ML.mean(pv), sdv = pv.length >= 3 ? ML.sd(pv) : null, diff = v - av;
        const big = sdv ? Math.abs(diff) > sdv * 1.5 : Math.abs(diff) > Math.abs(av) * 0.3;
        const arrow = Math.abs(diff) < 1e-9 ? '→' : diff > 0 ? '↑' : '↓';
        cmp = h('div', { class: 'cmp' }, 'これまで（' + pv.length + '回）の 平均 ' + fmt(av, d.d) + d.unit + '　', h('b', null, arrow + (big ? ' いつもと ちがう' : '')));
      }
      return h('div', { class: 'metric', title: d.tip }, h('div', { class: 'k' }, d.name), h('div', { class: 'v' }, fmt(v, d.d), h('small', null, d.unit)), cmp);
    }))));
    // 時間の ながれ（4つに わけて）
    const S = s.stream || [];
    if (S.length > 40) {
      const qs = ML.quarters(S, part => ({ f: ML.attention(part).facingPct, hm: ML.headMotion(part).cmPerMin }));
      const cv = h('canvas', { class: 'chart' });
      setTimeout(() => barChart(cv, ['はじめ', '2', '3', 'おわり'], [{ name: '画面を 向いていた %', vals: qs.map(q => q.f), color: '#4C6EF5', max: 100 }, { name: '頭の 動き cm/分', vals: qs.map(q => q.hm), color: '#F08C00' }]), 30);
      scr.append(h('div', { class: 'section card' }, h('h3', null, '⏱️ 時間の ながれ（4つに わけて）'), cv, h('p', { class: 'help' }, 'あとの ほうで 画面を 向く 割合が 下がったり、頭の 動きが ふえたり する ときは、集中が つづく 時間の めやすに なります。')));
    }
    if (s.task === 'cpt' && s.mode === 'tap') {
      const t0 = S.length ? S[0].t : 0, T = S.length ? S[S.length - 1].t - t0 : 1;
      const parts = [0, 1, 2, 3].map(q => ML.cptScore((s.trials || []).filter(t => t.on - t0 >= T * q / 4 && t.on - t0 < T * (q + 1) / 4 + (q === 3 ? 1 : 0))));
      const cv = h('canvas', { class: 'chart' });
      setTimeout(() => barChart(cv, ['はじめ', '2', '3', 'おわり'], [{ name: '見のがし %', vals: parts.map(p => p.omissionPct), color: '#E64980', max: 100 }, { name: 'おしまちがい %', vals: parts.map(p => p.commissionPct), color: '#0CA678', max: 100 }]), 30);
      scr.append(h('div', { class: 'section card' }, h('h3', null, '⭐ 課題の 正確さ（時間の ながれ）'), cv,
        h('p', { class: 'help' }, 'タッチ する ' + m.go + '回・しない ' + m.nogo + '回。はやすぎる タッチ（0.15びょう 未満）' + m.anticipations + '回。')));
    }
    if (s.task === 'pair') {
      const sum = ML.pairSummary(s.trials || []);
      const lab = c => { const t = (s.trials || []).find(x => x.cat === c); return t ? t : { a: 'A', b: 'B', name: c }; };
      const cv = h('canvas', { class: 'chart', style: 'height:' + (60 + sum.length * 46) + 'px' });
      setTimeout(() => pairChart(cv, sum.map(x => ({ a: lab(x.cat).a, b: lab(x.cat).b, pct: x.aPct }))), 30);
      scr.append(h('div', { class: 'section card' }, h('h3', null, '👀 どちらを 長く 見たか'), cv,
        h('table', { class: 't' }, h('tr', null, ['組', 'A を 見た 割合', 'さきに A を 見た', '見ていた 時間'].map(x => h('th', null, x))),
          sum.map(x => h('tr', null, h('td', null, lab(x.cat).name), h('td', null, fmt(x.aPct) + '%'), h('td', null, fmt(x.firstAPct) + '%'), h('td', null, fmt(x.lookMs / 1000, 1) + 'びょう')))),
        h('p', { class: 'help' }, '50% より 大きく かたよる 組（めやす 65% いじょう／35% いか）が、その子の「目が いきやすい もの」の 手がかりです。左右は 入れかえて 2回 見せているので、左右の くせは 打ち消されます。')));
    }
    if (s.task === 'view') scr.append(await heatCard(s));
    // メモ
    const memo = h('textarea', { class: 'memo', placeholder: 'メモ（その日の ようす・体調・場所・時間帯 など）' }); memo.value = s.memo || '';
    memo.addEventListener('change', async () => { s.memo = memo.value; await DB.put('sessions', s); toast('メモを ほぞん しました'); });
    scr.append(h('div', { class: 'section' }, h('h3', null, '📝 メモ'), memo),
      h('div', { class: 'note info' }, 'ℹ️ この 結果は 診断では ありません。その子の ふだんの ようすを 数字で 見える化し、前の 回と くらべる ための ものです。くわしくは メニュー →「根拠と ちゅうい」。'),
      h('div', { class: 'row noprint' }, h('button', { class: 'pill', type: 'button', onclick: () => go(renderReport) }, '← きろく いちらん')));
  }
  async function heatCard(s) {
    const im = await imgOf(s.imgId);
    const S = (s.stream || []).filter(p => p.g && !p.bl);
    const r = s.rect || { x: 0, y: 0, w: 1, h: 1 };
    const pts = S.map(p => ({ x: (p.x - r.x) / r.w, y: (p.y - r.y) / r.h })).filter(p => p.x >= -0.05 && p.x <= 1.05 && p.y >= -0.05 && p.y <= 1.05);
    const box = h('div', { class: 'heat' });
    const cv = h('canvas');
    if (im) { const img = h('img'); img.src = im.src; box.append(img, cv); } else box.append(h('p', { class: 'help', style: 'padding:20px' }, '（画像が けされています）'), cv);
    setTimeout(() => {
      const W = 120, H = Math.round(120 * (im ? im.height / im.width : 0.75));
      cv.width = W; cv.height = H;
      const sig = s.cal && s.cal.grade === 'good' ? 6 : 10;
      const grid = ML.heatGrid(pts.map(p => ({ x: p.x, y: p.y })), W, H, sig);
      const g = cv.getContext('2d'), id = g.createImageData(W, H);
      for (let i = 0; i < grid.length; i++) { const v = grid[i]; const [cr, cg, cb] = v < 0.5 ? [0, 120 + v * 270, 255 - v * 300] : [Math.min(255, (v - 0.5) * 510), 255 - (v - 0.5) * 300, 0]; id.data[i * 4] = cr; id.data[i * 4 + 1] = cg; id.data[i * 4 + 2] = cb; id.data[i * 4 + 3] = v < 0.08 ? 0 : 60 + v * 140; }
      g.putImageData(id, 0, 0);
      cv.style.imageRendering = 'auto';
    }, 30);
    const aoi = ML.aoiGrid(pts.map(p => ({ t: 0, g: 1, x: p.x, y: p.y })), 3);
    const fx = ML.fixations(S.map(p => ({ t: p.t, g: 1, bl: 0, x: (p.x - r.x) / r.w, y: (p.y - r.y) / r.h })));
    const rows = [0, 1, 2].map(y => h('tr', null, [0, 1, 2].map(x => { const c = aoi[y * 3 + x]; return h('td', { style: 'background:rgba(76,110,245,' + (c.pct / 100 * 1.5).toFixed(2) + ')' }, fmt(c.pct) + '%'); })));
    return h('div', { class: 'section card' }, h('h3', null, '🔥 どこを 見たか（ヒートマップ）'), box,
      h('div', { class: 'row', style: 'align-items:flex-start' }, h('table', { class: 't' }, rows), h('p', { class: 'help', style: 'flex:1;min-width:220px' }, '左の 表は 画像を 3×3 に わけた ときの 見た 時間の 割合。注視（0.12びょう いじょう 止まった 視線）は ' + fx.length + '回' + (fx.length ? '・さいしょの 注視は ' + ['左上', '上', '右上', '左', 'まんなか', '右', '左下', '下', '右下'][Math.min(2, Math.max(0, Math.floor(fx[0].y * 3))) * 3 + Math.min(2, Math.max(0, Math.floor(fx[0].x * 3)))] : '') + '。' + (s.cal && s.cal.grade !== 'good' ? '見る ばしょ あわせ が「' + GRADE[s.cal.grade] + '」なので、ヒートマップは おおまかな めやすです。' : ''))));
  }

  /* ---------- グラフ（canvas） ---------- */
  function prep(cv) { const d = Math.min(2, window.devicePixelRatio || 1), r = cv.getBoundingClientRect(); cv.width = Math.round(r.width * d); cv.height = Math.round(r.height * d); const g = cv.getContext('2d'); g.setTransform(d, 0, 0, d, 0, 0); g.clearRect(0, 0, r.width, r.height); g.font = '600 12px sans-serif'; return { g, W: r.width, H: r.height }; }
  function legend(g, items, x, y) { items.forEach((it, i) => { g.fillStyle = it.color; g.fillRect(x, y + i * 18 - 8, 12, 12); g.fillStyle = '#495057'; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillText(it.name, x + 18, y + i * 18 - 2); }); }
  function barChart(cv, labels, series) {
    const { g, W, H } = prep(cv), L = 40, B = 28, T = 16 + series.length * 18, Rr = 16, pw = W - L - Rr, ph = H - T - B;
    legend(g, series, L, 14);
    const n = labels.length, gw = pw / n, bw = Math.min(36, gw / (series.length + 1));
    series.forEach((s, si) => {
      const mx = s.max || Math.max(1, ...s.vals.filter(v => !isNaN(v))) * 1.15;
      s.vals.forEach((v, i) => { if (isNaN(v)) return; const hh = ph * clamp(v / mx, 0, 1), x = L + gw * i + (gw - bw * series.length) / 2 + si * bw; g.fillStyle = s.color; g.fillRect(x, T + ph - hh, bw - 4, hh); g.fillStyle = '#343A40'; g.textAlign = 'center'; g.textBaseline = 'bottom'; g.fillText(fmt(v), x + bw / 2 - 2, T + ph - hh - 2); });
    });
    g.strokeStyle = '#DEE2E6'; g.beginPath(); g.moveTo(L, T + ph); g.lineTo(W - Rr, T + ph); g.stroke();
    g.fillStyle = '#667085'; g.textAlign = 'center'; g.textBaseline = 'top'; labels.forEach((l, i) => g.fillText(l, L + gw * i + gw / 2, T + ph + 6));
  }
  function lineChart(cv, labels, series) {
    const { g, W, H } = prep(cv), COL = ['#4C6EF5', '#F08C00', '#E64980', '#0CA678'], L = 20, B = 26, T = 16 + Math.ceil(series.length / 2) * 18, Rr = 20, pw = W - L - Rr, ph = H - T - B;
    series.forEach((s, i) => { g.fillStyle = COL[i]; g.fillRect(L + (i % 2) * (W / 2), 6 + Math.floor(i / 2) * 18, 12, 12); g.fillStyle = '#495057'; g.textAlign = 'left'; g.textBaseline = 'top'; g.fillText(s.name, L + (i % 2) * (W / 2) + 18, 6 + Math.floor(i / 2) * 18); });
    const n = labels.length, x = i => L + (n === 1 ? pw / 2 : pw * i / (n - 1));
    series.forEach((s, si) => {
      const v = s.vals.map(z => isNaN(z) ? null : z), ok = v.filter(z => z != null), mx = Math.max(1e-6, ...ok), mn = Math.min(0, ...ok);
      g.strokeStyle = COL[si]; g.lineWidth = 3; g.beginPath(); let st0 = false;
      v.forEach((z, i) => { if (z == null) return; const y = T + ph - ph * (z - mn) / (mx - mn || 1); if (!st0) { g.moveTo(x(i), y); st0 = true; } else g.lineTo(x(i), y); }); g.stroke();
      v.forEach((z, i) => { if (z == null) return; const y = T + ph - ph * (z - mn) / (mx - mn || 1); g.fillStyle = COL[si]; g.beginPath(); g.arc(x(i), y, 4, 0, 7); g.fill(); });
    });
    g.fillStyle = '#667085'; g.textAlign = 'center'; g.textBaseline = 'top'; labels.forEach((l, i) => g.fillText(l, x(i), T + ph + 6));
  }
  function pairChart(cv, rows) {
    const { g, W } = prep(cv), L = 110, Rr = 110, bh = 26;
    rows.forEach((r, i) => {
      const y = 30 + i * 46, pw = W - L - Rr, a = isNaN(r.pct) ? 50 : r.pct;
      g.fillStyle = '#4C6EF5'; g.fillRect(L, y, pw * a / 100, bh); g.fillStyle = '#F08C00'; g.fillRect(L + pw * a / 100, y, pw * (1 - a / 100), bh);
      g.fillStyle = '#212529'; g.font = '700 14px sans-serif'; g.textBaseline = 'middle';
      g.textAlign = 'right'; g.fillText(r.a + ' ' + fmt(a) + '%', L - 8, y + bh / 2);
      g.textAlign = 'left'; g.fillText(fmt(100 - a) + '% ' + r.b, L + pw + 8, y + bh / 2);
    });
    g.strokeStyle = '#212529'; g.setLineDash([4, 4]); g.beginPath(); g.moveTo(L + (W - L - Rr) / 2, 20); g.lineTo(L + (W - L - Rr) / 2, 30 + rows.length * 46); g.stroke(); g.setLineDash([]);
  }

  /* ---------- 書き出し ---------- */
  function download(name, text, type) { const a = h('a', { href: URL.createObjectURL(new Blob([text], { type: type || 'text/csv' })), download: name }); document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 3000); toast('💾 ' + name + ' を ほぞん しました'); }
  function exportCsv(ss) {
    const cols = MDEF.map(d => d.k);
    const head = ['日時', 'こども', '課題', '時間(秒)', 'あわせ', 'あわせ誤差'].concat(MDEF.map(d => d.name + (d.unit ? '(' + d.unit + ')' : '')), ['メモ']);
    const rows = ss.map(s => { const m = metricsOf(s); return [fmtDate(s.at), (kidOf(s.kid) || {}).name || '', TASKS[s.task].name + (s.task === 'cpt' ? '(' + (s.mode === 'tap' ? 'タッチ' : 'みるだけ') + ')' : '') + (s.imgName ? ':' + s.imgName : ''), s.dur, s.cal ? GRADE[s.cal.grade] : 'なし', s.cal ? s.cal.err : ''].concat(cols.map(k => { const d = MDEF.find(x => x.k === k), v = m[k]; return v == null || isNaN(v) ? '' : r3(v * (d.scale || 1)); }), [(s.memo || '').replace(/[\r\n,]/g, ' ')]); });
    download('まなざしラボ_まとめ.csv', '﻿' + [head].concat(rows).map(r => r.join(',')).join('\n'));
  }
  function exportRaw(s) {
    const head = 't(ms),顔あり,画面を向く,視線あり,x,y,まばたき,頭x(cm),頭y(cm),頭z(cm),yaw,pitch';
    const rows = (s.stream || []).map(p => [p.t - s.stream[0].t, p.pr, p.f, p.g, p.x == null ? '' : p.x, p.y == null ? '' : p.y, p.bl, p.hx == null ? '' : p.hx, p.hy == null ? '' : p.hy, p.hz == null ? '' : p.hz, p.yaw == null ? '' : p.yaw, p.pitch == null ? '' : p.pitch].join(','));
    download('まなざしラボ_' + TASKS[s.task].name + '_' + new Date(s.at).toISOString().slice(0, 16).replace(/[:T]/g, '') + '.csv', '﻿' + head + '\n' + rows.join('\n'));
  }
