/* ===========================================================
   main.js — 起動・タブ切替・スマホの画面の行き来・アプリとのつなぎ
   ===========================================================
   🔄2026-10-16 アプリ（俺競ライブ）の「選手」タブの中で動く（親＝アプリの riders.js が iframe で開く）。
     ・白背景で固定（アプリの配色・旧選手DBの白テーマ）。黒⇄白の切り替え・APIキーの入力画面は持たない
     ・2つの開き方
         tab  ＝選手タブ（一覧／出走表）。いつもの「さがす⇄選手」の行き来（履歴はこの中で積む）
         over ＝アプリの出走表で選手名を押した＝詳細だけを出す。戻る＝アプリが閉じる（履歴はアプリが積む）
     ・親から呼ぶ口＝window.RDB（openFromCard / showTab）。用意ができたら親の RIDERS.ready() を呼ぶ */

/* ══════════ スマホ（1カラム）の画面の行き来＝要件§35 ══════════
   🔑`data-m` は**幅に関係なく常に付ける**（CSSの @media の中でだけ使う）。
   🔑**履歴を積むのは狭いときだけ**＝PCで「戻る」がページを離れられなくなるのを防ぐ。
   🔑over（出走表から開いた）のときは積まない＝戻るはアプリ側の履歴で閉じる。 */
var MOBILE = (function () {

  var MQ = window.matchMedia('(max-width: 700px)');
  var pushed = false;                 // 履歴を1つ積んでいるか（二重に積まない）

  function isNarrow() { return MQ.matches; }
  function app() { return document.getElementById('app'); }

  function toDetail() {
    var a = app();
    if (!a || a.dataset.m === 'detail') return;   // すでに詳細＝積み直さない
    a.dataset.m = 'detail';
    if (!isNarrow() || a.dataset.mode === 'over') { window.scrollTo(0, 0); return; }
    try { history.pushState({ riders: 'detail' }, ''); pushed = true; } catch (e) { /* 履歴が使えない環境 */ }
    window.scrollTo(0, 0);            // 前の選手を見ていた位置に居ると、名前が画面の外にある
  }

  function toList() {
    var a = app();
    if (a) a.dataset.m = 'list';
    // スマホで一覧へ戻った＝選手を閉じた（更新しても開き直さない）。PCは2カラムなので詳細を開いたまま
    if (isNarrow() && (!a || a.dataset.mode !== 'over')) rloc({ reg: '' });
  }

  /** 画面の「← もどる」。over＝アプリに閉じてもらう／積んでいれば戻す／それ以外はその場で一覧へ */
  function back() {
    var a = app();
    if (a && a.dataset.mode === 'over') {
      try { if (CONFIG.HOST && CONFIG.HOST.RIDERS) { CONFIG.HOST.RIDERS.closeOver(); return; } } catch (e) { /* 下へ */ }
    }
    if (pushed) { pushed = false; history.back(); return; }
    toList();
  }

  function onChange(fn) {
    if (MQ.addEventListener) MQ.addEventListener('change', fn);
    else if (MQ.addListener) MQ.addListener(fn);
  }

  window.addEventListener('popstate', function () { pushed = false; toList(); });

  return { isNarrow: isNarrow, toDetail: toDetail, toList: toList, back: back, onChange: onChange };
})();

(function () {

  document.body.dataset.theme = 'light';   // 白で固定（style.css の白テーマ）

  var listLoaded = false;

  /** want＝list｜today｜scope（scope＝管理者の「見せる範囲」。タブの列には無く、右端の⚙から） */
  function setTab(want) {
    Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (x) { x.classList.toggle('is-on', x.dataset.tab === want); });
    var gear = document.getElementById('scope-btn');
    if (gear) gear.classList.toggle('is-on', want === 'scope');
    document.getElementById('app').dataset.tab = want;
    document.getElementById('pane-list').classList.toggle('is-hidden', want !== 'list');
    document.getElementById('pane-today').classList.toggle('is-hidden', want !== 'today');
    document.getElementById('pane-scope').classList.toggle('is-hidden', want !== 'scope');
    if (want === 'today') TODAY.ensure();
    if (want === 'list') ensureList();
    if (want === 'scope' && window.SCOPE) SCOPE.ensure();
    MOBILE.toList();
    rloc({ tab: want });
    backLabel();
  }

  function bindTabs() {
    Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (t) {
      t.addEventListener('click', function () { setTab(t.dataset.tab); });
    });
    var gear = document.getElementById('scope-btn');
    if (gear) gear.addEventListener('click', function () { setTab('scope'); });
    // ⚙は管理者だけ（GASの me＝名簿・詳細の返事に添えてある。プレビュー中は canWrite が false＝出さない）
    API.onMe(function (m) { if (gear) gear.classList.toggle('is-hidden', !(m && m.admin && m.canWrite)); });
    backLabel();
  }

  function bindMobile() {
    var b = document.getElementById('m-back');
    if (b) b.addEventListener('click', function () { MOBILE.back(); });
  }

  /** 戻りバーの文言を「どこへ戻るか」に合わせる */
  function backLabel() {
    var b = document.getElementById('m-back');
    if (!b) return;
    var a = document.getElementById('app');
    b.textContent = a.dataset.mode === 'over' ? '← 出走表へ' : '← 一覧へ';
  }

  /** 名簿は選手一覧を初めて出すときに1回だけ読む（出走表から詳細だけ見るときは読まない） */
  function ensureList() {
    if (listLoaded) return;
    listLoaded = true;
    LIST.load(document.getElementById('kyuhan-sel').value, true).catch(function () { listLoaded = false; });
  }

  /* ── 親（アプリ）から呼ぶ口 ── */
  window.RDB = {
    /** アプリの出走表で選手名を押した。info＝{ reg, jo, date, raceNo, cls, grade, lines, lineType, car }・seed＝{ name, kyuhan, score } */
    openFromCard: function (info, seed) {
      var a = document.getElementById('app');
      a.dataset.mode = 'over';
      backLabel();
      DETAIL.open(info.reg, TODAY.ctxFromRace(info), seed || null);
      MOBILE.toDetail();
    },
    /** 選手タブとして出す（出走表から開いた詳細を閉じたあと） */
    showTab: function () {
      var a = document.getElementById('app');
      var wasOver = a.dataset.mode === 'over';
      a.dataset.mode = 'tab';
      backLabel();
      if (wasOver) MOBILE.toList();
      if (a.dataset.tab !== 'today') ensureList();
    }
  };

  // ⚠️読み込み係（index.html）は version.json を待ってから JS を差し込む＝この時点で DOMContentLoaded は済んでいることが多い
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  function init() {
    var a = document.getElementById('app');
    a.dataset.mode = a.dataset.mode || 'tab';
    bindTabs();
    bindMobile();
    LIST.bind();
    TODAY.bind();
    // 役割別の集計（数MB）は裏で取っておく＝最初の1人目を開くときに待たせない
    API.stats();
    // 🆕10/24 更新前に見ていた場所へ戻す（［出走表｜見せる範囲］と開いていた選手）
    var saved = rloc();
    if (saved.tab === 'today' || saved.tab === 'scope') setTab(saved.tab);
    var reopen = saved.reg;
    try { if (CONFIG.HOST && CONFIG.HOST.RIDERS) CONFIG.HOST.RIDERS.ready(); } catch (e) { /* 単独で開いた */ }
    // 親が「出走表から開いた」を先に頼んでいなければ、一覧を読む
    setTimeout(function () {
      if (a.dataset.mode === 'over') return;
      if (a.dataset.tab !== 'today') ensureList();
      if (reopen) DETAIL.open(reopen);
    }, 0);
  }
})();
