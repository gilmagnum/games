/* =============================================================================
   Mini-Games Hub — Global Leaderboard (shared, dependency-free)
   https://gilmagnum.github.io/games/lib/leaderboard.js

   USAGE inside a game
   -------------------
   <script src="https://gilmagnum.github.io/games/lib/config.js"></script>
   <script src="https://gilmagnum.github.io/games/lib/leaderboard.js"></script>

   <script>
     Leaderboard.init({
       game: 'area-conquer',      // must match games.slug in Supabase
       title: 'סוגר שטחים',
       scoreLabel: 'נקודות'
     });

     // when a run ends:
     await Leaderboard.gameOver(score, { level: 7 });

     // to just open the board (e.g. a "שיאים" button):
     Leaderboard.show();
   </script>

   The whole UI lives inside a Shadow DOM, so it cannot clash with the
   game's own CSS, and it never touches the page's globals except
   `window.Leaderboard`.
   ============================================================================= */
(function () {
  'use strict';

  if (window.Leaderboard) return;

  var LS_NAME = 'gmh:player';
  var LS_CID = 'gmh:cid';
  var LS_BEST = 'gmh:best:';

  var cfg = {
    game: null,
    title: '',
    scoreLabel: 'נקודות',
    scoreOrder: 'desc',      // 'desc' = higher is better
    variants: null,          // [{slug,label}] -> renders tabs in the panel
    limit: 10,
    formatScore: null,       // function(n) -> string
    supabaseUrl: '',
    supabaseKey: '',
    hubUrl: 'https://gilmagnum.github.io/games/'
  };

  var host = null, root = null, ready = false;
  var viewSlug = null;     // board currently shown (may differ from cfg.game)


  /* ---------------------------------------------------------------- utils */

  function uuid() {
    if (crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
  }

  function ls(key, val) {
    try {
      if (val === undefined) return localStorage.getItem(key);
      localStorage.setItem(key, val);
      return val;
    } catch (e) { return null; }
  }

  function clientId() {
    var id = ls(LS_CID);
    if (!id) { id = uuid(); ls(LS_CID, id); }
    return id;
  }

  function fmt(n) {
    if (cfg.formatScore) return cfg.formatScore(n);
    return Number(n).toLocaleString('he-IL');
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function better(a, b) { // is a better than b?
    return cfg.scoreOrder === 'asc' ? a < b : a > b;
  }

  /* ------------------------------------------------------------------ api */

  function rpc(fn, body) {
    if (!cfg.supabaseUrl || cfg.supabaseUrl.indexOf('REPLACE_ME') > -1) {
      return Promise.reject(new Error('offline'));
    }
    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, 8000);
    return fetch(cfg.supabaseUrl.replace(/\/+$/, '') + '/rest/v1/rpc/' + fn, {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        'Content-Type': 'application/json',
        'apikey': cfg.supabaseKey,
        'Authorization': 'Bearer ' + cfg.supabaseKey
      },
      body: JSON.stringify(body || {})
    }).then(function (r) {
      clearTimeout(timer);
      return r.json().then(function (data) {
        if (!r.ok) {
          var msg = (data && (data.message || data.hint)) || ('HTTP ' + r.status);
          throw new Error(msg);
        }
        return data;
      });
    }, function (e) { clearTimeout(timer); throw e; });
  }

  function currentSlug() { return viewSlug || cfg.game; }

  function fetchTop(limit, slug) {
    return rpc('top_scores', { p_game: slug || currentSlug(), p_limit: limit || cfg.limit });
  }

  function submit(player, score, meta) {
    return rpc('submit_score', {
      p_game: cfg.game,
      p_player: player,
      p_score: Math.round(score),
      p_meta: meta || {},
      p_client_id: clientId()
    }).then(function (rows) { return (rows && rows[0]) || null; });
  }

  /* ------------------------------------------------------------------- ui */

  var CSS = [
    ':host{all:initial;direction:rtl}',
    '*{box-sizing:border-box;margin:0;padding:0;font-family:"Rubik","Assistant","Heebo",system-ui,-apple-system,"Segoe UI",Arial,sans-serif}',
    '.wrap{position:fixed;inset:0;z-index:2147483000;display:none;align-items:center;justify-content:center;padding:16px;',
    'background:rgba(6,8,20,.72);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px)}',
    '.wrap.on{display:flex;animation:fade .18s ease}',
    '@keyframes fade{from{opacity:0}to{opacity:1}}',
    '@keyframes pop{from{opacity:0;transform:translateY(14px) scale(.97)}to{opacity:1;transform:none}}',
    '.card{width:min(440px,100%);max-height:min(86vh,720px);overflow:auto;border-radius:22px;',
    'background:linear-gradient(180deg,#1b1f38 0%,#12142a 100%);color:#eef1ff;',
    'border:1px solid rgba(255,255,255,.10);box-shadow:0 30px 80px rgba(0,0,0,.55);',
    'padding:22px 20px 18px;animation:pop .22s cubic-bezier(.2,.9,.3,1.2);text-align:right}',
    '.top{display:flex;align-items:flex-start;gap:12px;margin-bottom:16px}',
    '.top h2{font-size:20px;font-weight:700;letter-spacing:-.2px;flex:1;line-height:1.3}',
    '.top p{font-size:13px;color:#9aa3c9;margin-top:3px;font-weight:400}',
    '.x{flex:none;width:34px;height:34px;border-radius:11px;border:0;cursor:pointer;font-size:19px;line-height:1;',
    'background:rgba(255,255,255,.07);color:#c6cced;transition:.15s}',
    '.x:hover{background:rgba(255,255,255,.14);color:#fff}',
    '.banner{border-radius:16px;padding:14px 16px;margin-bottom:16px;text-align:center;',
    'background:linear-gradient(135deg,#ffb527,#ff7a45);color:#2a1500}',
    '.banner b{display:block;font-size:17px;font-weight:700}',
    '.banner span{font-size:13px;opacity:.8}',
    '.banner.calm{background:rgba(255,255,255,.06);color:#dfe4ff}',
    '.f{display:flex;gap:8px;margin-bottom:16px}',
    'input{flex:1;min-width:0;height:46px;border-radius:13px;padding:0 14px;font-size:16px;text-align:right;',
    'background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.14);color:#fff;outline:0;transition:.15s}',
    'input:focus{border-color:#7c9dff;background:rgba(255,255,255,.11)}',
    'input::placeholder{color:#7d85ad}',
    'button.go{flex:none;height:46px;padding:0 20px;border:0;border-radius:13px;cursor:pointer;font-size:15px;font-weight:600;',
    'background:linear-gradient(135deg,#6f8dff,#9b6bff);color:#fff;transition:.15s}',
    'button.go:hover{filter:brightness(1.1)}',
    'button.go:disabled{opacity:.5;cursor:default;filter:none}',
    'ol{list-style:none;display:flex;flex-direction:column;gap:5px}',
    'li{display:flex;align-items:center;gap:11px;padding:10px 12px;border-radius:13px;background:rgba(255,255,255,.04)}',
    'li.me{background:rgba(124,157,255,.17);box-shadow:inset 0 0 0 1px rgba(124,157,255,.45)}',
    '.r{flex:none;width:28px;height:28px;border-radius:9px;display:grid;place-items:center;',
    'font-size:13px;font-weight:700;background:rgba(255,255,255,.07);color:#aab2d8}',
    'li:nth-child(1) .r{background:linear-gradient(135deg,#ffd561,#f0a020);color:#3a2400}',
    'li:nth-child(2) .r{background:linear-gradient(135deg,#e2e8f6,#a8b2cc);color:#2c3140}',
    'li:nth-child(3) .r{background:linear-gradient(135deg,#e2a06a,#b9713c);color:#2e1a08}',
    '.n{flex:1;min-width:0;font-size:15px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.s{flex:none;font-size:15px;font-weight:700;font-variant-numeric:tabular-nums;color:#c8d2ff}',
    '.lh{display:flex;justify-content:space-between;padding:0 12px 7px;font-size:11px;font-weight:600;',
    'letter-spacing:.06em;color:#6f779e}',
    '.tabs{display:flex;gap:5px;margin-bottom:13px;background:rgba(255,255,255,.05);padding:4px;border-radius:13px}',
    '.tabs button{flex:1;min-width:0;height:34px;border:0;border-radius:10px;cursor:pointer;font:inherit;',
    'font-size:13px;font-weight:600;color:#9aa3c9;background:transparent;transition:.15s;white-space:nowrap;',
    'overflow:hidden;text-overflow:ellipsis}',
    '.tabs button:hover{color:#dfe4ff}',
    '.tabs button.on{background:rgba(255,255,255,.13);color:#fff}',
    '.msg{text-align:center;color:#8c95bd;font-size:14px;padding:26px 8px;line-height:1.6}',
    '.foot{margin-top:16px;display:flex;gap:8px}',
    '.foot a,.foot button{flex:1;text-align:center;text-decoration:none;height:42px;line-height:42px;border:0;cursor:pointer;',
    'border-radius:12px;font-size:14px;font-weight:600;background:rgba(255,255,255,.07);color:#dfe4ff;transition:.15s}',
    '.foot a:hover,.foot button:hover{background:rgba(255,255,255,.14)}',
    '.spin{width:22px;height:22px;margin:26px auto;border-radius:50%;border:2.5px solid rgba(255,255,255,.15);',
    'border-top-color:#7c9dff;animation:sp .7s linear infinite}',
    '@keyframes sp{to{transform:rotate(360deg)}}'
  ].join('');

  function build() {
    if (host) return;
    host = document.createElement('div');
    host.setAttribute('data-gmh-leaderboard', '');
    root = host.attachShadow({ mode: 'open' });
    var st = document.createElement('style');
    st.textContent = CSS;
    root.appendChild(st);
    var wrap = document.createElement('div');
    wrap.className = 'wrap';
    wrap.innerHTML = '<div class="card"></div>';
    wrap.addEventListener('click', function (e) { if (e.target === wrap) close(); });
    root.appendChild(wrap);
    document.body.appendChild(host);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && wrap.classList.contains('on')) close();
    });
    ready = true;
  }

  function $wrap() { return root.querySelector('.wrap'); }
  function $card() { return root.querySelector('.card'); }

  function open() { build(); $wrap().classList.add('on'); }
  function close() {
    if (!ready) return;
    $wrap().classList.remove('on');
    if (typeof cfg.onClose === 'function') cfg.onClose();
  }

  function header(sub) {
    return '<div class="top"><h2>🏆 שיאים כלליים' +
      (sub ? '<p>' + esc(sub) + '</p>' : '') +
      '</h2><button class="x" aria-label="סגירה">✕</button></div>';
  }

  function tabsHtml() {
    if (!cfg.variants || cfg.variants.length < 2) return '';
    var cur = currentSlug();
    return '<div class="tabs">' + cfg.variants.map(function (v, i) {
      return '<button data-i="' + i + '" class="' + (v.slug === cur ? 'on' : '') + '">' +
        esc(v.label) + '</button>';
    }).join('') + '</div>';
  }

  function listHtml(rows, highlightName) {
    if (!rows || !rows.length) {
      return '<div class="msg">אין עדיין שיאים במשחק הזה.<br>תהיה הראשון! 🚀</div>';
    }
    return '<div class="lh"><span>שחקן</span><span>' + esc(cfg.scoreLabel) + '</span></div>' +
      '<ol>' + rows.map(function (r) {
      var me = highlightName && r.player === highlightName;
      return '<li class="' + (me ? 'me' : '') + '">' +
        '<span class="r">' + r.rank + '</span>' +
        '<span class="n">' + esc(r.player) + '</span>' +
        '<span class="s">' + fmt(r.score) + '</span>' +
        '</li>';
    }).join('') + '</ol>';
  }

  function footHtml() {
    return '<div class="foot">' +
      '<a href="' + cfg.hubUrl + '">כל המשחקים</a>' +
      '<button class="close2">סגירה</button></div>';
  }

  function wire() {
    var x = root.querySelector('.x'); if (x) x.onclick = close;
    var c2 = root.querySelector('.close2'); if (c2) c2.onclick = close;
    Array.prototype.forEach.call(root.querySelectorAll('.tabs button'), function (b) {
      b.onclick = function () {
        var v = cfg.variants[Number(b.dataset.i)];
        if (!v || v.slug === currentSlug()) return;
        viewSlug = v.slug;
        show({ keepView: true });
      };
    });
  }

  function render(html) { $card().innerHTML = html; wire(); }

  /* ------------------------------------------------------------- flows */

  function show(opts) {
    opts = opts || {};
    if (!opts.keepView) viewSlug = cfg.game;
    build(); open();
    render(header(cfg.title) + tabsHtml() + '<div class="spin"></div>');
    return fetchTop().then(function (rows) {
      render(header(cfg.title) + tabsHtml() + listHtml(rows, opts.highlight || ls(LS_NAME)) + footHtml());
      return rows;
    }).catch(function (e) {
      render(header(cfg.title) + tabsHtml() +
        '<div class="msg">לא הצלחנו לטעון את טבלת השיאים.<br>' +
        (e.message === 'offline' ? 'הטבלה עדיין לא מחוברת.' : 'בדוק את החיבור לאינטרנט.') +
        '</div>' + footHtml());
    });
  }

  function nameForm(score, meta, rows) {
    var prev = ls(LS_NAME) || '';
    render(
      header(cfg.title) +
      '<div class="banner"><b>שיא חדש! ' + fmt(score) + ' ' + esc(cfg.scoreLabel) + '</b>' +
      '<span>נכנסת לטבלת השיאים — איך קוראים לך?</span></div>' +
      '<div class="f"><input maxlength="16" placeholder="השם שלך" value="' + esc(prev) + '">' +
      '<button class="go">שמירה</button></div>' +
      listHtml(rows) + footHtml()
    );
    var inp = root.querySelector('input');
    var btn = root.querySelector('.go');
    setTimeout(function () { inp.focus(); inp.select(); }, 60);

    function save() {
      var name = (inp.value || '').trim();
      if (!name) { inp.focus(); return; }
      ls(LS_NAME, name);
      btn.disabled = true; btn.textContent = '…';
      submit(name, score, meta).then(function () {
        return fetchTop();
      }).then(function (fresh) {
        render(
          header(cfg.title) +
          '<div class="banner"><b>נשמר! ' + esc(name) + ' 🎉</b>' +
          '<span>' + fmt(score) + ' ' + esc(cfg.scoreLabel) + '</span></div>' +
          listHtml(fresh, name) + footHtml()
        );
      }).catch(function (e) {
        btn.disabled = false; btn.textContent = 'שמירה';
        var note = root.querySelector('.banner');
        note.className = 'banner calm';
        note.innerHTML = '<b>לא הצלחנו לשמור</b><span>' +
          (e.message === 'rate_limited' ? 'יותר מדי שמירות בזמן קצר — נסה בעוד כמה דקות.' : 'נסה שוב.') +
          '</span>';
      });
    }
    btn.onclick = save;
    inp.onkeydown = function (e) { if (e.key === 'Enter') save(); };
  }

  /**
   * Call this when a run ends.
   * Opens the leaderboard; if the score makes the top list, asks for a name first.
   * Always resolves — never throws into the game loop.
   */
  function gameOver(score, meta) {
    build();
    viewSlug = cfg.game;
    score = Math.max(0, Math.round(Number(score) || 0));

    // local personal best (works even with no network)
    var bk = LS_BEST + cfg.game;
    var pb = Number(ls(bk) || (cfg.scoreOrder === 'asc' ? Infinity : 0));
    if (better(score, pb)) ls(bk, String(score));

    open();
    render(header(cfg.title) + '<div class="spin"></div>');

    return fetchTop().then(function (rows) {
      rows = rows || [];
      var qualifies = rows.length < cfg.limit ||
        better(score, Number(rows[rows.length - 1].score));
      if (qualifies && score > 0) nameForm(score, meta, rows);
      else render(
        header(cfg.title) +
        '<div class="banner calm"><b>' + fmt(score) + ' ' + esc(cfg.scoreLabel) + '</b>' +
        '<span>עוד קצת והשיא שלך נכנס לטבלה</span></div>' +
        listHtml(rows, ls(LS_NAME)) + footHtml()
      );
    }).catch(function () {
      render(
        header(cfg.title) +
        '<div class="banner calm"><b>' + fmt(score) + ' ' + esc(cfg.scoreLabel) + '</b>' +
        '<span>אין חיבור לטבלת השיאים כרגע</span></div>' + footHtml()
      );
    });
  }

  /* ----------------------------------------------------------------- init */

  function init(options) {
    var g = window.GAMES_LB_CONFIG || {};
    cfg.supabaseUrl = options.supabaseUrl || g.supabaseUrl || '';
    cfg.supabaseKey = options.supabaseKey || g.supabaseKey || '';
    cfg.hubUrl = options.hubUrl || g.hubUrl || cfg.hubUrl;
    ['game', 'title', 'scoreLabel', 'scoreOrder', 'limit', 'formatScore', 'onClose', 'variants']
      .forEach(function (k) { if (options[k] !== undefined) cfg[k] = options[k]; });
    if (!cfg.game) throw new Error('Leaderboard.init: "game" (slug) is required');
    viewSlug = cfg.game;
    return API;
  }

  var API = {
    init: init,
    show: show,
    gameOver: gameOver,
    submit: function (name, score, meta) { return submit(name, score, meta); },
    top: fetchTop,
    close: close,
    personalBest: function () {
      var v = ls(LS_BEST + cfg.game);
      return v === null ? null : Number(v);
    },
    playerName: function (v) { return v === undefined ? ls(LS_NAME) : ls(LS_NAME, v); },
    setGame: function (slug) { cfg.game = slug; viewSlug = slug; return API; },
    currentGame: function () { return cfg.game; },
    config: cfg
  };

  window.Leaderboard = API;
})();
