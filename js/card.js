/* card.js — 出走表（2026-09-30 Naoto「場のボタンを押したら出走表」＝配信者の予想の下調べ用）
   ・入口＝シフトの日付の詳細にある場のボタン（data-date・data-venue）。シフトの上にかぶせる全画面のシート（戻る＝閉じる）
   ・中身＝OBS①と同じ項目（ライン順・脚質・得点・B/H/S・勝率）＋3連単オッズ（人気順）＋結果・払戻
   ・データ＝GASの app=card／app=odds（card.gs が keirin.jp の公式データを取る）。出せるのは keirin.jp にある今日・明日の分だけ
   ・得点・B・H・S＝レース内の1位赤・2位青（同じ数字は同じ色・0と空は数えない＝OBSの出走表と同じ決まり）
   ・🆕10/16 選手DB統合＝出走表はこれ1つ（選手タブの「出走表」からもここが開く）。選手タブを見てよい人には
     選手名がボタン＝押すとその選手の詳細（riders.js）。役割・ライン車数・戦法はこのレースの並びから渡す */
var CARD = (function () {
  var u = window.OKL.u;
  var st = { date: '', place: '', data: null, race: 0, odds: {}, oddsBusy: {}, loading: false, err: '', open: false, back: '', aiOpen: {} };
  var KUBUN = { '8': ['モーニング', 'kc-morning'], '1': ['デイ', 'kc-day'], '3': ['ナイター', 'kc-night'], '5': ['ミッド', 'kc-mid'] };
  // 車番の色（競輪の決まりの色）＝[地, 字]
  var CAR = { 1: ['#ffffff', '#23252a'], 2: ['#23252a', '#ffffff'], 3: ['#d62d2d', '#ffffff'], 4: ['#2553c8', '#ffffff'], 5: ['#f2d21b', '#23252a'],
              6: ['#1f8a3b', '#ffffff'], 7: ['#f08a1c', '#ffffff'], 8: ['#f2a1c2', '#23252a'], 9: ['#7c3fb5', '#ffffff'] };
  var ROLE = ['先頭', '番手', '3番手', '4番手', '5番手'];

  function canRiders() { try { return !!(window.RIDERS && window.APP && RIDERS.can(APP.me())); } catch (e) { return false; } }
  function car(n, cls) { var c = CAR[n] || ['#ddd', '#23252a']; return '<span class="rc-car' + (cls ? ' ' + cls : '') + '" style="background:' + c[0] + ';color:' + c[1] + '">' + n + '</span>'; }
  function oddsTxt(v) { return v >= 100 ? u.yen(Math.round(v)) : v.toFixed(1); }
  function hm(iso) { var d = new Date(iso); return u.pad(d.getHours()) + ':' + u.pad(d.getMinutes()); }
  function today() { return u.ymd(new Date()); }

  // ── シート（1つだけ作って使い回す） ──
  function sheet() {
    var el = document.getElementById('card-sheet');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'card-sheet'; el.className = 'rc-sheet'; el.hidden = true;
    el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', '出走表');
    document.body.appendChild(el);
    return el;
  }
  // スマホの「戻る」で閉じる＝開くときに履歴を1つ積む
  //   🆕10/16 上に選手の詳細を重ねて戻ってきた（履歴が出走表の段に戻っただけ）ときは閉じない
  window.addEventListener('popstate', function () { if (st.open && !(history.state && history.state.okcard)) hide(); });
  function hide() {
    st.open = false;
    u.loc({ card: null });   // 閉じた＝更新しても開き直さない
    sheet().hidden = true;
    document.documentElement.classList.remove('rc-lock');
  }
  function close() { if (history.state && history.state.okcard) history.back(); else hide(); }

  // opts.back＝左上の戻るの文言（既定「‹ シフト」・選手タブからは「‹ 選手」）
  //   🆕10/24 opts.race＝最初に開くレース／opts.restore＝更新したあとの開き直し（app.js）
  function open(date, place, opts) {
    opts = opts || {};
    st.date = date; st.place = place; st.data = null; st.race = +opts.race || 0; st.odds = {}; st.oddsBusy = {}; st.err = ''; st.aiOpen = {};
    st.back = opts.back || '‹ シフト';
    st.open = true;
    remember();
    // 更新したあと＝今の履歴がもう出走表の段なら積み直さない（積むと「戻る」1回で閉じなくなる）
    try {
      var hs = history.state || {};
      if (opts.restore && hs.okcard) { /* そのまま使う */ }
      else { if (opts.restore && hs.rdbover) history.replaceState(null, ''); history.pushState({ okcard: 1 }, ''); }
    } catch (e) { /* 積めない端末は×で閉じる */ }
    var el = sheet();
    el.hidden = false; el.scrollTop = 0;
    document.documentElement.classList.add('rc-lock');
    load();
  }

  function remember() { u.loc({ card: { date: st.date, place: st.place, race: st.race, back: st.back } }); }

  function load() {
    st.loading = true; st.err = ''; draw();
    API.card(st.date, st.place).then(function (d) {
      st.data = d;
      if (d.state === 'ok' && (!st.race || !raceOf(st.race))) { st.race = defaultRace(d); remember(); }
    }).catch(function () { st.err = 'net'; })
      .then(function () { st.loading = false; draw(); loadOdds(st.race); });
  }

  // 最初に開くレース＝今日なら結果の出ていない最初のレース（全部終わっていれば最終レース）／明日は1R
  function defaultRace(d) {
    var rs = d.venue.races, done = {};
    (d.results || []).forEach(function (r) { done[r.no] = 1; });
    var next = rs.filter(function (r) { return !done[r.no]; })[0];
    return (next || rs[rs.length - 1]).no;
  }
  function raceOf(no) { return ((st.data && st.data.venue && st.data.venue.races) || []).filter(function (r) { return r.no === no; })[0]; }
  function resultOf(no) { return ((st.data && st.data.results) || []).filter(function (r) { return r.no === no; })[0]; }

  function loadOdds(no, force) {
    if (!no || !st.data || st.data.state !== 'ok' || resultOf(no) || st.oddsBusy[no]) return;
    if (st.odds[no] !== undefined && !force) return;
    st.oddsBusy[no] = true; draw();
    API.odds(st.date, st.place, no).then(function (d) { st.odds[no] = d.odds; }, function () { st.odds[no] = 'err'; })
      .then(function () { st.oddsBusy[no] = false; if (st.race === no) draw(); });
  }

  // 1位赤・2位青（同じ数字は同じ色・0と空は数えない）
  function ranker(vals) {
    var xs = vals.map(Number).filter(function (v) { return v > 0; });
    var uniq = xs.filter(function (v, i) { return xs.indexOf(v) === i; }).sort(function (a, b) { return b - a; });
    return function (v) { v = Number(v); return !(v > 0) ? '' : v === uniq[0] ? ' top1' : v === uniq[1] ? ' top2' : ''; };
  }

  // ── 描画 ──
  function head() {
    var d = st.data, v = d && d.venue, k = v && KUBUN[v.kubun];
    return '<div class="rc-top"><button type="button" class="rc-back" id="rc-close" aria-label="戻る">' + u.esc(st.back || '‹ シフト') + '</button>' +
      '<div class="rc-title"><b>' + u.esc(st.place) + '</b>' +
      (v ? (v.grade ? '<span class="rc-grade' + (/^G|^GP/.test(v.grade) ? ' is-g' : '') + '">' + u.esc(v.grade) + '</span>' : '') +
        (k ? '<span class="kb rc-kb ' + k[1] + '">' + k[0] + '</span>' : '') + (v.nichiji ? '<span class="rc-nichi">' + u.esc(v.nichiji) + '</span>' : '') : '') +
      '<small>' + u.md(st.date) + '</small></div>' +
      '<button type="button" class="link-btn" id="rc-reload">' + (st.loading ? '読み込み中…' : '最新にする') + '</button></div>';
  }

  function message(d) {
    var md = u.md(st.date);
    if (st.err) return 'つながりませんでした。「最新にする」を押してください。';
    if (d.state === 'down') return 'keirin.jp が読めませんでした（メンテナンス中かもしれません）。少し待ってから「最新にする」を押してください。';
    if (d.state === 'stop') return md + 'の' + u.esc(st.place) + 'は中止になりました。';
    if (d.state === 'none') return md + 'の' + u.esc(st.place) + 'の開催が keirin.jp で見つかりませんでした。';
    // notyet：終わった日／先の日／明日だけどまだ
    if (st.date < today() && (d.avail || []).indexOf(st.date.replace(/-/g, '')) < 0) return '終わった日の出走表は見られません（見られるのは今日と明日の分だけです）。';
    return md + 'の出走表は、keirin.jp でまだ公開されていません。' + (u.daysBetween(today(), st.date) > 1 ? '見られるのは今日と明日の分だけです。' : '公開されたら見られます。');
  }

  function racePicker(v) {
    return '<div class="rc-races" id="rc-races">' + v.races.map(function (r) {
      var done = !!resultOf(r.no);
      return '<button type="button" class="rc-rb' + (r.no === st.race ? ' is-sel' : '') + (done ? ' is-done' : '') + '" data-race="' + r.no + '"' +
        (r.no === st.race ? ' aria-current="true"' : '') + '><b>' + r.no + 'R</b><small class="num">' + u.esc(r.start || '') + '</small></button>';
    }).join('') + '</div>';
  }

  // 並び（ライン）→ 表の並び順と役割。並びが無いレースは車番順
  function ordered(r) {
    var byNo = {}; r.racers.forEach(function (x) { byNo[x.no] = x; });
    if (!r.lines || !r.lines.length) return [{ racers: r.racers.map(function (x) { return { x: x, role: '' }; }), label: '' }];
    var used = {};
    var groups = r.lines.map(function (line) {
      var list = [];
      line.forEach(function (pos, i) {
        pos.forEach(function (n) {
          if (!byNo[n]) return;
          used[n] = 1;
          list.push({ x: byNo[n], role: line.length === 1 && pos.length === 1 ? '単騎' : (ROLE[i] || (i + 1) + '番手'), seri: pos.length > 1 });
        });
      });
      var n = list.length;
      return { racers: list, label: n === 1 ? '単騎' : n + '車' };
    });
    var rest = r.racers.filter(function (x) { return !used[x.no]; });
    if (rest.length) groups.push({ racers: rest.map(function (x) { return { x: x, role: '' }; }), label: '' });
    return groups;
  }

  function narabiChips(r) {
    if (!r.lines || !r.lines.length) return '';
    // 発走後に keirin.jp から消えた並びは、GASが覚えていた発走前の予想（r.kept）
    return '<div class="rc-narabi"><span class="rc-cap">並び' + (r.kept ? '<small class="rc-kept">発走前の予想</small>' : '') + '</span>' + r.lines.map(function (line) {
      return '<span class="rc-ln">' + line.map(function (pos) {
        return pos.length > 1 ? '<span class="rc-seri">' + pos.slice().reverse().map(function (n) { return car(n, 'sm'); }).join('<i>=</i>') + '</span>' : car(pos[0], 'sm');
      }).join('') + '</span>';
    }).join('') + '</div>';
  }

  /* 10/29 Naoto「メモが書いてある選手に★」を出走表にも。
     選手タブ（riders/js/list.js）が端末に控えた名簿をそのまま読む＝GASへの往復は増やさない。
     ⚠️控えのキーは list.js の SNAP と同じ組み立て（鍵の頭6文字＋プレビューの人）。片方だけ直さない。
     控えが無い（この端末で選手タブを一度も開いていない）ときは★なし */
  function regKey(reg) { return String(reg || '').replace(/^0+/, ''); }
  function memoRegs() {
    var set = {};
    try {
      var k = 'riders:roster:' + String(localStorage.getItem('gakuya:key') || '').slice(0, 6) + ':' + (localStorage.getItem('gakuya:as') || '');
      (JSON.parse(localStorage.getItem(k) || 'null') || []).forEach(function (x) { if (x.hasMemo) set[regKey(x.reg)] = 1; });
    } catch (e) { /* 控えが読めない＝★なし */ }
    return set;
  }

  function table(r) {
    var rs = r.racers;
    var rkS = ranker(rs.map(function (x) { return x.score; }));
    // 🔄10/24 配信者の要望＝決まり手・B・H・S・勝率・3連対率もレース内の最多を赤（2位の青も今までの決まりのまま）
    //   st＝[逃,捲,差,マ,B,H,S,勝率,2連,3連]（card.gs）
    var rk = []; for (var c = 0; c < 10; c++) rk[c] = ranker(rs.map(function (x) { return (x.st || [])[c]; }));
    var rkB = rk[4], rkH = rk[5], rkSt = rk[6];
    var KIM = [[0, '逃'], [1, '捲'], [2, '差'], [3, 'マ']];
    var link = canRiders();
    var memo = link ? memoRegs() : {};
    return ordered(r).map(function (g) {
      return '<div class="rc-grp">' + (g.label ? '<div class="rc-grp-cap">' + g.label + '</div>' : '') + g.racers.map(function (o) {
        var x = o.x, s = x.st || [];
        // 選手タブを見てよい人＝名前がボタン（登録番号がある行だけ・古い控えの出走表には無い）
        var nm = link && x.reg
          ? '<button type="button" class="rc-name rc-name-link" data-reg="' + u.esc(x.reg) + '" data-car="' + x.no + '">' +
              (memo[regKey(x.reg)] ? '<span class="rc-star">★</span>' : '') + u.esc(x.name) + '</button>'
          : '<b class="rc-name">' + u.esc(x.name) + '</b>';
        return '<div class="rc-row">' + car(x.no) +
          '<div class="rc-main"><div class="rc-l1">' + nm +
            (x.h ? '<small class="rc-hj">' + u.esc(x.h) + '</small>' : '') +
            (o.role ? '<small class="rc-role' + (o.seri ? ' is-seri' : '') + '">' + (o.seri ? '競り' : o.role) + '</small>' : '') +
            '<span class="rc-kyaku">' + u.esc(x.kyaku || '') + '</span>' +
            '<span class="rc-score num' + rkS(x.score) + '">' + u.esc(x.score || '—') + '</span></div>' +
          '<div class="rc-l2"><span>' + u.esc([x.pref, x.term ? x.term + '期' : '', x.age ? x.age + '歳' : '', x.cls].filter(String).join(' ')) + '</span>' +
            '<span class="rc-bhs num"><i class="' + rkB(s[4]).trim() + '">B' + u.esc(s[4] || '0') + '</i><i class="' + rkH(s[5]).trim() + '">H' + u.esc(s[5] || '0') + '</i><i class="' + rkSt(s[6]).trim() + '">S' + u.esc(s[6] || '0') + '</i></span>' +
            '<span class="rc-win num' + rk[7](s[7]) + '">勝率' + (s[7] ? u.esc(s[7]) + '%' : '—') + '</span></div>' +
          // 3行目＝決まり手（直近4ヶ月の回数）と3連対率（勝率の真下）
          '<div class="rc-l3"><span class="rc-bhs num">' + KIM.map(function (k) {
              return '<i class="' + rk[k[0]](s[k[0]]).trim() + '">' + k[1] + u.esc(s[k[0]] || '0') + '</i>';
            }).join('') + '</span>' +
            '<span class="rc-win num' + rk[9](s[9]) + '">3連' + (s[9] ? u.esc(s[9]) + '%' : '—') + '</span></div></div></div>';
      }).join('') + '</div>';
    }).join('');
  }

  function resultBox(res) {
    return '<div class="card rc-res"><h3>結果</h3>' + res.order.map(function (n, i) {
      return '<div class="rc-res-row"><span class="rc-pos">' + (i + 1) + '着</span>' + car(n) + '<b>' + u.esc(res.names[i] || '') + '</b><small>' + u.esc(res.kimarite[i] || '') + '</small></div>';
    }).join('') +
      (res.pay.length ? '<div class="rc-pay">' + res.pay.map(function (p) {
        return '<div class="rc-pay-row"><span class="rc-cap">' + p.type + '</span><span class="rc-combo">' + p.combo.map(function (n) { return car(n, 'sm'); }).join('') + '</span><b class="num">' + u.yen(p.amount) + '円</b></div>';
      }).join('') + '</div>' : '') + '</div>';
  }

  function oddsBox(no) {
    var o = st.odds[no], busy = st.oddsBusy[no];
    var h = '<div class="card rc-odds"><div class="rc-odds-head"><h3>3連単オッズ<small>人気順</small></h3>' +
      '<span class="fresh">' + (o && o !== 'err' && o.cnt ? hm(o.at) + '時点' : '') +
      '<button type="button" class="link-btn" id="rc-odds-reload">' + (busy ? '読み込み中…' : '更新') + '</button></span></div>';
    if (o === undefined || (busy && !o)) return h + '<p class="sub">読み込み中…</p></div>';
    if (o === 'err') return h + '<p class="sub">オッズが読めませんでした。「更新」を押してください。</p></div>';
    if (!o) return h + '<p class="sub">オッズはまだ出ていません。</p></div>';
    if (!o.cnt || !o.top.length) return h + '<p class="sub">まだ発売前です。</p></div>';
    // 🔄10/1 Naoto「縦に1〜15番人気・2列目に16〜30番人気」＝列の方向に流す（行の数＝半分・切り上げ）
    return h + '<ol class="rc-odds-list" style="grid-template-rows:repeat(' + Math.ceil(o.top.length / 2) + ',auto)">' + o.top.map(function (t, i) {
      return '<li><span class="rc-rank num">' + (i + 1) + '</span><span class="rc-combo">' + t[0].split('').map(function (n) { return car(+n, 'sm'); }).join('') + '</span><b class="num">' + oddsTxt(t[1]) + '</b></li>';
    }).join('') + '</ol><p class="fresh">発売中は動きます。人気の上位30通り（全' + o.n + '通り）。</p></div>';
  }

  /* ── 🆕11/21 オッズ支持率・荒れ予報（配信者の要望「アプリからもAIアシスタントを見たい」）──
     OBSコンソールの §180 オッズ支持率・§193 AIアシスタント（荒れ予報）と同じ計算・同じ出し方。
     材料＝3連単の全部の組のオッズ（app=odds の all）だけ＝通信は増えない。どちらも最初はたたんで置く（開閉はレースごと・この画面の中だけ）。
     🔴AIは買い目を出さない＝荒れやすさの見込みだけ。
     ⚠️ARE の数字と計算は OBS の web/keirin.js（marketShares・areForecast）の写し。学習をやり直したら両方そろえる（次は2027-04-13の予定） */
  var ARE = {
    7: { w: [-1.391728, -0.385528, 0.756845], b: -0.95736, lo: 0.2111, hi: 0.3053, kw: [3.118462, 1.235865, -3.88467], kb: -0.62175, klo: 0.0611, khi: 0.2727, full: 210, base: 26, kbase: 19 },
    9: { off: true }   // 9車は出さない（OBSと同じ・確かめたレースが少なく見込みが外れた帯があった）
  };
  function marketShares(o, groups) {
    var keys = Object.keys(o).filter(function (k) { return /^\d{3}$/.test(k) && o[k] > 0; });
    if (!keys.length) return null;
    var inv = {}, sum = 0;
    keys.forEach(function (k) { inv[k] = 1 / o[k]; sum += inv[k]; });
    var win = {};
    keys.forEach(function (k) { var a = +k[0]; win[a] = (win[a] || 0) + inv[k] / sum; });
    var lines = groups.map(function (cars) {
      var set = {}, w = 0, s = 0;
      cars.forEach(function (c) { set[c] = true; w += win[c] || 0; });
      if (cars.length >= 2) keys.forEach(function (k) { if (set[+k[0]] && set[+k[1]]) s += inv[k] / sum; });
      return { cars: cars, win: w, settle: cars.length >= 2 ? s : null };
    });
    return { win: win, lines: lines };
  }
  function areForecast(o, carCount, girls) {
    var c = ARE[carCount];
    if (!c || c.off || girls) return null;
    var ks = Object.keys(o).filter(function (k) { return /^\d{3}$/.test(k) && o[k] > 0; }).sort(function (a, b) { return o[a] - o[b]; });
    if (ks.length < c.full * 0.9) return null;   // 欠車で組が減ったレース・出そろう前は出さない
    var inv = 0, top = 0;
    ks.forEach(function (k, i) { var v = 1 / o[k]; inv += v; if (i < 10) top += v; });
    var x = [top / inv, (1 / o[ks[0]]) / inv, Math.log(Math.max(o[ks[0]], 1)) / 3];
    var s = 1 / (1 + Math.exp(-(c.b + c.w[0] * x[0] + c.w[1] * x[1] + c.w[2] * x[2])));
    var k = 1 / (1 + Math.exp(-(c.kb + c.kw[0] * x[0] + c.kw[1] * x[1] + c.kw[2] * x[2])));
    return { pct: Math.round(s * 100), base: c.base, kpct: Math.round(k * 100), kbase: c.kbase,
      mlv: s >= c.hi ? 'hi' : s < c.lo ? 'lo' : 'mid', klv: k >= c.khi ? 'hi' : k < c.klo ? 'lo' : 'mid', favOdds: o[ks[0]] };
  }
  function isGirls(r) { return /[LＬ]\s*級|ガールズ/.test(r.cls || ''); }
  function aiFold(no, id, cap, inner) {
    return '<details class="card rc-ai" data-ai="' + no + '|' + id + '"' + (st.aiOpen[no + '|' + id] ? ' open' : '') + '><summary>' + cap + '</summary>' + inner + '</details>';
  }
  function marketBox(r) {
    var o = st.odds[r.no];
    if (!o || o === 'err' || !o.all) return '';
    var girls = isGirls(r);
    var groups = !girls && r.lines && r.lines.length ? r.lines.map(function (line) { var f = []; line.forEach(function (pos) { pos.forEach(function (n) { f.push(+n); }); }); return f; }) : [];
    var ms = marketShares(o.all, groups);
    if (!ms) return '';
    var pc = function (v) { return Math.round(v * 100); };
    var cars = groups.length ? [] : r.racers.map(function (x) { return +x.no; });
    var wv = []; (groups.length ? groups.reduce(function (a, g) { return a.concat(g); }, []) : cars).forEach(function (n) { wv.push(pc(ms.win[n] || 0)); });
    var rkW = ranker(wv), rkL = ranker(ms.lines.map(function (l) { return pc(l.win); }));
    var cell = function (n) { return '<span class="rc-ms-car">' + car(n, 'sm') + '<b class="num' + rkW(pc(ms.win[n] || 0)) + '">' + pc(ms.win[n] || 0) + '%</b></span>'; };
    var inner;
    if (groups.length) {
      inner = '<div class="rc-ms"><div class="rc-ms-row rc-ms-legend"><span>並び・1着率（個人）</span><span>1着率<br>（ライン）</span><span>ライン<br>決着率</span></div>' +
        ms.lines.map(function (l) {
          return '<div class="rc-ms-row"><span class="rc-ms-cars">' + l.cars.map(cell).join('') + '</span>' +
            '<b class="num' + rkL(pc(l.win)) + '">' + pc(l.win) + '%</b><b class="num">' + (l.settle === null ? 'ー' : pc(l.settle) + '%') + '</b></div>';
        }).join('') + '</div>';
    } else {
      inner = '<div class="rc-ms"><div class="rc-ms-legend">車番・1着率（個人）' + (girls ? '' : '<small>（並びが出ていないのでラインの数字はありません）</small>') + '</div><div class="rc-ms-cars">' + cars.map(cell).join('') + '</div></div>';
    }
    return aiFold(r.no, 'ms', 'オッズ支持率<small>（3連単の売れ方から逆算）</small>', inner +
      '<p class="fresh">1着率＝その車（ライン）が1着の組に集まっているお金の割合。ライン決着率＝1着・2着が同じラインの2人の組の割合。赤＝1位・青＝2位。</p>');
  }
  function areBox(r) {
    var o = st.odds[r.no];
    if (!o || o === 'err' || !o.all) return '';
    var n = r.racers.reduce(function (m, x) { return Math.max(m, +x.no || 0); }, 0);
    var f = areForecast(o.all, n, isGirls(r));
    if (!f) return '';
    var LV = { hi: '高め', mid: '普通', lo: '低め' };
    var row = function (cls, cap, lv, pct, base) {
      return '<div class="rc-are-row">' + cap + 'の見込み<b class="rc-are-lv' + (lv === 'hi' ? ' ' + cls : '') + '">' + LV[lv] + '</b>約' + pct + '%<small>（' + n + '車の平均は' + base + '%）</small></div>';
    };
    return aiFold(r.no, 'are', '🤖 AIアシスタント：荒れ予報',
      row('k-hi', '堅い決着（10倍未満）', f.klv, f.kpct, f.kbase) + row('m-hi', '万車券（100倍以上）', f.mlv, f.pct, f.base) +
      '<p class="fresh">1番人気の目 ' + oddsTxt(f.favOdds) + '倍・オッズが動くと変わります。7車の男子のレースだけ出ます。</p>');
  }

  function body() {
    var d = st.data;
    if (!d) return '<p class="sub">' + (st.err ? 'つながりませんでした。「最新にする」を押してください。' : '読み込んでいます…') + '</p>';
    if (d.state !== 'ok') return '<div class="card"><p>' + message(d) + '</p></div>';
    var v = d.venue, r = raceOf(st.race) || v.races[0], res = resultOf(r.no);
    return racePicker(v) +
      '<div class="rc-race"><div class="rc-race-head"><b>' + r.no + 'R</b><span>' + u.esc(r.cls || '') + '</span></div>' +
      '<div class="rc-race-sub num">発走 ' + u.esc(r.start || '—') + (r.den ? '・締切 ' + u.esc(r.den) : '') + (r.lineType ? '・' + u.esc(r.lineType) : '') + '</div>' +
      narabiChips(r) + '</div>' +
      '<div class="card rc-table">' + table(r) +
      (!r.lines || !r.lines.length ? '<p class="fresh">並び予想がないので車番順です' + (res ? '（発走前に並びを覚えられなかったレースです）' : '') + '。</p>' : '') + '</div>' +
      (res ? resultBox(res) : oddsBox(r.no) + marketBox(r) + areBox(r)) +
      '<p class="fresh">出走表・オッズ・結果＝keirin.jp（' + hm(d.at) + '取得）。数字の赤＝レース内1位・青＝2位（決まり手・B・H・S・勝率・3連は直近4ヶ月）。</p>';
  }

  function draw() {
    if (!st.open) return;
    var el = sheet();
    el.innerHTML = '<div class="rc-in">' + head() + body() + '</div>';
    el.querySelector('#rc-close').addEventListener('click', close);
    el.querySelector('#rc-reload').addEventListener('click', function () { if (st.loading) return; st.odds = {}; load(); });
    var or = el.querySelector('#rc-odds-reload');
    if (or) or.addEventListener('click', function () { loadOdds(st.race, true); });
    // 🆕11/21 たたんだ欄の開閉を覚える（オッズの更新で描き直しても開いたまま）
    el.querySelectorAll('details[data-ai]').forEach(function (d) {
      d.addEventListener('toggle', function () { st.aiOpen[d.dataset.ai] = d.open; });
    });
    el.querySelectorAll('[data-race]').forEach(function (b) {
      b.addEventListener('click', function () { st.race = +b.dataset.race; remember(); draw(); loadOdds(st.race); });
    });
    // 🆕10/16 選手名→選手の詳細（riders.js）。今日の役割・ライン車数・戦法の材料にこのレースの並びを渡す
    el.querySelectorAll('[data-reg]').forEach(function (b) {
      b.addEventListener('click', function () {
        var r = raceOf(st.race), v = st.data && st.data.venue;
        if (!r || !window.RIDERS) return;
        var x = r.racers.filter(function (y) { return String(y.no) === b.dataset.car; })[0] || {};
        RIDERS.openDetail(
          { reg: b.dataset.reg, jo: st.place, date: st.date, raceNo: r.no, cls: r.cls || '', grade: (v && v.grade) || '',
            lines: r.lines || [], lineType: r.lineType || '', car: +b.dataset.car },
          { name: x.name, kyuhan: x.cls, pref: x.pref, term: x.term, age: x.age, kyaku: x.kyaku, score: x.score });
      });
    });
    // 選んでいるレースの札が見えるように横スクロールを合わせる
    var sel = el.querySelector('.rc-rb.is-sel'), box = el.querySelector('#rc-races');
    if (sel && box) box.scrollLeft = Math.max(0, sel.offsetLeft - box.clientWidth / 2 + sel.offsetWidth / 2);
  }

  return { open: open };
})();
