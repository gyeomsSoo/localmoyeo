/* 사장님 소개 (/owner/) — content/owner-intro.json (SCHEMA §4) 을 큰 글씨로 그린다 */
(function () {
  'use strict';
  var M = window.Moyeo;
  var el = M.el;
  var main = M.$('#main');

  M.visit('사장님 소개 방문');

  var demo = new M.Trial({
    entry: 'owner',
    forceOverlay: true,
    nowPrefix: '사장님 화면 ·',
    endLabel: '다 봤어요, 돌아가기',
    onEnd: function () { if (history.state && history.state.moyeo === 'trial') history.back(); }
  });

  var CHECK = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';

  /** 겸수님이 채울 자리({이름} 같은)가 그대로면 보여 주지 않는다 */
  function filled(v) { return typeof v === 'string' && v.trim() && !/^\{.*\}$/.test(v.trim()); }

  function ctaBlock(c) {
    var b = el('button', { type: 'button', class: 'btn primary block', html: (c.label || '사장님 화면 둘러보기') + ' <span class="arrow">→</span>' });
    b.addEventListener('click', function () { demo.open(); });
    return el('div', { class: 'ow-cta' }, [b, c.note ? el('p', { class: 'note', text: c.note }) : null]);
  }

  function draw(c) {
    main.innerHTML = '';
    var cta = c.cta || {};

    main.appendChild(el('section', { class: 'ow-hero' }, [
      el('p', { class: 'ow-eyebrow', text: '동네 가게 사장님께' }),
      el('h1', { text: c.title || '사장님, 동네모여를 소개합니다' }),
      c.lead ? el('p', { class: 'ow-lead', text: c.lead }) : null,
      ctaBlock(cta)
    ]));

    if (c.steps && c.steps.length) {
      var ol = el('ol', { class: 'ow-steps' });
      c.steps.forEach(function (s, i) {
        ol.appendChild(el('li', {}, [
          el('span', { class: 'no', 'aria-hidden': 'true', text: String(i + 1) }),
          el('div', {}, [el('h3', {}, [el('span', { class: 'sr-only', text: (i + 1) + '단계: ' }), s.title || '']), s.body ? el('p', { text: s.body }) : null])
        ]));
      });
      main.appendChild(el('section', { class: 'ow-sec', 'aria-labelledby': 'h-steps' }, [el('h2', { id: 'h-steps', text: '이렇게 돌아가요' }), ol]));
    }

    if (c.points && c.points.length) {
      var ul = el('ul', { class: 'ow-points' });
      c.points.forEach(function (p) {
        ul.appendChild(el('li', {}, [
          el('span', { class: 'ck', html: CHECK }),
          el('div', {}, [el('h3', { text: p.title || '' }), p.body ? el('p', { text: p.body }) : null])
        ]));
      });
      main.appendChild(el('section', { class: 'ow-sec', 'aria-labelledby': 'h-points' }, [el('h2', { id: 'h-points', text: '사장님께 좋은 점' }), ul]));
    }

    if (c.faq && c.faq.length) {
      var faq = el('div', { class: 'ow-faq' });
      c.faq.forEach(function (f) {
        faq.appendChild(el('details', {}, [
          el('summary', {}, [el('span', { class: 'q', 'aria-hidden': 'true', text: 'Q' }), el('span', { class: 't', text: f.q || '' }), el('span', { class: 'pm', 'aria-hidden': 'true' })]),
          el('p', { class: 'a', text: f.a || '' })
        ]));
      });
      main.appendChild(el('section', { class: 'ow-sec', 'aria-labelledby': 'h-faq' }, [el('h2', { id: 'h-faq', text: '자주 물으시는 것' }), faq]));
    }

    main.appendChild(el('section', { class: 'ow-sec' }, [ctaBlock(cta)]));

    // 연락: 전화(tel: · sms:) 와 인스타그램. 둘 중 하나만 있어도, 둘 다 없어도 깨지지 않는다.
    // {중괄호} 자리표시가 그대로인 칸은 숨긴다.
    var ct = c.contact || {};
    var phone = filled(ct.phone) ? String(ct.phone).trim() : '';
    var digits = phone.replace(/[^0-9+]/g, '');
    var handle = filled(ct.instagram) ? String(ct.instagram).trim().replace(/^@/, '') : '';
    if (handle && !/^[A-Za-z0-9._]{1,30}$/.test(handle)) handle = '';
    if (digits.length < 8) { phone = ''; digits = ''; }

    if (phone || handle) {
      var IG = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.3" cy="6.7" r="1" fill="currentColor" stroke="none"/></svg>';
      var rows = el('div', { class: 'ways' });
      if (phone) {
        rows.appendChild(el('div', { class: 'way' }, [
          el('p', { class: 'label', text: '전화 · 문자' }),
          el('p', { class: 'val num', text: phone }),
          el('div', { class: 'acts' }, [
            el('a', { class: 'btn primary', href: 'tel:' + digits, text: '전화하기' }),
            el('a', { class: 'btn line', href: 'sms:' + digits, text: '문자 보내기' })
          ])
        ]));
      }
      if (handle) {
        rows.appendChild(el('div', { class: 'way' }, [
          el('p', { class: 'label', text: '인스타그램' }),
          el('p', { class: 'val', text: '@' + handle }),
          el('a', {
            class: 'btn line block', href: 'https://www.instagram.com/' + encodeURIComponent(handle) + '/',
            target: '_blank', rel: 'noopener noreferrer', html: IG + '인스타그램 열기'
          })
        ]));
      }
      main.appendChild(el('section', { class: 'ow-contact', 'aria-labelledby': 'h-contact' }, [
        el('h2', { id: 'h-contact', text: '연락처' }),
        filled(ct.name) ? el('p', { class: 'who', text: ct.name }) : null,
        ct.note ? el('p', { class: 'note', text: ct.note }) : null,
        rows
      ]));
    } else {
      console.warn('[사장님 소개] contact 에 보여 줄 전화·인스타그램이 없어 연락처 칸을 숨겼어요.');
    }
  }

  M.loadContent('owner-intro').then(draw).catch(function (err) {
    console.warn('[사장님 소개] 문구를 못 불러왔어요', err);
    main.innerHTML = '';
    main.appendChild(el('section', { class: 'ow-hero' }, [
      el('h1', { text: '사장님, 동네모여를 소개합니다' }),
      el('p', { class: 'ow-lead', text: '안내 문구를 준비하고 있어요. 잠시 뒤에 다시 열어 주세요.' }),
      ctaBlock({ label: '사장님 화면 둘러보기' })
    ]));
  });
})();
