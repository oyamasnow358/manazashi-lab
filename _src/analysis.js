/* ============================================================
   まなざし ラボ：計算の しくみ（ブラウザでも node でも 動く）
   ・顔の点 → 目と 顔の 特徴
   ・キャリブレーション（リッジ回帰）→ 画面の どこを 見ているか
   ・指標（画面を 向いていた 割合・よそ見・頭の 動き・まばたき・注視・CPT・みくらべ・ヒートマップ）
   ============================================================ */
(function (root) {
  'use strict';
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const mean = a => a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN;
  const sd = a => { if (a.length < 2) return NaN; const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) * (x - m), 0) / (a.length - 1)); };
  const median = a => { if (!a.length) return NaN; const b = a.slice().sort((x, y) => x - y), k = b.length >> 1; return b.length % 2 ? b[k] : (b[k - 1] + b[k]) / 2; };

  /* ---------- 顔の 点 → 特徴 ----------
     lm: 478点（x,y 0〜1）、W,H: 映像の 大きさ、mat: 4x4（列ごと）、bs: ブレンドシェイプ [{categoryName, score}] */
  const EYE = {
    r: { inner: 133, outer: 33, up: 159, low: 145, iris: 468 },   // その人の 右目
    l: { inner: 362, outer: 263, up: 386, low: 374, iris: 473 }    // その人の 左目
  };
  function eyeFeat(lm, W, H, e) {
    const P = i => [lm[i].x * W, lm[i].y * H];
    const a = P(e.inner), b = P(e.outer), ir = P(e.iris), u = P(e.up), d = P(e.low);
    const ex = [b[0] - a[0], b[1] - a[1]], L2 = ex[0] * ex[0] + ex[1] * ex[1], Lw = Math.sqrt(L2) || 1;
    const t = ((ir[0] - a[0]) * ex[0] + (ir[1] - a[1]) * ex[1]) / (L2 || 1);         // 目がしら 0 → 目じり 1
    const ny = [-ex[1] / Lw, ex[0] / Lw];                                              // 目の 線に 直角
    const mid = [(u[0] + d[0]) / 2, (u[1] + d[1]) / 2];
    const v = ((ir[0] - mid[0]) * ny[0] + (ir[1] - mid[1]) * ny[1]) / Lw;               // 上下（まぶたの まんなか から）
    // 上下（目がしら と 目じり を むすんだ 線から）。まぶたは 視線と いっしょに 動くので、動かない 目の はし を 基準にも する
    const vc = ((ir[0] - a[0]) * ny[0] + (ir[1] - a[1]) * ny[1]) / Lw;
    const open = Math.hypot(u[0] - d[0], u[1] - d[1]) / Lw;
    return { t, v, vc, open, w: Lw };
  }
  function headPose(m) {
    if (!m || m.length < 16) return null;
    // 列ごとの 4x4 → 回転 R（行 r, 列 c = m[c*4+r]）
    const R = (r, c) => m[c * 4 + r];
    const yaw = Math.atan2(R(0, 2), R(2, 2)) * 180 / Math.PI;
    const pitch = Math.asin(clamp(-R(1, 2), -1, 1)) * 180 / Math.PI;
    const roll = Math.atan2(R(1, 0), R(1, 1)) * 180 / Math.PI;
    return { yaw, pitch, roll, x: m[12], y: m[13], z: m[14] };   // x,y,z は cm（カメラ基準）
  }
  function faceFeatures(lm, W, H, mat, bs) {
    if (!lm || lm.length < 478) return null;
    const r = eyeFeat(lm, W, H, EYE.r), l = eyeFeat(lm, W, H, EYE.l);
    const hp = headPose(mat) || { yaw: 0, pitch: 0, roll: 0, x: 0, y: 0, z: -50 };
    let blinkL = 0, blinkR = 0;
    (bs || []).forEach(c => { if (c.categoryName === 'eyeBlinkLeft') blinkL = c.score; if (c.categoryName === 'eyeBlinkRight') blinkR = c.score; });
    // 下を 見ると まぶたが 下がるので、まばたきは「両目が しっかり とじた」ときだけに する
    const blink = Math.min(blinkL, blinkR) > 0.6 || (r.open + l.open) / 2 < 0.07;
    // 画面上の 顔の 中心と 大きさ
    const cx = (lm[33].x + lm[263].x) / 2, cy = (lm[33].y + lm[263].y) / 2;
    return {
      ix: (r.t + (1 - l.t)) / 2 - 0.5,     // 左右の 目を そろえた 黒目の 左右（目がしら／目じりの 向きを あわせる）
      ixr: r.t, ixl: l.t,
      iy: (r.v + l.v) / 2, ivr: r.v, ivl: l.v, icr: r.vc, icl: l.vc, ic: (r.vc + l.vc) / 2,
      yaw: hp.yaw, pitch: hp.pitch, roll: hp.roll, hx: hp.x, hy: hp.y, hz: hp.z,
      fx: cx, fy: cy, eyeW: (r.w + l.w) / 2 / W,
      blink, open: (r.open + l.open) / 2
    };
  }
  // 画面を 向いているか（キャリブレーション なしでも わかる）
  const facing = f => !!f && Math.abs(f.yaw) < 28 && Math.abs(f.pitch) < 24;

  /* ---------- キャリブレーション（リッジ回帰） ---------- */
  const SETS = {
    // 左右だけ
    x1: f => [1, f.ix],
    x2: f => [1, f.ix, f.yaw / 30],
    x3: f => [1, f.ixr, f.ixl, f.yaw / 30],
    x4: f => [1, f.ix, f.yaw / 30, f.hz ? f.hx / Math.abs(f.hz) : 0],
    // 左右・上下
    a: f => [1, f.ix, f.ic],
    b: f => [1, f.ix, f.ic, f.yaw / 30, f.pitch / 30],
    c: f => [1, f.ix, f.ic, f.iy, f.open, f.yaw / 30, f.pitch / 30],
    d: f => [1, f.ixr, f.ixl, f.icr, f.icl, f.yaw / 30, f.pitch / 30],
    e: f => [1, f.ix, f.ic, f.open, f.yaw / 30, f.pitch / 30, f.hz ? f.hx / Math.abs(f.hz) : 0, f.hz ? f.hy / Math.abs(f.hz) : 0],
    o3: f => [1, f.ixr, f.ixl, f.open, f.pitch / 30],
    o4: f => [1, f.ix, f.open, f.pitch / 30, f.yaw / 30],
    p5: f => [1, f.ix, f.open, f.ix * f.open, f.pitch / 30],
    // 映像から 自分で もとめた 黒目の 中心（pu・pv）を つかう もの
    q1: f => [1, f.pu, f.pv],
    q2: f => [1, f.pu, f.pv, f.open],
    q3: f => [1, f.pur, f.pul, f.pvr, f.pvl, f.open],
    q4: f => [1, f.pu, f.pv, f.open, f.ix, f.ic],
    q5: f => [1, f.pu, f.pv, f.open, f.pitch / 30],
    x5: f => [1, f.pu],
    x6: f => [1, f.pur, f.pul],
    x7: f => [1, f.pu, f.ix]
  };
  const XY_SETS = ['a', 'b', 'c', 'd', 'e', 'o3', 'o4', 'p5', 'q1', 'q2', 'q3', 'q4', 'q5'], X_SETS = ['x1', 'x2', 'x3', 'x4', 'x5', 'x6', 'x7'];
  function gazeVec(f, mode, set) {
    if (set && SETS[set]) return SETS[set](f);
    // むかしの 形式（あとかたの ため）
    const ix = f.ix, iy = f.iy, ya = f.yaw / 30, pi = f.pitch / 30;
    const hx = f.hz ? f.hx / Math.abs(f.hz) : 0, hy = f.hz ? f.hy / Math.abs(f.hz) : 0;
    if (mode === 'x') return [1, ix, ya, hx, ix * ix];
    return [1, ix, iy, ya, pi, hx, hy, ix * ix, iy * iy, ix * iy, ix * ya, iy * pi];
  }
  // X: 特徴の ならび、y: 目標 → 重み（(XᵀX + λI)⁻¹ Xᵀy）
  function ridge(X, y, lam) {
    const n = X[0].length, A = [], b = new Array(n).fill(0);
    for (let i = 0; i < n; i++) { A.push(new Array(n).fill(0)); }
    X.forEach((row, k) => { for (let i = 0; i < n; i++) { b[i] += row[i] * y[k]; for (let j = 0; j < n; j++) A[i][j] += row[i] * row[j]; } });
    for (let i = 1; i < n; i++) A[i][i] += lam;   // 定数項には かけない
    // ガウスの 消去法
    for (let c = 0; c < n; c++) {
      let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
      [A[c], A[p]] = [A[p], A[c]]; [b[c], b[p]] = [b[p], b[c]];
      const d = A[c][c] || 1e-9;
      for (let r = 0; r < n; r++) { if (r === c) continue; const k = A[r][c] / d; if (!k) continue; for (let j = c; j < n; j++) A[r][j] -= k * A[c][j]; b[r] -= k * b[c]; }
    }
    return b.map((v, i) => v / (A[i][i] || 1e-9));
  }
  // samples: [{ f, tx, ty }]（tx,ty は 画面の 0〜1）
  // 1つの 点の なかで 外れた 記録（目を はなした・まばたきの とちゅう）を のぞく
  function trimPoint(g) {
    if (g.length < 6) return g;
    const mx = median(g.map(s => s.f.ix)), my = median(g.map(s => s.f.ic));
    const dx = median(g.map(s => Math.abs(s.f.ix - mx))) || 1e-4, dy = median(g.map(s => Math.abs(s.f.ic - my))) || 1e-4;
    return g.filter(s => Math.abs(s.f.ix - mx) < dx * 3 && Math.abs(s.f.ic - my) < dy * 3);
  }
  function fitWith(S, mode, set, lam) {
    const X = S.map(s => gazeVec(s.f, mode, set));
    // 特徴の 大きさを そろえる
    const n = X[0].length, mu = new Array(n).fill(0), sg = new Array(n).fill(1);
    for (let j = 1; j < n; j++) { const col = X.map(r => r[j]); mu[j] = mean(col); sg[j] = sd(col) || 1; }
    const Z = X.map(r => r.map((v, j) => j ? (v - mu[j]) / sg[j] : 1));
    const wx = ridge(Z, S.map(s => s.tx), lam);
    const wy = mode === 'x' ? null : ridge(Z, S.map(s => s.ty), lam);
    return { mode: mode || 'xy', set, lam, mu, sg, wx, wy, made: Date.now() };
  }
  // いくつかの 計算方法を ためし、「1点ずつ はずして 当てる」テストで いちばん 当たる ものを えらぶ
  function fitCalib(samples, mode, opt) {
    const byPt = {};
    samples.filter(s => s.f && !s.f.blink).forEach(s => { const k = s.tx + ',' + s.ty; (byPt[k] = byPt[k] || []).push(s); });
    const groups = Object.values(byPt).map(trimPoint).filter(g => g.length >= 3);
    const S = [].concat.apply([], groups);
    if (S.length < 8 || groups.length < 3) return null;
    // 数が ない（むかしの データ・黒目が 見つからない）組みあわせは はぶく
    const sets = ((opt && opt.sets) || (mode === 'x' ? X_SETS : XY_SETS)).filter(k => S.every(sm => SETS[k](sm.f).every(v => typeof v === 'number' && isFinite(v))));
    if (!sets.length) return null;
    // 左右と 上下で、それぞれ いちばん 当たる 式を 別々に えらぶ
    let bx = null, by = null;
    sets.forEach(set => [0.3, 1, 3].forEach(lam => {
      if (SETS[set](S[0].f).length > groups.length + 1) return;   // 点の 数より 多い 項目は つかわない（覚えすぎ）
      let ex = 0, ey = 0, n = 0;
      groups.forEach((g, gi) => {
        const train = [].concat.apply([], groups.filter((_, j) => j !== gi));
        const m = fitWith(train, mode, set, lam);
        const ps = g.map(s => predict(m, s.f));
        ex += Math.abs(median(ps.map(p => p.x)) - g[0].tx); ey += Math.abs(median(ps.map(p => p.y)) - g[0].ty); n++;
      });
      ex /= n; ey /= n;
      if (!bx || ex < bx.err) bx = { set, lam, err: ex };
      if (mode !== 'x' && (!by || ey < by.err)) by = { set, lam, err: ey };
    }));
    const cal = fitWith(S, mode, bx.set, bx.lam);
    if (by) { const cy = fitWith(S, mode, by.set, by.lam); cal.ySet = by.set; cal.yLam = by.lam; cal.ymu = cy.mu; cal.ysg = cy.sg; cal.wy = cy.wy; }
    cal.cvErr = by ? Math.hypot(bx.err, by.err) : bx.err; cal.cvX = bx.err; cal.cvY = by ? by.err : null;
    return cal;
  }
  function predict(cal, f) {
    if (!cal || !f) return null;
    const z = gazeVec(f, cal.mode, cal.set).map((v, j) => j ? (v - cal.mu[j]) / cal.sg[j] : 1);
    const dot = (w, zz) => w.reduce((s, x, i) => s + x * zz[i], 0);
    // 上下は 別の 式（ySet）の ことが ある
    const zy = cal.ySet ? gazeVec(f, cal.mode, cal.ySet).map((v, j) => j ? (v - cal.ymu[j]) / cal.ysg[j] : 1) : z;
    return { x: dot(cal.wx, z), y: cal.wy ? dot(cal.wy, zy) : 0.5 };
  }
  // 検証：[{ f, tx, ty }] → 平均の ずれ（画面の 幅＝1）と 精度の めやす
  function validate(cal, samples) {
    const errs = [];
    const byPt = {};
    samples.forEach(s => { if (!s.f || s.f.blink) return; const k = s.tx + ',' + s.ty; (byPt[k] = byPt[k] || []).push(s); });
    Object.values(byPt).forEach(g => {
      const ps = g.map(s => predict(cal, s.f)).filter(Boolean);
      if (!ps.length) return;
      const px = median(ps.map(p => p.x)), py = median(ps.map(p => p.y));
      errs.push({ d: cal.mode === 'x' ? Math.abs(px - g[0].tx) : Math.hypot(px - g[0].tx, py - g[0].ty), x: Math.abs(px - g[0].tx), y: Math.abs(py - g[0].ty) });
    });
    const e = errs.length ? mean(errs.map(x => x.d)) : 1, ex = errs.length ? mean(errs.map(x => x.x)) : 1, ey = cal.mode === 'x' ? null : (errs.length ? mean(errs.map(x => x.y)) : 1);
    const grade = cal.mode === 'x' ? (e < 0.12 ? 'good' : e < 0.2 ? 'ok' : 'poor') : (e < 0.11 ? 'good' : e < 0.19 ? 'ok' : 'poor');
    // 左右だけでも つかえるか（どっちを みる？ は 左右だけ）
    const gradeX = ex < 0.12 ? 'good' : ex < 0.2 ? 'ok' : 'poor';
    return { err: e, ex, ey, grade, gradeX, points: errs.length };
  }

  /* ---------- 視線の なめらか ---------- */
  function Smoother(alpha) { this.a = alpha || 0.35; this.x = null; this.y = null; }
  Smoother.prototype.push = function (p) { if (!p) return null; if (this.x == null) { this.x = p.x; this.y = p.y; } else { this.x += (p.x - this.x) * this.a; this.y += (p.y - this.y) * this.a; } return { x: this.x, y: this.y }; };

  /* ---------- 指標 ----------
     stream: [{ t(ms), f:facing(0/1), g:gaze あり(0/1), x, y, bl:まばたき(0/1), hx, hy, hz(cm), yaw, pitch }] */
  function headMotion(stream) {
    // 頭の 位置の 移動きょり（cm）と 回転（度）
    let dist = 0, rot = 0, events = 0, last = null, ref = null;
    stream.forEach(s => {
      if (s.hz == null || !s.pr) { last = null; return; }
      if (last && s.t - last.t < 300) { dist += Math.hypot(s.hx - last.hx, s.hy - last.hy, s.hz - last.hz); rot += Math.hypot(s.yaw - last.yaw, s.pitch - last.pitch); }
      if (!ref || s.t - ref.t > 500) { if (ref && Math.hypot(s.hx - ref.hx, s.hy - ref.hy, s.hz - ref.hz) > 1.5) events++; ref = s; }
      last = s;
    });
    const min = stream.length ? (stream[stream.length - 1].t - stream[0].t) / 60000 : 0;
    return { cmPerMin: min ? dist / min : NaN, degPerMin: min ? rot / min : NaN, movesPerMin: min ? events / min : NaN };
  }
  function blinks(stream) {
    let n = 0, on = null;
    stream.forEach(s => { if (!s.pr) return; if (s.bl && on == null) on = s.t; if (!s.bl && on != null) { const d = s.t - on; if (d >= 40 && d <= 600) n++; on = null; } });
    const min = stream.length ? (stream[stream.length - 1].t - stream[0].t) / 60000 : 0;
    return { perMin: min ? n / min : NaN, count: n };
  }
  // よそ見（画面を 向いていない 時間が 1びょう いじょう つづいた 回数・時間）
  function lookAways(stream, minMs) {
    minMs = minMs || 1000;
    const eps = []; let st = null;
    stream.forEach((s, i) => {
      const off = !s.f;
      if (off && st == null) st = s.t;
      if ((!off || i === stream.length - 1) && st != null) { const d = s.t - st; if (d >= minMs) eps.push(d); st = null; }
    });
    return { count: eps.length, totalMs: eps.reduce((a, b) => a + b, 0), longestMs: eps.length ? Math.max.apply(null, eps) : 0 };
  }
  function attention(stream) {
    const n = stream.length || 1;
    const facingPct = stream.filter(s => s.f).length / n * 100;
    const pres = stream.filter(s => s.pr).length / n * 100;
    const g = stream.filter(s => s.g);
    const onScreen = g.length ? g.filter(s => s.x >= -0.05 && s.x <= 1.05 && s.y >= -0.05 && s.y <= 1.05).length / n * 100 : NaN;
    return { facingPct, presentPct: pres, onScreenPct: onScreen };
  }
  // 注視（I-DT 法：ばらつきが 小さい まとまり）
  function fixations(stream, opt) {
    opt = opt || {};
    const disp = opt.disp || 0.07, minDur = opt.minDur || 120;
    const g = stream.filter(s => s.g && !s.bl);
    const out = []; let i = 0;
    while (i < g.length) {
      let j = i;
      while (j + 1 < g.length && g[j + 1].t - g[i].t < minDur) j++;
      if (j + 1 >= g.length) break;
      const win = g.slice(i, j + 1);
      const D = w => (Math.max.apply(null, w.map(s => s.x)) - Math.min.apply(null, w.map(s => s.x))) + (Math.max.apply(null, w.map(s => s.y)) - Math.min.apply(null, w.map(s => s.y)));
      if (D(win) <= disp) {
        while (j + 1 < g.length && g[j + 1].t - g[j].t < 300 && D(g.slice(i, j + 2)) <= disp) j++;
        const w2 = g.slice(i, j + 1);
        out.push({ t: w2[0].t, dur: w2[w2.length - 1].t - w2[0].t, x: mean(w2.map(s => s.x)), y: mean(w2.map(s => s.y)) });
        i = j + 1;
      } else i++;
    }
    return out;
  }
  function gazeSpread(stream) { const g = stream.filter(s => s.g && !s.bl); return { sx: sd(g.map(s => s.x)), sy: sd(g.map(s => s.y)) }; }
  // 時間を 4つに わけて（前半と 後半の ちがい ＝ 集中の つづき）
  function quarters(stream, fn) {
    if (!stream.length) return [];
    const t0 = stream[0].t, T = stream[stream.length - 1].t - t0;
    return [0, 1, 2, 3].map(q => fn(stream.filter(s => s.t - t0 >= T * q / 4 && s.t - t0 < T * (q + 1) / 4 + (q === 3 ? 1 : 0))));
  }
  // ヒートマップ（gw×gh の ます、ガウスで ぼかす）
  function heatGrid(points, gw, gh, sigma) {
    const g = new Float32Array(gw * gh);
    const s2 = 2 * sigma * sigma, R = Math.ceil(sigma * 2.5);
    points.forEach(p => {
      const cx = p.x * gw, cy = p.y * gh, w = p.w || 1;
      for (let y = Math.max(0, Math.floor(cy - R)); y < Math.min(gh, Math.ceil(cy + R)); y++)
        for (let x = Math.max(0, Math.floor(cx - R)); x < Math.min(gw, Math.ceil(cx + R)); x++) g[y * gw + x] += w * Math.exp(-((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2) / s2);
    });
    let mx = 0; g.forEach(v => { if (v > mx) mx = v; });
    if (mx > 0) for (let i = 0; i < g.length; i++) g[i] /= mx;
    return g;
  }
  // 3×3 の ばしょ ごとの 見た 時間（％）と はじめて 見るまでの 時間
  function aoiGrid(stream, n) {
    n = n || 3;
    const g = stream.filter(s => s.g && !s.bl && s.x >= 0 && s.x <= 1 && s.y >= 0 && s.y <= 1);
    const cells = Array.from({ length: n * n }, () => ({ n: 0, first: null }));
    const t0 = stream.length ? stream[0].t : 0;
    g.forEach(s => { const k = Math.min(n - 1, Math.floor(s.y * n)) * n + Math.min(n - 1, Math.floor(s.x * n)); cells[k].n++; if (cells[k].first == null) cells[k].first = s.t - t0; });
    const tot = g.length || 1;
    return cells.map(c => ({ pct: c.n / tot * 100, firstMs: c.first }));
  }

  /* ---------- しゅうちゅう チャレンジ（Go/No-Go） ----------
     trials: [{ type:'go'|'nogo', on(ms), rts:[ms…] }] */
  function cptScore(trials) {
    const go = trials.filter(t => t.type === 'go'), ng = trials.filter(t => t.type === 'nogo');
    const rt = [], ant = [];
    let hit = 0, om = 0, com = 0;
    go.forEach(t => { const r = (t.rts || []).find(x => x >= 150); if ((t.rts || []).some(x => x < 150)) ant.push(t); if (r != null) { hit++; rt.push(r); } else om++; });
    ng.forEach(t => { if ((t.rts || []).length) com++; });
    return {
      go: go.length, nogo: ng.length, hits: hit,
      omissionPct: go.length ? om / go.length * 100 : NaN,      // 見のがし（不注意の めやす）
      commissionPct: ng.length ? com / ng.length * 100 : NaN,   // おしまちがい（衝動性の めやす）
      anticipations: ant.length,
      rtMean: mean(rt), rtSd: sd(rt), rtCv: rt.length > 2 ? sd(rt) / mean(rt) : NaN   // 反応の ばらつき
    };
  }

  /* ---------- みくらべ（どっちを 見る？） ----------
     trial: { cat, leftKey, rightKey, stream }。 x<0.45 → 左、x>0.55 → 右 */
  function lookPair(stream) {
    let L = 0, Rr = 0, first = null, firstMs = null, sw = 0, last = null;
    const t0 = stream.length ? stream[0].t : 0;
    for (let i = 1; i < stream.length; i++) {
      const s = stream[i], dt = Math.min(100, s.t - stream[i - 1].t);
      if (!s.g || s.bl) continue;
      const side = s.x < 0.45 ? 'L' : s.x > 0.55 ? 'R' : null;
      if (!side) continue;
      if (side === 'L') L += dt; else Rr += dt;
      if (!first) { first = side; firstMs = s.t - t0; }
      if (last && last !== side) sw++;
      last = side;
    }
    return { L, R: Rr, first, firstMs, switches: sw };
  }
  // カテゴリごと：A を 見た わりあい（A/(A+B)）
  function pairSummary(trials) {
    const cats = {};
    trials.forEach(tr => {
      const r = lookPair(tr.stream);
      const a = tr.aSide === 'L' ? r.L : r.R, b = tr.aSide === 'L' ? r.R : r.L;
      const c = cats[tr.cat] = cats[tr.cat] || { cat: tr.cat, a: 0, b: 0, firstA: 0, firstN: 0, trials: 0 };
      c.a += a; c.b += b; c.trials++;
      if (r.first) { c.firstN++; if ((r.first === 'L') === (tr.aSide === 'L')) c.firstA++; }
    });
    return Object.values(cats).map(c => ({ cat: c.cat, aPct: c.a + c.b ? c.a / (c.a + c.b) * 100 : NaN, lookMs: c.a + c.b, firstAPct: c.firstN ? c.firstA / c.firstN * 100 : NaN, trials: c.trials }));
  }

  const api = { SETS, faceFeatures, facing, headPose, gazeVec, fitCalib, predict, validate, Smoother, headMotion, blinks, lookAways, attention, fixations, gazeSpread, quarters, heatGrid, aoiGrid, cptScore, lookPair, pairSummary, mean, sd, median };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.ML = api;
})(typeof window !== 'undefined' ? window : this);
