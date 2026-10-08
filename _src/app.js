  /* ============================================================
     小さな道具
     ============================================================ */
  const $ = s => document.querySelector(s);
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rnd = (a, b) => a + Math.random() * (b - a);
  const shuffle = a => { const r = a.slice(); for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; } return r; };
  const r1 = v => Math.round(v * 10) / 10, r3 = v => Math.round(v * 1000) / 1000;
  const fmtDate = t => new Date(t).toLocaleString('ja-JP', { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  function h(tag, props) {
    const el = document.createElement(tag);
    if (props) Object.keys(props).forEach(k => {
      const v = props[k]; if (v === null || v === undefined || v === false) return;
      if (k === 'class') el.className = v; else if (k === 'html') el.innerHTML = v; else if (k === 'style') el.style.cssText = v; else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v); else el.setAttribute(k, v === true ? '' : v);
    });
    (function add(list) { list.forEach(c => { if (c === null || c === undefined || c === false || c === '') return; if (Array.isArray(c)) add(c); else el.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c); }); })(Array.prototype.slice.call(arguments, 2));
    return el;
  }
  let toastT = null;
  function toast(msg, ms) { const o = $('.toast'); if (o) o.remove(); const t = h('div', { class: 'toast' }, msg); document.body.appendChild(t); clearTimeout(toastT); toastT = setTimeout(() => t.remove(), ms || 2400); }

  /* ============================================================
     せってい
     ============================================================ */
  const ST_KEY = 'mieel-manazashi-st';
  const st = Object.assign({ kid: '', calPts: 9, cptMin: 3, cptMode: 'tap', cptPair: 0, pairSec: 5, pairCats: ['face', 'move', 'color', 'moji', 'kira', 'many'], viewSec: 20, sound: true, debug: false, preview: true }, (() => { try { return JSON.parse(localStorage.getItem(ST_KEY) || '{}'); } catch (e) { return {}; } })());
  const saveSt = () => { try { localStorage.setItem(ST_KEY, JSON.stringify(st)); } catch (e) { /* 無視 */ } };

  /* ============================================================
     ほぞん（IndexedDB・この 端末の 中だけ）
     ============================================================ */
  const DB = {
    db: null,
    open() { if (this.db) return Promise.resolve(this.db); return new Promise((res, rej) => { const r = indexedDB.open('mieel-manazashi', 1); r.onupgradeneeded = () => { const d = r.result; ['kids', 'sessions', 'images', 'calibs'].forEach(n => d.createObjectStore(n, { keyPath: 'id' })); }; r.onsuccess = () => { this.db = r.result; res(this.db); }; r.onerror = () => rej(r.error); }); },
    async all(store) { const d = await this.open(); return new Promise((res, rej) => { const q = d.transaction(store).objectStore(store).getAll(); q.onsuccess = () => res(q.result || []); q.onerror = () => rej(q.error); }); },
    async get(store, id) { const d = await this.open(); return new Promise((res, rej) => { const q = d.transaction(store).objectStore(store).get(id); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }); },
    async put(store, v) { const d = await this.open(); return new Promise((res, rej) => { const tx = d.transaction(store, 'readwrite'); tx.objectStore(store).put(v); tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); }); },
    async del(store, id) { const d = await this.open(); return new Promise((res, rej) => { const tx = d.transaction(store, 'readwrite'); tx.objectStore(store).delete(id); tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); }); }
  };
  let KIDS = [];
  const kidOf = id => KIDS.find(k => k.id === id);
  const curKid = () => kidOf(st.kid);

  /* ============================================================
     音
     ============================================================ */
  let ac = null;
  function A() { try { if (!ac) ac = new (window.AudioContext || window.webkitAudioContext)(); if (ac.state === 'suspended') ac.resume(); return ac; } catch (e) { return null; } }
  function tone(f, t0, dur, vol, type) { if (!st.sound) return; const a = A(); if (!a) return; const t = a.currentTime + t0, o = a.createOscillator(), g = a.createGain(); o.type = type || 'sine'; o.frequency.value = f; g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol || 0.12, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); o.connect(g).connect(a.destination); o.start(t); o.stop(t + dur + 0.05); }
  const SND = { pop: () => { tone(880, 0, 0.12); tone(1175, 0.08, 0.15); }, soft: () => tone(660, 0, 0.18, 0.08), ding: () => { tone(988, 0, 0.2, 0.1); tone(1319, 0.12, 0.3, 0.1); } };
  const canSpeak = 'speechSynthesis' in window; let jaVoice = null;
  function loadVoice() { if (!canSpeak) return; const v = speechSynthesis.getVoices().filter(x => /^ja/i.test(x.lang)); jaVoice = v.find(x => /Kyoko|O-ren|Otoya/i.test(x.name)) || v[0] || null; }
  function say(t) { if (!canSpeak || !st.sound || !t) return; try { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(jaSay(t)); u.lang = 'ja-JP'; u.rate = 0.95; if (jaVoice) u.voice = jaVoice; speechSynthesis.speak(u); } catch (e) { /* 無視 */ } }

  /* ============================================================
     カメラ と 顔の 読みとり
     ============================================================ */
  const video = $('#video');
  const timeout = (pr, ms, name) => Promise.race([pr, new Promise((_, rej) => setTimeout(() => rej(new Error(name)), ms))]);
  const V = { ready: false, loading: null, face: null, stream: null, step: '', lastVT: -1, lastT: 0, running: false, onFrame: null, fps: 0 };
  function loadVision() {
    if (V.ready) return Promise.resolve();
    if (V.loading) return V.loading;
    V.loading = (async () => {
      V.step = 'ぶひん（1/2）';
      const mp = await import(new URL('vendor/vision_bundle.js', location.href).href);
      const fs = await mp.FilesetResolver.forVisionTasks(new URL('vendor/wasm', location.href).href);
      const mk = async delegate => {
        V.step = '顔の モデル（2/2）' + (delegate === 'CPU' ? '・CPU' : '');
        V.face = await mp.FaceLandmarker.createFromOptions(fs, { baseOptions: { modelAssetPath: new URL('vendor/models/face_landmarker.task', location.href).href, delegate }, runningMode: 'VIDEO', numFaces: 1, outputFaceBlendshapes: true, outputFacialTransformationMatrixes: true, minFaceDetectionConfidence: 0.5, minFacePresenceConfidence: 0.5, minTrackingConfidence: 0.5 });
      };
      try { await timeout(mk('GPU'), 25000, 'gpu-timeout'); V.delegate = 'GPU'; } catch (e) { console.warn(e); V.gpuErr = String(e && e.message || e); await mk('CPU'); V.delegate = 'CPU'; }
      V.ready = true;
    })();
    V.loading.catch(() => { V.loading = null; });
    return V.loading;
  }
  async function startCam() {
    if (V.stream) return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('nocam');
    V.stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: 'user', width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } } });
    video.srcObject = V.stream;
    await timeout(video.play(), 5000, 'play').catch(() => {});
  }
  function stopCam() { V.running = false; V.onFrame = null; if (V.stream) { V.stream.getTracks().forEach(t => t.stop()); V.stream = null; } video.srcObject = null; video.className = ''; document.body.appendChild(video); releaseWake(); }
  // 毎コマ：顔の 特徴 f（なければ null）を わたす
  function runFace(onFrame) {
    V.onFrame = onFrame;
    if (V.running) return; V.running = true; V.lastVT = -1;
    const step = () => {
      if (!V.running) return;
      requestAnimationFrame(step);
      if (!V.ready || video.readyState < 2 || !video.videoWidth || video.currentTime === V.lastVT) return;
      V.lastVT = video.currentTime;
      let t = performance.now(); if (t <= V.lastT) t = V.lastT + 1;
      const dt = t - V.lastT; V.lastT = t; if (dt < 500) V.fps = V.fps * 0.9 + 100 / dt;
      let f = null;
      try {
        const r = V.face.detectForVideo(video, t);
        if (r.faceLandmarks && r.faceLandmarks[0]) f = ML.faceFeatures(r.faceLandmarks[0], video.videoWidth, video.videoHeight, r.facialTransformationMatrixes && r.facialTransformationMatrixes[0] && r.facialTransformationMatrixes[0].data, r.faceBlendshapes && r.faceBlendshapes[0] && r.faceBlendshapes[0].categories);
      } catch (e) { console.warn(e); }
      if (V.onFrame) V.onFrame(f, t);
    };
    requestAnimationFrame(step);
  }
  let wake = null;
  async function keepAwake() { try { if ('wakeLock' in navigator && !wake) { wake = await navigator.wakeLock.request('screen'); wake.addEventListener('release', () => { wake = null; }); } } catch (e) { /* 無視 */ } }
  function releaseWake() { try { if (wake) wake.release(); } catch (e) { /* 無視 */ } wake = null; }

  /* ============================================================
     全画面の ステージ（課題・キャリブレーション 共通）
     ============================================================ */
  const main = $('#main');
  let leave = null, cur = 'home';
  function go(fn, arg) {
    if (leave) { try { leave(); } catch (e) { /* 無視 */ } leave = null; }
    document.body.classList.remove('playing');
    main.innerHTML = ''; window.scrollTo(0, 0);
    $('#homeBtn').hidden = fn === renderHome;
    fn(arg);
  }
  // ステージを つくって カメラを じゅんびする。ok なら { stage, cv, g, center, pv, setPv, fit } を かえす
  async function openStage(opt) {
    opt = opt || {};
    document.body.classList.add('playing');
    const cv = h('canvas');
    const center = h('div', { class: 'center' });
    const quit = h('button', { class: 'quit', type: 'button' }, h('i'), h('span', null, '✕ やめる（ながおし）'));
    const pvSt = h('div', { class: 'st' }, '');
    const pv = h('div', { class: 'pv' }, pvSt);
    const loading = h('div', { class: 'loading' }, h('div', null, h('span', { class: 'emo' }, '📷'), h('span', { class: 'lt' }, 'カメラを ひらいています…')));
    const dbg = h('div', { class: 'dbg' });
    const stage = h('div', { class: 'stage' }, cv, center, pv, quit, dbg, loading);
    main.appendChild(h('section', { class: 'screen' }, stage));
    let qt = null; const qc = () => { clearTimeout(qt); quit.classList.remove('pressing'); };
    quit.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); quit.classList.add('pressing'); qt = setTimeout(() => { qc(); (opt.onQuit || (() => go(renderHome)))(); }, 1500); });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => quit.addEventListener(ev, qc));
    const fail = (title, detail) => { loading.innerHTML = ''; loading.append(h('div', null, h('span', { class: 'emo' }, '🙈'), title, h('small', { style: 'display:block;font-size:14px;margin-top:6px' }, detail), h('div', { class: 'row', style: 'justify-content:center;margin-top:12px' }, h('button', { class: 'pill', type: 'button', onclick: () => go(renderHome) }, '🏠 もどる')))); };
    try { await timeout(startCam(), 20000, 'camtimeout'); }
    catch (e) { const m = String(e && (e.name + ' ' + e.message) || e); fail(/NotAllowed|Permission|Security/i.test(m) ? 'カメラを つかう ことが ゆるされていません。' : /nocam/.test(m) ? 'この 画面では カメラが つかえません。' : 'カメラを ひらけませんでした。', /NotAllowed|Permission/i.test(m) ? 'iPad の「設定」→「アプリ」→「Safari」→「カメラ」を「確認」か「許可」に して、ひらきなおしてください。' : m); return null; }
    if (!stage.isConnected) return null;
    video.className = 'shown'; pv.insertBefore(video, pv.firstChild); video.play().catch(() => {});
    pv.hidden = !st.preview && !opt.showPv;
    const tick = setInterval(() => { const el = loading.querySelector('.lt'); if (el) el.textContent = '顔の 読みとりを じゅんび ちゅう：' + (V.step || '…'); }, 300);
    try { await timeout(loadVision(), 120000, 'visiontimeout'); } catch (e) { clearInterval(tick); fail('読みとりの じゅんびが できませんでした。', (V.step || '') + ' / ' + (e && e.message)); return null; }
    clearInterval(tick);
    if (!stage.isConnected) return null;
    loading.hidden = true; keepAwake();
    const g = cv.getContext('2d');
    const fit = () => { const d = Math.min(2, window.devicePixelRatio || 1), r = stage.getBoundingClientRect(); const W = Math.round(r.width), H = Math.round(r.height); if (cv.width !== W * d || cv.height !== H * d) { cv.width = W * d; cv.height = H * d; } g.setTransform(d, 0, 0, d, 0, 0); return { W, H }; };
    const setPv = (txt, ok) => { pvSt.textContent = txt; pvSt.style.background = ok ? 'rgba(47,158,68,.8)' : 'rgba(224,49,49,.8)'; };
    return { stage, cv, g, center, pv, setPv, fit, dbg, quit };
  }
  // 顔の じょうたいの ことば
  function faceStatus(f) {
    if (!f) return ['🙈 顔が みえません', false];
    const cm = Math.abs(f.hz);
    if (cm && cm < 24) return ['⬅️ すこし はなれて', false];
    if (cm && cm > 85) return ['➡️ すこし ちかづいて', false];
    if (!ML.facing(f)) return ['↩️ 画面の ほうを むいて', false];
    return ['✅ よい いち（' + Math.round(cm) + 'cm）', true];
  }

  /* ============================================================
     キャリブレーション（見ている ばしょを あわせる）
     ============================================================ */
  const CAL = {};   // kidId → { cal, quality, at }
  function calOf(kid) { const c = CAL[kid]; return c && Date.now() - c.at < 45 * 60000 ? c : null; }
  async function loadCals() { try { (await DB.all('calibs')).forEach(c => { CAL[c.id] = c; }); } catch (e) { /* 無視 */ } }
  // ひとまとまりの 記録（課題中の 1コマ）
  function sampleOf(f, t, cal, sm) {
    const s = { t: Math.round(t), pr: f ? 1 : 0, f: ML.facing(f) ? 1 : 0, g: 0, bl: f && f.blink ? 1 : 0 };
    if (f) { s.hx = r1(f.hx); s.hy = r1(f.hy); s.hz = r1(f.hz); s.yaw = r1(f.yaw); s.pitch = r1(f.pitch); }
    if (f && cal && !f.blink) { const p = sm.push(ML.predict(cal, f)); if (p) { s.g = 1; s.x = r3(p.x); s.y = r3(p.y); } }
    return s;
  }
