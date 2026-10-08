  /* ============================================================
     ホーム
     ============================================================ */
  function renderHome() {
    const scr = h('section', { class: 'screen scroll home' });
    main.appendChild(scr);
    const k = curKid(), c = k ? calOf(k.id) : null;
    scr.append(
      h('div', { class: 'row' }, h('h2', { class: 't', style: 'flex:1' }, '👀 まなざし ラボ'), h('span', { class: 'help' }, '先生用：見る・集中の ようすを 記録して くらべる')),
      h('div', { class: 'card', style: 'display:flex;flex-direction:column;gap:10px' },
        h('b', null, 'こども'),
        h('div', { class: 'kids' }, KIDS.map(x => h('button', { type: 'button', class: 'kid' + (x.id === st.kid ? ' on' : ''), onclick: () => { st.kid = x.id; saveSt(); go(renderHome); } }, '🙂 ' + x.name)),
          h('button', { type: 'button', class: 'kid add', onclick: addKid }, '＋ くわえる')),
        h('p', { class: 'help' }, 'なまえは ニックネームや イニシャルに して ください（この 端末の 中だけに 保存されます）。'),
        k ? h('div', { class: 'row' }, h('span', { class: 'calbadge' + (c ? ' ' + c.quality.grade : '') }, c ? '👀 見る ばしょ あわせ：' + { good: 'よい', ok: 'ふつう', poor: 'あらい' }[c.quality.grade] + '（' + new Date(c.at).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }) + '）' : '👀 見る ばしょ あわせ：まだ'), h('button', { class: 'pill', type: 'button', onclick: () => go(() => runCalib(() => go(renderHome))) }, '🎯 いま あわせる')) : null),
      h('div', { class: 'tasks' },
        tcard('⭐', 'しゅうちゅう チャレンジ', '「いぬが 出たら タッチ」の 課題で、見のがし・おしまちがい・反応の ばらつき・頭の 動き・よそ見を はかります（2〜5分）。', 'CPT', renderCptSetup),
        tcard('👀', 'どっちを みる？', '左右に ならべた 2つの うち、どちらを 長く・さきに 見るか。「どんな 刺激に 目が いきやすいか」を さがします。', '視線', renderPairSetup),
        tcard('🖼️', 'きょうざいを みる', '教材や プリントの 写真を 見せて、どこを 見たかを ヒートマップに します。', '視線', renderViewSetup),
        tcard('📊', 'きろく・レポート', '結果の くわしい 見かた・前の 回との くらべ・印刷・CSV。', '', renderReport)),
      h('div', { class: 'note info' }, 'ℹ️ この ツールは 診断を する ものでは ありません。その子の ようすを 数字に して、前の 自分と くらべる ための ものです。はかる 前に メニュー →「根拠と ちゅうい」を 一度 読んで ください。'));
  }
  function tcard(e, name, desc, tag, fn) { return h('button', { class: 'tcard', type: 'button', onclick: () => { A(); if (fn !== renderReport && !curKid()) { toast('さいしょに こどもを えらんで ください'); return; } go(fn); } }, h('span', { class: 'emo' }, e), h('span', null, h('b', null, name), h('small', null, desc)), tag ? h('span', { class: 'tag' }, tag) : null); }
  async function addKid() {
    const name = (prompt('こどもの なまえ（ニックネーム・イニシャル）') || '').trim(); if (!name) return;
    const k = { id: uid(), name, at: Date.now() }; await DB.put('kids', k); KIDS.push(k); st.kid = k.id; saveSt(); go(renderHome);
  }

  /* ============================================================
     メニュー
     ============================================================ */
  let mTab = 'set';
  function openMenu(tab) { if (tab) mTab = tab; renderMenu(); $('#menu').classList.add('open'); }
  function closeMenu() { $('#menu').classList.remove('open'); }
  $('#menuBtn').addEventListener('click', () => openMenu());
  $('#mClose').addEventListener('click', closeMenu);
  $('#menu').addEventListener('click', e => { if (e.target.id === 'menu') closeMenu(); });
  $('#homeBtn').addEventListener('click', () => go(renderHome));
  function renderMenu() {
    const tabs = $('#mTabs'); tabs.innerHTML = '';
    [['set', '🛠️ せってい'], ['data', '💾 データ'], ['doc', '📚 根拠と ちゅうい'], ['lic', '📜 ライセンス']].forEach(([k, t]) => tabs.append(h('button', { type: 'button', class: mTab === k ? 'on' : '', onclick: () => { mTab = k; renderMenu(); } }, t)));
    const b = $('#mBody'); b.innerHTML = '';
    if (mTab === 'set') {
      const seg = (label, key, opts, help) => h('div', { class: 'row' }, h('b', { style: 'min-width:150px' }, label), h('div', { class: 'seg' }, opts.map(([v, t]) => h('button', { type: 'button', class: st[key] === v ? 'on' : '', onclick: () => { st[key] = v; saveSt(); renderMenu(); } }, t))), help ? h('small', { class: 'help' }, help) : null);
      b.append(
        seg('見る ばしょ あわせ', 'calPts', [[9, '9点（ていねい）'], [5, '5点'], [3, '3点（左右だけ）']], '「きょうざいを みる」は 5点 いじょうが ひつよう。じっと 見るのが むずかしい 子は 少ない 点で。'),
        seg('カメラの 小窓', 'preview', [[true, 'だす'], [false, 'ださない']], '課題中、右下に カメラの 映像と「よい いち」かどうかを 出す（子どもが 気に なる ときは「ださない」）'),
        seg('音・こえ', 'sound', [[true, 'だす'], [false, 'ださない']]),
        seg('しらべる 表示', 'debug', [[false, 'ださない'], [true, 'だす']], '先生用：視線の 点・fps を 画面に 出す'),
        h('p', { class: 'help' }, '© 2026 MieeL　学校や家庭での利用は自由です（無断転載・再配布・販売はお断り）。くわしくは「📜 ライセンス」'));
    } else if (mTab === 'data') {
      b.append(h('p', { class: 'help' }, '記録は この 端末の ブラウザの 中だけに あります（どこにも 送りません）。ブラウザの データを けすと きえるので、ときどき「バックアップ」を して ください。'),
        h('div', { class: 'row' },
          h('button', { class: 'pill', type: 'button', onclick: backup }, '💾 バックアップを ほぞん'),
          h('button', { class: 'pill', type: 'button', onclick: restore }, '📥 バックアップから もどす')),
        h('div', { class: 'row' }, KIDS.map(k => h('button', { class: 'pill danger', type: 'button', onclick: async () => { if (!confirm('「' + k.name + '」と その 記録を ぜんぶ けしますか？')) return; for (const s of (await DB.all('sessions')).filter(x => x.kid === k.id)) await DB.del('sessions', s.id); await DB.del('kids', k.id); await DB.del('calibs', k.id); KIDS = KIDS.filter(x => x !== k); if (st.kid === k.id) st.kid = ''; saveSt(); renderMenu(); go(renderHome); } }, '🗑️ ' + k.name + ' を けす'))));
    } else if (mTab === 'doc') renderDoc(b);
    else renderLicense(b);
  }
  async function backup() {
    const blobTo64 = b => new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(b); });
    const imgs = await DB.all('images');
    const data = { format: 'mieel-manazashi', v: 1, at: new Date().toISOString(), kids: await DB.all('kids'), sessions: await DB.all('sessions'), calibs: await DB.all('calibs'), images: await Promise.all(imgs.map(async i => Object.assign({}, i, { blob: await blobTo64(i.blob) }))) };
    download('まなざしラボ_バックアップ_' + new Date().toISOString().slice(0, 10) + '.json', JSON.stringify(data), 'application/json');
  }
  function restore() {
    const fi = $('#fileIn'); fi.accept = '.json,application/json'; fi.value = '';
    fi.onchange = async () => {
      const f = fi.files && fi.files[0]; if (!f) return;
      try {
        const j = JSON.parse(await f.text()); if (j.format !== 'mieel-manazashi') throw new Error('format');
        for (const k of j.kids || []) await DB.put('kids', k);
        for (const s of j.sessions || []) await DB.put('sessions', s);
        for (const c of j.calibs || []) await DB.put('calibs', c);
        for (const i of j.images || []) { const r = await fetch(i.blob); await DB.put('images', Object.assign({}, i, { blob: await r.blob() })); }
        KIDS = await DB.all('kids'); await loadCals(); toast('もどしました（こども ' + (j.kids || []).length + '人・記録 ' + (j.sessions || []).length + 'こ）', 3500); closeMenu(); go(renderHome);
      } catch (e) { toast('よみこめませんでした（まなざしラボの バックアップを えらんでください）', 3500); }
    };
    fi.click();
  }
  function renderDoc(b) {
    b.innerHTML = `<div class="doc">
    <h3>この ツールで わかる こと</h3>
    <p>iPad の 前面カメラで 顔と 目の 位置を 読みとり、課題中の「画面を 向いていた 割合」「よそ見」「頭の 動き」「まばたき」と、見る ばしょ あわせ（キャリブレーション）を した ときは「どこを 見ていたか」を 記録します。<b>同じ 子の 記録を くりかえし とって、前の 自分と くらべる</b> ことで、集中が つづく 時間・集中しやすい 条件・目が いきやすい 刺激を さがす ための 道具です。</p>
    <h3>根拠に している 考え方</h3>
    <p><b>持続的注意課題（CPT）</b>：一定の 時間、決まった 刺激に だけ 反応する 課題です。反応しなかった 割合（見のがし）は 不注意の、反応しては いけない ときの 反応（おしまちがい）は 衝動性の めやすとして、注意の 評価に 広く 使われています。反応時間の ばらつきも 注意の ゆらぎの 指標と されます。</p>
    <p><b>課題中の 頭の 動き</b>：CPT と 赤外線カメラによる 頭の 動きの 計測を 組み合わせた 検査（QbTest）が 医療機関で ADHD の 評価の 補助に 使われています。ただし 15の 研究の まとめ（2023年）では、ADHD の ある人を 正しく 見分けたのは 約78%・ない人は 約70% で、<b>それだけで 判断できる 正確さは ない</b> と されています（<a href="https://psychcentral.com/adhd/computerized-testing-for-adhd-is-it-useful" target="_blank" rel="noopener">解説</a>・<a href="https://www.nice.org.uk/advice/mib318/chapter/The-technology" target="_blank" rel="noopener">NICE</a>）。</p>
    <p><b>まばたき</b>：課題の むずかしさや 状態で かわり、目に 入る 刺激の まえで おさえられる ことが 知られています。一方で、ADHD の ある 子と ない 子で まばたきの 回数に 差が 見られなかった 研究も あります（<a href="https://www.ncbi.nlm.nih.gov/pmc/articles/PMC5281678/" target="_blank" rel="noopener">子どもの まばたきの 研究</a>）。<b>よい／わるいの 指標では なく</b>、その子の ふだんとの ちがいを 見る ために 出しています。</p>
    <p><b>2つ ならべて 見せる 方法（選好注視）</b>：乳幼児の 研究で 長く 使われてきた 方法で、どちらを 長く 見るかで 好みや 気づきを 調べます。左右を 入れかえて 2回 見せ、左右の くせを 打ち消して います。</p>
    <p><b>ウェブカメラでの 視線計測</b>：子どもでも 研究に 使われていますが、専用の アイトラッカーより ぶれが 大きい ことが 報告されています（<a href="https://www.cambridge.org/core/services/aop-cambridge-core/content/view/F28BD05F1D529D3ADE04F2E28A5EE4CB/S0305000924000175a.pdf/assessing-two-methods-of-webcam-based-eye-tracking-for-child-language-research.pdf" target="_blank" rel="noopener">子どもでの 比較研究</a>）。この ツールでも、見る ばしょ あわせの 結果（ずれ）を 毎回 記録し、ずれが 大きい ときは 視線の 指標を 使わないように しています。</p>
    <h3>だいじな ちゅうい</h3>
    <p>・<b>診断では ありません。</b>「多動」「不注意」などを この 結果だけで 判断しないで ください。気に なる ときは 医療・専門機関と 相談して ください。<br>
    ・<b>くらべるのは その子 自身。</b>ほかの 子との くらべや 基準値は ありません。同じ 時間帯・同じ 場所・同じ 姿勢・同じ 課題で、<b>3回 いじょう</b> とると 傾向が 見えて きます（「これまでの 平均」と 自動で くらべます）。<br>
    ・<b>体調・ねむけ・薬・部屋の 明るさ・すわり方</b>で 数字は かわります。メモに のこして ください。<br>
    ・保護者の 了解を 得てから つかって ください。</p>
    <h3>プライバシー</h3>
    <p>カメラの 映像は 保存も 送信も しません。顔の 点の 動き（数字）だけを この 端末の 中に 保存します。なまえは ニックネームに して ください。</p>
    </div>`;
  }
  function renderLicense(b) {
    b.innerHTML = `<div class="lic">
      <h3>このアプリ</h3>
      <p><b>© 2026 MieeL（ミエル）</b>　<a href="https://www.mieel-support-school.com/" target="_blank" rel="noopener">www.mieel-support-school.com</a><br>
      学校・家庭・放課後等デイサービス・療育機関などで、子どもの学習や支援のために使うことは自由です（費用はかかりません）。<br>
      プログラム・画像・文章の無断転載・複製、改変しての公開・再配布、販売、有料の サービスや 商品への 組みこみは お断りします。くわしくは <a href="LICENSE.md" target="_blank" rel="noopener">LICENSE.md</a> を ご覧ください。</p>
      <h3>使っている ソフトウェア</h3>
      <div class="licitem"><b>MediaPipe Tasks Vision</b>（@mediapipe/tasks-vision 1.1.0）・モデル：face_landmarker<br>
      Copyright The MediaPipe Authors / Google LLC<br>
      Apache License, Version 2.0 で 公開されています。<a href="https://github.com/google-ai-edge/mediapipe" target="_blank" rel="noopener">github.com/google-ai-edge/mediapipe</a><br>
      このアプリでは 変更せずに そのまま 同梱しています（vendor/ フォルダ）。<br>
      <button class="pill" type="button" id="licFull" style="margin-top:8px">📄 Apache License 2.0 の 全文を ひょうじ</button>
      <pre id="licText" hidden></pre></div>
      <div class="licitem"><b>絵文字</b>　iPad・パソコンに 入っている 標準の 絵文字フォントで 表示しています（アプリには ふくまれていません）。</div>
      <h3>プライバシー</h3>
      <p>カメラの 映像は 保存も 送信も しません。読み取りは すべて この端末の 中で 行います。記録は この端末の 中だけに 保存されます。</p>
    </div>`;
    const btn = b.querySelector('#licFull'), pre = b.querySelector('#licText');
    btn.addEventListener('click', async () => {
      if (!pre.hidden) { pre.hidden = true; return; }
      pre.hidden = false; pre.textContent = 'よみこみ ちゅう…';
      try { const r = await fetch('vendor/LICENSE-APACHE-2.0.txt'); pre.textContent = r.ok ? await r.text() : 'https://www.apache.org/licenses/LICENSE-2.0'; } catch (e) { pre.textContent = 'オフラインの ため 表示できません。https://www.apache.org/licenses/LICENSE-2.0'; }
    });
  }
  function makeTouchIcon() { try { const c = document.createElement('canvas'); c.width = c.height = 180; const g = c.getContext('2d'); g.fillStyle = '#BAC8FF'; g.fillRect(0, 0, 180, 180); g.font = '118px "Apple Color Emoji","Segoe UI Emoji",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('👀', 90, 98); $('#touchIcon').href = c.toDataURL(); } catch (e) { /* 無視 */ } }

  /* ============================================================
     はじまり
     ============================================================ */
  if (canSpeak) { loadVoice(); speechSynthesis.onvoiceschanged = loadVoice; }
  document.addEventListener('pointerdown', function unlock() { A(); }, { once: true });
  makeTouchIcon();
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) navigator.serviceWorker.register('sw.js').catch(() => {});
  (async () => {
    try { KIDS = (await DB.all('kids')).sort((a, b) => a.at - b.at); await loadCals(); } catch (e) { console.warn(e); }
    if (st.kid && !kidOf(st.kid)) st.kid = '';
    go(renderHome);
    setTimeout(() => loadVision().catch(() => {}), 1500);
  })();
  window.__ml = { V, st, DB, CAL, get kids() { return KIDS; }, metricsOf, go, renderSession, renderReport };
