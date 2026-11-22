/* fwd.js — ホームの「note購入通知の転送」カード＋手順（2026-11-22 第1段）
   ・配信者＝自分の進み具合（①登録→②承認待ち→③フィルタ作り→④届いています ✅）と手順の画面
   ・プログラマー＝全員の一覧（未着手／登録済み・承認待ち／承認済み／届いています＋最後に届いた日時）と［承認した］
   ・🔴人名・転送先アドレスはGASが返す（このファイルに書かない＝公開リポジトリ）
   ・正本＝仕事/OKLチーム/note売上分析/要件定義_購入通知メール_v1.md §5 */
var FWD = (function () {
  var u = window.OKL.u;
  var st = { data: null, loading: false, err: '', at: 0, busy: '' };
  var LS = 'gakuya:fwd:' + (CONFIG.KEY || '').slice(0, 6) + ':' + (CONFIG.AS || '');
  try { var c0 = JSON.parse(localStorage.getItem(LS) || 'null'); if (c0 && c0.d) { st.data = c0.d; st.at = c0.at || 0; } } catch (e) { /* 控えが無くても読む */ }

  var FROM = 'noreply@note.com';
  var SUBJ = '購入されました OR チップ';
  var URL_FWD = 'https://mail.google.com/mail/u/0/#settings/fwdandpop';
  var URL_FLT = 'https://mail.google.com/mail/u/0/#settings/filters';

  function can(me) { return !!(me && me.fwd); }
  var seq = 0;
  function load(force) {
    if (st.loading && !force) return;
    var my = ++seq;
    st.loading = true; st.err = ''; draw();
    API.fwd().then(function (d) {
      if (my !== seq) return;
      st.data = d; st.at = Date.now();
      try { localStorage.setItem(LS, JSON.stringify({ d: d, at: st.at })); } catch (e) { /* 控えなしでも続ける */ }
    }, function (e) { if (my === seq) st.err = (e && e.code) || 'net'; })
      .then(function () { if (my !== seq) return; st.loading = false; draw(); });
  }
  function mounted() { if (!st.data || Date.now() - st.at > 60000) load(); }

  function md(s) { return s ? (+s.slice(5, 7)) + '/' + (+s.slice(8, 10)) + ' ' + s.slice(11, 16) : ''; }
  var STEP = {
    none:       { pill: '未着手', cls: 'dim' },
    registered: { pill: '登録済み・承認待ち', cls: 'warn' },
    approved:   { pill: '承認済み・フィルタ待ち', cls: 'info' },
    arrived:    { pill: '届いています ✅', cls: 'ok' }
  };

  // ── 配信者のカード ──
  function memberBody(d) {
    var m = d.me, s = m.step;
    var steps = [
      ['none', '① 転送先を登録して［登録しました］'],
      ['registered', '② プログラマーが承認（通知が届きます）'],
      ['approved', '③ フィルタを作る'],
      ['arrived', '④ 1通目が届いたら完了']
    ];
    var order = ['none', 'registered', 'approved', 'arrived'], cur = order.indexOf(s);
    var list = '<ol class="fw-steps">' + steps.map(function (x, i) {
      return '<li class="' + (i < cur ? 'is-done' : i === cur ? 'is-now' : '') + '">' + (i < cur ? '✓ ' : '') + x[1] + '</li>';
    }).join('') + '</ol>';
    var act = '';
    if (s === 'none') {
      act = '<p class="fw-lead">noteで記事が売れたときのメールを、プログラマーの受け取り用アドレスへ自動で転送する設定です（10分ほど）。これで売上が毎日アプリに出るようになります。</p>' +
        '<div class="btn-row"><button type="button" class="btn" data-fw-guide="1">手順を見る</button>' +
        '<button type="button" class="btn ghost" data-fw-op="reg"' + (st.busy ? ' disabled' : '') + '>登録しました</button></div>';
    } else if (s === 'registered') {
      act = '<p class="fw-lead">登録ありがとうございます。プログラマーが承認したら通知が届きます（少し待ってください）。</p>' +
        '<div class="btn-row"><button type="button" class="btn ghost btn-sm" data-fw-guide="1">手順を見る</button>' +
        '<button type="button" class="btn ghost btn-sm" data-fw-op="unreg"' + (st.busy ? ' disabled' : '') + '>まだ登録していなかった</button></div>';
    } else if (s === 'approved') {
      act = '<p class="fw-lead">承認が終わりました。最後に「フィルタ」を作ってください（3分ほど）。</p>' +
        '<div class="btn-row"><button type="button" class="btn" data-fw-guide="3">続きの手順を見る</button></div>' +
        '<p class="fresh">次にnoteで記事が売れると、ここが自動で「届いています ✅」に変わります。</p>';
    } else {
      act = '<p class="fw-lead">設定できました。ありがとうございます！ 最後に届いた：' + u.esc(md(m.last)) + '</p>';
    }
    return list + act;
  }

  // ── プログラマーの一覧 ──
  function adminBody(d) {
    var head = '<p class="sub">配信者への表示：' + (d.open ? '<b>出している</b>' : '出していない（準備中）') +
      ' ／ 集めるシート：' + (d.linked ? 'つながっている' : '<b class="fw-ng">未設定</b>') +
      (d.addr ? '' : ' ／ <b class="fw-ng">転送先アドレス未設定</b>') + '</p>';
    var rows = d.people.map(function (p) {
      var S = STEP[p.step];
      var btn = p.step === 'registered' || p.step === 'none'
        ? '<button type="button" class="btn btn-xs" data-fw-op="ok" data-fw-name="' + u.esc(p.name) + '"' + (st.busy ? ' disabled' : '') + '>承認した</button>' : '';
      var reset = p.step !== 'none' && p.step !== 'arrived'
        ? '<button type="button" class="btn ghost btn-xs" data-fw-op="reset" data-fw-name="' + u.esc(p.name) + '"' + (st.busy ? ' disabled' : '') + '>戻す</button>' : '';
      var when = p.step === 'arrived' ? '最後 ' + md(p.last) : p.step === 'approved' ? '承認 ' + md(p.ok) : p.step === 'registered' ? '登録 ' + md(p.reg) : '';
      return '<li class="fw-row"><span class="fw-name">' + u.esc(p.name) + '</span>' +
        '<span class="fw-pill fw-' + S.cls + '">' + S.pill + '</span>' +
        '<span class="fw-when">' + u.esc(when) + '</span><span class="fw-btns">' + btn + reset + '</span></li>';
    }).join('');
    return head + '<ul class="fw-list">' + rows + '</ul>' +
      '<p class="fresh">［承認した］＝確認メールのリンクを押したあとに押す（本人に「続きをどうぞ」の通知が飛びます）。届いています＝専用Gmailに本人分のメールが1通でも入った（自動）。</p>' +
      '<div class="btn-row"><button type="button" class="btn ghost btn-sm" data-fw-guide="1">配信者の手順を見る</button>' +
      '<button type="button" class="btn ghost btn-sm" data-fw-reload' + (st.loading ? ' disabled' : '') + '>最新にする</button></div>';
  }

  function card() {
    var d = st.data, body;
    if (d && d.show === false) return '';
    if (!d) body = st.loading ? '<p class="sub">読み込んでいます…</p>' : '<p class="sub">取れませんでした。</p><button type="button" class="btn ghost btn-sm" data-fw-reload>もう一度</button>';
    else body = d.admin ? adminBody(d) : memberBody(d);
    return '<div class="card fw-card" id="fw-card"><div class="pr-cap">📩 note購入通知の転送</div>' + body + '</div>';
  }
  function draw() {
    var el = document.getElementById('fw-card');
    if (el) { el.outerHTML = card() || '<div id="fw-card" hidden></div>'; return; }
    // 初回は空で置かれている
    var ph = document.getElementById('fw-card-ph');
    if (ph && st.data && st.data.show !== false) ph.outerHTML = card();
  }
  function homeCard() { return (st.data && st.data.show !== false) ? card() : '<div id="fw-card-ph" hidden></div>'; }

  function op(kind, name) {
    if (st.busy) return;
    if (kind === 'reset' && !confirm(name + ' を未着手に戻しますか？')) return;
    if (kind === 'unreg' && !confirm('［登録しました］を取り消しますか？')) return;
    st.busy = kind; draw();
    API.fwdDo({ op: kind, name: name || '' }).then(function (d) {
      st.data = d; st.at = Date.now();
      try { localStorage.setItem(LS, JSON.stringify({ d: d, at: st.at })); } catch (e) { /* そのまま */ }
      APP.toast(kind === 'reg' ? 'プログラマーに知らせました' : kind === 'ok' ? '承認を記録して本人に通知しました' : '記録しました');
    }, function (e) { APP.toast((e && e.message) || '保存できませんでした', true); })
      .then(function () { st.busy = ''; draw(); });
  }

  // ── 手順（下から出る画面） ──
  function copyBtn(text, label) {
    return '<button type="button" class="btn ghost btn-xs" data-fw-copy="' + u.esc(text) + '">' + (label || 'コピー') + '</button>';
  }
  // 画面の絵（Gmailの設定画面を簡単に描いたもの・押す所を赤枠）
  function mock(title, inner) {
    return '<div class="fw-mock" aria-hidden="true"><div class="fw-mock-bar"><i></i><i></i><i></i><span>' + title + '</span></div><div class="fw-mock-in">' + inner + '</div></div>';
  }
  function guide(from) {
    var d = st.data || {}, addr = d.addr || '（準備中）';
    var sec1 =
      '<h3 class="fw-h">はじめに</h3>' +
      '<ul class="fw-ul"><li>転送されるのは、noteの<b>「記事が購入されました」「チップ」のメールだけ</b>です。ほかのメールは届きません。</li>' +
      '<li>受け取るのはプログラマーだけ。ほかの配信者には見えません（アプリの売上も今までどおり本人の分だけ）。</li>' +
      '<li><b>PCのブラウザか、スマホのChromeで</b>やってください。🔴スマホのGmailアプリでは設定できません。</li>' +
      '<li>スマホのChromeなら、右上の︙ →「PC版サイト」にチェックを入れてから下のボタンを押してください。</li></ul>' +
      '<h3 class="fw-h">0. noteのメールが来ているか（来ていない人だけ）</h3>' +
      '<p>記事が売れたときに、noteから「記事が購入されました！」というメールが届いていない人は、noteの<b>アイコン → 設定 → メール通知</b>で「購入」「チップ」をオンにしてください。</p>' +
      '<h3 class="fw-h">1. 転送先を登録する</h3>' +
      '<ol class="fw-ol"><li>下のボタンでGmailの「転送とPOP/IMAP」を開く<div class="btn-row"><a class="btn btn-sm" href="' + URL_FWD + '" target="_blank" rel="noopener">Gmailの転送の設定を開く</a></div>' +
      '<p class="fresh">Googleアカウントを2つ以上使っている人は、右上の顔のマークで、noteに登録しているアカウントに切り替えてください。</p></li>' +
      '<li>「<b>転送先アドレスを追加</b>」を押す' +
      mock('設定 › 転送とPOP/IMAP', '<div class="fw-m-tabs"><span>全般</span><span>ラベル</span><span>受信トレイ</span><span>フィルタとブロック中のアドレス</span><span class="is-on">転送とPOP/IMAP</span></div>' +
        '<div class="fw-m-row"><b>転送:</b> <span class="fw-m-hit">転送先アドレスを追加</span></div>') + '</li>' +
      '<li>このアドレスを貼って「次へ」→「続行」→「OK」<div class="fw-addr"><code>' + u.esc(addr) + '</code>' + (d.addr ? copyBtn(addr) : '') + '</div>' +
      mock('転送先アドレスを追加', '<p class="fw-m-p">転送先のメールアドレスを入力してください:</p><div class="fw-m-input">' + u.esc(addr) + '</div><div class="fw-m-btns"><span>キャンセル</span><span class="fw-m-hit fw-m-blue">次へ</span></div>') + '</li>' +
      '<li>🔴<b>その下の「受信メールをコピーして転送」は選ばない</b>でください（「転送を無効にする」のまま）。選ぶと全部のメールが飛んでしまいます。' +
      mock('転送:', '<div class="fw-m-radio is-on">◉ 転送を無効にする <span class="fw-m-ok">← このまま</span></div><div class="fw-m-radio fw-m-x">○ 受信メールをコピーして転送 <span class="fw-m-ng">← 選ばない</span></div>') + '</li>' +
      '<li>アプリに戻って、ホームの［<b>登録しました</b>］を押す</li></ol>' +
      '<h3 class="fw-h">2. プログラマーが承認する</h3>' +
      '<p>こちらで確認のボタンを押します。終わったらアプリの通知でお知らせします。</p>';
    var sec3 =
      '<h3 class="fw-h" id="fw-g3">3. フィルタを作る（承認のお知らせのあと）</h3>' +
      '<ol class="fw-ol"><li>下のボタンでGmailの「フィルタとブロック中のアドレス」を開き、「<b>新しいフィルタを作成</b>」を押す<div class="btn-row"><a class="btn btn-sm" href="' + URL_FLT + '" target="_blank" rel="noopener">Gmailのフィルタの設定を開く</a></div></li>' +
      '<li>2か所だけ入れる<div class="fw-kv"><span>From</span><code>' + FROM + '</code>' + copyBtn(FROM) + '</div>' +
      '<div class="fw-kv"><span>件名</span><code>' + SUBJ + '</code>' + copyBtn(SUBJ) + '</div>' +
      mock('新しいフィルタを作成', '<div class="fw-m-kv"><span>From</span><div class="fw-m-input fw-m-hit">' + FROM + '</div></div><div class="fw-m-kv"><span>To</span><div class="fw-m-input"></div></div>' +
        '<div class="fw-m-kv"><span>件名</span><div class="fw-m-input fw-m-hit">' + SUBJ + '</div></div><div class="fw-m-btns"><span>検索</span><span class="fw-m-hit fw-m-blue">フィルタを作成</span></div>') + '</li>' +
      '<li>「<b>フィルタを作成</b>」→「<b>次のアドレスに転送する</b>」にチェック→ 1.で登録したアドレスを選ぶ →「<b>フィルタを作成</b>」' +
      mock('メールがこの検索条件に一致した場合:', '<div class="fw-m-radio">☐ 受信トレイをスキップ</div><div class="fw-m-radio">☐ 既読にする</div>' +
        '<div class="fw-m-radio fw-m-hit">☑ 次のアドレスに転送する: <span class="fw-m-sel">' + u.esc(addr) + ' ▾</span></div><div class="fw-m-btns"><span class="fw-m-hit fw-m-blue">フィルタを作成</span></div>') +
      '<p class="fresh">ほかのチェックは入れないでください（自分のGmailにも今までどおり届きます）。</p></li></ol>' +
      '<h3 class="fw-h">4. おわり</h3>' +
      '<p>次にnoteで記事が売れると、アプリのホームが自動で「届いています ✅」に変わります。1日たっても変わらないときは、共有タブの「プログラマーへの要望」で教えてください。</p>';
    var html = '<div class="sheet-back" data-fw-close><div class="sheet fw-sheet" role="dialog" aria-label="転送の手順">' +
      '<div class="sheet-head"><div><div class="sheet-title">📩 note購入通知の転送の手順</div><div class="sheet-sub">10分ほど・PCかスマホのChromeで</div></div>' +
      '<button type="button" class="btn ghost btn-sm" data-fw-close>閉じる</button></div>' +
      '<div class="fw-guide">' + sec1 + sec3 + '</div></div></div>';
    var box = document.createElement('div');
    box.id = 'fw-guide-box';
    box.innerHTML = html;
    document.body.appendChild(box);
    if (from === '3') { var t = document.getElementById('fw-g3'); if (t) t.scrollIntoView(); }
  }
  function closeGuide() { var b = document.getElementById('fw-guide-box'); if (b) b.remove(); }

  function copy(text) {
    var done = function () { APP.toast('コピーしました'); };
    var fb = function () {
      var ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select();
      var ok = false; try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      ta.remove(); if (ok) done(); else APP.toast('長押ししてコピーしてください', true);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fb); else fb();
  }

  document.addEventListener('click', function (e) {
    var t;
    if ((t = e.target.closest('[data-fw-copy]'))) { copy(t.getAttribute('data-fw-copy')); return; }
    if ((t = e.target.closest('[data-fw-guide]'))) { guide(t.getAttribute('data-fw-guide')); return; }
    if ((t = e.target.closest('[data-fw-op]'))) { op(t.getAttribute('data-fw-op'), t.getAttribute('data-fw-name')); return; }
    if (e.target.closest('[data-fw-reload]')) { load(true); return; }
    if ((t = e.target.closest('[data-fw-close]')) && (t.tagName === 'BUTTON' || e.target === t)) closeGuide();
  });

  return { can: can, homeCard: homeCard, mounted: mounted, load: load };
})();
