/* digest.js — ホームの「配信ダイジェスト」（2026-11-01 Naoto「PCで見るよりアプリで・どこまで見たか分からなくなる」）
   ・PCの配信ダイジェスト（md）をGASが持っている。ここは「未読の一覧」「月ごとの一覧」「本文」を見せるだけ
   ・既読は人ごと・GAS側＝スマホでもPCでも同じ。本文を開いたら既読／「すべて既読にする」
   ・見られる人＝管理者だけ（GASの me.digest）
   ・🔴中身（配信者の発言・お金の話）はGASが返す＝このファイルに書かない（公開リポジトリ）
   仕様の正本＝仕事/OKLチーム/スマホアプリ/要件定義_配信ダイジェスト_v1.md */
var DIGEST = (function () {
  var u = window.OKL.u;
  var st = { data: null, loading: false, err: '', at: 0, cached: false,
             open: false, mode: 'list', ym: '', month: null, monthBusy: false, item: null, itemBusy: false };
  var LS = 'gakuya:digest:' + (CONFIG.KEY || '').slice(0, 6);
  try { var c0 = JSON.parse(localStorage.getItem(LS) || 'null'); if (c0 && c0.d) { st.data = c0.d; st.at = c0.at || 0; st.cached = true; } } catch (e) { /* 控えが無くても読む */ }

  function can(me) { return !!(me && me.digest); }

  /* ── 読み込み（ホーム＝未読と最新の月）── */
  var seq = 0;
  function load(force) {
    if (st.loading && !force) return;
    var my = ++seq;
    st.loading = true; st.err = ''; drawCard();
    API.digest().then(function (d) {
      if (my !== seq) return;
      st.data = d; st.at = Date.now(); st.cached = false;
      try { localStorage.setItem(LS, JSON.stringify({ d: d, at: st.at })); } catch (e) { /* 控えられなくても表示は続ける */ }
    }, function (e) { if (my === seq) st.err = (e && e.code) || 'net'; })
      .then(function () { if (my !== seq) return; st.loading = false; drawCard(); });
  }
  function mounted() { if (!st.data || !st.at || Date.now() - st.at > 60000) load(); }

  function label(x) { return u.md(x.date) + '<span class="dg-slot ' + (x.slot === '夜' ? 'night' : 'day') + '">' + u.esc(x.slot) + '</span>'; }
  function warnPill(x) { return x.warn ? '<span class="dg-warn-pill">⚠️' + x.warn + '</span>' : ''; }
  function row(x, withGist) {
    return '<button type="button" class="dg-row' + (x.seen ? ' is-seen' : '') + '" data-dg-open="' + u.esc(x.id) + '">' +
      '<span class="dg-row-head">' + (x.seen ? '' : '<i class="dg-dot" aria-label="未読"></i>') + '<b>' + label(x) + '</b>' + warnPill(x) + '</span>' +
      (withGist && x.gist.length ? '<span class="dg-gist">' + x.gist.map(function (g) { return '<span>' + inline(g) + '</span>'; }).join('') + '</span>' : '') +
      '</button>';
  }

  // 🆕11/13 まだできていない配信を1行ずつ（字幕待ち＝放っておいてよい／⚠️＝止まっているかも）。GASの d.wait
  //   late＝PCのタスクから14時間以上届いていない＝タスク自体が止まっているかも
  function waitBlock(d) {
    var w = d && d.wait;
    if (!w) return '';
    var lines = (w.rows || []).map(function (x) {
      var stuck = x.state === 'stuck';
      return '<li class="dg-wait' + (stuck ? ' is-stuck' : '') + '">' + (stuck ? '⚠️ ' : '⏳ ') + '<b>' + label(x) + '</b>：' +
        (stuck ? '止まっているかも（' + u.esc(x.why) + '）' : u.esc(x.why) + '（遅くとも' + u.esc(x.due) + 'に出ます）') + '</li>';
    });
    if (w.late) {
      var t = new Date(w.at);
      lines.unshift('<li class="dg-wait is-stuck">⚠️ PCのタスクから連絡がありません（最後 ' + (t.getMonth() + 1) + '/' + t.getDate() + ' ' + u.pad(t.getHours()) + ':' + u.pad(t.getMinutes()) + '）＝止まっているかも</li>');
    }
    return lines.length ? '<ul class="dg-waits">' + lines.join('') + '</ul>' : '';
  }

  /* ── ホームのカード ── */
  function card() {
    var d = st.data, body = '';
    if (!d) {
      body = st.loading ? '<p class="sub">読み込んでいます…</p>'
        : '<p class="sub">取れませんでした。電波のよいところでもう一度。</p><button type="button" class="btn ghost btn-sm" data-dg-reload>もう一度</button>';
    } else {
      var un = d.unread || [];
      body = waitBlock(d) + (un.length
          ? '<p class="sub">未読 <b class="dg-count">' + un.length + '本</b>' + (st.cached ? '（前回の控え）' : '') + (st.loading ? '・読み込み中…' : '') + '</p>' +
            '<div class="dg-list">' + un.slice(0, 6).map(function (x) { return row(x, true); }).join('') + '</div>' +
            (un.length > 6 ? '<p class="fresh">ほか ' + (un.length - 6) + '本は「一覧」から。</p>' : '')
          : '<p class="sub">未読はありません' + (st.loading ? '・読み込み中…' : '') + '。</p>') +
        '<div class="btn-row"><button type="button" class="btn ghost" data-dg-list>一覧</button>' +
          (un.length ? '<button type="button" class="btn ghost" data-dg-allseen>すべて既読にする</button>' : '') + '</div>';
    }
    return '<div class="card dg-card" id="dg-card"><div class="pr-cap">📺 配信ダイジェスト</div>' + body + '</div>';
  }
  function drawCard() { var el = document.getElementById('dg-card'); if (el) el.outerHTML = card(); }

  /* ── 全画面のシート（出走表と同じ型・スマホの「戻る」で閉じる）── */
  function sheet() {
    var el = document.getElementById('dg-sheet');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'dg-sheet'; el.className = 'rc-sheet'; el.hidden = true;
    el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', '配信ダイジェスト');
    document.body.appendChild(el);
    return el;
  }
  // 履歴の段：{ okdg: 'list' } → 本文を開く { okdg: 'item' }。「戻る」で1段ずつ戻る
  window.addEventListener('popstate', function () {
    if (!st.open) return;
    var s = history.state && history.state.okdg;
    if (s === 'list') {
      st.mode = 'list'; st.item = null;
      // ホームから本文を直接開いて戻ってきた＝一覧はまだ読んでいない
      if (!st.month) { st.ym = st.ym || (st.data && st.data.ym) || ''; loadMonth(st.ym); }
      draw();
    }
    else if (s === 'item') { /* そのまま */ }
    else hide();
  });
  function show(mode) {
    if (!st.open) {
      st.open = true;
      try { history.pushState({ okdg: 'list' }, ''); } catch (e) { /* 積めない端末は×で閉じる */ }
      sheet().hidden = false;
      document.documentElement.classList.add('rc-lock');
    }
    st.mode = mode;
  }
  function hide() {
    st.open = false; st.mode = 'list'; st.item = null;
    sheet().hidden = true;
    document.documentElement.classList.remove('rc-lock');
    drawCard();
  }
  function back() { if (history.state && history.state.okdg) history.back(); else hide(); }

  function openList(ym) {
    show('list');
    st.ym = ym || st.ym || (st.data && st.data.ym) || '';
    if (st.data && st.data.ym === st.ym && st.data.list) st.month = st.data;
    draw();
    loadMonth(st.ym);
  }
  var mseq = 0;
  function loadMonth(ym) {
    var my = ++mseq;
    st.monthBusy = true; draw();
    API.digest(ym).then(function (d) { if (my !== mseq) return; st.month = d; st.ym = d.ym; })
      .catch(function () { if (my === mseq) APP.toast('一覧を取れませんでした', true); })
      .then(function () { if (my !== mseq) return; st.monthBusy = false; draw(); });
  }

  function openItem(id) {
    // ホームから直接開いた＝下に一覧の段を積んでから本文の段（「戻る」1回で一覧・2回でホーム）
    show('item');
    try { history.pushState({ okdg: 'item' }, ''); } catch (e) { /* 戻るは×で */ }
    st.item = { id: id, body: null }; st.itemBusy = true;
    sheet().scrollTop = 0;
    draw();
    API.digestOne(id).then(function (j) {
      if (!st.item || st.item.id !== id) return;
      st.item = j.item; st.itemBusy = false; draw();
      if (!j.item.seen) markSeen([id]);
    }).catch(function () {
      if (!st.item || st.item.id !== id) return;
      st.itemBusy = false; st.item.err = true; draw();
    });
  }

  // 既読＝画面はすぐ直す（GASへの保存は裏で）
  function markSeen(ids, all) {
    var hit = function (x) { return all || ids.indexOf(x.id) >= 0; };
    [st.data, st.month].forEach(function (d) {
      if (!d) return;
      (d.list || []).forEach(function (x) { if (hit(x)) x.seen = true; });
      d.unread = (d.unread || []).filter(function (x) { return !hit(x); });
    });
    if (st.item && hit(st.item)) st.item.seen = true;
    try { localStorage.setItem(LS, JSON.stringify({ d: st.data, at: st.at })); } catch (e) { /* 控えなし */ }
    drawCard(); if (st.open && st.mode === 'list') draw();
    API.digestSeen(all ? { all: true } : { ids: ids }).catch(function () { APP.toast('既読を保存できませんでした。次に開いたときにもう一度', true); });
  }

  /* ── md の表示（ダイジェストで使う書き方だけ：見出し・箇条書き・太字・リンク）── */
  function inline(s) {
    var t = u.esc(s);
    t = t.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, function (m, a, href) { return '<a href="' + href + '" target="_blank" rel="noopener">' + a + '</a>'; });
    t = t.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
    return t;
  }
  function render(md) {
    var out = [], inList = false;
    var close = function () { if (inList) { out.push('</ul>'); inList = false; } };
    String(md || '').split('\n').forEach(function (line) {
      var l = line.replace(/\s+$/, '');
      if (!l || /^---+$/.test(l) || /^# /.test(l)) { close(); return; }
      var h = l.match(/^#{2,3}\s+(.+)$/);
      if (h) { close(); out.push('<h3 class="dg-h">' + inline(h[1]) + '</h3>'); return; }
      var li = l.match(/^\s*[-*]\s+(.+)$/);
      if (li) {
        if (!inList) { out.push('<ul class="dg-ul">'); inList = true; }
        out.push('<li' + (/⚠️/.test(li[1]) ? ' class="is-warn"' : '') + '>' + inline(li[1]) + '</li>');
        return;
      }
      close();
      out.push('<p class="dg-p">' + inline(l) + '</p>');
    });
    close();
    return out.join('');
  }

  function head(title, sub, right) {
    return '<div class="rc-top"><button type="button" class="rc-back" data-dg-back>' + (st.mode === 'item' ? '‹ 一覧' : '‹ ホーム') + '</button>' +
      '<div class="rc-title"><b>' + title + '</b>' + (sub ? '<small>' + sub + '</small>' : '') + '</div>' + (right || '<span></span>') + '</div>';
  }
  function listView() {
    var d = st.month, ms = (d && d.months) || (st.data && st.data.months) || [], i = ms.indexOf(st.ym);
    var ymLabel = st.ym ? (+st.ym.slice(0, 4)) + '年' + (+st.ym.slice(5, 7)) + '月' : '';
    // 月の矢印＝実績タブと同じ見た目（.s-ymnav）
    var nav = '<div class="s-ymnav"><button type="button" class="s-ymgo" data-dg-ym="' + (i > 0 ? ms[i - 1] : '') + '"' + (i > 0 ? '' : ' disabled') + ' aria-label="前の月">‹</button>' +
      '<b>' + ymLabel + '</b>' +
      '<button type="button" class="s-ymgo" data-dg-ym="' + (i >= 0 && i < ms.length - 1 ? ms[i + 1] : '') + '"' + (i >= 0 && i < ms.length - 1 ? '' : ' disabled') + ' aria-label="次の月">›</button></div>';
    var list = d && d.ym === st.ym ? d.list : null;
    var unN = d ? (d.unread || []).length : 0;
    return head('配信ダイジェスト', unN ? '未読 ' + unN + '本' : '未読なし',
        '<button type="button" class="link-btn" data-dg-month-reload>' + (st.monthBusy ? '読み込み中…' : '最新にする') + '</button>') +
      nav +
      waitBlock(d || st.data) +
      (list ? (list.length ? '<div class="card dg-list">' + list.map(function (x) { return row(x, true); }).join('') + '</div>' : '<p class="sub">この月のダイジェストはありません。</p>')
            : '<p class="sub">読み込んでいます…</p>') +
      (unN ? '<div class="btn-row"><button type="button" class="btn ghost" data-dg-allseen>すべて既読にする</button></div>' : '') +
      '<p class="fresh">毎日7時・19時にPCが作ったものが届きます。夜の配信は字幕の遅れで翌日19時か翌々日の朝になります。⏳は放っておいて大丈夫です。</p>';
  }
  function itemView() {
    var x = st.item || {};
    if (st.itemBusy || !x.body) {
      return head('配信ダイジェスト', '', '') + '<p class="sub">' + (x.err ? '取れませんでした。戻ってもう一度開いてください。' : '読み込んでいます…') + '</p>';
    }
    var yt = x.video ? '<a class="link-btn" href="https://youtu.be/' + encodeURIComponent(x.video) + '" target="_blank" rel="noopener">YouTube</a>' : '';
    return head(label(x) + warnPill(x), u.esc(x.title || ''), yt) +
      '<div class="card dg-body">' + render(x.body) + '</div>' +
      '<p class="fresh">' + u.esc(x.gen ? '生成：' + x.gen : '') + '。固有名詞は自動字幕なので化けることがあります。判断が要る話は時刻のリンクから元の映像で。</p>';
  }
  function draw() {
    if (!st.open) return;
    sheet().innerHTML = '<div class="rc-in">' + (st.mode === 'item' ? itemView() : listView()) + '</div>';
  }

  document.addEventListener('click', function (e) {
    var t = e.target;
    var o = t.closest('[data-dg-open]');
    if (o) { openItem(o.dataset.dgOpen); return; }
    if (t.closest('[data-dg-list]')) { openList(st.data && st.data.ym); return; }
    if (t.closest('[data-dg-back]')) { back(); return; }
    var y = t.closest('[data-dg-ym]');
    if (y && y.dataset.dgYm) { st.ym = y.dataset.dgYm; st.month = null; draw(); loadMonth(st.ym); return; }
    if (t.closest('[data-dg-month-reload]')) { loadMonth(st.ym); return; }
    if (t.closest('[data-dg-allseen]')) {
      if (confirm('未読をすべて既読にしますか？')) markSeen([], true);
      return;
    }
    if (t.closest('[data-dg-reload]')) load(true);
  });

  return { can: can, card: card, mounted: mounted, load: load };
})();
