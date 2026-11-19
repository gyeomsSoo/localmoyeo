/* 동네모여 설문 사이트 — 문항 엔진 (SCHEMA §3)
 *
 * 이용자 설문(카드 넘김)과 사장님 인터뷰 시트(한 페이지)가 같이 쓴다.
 * 답은 문항 id 로 들고 있다가, 보낼 때만 key(시트 열 이름)로 바꾼다.
 *
 *   state = { answers: { 문항id: 값 }, others: { 문항id: "기타 칸 글" } }
 *   "기타(직접 입력)" 를 고르면 값은 OTHER 표식이고, 보낼 때 "기타: 입력한 말" 이 된다.
 */
(function () {
  'use strict';
  var M = window.Moyeo;
  var el = M.el;

  var OTHER = '__other__';
  var OTHER_LABEL = '기타 (직접 입력)';
  var TYPES = ['single', 'multi', 'scale', 'rank', 'rating-grid', 'select', 'number', 'text', 'longtext', 'info'];
  var MAXLEN = 2000;

  var CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';

  /** 섹션을 펼쳐 문항 목록으로. 모르는 type 은 건너뛴다(콘솔 경고). */
  function normalize(content) {
    var kind = content.kind || 'user';
    var list = [];
    (content.sections || []).forEach(function (sec, si) {
      (sec.questions || []).forEach(function (q) {
        if (TYPES.indexOf(q.type) < 0) { console.warn('[문항] 모르는 type 이라 건너뜀:', q.id, q.type); return; }
        var n = Object.assign({}, q);
        n.section = sec;
        n.sectionIndex = si;
        if (n.type === 'info') n.required = false;
        else if (typeof n.required !== 'boolean') n.required = (kind === 'user');
        n.options = Array.isArray(n.options) ? n.options.map(String) : [];
        // select 의 보기: { v: 저장값, label: 보이는 글 }.
        // range 는 숫자만 저장하고 suffix("세")는 화면에만 붙인다 (메인 결정 26-11-19: 나이 24 → 24).
        if (n.type === 'select') {
          n.choices = n.options.map(function (o) { return { v: o, label: o }; });
          if (!n.choices.length && n.range) {
            var from = Number(n.range.from), to = Number(n.range.to), suf = n.range.suffix || '';
            var step = from <= to ? 1 : -1;
            for (var v = from; step > 0 ? v <= to : v >= to; v += step) n.choices.push({ v: v, label: v + suf });
          }
        }
        list.push(n);
      });
    });
    var byId = {};
    list.forEach(function (q) { byId[q.id] = q; });
    return { kind: kind, list: list, byId: byId };
  }

  function isEmpty(v) {
    return v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length) ||
      (typeof v === 'object' && !Array.isArray(v) && !Object.keys(v).length);
  }

  /** showIf 의 보기와 답이 겹치나. "기타" 로 시작하는 보기는 직접 입력한 답과도 맞는다. */
  function matches(val, wanted) {
    var vals = Array.isArray(val) ? val : [val];
    return vals.some(function (v) {
      if (v === OTHER) return wanted.some(function (w) { return /^기타/.test(String(w)); });
      return wanted.indexOf(String(v)) >= 0;
    });
  }

  /**
   * 보이는 문항인가 — 가리키는 문항이 숨겨져 있으면 이것도 숨는다(사슬).
   * showIf: { q, in: [...] } 보기 겹침 · { q, gte: 15 } · { q, lte: 39 } 숫자 비교(답이 숫자가 아니거나 비면 숨김). 함께 쓰면 전부 맞아야 보인다.
   */
  function isVisible(q, form, state, depth) {
    var si = q.showIf;
    if (!si || !si.q) return true;
    if ((depth || 0) > 20) return false;
    var t = form.byId[si.q];
    if (!t) return false;
    if (!isVisible(t, form, state, (depth || 0) + 1)) return false;
    var v = state.answers[t.id];
    if (isEmpty(v)) return false;
    var hasNum = si.gte !== undefined || si.lte !== undefined;
    if (hasNum) {
      if (typeof v !== 'number' || !isFinite(v)) return false;
      if (si.gte !== undefined && v < Number(si.gte)) return false;
      if (si.lte !== undefined && v > Number(si.lte)) return false;
    }
    if (Array.isArray(si.in)) return matches(v, si.in.map(String));
    return hasNum;
  }

  /**
   * 연락처 검사·정리 (validate: "phone-or-email")
   *  휴대폰: 숫자만 남겨 01[016789] 로 시작하는 10~11자리 → 010-1234-5678 꼴. +82 10… 도 받는다.
   *  이메일: 간단한 꼴 검사(이름@도메인.끝). 빈칸은 지운다.
   */
  function contactValue(raw) {
    var s = String(raw === undefined || raw === null ? '' : raw).trim();
    if (!s) return { ok: false, empty: true };
    if (s.indexOf('@') >= 0) {
      var e = s.replace(/\s+/g, '');
      return /^[^@\s]+@[^@\s.]+(\.[^@\s.]+)*\.[A-Za-z]{2,}$/.test(e) ? { ok: true, value: e, kind: 'email' } : { ok: false, kind: 'email' };
    }
    if (/[A-Za-z가-힣]/.test(s)) return { ok: false, kind: 'unknown' };
    var d = s.replace(/[^0-9]/g, '');
    if (/^\+\s*82/.test(s) && d.indexOf('82') === 0) d = '0' + d.slice(2);
    if (/^01[016789]\d{7,8}$/.test(d)) {
      var v = d.length === 10 ? d.slice(0, 3) + '-' + d.slice(3, 6) + '-' + d.slice(6) : d.slice(0, 3) + '-' + d.slice(3, 7) + '-' + d.slice(7);
      return { ok: true, value: v, kind: 'phone' };
    }
    return { ok: false, kind: 'phone' };
  }

  /** 보낼 값: validate 문항은 정리된 꼴로 */
  function finalValue(q, v) {
    if (q.validate === 'phone-or-email') { var r = contactValue(v); return r.ok ? r.value : String(v).trim(); }
    return typeof v === 'string' ? v.trim() : v;
  }

  function visibleList(form, state) {
    return form.list.filter(function (q) { return isVisible(q, form, state); });
  }

  function answered(q, state) {
    var v = state.answers[q.id];
    if (q.type === 'info') return true;
    if (q.type === 'rating-grid') return (q.items || []).every(function (it) { return v && !isEmpty(v[it.id]); });
    return !isEmpty(v);
  }

  /** 문제가 있으면 한국어 문장 하나, 없으면 '' */
  function validate(q, state) {
    var v = state.answers[q.id];
    var other = (state.others[q.id] || '').trim();
    if (q.type === 'info') return '';

    if (q.type === 'rating-grid') {
      var items = q.items || [];
      var done = items.filter(function (it) { return v && !isEmpty(v[it.id]); }).length;
      if (q.required && done < items.length) return done ? '남은 ' + (items.length - done) + '줄도 골라 주세요' : '줄마다 하나씩 골라 주세요';
      return '';
    }

    if (isEmpty(v)) {
      if (!q.required) return '';
      if (q.type === 'text' || q.type === 'longtext') return '한 줄이라도 적어 주세요';
      if (q.type === 'number') return '숫자를 적어 주세요';
      if (q.type === 'multi') return '하나 이상 골라 주세요';
      if (q.type === 'rank') return '순서대로 눌러 주세요';
      return '하나 골라 주세요';
    }

    if ((q.type === 'single' && v === OTHER) || (Array.isArray(v) && v.indexOf(OTHER) >= 0)) {
      if (!other) return '기타 내용을 적어 주세요';
    }
    if (q.type === 'multi' || q.type === 'rank') {
      var n = v.length;
      if (q.min && n < q.min) return q.min + '개 이상 골라 주세요';
      if (q.max && n > q.max) return q.max + '개까지만 골라 주세요';
    }
    if (q.validate === 'phone-or-email') {
      var cr = contactValue(v);
      if (!cr.ok) {
        if (cr.kind === 'email') return '이메일 주소를 다시 확인해 주세요 (예: name@example.com)';
        if (cr.kind === 'phone') return '휴대폰 번호를 다시 확인해 주세요 (예: 010-1234-5678)';
        return '휴대폰 번호나 이메일 주소로 적어 주세요';
      }
    }
    if (q.type === 'number') {
      if (typeof v !== 'number' || !isFinite(v)) return '숫자로 적어 주세요';
      var lo = q.min, hi = q.max;
      if ((lo !== undefined && v < lo) || (hi !== undefined && v > hi)) {
        if (lo !== undefined && hi !== undefined) return lo + '~' + hi + (q.unit || '') + ' 사이로 적어 주세요';
        if (lo !== undefined) return lo + (q.unit || '') + ' 이상으로 적어 주세요';
        return hi + (q.unit || '') + ' 이하로 적어 주세요';
      }
    }
    return '';
  }

  /** private 문항(닉네임·연락처)의 답만: { key: 값 }. 숨겨졌거나 빈 것은 뺀다. → kind "contact" 로 따로 보낸다 */
  function flattenPrivate(form, state) {
    var out = {};
    visibleList(form, state).forEach(function (q) {
      if (!q.private || q.type === 'info') return;
      var v = state.answers[q.id];
      if (isEmpty(v)) return;
      v = finalValue(q, v);
      if (v === '' || v === null || v === undefined) return;
      out[q.key] = v;
    });
    return out;
  }

  /** 보낼 모양으로: { key: 값 }. 숨겨진 문항 · 빈 답 · info · private(개인정보) 는 뺀다. */
  function flatten(form, state) {
    var out = {};
    visibleList(form, state).forEach(function (q) {
      if (q.type === 'info' || q.private) return;
      var v = state.answers[q.id];
      var other = (state.others[q.id] || '').trim();
      if (q.type === 'rating-grid') {
        (q.items || []).forEach(function (it) {
          if (v && !isEmpty(v[it.id])) out[q.key + ' · ' + it.label] = v[it.id];
        });
        return;
      }
      if (isEmpty(v)) return;
      if (v === OTHER) v = '기타: ' + other;
      else if (Array.isArray(v)) v = v.map(function (x) { return x === OTHER ? '기타: ' + other : x; });
      else v = finalValue(q, v);
      out[q.key] = v;
    });
    return out;
  }

  /* ── 그리기 ─────────────────────────────────────────── */

  var uid = 0;

  /**
   * 문항의 입력 부분만 그린다(문구·설명은 페이지가 그린다).
   * onChange(필요하면 { advance: true }) — 하나 고르기·눈금은 고르면 다음으로 넘어가도 된다는 신호를 준다.
   */
  function render(q, state, onChange) {
    var name = 'q' + (++uid) + '-' + q.id;
    var wrap = el('div', { class: 'ctl ctl-' + q.type, 'data-q': q.id });

    function set(v, extra) {
      if (isEmpty(v)) delete state.answers[q.id]; else state.answers[q.id] = v;
      onChange(extra || {});
    }

    switch (q.type) {
      case 'single': return single();
      case 'multi': return multi();
      case 'scale': return scale();
      case 'rank': return rank();
      case 'rating-grid': return grid();
      case 'select': return select();
      case 'number': return number();
      case 'text': return text(false);
      case 'longtext': return text(true);
      default: return wrap;
    }

    function otherBox(show) {
      var box = el('div', { class: 'other-wrap' });
      var input = el('input', {
        class: 'field', type: 'text', maxlength: '200', autocomplete: 'off',
        placeholder: '직접 적어 주세요', 'aria-label': '기타 내용'
      });
      input.value = state.others[q.id] || '';
      input.addEventListener('input', function () { state.others[q.id] = input.value; onChange({ typing: true }); });
      box.appendChild(input);
      box.hidden = !show;
      box.focusInput = function () { setTimeout(function () { try { input.focus({ preventScroll: false }); } catch (e) { input.focus(); } }, 30); };
      return box;
    }

    function optRow(type, value, label, idx, checked) {
      var input = el('input', { type: type, name: name, value: String(idx) });
      input.checked = !!checked;
      var row = el('label', { class: 'opt' + (type === 'checkbox' ? ' multi' : '') + (checked ? ' on' : '') }, [
        input,
        el('span', { class: 'mark', 'aria-hidden': 'true', html: type === 'checkbox' ? CHECK : '' }),
        el('span', { class: 'txt', text: label }),
        idx < 9 ? el('span', { class: 'key', 'aria-hidden': 'true', text: String(idx + 1) }) : null
      ]);
      row.input = input;
      row.value = value;
      return row;
    }

    function single() {
      var opts = q.options.slice();
      var values = opts.slice();
      if (q.other) { opts.push(OTHER_LABEL); values.push(OTHER); }
      var cur = state.answers[q.id];
      var list = el('div', { class: 'opts', role: 'radiogroup', 'aria-label': q.text });
      var box = q.other ? otherBox(cur === OTHER) : null;
      var rows = values.map(function (val, i) {
        var row = optRow('radio', val, opts[i], i, cur === val);
        row.input.addEventListener('change', function () {
          rows.forEach(function (r) { r.classList.toggle('on', r.input.checked); });
          if (box) { box.hidden = val !== OTHER; if (val === OTHER) box.focusInput(); }
          set(val, { advance: val !== OTHER });
        });
        list.appendChild(row);
        return row;
      });
      wrap.appendChild(list);
      if (box) wrap.appendChild(box);
      wrap.pick = function (i) { if (rows[i]) rows[i].input.click(); };
      return wrap;
    }

    function multi() {
      var opts = q.options.slice();
      var values = opts.slice();
      if (q.other) { opts.push(OTHER_LABEL); values.push(OTHER); }
      var cur = Array.isArray(state.answers[q.id]) ? state.answers[q.id].slice() : [];
      var list = el('div', { class: 'opts', role: 'group', 'aria-label': q.text });
      var box = q.other ? otherBox(cur.indexOf(OTHER) >= 0) : null;
      var counter = el('p', { class: 'counter', 'aria-live': 'polite' });
      var rows = values.map(function (val, i) {
        var row = optRow('checkbox', val, opts[i], i, cur.indexOf(val) >= 0);
        row.input.addEventListener('change', function () {
          var now = Array.isArray(state.answers[q.id]) ? state.answers[q.id].slice() : [];
          if (row.input.checked) { if (now.indexOf(val) < 0) now.push(val); }
          else now = now.filter(function (x) { return x !== val; });
          // 보기 순서대로 정리
          now = values.filter(function (x) { return now.indexOf(x) >= 0; });
          if (box) { box.hidden = now.indexOf(OTHER) < 0; if (val === OTHER && row.input.checked) box.focusInput(); }
          set(now);
          paint();
        });
        list.appendChild(row);
        return row;
      });
      function paint() {
        var now = Array.isArray(state.answers[q.id]) ? state.answers[q.id] : [];
        var full = q.max && now.length >= q.max;
        rows.forEach(function (r) {
          r.classList.toggle('on', r.input.checked);
          var lock = full && !r.input.checked;
          r.input.disabled = !!lock;
          r.classList.toggle('off', !!lock);
        });
        var hint = q.min && q.max ? (q.min === q.max ? q.max + '개 고르기' : q.min + '~' + q.max + '개') : q.max ? '최대 ' + q.max + '개' : q.min ? q.min + '개 이상' : '여러 개 골라도 돼요';
        counter.innerHTML = '';
        counter.appendChild(document.createTextNode(hint + ' · '));
        counter.appendChild(el('b', { text: now.length + '개' }));
        counter.appendChild(document.createTextNode(' 고름'));
      }
      wrap.appendChild(list);
      if (box) wrap.appendChild(box);
      wrap.appendChild(counter);
      paint();
      wrap.pick = function (i) { if (rows[i] && !rows[i].input.disabled) rows[i].input.click(); };
      return wrap;
    }

    function scale() {
      var s = q.scale || { min: 1, max: 5 };
      var lo = Number(s.min), hi = Number(s.max);
      var n = hi - lo + 1;
      var cur = state.answers[q.id];
      var g = el('div', { class: 'scale' + (n > 7 ? ' wrap' : ''), role: 'radiogroup', 'aria-label': q.text, style: '--n:' + n });
      var cells = [];
      for (var v = lo; v <= hi; v++) {
        (function (val, i) {
          var input = el('input', { type: 'radio', name: name, value: String(val) });
          input.checked = cur === val;
          var aria = val === lo && s.minLabel ? val + ' (' + s.minLabel + ')' : val === hi && s.maxLabel ? val + ' (' + s.maxLabel + ')' : String(val);
          input.setAttribute('aria-label', aria);
          var cell = el('label', { class: 'cell' + (cur === val ? ' on' : '') }, [input, el('span', { text: String(val), 'aria-hidden': 'true' })]);
          cell.input = input;
          input.addEventListener('change', function () {
            cells.forEach(function (c) { c.classList.toggle('on', c.input.checked); });
            set(val, { advance: true });
          });
          g.appendChild(cell);
          cells.push(cell);
        })(v, v - lo);
      }
      wrap.appendChild(g);
      if (s.minLabel || s.maxLabel) {
        wrap.appendChild(el('div', { class: 'scale-labels', 'aria-hidden': 'true' }, [
          el('span', { text: (lo + ' ' + (s.minLabel || '')).trim() }),
          el('span', { text: ((s.maxLabel || '') + ' ' + hi).trim() })
        ]));
      }
      wrap.pick = function (i) { if (cells[i]) cells[i].input.click(); };
      return wrap;
    }

    function rank() {
      var opts = q.options.slice();
      var max = q.max || opts.length;
      var live = el('p', { class: 'counter', 'aria-live': 'polite' });
      var list = el('div', { class: 'opts', role: 'group', 'aria-label': q.text + ' — 누른 순서가 순위' });
      var rows = opts.map(function (label, i) {
        var b = el('button', { type: 'button', class: 'opt rank', 'aria-pressed': 'false' }, [
          el('span', { class: 'mark', 'aria-hidden': 'true' }),
          el('span', { class: 'txt', text: label }),
          i < 9 ? el('span', { class: 'key', 'aria-hidden': 'true', text: String(i + 1) }) : null
        ]);
        b.addEventListener('click', function () {
          var now = Array.isArray(state.answers[q.id]) ? state.answers[q.id].slice() : [];
          var at = now.indexOf(label);
          if (at >= 0) now.splice(at, 1);
          else if (now.length < max) now.push(label);
          else return;
          set(now);
          paint();
        });
        list.appendChild(b);
        return b;
      });
      var reset = el('button', { type: 'button', class: 'textlink', text: '처음부터 다시 고르기' });
      reset.addEventListener('click', function () { set([]); paint(); });
      function paint() {
        var now = Array.isArray(state.answers[q.id]) ? state.answers[q.id] : [];
        rows.forEach(function (b, i) {
          var at = now.indexOf(opts[i]);
          var on = at >= 0;
          b.classList.toggle('on', on);
          b.setAttribute('aria-pressed', on ? 'true' : 'false');
          b.querySelector('.mark').textContent = on ? String(at + 1) : '';
          b.classList.toggle('off', !on && now.length >= max);
          b.setAttribute('aria-label', (on ? (at + 1) + '순위 ' : '') + opts[i]);
        });
        live.innerHTML = '';
        live.appendChild(document.createTextNode('누른 순서대로 1순위부터 · '));
        live.appendChild(el('b', { text: now.length + ' / ' + max }));
        reset.hidden = !now.length;
      }
      wrap.appendChild(list);
      var tail = el('div', { style: 'display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap' }, [live, reset]);
      wrap.appendChild(tail);
      paint();
      wrap.pick = function (i) { if (rows[i]) rows[i].click(); };
      return wrap;
    }

    function grid() {
      var cur = (state.answers[q.id] && typeof state.answers[q.id] === 'object') ? state.answers[q.id] : {};
      var opts = q.options;
      var longest = opts.reduce(function (m, o) { return Math.max(m, o.length); }, 0);
      // 한 줄에 몇 칸: 글이 짧으면 한 줄에 전부, 길면 두 칸씩, 아주 길면 한 칸씩 (낱말이 중간에 잘리지 않게)
      var stack = opts.length > 6 || longest > 12;
      var cols = (opts.length <= 3 && longest <= 6) || (opts.length === 4 && longest <= 4) ? opts.length : 2;
      var rowsBox = el('div', { class: 'grid-rows' });
      (q.items || []).forEach(function (it) {
        var nm = name + '-' + it.id;
        var fs = el('fieldset', { class: 'grid-row' });
        fs.appendChild(el('legend', { text: it.label }));
        var body = el('div', { class: 'grid-body' });
        if (it.image) {
          // 화면 캡처는 작은 썸네일로 — 누르면 크게. 파일이 없으면 조용히 글자만.
          var img = el('img', { src: M.root + it.image, alt: '', loading: 'lazy', decoding: 'async' });
          var thumb = el('button', { type: 'button', class: 'thumb', 'aria-label': it.label + ' 화면 크게 보기' }, [img]);
          img.addEventListener('error', function () { thumb.remove(); fs.classList.remove('has-shot'); });
          thumb.addEventListener('click', function () { lightbox(M.root + it.image, it.label); });
          fs.classList.add('has-shot');
          body.appendChild(thumb);
        }
        var seg = el('div', { class: 'seg' + (stack ? ' stack' : ''), style: '--n:' + cols });
        var labels = opts.map(function (o) {
          var input = el('input', { type: 'radio', name: nm, value: o });
          input.checked = cur[it.id] === o;
          var lab = el('label', { class: cur[it.id] === o ? 'on' : '' }, [input, el('span', { text: o })]);
          input.addEventListener('change', function () {
            labels.forEach(function (l) { l.classList.toggle('on', l.firstChild.checked); });
            var next = Object.assign({}, state.answers[q.id] || {});
            next[it.id] = o;
            set(next);
          });
          seg.appendChild(lab);
          return lab;
        });
        body.appendChild(seg);
        fs.appendChild(body);
        rowsBox.appendChild(fs);
      });
      wrap.appendChild(rowsBox);
      return wrap;
    }

    function select() {
      var cur = state.answers[q.id];
      var has = !isEmpty(cur);
      var s = el('select', { class: 'field' + (has ? '' : ' empty'), 'aria-label': q.text });
      s.appendChild(el('option', { value: '', text: q.placeholder || '골라 주세요' }));
      var choices = q.choices || [];
      choices.forEach(function (c, i) {
        var op = el('option', { value: String(i), text: c.label });
        if (has && String(c.v) === String(cur)) op.selected = true;
        s.appendChild(op);
      });
      s.addEventListener('change', function () {
        s.classList.toggle('empty', s.value === '');
        set(s.value === '' ? null : choices[Number(s.value)].v);
      });
      wrap.appendChild(s);
      return wrap;
    }

    function number() {
      var cur = state.answers[q.id];
      var input = el('input', {
        class: 'field', type: 'text', inputmode: 'numeric', autocomplete: 'off', enterkeyhint: 'next',
        pattern: '[0-9]*', placeholder: q.placeholder || (q.min !== undefined && q.max !== undefined ? q.min + '~' + q.max : '숫자'),
        'aria-label': q.text + (q.unit ? ' (' + q.unit + ')' : '')
      });
      if (typeof cur === 'number') input.value = String(cur);
      input.addEventListener('input', function () {
        var raw = input.value.replace(/[^0-9.\-]/g, '');
        if (raw !== input.value) input.value = raw;
        var v = raw === '' ? null : Number(raw);
        set(raw === '' || isNaN(v) ? null : v, { typing: true });
      });
      wrap.appendChild(el('div', { class: 'numfield' }, [input, q.unit ? el('span', { class: 'unit', text: q.unit }) : null]));
      return wrap;
    }

    function text(long) {
      if (!long && q.validate === 'phone-or-email') return contactField();
      var cur = state.answers[q.id] || '';
      var f = el(long ? 'textarea' : 'input', {
        class: 'field', maxlength: String(MAXLEN), autocomplete: 'off', placeholder: q.placeholder || (long ? '편하게 적어 주세요' : ''),
        'aria-label': q.text, rows: long ? '4' : null, type: long ? null : 'text', enterkeyhint: long ? null : 'next'
      });
      f.value = cur;
      if (!long && q.private && q.key === '닉네임') { f.setAttribute('autocomplete', 'nickname'); f.setAttribute('maxlength', '30'); }
      var count = long ? el('p', { class: 'charcount num', 'aria-hidden': 'true' }) : null;
      function grow() {
        if (!long) return;
        f.style.height = 'auto';
        f.style.height = Math.min(Math.max(f.scrollHeight + 2, 132), 420) + 'px';
        count.textContent = f.value.length > MAXLEN * 0.6 ? f.value.length + ' / ' + MAXLEN : '';
      }
      f.addEventListener('input', function () { set(f.value.trim() ? f.value : null, { typing: true }); grow(); });
      wrap.appendChild(f);
      if (count) wrap.appendChild(count);
      setTimeout(grow, 0);
      return wrap;
    }

    /* 연락처 칸: [휴대폰 번호 | 이메일] 을 고르면 폰 키보드가 숫자판/이메일판으로 바뀐다. 어느 쪽에 적어도 검사는 둘 다 받는다. */
    function contactField() {
      var cur = state.answers[q.id] || '';
      var mode = /@/.test(cur) ? 'email' : 'phone';
      var f = el('input', {
        class: 'field', type: 'text', maxlength: '100', autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false',
        enterkeyhint: 'done', 'aria-label': q.text
      });
      f.value = cur;
      var bPhone = el('button', { type: 'button', text: '휴대폰 번호' });
      var bMail = el('button', { type: 'button', text: '이메일' });
      function setMode(m) {
        mode = m;
        f.setAttribute('inputmode', m === 'email' ? 'email' : 'tel');
        f.setAttribute('autocomplete', m === 'email' ? 'email' : 'tel');
        f.placeholder = q.placeholder && m === 'phone' ? q.placeholder : (m === 'email' ? 'name@example.com' : '010-1234-5678');
        bPhone.setAttribute('aria-pressed', m === 'phone' ? 'true' : 'false');
        bMail.setAttribute('aria-pressed', m === 'email' ? 'true' : 'false');
      }
      bPhone.addEventListener('click', function () { setMode('phone'); f.focus(); });
      bMail.addEventListener('click', function () { setMode('email'); f.focus(); });
      setMode(mode);
      f.addEventListener('input', function () {
        if (f.value.indexOf('@') >= 0 && mode !== 'email') setMode('email');
        set(f.value.trim() ? f.value : null, { typing: true });
      });
      f.addEventListener('blur', function () {             // 맞는 꼴이면 보기 좋게 맞춰 준다 (01012345678 → 010-1234-5678)
        var r = contactValue(f.value);
        if (r.ok && r.value !== f.value) { f.value = r.value; set(r.value, { typing: true }); }
      });
      wrap.appendChild(el('div', { class: 'cmode', role: 'group', 'aria-label': '연락 방법' }, [bPhone, bMail]));
      wrap.appendChild(f);
      return wrap;
    }
  }

  /**
   * 되살린 답 정리 — 지금 문항·보기에 없는 값은 버린다.
   * (같은 판(id) 안에서 보기 문구를 고쳤거나 문항을 뺐을 때, 옛 값이 그대로 전송되지 않게)
   */
  function sanitize(form, state) {
    var a = state.answers || {};
    var o = state.others || {};
    Object.keys(a).forEach(function (id) {
      var q = form.byId[id];
      var v = a[id];
      if (!q || q.type === 'info') { delete a[id]; return; }
      var opts = q.options || [];
      var okOpt = function (x) { return (q.other && x === OTHER) || opts.indexOf(x) >= 0; };
      var keep;
      switch (q.type) {
        case 'single': keep = typeof v === 'string' && okOpt(v) ? v : null; break;
        case 'multi': {
          var m = Array.isArray(v) ? v.filter(okOpt) : [];
          if (q.max) m = m.slice(0, q.max);
          keep = m.length ? m : null; break;
        }
        case 'rank': {
          var r = Array.isArray(v) ? v.filter(function (x) { return opts.indexOf(x) >= 0; }) : [];
          if (q.max) r = r.slice(0, q.max);
          keep = r.length ? r : null; break;
        }
        case 'rating-grid': {
          var g = {};
          if (v && typeof v === 'object' && !Array.isArray(v)) {
            (q.items || []).forEach(function (it) { if (opts.indexOf(v[it.id]) >= 0) g[it.id] = v[it.id]; });
          }
          keep = Object.keys(g).length ? g : null; break;
        }
        case 'select': keep = (q.choices || []).some(function (c) { return String(c.v) === String(v); }) ? v : null; break;
        case 'scale': {
          var s = q.scale || {};
          keep = typeof v === 'number' && v >= s.min && v <= s.max ? v : null; break;
        }
        case 'number': keep = typeof v === 'number' && isFinite(v) ? v : null; break;
        default: keep = typeof v === 'string' ? v : null;     // text · longtext
      }
      if (keep === null) delete a[id]; else a[id] = keep;
    });
    Object.keys(o).forEach(function (id) {
      var v = a[id];
      var has = v === OTHER || (Array.isArray(v) && v.indexOf(OTHER) >= 0);
      if (!has) delete o[id];
    });
    state.answers = a;
    state.others = o;
    return state;
  }

  /** 화면 캡처 크게 보기 — 아무 데나 누르거나 Esc 로 닫는다 */
  function lightbox(src, label) {
    var opener = document.activeElement;
    var close = el('button', { type: 'button', class: 'btn small', text: '닫기' });
    var box = el('div', { class: 'lightbox', role: 'dialog', 'aria-modal': 'true', 'aria-label': label + ' 화면' }, [
      el('img', { src: src, alt: label + ' 화면' }),
      el('p', { text: label }),
      close
    ]);
    function done() {
      document.removeEventListener('keydown', onKey);
      if (box.parentNode) box.parentNode.removeChild(box);
      document.documentElement.classList.remove('lock');
      if (opener && opener.focus) opener.focus();
    }
    function onKey(e) { if (e.key === 'Escape') done(); }
    box.addEventListener('click', done);
    document.addEventListener('keydown', onKey);
    document.body.appendChild(box);
    document.documentElement.classList.add('lock');
    close.focus();
  }

  M.Fields = {
    OTHER: OTHER,
    TYPES: TYPES,
    normalize: normalize,
    isVisible: isVisible,
    visibleList: visibleList,
    answered: answered,
    validate: validate,
    flatten: flatten,
    flattenPrivate: flattenPrivate,
    contactValue: contactValue,
    render: render,
    sanitize: sanitize,
    isEmpty: isEmpty
  };
})();
