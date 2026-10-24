/* ===========================================================
   api.js — 選手DBのGASとの通信（アプリの合言葉つき）・自前集計ファイルの読み込み・共通の小物
   =========================================================== */

var API = (function () {

  function qs(obj) {
    return Object.keys(obj).filter(function (k) { return obj[k] !== undefined && obj[k] !== null && obj[k] !== ''; })
      .map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(obj[k]); }).join('&');
  }

  /* ── 合言葉（rtok）──
     🔑まず親（アプリの画面）が持っている me.rtok を使う＝開いた瞬間に読める。
     期限（3日）が近い・無い・選手DBに断られた（error:'token'）ときだけ、アプリのGASに取り直しに行く。 */
  var tok = '', tokP = null;
  function expOf(t) {
    try {
      var b = t.split('.')[0].replace(/-/g, '+').replace(/_/g, '/');
      return JSON.parse(decodeURIComponent(escape(atob(b)))).e || 0;
    } catch (e) { return 0; }
  }
  function fresh(t) { return !!t && expOf(t) - Date.now() / 1000 > 600; }
  function hostTok() {
    try { var m = CONFIG.HOST && CONFIG.HOST.APP.me(); return (m && m.rtok) || ''; } catch (e) { return ''; }
  }
  function getTok(force) {
    if (!force && fresh(tok)) return Promise.resolve(tok);
    if (!force && fresh(hostTok())) { tok = hostTok(); return Promise.resolve(tok); }
    if (tokP) return tokP;
    if (!CONFIG.APP_KEY) return Promise.reject(new Error('アプリの鍵がありません。アプリから開き直してください。'));
    var url = CONFIG.APP_GAS + '?' + qs({ app: 'riderstok', k: CONFIG.APP_KEY, as: CONFIG.APP_AS, cb: Date.now() });
    tokP = fetch(url, { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (j) {
      tokP = null;
      if (!j || !j.ok || !j.tok) throw new Error(j && j.error === 'forbidden' ? 'この画面を見る許可がありません。' : '合言葉を取れませんでした');
      tok = j.tok;
      return tok;
    }, function (e) { tokP = null; throw e; });
    return tokP;
  }

  /** GASが断った理由を人の言葉に */
  function errText(j, dflt) {
    var e = j && j.error;
    if (e === 'forbidden') return 'この操作をする許可がありません。';
    if (e === 'preview') return '配信者として見ている間は書けません。';
    return e || dflt;
  }

  /* ── 自分のこと（名前・管理者か・書けるか）＝選手DBのGASの返事（roster／rider の me）から覚える ──
     🔑画面側（main.js）はこれを見て「見せる範囲」のボタンを出すかを決める＝そのための往復を増やさない */
  var meInfo = null, meWatch = [];
  function noteMe(j) {
    if (!j || !j.me) return;
    meInfo = j.me;
    meWatch.forEach(function (fn) { try { fn(meInfo); } catch (e) { /* 画面側の都合 */ } });
  }

  /** 読み取り。GASのdoGetはリダイレクトを返すのでfetchの既定（follow）に任せる。
      合言葉が古いと断られたら1回だけ取り直してもう一度送る */
  function get(action, params, retried) {
    return getTok(!!retried).then(function (t) {
      var p = Object.assign({}, params || {}, { action: action, tok: t });
      return fetch(CONFIG.GAS_URL + '?' + qs(p), { method: 'GET' })
        .then(function (r) { return r.json(); })
        .then(function (j) {
          if (j && !j.ok && j.error === 'token' && !retried) return get(action, params, true);
          if (!j || !j.ok) throw new Error(j && j.error === 'forbidden' ? 'この画面を見る許可がありません。' : errText(j, '取得に失敗しました'));
          noteMe(j);
          return j;
        });
    });
  }

  /** 書き込み（段2・2026-10-20）。合言葉を付けて text/plain で送る（CORSの事前確認を避ける＝旧 api.js と同じ）。
      合言葉が古いと断られたら1回だけ取り直してもう一度送る。
      🔑書いた人は選手DBのGASが合言葉の名前で決める（ここから by は送らない）。プレビュー中はGASが断る（error:'preview'） */
  function post(action, body, retried) {
    return getTok(!!retried).then(function (t) {
      var payload = Object.assign({}, body || {}, { action: action, tok: t });
      return fetch(CONFIG.GAS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload)
      }).then(function (r) { return r.json(); })
        .then(function (j) {
          if (j && !j.ok && j.error === 'token' && !retried) return post(action, body, true);
          if (!j || !j.ok) throw new Error(errText(j, '保存に失敗しました'));
          return j;
        });
    });
  }

  /* ── 自前集計（静的ファイル）。無くてもアプリは動く ──
     🔑期間（4／8／12ヶ月）ごとに別ファイル・別キャッシュ（2026-09-24 §41）。
        同じセッションで一度読んだ窓は読み直さない＝切り替えを行き来しても通信は窓ごとに1回。
     ⚠️取れなかったとき（まだ公開されていない窓など）は**キャッシュしない**＝次に押したらもう一度取りに行く。
        返す箱に `missing: true` を立てるので、画面はそれを見て「この期間の集計はまだありません」と出せる。 */
  var statsCache = {};
  function stats(months) {
    var m = String(months || '4');
    if (statsCache[m]) return Promise.resolve(statsCache[m]);
    var url = (CONFIG.STATS_URLS && CONFIG.STATS_URLS[m]) || CONFIG.STATS_URL;
    return fetch(url + '?cb=' + Date.now(), { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; })
      .then(function (j) {
        if (!j) return { riders: {}, missing: true, months: m };
        statsCache[m] = j;
        return j;
      });
  }

  /* ── 選手タブの「出走表」に並べる開催（アプリのGAS app=cardlist）──
     🔑親が居れば親の API（12秒で2本目を送る仕組みつき）を使う。単独で開いたときは自分で取りに行く */
  function cardList() {
    try { if (CONFIG.HOST && CONFIG.HOST.API && CONFIG.HOST.API.cardList) return CONFIG.HOST.API.cardList(); } catch (e) { /* 自分で取る */ }
    var url = CONFIG.APP_GAS + '?' + qs({ app: 'cardlist', k: CONFIG.APP_KEY, as: CONFIG.APP_AS, cb: Date.now() });
    return fetch(url, { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (j) {
      if (!j || !j.ok) throw new Error((j && j.error) || '取得に失敗しました');
      return j;
    });
  }

  return {
    get: get,
    post: post,
    stats: stats,
    cardList: cardList,
    me: function () { return meInfo; },
    onMe: function (fn) { meWatch.push(fn); if (meInfo) fn(meInfo); },
    roster: function (kyuhan) { return get('roster', { kyuhan: kyuhan }); },
    rider: function (reg) { return get('rider', { reg: reg }); },
    comments: function (reg) { return get('comments', { reg: reg }); },
    ping: function () { return fetch(CONFIG.GAS_URL + '?action=ping').then(function (r) { return r.json(); }); },
    // ── 書く（段2）──
    addObs: function (obs) { return post('addObs', { obs: obs }); },
    patchObs: function (id, patch) { return post('patchObs', { id: id, patch: patch }); },
    saveMemo: function (reg, memo) { return post('saveMemo', { reg: reg, memo: memo }); },
    syncProfile: function (reg) { return post('syncProfile', { reg: reg }); },
    // ── 見せる範囲（管理者だけ）──
    visibility: function () { return get('visibility'); },
    setVisibility: function (writer, scope) { return post('setVisibility', { writer: writer, scope: scope }); }
  };
})();

/* ══════════ DOMの小物 ══════════ */

function el(tag, cls, text) {
  var e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined && text !== null) e.textContent = String(text);
  return e;
}

function clear(node) { while (node && node.firstChild) node.removeChild(node.firstChild); }

function $(sel) { return document.querySelector(sel); }

/** 車番の丸（展開ボードと同じ配色） */
function carChip(no) {
  var c = CONFIG.COLORS[no] || { bg: '#888', fg: '#fff' };
  var e = el('span', 'car', no);
  e.style.background = c.bg;
  e.style.color = c.fg;
  return e;
}

/** 苗字だけ（表示が長くなるところ用） */
function surname(name) {
  return String(name || '').split(/[\s　]+/)[0] || '';
}

function roleLabel(key) {
  for (var i = 0; i < CONFIG.ROLES.length; i++) if (CONFIG.ROLES[i].key === key) return CONFIG.ROLES[i].label;
  return key || '';
}

/** 「1.2%」のような表示。分母が0なら「—」
    🔑小数第1位まで必ず出す（2026-09-23 Naoto「50%じゃなくて50.0%。桁を合わせるために」）。 */
function pct(n, d) {
  if (!d) return '—';
  return (Math.round((n / d) * 1000) / 10).toFixed(1) + '%';
}

/** 知らせ。親（アプリ）が居れば親のトースト（画面の下・同じ見た目）に出す */
function toast(msg, isErr) {
  try { if (CONFIG.HOST && CONFIG.HOST.APP && CONFIG.HOST.APP.toast) { CONFIG.HOST.APP.toast(msg, isErr); return; } } catch (e) { /* 自分で出す */ }
  var t = document.getElementById('toast');
  if (!t) {
    t = el('div', 'toast');
    t.id = 'toast';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.dataset.err = isErr ? '1' : '';
  t.classList.add('is-on');
  clearTimeout(t._tm);
  t._tm = setTimeout(function () { t.classList.remove('is-on'); }, isErr ? 6000 : 2200);
}
