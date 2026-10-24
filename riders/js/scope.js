/* ===========================================================
   scope.js — 見せる範囲（管理者だけ・段2 2026-10-20）
   ===========================================================
   書いた人ごとに「全員に見せる（all）」「管理者と本人だけ（admin_self）」を切り替える
   （要件定義_選手DB統合 §1-2・Naoto決定「見せる範囲は書いた人ごとに管理者が決める」）。
   🔑判定は選手DBのGASの中（access.gs canSee_）＝見てはいけない札は画面に届かない。ここは決まりを書き換えるだけ。
   🔑決まりの無い書き手は既定で admin_self（見せすぎない側）。
   🔴人の名前はGASから受け取る（コードに書かない・公開リポジトリ）。 */

var SCOPE = (function () {

  var loaded = false, busy = false;
  var OPTS = [
    { k: 'all', label: '全員に見せる' },
    { k: 'admin_self', label: '管理者と本人だけ' }
  ];

  function box() { return document.getElementById('scope'); }

  function load() {
    var b = box();
    clear(b);
    b.appendChild(el('div', 'empty', '読み込み中…'));
    return API.visibility().then(function (j) {
      loaded = true;
      render(j.writers || []);
    }).catch(function (e) {
      clear(b);
      b.appendChild(el('div', 'empty', '開けませんでした：' + e.message));
    });
  }

  function render(writers) {
    var b = box();
    clear(b);
    b.appendChild(el('div', 'scope-lead',
      '書いた人ごとに、その人の選手メモ・観察ログを誰に見せるかを決めます。管理者はいつも全部見えます。書いた本人は自分の分がいつも見えます。'));
    if (!writers.length) { b.appendChild(el('div', 'empty', 'まだ誰も書いていません。')); return; }

    writers.forEach(function (w) {
      var row = el('div', 'scope-row');
      row.appendChild(el('div', 'scope-name', w.name));
      var opts = el('div', 'scope-opts');
      OPTS.forEach(function (o) {
        var bt = el('button', 'scope-opt' + (w.scope === o.k ? ' is-on' : ''), o.label);
        bt.type = 'button';
        bt.onclick = function () { if (busy || w.scope === o.k) return; save(w.name, o.k); };
        opts.appendChild(bt);
      });
      row.appendChild(opts);
      if (!w.set) row.appendChild(el('div', 'scope-note', 'まだ決めていないので、既定（管理者と本人だけ）になっています。'));
      b.appendChild(row);
    });
  }

  function save(writer, scope) {
    busy = true;
    API.setVisibility(writer, scope).then(function (j) {
      busy = false;
      render(j.writers || []);
      toast(writer + ' の見せる範囲を変えました');
    }).catch(function (e) {
      busy = false;
      toast(e.message, true);
    });
  }

  return {
    ensure: function () { if (!loaded) load(); },
    reload: load
  };
})();
