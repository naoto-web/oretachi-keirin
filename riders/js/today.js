/* ===========================================================
   today.js — 選手タブの「出走表」（2026-10-16 選手DB統合）
   ===========================================================
   🔄出走表は1つにまとめた（要件定義_選手DB統合 §1-④・Naoto決定）
      ＝選手DBの「本日の出走表」はやめ、アプリの出走表（オッズ・結果・払戻あり・card.js）を開く。
        ここは本日・明日の開催を並べるだけ。場を押す→アプリの出走表→選手名を押す→選手の詳細（役割・並びは出走表から渡る）。
   🔑役割・ライン車数・戦法の読み方（rolesFromLines ほか）は旧 today.js のまま残してある
      ＝出走表から選手を開いたとき、詳細の「◀ 今日」を付ける材料をここで作る（main.js の openFromCard）。 */

var TODAY = (function () {

  var state = { data: null, loaded: false, loading: false };

  /* 開催区分（keirin.jp の kubunIconName）。デイだけ印を出さない＝旧 today.js の見せ方そのまま */
  var KUBUN = { '8': 'モ', '1': 'デ', '3': 'ナ', '5': 'ミ' };
  var KUBUN_MARK = { 'モ': '☀️', 'デ': '', 'ナ': '🌙', 'ミ': '⭐' };
  var KUBUN_FULL = { 'モ': 'モーニング', 'デ': 'デイ', 'ナ': 'ナイター', 'ミ': 'ミッドナイト' };

  function load() {
    var box = document.getElementById('racecard');
    clear(box);
    box.appendChild(el('div', 'empty', '読み込み中…'));
    state.loading = true;
    return API.cardList().then(function (j) {
      state.data = j;
      state.loaded = true;
      render();
    }).catch(function (e) {
      clear(box);
      box.appendChild(el('div', 'empty', '取れませんでした：' + e.message));
    }).then(function () { state.loading = false; });
  }

  function ymd(d) { return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }

  function dayLabel(date) {
    var now = new Date(), t = ymd(now), tm = ymd(new Date(now.getTime() + 86400000));
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
    var md = m ? (+m[2]) + '/' + (+m[3]) : date;
    var wd = m ? '日月火水木金土'.charAt(new Date(+m[1], +m[2] - 1, +m[3]).getDay()) : '';
    return (date === t ? '本日 ' : date === tm ? '明日 ' : '') + md + (wd ? '（' + wd + '）' : '');
  }

  function render() {
    var box = document.getElementById('racecard');
    clear(box);
    var d = state.data || { list: [] };
    if (d.down && !(d.list || []).length) {
      var w = el('div', 'empty');
      w.appendChild(el('div', '', 'keirin.jp から開催一覧を取得できませんでした。'));
      w.appendChild(el('div', 'sm muted', 'メンテナンス中かもしれません（深夜に多い）。少し待ってから「取り直す」を押してください。'));
      box.appendChild(w);
      return;
    }
    if (!(d.list || []).length) { box.appendChild(el('div', 'empty', '開催がありません。')); return; }

    var byDate = {};
    var order = [];
    d.list.forEach(function (v) {
      if (!byDate[v.date]) { byDate[v.date] = []; order.push(v.date); }
      byDate[v.date].push(v);
    });
    order.forEach(function (date) {
      var sec = el('div', 'vday');
      sec.appendChild(el('div', 'vday-head', dayLabel(date)));
      var grid = el('div', 'vday-grid');
      byDate[date].forEach(function (v) {
        var b = el('button', 'vbtn' + (v.stop ? ' is-stop' : ''));
        b.type = 'button';
        b.appendChild(el('span', 'vtab-name', v.name));
        var kb = KUBUN[String(v.kubun || '')];
        if (kb && KUBUN_MARK[kb]) b.appendChild(el('span', 'vtab-kubun', KUBUN_MARK[kb]));
        if (v.grade) b.appendChild(el('span', 'vtab-grade' + (/^G|^GP/.test(v.grade) ? ' is-g' : ''), v.grade));
        if (v.nichiji) b.appendChild(el('span', 'vbtn-nichi', v.nichiji));
        if (v.stop) b.appendChild(el('span', 'vbtn-nichi', '中止'));
        b.title = [v.name, kb ? KUBUN_FULL[kb] : '', v.grade, v.nichiji].filter(Boolean).join('・');
        b.onclick = function () { openCard(date, v.name); };
        grid.appendChild(b);
      });
      sec.appendChild(grid);
      box.appendChild(sec);
    });
    box.appendChild(el('div', 'sm muted vday-note', '場を押すと出走表（オッズ・結果つき）が開きます。選手名を押すとその選手の詳細です。'));
  }

  /** アプリの出走表を開く。単独で開いたとき（親がいない）はアプリへ案内する */
  function openCard(date, place) {
    try {
      if (CONFIG.HOST && CONFIG.HOST.CARD) { CONFIG.HOST.CARD.open(date, place, { back: '‹ 選手' }); return; }
    } catch (e) { /* 下へ */ }
    toast('出走表はアプリの中で開けます。アプリから選手タブを開いてください。', true);
  }

  function bind() {
    document.getElementById('card-reload').addEventListener('click', function () { if (!state.loading) load(); });
  }

  /* ══════════ 出走表の1レースから「今日」の材料を作る（旧 today.js のまま）══════════ */

  /** 構造化された並びから 車番→役割 を作る。同じ位置に2人以上いる＝競りなので、その全員を「競り」にする */
  function rolesFromLines(lines) {
    var map = {};
    (lines || []).forEach(function (line) {
      var isSolo = line.length === 1 && line[0].length === 1;
      line.forEach(function (pos, i) {
        if (pos.length > 1) { pos.forEach(function (c) { map[c] = 'seri'; }); return; }
        var car = pos[0];
        if (isSolo) { map[car] = 'solo'; return; }
        map[car] = i === 0 ? 'head' : (i === 1 ? 'bante' : (i === 2 ? 'third' : 'fourth'));
      });
    });
    return map;
  }

  /** 車番 → 自分のラインの車数。競りの車も同じラインの1車として数える（集計側の line_size に合わせる） */
  function sizesFromLines(lines) {
    var map = {};
    (lines || []).forEach(function (line) {
      var n = 0;
      line.forEach(function (pos) { n += pos.length; });
      line.forEach(function (pos) { pos.forEach(function (c) { map[c] = n; }); });
    });
    return map;
  }

  /** 今日の戦法（'2'＝二分戦／'3'＝三分戦以上／''＝どちらとも言えない）。
      🔑出走表の見出しの文字をそのまま読む（2026-09-23 Naoto「出走表の言葉に合わせる」）。取れないときだけ並びから数える */
  function bunsenOf(r) {
    var t = String((r || {}).lineType || '');
    if (/^二/.test(t)) return '2';
    if (/^[三四五六七八九十]/.test(t)) return '3';
    if (/^一/.test(t)) return '';
    var n = 0;
    ((r || {}).lines || []).forEach(function (line) {
      var cars = 0;
      line.forEach(function (pos) { cars += pos.length; });
      if (cars >= 2) n++;
    });
    return n === 2 ? '2' : (n >= 3 ? '3' : '');
  }

  /** アプリの出走表の1レース＋車番 → 詳細の文脈（場・日付・R・役割・種別・ライン車数・戦法・グレード）。
      info＝{ jo, date:'YYYY-MM-DD', raceNo, cls, grade, lines, lineType, car } */
  function ctxFromRace(info) {
    var lines = info.lines || [];
    return {
      jo: info.jo || '',
      raceDate: String(info.date || '').replace(/-/g, ''),
      raceNo: info.raceNo || '',
      role: rolesFromLines(lines)[info.car] || '',
      cls: info.cls || '',
      lineSize: sizesFromLines(lines)[info.car] || 0,
      bunsen: bunsenOf({ lineType: info.lineType, lines: lines }),
      grade: info.grade || ''
    };
  }

  return {
    bind: bind,
    load: load,
    ensure: function () { if (!state.loaded && !state.loading) load(); },
    ctxFromRace: ctxFromRace,
    markCurrent: function () { /* 出走表はアプリ側＝印を付ける行がない */ },
    venueNames: function () { return []; }
  };
})();
