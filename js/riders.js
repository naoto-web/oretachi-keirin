/* riders.js — 選手タブ（2026-10-16 選手DBをアプリに統合・段1＝見るだけ）
   ・画面の中身＝ riders/（旧 stagekit/riders を写したページ）。この画面の中に iframe で1つだけ開いて使い回す
     ＝タブを行き来しても読み直さない（名簿・集計の数MBを毎回取らない）。iframe はタブの描き直し（#view）の外に置く
   ・2つの出し方
       選手タブ＝ロゴの下〜下のタブの上にぴったり重ねる
       出走表から（card.js で選手名を押した）＝画面いっぱいに重ねて詳細だけ。スマホの「戻る」で出走表に戻る（履歴を1つ積む）
   ・見てよい人＝GASの me.riders（管理者＋APP_RIDERS_VIEWERS）。中身の本人確認はページ側が me.rtok で選手DBのGASに直接行う
   仕様の正本＝仕事/OKLチーム/スマホアプリ/要件定義_選手DB統合_v1.md */
var RIDERS = (function () {
  var layer = null, frame = null, isReady = false, queue = [], shown = false, over = false;

  function can(me) { return !!(me && me.riders); }

  function ensure() {
    if (layer) return;
    layer = document.createElement('div');
    layer.id = 'rdb-layer'; layer.className = 'rdb-layer'; layer.hidden = true;
    frame = document.createElement('iframe');
    frame.className = 'rdb-frame'; frame.title = '選手';
    frame.src = 'riders/';
    layer.appendChild(frame);
    document.body.appendChild(layer);
    window.addEventListener('resize', function () { if (shown && !over) place(); });
  }
  function page() { try { return frame.contentWindow.RDB; } catch (e) { return null; } }
  function call(fn) { if (isReady && page()) fn(page()); else queue.push(fn); }

  // 選手タブのとき＝ロゴの行の下から下のタブの上まで
  function place() {
    var top = document.querySelector('.top'), tabs = document.getElementById('tabs');
    layer.style.top = Math.max(0, Math.round(top ? top.getBoundingClientRect().bottom : 0)) + 'px';
    layer.style.bottom = Math.round(tabs ? tabs.getBoundingClientRect().height : 0) + 'px';
  }

  function show() {
    ensure();
    shown = true;
    document.documentElement.classList.add('rdb-on');
    if (over) return;          // 出走表から開いた詳細を出している間はそのまま
    layer.hidden = false;
    place();
    call(function (p) { p.showTab(); });
  }
  function hide() {
    shown = false;
    document.documentElement.classList.remove('rdb-on');
    if (layer && !over) layer.hidden = true;
  }

  /** card.js から。info＝{ reg, jo, date, raceNo, cls, grade, lines, lineType, car }・seed＝{ name, kyuhan, score }（見出しを先に出す） */
  function openDetail(info, seed) {
    ensure();
    over = true;
    layer.classList.add('is-over');
    layer.style.top = ''; layer.style.bottom = '';
    layer.hidden = false;
    try { history.pushState({ rdbover: 1 }, ''); } catch (e) { /* 積めない端末はページの「← 出走表へ」で閉じる */ }
    call(function (p) { p.openFromCard(info, seed); });
  }
  function hideOver() {
    if (!over) return;
    over = false;
    layer.classList.remove('is-over');
    if (shown) { place(); call(function (p) { p.showTab(); }); } else layer.hidden = true;
  }
  /** ページの「← 出走表へ」。積んだ履歴を戻す＝スマホの戻ると同じ道 */
  function closeOver() { if (history.state && history.state.rdbover) history.back(); else hideOver(); }
  window.addEventListener('popstate', function () { if (over && !(history.state && history.state.rdbover)) hideOver(); });

  /** ページの用意ができた（riders/js/main.js が呼ぶ） */
  function ready() {
    isReady = true;
    var q = queue; queue = [];
    q.forEach(function (fn) { if (page()) fn(page()); });
  }

  return { can: can, show: show, hide: hide, openDetail: openDetail, closeOver: closeOver, ready: ready };
})();
