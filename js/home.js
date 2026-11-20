/* 이용자 페이지 (/) — 소개 → 앱 체험 → 설문(한 화면 한 문항) → 감사 */
(function () {
  'use strict';
  var M = window.Moyeo;
  var F = M.Fields;
  var el = M.el;

  var PROGRESS = 'moyeo.progress.user';
  var DONE = 'moyeo.done.user';
  var TRIAL = 'moyeo.trial.user';

  var homeView = M.$('#home');
  var surveyView = M.$('#survey');
  var primaryBtn = M.$('#primaryBtn');
  var secondaryBtn = M.$('#secondaryBtn');

  var content = null;        // user.json
  var form = null;           // F.normalize 결과
  var loadError = null;
  var state = { answers: {}, others: {}, orders: {} };
  var cur = null;            // 지금 문항 id · 'start' · 'outro'
  var startedAt = null;      // 첫 문항을 본 시각
  var view = 'home';
  var advanceTimer = null;

  M.visit('방문');

  /* ── 체험 ── */
  var trial = new M.Trial({
    entry: 'user',
    frameHost: M.$('#phone'),
    statsKey: TRIAL,
    nowPrefix: '앱 체험 중 ·',
    endLabel: '설문하기',
    endHint: '다 둘러봤으면',
    firstHint: '모임 탭에서 디자인 A·B를 바꿔 볼 수 있어요',
    skipLabel: '기다리지 않고 설문부터 하기 →',
    missingNote: '설문은 지금 바로 할 수 있어요.',
    onOpen: function () { M.visit('체험 시작'); },
    onMount: function () { paintHome(); },
    onRoute: function (label, routes) {
      var seen = M.$('#seen');
      if (seen) {
        seen.hidden = false;
        M.$('#seenNow').textContent = label || '—';
        M.$('#seenCount').textContent = String(routes.length);
      }
    },
    onEnd: function (o) { go('survey', o && o.fromOverlay ? 'replace' : 'push'); }
  });

  M.$('#poster').addEventListener('click', function () { trial.open(); });

  primaryBtn.addEventListener('click', function () {
    var act = primaryBtn.getAttribute('data-act') || 'try';
    if (act === 'try') trial.open();
    else go('survey', 'push');
  });
  secondaryBtn.addEventListener('click', function () {
    var act = secondaryBtn.getAttribute('data-act') || 'survey';
    if (act === 'survey') go('survey', 'push');
    else trial.open();
  });

  function isDone() { return !!M.local.get(DONE); }

  /** 소개 화면 버튼 글씨를 지금 상황에 맞게 */
  function paintHome() {
    var done = isDone();
    var prog = M.local.get(PROGRESS);
    var tried = trial.stats().opened || trial.mounted();
    var arrow = ' <span class="arrow">→</span>';
    M.$('#doneNote').hidden = !done;
    M.$('#plan').hidden = done;

    if (done) {
      primaryBtn.innerHTML = '앱 다시 둘러보기';
      primaryBtn.setAttribute('data-act', 'try');
      secondaryBtn.hidden = true;
      return;
    }
    secondaryBtn.hidden = false;
    var n = prog && prog.answered ? prog.answered : 0;
    if (n > 0 || tried) {
      primaryBtn.innerHTML = (n > 0 ? '설문 이어하기' : '체험 끝, 설문하기') + arrow;
      primaryBtn.setAttribute('data-act', 'survey');
      secondaryBtn.textContent = '앱 다시 둘러보기';
      secondaryBtn.setAttribute('data-act', 'try');
      secondaryBtn.hidden = trial.mounted();   // 넓은 화면에서 앱이 바로 옆에 떠 있으면 필요 없다
    } else {
      primaryBtn.innerHTML = '앱 체험하기' + arrow;
      primaryBtn.setAttribute('data-act', 'try');
      secondaryBtn.textContent = '체험 없이 바로 설문하기 →';
      secondaryBtn.setAttribute('data-act', 'survey');
    }
  }

  /* ── 화면 전환 (소개 ↔ 설문). 뒤로가기로 소개로 돌아온다 ── */
  function go(next, how) {
    if (how === 'push' && view !== next) {
      try { history.pushState({ moyeo: next }, '', next === 'survey' ? '#survey' : location.pathname + location.search); } catch (e) { /* 무시 */ }
    } else if (how === 'replace') {
      try { history.replaceState({ moyeo: next }, '', next === 'survey' ? '#survey' : location.pathname + location.search); } catch (e) { /* 무시 */ }
    }
    show(next);
  }

  function show(next) {
    view = next;
    var toSurvey = next === 'survey';
    homeView.hidden = toSurvey;
    surveyView.hidden = !toSurvey;
    trial.pause(toSurvey);
    if (toSurvey) {
      if (!cur) cur = isDone() ? 'outro' : (restoredCur() || 'start');
      if (isDone()) cur = 'outro';
      drawSurvey('none');
    } else {
      paintHome();
    }
    window.scrollTo(0, 0);
  }

  window.addEventListener('popstate', function (e) {
    if (trial.isOverlayOpen()) return;   // 겹침창이 스스로 닫는다
    var s = e.state && e.state.moyeo;
    var next = s === 'survey' || (!s && location.hash === '#survey') ? 'survey' : 'home';
    if (next !== view) show(next);
  });

  /* ── 진행 저장 · 복원 ── */
  var saveTimer = null;
  function saveProgress() {
    if (!content || cur === 'outro') return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      var answered = form ? F.visibleList(form, state).filter(function (q) { return q.type !== 'info' && F.answered(q, state); }).length : 0;
      // 개인정보(private: 닉네임·연락처)는 진행 저장에 넣지 않는다 — 기기에 남기지 않는다(SCHEMA §5)
      var keepA = {}, keepO = {};
      Object.keys(state.answers).forEach(function (id) { var q = form && form.byId[id]; if (!(q && q.private)) keepA[id] = state.answers[id]; });
      Object.keys(state.others).forEach(function (id) { var q = form && form.byId[id]; if (!(q && q.private)) keepO[id] = state.others[id]; });
      M.local.set(PROGRESS, { id: content.id, answers: keepA, others: keepO, orders: state.orders || {}, cur: cur, startedAt: startedAt, answered: answered, at: Date.now() });
    }, 250);
  }
  function restoredCur() {
    var p = M.local.get(PROGRESS);
    if (!p || !form) return null;
    return p.cur && (p.cur === 'start' || form.byId[p.cur]) ? p.cur : null;
  }

  /* ── 문항 불러오기 ── */
  M.loadContent('user').then(function (c) {
    content = c;
    form = F.normalize(c);
    var p = M.local.get(PROGRESS);
    if (p && p.id === c.id) {
      state.answers = p.answers || {};
      state.others = p.others || {};
      state.orders = p.orders || {};   // image-choice 무작위 순서 — 한 번 정하면 그대로
      F.sanitize(form, state);   // 지금 보기에 없는 값은 버린다
      startedAt = p.startedAt || null;
    } else if (p) {
      M.local.del(PROGRESS);   // 문항 판이 바뀌었으면 처음부터
    }
    if (view === 'survey') { cur = isDone() ? 'outro' : (restoredCur() || 'start'); drawSurvey('none'); }
    paintHome();
  }).catch(function (err) {
    loadError = err;
    console.warn('[설문] 문항을 못 불러왔어요', err);
    if (view === 'survey') drawSurvey('none');
  });

  paintHome();
  if (location.hash === '#survey') { try { history.replaceState({ moyeo: 'survey' }, ''); } catch (e) { /* 무시 */ } show('survey'); }

  /* ── 설문 그리기 ── */
  var top, cellsBox, countBox, body, nav, prevBtn, nextBtn;

  function buildFrame() {
    surveyView.innerHTML = '';
    var back = el('button', { type: 'button', class: 'btn ghost', html: '<span aria-hidden="true">←</span> 소개' });
    back.addEventListener('click', function () {
      if (history.state && history.state.moyeo === 'survey') history.back(); else go('home', 'replace');
    });
    countBox = el('span', { class: 'sv-count num', 'aria-live': 'polite' });
    cellsBox = el('div', { class: 'sv-progress', role: 'progressbar', 'aria-label': '설문 진행' });
    top = el('div', { class: 'sv-top' }, [
      el('div', { class: 'sv-bar' }, [back, el('span', { class: 'sv-title', text: (content && content.title) || '설문' }), countBox]),
      cellsBox
    ]);
    body = el('main', { class: 'sv-body' });
    prevBtn = el('button', { type: 'button', class: 'btn line prev', text: '이전' });
    nextBtn = el('button', { type: 'button', class: 'btn primary next' });
    prevBtn.addEventListener('click', prev);
    nextBtn.addEventListener('click', next);
    nav = el('nav', { class: 'sv-nav', 'aria-label': '문항 이동' }, [
      el('span', { class: 'kbd-hint', 'aria-hidden': 'true', text: '숫자 키로 고르고 Enter 로 넘어가요' }),
      prevBtn, nextBtn
    ]);
    surveyView.appendChild(top);
    surveyView.appendChild(body);
    surveyView.appendChild(nav);
  }

  function cards() { return form ? F.visibleList(form, state) : []; }

  function paintProgress() {
    var list = cards();
    var idx = list.findIndex(function (q) { return q.id === cur; });
    var total = list.length;
    if (cur === 'start' || cur === 'outro' || idx < 0) {
      cellsBox.hidden = cur !== 'outro';          // 감사 화면에선 칸이 전부 찬 채로
      countBox.textContent = '';
      if (cur === 'outro') paintCells(total, total, total);
      return;
    }
    cellsBox.hidden = false;
    countBox.innerHTML = '';
    countBox.appendChild(el('b', { text: String(idx + 1) }));
    countBox.appendChild(document.createTextNode(' / ' + total));
    paintCells(total, idx, idx);
  }
  function paintCells(total, doneCount, nowIdx) {
    cellsBox.setAttribute('aria-valuemin', '0');
    cellsBox.setAttribute('aria-valuemax', String(total));
    cellsBox.setAttribute('aria-valuenow', String(doneCount));
    if (total > 40) {
      cellsBox.className = 'sv-progress bar';
      cellsBox.innerHTML = '';
      cellsBox.appendChild(el('span', { style: 'width:' + Math.round(doneCount / total * 100) + '%' }));
      return;
    }
    cellsBox.className = 'sv-progress';
    cellsBox.style.setProperty('--n', String(total));
    if (cellsBox.children.length !== total) {
      cellsBox.innerHTML = '';
      for (var i = 0; i < total; i++) cellsBox.appendChild(el('i'));
    }
    Array.prototype.forEach.call(cellsBox.children, function (c, i) {
      c.className = i < doneCount ? 'done' : (i === nowIdx ? 'now' : '');
    });
  }

  function drawSurvey(dir) {
    if (!top) buildFrame();
    clearTimeout(advanceTimer);
    body.innerHTML = '';

    if (!content) {
      nav.hidden = true;
      cellsBox.hidden = true;
      countBox.textContent = '';
      body.appendChild(loadError ? emptyCard() : el('div', { class: 'sv-empty' }, [el('div', { class: 'loader', style: 'margin:0 auto', 'aria-hidden': 'true' }, [el('i'), el('i'), el('i'), el('i')]), el('p', { text: '설문을 불러오고 있어요' })]));
      return;
    }
    top.querySelector('.sv-title').textContent = content.title || '설문';

    if (cur === 'outro') { drawOutro(); paintProgress(); return; }
    if (cur === 'start') { drawStart(); paintProgress(); return; }

    var q = form.byId[cur];
    if (!q || !F.isVisible(q, form, state)) {
      // 답을 바꿔서 지금 문항이 숨겨졌으면 다음 보이는 문항으로
      var list = cards();
      cur = list.length ? list[0].id : 'start';
      q = form.byId[cur];
      if (!q) { drawStart(); return; }
    }
    if (!startedAt) { startedAt = Date.now(); }
    M.visit('설문 시작');

    var card = drawQuestion(q);
    if (dir === 'back') card.classList.add('back');
    body.appendChild(card);
    nav.hidden = false;
    paintNav();
    paintProgress();
    saveProgress();
    try { card.focus({ preventScroll: true }); } catch (e) { card.focus(); }
  }

  function emptyCard() {
    var box = el('div', { class: 'sv-empty' }, [
      el('h2', { text: '설문을 준비하고 있어요' }),
      el('p', { text: '조금 뒤에 다시 들러 주세요. 그동안 앱을 먼저 둘러봐도 좋아요.' })
    ]);
    if (M.isLocal && !M.sample) box.appendChild(el('p', { html: '개발 중이면 <a href="?content=sample&app=stub#survey">?content=sample</a> 로 열어 보세요.' }));
    var b = el('button', { type: 'button', class: 'btn primary', text: '앱 둘러보기' });
    b.addEventListener('click', function () { go('home', 'push'); trial.open(); });
    box.appendChild(b);
    return box;
  }

  function drawStart() {
    var prog = M.local.get(PROGRESS);
    var resumed = prog && prog.answered > 0;
    var tried = trial.stats().opened;
    var card = el('section', { class: 'card start', tabindex: '-1' }, [
      el('h2', { text: content.title || '설문' }),
      content.intro ? el('p', { class: 'intro', text: content.intro }) : null,
      content.notice ? el('p', { class: 'notice' }, [
        el('span', { html: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4.5" y="10.5" width="15" height="10" rx="2.5"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/></svg>' }),
        el('span', { text: content.notice })
      ]) : null,
      resumed ? el('p', { class: 'resume', text: '하던 곳부터 이어서 할게요 · ' + prog.answered + '개 답함' }) : null
    ]);
    if (!tried && !resumed) {
      var t = el('button', { type: 'button', class: 'textlink', text: '앱 먼저 둘러보기 →' });
      t.addEventListener('click', function () { trial.open(); });
      card.appendChild(el('div', { class: 'try-first' }, [el('p', { text: '앱을 먼저 둘러보면 답하기가 쉬워요. 2분이면 돼요.' }), t]));
    }
    body.appendChild(card);
    nav.hidden = false;
    prevBtn.hidden = true;
    nextBtn.innerHTML = (resumed ? '이어서 하기' : '시작하기') + ' <span class="arrow">→</span>';
    try { card.focus({ preventScroll: true }); } catch (e) { card.focus(); }
  }

  function drawQuestion(q) {
    var card = el('section', { class: 'card', tabindex: '-1', 'aria-labelledby': 'qt-' + q.id });
    card.appendChild(el('p', { class: 'sv-sec', text: (q.section && q.section.title) || '' }));

    if (q.type === 'info') {
      card.appendChild(el('div', { class: 'info-card' }, [
        el('span', { class: 'info-tag', html: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.6v.1"/></svg>안내' }),
        el('p', { class: 'info-text', id: 'qt-' + q.id, text: q.text }),
        q.help ? el('p', { class: 'q-help', text: q.help }) : null
      ]));
      return card;
    }

    var h = el('h2', { class: 'q-text', id: 'qt-' + q.id }, [q.text]);
    if (!q.required) h.appendChild(el('span', { class: 'opt-chip', text: '선택' }));
    card.appendChild(h);
    if (q.help) card.appendChild(el('p', { class: 'q-help', text: q.help }));
    if (q.private) {
      card.appendChild(el('p', { class: 'private-note' }, [
        el('span', { html: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4.5" y="10.5" width="15" height="10" rx="2.5"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/></svg>' }),
        '설문 답과 따로 저장돼요 · 이 기기에는 남기지 않아요'
      ]));
    }

    var err = el('p', { class: 'err', role: 'alert' });
    var ctlBox = el('div', { class: 'q-ctl' });
    var hadAnswer = F.answered(q, state);

    var ctl = F.render(q, state, function (info) {
      err.textContent = '';
      saveProgress();
      paintNav();
      // 처음 고른 하나 고르기·눈금은 다음으로 넘겨 준다. 마지막 문항은 넘기지 않는다(제출은 꼭 눌러서).
      var list = cards();
      var isLast = list.length && list[list.length - 1].id === q.id;
      if (info && info.advance && !hadAnswer && !isLast && !F.validate(q, state)) {
        clearTimeout(advanceTimer);
        advanceTimer = setTimeout(function () { if (cur === q.id) next(); }, M.reducedMotion() ? 120 : 360);
      }
    });
    card.ctl = ctl;
    card.err = err;

    // 화면 평가는 앱을 안 둘러봤으면 접어 둔다 (건너뛰어도 되는 문항일 때)
    if (q.type === 'rating-grid' && !q.required && !trial.stats().opened && !F.answered(q, state)) {
      var box = el('div', { class: 'skip-box' }, [el('p', { text: '앱을 아직 안 둘러보셨네요. 이 문항은 건너뛰어도 돼요.' })]);
      var row = el('div', { class: 'row' });
      var tryBtn = el('button', { type: 'button', class: 'btn primary small', text: '앱 둘러보고 올게요' });
      var showBtn = el('button', { type: 'button', class: 'btn line small', text: '그래도 답할게요' });
      tryBtn.addEventListener('click', function () { trial.open(); });
      showBtn.addEventListener('click', function () { box.replaceWith(ctl); });
      row.appendChild(tryBtn); row.appendChild(showBtn);
      box.appendChild(row);
      ctlBox.appendChild(box);
    } else {
      ctlBox.appendChild(ctl);
    }
    card.appendChild(ctlBox);
    card.appendChild(err);
    return card;
  }

  function paintNav() {
    var list = cards();
    var idx = list.findIndex(function (q) { return q.id === cur; });
    prevBtn.hidden = false;
    var last = idx === list.length - 1;
    var q = form.byId[cur];
    var skippable = q && q.type !== 'info' && !q.required && !F.answered(q, state);
    nextBtn.innerHTML = last ? '제출하기' : (skippable ? '건너뛰기 <span class="arrow">→</span>' : '다음 <span class="arrow">→</span>');
  }

  function next() {
    clearTimeout(advanceTimer);
    if (cur === 'start') {
      var list0 = cards();
      var r = restoredCur();
      cur = r && r !== 'start' ? r : (list0[0] && list0[0].id);
      if (!startedAt) startedAt = Date.now();
      drawSurvey('fwd');
      window.scrollTo(0, 0);
      return;
    }
    var q = form.byId[cur];
    var msg = F.validate(q, state);
    if (msg) {
      var card = body.querySelector('.card');
      if (card) {
        card.err.textContent = msg;
        card.classList.remove('nudge');
        void card.offsetWidth;
        card.classList.add('nudge');
        var f = card.querySelector('input:not([disabled]), select, textarea, button.opt');
        if (f && (q.type === 'text' || q.type === 'longtext' || q.type === 'number' || /기타/.test(msg))) {
          var other = card.querySelector('.other-wrap:not([hidden]) input');
          try { (other || f).focus(); } catch (e) { /* 무시 */ }
        }
      }
      return;
    }
    var list = cards();
    var idx = list.findIndex(function (x) { return x.id === cur; });
    if (idx < list.length - 1) {
      cur = list[idx + 1].id;
      drawSurvey('fwd');
      window.scrollTo(0, 0);
    } else {
      submit();
    }
  }

  function prev() {
    clearTimeout(advanceTimer);
    var list = cards();
    var idx = list.findIndex(function (x) { return x.id === cur; });
    cur = idx > 0 ? list[idx - 1].id : 'start';
    drawSurvey('back');
    window.scrollTo(0, 0);
  }

  /* 키보드: 숫자로 고르기 · Enter 로 다음 */
  document.addEventListener('keydown', function (e) {
    if (view !== 'survey' || !content || cur === 'outro') return;
    if (e.altKey || e.ctrlKey || e.metaKey) {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); next(); }
      return;
    }
    var t = e.target;
    var typing = t && (t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || (t.tagName === 'INPUT' && t.type !== 'radio' && t.type !== 'checkbox'));
    if (e.key === 'Enter' && !typing && !(t && t.tagName === 'BUTTON')) { e.preventDefault(); next(); return; }
    if (e.key === 'Enter' && t && t.tagName === 'INPUT' && t.type === 'text') { e.preventDefault(); next(); return; }
    if (typing) return;
    if (/^[1-9]$/.test(e.key)) {
      var card = body.querySelector('.card');
      if (card && card.ctl && card.ctl.pick) { e.preventDefault(); card.ctl.pick(Number(e.key) - 1); }
    }
  });

  /* ── 제출 ── */
  function submit() {
    var answers = F.flatten(form, state);
    var t = trial.stats();
    answers['_버전'] = content.id;
    answers['_유입'] = M.from;
    answers['_기기'] = M.device;
    answers['_인앱브라우저'] = M.inApp;
    answers['_체험함'] = t.opened ? '예' : '아니오';
    answers['_체험초'] = t.seconds;
    answers['_본화면'] = t.routes.join(' → ');
    answers['_행동'] = t.actions.join(' → ');
    answers['_소요초'] = startedAt ? Math.max(1, Math.round((Date.now() - startedAt) / 1000)) : 0;

    M.submit('user', answers, { meta: { kind: 'user' } });

    // 닉네임·연락처는 user 행에 싣지 않고 따로 한 건 — sid 는 비운다(설문 답변과 잇지 않는다). 답이 없으면 보내지 않는다.
    var priv = F.flattenPrivate(form, state);
    if (Object.keys(priv).length) {
      priv['_유입'] = M.from;
      priv['_버전'] = content.id;
      M.submit('contact', priv, { sid: '', meta: { kind: 'contact' } });   // _제출id 는 이 건 자신의 값이 붙는다
    }
    // 메모리에서도 지운다. 대기열의 contact 건은 전송이 성공하면 빠진다.
    form.list.forEach(function (q) { if (q.private) { delete state.answers[q.id]; delete state.others[q.id]; } });

    M.local.set(DONE, { at: Date.now(), id: content.id });
    M.local.del(PROGRESS);
    cur = 'outro';
    drawSurvey('fwd');
    window.scrollTo(0, 0);
  }

  var STAMP = '<svg class="stamp" viewBox="0 0 160 160" role="img" aria-label="참여 완료 도장">' +
    '<defs><path id="ring" d="M80,80 m-57,0 a57,57 0 1,1 114,0 a57,57 0 1,1 -114,0"/></defs>' +
    '<circle cx="80" cy="80" r="74" fill="none" stroke="currentColor" stroke-width="4.5"/>' +
    '<circle cx="80" cy="80" r="44" fill="none" stroke="currentColor" stroke-width="2"/>' +
    '<text fill="currentColor" font-size="12.5" font-weight="800" letter-spacing="2.2"><textPath href="#ring" startOffset="0">동네모여 · 설문 참여 · 동네모여 · 설문 참여 ·</textPath></text>' +
    '<text x="80" y="77" text-anchor="middle" fill="currentColor" font-size="21" font-weight="800">참여</text>' +
    '<text x="80" y="101" text-anchor="middle" fill="currentColor" font-size="21" font-weight="800">완료</text>' +
    '</svg>';

  var sendState = null;
  function drawOutro() {
    nav.hidden = true;
    var o = content.outro || {};
    sendState = el('p', { class: 'send-state', role: 'status' });
    var card = el('section', { class: 'card outro', tabindex: '-1' }, [
      el('div', { class: 'stamp-wrap', html: STAMP }),
      el('h2', { text: o.title || '고마워요' }),
      o.body ? el('p', { class: 'body', text: o.body }) : null,
      sendState
    ]);
    var copied = el('p', { class: 'copied', 'aria-live': 'polite' });
    var share = el('button', { type: 'button', class: 'btn primary block', text: '친구에게 알려 주기' });
    share.addEventListener('click', function () { shareLink(copied); });
    var again = el('button', { type: 'button', class: 'btn line block', text: '앱 다시 둘러보기' });
    again.addEventListener('click', function () { go('home', 'push'); trial.open(); });
    card.appendChild(el('div', { class: 'acts' }, [share, again, copied]));
    body.appendChild(card);
    paintSend();
    try { card.focus({ preventScroll: true }); } catch (e) { card.focus(); }
  }

  function paintSend(ev) {
    if (!sendState || !sendState.isConnected) return;
    var pending = M.outboxCount();
    sendState.innerHTML = '';
    sendState.className = 'send-state';
    if (!pending) {
      sendState.classList.add('ok');
      sendState.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
      sendState.appendChild(document.createTextNode('응답이 잘 도착했어요'));
    } else if (ev && ev.error) {
      sendState.classList.add('wait');
      sendState.textContent = M.persist ? '연결이 불안정해요 — 이 기기에 저장해 뒀다가 다시 보낼게요'
        : '연결이 불안정해요 — 다 보낼 때까지 이 창을 닫지 말아 주세요';
    } else {
      sendState.appendChild(el('span', { class: 'loader', 'aria-hidden': 'true' }, [el('i'), el('i'), el('i')]));
      sendState.appendChild(document.createTextNode('보내는 중…'));
    }
  }
  M.on('outbox', paintSend);
  M.on('sent', function () { paintSend(); });

  function shareLink(note) {
    var url = location.origin + location.pathname + '?from=share';
    var data = { title: '동네모여', text: '동네 소모임 앱을 웹에서 둘러보고 5분 설문에 답해 주세요', url: url };
    if (navigator.share) {
      navigator.share(data).catch(function () { /* 닫음 */ });
      return;
    }
    var done = function () { note.textContent = '링크를 복사했어요. 붙여 넣어 보내 주세요.'; };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(done, function () { fallbackCopy(url, note); });
    } else fallbackCopy(url, note);
  }
  function fallbackCopy(url, note) {
    var t = el('textarea', { style: 'position:fixed;opacity:0;top:0', readonly: true });
    t.value = url;
    document.body.appendChild(t);
    t.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    t.remove();
    note.textContent = ok ? '링크를 복사했어요. 붙여 넣어 보내 주세요.' : url;
  }
})();
