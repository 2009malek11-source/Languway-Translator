/* Languway Translator — app.js: الواجهة العامة (نوافذ، منتقي اللغات، الأعمدة الجانبية، الملف الشخصي، لغة الواجهة) */
(() => {
  'use strict';
  const LW = window.LW;
  const { $, $$, h, icon, iconBtn, store, toast, LANG, LANGS, dirOf, showView, T } = LW;
  const CONTACT_EMAIL = '';   // ضع بريد التواصل هنا إن رغبت (يُترك فارغاً فلا يظهر زر البريد)

  // أسماء اللغات بالعربية (للبحث والعرض)
  const AR = { en: 'الإنجليزية', ar: 'العربية', fr: 'الفرنسية', es: 'الإسبانية', de: 'الألمانية', it: 'الإيطالية', tr: 'التركية', ru: 'الروسية',
    pt: 'البرتغالية', zh: 'الصينية', ja: 'اليابانية', ko: 'الكورية', hi: 'الهندية', ur: 'الأردية', fa: 'الفارسية', nl: 'الهولندية',
    pl: 'البولندية', sv: 'السويدية', id: 'الإندونيسية', th: 'التايلاندية', vi: 'الفيتنامية', he: 'العبرية', el: 'اليونانية',
    uk: 'الأوكرانية', cs: 'التشيكية', ro: 'الرومانية', bn: 'البنغالية' };
  const EN = { en: 'English', ar: 'Arabic', fr: 'French', es: 'Spanish', de: 'German', it: 'Italian', tr: 'Turkish', ru: 'Russian',
    pt: 'Portuguese', zh: 'Chinese', ja: 'Japanese', ko: 'Korean', hi: 'Hindi', ur: 'Urdu', fa: 'Persian', nl: 'Dutch',
    pl: 'Polish', sv: 'Swedish', id: 'Indonesian', th: 'Thai', vi: 'Vietnamese', he: 'Hebrew', el: 'Greek',
    uk: 'Ukrainian', cs: 'Czech', ro: 'Romanian', bn: 'Bengali' };
  const dispNames = {};
  const cap = (s, l) => s.charAt(0).toLocaleUpperCase(l) + s.slice(1);
  function lname(c) {
    if (c === 'auto') return T('كشف تلقائي');
    const l = LW.i18n.lang;
    if (l === 'ar') return AR[c] || (LANG[c] && LANG[c].name) || c;
    if (l === 'en') return EN[c] || (LANG[c] && LANG[c].name) || c;
    try {
      const dn = dispNames[l] || (dispNames[l] = new Intl.DisplayNames([l], { type: 'language' }));
      const r = dn.of(c);
      if (r && r !== c) return cap(r, l);
    } catch { /* المتصفح لا يدعم Intl.DisplayNames */ }
    return EN[c] || (LANG[c] && LANG[c].name) || c;
  }
  LW.lname = lname;
  const norm = s => String(s).toLowerCase().replace(/[ً-ٰٟ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي');
  const matchLang = (c, q) => !q || [c, LANG[c] && LANG[c].name, AR[c], EN[c], lname(c)].some(x => x && norm(x).includes(q));
  const POPULAR = ['ar', 'en', 'fr', 'es', 'de', 'zh'];

  /* ---------- 1) النوافذ ---------- */
  let lastFocus = null;
  function openModal(id) {
    const m = $('#mdl-' + id);
    if (!m) return;
    lastFocus = document.activeElement;
    m.hidden = false;
    document.body.classList.add('modal-open');
    document.dispatchEvent(new CustomEvent('lw-modal', { detail: { id, open: true } }));
    const f = m.querySelector('.drop, textarea, input:not([type=file]):not([type=checkbox]), .mic-big, .modal-h .icon-btn');
    setTimeout(() => { try { (f || m.querySelector('button')).focus({ preventScroll: true }); } catch { /* تجاهل */ } }, 30);
  }
  function closeModal(m) {
    if (!m || m.hidden) return;
    m.hidden = true;
    if (!$$('.modal').some(x => !x.hidden)) document.body.classList.remove('modal-open');
    document.dispatchEvent(new CustomEvent('lw-modal', { detail: { id: m.id.replace('mdl-', ''), open: false } }));
    if (lastFocus && lastFocus.focus) try { lastFocus.focus({ preventScroll: true }); } catch { /* تجاهل */ }
  }
  function wireModals() {
    $$('[data-open]').forEach(b => b.addEventListener('click', () => openModal(b.dataset.open)));
    $$('.modal [data-close]').forEach(b => b.addEventListener('click', () => closeModal(b.closest('.modal'))));
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') { const open = $$('.modal').filter(m => !m.hidden).pop(); if (open) { e.preventDefault(); closeModal(open); } }
      if (e.key === 'Tab') {   // حبس التركيز داخل النافذة
        const open = $$('.modal').filter(m => !m.hidden).pop();
        if (!open) return;
        const f = $$('button, input, select, textarea, [tabindex="0"], a[href]', open.querySelector('.modal-box')).filter(x => !x.disabled && !x.closest('[hidden]') && x.type !== 'file' && x.offsetParent !== null);
        if (!f.length) return;
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });
    LW.openModal = openModal; LW.closeModal = id => closeModal($('#mdl-' + id));
  }

  /* ---------- 2) منتقي اللغات القابل للبحث ---------- */
  const pickers = [];
  let openPicker = null;
  function closePicker() { if (!openPicker) return; openPicker.pop.remove(); openPicker.btn.setAttribute('aria-expanded', 'false'); openPicker = null; }
  function buildPicker(sel) {
    const wrap = h('div', { class: 'lp-wrap' });
    const label = h('span', { class: 'lp-name' });
    const code = h('span', { class: 'lp-code', dir: 'ltr' });
    const btn = h('button', { type: 'button', class: 'lp-btn', 'aria-haspopup': 'listbox', 'aria-expanded': 'false' },
      h('span', { class: 'lp-l' }, label, code), icon('down'));
    const labEl = $('label[for="' + sel.id + '"]');
    if (labEl) { if (!labEl.id) labEl.id = 'lb-' + sel.id; btn.setAttribute('aria-labelledby', labEl.id); }
    btn.removeAttribute('aria-label');
    sel.after(wrap); wrap.append(btn);
    const sync = () => {
      const v = sel.value;
      label.textContent = lname(v);
      code.textContent = v === 'auto' ? '' : v.toUpperCase();
    };
    const open = () => {
      closePicker();
      const q = h('input', { type: 'search', placeholder: T('ابحث عن لغة…'), 'aria-label': T('ابحث عن لغة'), autocomplete: 'off' });
      const list = h('div', { class: 'lp-list', role: 'listbox' });
      const pop = h('div', { class: 'lp-pop' }, q, list);
      const fill = () => {
        const nq = norm(q.value.trim());
        const codes = [...sel.options].map(o => o.value).filter(c => c === 'auto' || matchLang(c, nq));
        list.replaceChildren(...codes.map(c => h('button', { type: 'button', role: 'option', class: 'lp-opt', 'aria-selected': String(c === sel.value),
          onclick: () => { sel.value = c; sel.dispatchEvent(new Event('change', { bubbles: true })); sync(); closePicker(); btn.focus(); } },
          h('span', {}, lname(c)), h('small', { dir: 'ltr', 'data-i18n-skip': '' }, c === 'auto' ? '' : (LANG[c] ? LANG[c].name : '')))));
        if (!codes.length) list.replaceChildren(h('p', { class: 's-empty' }, T('لا توجد لغة مطابقة.')));
      };
      q.addEventListener('input', fill);
      q.addEventListener('keydown', e => {
        if (e.key === 'Escape') { e.stopPropagation(); closePicker(); btn.focus(); }
        else if (e.key === 'Enter') { const f = list.querySelector('.lp-opt'); if (f) { e.preventDefault(); f.click(); } }
        else if (e.key === 'ArrowDown') { const f = list.querySelector('.lp-opt'); if (f) { e.preventDefault(); f.focus(); } }
      });
      list.addEventListener('keydown', e => {
        const items = $$('.lp-opt', list), i = items.indexOf(document.activeElement);
        if (e.key === 'ArrowDown' && items[i + 1]) { e.preventDefault(); items[i + 1].focus(); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); (items[i - 1] || q).focus(); }
        else if (e.key === 'Escape') { e.stopPropagation(); closePicker(); btn.focus(); }
      });
      fill();
      wrap.append(pop);
      btn.setAttribute('aria-expanded', 'true');
      openPicker = { pop, btn };
      q.focus({ preventScroll: true });
      const cur = list.querySelector('[aria-selected="true"]'); if (cur) cur.scrollIntoView({ block: 'nearest' });
    };
    btn.addEventListener('click', () => (openPicker && openPicker.btn === btn ? closePicker() : open()));
    sel.addEventListener('change', sync);
    pickers.push(sync);
    sync();
  }
  function wirePickers() {
    $$('select.lp').forEach(buildPicker);
    // أي تغيير في أي منتقٍ يضبط اللغتين في كل التطبيق
    $$('select.lp').forEach(sel => sel.addEventListener('change', () => {
      const bar = sel.closest('.tlang');
      const s = $('select[data-role="src"]', bar), t = $('select[data-role="tgt"]', bar);
      if (s && t) LW.setLangs(s.value, t.value);
    }));
    $$('[data-swap]').forEach(b => b.addEventListener('click', () => LW.swapLangs()));
    document.addEventListener('pointerdown', e => { if (openPicker && !e.target.closest('.lp-wrap')) closePicker(); });
    LW.onLangs(() => { pickers.forEach(f => f()); renderPopular(); });
  }

  /* ---------- 3) اللغات الأكثر استخداماً + نافذة كل اللغات ---------- */
  function renderPopular() {
    const tgt = LW.settings().tgt;
    $('#popLangs').replaceChildren(...POPULAR.map(c => h('button', { type: 'button', class: 'pop', 'aria-pressed': String(c === tgt), title: T('الترجمة إلى {l}', { l: lname(c) }),
      onclick: () => { if (LW.settings().src === c) LW.swapLangs(); else LW.setLangs(null, c); toast(T('لغة الترجمة: {l}', { l: lname(c) })); } },
      lname(c), h('small', { dir: 'ltr', 'data-i18n-skip': '' }, LANG[c].name))));
  }
  let lmAs = 'tgt';
  function renderAllLangs() {
    const q = norm($('#lmSearch').value.trim());
    const cur = LW.settings()[lmAs];
    const codes = LANGS.map(l => l[0]).filter(c => matchLang(c, q));
    $('#lmList').replaceChildren(...(codes.length ? codes.map(c => h('button', { type: 'button', role: 'option', class: 'lp-opt', 'aria-selected': String(c === cur),
      onclick: () => {
        if (lmAs === 'src') LW.setLangs(c, null); else LW.setLangs(null, c);
        LW.closeModal('langs');
      } }, h('span', {}, lname(c)), h('small', { dir: 'ltr', 'data-i18n-skip': '' }, LANG[c].name))) : [h('p', { class: 's-empty' }, T('لا توجد لغة مطابقة.'))]));
  }
  function wireAllLangs() {
    $('#allLangs').addEventListener('click', () => { $('#lmSearch').value = ''; renderAllLangs(); openModal('langs'); });
    $('#lmSearch').addEventListener('input', renderAllLangs);
    $$('.lm-seg [data-as]').forEach(b => b.addEventListener('click', () => {
      lmAs = b.dataset.as;
      $$('.lm-seg [data-as]').forEach(x => { const on = x === b; x.setAttribute('aria-checked', String(on)); x.setAttribute('aria-selected', String(on)); });
      renderAllLangs();
    }));
    renderPopular();
  }

  /* ---------- 4) الأعمدة الجانبية: السجل والمفضلة ---------- */
  const ago = ts => {
    const m = Math.round((Date.now() - ts) / 60000);
    if (m < 1) return T('الآن');
    if (m < 60) return T('قبل {n} د', { n: m });
    const hr = Math.round(m / 60);
    if (hr < 24) return T('قبل {n} س', { n: hr });
    return T('قبل {n} يوم', { n: Math.round(hr / 24) });
  };
  function sideItem(src, out, meta, onOpen, acts) {
    return h('div', { class: 's-item', role: 'button', tabindex: '0', onclick: e => { if (!e.target.closest('.s-acts')) onOpen(); },
      onkeydown: e => { if ((e.key === 'Enter' || e.key === ' ') && !e.target.closest('.s-acts')) { e.preventDefault(); onOpen(); } } },
      h('div', { class: 's-body' }, h('p', { class: 's-src', dir: 'auto' }, src), h('p', { class: 's-out', dir: 'auto' }, out), h('p', { class: 's-meta' }, meta)),
      h('div', { class: 's-acts' }, acts));
  }
  function renderSideHist() {
    const tr = LW.tr;
    if (!tr) return;
    const note = $('#sideHistNote');
    const priv = tr.privateOn(), off = LW.settings().saveTrHistory === false;
    note.textContent = priv ? (T('الوضع الخاص مفعّل: لا يُحفظ شيء جديد.'))
      : off ? (T('حفظ السجل متوقف من الإعدادات.'))
      : (T('يُحفظ على هذا الجهاز فقط.'));
    const hist = tr.getHist().slice(0, 5);
    $('#sideHistClear').hidden = !tr.getHist().length;
    $('#sideHistAll').hidden = !tr.getHist().length;
    $('#sideHist').replaceChildren(...(hist.length ? hist.map(x => sideItem(x.text, x.out, `${lname(x.src)} ← ${lname(x.tgt)} · ${ago(x.ts)}`, () => tr.openEntry(x), [
      iconBtn('copy', T('نسخ الترجمة'), () => LW.copyText(x.out)),
      iconBtn('trash', T('حذف'), () => { tr.putHist(tr.getHist().filter(z => z.id !== x.id)); })
    ])) : [h('p', { class: 's-empty' }, T('لا توجد ترجمات بعد. ستظهر هنا ترجماتك الأخيرة.'))]));
  }
  function renderSideFavs() {
    const favs = LW.fav.list().slice(0, 4);
    $('#sideFavsAll').hidden = !LW.fav.list().length;
    $('#sideFavs').replaceChildren(...(favs.length ? favs.map(f => sideItem(f.text, f.translation, `${lname(f.src)} ← ${lname(f.tgt)}`, () => {
      LW.setLangs(f.src, f.tgt); showView('translate'); if (LW.viewHooks.openInTranslator) LW.viewHooks.openInTranslator(f.text, true);
    }, [iconBtn('trash', T('إزالة من المفضلة'), () => LW.fav.remove(f))])) :
      [h('p', { class: 's-empty' }, T('اضغط النجمة تحت أي ترجمة لحفظها هنا.'))]));
  }
  function wireSide() {
    $('#sideHistClear').addEventListener('click', () => LW.confirmThen(T('حذف كل الترجمات المحفوظة (بما فيها المثبّتة)؟'), () => { LW.tr.putHist([]); toast(T('تم مسح السجل')); }));
    $('#sideHistAll').addEventListener('click', () => showView('history'));
    $('#sideFavsAll').addEventListener('click', () => showView('favs'));
    document.addEventListener('lw-store', e => {
      if (e.detail === 'thist' || e.detail === 'settings') renderSideHist();
      if (e.detail === 'favs') renderSideFavs();
    });
    LW.onSettings(renderSideHist);
    renderSideHist(); renderSideFavs();
  }

  /* ---------- 5) توسيع المترجم ---------- */
  function wireExpand() {
    const b = $('#tExpand');
    const apply = on => {
      $('#translator').classList.toggle('xwide', on);
      $('#homeGrid').classList.toggle('xwide', on);
      b.setAttribute('aria-pressed', String(on));
      store.set('tExpand', on);
    };
    b.addEventListener('click', () => apply(b.getAttribute('aria-pressed') !== 'true'));
    if (store.get('tExpand', false)) apply(true);
  }

  /* ---------- 6) الملف الشخصي والنسخ الاحتياطي ---------- */
  const BK_KEYS = ['settings', 'thist', 'favs', 'best', 'stats', 'pname', 'history', 'tExpand'];
  function renderProfile() {
    const name = (store.get('pname', '') || '').trim();
    $('#profState').textContent = name || (T('زائر'));
    $('#profName').value = name;
    const av = $('#profAvatar');
    if (name) av.textContent = [...name][0].toUpperCase(); else av.replaceChildren(icon('user'));
    const st = store.get('stats', { total: 0 });
    const stat = (n, t) => h('div', { class: 'stat' }, h('b', {}, String(n)), h('span', {}, t));
    $('#profStats').replaceChildren(stat(LW.tr ? LW.tr.getHist().length : 0, T('ترجمة محفوظة')), stat(LW.fav.list().length, T('عنصر في المفضلة')), stat(st.total || 0, T('عملية')));
  }
  function wireProfile() {
    $('#profName').addEventListener('input', () => { store.set('pname', $('#profName').value.trim().slice(0, 40)); const n = $('#profName').value.trim(); $('#profState').textContent = n || (T('زائر')); const av = $('#profAvatar'); if (n) av.textContent = [...n][0].toUpperCase(); else av.replaceChildren(icon('user')); });
    LW.viewHooks.profile = renderProfile;
    $('#bkExport').addEventListener('click', () => {
      const data = { app: 'languway', v: 1, ts: new Date().toISOString(), data: {} };
      BK_KEYS.forEach(k => { const v = store.get(k, undefined); if (v !== undefined) data.data[k] = v; });
      LW.downloadBlob(new Blob([JSON.stringify(data)], { type: 'application/json' }), 'languway-backup.json');
      toast(T('تم تنزيل ملف النسخة الاحتياطية'));
    });
    $('#bkImport').addEventListener('click', () => $('#bkFile').click());
    $('#bkFile').addEventListener('change', e => {
      const f = e.target.files[0]; e.target.value = '';
      if (!f) return;
      if (f.size > 5e6) { toast(T('الملف كبير جداً')); return; }
      const r = new FileReader();
      r.onload = () => {
        try {
          const j = JSON.parse(r.result);
          if (!j || j.app !== 'languway' || typeof j.data !== 'object') throw new Error('bad');
          LW.confirmThen(T('سيستبدل الاستيراد السجل والمفضلة والإعدادات الحالية على هذا الجهاز. متابعة؟'), () => {
            BK_KEYS.forEach(k => { if (k in j.data) store.set(k, j.data[k]); });
            location.reload();
          });
        } catch { toast(T('هذا ليس ملف نسخة احتياطية صالحاً')); }
      };
      r.readAsText(f);
    });
    $$('[data-go]').forEach(b => b.addEventListener('click', () => showView(b.dataset.go)));
  }

  /* ---------- 7) صفحات التذييل والتواصل ---------- */
  function wirePages() {
    $$('[data-page]').forEach(b => b.addEventListener('click', () => showView(b.dataset.page)));
    $('#yr').textContent = String(new Date().getFullYear());
    const m = $('#contactMail');
    if (CONTACT_EMAIL) { m.href = 'mailto:' + CONTACT_EMAIL; m.hidden = false; }
    $('#contactShare').addEventListener('click', () => LW.shareText(T('جرّب Languway Translator — مترجم مجاني:')));
    $('#logoLink').addEventListener('click', e => { e.preventDefault(); showView('translate'); });
  }

  /* ---------- 8) لغة الواجهة (المحرك في i18n.js) ---------- */
  function wireUiLang() {
    const sel = $('#uiLang');
    sel.replaceChildren(...LW.i18n.LANGS.map(l => h('option', { value: l.code, 'data-i18n-skip': '' }, l.name)));
    sel.value = LW.i18n.lang;
    sel.addEventListener('change', async () => { if (!(await LW.i18n.setLang(sel.value))) sel.value = LW.i18n.lang; });
    // إعادة رسم العناصر المبنية بالجافاسكربت عند تغيّر اللغة
    document.addEventListener('lw-uilang', () => {
      sel.value = LW.i18n.lang;
      pickers.forEach(f => f()); renderPopular(); renderSideHist(); renderSideFavs(); renderProfile();
    });
  }

  /* ---------- التهيئة ---------- */
  async function init() {
    wireModals();
    wirePickers();
    wireAllLangs();
    wireSide();
    wireExpand();
    wireProfile();
    wirePages();
    wireUiLang();
    renderProfile();
    const saved = store.get('uiLang', 'ar');
    if (saved !== 'ar') await LW.i18n.setLang(saved, true);
  }
  document.addEventListener('DOMContentLoaded', init);
})();
