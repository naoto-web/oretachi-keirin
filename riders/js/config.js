/* ===========================================================
   config.js — 選手タブ（アプリの中の選手DB）の接続先・定数・合言葉の持ち方
   ===========================================================
   🔄2026-10-16 選手DBをアプリへ統合（段1＝見るだけ）。元＝stagekit/riders（段3で削除）。
   🔑読むときの本人確認＝アプリの鍵。共有のAPIキーはもう使わない。
      アプリのGAS（OKLアプリAPI）が「この人は〇〇・管理者か」を署名つきの合言葉（rtok・3日）で渡し、
      この画面はそれを付けて選手DBのGASを直接読む（アプリのGASを中継しない＝遅くならない）。
      合言葉の出どころ＝①親（アプリの画面）が持っている me.rtok ②無い・切れたらアプリのGASに取りに行く（app=riderstok）。
   🔑誰の書いたものが見えるかは選手DBのGASが決める（見てはいけない行は届かない）。
   🔴鍵・合言葉・人の名前をこのファイルに書かない（公開リポジトリ）。 */

var CONFIG = (function () {

  var RDB_GAS = 'https://script.google.com/macros/s/AKfycbzG20o4yYfeKuqRyHuwNka9jCZk6Y1PmDD6LDWIqwCM4QZO8BNV8esIEW_0Niy6XqEClg/exec';
  var APP_GAS = 'https://script.google.com/macros/s/AKfycbxI5on7XK1yCEO60Y7DvHa8AwB1L8j1qgfhYQ7bzM3WXlC6DhIdrxSr-_KiPNd_gfDb/exec';

  // アプリの鍵とプレビュー中の人（アプリの config.js と同じ置き場所＝同じ公開場所なので共有できる）
  var appKey = '', appAs = '';
  try { appKey = localStorage.getItem('gakuya:key') || ''; appAs = localStorage.getItem('gakuya:as') || ''; } catch (e) { /* 覚えられない端末 */ }

  /* 親（アプリの画面）。iframe の中で開かれているときだけ。⚠️同じ公開場所なので中身を直接呼べる */
  var host = null;
  try { if (window.parent !== window && window.parent.APP) host = window.parent; } catch (e) { host = null; }

  /* 競輪の選手服の色（競技規則由来の業界標準）＝展開ボードと同じ値 */
  var COLORS = {
    1: { bg: '#ffffff', fg: '#141414' },
    2: { bg: '#1c1c1c', fg: '#ffffff' },
    3: { bg: '#e02b2b', fg: '#ffffff' },
    4: { bg: '#1668cc', fg: '#ffffff' },
    5: { bg: '#f7df1c', fg: '#141414' },
    6: { bg: '#12a150', fg: '#ffffff' },
    7: { bg: '#f5851f', fg: '#141414' },
    8: { bg: '#f288b4', fg: '#141414' },
    9: { bg: '#8455c9', fg: '#ffffff' }
  };

  /* 役割の6区分（要件§2-4）。キーはGAS側の ROLES と一致させること */
  var ROLES = [
    { key: 'head', label: '先頭', hint: '前回り。ラインの先頭を走るとき' },
    { key: 'bante', label: '番手', hint: 'ラインの2番目' },
    { key: 'third', label: '3番手', hint: 'ラインの3番目' },
    { key: 'fourth', label: '4番手以降', hint: '7車立てではめったに起きない' },
    { key: 'solo', label: '単騎', hint: 'ラインに入らない' },
    { key: 'seri', label: '競り', hint: '番手を争う形＋横の強さ' }
  ];

  /* 競輪場の一覧（観察ログの「場」のプルダウン用）。表記は keirin.jp の開催一覧と同じ（旧 stagekit/riders から） */
  var VENUES = [
    '函館', '青森', 'いわき平', '弥彦', '前橋', '取手', '宇都宮', '大宮', '西武園', '京王閣',
    '立川', '松戸', '川崎', '平塚', '小田原', '伊東', '静岡', '名古屋', '岐阜', '大垣',
    '豊橋', '富山', '松阪', '四日市', '福井', '奈良', '和歌山', '岸和田', '玉野', '広島',
    '防府', '小松島', '高知', '松山', '小倉', '久留米', '武雄', '佐世保', '別府', '熊本'
  ];

  /* 追走能力の5段階（要件§3.3） */
  var FOLLOW_LEVELS = [
    { v: '5', label: '◎ とても上手い' },
    { v: '4', label: '○ 上手い' },
    { v: '3', label: '△ ふつう' },
    { v: '2', label: '▲ 苦しい' },
    { v: '1', label: '× 離れる' }
  ];

  /* 自前集計（役割別の実績）。Naoto PCの毎朝9時のタスクが stagekit の公開場所に置いている静的ファイル。
     🔑当面は stagekit のものを読む（同じ naoto-web.github.io＝読める）。
     ⚠️段3で stagekit/riders を消すときは、置き場所をこのアプリへ移してからここを直す（集計ジョブ.ps1・公開_統計のみ.ps1 も）。 */
  var STATS_BASE = 'https://naoto-web.github.io/stagekit/riders/data/';

  return {
    GAS_URL: RDB_GAS,
    APP_GAS: APP_GAS,
    APP_KEY: appKey,
    APP_AS: appAs,
    HOST: host,
    // 🔄2026-10-20 段2＝書ける。実際に書けるかは選手DBのGASが返す me.canWrite で決まる（プレビュー中は書けない）。
    //   false に戻せば段1（見るだけ）に戻る
    CAN_WRITE: true,
    COLORS: COLORS,
    ROLES: ROLES,
    VENUES: VENUES,
    FOLLOW_LEVELS: FOLLOW_LEVELS,
    STATS_URL: STATS_BASE + 'stats.json',
    /* 集計期間の切り替え（2026-09-24 Naoto「4ヶ月・8ヶ月・1年で見られるように」）。窓ごとに別ファイル */
    STATS_URLS: { '4': STATS_BASE + 'stats.json', '8': STATS_BASE + 'stats_8.json', '12': STATS_BASE + 'stats_12.json' },
    STATS_WINDOWS: [
      { k: '4', label: '直近4ヶ月' },
      { k: '8', label: '8ヶ月' },
      { k: '12', label: '1年' }
    ],
    LS_PREFIX: 'riders:'
  };
})();
