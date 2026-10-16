/* share.js — 「共有」タブ（2026-10-01 Yの要望・Naoto決定）
   ・誰でも投稿（題・内容・回答が欲しい人・期限）→対象者が 賛成／反対／どちらでも＋ひとこと
   ・配信者に見えるのは「回答 4/6」の人数と自分の回答だけ。🔴誰がどう答えたか・集計・ひとことは管理者だけ（GASが管理者本人にしか返さない）
   ・並び＝①回答してください（自分が対象でまだ）②進行中（答えた・自分の投稿）③決定事項 ④プログラマーへの要望
   ・管理者＝投稿ごとに集計・回答の内訳・未回答の人／［決定にする］［非表示］、決定事項を直接書く、要望の状態と返事
   ・🔴名前はGASが返す（このファイルに書かない） */
var SHARE = (function () {
  var u = window.OKL.u;
  var st = { data: null, loading: false, err: '', form: false, busy: false, showHidden: false, open: {}, type: '相談' };
  // 🔄10/1 種類＝相談（賛成・反対・どちらでも）／お願い（了解・難しい→あとで完了）。回答の色は字で決める（字でも区別できる）
  var ACLS = { '賛成': 'ok', '反対': 'ng', 'どちらでも': 'mid', '了解': 'ok', '難しい': 'ng', '完了': 'done' };
  function acls(a) { return 'sh-a sh-a-' + (ACLS[a] || 'mid'); }
  function alabel(d) { return u.esc((d && d.adminLabel) || '管理者'); }

  // 🔄10/1 Naoto「共有タブがずっと読み込み中」＝GAS（Google側）がときどき1分以上かかる（実測87秒・ふだんは2〜4秒）
  //   ①前回の中身を端末に控え、開いたらすぐそれを出す（裏で最新を取って差し替える）
  //   ②「最新にする」は読み込み中でも新しく取り直す（古い方の返事は捨てる）③タブを開き直したら1分以上前のものは裏で取り直す
  var LS = 'gakuya:share:' + (CONFIG.KEY || '').slice(0, 6) + ':' + (CONFIG.AS || '');
  var seq = 0;
  try { var c0 = JSON.parse(localStorage.getItem(LS) || 'null'); if (c0 && c0.d) { st.data = c0.d; st.at = c0.at; st.cached = true; } } catch (e) { /* 控えが無くても読む */ }
  function load(quiet, force) {
    if (st.loading && !force) return;
    var my = ++seq;
    st.loading = true; st.slow = false; if (!quiet) draw();
    setTimeout(function () { if (my === seq && st.loading) { st.slow = true; draw(); } }, 15000);
    API.share().then(function (d) {
      if (my !== seq) return;
      st.data = d; st.err = ''; st.cached = false; st.at = Date.now();
      try { localStorage.setItem(LS, JSON.stringify({ d: d, at: st.at })); } catch (e) { /* 控えられなくても表示は続ける */ }
    }, function (e) { if (my === seq) st.err = e.code || 'net'; })
      .then(function () { if (my !== seq) return; st.loading = false; st.slow = false; draw(); badge(); });
  }
  function ago(t) { var m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'さっき' : m < 60 ? m + '分前' : Math.round(m / 60) + '時間前'; }
  // 下のタブの赤丸＝自分が対象でまだ答えていない数
  function badge() {
    var n = st.data ? st.data.todo : 0;
    var t = document.querySelector('.tab[data-tab="share"]');
    if (!t) return;
    var b = t.querySelector('.badge');
    if (!n) { if (b) b.remove(); return; }
    if (!b) { b = document.createElement('span'); b.className = 'badge'; t.appendChild(b); }
    b.textContent = n;
  }

  function send(body, okMsg) {
    if (st.busy) return Promise.resolve();
    st.busy = true; draw();
    return API.shareDo(body).then(function () { APP.toast(okMsg); st.busy = false; load(true); return true; },
      function (e) { st.busy = false; draw(); APP.toast((e.data && e.data.error) || e.message || '送れませんでした', true); return false; });
  }

  function when(s) { return s ? u.stamp(s) : ''; }
  function dueTxt(p) {
    if (!p.due) return '期限なし';
    return u.md(p.due) + 'まで' + (p.overdue ? '（過ぎました）' : '');
  }

  // ── 投稿のフォーム ──
  function form(d) {
    if (!st.form) return '<button type="button" class="btn sh-new" id="sh-new">＋ 相談・お願いを投稿する</button>';
    var def = u.ymd(new Date(Date.now() + 3 * 86400000));
    var ask = st.type === 'お願い';
    var chip = function (n, on) { return '<label class="sh-chip"><input type="checkbox" name="sh-t" value="' + u.esc(n) + '"' + (on ? ' checked' : '') + '><span>' + u.esc(n) + '</span></label>'; };
    return '<div class="card sh-form"><h3>投稿する</h3>' +
      '<div class="sh-types">' + ['相談', 'お願い'].map(function (t) {
        return '<button type="button" class="sh-type' + (st.type === t ? ' is-on' : '') + '" data-type="' + t + '"><b>' + t + '</b><small>' +
          (t === '相談' ? '賛成・反対で意見を聞く' : '「〇〇してください」') + '</small></button>';
      }).join('') + '</div>' +
      '<label class="field-cap" for="sh-title">' + (ask ? '何をしてほしいか（題）' : '何をしたいか（題）') + '</label><input id="sh-title" class="date-input" maxlength="80">' +
      '<label class="field-cap" for="sh-body">くわしく（なくてもOK）</label><textarea id="sh-body" class="date-input sh-ta" rows="4" maxlength="2000"></textarea>' +
      '<div class="field-cap">' + (ask ? 'お願いする相手' : '回答が欲しい人') + '</div><div class="sh-chips">' +
        // 相談＝配信者全員にチェック済み／お願い＝相手を選ぶ（最初は誰も選ばない）
        d.people.members.filter(function (n) { return n !== d.me; }).map(function (n) { return chip(n, !ask); }).join('') +
        d.people.others.filter(function (n) { return n !== d.me; }).map(function (n) { return chip(n, false); }).join('') + '</div>' +
      '<label class="field-cap" for="sh-due">' + (ask ? 'いつまでに' : '回答の期限') + '</label><input id="sh-due" type="date" class="date-input" value="' + def + '">' +
      // 説明文の「管理者」＝GASの adminLabel（10/1 Naoto「管理者（名前）」に。🔴名前はここに書かない）
      '<p class="fresh">' + (ask ? '相手は「了解・難しい」で返事をして、終わったら「完了」を押します。誰がどう返事したかは、あなたと' + alabel(d) + 'が見られます。'
        : '回答は「賛成・反対・どちらでも」＋ひとこと。誰がどう答えたかは' + alabel(d) + 'だけが見られます（投稿した人にも見えません）。') + '</p>' +
      '<div class="sh-row"><button type="button" class="btn" id="sh-post"' + (st.busy ? ' disabled' : '') + '>投稿する</button><button type="button" class="link-btn" id="sh-cancel">やめる</button></div></div>';
  }

  // ── 投稿1件 ──
  function postCard(p, d) {
    var ans = p.target && !p.hidden, ask = p.type === 'お願い';
    var h = '<div class="card sh-post' + (p.hidden ? ' is-hidden' : '') + (p.target && !p.mine ? ' is-todo' : '') + '" data-pid="' + p.id + '">' +
      '<div class="sh-head"><span class="sh-kind' + (ask ? ' is-ask' : '') + '">' + p.type + '</span><b class="sh-title">' + u.esc(p.title) + '</b>' + (p.hidden ? '<span class="pill dim">非表示</span>' : '') + '</div>' +
      '<div class="sh-meta">' + u.esc(p.by) + '・' + when(p.at) + '<span class="sh-due' + (p.overdue ? ' is-over' : '') + '">' + dueTxt(p) + '</span></div>' +
      (p.body ? '<p class="sh-body">' + u.esc(p.body).replace(/\n/g, '<br>') + '</p>' : '') +
      '<div class="sh-count"><span class="num">' + (ask ? '返事 ' : '回答 ') + p.answered + '/' + p.n + '</span>' +
        (ask ? '<span class="num sh-done">完了 ' + (p.completed || 0) + '/' + p.n + '</span>' : '') +
        (p.answered < p.n ? '<small>まだ' + (ask ? '返事' : '答え') + 'ていない人がいます</small>' : '<small>全員が' + (ask ? '返事しました' : '答えました') + '</small>') + '</div>';
    if (ans) {
      var cur = p.mine ? p.mine.a : '';
      var editing = !p.mine || st.open[p.id];
      if (!editing) {
        h += '<div class="sh-mine">あなたの' + (ask ? '返事' : '回答') + '：<b class="' + acls(cur) + '">' + u.esc(cur) + '</b>' + (p.mine.c ? '<small>「' + u.esc(p.mine.c) + '」</small>' : '') +
          '<button type="button" class="link-btn" data-edit="' + p.id + '">変える</button></div>' +
          // お願いを了解した人＝終わったら「完了」（10/1 Naoto）
          (ask && cur === '了解' ? '<button type="button" class="btn sh-finish" data-ans="完了" data-pid="' + p.id + '">終わったら「完了」を押す</button>' : '');
      } else {
        // お願いの最初の返事は 了解・難しい（完了は了解のあと。すぐ終わったものは完了も押せる）
        var kinds = ask && !p.mine ? ['了解', '難しい', '完了'] : p.kinds;
        h += '<div class="sh-ans">' + kinds.map(function (a) {
          return '<button type="button" class="sh-ab ' + acls(a) + (cur === a ? ' is-on' : '') + '" data-ans="' + u.esc(a) + '" data-pid="' + p.id + '">' + (a === '了解' ? '了解しました' : a === '完了' && !p.mine ? 'もう完了' : a) + '</button>';
        }).join('') + '</div>' +
          '<input class="date-input sh-c" id="sh-c-' + p.id + '" maxlength="500" placeholder="' + (ask ? 'ひとこと（なくてもOK・お願いした人と' + alabel(d) + 'が見ます）' : 'ひとこと（なくてもOK・' + alabel(d) + 'だけが見ます）') + '" value="' + u.esc(p.mine ? p.mine.c : '') + '">' +
          (p.overdue ? '<p class="fresh">期限を過ぎていますが、まだ答えられます（締切後の印が付きます）。</p>' : '');
      }
    }
    h += detailBox(p, d);
    // 🆕10/1 削除（管理者＝全部／配信者＝自分の投稿だけ・プレビュー中は出さない）
    if ((d.admin || p.mineBy) && !d.preview) h += '<div class="sh-delrow"><button type="button" class="link-btn sh-del" data-del="post" data-id="' + p.id + '">削除</button></div>';
    return h + '</div>';
  }

  // 🔴内訳＝GASが管理者本人（お願いのときはお願いした本人も）にしか answers・tally・pending を返さない
  function detailBox(p, d) {
    if (!p.answers) return '';
    var ask = p.type === 'お願い';
    return '<div class="sh-admin"><div class="sh-admin-cap">' + (d.admin ? alabel(d) + 'だけ' : 'あなた（お願いした人）と' + alabel(d) + 'だけ') + '</div>' +
      '<div class="sh-tally">' + p.kinds.map(function (a) { return '<span class="' + acls(a) + '">' + a + ' ' + (p.tally[a] || 0) + '</span>'; }).join('') + '</div>' +
      (p.answers.length ? '<ul class="sh-list">' + p.answers.map(function (a) {
        return '<li><b>' + u.esc(a.who) + '</b><span class="' + acls(a.a) + '">' + u.esc(a.a) + '</span>' + (a.late ? '<small class="sh-late">締切後</small>' : '') +
          (a.c ? '<small class="sh-cm">「' + u.esc(a.c) + '」</small>' : '') + '</li>';
      }).join('') + '</ul>' : '') +
      (p.pending.length ? '<div class="sh-pend">' + (ask ? 'まだ返事なし：' : 'まだ：') + p.pending.map(u.esc).join('・') + '</div>' : '') +
      (d.admin ? '<div class="sh-row"><button type="button" class="link-btn" data-decide="' + p.id + '">決定にする</button>' +
        '<button type="button" class="link-btn" data-hide="' + p.id + '" data-on="' + (p.hidden ? '' : '1') + '">' + (p.hidden ? '表示に戻す' : '非表示にする') + '</button></div>' : '') + '</div>';
  }

  function decisionsBox(d) {
    var list = d.decisions.filter(function (x) { return st.showHidden || !x.hidden; });
    return '<div class="card sh-dec"><h3>決定事項</h3>' + (list.length ? '<ul class="sh-declist">' + list.map(function (x) {
      return '<li' + (x.hidden ? ' class="is-hidden"' : '') + '><p>' + u.esc(x.text).replace(/\n/g, '<br>') + '</p><small>' + when(x.at) + (x.postTitle ? '・「' + u.esc(x.postTitle) + '」から' : '') +
        (d.admin ? '・' + u.esc(x.by) + ' <button type="button" class="link-btn" data-hdec="' + x.id + '" data-on="' + (x.hidden ? '' : '1') + '">' + (x.hidden ? '戻す' : '非表示') + '</button> <button type="button" class="link-btn sh-del" data-del="decision" data-id="' + x.id + '">削除</button>' : '') + '</small></li>';
    }).join('') + '</ul>' : '<p class="sub">まだありません。</p>') +
      (d.admin ? '<button type="button" class="link-btn sh-decnew" data-decide="">＋ 決定事項を直接書く</button>' : '') + '</div>';
  }

  /* ── 書きかけを残す（10/16）──
     読み込みが終わると画面を描き直す＝入力欄の中身が消えていた。data-draft の欄は打つたびに st.drafts に控え、描くときに戻す */
  st.drafts = {};
  function draftVal(key) { return u.esc(st.drafts[key] || ''); }

  /* ── 要望・連絡のやりとり（10/16 Naoto「返事の上から返事すると最初の返事が消える＝追加にして・上書きは上書きでできるように」）──
     ・返事は1件ずつ積む（古い返事は消えない）。自分の返事には［直す］＝その1件だけ上書き
     ・返事の欄は複数行（旧＝ブラウザの1行の入力窓） */
  function threadHtml(r) {
    if (!r.thread || !r.thread.length) return '';
    return '<ol class="sh-thread">' + r.thread.map(function (m) {
      var ek = 'e:' + r.id + ':' + m.i;
      var editing = st.editMsg === ek;
      return '<li class="sh-msg' + (m.who === 'プログラマー' ? ' is-dev' : '') + '"><div class="sh-msg-head"><b>' + u.esc(m.who) + '</b><small>' + when(m.at) + (m.edited ? '（直しました）' : '') + '</small>' +
        (m.mine && !editing ? '<button type="button" class="link-btn" data-medit="' + ek + '">直す</button>' : '') + '</div>' +
        (editing
          ? '<textarea class="date-input sh-ta" rows="4" maxlength="2000" data-draft="' + ek + '" id="sh-me-' + r.id + '-' + m.i + '">' + (st.drafts[ek] != null ? u.esc(st.drafts[ek]) : u.esc(m.text)) + '</textarea>' +
            '<div class="sh-row"><button type="button" class="btn" data-msave="' + r.id + '" data-i="' + m.i + '"' + (st.busy ? ' disabled' : '') + '>上書きする</button><button type="button" class="link-btn" data-mcancel="1">やめる</button></div>'
          : '<p>' + u.esc(m.text).replace(/\n/g, '<br>') + '</p>') + '</li>';
    }).join('') + '</ol>';
  }
  function replyForm(r, d) {
    if (!r.canReply) return '';
    var k = 'r:' + r.id;
    if (!st.replyOpen || !st.replyOpen[r.id]) return '<div class="sh-row"><button type="button" class="btn sh-replybtn" data-ropen="' + r.id + '">返事を書く</button></div>';
    var hint = r.contact ? (r.mineBy ? '宛先の人に届きます' : 'プログラマーに届きます') : (r.mineBy ? 'プログラマーに届きます' : '出した人に届きます');
    return '<textarea class="date-input sh-ta" rows="4" maxlength="2000" data-draft="' + k + '" id="sh-r-' + r.id + '" placeholder="返事（' + hint + '）">' + draftVal(k) + '</textarea>' +
      '<div class="sh-row"><button type="button" class="btn" data-rsend="' + r.id + '"' + (st.busy ? ' disabled' : '') + '>返事を送る</button><button type="button" class="link-btn" data-rclose="' + r.id + '">やめる</button></div>';
  }
  /* 🆕10/16 完了済み（Naoto「完了は完了済みリストに・画面はすっきり」）
     ・完了済みに移る＝本人（要望を出した人・連絡の宛先）が返事を見て［確認した］を押したとき（連絡は宛先が返事を書いても）
       ＝プログラマーが返事と同時に「完了」にしても、本人が読む前にしまわれない（Naotoの心配）
     ・本人の画面＝「返事あり・確認してください」＋［確認した］／管理者の画面＝「本人未確認」
     ・完了済みは各カードの下で畳む（押すと開く）。［戻す］で上に戻せる */
  function confirmRow(r, d) {
    if (d.preview) return '';
    if (r.done) return (r.side || d.admin) ? '<div class="sh-row"><button type="button" class="link-btn" data-rconf="' + r.id + '" data-on="">上の一覧に戻す</button></div>' : '';
    if (r.needConfirm && r.side) return '<div class="sh-row"><button type="button" class="btn sh-confirm" data-rconf="' + r.id + '" data-on="1">確認した（完了済みへ）</button></div>';
    return '';
  }
  function reqItem(r, d) {
    var mark = r.needConfirm ? (r.side ? '<span class="sh-new-dot">' + (r.contact ? '確認してください' : '返事あり・確認してください') + '</span>' : '<span class="sh-pill-wait">本人未確認</span>') : '';
    var head = r.contact
      ? '<span class="sh-st sh-st-dev">プログラマーから</span>' + mark + '<small>' + (d.admin || r.mineBy ? '宛先：' + u.esc(r.to) + '・' : '') + when(r.at) + '</small>'
      : '<span class="sh-st sh-st-' + d.reqStates.indexOf(r.state) + '">' + u.esc(r.state) + '</span>' + mark + '<small>' + (d.admin ? u.esc(r.who) + '・' : '') + when(r.at) + '</small>';
    return '<li' + (r.unread ? ' class="is-unread"' : '') + '><div class="sh-reqhead">' + head + '</div>' +
      '<p>' + u.esc(r.text).replace(/\n/g, '<br>') + '</p>' + threadHtml(r) + confirmRow(r, d) + (r.done ? '' : replyForm(r, d)) +
      (d.admin && !r.contact ? '<div class="sh-row"><span class="field-cap">状態</span><select class="date-input sh-rs" data-rid="' + r.id + '">' + d.reqStates.map(function (s) { return '<option' + (s === r.state ? ' selected' : '') + '>' + s + '</option>'; }).join('') + '</select></div>' : '') +
      // 削除＝管理者は全部／配信者は自分が出した要望だけ
      (!d.preview && (d.admin || r.mineBy) ? '<div class="sh-delrow"><button type="button" class="link-btn sh-del" data-del="request" data-id="' + r.id + '">削除</button></div>' : '') + '</li>';
  }

  // 🆕10/16 プログラマー→配信者への連絡（プログラマー＝GASの APP_SHARE_DEV の人だけ）と、届いた連絡の一覧
  function contactsBox(d) {
    var list = d.requests.filter(function (r) { return r.contact; });
    if (!d.dev && !list.length) return '';
    st.ctSel = st.ctSel || {};
    var chip = function (n) { return '<label class="sh-chip"><input type="checkbox" name="sh-ct" value="' + u.esc(n) + '"' + (st.ctSel[n] ? ' checked' : '') + '><span>' + u.esc(n) + '</span></label>'; };
    return '<div class="card sh-req sh-contact"><h3>プログラマーからの連絡</h3>' +
      (d.dev && !d.preview ? '<div class="field-cap">宛先（1人ずつ別のやりとりになります）</div><div class="sh-chips">' +
          d.people.members.concat(d.people.others).filter(function (n) { return n !== d.me; }).map(chip).join('') + '</div>' +
        '<textarea class="date-input sh-ta" rows="4" maxlength="2000" data-draft="contact" id="sh-ct" placeholder="配信者への連絡（相手は返事を書けます）">' + draftVal('contact') + '</textarea>' +
        '<div class="sh-row"><button type="button" class="btn" id="sh-ctsend"' + (st.busy ? ' disabled' : '') + '>連絡を送る</button></div>' : '') +
      reqLists(list, d, 'contact', 'まだありません。') + '</div>';
  }

  /** 進行中を上に・完了済みは畳んで下に（key＝カードごとの開け閉め） */
  function reqLists(list, d, key, emptyMsg) {
    var act = list.filter(function (r) { return !r.done; }), done = list.filter(function (r) { return r.done; });
    st.doneOpen = st.doneOpen || {};
    var open = !!st.doneOpen[key];
    return (act.length ? '<ul class="sh-reqlist">' + act.map(function (r) { return reqItem(r, d); }).join('') + '</ul>' : (emptyMsg ? '<p class="sub">' + emptyMsg + '</p>' : '')) +
      (done.length ? '<button type="button" class="sh-donebtn" data-dopen="' + key + '">' + (open ? '▾' : '▸') + ' 完了済み（' + done.length + '件）</button>' +
        (open ? '<ul class="sh-reqlist sh-donelist">' + done.map(function (r) { return reqItem(r, d); }).join('') + '</ul>' : '') : '');
  }

  function requestsBox(d) {
    var list = d.requests.filter(function (r) { return !r.contact; });
    return '<div class="card sh-req"><h3>プログラマーへの要望</h3>' +
      // 🔄10/1 Naoto：例を3行で（&#10;＝入力欄の中の改行）
      '<textarea id="sh-req" class="date-input sh-ta" rows="4" maxlength="2000" data-draft="req" placeholder="例：&#10;追加してほしいアプリの機能（自分だけ追加でも可）&#10;追加してほしいOBSの機能・的中演出&#10;アプリやOBSの不具合等">' + draftVal('req') + '</textarea>' +
      '<div class="sh-row"><button type="button" class="btn" id="sh-reqsend"' + (st.busy ? ' disabled' : '') + '>要望を出す</button></div>' +
      reqLists(list, d, 'req', '') + '</div>';
  }

  function draw() {
    if (APP.current() !== 'share') return;
    var el = document.getElementById('view');
    var d = st.data;
    // 読み込み中も「最新にする」は押せる（押すと取り直す）
    var head = '<div class="title-row"><h1 class="screen-title">共有</h1><span class="title-aside">' +
      (st.loading ? '読み込み中… ' : st.cached && st.at ? ago(st.at) + 'の内容 ' : '') +
      '<button type="button" class="link-btn" id="sh-reload">最新にする</button></span></div>' +
      (st.slow ? '<p class="fresh">時間がかかっています（Google側の混み具合で、ときどき1分ほどかかります）。' + (d ? '前回の内容を出しています。' : '') + '待つか「最新にする」を押してください。</p>' : '') +
      (st.err && d ? '<p class="fresh">最新を読み込めませんでした。前回の内容を出しています。</p>' : '');
    if (!d) { el.innerHTML = head + '<p class="sub">' + (st.err ? 'つながりませんでした。「最新にする」を押してください。' : '読み込んでいます…') + '</p>'; bind(el); return; }
    var posts = d.posts.filter(function (p) { return st.showHidden || !p.hidden; });
    var todo = posts.filter(function (p) { return p.target && !p.mine && !p.hidden; });
    var rest = posts.filter(function (p) { return todo.indexOf(p) < 0; });
    el.innerHTML = head +
      (d.preview ? '<p class="fresh">プレビュー中は見るだけです（投稿・回答は管理者に戻してから）。</p>' : '') +
      form(d) +
      (todo.length ? '<div class="section-cap">回答してください（' + todo.length + '）</div>' + todo.map(function (p) { return postCard(p, d); }).join('') : '') +
      '<div class="section-cap">進行中</div>' + (rest.length ? rest.map(function (p) { return postCard(p, d); }).join('') : '<p class="sub">ありません。</p>') +
      (d.admin ? '<label class="sh-hidden-toggle"><input type="checkbox" id="sh-showhidden"' + (st.showHidden ? ' checked' : '') + '> 非表示にしたものも見る（管理者）</label>' : '') +
      contactsBox(d) + decisionsBox(d) + requestsBox(d);
    bind(el);
  }

  function bind(el) {
    var q = function (s) { return el.querySelector(s); };
    var on = function (s, f) { var x = q(s); if (x) x.addEventListener('click', f); };
    on('#sh-reload', function () { load(false, true); });
    on('#sh-new', function () { st.form = true; draw(); var t = q('#sh-title'); if (t) t.focus(); });
    on('#sh-cancel', function () { st.form = false; draw(); });
    // 種類の切り替え（書きかけの題・内容・期限は残す）
    el.querySelectorAll('[data-type]').forEach(function (b) {
      b.addEventListener('click', function () {
        var keep = { t: q('#sh-title').value, b: q('#sh-body').value, d: q('#sh-due').value };
        st.type = b.dataset.type; draw();
        q('#sh-title').value = keep.t; q('#sh-body').value = keep.b; q('#sh-due').value = keep.d;
      });
    });
    on('#sh-post', function () {
      var targets = [].map.call(el.querySelectorAll('input[name="sh-t"]:checked'), function (x) { return x.value; });
      send({ op: 'post', type: st.type, title: q('#sh-title').value, body: q('#sh-body').value, targets: targets, due: q('#sh-due').value }, '投稿しました')
        .then(function (ok) { if (ok) st.form = false; draw(); });
    });
    el.querySelectorAll('[data-ans]').forEach(function (b) {
      b.addEventListener('click', function () {
        var id = b.dataset.pid, c = q('#sh-c-' + id);
        send({ op: 'answer', id: id, a: b.dataset.ans, c: c ? c.value : undefined }, b.dataset.ans === '完了' ? '完了にしました' : '回答しました').then(function (ok) { if (ok) delete st.open[id]; });
      });
    });
    el.querySelectorAll('[data-edit]').forEach(function (b) { b.addEventListener('click', function () { st.open[b.dataset.edit] = 1; draw(); }); });
    el.querySelectorAll('[data-hide]').forEach(function (b) {
      b.addEventListener('click', function () { send({ op: 'hide', id: b.dataset.hide, on: !!b.dataset.on }, b.dataset.on ? '非表示にしました' : '表示に戻しました'); });
    });
    el.querySelectorAll('[data-decide]').forEach(function (b) {
      b.addEventListener('click', function () {
        var t = window.prompt(b.dataset.decide ? '決定事項（結論を一文で）' : '決定事項を書く（全員に見えます）');
        if (t && t.trim()) send({ op: 'decide', id: b.dataset.decide || '', text: t }, '決定事項に載せました');
      });
    });
    el.querySelectorAll('[data-del]').forEach(function (b) {
      b.addEventListener('click', function () {
        var k = b.dataset.del;
        var msg = k === 'post' ? 'この投稿を削除します。みんなの回答も一緒に消えます（決定事項は残ります）。' : k === 'decision' ? 'この決定事項を削除します。' : 'この要望を削除します。';
        if (window.confirm(msg + '\n元に戻せません。削除しますか？')) send({ op: 'delete', kind: k, id: b.dataset.id }, '削除しました');
      });
    });
    el.querySelectorAll('[data-hdec]').forEach(function (b) {
      b.addEventListener('click', function () { send({ op: 'hideDecision', id: b.dataset.hdec, on: !!b.dataset.on }, '直しました'); });
    });
    // 書きかけを控える（描き直しで消さない）
    el.querySelectorAll('[data-draft]').forEach(function (t) {
      t.addEventListener('input', function () { st.drafts[t.dataset.draft] = t.value; });
    });
    on('#sh-reqsend', function () {
      var t = q('#sh-req').value;
      send({ op: 'request', text: t }, '要望を出しました').then(function (ok) { if (ok) { delete st.drafts.req; draw(); } });
    });
    el.querySelectorAll('.sh-rs').forEach(function (s) {
      s.addEventListener('change', function () { send({ op: 'reqState', id: s.dataset.rid, state: s.value }, '状態を変えました'); });
    });
    // 返事（10/16）：開く→複数行で書く→送る＝積む
    st.replyOpen = st.replyOpen || {};
    el.querySelectorAll('[data-ropen]').forEach(function (b) {
      b.addEventListener('click', function () { st.replyOpen[b.dataset.ropen] = 1; draw(); var t = q('#sh-r-' + b.dataset.ropen); if (t) t.focus(); });
    });
    el.querySelectorAll('[data-rclose]').forEach(function (b) {
      b.addEventListener('click', function () { delete st.replyOpen[b.dataset.rclose]; delete st.drafts['r:' + b.dataset.rclose]; draw(); });
    });
    el.querySelectorAll('[data-rsend]').forEach(function (b) {
      b.addEventListener('click', function () {
        var id = b.dataset.rsend, t = q('#sh-r-' + id);
        if (!t || !t.value.trim()) { APP.toast('返事を書いてください', true); return; }
        send({ op: 'reqReply', id: id, text: t.value }, '返事を送りました').then(function (ok) {
          if (ok) { delete st.replyOpen[id]; delete st.drafts['r:' + id]; draw(); }
        });
      });
    });
    // 自分の返事を直す（その1件だけ上書き）
    el.querySelectorAll('[data-medit]').forEach(function (b) {
      b.addEventListener('click', function () { st.editMsg = b.dataset.medit; draw(); });
    });
    el.querySelectorAll('[data-mcancel]').forEach(function (b) {
      b.addEventListener('click', function () { delete st.drafts[st.editMsg]; st.editMsg = ''; draw(); });
    });
    el.querySelectorAll('[data-msave]').forEach(function (b) {
      b.addEventListener('click', function () {
        var id = b.dataset.msave, i = b.dataset.i, t = q('#sh-me-' + id + '-' + i);
        if (!t || !t.value.trim()) { APP.toast('中身が空です', true); return; }
        send({ op: 'reqEdit', id: id, i: +i, text: t.value }, '上書きしました').then(function (ok) {
          if (ok) { delete st.drafts[st.editMsg]; st.editMsg = ''; draw(); }
        });
      });
    });
    // 完了済みの開け閉め・［確認した］／［戻す］（10/16）
    el.querySelectorAll('[data-dopen]').forEach(function (b) {
      b.addEventListener('click', function () { st.doneOpen[b.dataset.dopen] = !st.doneOpen[b.dataset.dopen]; draw(); });
    });
    el.querySelectorAll('[data-rconf]').forEach(function (b) {
      b.addEventListener('click', function () {
        send({ op: 'reqConfirm', id: b.dataset.rconf, on: !!b.dataset.on }, b.dataset.on ? '完了済みに移しました' : '上の一覧に戻しました');
      });
    });
    // プログラマー→配信者への連絡
    on('#sh-ctsend', function () {
      var targets = [].map.call(el.querySelectorAll('input[name="sh-ct"]:checked'), function (x) { return x.value; });
      if (!targets.length) { APP.toast('宛先を選んでください', true); return; }
      var t = q('#sh-ct').value;
      if (!t.trim()) { APP.toast('連絡を書いてください', true); return; }
      send({ op: 'contact', targets: targets, text: t }, '連絡を送りました').then(function (ok) { if (ok) { delete st.drafts.contact; st.ctSel = {}; draw(); } });
    });
    el.querySelectorAll('input[name="sh-ct"]').forEach(function (x) {
      x.addEventListener('change', function () { if (x.checked) st.ctSel[x.value] = 1; else delete st.ctSel[x.value]; });
    });
    var sh = q('#sh-showhidden');
    if (sh) sh.addEventListener('change', function () { st.showHidden = sh.checked; draw(); });
  }

  return {
    render: function () {
      if (!st.loading && (!st.data || st.cached || !st.at || Date.now() - st.at > 60000)) load(!!st.data);
      draw();
    },
    // 起動時に1回読んで赤丸を出す（タブを開いていなくても）
    init: function () { load(true); },
    badge: badge
  };
})();
