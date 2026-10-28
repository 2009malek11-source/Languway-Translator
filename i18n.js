/* Languway Translator — i18n.js: لغة الواجهة.
   النصوص المصدر في الكود والصفحة عربية. القاموس لكل لغة في ملف i18n-<رمز>.js:
   window.LW_I18N.<رمز> = { map: { 'نص عربي': 'translation' }, rx: [ ['^regex$', 'قالب $1'] ] }
   الـ rx: القالب يستعمل $1 $2 … لمجموعات التعبير (وتُترجم المجموعة نفسها إن وُجدت في map). */
(() => {
  'use strict';
  const LW = window.LW;
  const { store } = LW;

  const LANGS = [
    { code: 'ar', name: 'العربية', dir: 'rtl' },
    { code: 'en', name: 'English', dir: 'ltr' },
    { code: 'fr', name: 'Français', dir: 'ltr' },
    { code: 'es', name: 'Español', dir: 'ltr' },
    { code: 'de', name: 'Deutsch', dir: 'ltr' },
    { code: 'tr', name: 'Türkçe', dir: 'ltr' },
    { code: 'ru', name: 'Русский', dir: 'ltr' }
  ];
  const ATTRS = ['placeholder', 'aria-label', 'title', 'alt'];
  const hasAr = s => /[؀-ۿ]/.test(s);
  const S = { lang: 'ar', map: null, rx: [], obs: null, orig: new WeakMap(), origAttr: new WeakMap(), loading: null };
  const baseTitle = document.title;
  const descEl = document.querySelector('meta[name="description"]');
  const baseDesc = descEl ? descEl.getAttribute('content') : '';

  const fill = (s, v) => (v ? s.replace(/\{(\w+)\}/g, (m, k) => (k in v ? v[k] : m)) : s);

  /** ترجمة نص عربي إلى لغة الواجهة الحالية (مع متغيرات {name}). */
  function lookup(t) {
    let r = S.map.get(t);
    if (r !== undefined) return r;
    for (const [re, tpl] of S.rx) {
      const m = t.match(re);
      if (m) return tpl.replace(/\$(\d)/g, (x, i) => { const g = m[+i] || ''; const gm = S.map.get(g); return gm !== undefined ? gm : g; });
    }
    return undefined;
  }
  const T = (ar, vars) => {
    if (S.lang === 'ar' || !S.map) return fill(ar, vars);
    const r = S.map.get(ar);
    return fill(r === undefined ? ar : r, vars);
  };
  function trStr(s) {
    const m0 = s.match(/^(\s*)([\s\S]*?)(\s*)$/);
    const t = m0[2].replace(/\s+/g, ' ');
    if (!t || !hasAr(t)) return s;
    const r = lookup(t);
    return r === undefined ? s : m0[1] + r + m0[3];
  }

  function applyNode(root) {
    const on = S.lang !== 'ar';
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = []; let n;
    while ((n = walker.nextNode())) nodes.push(n);
    for (const t of nodes) {
      const p = t.parentElement;
      if (!p || p.closest('script,style,[data-i18n-skip],textarea')) continue;
      if (on) {
        if (!S.orig.has(t)) { if (!hasAr(t.nodeValue)) continue; S.orig.set(t, t.nodeValue); }
        const v = trStr(S.orig.get(t));
        if (t.nodeValue !== v) t.nodeValue = v;
      } else if (S.orig.has(t)) { t.nodeValue = S.orig.get(t); S.orig.delete(t); }
    }
    const els = root.nodeType === 1 ? [root, ...root.querySelectorAll('*')] : [...root.querySelectorAll('*')];
    for (const e of els) {
      if (e.closest('[data-i18n-skip]')) continue;
      for (const a of ATTRS) {
        if (!e.hasAttribute(a)) continue;
        let o = S.origAttr.get(e);
        if (on) {
          const cur = e.getAttribute(a);
          if (!o) { o = {}; S.origAttr.set(e, o); }
          if (!(a in o)) { if (!hasAr(cur)) continue; o[a] = cur; }
          const v = trStr(o[a]);
          if (cur !== v) e.setAttribute(a, v);
        } else if (o && a in o) { e.setAttribute(a, o[a]); delete o[a]; }
      }
    }
  }

  function watch(on) {
    if (S.obs) { S.obs.disconnect(); S.obs = null; }
    if (!on) return;
    let busy = false;
    const opts = { childList: true, subtree: true, characterData: true };
    S.obs = new MutationObserver(muts => {
      if (busy) return; busy = true;
      S.obs.disconnect();
      try {
        for (const m of muts) {
          if (m.type === 'childList') m.addedNodes.forEach(x => { if (x.nodeType === 1) applyNode(x); else if (x.nodeType === 3 && x.parentElement) applyNode(x.parentElement); });
          else if (m.type === 'characterData' && m.target.parentElement) { S.orig.delete(m.target); applyNode(m.target.parentElement); }
        }
      } finally { S.obs.observe(document.body, opts); busy = false; }
    });
    S.obs.observe(document.body, opts);
  }

  function loadDict(code) {
    const have = () => (window.LW_I18N || {})[code];
    if (have()) return Promise.resolve(have());
    return new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = `i18n-${code}.js`;
      s.onload = () => (have() ? res(have()) : rej(new Error('empty')));
      s.onerror = () => rej(new Error('load'));
      document.head.append(s);
    });
  }

  /** تغيير لغة الواجهة. يعيد true عند النجاح. */
  async function setLang(code, first) {
    const meta = LANGS.find(l => l.code === code) || LANGS[0];
    let ok = true;
    if (meta.code !== 'ar') {
      try {
        const D = await loadDict(meta.code);
        S.map = new Map(Object.entries(D.map));
        S.rx = (D.rx || []).map(([re, tpl]) => [new RegExp(re), tpl]);
      } catch { ok = false; }
    }
    if (!ok) { LW.toast('تعذّر تحميل لغة الواجهة. تحقق من الاتصال ثم أعد المحاولة.'); return false; }
    S.lang = meta.code;
    store.set('uiLang', meta.code);
    const de = document.documentElement;
    de.lang = meta.code; de.dir = meta.dir;
    watch(false);
    if (meta.code !== 'ar' || !first) applyNode(document.body);
    watch(meta.code !== 'ar');
    document.title = T(baseTitle);
    if (descEl) descEl.setAttribute('content', T(baseDesc));
    document.dispatchEvent(new CustomEvent('lw-uilang', { detail: meta.code }));
    return true;
  }

  LW.T = T;
  LW.i18n = { LANGS, setLang, get lang() { return S.lang; } };
})();
