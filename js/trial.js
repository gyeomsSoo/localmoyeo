/* 동네모여 설문 사이트 — 앱 체험 (iframe)
 *
 *  · iframe 은 처음 누를 때 만든다 — 첫 방문에 Flutter 수 MB 를 받지 않게.
 *  · 넓은 화면(마우스)은 페이지 안 폰 틀에, 폰은 전체화면 겹침창에 띄운다.
 *    (Flutter 가 터치를 다 먹어서, 페이지 안에 두면 폰에서 스크롤이 막힌다)
 *  · 앱이 보내는 메시지(SCHEMA §6)로 본 화면 · 체험 시간을 센다.
 */
(function () {
  'use strict';
  var M = window.Moyeo;
  var el = M.el;

  var ICON_WAIT = '<svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#2563EB" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="6" y="2.5" width="12" height="19" rx="3"/><path d="M10.5 18.5h3"/><path d="M12 7.5v4l2.5 1.5"/></svg>';
  var ICON_OFF = '<svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#C2410C" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 8.8a15 15 0 0 1 4.2-2.6"/><path d="M22 8.8A15 15 0 0 0 10.6 5"/><path d="M5 12.5a10 10 0 0 1 3.2-2"/><path d="M19 12.5a10 10 0 0 0-2.3-1.6"/><path d="M8.6 16a5 5 0 0 1 6.8 0"/><path d="M12 20h.01"/><path d="m3 3 18 18"/></svg>';

  /**
   * @param {object} o
   *   entry       'user' | 'owner'
   *   frameHost   넓은 화면에서 iframe 을 넣을 요소(.phone-screen). 없으면 늘 겹침창
   *   statsKey    체험 기록을 남길 저장소 키 (없으면 기록 안 함)
   *   nowPrefix   겹침창 위 글씨 ("앱 체험 중")
   *   endLabel    겹침창 아래 버튼 글씨. 없으면 아래 버튼 없음
   *   onEnd       아래 버튼을 눌렀을 때 ({ fromOverlay })
   *   onOpen      처음 열었을 때 (방문 기록용)
   *   onRoute     화면이 바뀔 때 (label, routes)
   *   onMount     iframe 을 만들었을 때 (mode)
   */
  function Trial(o) {
    var self = this;
    var stats = (o.statsKey && M.local.get(o.statsKey)) || { opened: false, ms: 0, routes: [], actions: [] };
    if (!Array.isArray(stats.routes)) stats.routes = [];
    if (!Array.isArray(stats.actions)) stats.actions = [];

    var mode = null;            // 'frame' | 'overlay'
    var iframe = null;
    var cover = null;
    var overlay = null;
    var nowLabel = null;
    var opener = null;
    var timers = [];
    var activeSince = null;
    var paused = false;
    var inView = true;
    var ready = false;

    function save() { if (o.statsKey) M.local.set(o.statsKey, stats); }

    function appUrl() {
      return M.root + (M.stub ? 'dev/app-stub.html' : 'app/') + '?entry=' + encodeURIComponent(o.entry || 'user');
    }

    /* ── 시간 재기 ── */
    function shouldRun() {
      if (!iframe || document.visibilityState === 'hidden') return false;
      if (mode === 'overlay') return !!overlay;
      return inView && !paused;
    }
    function tick() {
      var run = shouldRun();
      var now = (window.performance && performance.now) ? performance.now() : Date.now();
      if (run && activeSince === null) activeSince = now;
      else if (!run && activeSince !== null) { stats.ms += now - activeSince; activeSince = null; save(); }
    }
    document.addEventListener('visibilitychange', tick);
    window.addEventListener('pagehide', function () { tick(); save(); });

    self.seconds = function () {
      var now = (window.performance && performance.now) ? performance.now() : Date.now();
      return Math.round((stats.ms + (activeSince !== null ? now - activeSince : 0)) / 1000);
    };
    self.stats = function () { return { opened: stats.opened, seconds: self.seconds(), routes: stats.routes.slice(), actions: stats.actions.slice() }; };
    self.pause = function (p) { paused = !!p; tick(); };
    self.isOverlayOpen = function () { return !!overlay; };
    self.mounted = function () { return !!iframe; };

    /* ── 앱 메시지 ── */
    window.addEventListener('message', function (e) {
      var d = e.data;
      if (!d || typeof d !== 'object' || d.source !== 'moyeo-app') return;
      if (!iframe || e.source !== iframe.contentWindow) return;
      if (d.type === 'ready') markReady();
      else if (d.type === 'route') {
        markReady();
        var label = String(d.label || d.path || '').slice(0, 30);
        if (label && stats.routes.indexOf(label) < 0) { stats.routes.push(label); save(); }
        if (nowLabel && label) nowLabel.textContent = label;
        if (o.onRoute) o.onRoute(label, stats.routes.slice());
      } else if (d.type === 'action') {
        // _행동: 일어난 순서대로. 같은 행동이 연달아 오면 한 번만 (SCHEMA §5, 11-19)
        var name = String(d.label || d.name || '').slice(0, 30);
        if (name && stats.actions[stats.actions.length - 1] !== name && stats.actions.length < 80) { stats.actions.push(name); save(); }
      }
    });

    function markReady() {
      if (ready) return;
      ready = true;
      hideCover();
    }

    /* ── 덮개(불러오는 중 · 준비 중 · 연결 끊김) ── */
    function makeCover(kind) {
      var c = el('div', { class: 'trial-cover', role: 'status' });
      if (kind === 'loading') {
        c.appendChild(el('div', { class: 'loader', 'aria-hidden': 'true' }, [el('i'), el('i'), el('i'), el('i')]));
        c.appendChild(el('h3', { text: '앱을 불러오고 있어요' }));
        c.appendChild(el('p', { text: '처음 한 번은 10초쯤 걸려요. 설치는 필요 없어요.' }));
        var slow = el('p', { class: 'slow', hidden: true }, ['연결이 느린가 봐요. 조금만 더 기다려 주세요.']);
        if (o.onEnd && o.endLabel) {
          var skip = el('button', { type: 'button', class: 'textlink', text: '기다리지 않고 설문부터 하기 →' });
          skip.addEventListener('click', function () { end(); });
          slow.appendChild(el('br'));
          slow.appendChild(skip);
        }
        c.appendChild(slow);
        c.slow = slow;
      } else if (kind === 'missing') {
        c.appendChild(el('div', { html: ICON_WAIT }));
        c.appendChild(el('h3', { text: '앱 체험판을 준비하고 있어요' }));
        c.appendChild(el('p', { text: '조금 뒤에 다시 들러 주세요.' + (o.onEnd ? ' 설문은 지금 바로 할 수 있어요.' : '') }));
        if (o.onEnd && o.endLabel) {
          var b = el('button', { type: 'button', class: 'btn primary', html: '설문하기 <span class="arrow">→</span>' });
          b.addEventListener('click', function () { end(); });
          c.appendChild(b);
        }
      } else {
        c.appendChild(el('div', { html: ICON_OFF }));
        c.appendChild(el('h3', { text: '인터넷 연결을 확인해 주세요' }));
        c.appendChild(el('p', { text: '연결되면 다시 눌러 주세요.' }));
        var r = el('button', { type: 'button', class: 'btn line', text: '다시 시도' });
        // teardownFrame 이 덮개(c)를 떼어 내므로 붙어 있던 자리를 먼저 잡아 둔다
        r.addEventListener('click', function () { var stage = c.parentNode; teardownFrame(); if (stage) mountInto(stage); });
        c.appendChild(r);
      }
      return c;
    }
    function hideCover() {
      timers.forEach(clearTimeout); timers = [];
      if (!cover) return;
      var c = cover;
      cover = null;
      c.classList.add('fade');
      setTimeout(function () { if (c.parentNode) c.parentNode.removeChild(c); }, 300);
    }

    /* ── iframe 만들기 (있는지 먼저 확인) ── */
    function check() {
      if (M.stub) return Promise.resolve('ok');
      return fetch(M.root + 'app/index.html', { method: 'HEAD', cache: 'no-store' })
        .then(function (r) { return r.ok ? 'ok' : 'missing'; })
        .catch(function () { return navigator.onLine === false ? 'offline' : 'missing'; });
    }

    function mountInto(stage) {
      ready = false;
      cover = makeCover('loading');
      stage.appendChild(cover);
      check().then(function (state) {
        if (!stage.isConnected) return;
        if (state !== 'ok') {
          if (cover && cover.parentNode) cover.parentNode.removeChild(cover);
          cover = makeCover(state);
          stage.appendChild(cover);
          return;
        }
        iframe = el('iframe', {
          src: appUrl(),
          title: o.entry === 'owner' ? '동네모여 사장님 화면 체험' : '동네모여 앱 체험',
          allow: 'clipboard-write; geolocation',
          referrerpolicy: 'same-origin'
        });
        iframe.addEventListener('load', function () {
          timers.push(setTimeout(markReady, 9000));   // ready 를 안 보내는 앱이어도 덮개는 걷힌다
        });
        stage.insertBefore(iframe, cover);
        timers.push(setTimeout(function () { if (cover && cover.slow) cover.slow.hidden = false; }, 9000));
        timers.push(setTimeout(markReady, 30000));
        if (!stats.opened) { stats.opened = true; save(); }
        if (o.onOpen) o.onOpen();
        if (o.onMount) o.onMount(mode);
        tick();
      });
    }

    function teardownFrame() {
      tick();
      timers.forEach(clearTimeout); timers = [];
      if (iframe && iframe.parentNode) iframe.parentNode.removeChild(iframe);
      if (cover && cover.parentNode) cover.parentNode.removeChild(cover);
      iframe = null; cover = null; ready = false;
      tick();
    }

    /* ── 넓은 화면: 폰 틀 ── */
    function openFrame() {
      mode = 'frame';
      if (iframe) { iframe.focus(); return; }
      var host = o.frameHost;
      host.classList.add('live');
      var stage = host.querySelector('.phone-stage') || host;
      if ('IntersectionObserver' in window) {
        new IntersectionObserver(function (ents) { inView = ents[0].isIntersecting; tick(); }, { threshold: 0.25 }).observe(host);
      }
      mountInto(stage);
    }

    /* ── 폰: 전체화면 겹침창 ── */
    function openOverlay() {
      if (overlay) return;
      mode = 'overlay';
      opener = document.activeElement;
      nowLabel = el('b', { text: '' });
      var close = el('button', { type: 'button', class: 'btn ghost small', 'aria-label': '체험 닫기' }, [
        el('span', { html: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>' }),
        '닫기'
      ]);
      close.addEventListener('click', function () { self.close(); });
      var stage = el('div', { class: 'trial-stage' });
      var kids = [
        el('div', { class: 'trial-bar' }, [
          close,
          el('div', { class: 'trial-now' }, [el('span', { class: 'live-dot', 'aria-hidden': 'true' }), el('span', { text: o.nowPrefix || '앱 체험 중' }), nowLabel])
        ]),
        stage
      ];
      if (o.endLabel) {
        var endBtn = el('button', { type: 'button', class: 'btn primary block', html: o.endLabel + ' <span class="arrow">→</span>' });
        endBtn.addEventListener('click', function () { end(); });
        kids.push(el('div', { class: 'trial-foot' }, [endBtn]));
      }
      overlay = el('div', { class: 'trial-overlay', role: 'dialog', 'aria-modal': 'true', 'aria-label': o.entry === 'owner' ? '사장님 화면 체험' : '앱 체험' }, kids);
      document.body.appendChild(overlay);
      document.documentElement.classList.add('lock');
      try { history.pushState({ moyeo: 'trial' }, ''); } catch (e) { /* 무시 */ }
      close.focus();
      mountInto(stage);
    }

    function removeOverlay() {
      if (!overlay) return false;
      teardownFrame();
      overlay.parentNode.removeChild(overlay);
      overlay = null;
      nowLabel = null;
      document.documentElement.classList.remove('lock');
      tick();
      save();
      if (opener && opener.focus) { try { opener.focus({ preventScroll: true }); } catch (e) { /* 무시 */ } }
      return true;
    }

    /** 닫기 — 뒤로가기 한 칸(겹침창용으로 넣어 둔 것)도 함께 걷는다 */
    self.close = function (fromPop) {
      if (!removeOverlay()) return;
      if (!fromPop && history.state && history.state.moyeo === 'trial') { try { history.back(); } catch (e) { /* 무시 */ } }
    };

    function end() {
      var fromOverlay = !!overlay;
      if (overlay) removeOverlay();
      if (o.onEnd) o.onEnd({ fromOverlay: fromOverlay });
    }

    window.addEventListener('popstate', function () { if (overlay) self.close(true); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && overlay) self.close(); });

    self.open = function () {
      if (o.frameHost && !o.forceOverlay && M.isDesktopWide()) openFrame();
      else openOverlay();
    };
  }

  M.Trial = Trial;
})();
