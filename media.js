/* Languway Translator — media.js: ترجمة الصور (قراءة النص بالذكاء الاصطناعي) وترجمة المستندات داخل المتصفح */
(() => {
  'use strict';
  const LW = window.LW;
  const { $, $$, h, icon, iconBtn, toast, LANG, dirOf, speak, downloadBlob, detect } = LW;
  const TR = () => LW.tr;
  const st = LW.settings();
  const T = LW.T;
  const MB = 1024 * 1024;
  const MAX_FILE = 10 * MB, MAX_CHARS = 40000, MAX_IMG = 10 * MB;
  const fmtSize = n => (n >= MB ? (n / MB).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB');
  const RTL_L = new Set(['ar', 'fa', 'ur', 'he']);
  const baseName = n => n.replace(/\.[^.]+$/, '').replace(/[^\p{L}\p{N}_ -]+/gu, '_').slice(0, 60) || 'file';

  /* ======================= 1) الصور ======================= */
  async function ocrImage(dataUrl) {
    const prompt = 'Transcribe ALL the text visible in this image exactly as written, in its original language and script, keeping line breaks. Do not translate, explain, describe or add anything. If there is no readable text, reply with exactly NO_TEXT.';
    const body = JSON.stringify({ model: 'openai', temperature: 0, private: true,
      messages: [{ role: 'user', content: [{ type: 'text', text: prompt }, { type: 'image_url', image_url: { url: dataUrl } }] }] });
    const d = await LW.getJSON('https://text.pollinations.ai/openai', { method: 'POST', headers: { 'content-type': 'application/json' }, body }, 70000);
    const t = d && d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content;
    if (typeof t !== 'string') throw new Error('empty');
    let s = t.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/, '').trim();
    if (!s || /^NO_TEXT\.?$/i.test(s)) return '';
    return s;
  }
  async function toDataUrl(blob, maxSide = 1600) {
    let bmp;
    try { bmp = await createImageBitmap(blob); }
    catch {
      bmp = await new Promise((res, rej) => { const u = URL.createObjectURL(blob); const im = new Image(); im.onload = () => { URL.revokeObjectURL(u); res(im); }; im.onerror = () => { URL.revokeObjectURL(u); rej(new Error('img')); }; im.src = u; });
    }
    const w0 = bmp.width || bmp.naturalWidth, h0 = bmp.height || bmp.naturalHeight;
    if (!w0 || !h0) throw new Error('img');
    const k = Math.min(1, maxSide / Math.max(w0, h0));
    const c = document.createElement('canvas');
    c.width = Math.round(w0 * k); c.height = Math.round(h0 * k);
    const g = c.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
    g.drawImage(bmp, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.86);
  }

  const IM = { url: '', busy: 0, stream: null, pane: null, ctx: null, histId: null };
  function imgPane() {
    if (IM.pane) return IM.pane;
    IM.pane = TR().outPane({ out: $('#iOut'), foot: $('#iFoot'), label: $('#iOutLabel'), onRetry: () => imgTranslate() });
    IM.pane.clear(T('ستظهر الترجمة هنا'));
    return IM.pane;
  }
  const iStatus = (m, bad) => { const s = $('#iStatus'); s.textContent = m || ''; s.classList.toggle('bad', !!bad); };
  function imgReset() {
    stopCamera();
    IM.url = ''; IM.busy++; 
    $('#imgWork').hidden = true; $('#imgDrop').hidden = false;
    $('#iText').value = ''; $('#iCount').textContent = '0 / 5,000'; $('#imgPrev').removeAttribute('src');
    iStatus('');
    imgPane().clear(T('ستظهر الترجمة هنا'));
  }
  async function imgLoad(file) {
    if (!file) return;
    if (!/^image\/(png|jpe?g|webp|gif|bmp)$/i.test(file.type)) { toast(T('الصيغ المدعومة: PNG وJPG وWEBP وGIF وBMP')); return; }
    if (file.size > MAX_IMG) { toast(T('الصورة أكبر من 10 ميغابايت')); return; }
    try { IM.url = await toDataUrl(file); }
    catch { toast(T('تعذّر فتح الصورة. جرّب صورة أخرى.')); return; }
    $('#imgPrev').src = IM.url;
    $('#imgDrop').hidden = true; $('#imgWork').hidden = false;
    imgPane().clear(T('ستظهر الترجمة هنا'));
    imgOcr();
  }
  async function imgOcr() {
    const id = ++IM.busy;
    const ta = $('#iText');
    ta.value = ''; ta.disabled = true; $('#iGo').disabled = true;
    iStatus(T('جارٍ قراءة النص من الصورة…'));
    try {
      const txt = await ocrImage(IM.url);
      if (id !== IM.busy) return;
      if (!txt) { iStatus(T('لم أجد نصاً مقروءاً في الصورة. جرّب صورة أوضح أو اكتب النص بنفسك في المربع.'), true); }
      else { ta.value = txt.slice(0, 5000); iStatus(T('راجع النص المقروء وصحّحه إن لزم، ثم اضغط «ترجم».')); if (txt.length > 5000) toast(T('اقتُطع النص عند 5000 حرف')); }
    } catch (e) {
      if (id !== IM.busy) return;
      iStatus(navigator.onLine ? T('تعذّرت قراءة الصورة الآن (الخدمة غير متاحة أو مشغولة). أعد المحاولة بعد قليل، أو اكتب النص يدوياً.') : T('لا يوجد اتصال بالإنترنت.'), true);
    } finally { if (id === IM.busy) { ta.disabled = false; $('#iGo').disabled = false; imgCount(); } }
  }
  const imgCount = () => { $('#iCount').textContent = `${$('#iText').value.length.toLocaleString('en-US')} / 5,000`; };
  async function imgTranslate() {
    const TRM = TR();
    const text = TRM.cleanText($('#iText').value).trim();
    if (!text || !TRM.hasLetters(text)) { toast(T('لا يوجد نص للترجمة')); return; }
    const { src, tgt, note } = TRM.resolveLangs(text);
    if (src === tgt) { iStatus(T('اختر لغتين مختلفتين.'), true); return; }
    const pane = imgPane();
    const id = ++IM.busy;
    pane.loading(); $('#iGo').disabled = true;
    try {
      const r = await TRM.translateText(text, src, tgt, { cancelled: () => id !== IM.busy });
      if (id !== IM.busy) return;
      IM.ctx = { src, tgt, srcText: text, note };
      pane.result(r, IM.ctx);
      TRM.addHistory({ src, tgt, text, out: r.text, style: r.style, domain: r.domain, via: 'image' });
      iStatus('');
    } catch (e) { if (id === IM.busy) pane.error(e); }
    finally { if (id === IM.busy) $('#iGo').disabled = false; }
  }
  async function startCamera() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { $('#imgCapture').click(); return; }
    try {
      IM.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
    } catch (e) {
      toast(e && e.name === 'NotAllowedError' ? T('اسمح باستخدام الكاميرا من المتصفح ثم أعد المحاولة') : T('تعذّر تشغيل الكاميرا. اخترنا لك التقاط صورة من الجهاز.'));
      $('#imgCapture').click(); return;
    }
    const v = h('video', { autoplay: '', playsinline: '', muted: '', class: 'cam-v', 'aria-label': T('معاينة الكاميرا') });
    v.srcObject = IM.stream; v.muted = true;
    const box = h('div', { class: 'cam-box', id: 'camBox' }, v,
      h('div', { class: 'btn-row center-row' },
        h('button', { type: 'button', class: 'go', onclick: async () => {
          const c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight;
          if (!c.width) { toast(T('الكاميرا لم تجهز بعد')); return; }
          c.getContext('2d').drawImage(v, 0, 0);
          const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.9));
          stopCamera(); imgLoad(blob);
        } }, icon('camera'), h('span', {}, T('التقاط'))),
        h('button', { type: 'button', class: 'ghost', onclick: stopCamera }, T('إلغاء'))));
    $('#imgDrop').after(box); $('#imgDrop').hidden = true;
  }
  function stopCamera() {
    if (IM.stream) { IM.stream.getTracks().forEach(t => t.stop()); IM.stream = null; }
    const b = $('#camBox'); if (b) b.remove();
    if (!IM.url) $('#imgDrop').hidden = false;
  }
  function wireImage() {
    const drop = $('#imgDrop');
    drop.addEventListener('click', e => { if (!e.target.closest('button')) $('#imgFile').click(); });
    drop.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('#imgFile').click(); } });
    $('#imgPick').addEventListener('click', () => $('#imgFile').click());
    $('#imgCam').addEventListener('click', startCamera);
    $('#imgFile').addEventListener('change', e => { imgLoad(e.target.files[0]); e.target.value = ''; });
    $('#imgCapture').addEventListener('change', e => { imgLoad(e.target.files[0]); e.target.value = ''; });
    ['dragover', 'dragenter'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
    ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); }));
    drop.addEventListener('drop', e => imgLoad(e.dataTransfer.files[0]));
    $('#iText').addEventListener('input', imgCount);
    $('#iGo').addEventListener('click', imgTranslate);
    $('#iRetry').addEventListener('click', imgOcr);
    $('#iNew').addEventListener('click', imgReset);
    $('#iListen').addEventListener('click', () => { const t = $('#iText').value.trim(); if (t) speak(t, TR().resolveLangs(t).src); });
    document.addEventListener('lw-modal', e => { if (e.detail.id === 'image' && !e.detail.open) { stopCamera(); IM.busy++; } });
    // مفتاح إدخال النص في المترجم الرئيسي
    $('#tImgBtn').addEventListener('click', () => LW.openModal('image'));
    $('#tFileBtn').addEventListener('click', () => LW.openModal('file'));
  }

  /* ======================= 2) المستندات ======================= */
  const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const A_NS = 'http://schemas.openxmlformats.org/drawingml/2006/main';
  const S_NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  const XML_NS = 'http://www.w3.org/XML/1998/namespace';
  const EXTS = ['docx', 'pptx', 'xlsx', 'pdf', 'txt', 'md', 'srt'];
  const MIME = { docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', txt: 'text/plain;charset=utf-8', md: 'text/markdown;charset=utf-8', srt: 'application/x-subrip;charset=utf-8' };

  const loaded = {};
  function loadScript(src) {
    return loaded[src] || (loaded[src] = new Promise((res, rej) => {
      const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => { delete loaded[src]; rej(new Error('lib')); }; document.head.append(s);
    }));
  }
  async function getZip() { if (!window.JSZip) await loadScript('vendor/jszip.min.js'); return window.JSZip; }
  async function getPdf() {
    if (!loaded.pdf) loaded.pdf = import(new URL('vendor/pdf.min.mjs', location.href).href).then(m => {
      m.GlobalWorkerOptions.workerSrc = new URL('vendor/pdf.worker.min.mjs', location.href).href; return m;
    });
    try { return await loaded.pdf; } catch (e) { delete loaded.pdf; throw e; }
  }
  function parseXml(str) {
    const d = new DOMParser().parseFromString(str, 'application/xml');
    if (d.getElementsByTagName('parsererror').length) throw new Error('xml');
    return d;
  }
  const serXml = d => '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' + new XMLSerializer().serializeToString(d).replace(/^<\?xml[^>]*\?>\s*/, '');
  const splitWs = s => { const m = s.match(/^(\s*)([\s\S]*?)(\s*)$/); return [m[1], m[2], m[3]]; };
  const ancestorP = (n, ns) => { for (let p = n.parentNode; p; p = p.parentNode) if (p.localName === 'p' && p.namespaceURI === ns) return p; return null; };

  const F = { file: null, kind: '', busy: false, cancel: false, run: 0 };
  const fUi = {};
  function fileUi() {
    const root = $('#fileWork');
    root.replaceChildren();
    fUi.info = h('div', { class: 'card file-card' });
    fUi.prog = h('div', { class: 'prog', hidden: true },
      h('div', { class: 'prog-bar', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': '0' }, h('i', {})),
      h('p', { class: 'hint prog-t', role: 'status' }));
    fUi.res = h('div', { class: 'file-res', 'aria-live': 'polite' });
    root.append(fUi.info, fUi.prog, fUi.res);
  }
  function setProg(p, msg) {
    fUi.prog.hidden = false;
    const pct = Math.round(Math.max(0, Math.min(1, p)) * 100);
    const bar = $('.prog-bar', fUi.prog); bar.setAttribute('aria-valuenow', String(pct)); bar.firstChild.style.width = pct + '%';
    if (msg) $('.prog-t', fUi.prog).textContent = `${msg} (${pct}%)`;
  }
  function fileReset() {
    F.cancel = true; F.busy = false; F.run++; F.file = null;
    $('#fileWork').replaceChildren(); $('#fileDrop').hidden = false; $('#filePick').disabled = false;
  }
  function pickFile(file) {
    if (!file) return;
    if (F.busy) { toast(T('انتظر انتهاء الملف الحالي أو أوقفه')); return; }
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    if (!EXTS.includes(ext)) { toast(T('صيغة غير مدعومة. المدعوم: DOCX وPPTX وXLSX وPDF وTXT وMD وSRT')); return; }
    if (file.size > MAX_FILE) { toast(T('الملف أكبر من 10 ميغابايت')); return; }
    if (file.size === 0) { toast(T('الملف فارغ')); return; }
    F.file = file; F.kind = ext;
    fileUi();
    $('#fileDrop').hidden = true;
    const go = h('button', { type: 'button', class: 'go', id: 'fGo', onclick: runFile }, icon('translate'), h('span', {}, T('ترجم الملف')));
    const cancel = h('button', { type: 'button', class: 'ghost', id: 'fCancel', hidden: true, onclick: () => { F.cancel = true; setProg(0, T('جارٍ الإيقاف…')); } }, icon('stop'), h('span', {}, T('إيقاف')));
    const other = h('button', { type: 'button', class: 'ghost', id: 'fOther', onclick: fileReset }, T('ملف آخر'));
    fUi.info.append(h('div', { class: 'file-head' }, icon('file'), h('div', { class: 'ri-body' }, h('b', { dir: 'auto' }, file.name), h('p', { class: 'hint flush-top', dir: 'ltr' }, `${ext.toUpperCase()} · ${fmtSize(file.size)}`))),
      h('div', { class: 'btn-row' }, go, cancel, other));
  }

  /* ----- استخراج المقاطع وإعادة بنائها لكل صيغة ----- */
  // كل قارئ يرجع { segs: [نص], apply(map) → Blob|{files:[{blob,name,ext}]}, warnings:[] }
  async function readTextual(file, kind) {
    const raw = new TextDecoder('utf-8').decode(await file.arrayBuffer()).replace(/^﻿/, '');
    const nl = raw.includes('\r\n') ? '\r\n' : '\n';
    const lines = raw.split(/\r\n|\n|\r/);
    const slots = [];     // { i, pre, text, post }
    let fence = false;
    lines.forEach((ln, i) => {
      if (kind === 'md' && /^\s*(```|~~~)/.test(ln)) { fence = !fence; return; }
      if (fence || !ln.trim()) return;
      if (kind === 'srt' && (/^\d+$/.test(ln.trim()) || /-->/.test(ln))) return;
      let pre = '', body = ln;
      if (kind === 'md') { const m = ln.match(/^(\s*(?:#{1,6}\s+|[-*+]\s+|\d+[.)]\s+|>\s*)*)([\s\S]*)$/); pre = m[1]; body = m[2]; }
      const [a, core, z] = splitWs(body);
      if (core && TR().hasLetters(core)) slots.push({ i, pre: pre + a, text: core, post: z });
    });
    return { segs: slots.map(s => s.text), warnings: kind === 'md' ? [T('كتل الشيفرة لا تُترجم عمداً.')] : [],
      apply: map => { slots.forEach(s => { lines[s.i] = s.pre + (map.get(s.text) ?? s.text) + s.post; }); return { blob: new Blob([lines.join(nl)], { type: MIME[kind] }), ext: kind }; } };
  }

  function setRtlParaW(p, on) {
    let ppr = null;
    for (const c of p.childNodes) if (c.localName === 'pPr' && c.namespaceURI === W_NS) { ppr = c; break; }
    const doc = p.ownerDocument;
    if (!ppr && !on) return;
    if (!ppr) { ppr = doc.createElementNS(W_NS, 'w:pPr'); p.insertBefore(ppr, p.firstChild); }
    const has = [...ppr.childNodes].find(c => c.localName === 'bidi' && c.namespaceURI === W_NS);
    if (on && !has) {
      const after = new Set(['adjustRightInd', 'snapToGrid', 'spacing', 'ind', 'contextualSpacing', 'mirrorIndents', 'suppressOverlap', 'jc', 'textDirection', 'textAlignment', 'textboxTightWrap', 'outlineLvl', 'divId', 'cnfStyle', 'rPr', 'sectPr', 'pPrChange']);
      const ref = [...ppr.childNodes].find(c => c.nodeType === 1 && after.has(c.localName)) || null;
      ppr.insertBefore(doc.createElementNS(W_NS, 'w:bidi'), ref);
    } else if (!on && has) ppr.removeChild(has);
  }
  function setRtlRunW(r, on) {
    const doc = r.ownerDocument;
    let rpr = [...r.childNodes].find(c => c.localName === 'rPr' && c.namespaceURI === W_NS);
    if (!rpr && !on) return;
    if (!rpr) { rpr = doc.createElementNS(W_NS, 'w:rPr'); r.insertBefore(rpr, r.firstChild); }
    const has = [...rpr.childNodes].find(c => c.localName === 'rtl' && c.namespaceURI === W_NS);
    if (on && !has) {
      const after = new Set(['cs', 'em', 'lang', 'eastAsianLayout', 'specVanish', 'oMath', 'rPrChange']);
      const ref = [...rpr.childNodes].find(c => c.nodeType === 1 && after.has(c.localName)) || null;
      rpr.insertBefore(doc.createElementNS(W_NS, 'w:rtl'), ref);
    } else if (!on && has) rpr.removeChild(has);
  }

  async function readDocx(file) {
    const Z = await getZip();
    const zip = await Z.loadAsync(await file.arrayBuffer());
    const names = Object.keys(zip.files).filter(n => /^word\/(document|header\d*|footer\d*|footnotes|endnotes)\.xml$/.test(n));
    if (!zip.files['word/document.xml']) throw new Error('bad');
    const parts = [];
    const segs = [];
    for (const n of names) {
      const doc = parseXml(await zip.files[n].async('string'));
      const paras = [];
      for (const p of doc.getElementsByTagNameNS(W_NS, 'p')) {
        const ts = [...p.getElementsByTagNameNS(W_NS, 't')].filter(t => ancestorP(t, W_NS) === p);
        if (!ts.length) continue;
        const full = ts.map(t => t.textContent).join('');
        const [a, core, z] = splitWs(full);
        if (!core || !TR().hasLetters(core)) continue;
        paras.push({ p, ts, a, core, z }); segs.push(core);
      }
      parts.push({ n, doc, paras });
    }
    return { segs, warnings: [T('التنسيق داخل الفقرة الواحدة (كلمة بخط عريض مثلاً) قد يتوحّد، أما الفقرات والجداول والصور والترقيم فتبقى.')],
      apply: (map, o) => {
        for (const { n, doc, paras } of parts) {
          for (const { p, ts, a, core, z } of paras) {
            const out = map.get(core); if (out === undefined) continue;
            ts[0].textContent = a + out + z; ts[0].setAttributeNS(XML_NS, 'xml:space', 'preserve');
            for (let i = 1; i < ts.length; i++) ts[i].textContent = '';
            if (o.tgtRtl || o.srcRtl) {
              setRtlParaW(p, o.tgtRtl);
              for (const r of p.getElementsByTagNameNS(W_NS, 'r')) if (ancestorP(r, W_NS) === p) setRtlRunW(r, o.tgtRtl);
            }
          }
          zip.file(n, serXml(doc));
        }
        return zip.generateAsync({ type: 'blob', mimeType: MIME.docx, compression: 'DEFLATE' }).then(blob => ({ blob, ext: 'docx' }));
      } };
  }

  async function readPptx(file) {
    const Z = await getZip();
    const zip = await Z.loadAsync(await file.arrayBuffer());
    const names = Object.keys(zip.files).filter(n => /^ppt\/(slides\/slide|notesSlides\/notesSlide)\d+\.xml$/.test(n));
    if (!names.length) throw new Error('bad');
    const parts = [], segs = [];
    for (const n of names) {
      const doc = parseXml(await zip.files[n].async('string'));
      const paras = [];
      for (const p of doc.getElementsByTagNameNS(A_NS, 'p')) {
        const runs = [...p.childNodes].filter(c => c.localName === 'r' && c.namespaceURI === A_NS);
        const ts = runs.map(r => [...r.childNodes].find(c => c.localName === 't' && c.namespaceURI === A_NS)).filter(Boolean);
        if (!ts.length) continue;
        const [a, core, z] = splitWs(ts.map(t => t.textContent).join(''));
        if (!core || !TR().hasLetters(core)) continue;
        paras.push({ p, runs, ts, a, core, z }); segs.push(core);
      }
      parts.push({ n, doc, paras });
    }
    return { segs, warnings: [T('الخطوط والألوان تبقى كما هي، لكن قد يحتاج حجم النص إلى ضبط يدوي لأن الترجمة قد تكون أطول أو أقصر من الأصل.')],
      apply: (map, o) => {
        for (const { n, doc, paras } of parts) {
          for (const { p, runs, ts, a, core, z } of paras) {
            const out = map.get(core); if (out === undefined) continue;
            ts[0].textContent = a + out + z;
            for (let i = 1; i < runs.length; i++) runs[i].parentNode.removeChild(runs[i]);
            if (o.tgtRtl || o.srcRtl) {
              let ppr = [...p.childNodes].find(c => c.localName === 'pPr' && c.namespaceURI === A_NS);
              if (o.tgtRtl) {
                if (!ppr) { ppr = doc.createElementNS(A_NS, 'a:pPr'); p.insertBefore(ppr, p.firstChild); }
                ppr.setAttribute('rtl', '1');
                if (!ppr.getAttribute('algn') || ppr.getAttribute('algn') === 'l') ppr.setAttribute('algn', 'r');
              } else if (ppr) { ppr.removeAttribute('rtl'); if (ppr.getAttribute('algn') === 'r') ppr.setAttribute('algn', 'l'); }
            }
          }
          zip.file(n, serXml(doc));
        }
        return zip.generateAsync({ type: 'blob', mimeType: MIME.pptx, compression: 'DEFLATE' }).then(blob => ({ blob, ext: 'pptx' }));
      } };
  }

  async function readXlsx(file) {
    const Z = await getZip();
    const zip = await Z.loadAsync(await file.arrayBuffer());
    const segs = [];
    const sheets = Object.keys(zip.files).filter(n => /^xl\/worksheets\/sheet\d+\.xml$/.test(n));
    let ss = null;
    if (zip.files['xl/sharedStrings.xml']) {
      const doc = parseXml(await zip.files['xl/sharedStrings.xml'].async('string'));
      const items = [];
      for (const si of doc.getElementsByTagNameNS(S_NS, 'si')) {
        const ts = [...si.getElementsByTagNameNS(S_NS, 't')].filter(t => !(t.parentNode.localName === 'rPh'));
        if (!ts.length) continue;
        const [a, core, z] = splitWs(ts.map(t => t.textContent).join(''));
        if (core && TR().hasLetters(core) && !/^=/.test(core)) { items.push({ si, a, core, z }); segs.push(core); }
      }
      ss = { doc, items };
    }
    const inl = [];
    for (const n of sheets) {
      const doc = parseXml(await zip.files[n].async('string'));
      const cells = [];
      for (const is of doc.getElementsByTagNameNS(S_NS, 'is')) {
        const ts = [...is.getElementsByTagNameNS(S_NS, 't')];
        if (!ts.length) continue;
        const [a, core, z] = splitWs(ts.map(t => t.textContent).join(''));
        if (core && TR().hasLetters(core)) { cells.push({ is, ts, a, core, z }); segs.push(core); }
      }
      inl.push({ n, doc, cells });
    }
    if (!ss && !inl.some(x => x.cells.length)) throw new Error('nodata');
    return { segs, warnings: [T('الصيغ (formulas) وأسماء الأوراق تبقى دون ترجمة عمداً حتى لا تتعطل الحسابات. الرسوم البيانية وعناوينها لا تُترجم.')],
      apply: (map, o) => {
        if (ss) {
          for (const { si, a, core, z } of ss.items) {
            const out = map.get(core); if (out === undefined) continue;
            while (si.firstChild) si.removeChild(si.firstChild);
            const t = ss.doc.createElementNS(S_NS, 't'); t.textContent = a + out + z; t.setAttributeNS(XML_NS, 'xml:space', 'preserve'); si.append(t);
          }
          zip.file('xl/sharedStrings.xml', serXml(ss.doc));
        }
        for (const { n, doc, cells } of inl) {
          for (const { is, ts, a, core, z } of cells) {
            const out = map.get(core); if (out === undefined) continue;
            ts[0].textContent = a + out + z; ts[0].setAttributeNS(XML_NS, 'xml:space', 'preserve');
            for (let i = 1; i < ts.length; i++) ts[i].parentNode.removeChild(ts[i]);
          }
          if (o.tgtRtl || o.srcRtl) for (const sv of doc.getElementsByTagNameNS(S_NS, 'sheetView')) { if (o.tgtRtl) sv.setAttribute('rightToLeft', '1'); else sv.removeAttribute('rightToLeft'); }
          zip.file(n, serXml(doc));
        }
        return zip.generateAsync({ type: 'blob', mimeType: MIME.xlsx, compression: 'DEFLATE' }).then(blob => ({ blob, ext: 'xlsx' }));
      } };
  }

  /* ----- PDF: استخراج النص ثم بناء ملف Word جديد ----- */
  async function pdfRenderPage(page, scale = 1.6) {
    const vp = page.getViewport({ scale });
    const c = document.createElement('canvas'); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
    await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
    return c.toDataURL('image/jpeg', 0.82);
  }
  async function readPdf(file, o = {}) {
    const pdfjs = await getPdf();
    const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false, useSystemFonts: true });
    let pdf;
    try { pdf = await task.promise; }
    catch (e) { if (e && e.name === 'PasswordException') { const err = new Error('pwd'); throw err; } throw new Error('bad'); }
    const pages = [];
    let chars = 0, total = pdf.numPages;
    if (total > 150) throw Object.assign(new Error('pages'), { n: total });
    for (let i = 1; i <= total; i++) {
      if (F.cancel) throw new Error('cancelled');
      setProg(0.05 + 0.1 * i / total, T('قراءة الصفحة {i} من {n}', { i, n: total }));
      const page = await pdf.getPage(i);
      const tc = await page.getTextContent();
      const lines = []; let cur = '', lastY = null, lastH = 10;
      const flush = () => { if (cur.trim()) lines.push({ t: cur.trim(), y: lastY, h: lastH }); cur = ''; };
      for (const it of tc.items) {
        if (typeof it.str !== 'string') continue;
        const y = it.transform ? it.transform[5] : 0, hh = it.height || lastH || 10;
        if (lastY !== null && Math.abs(y - lastY) > hh * 0.5) flush();
        cur += (cur && !/\s$/.test(cur) && !/^\s/.test(it.str) && it.str ? ' ' : '') + it.str;
        lastY = y; lastH = hh;
        if (it.hasEOL) flush();
      }
      flush();
      const paras = []; let buf = '', prev = null;
      for (const ln of lines) {
        if (prev && (prev.y - ln.y > prev.h * 1.6 || Math.abs(prev.h - ln.h) > 1.5)) { paras.push(buf); buf = ''; }
        buf += (buf ? ' ' : '') + ln.t; prev = ln;
      }
      if (buf) paras.push(buf);
      let ocr = false;
      if (!paras.length && o.ocr && i <= 8) {
        setProg(0.05 + 0.1 * i / total, T('قراءة الصفحة {i} بالذكاء الاصطناعي', { i }));
        const txt = await ocrImage(await pdfRenderPage(page));
        if (txt) { paras.push(...txt.split(/\n{2,}|\n/).map(x => x.trim()).filter(Boolean)); ocr = true; }
      }
      chars += paras.join('').length;
      pages.push({ i, paras, ocr });
    }
    const textual = pages.some(p => p.paras.length);
    const segs = pages.flatMap(p => p.paras.filter(x => TR().hasLetters(x)));
    const scanned = !textual || chars < total * 15;
    return { scanned, total, segs, warnings: [T('ملفات PDF لا يمكن تعديلها مباشرة، لذلك تعود الترجمة كملف Word جديد (وملف نصي) دون الحفاظ على تخطيط الصفحات والصور.'),
      ...(pages.some(p => p.ocr) ? [T('قُرئت بعض الصفحات بالذكاء الاصطناعي: راجع النص لاحتمال أخطاء القراءة.')] : [])],
      apply: async (map, o) => {
        const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
        const tx = [];
        let body = '';
        pages.forEach((pg, pi) => {
          pg.paras.forEach((ptxt, k) => {
            const out = map.get(ptxt) ?? ptxt;
            tx.push(out);
            const first = pi > 0 && k === 0;
            body += `<w:p><w:pPr>${o.tgtRtl ? '<w:bidi/>' : ''}${first ? '<w:pageBreakBefore/>' : ''}<w:spacing w:after="160"/></w:pPr><w:r><w:rPr>${o.tgtRtl ? '<w:rtl/>' : ''}<w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr><w:t xml:space="preserve">${esc(out)}</w:t></w:r></w:p>`;
          });
          tx.push('');
        });
        const Z = await getZip(); const z = new Z();
        z.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
        z.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
        z.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:document xmlns:w="${W_NS}"><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>`);
        const blob = await z.generateAsync({ type: 'blob', mimeType: MIME.docx, compression: 'DEFLATE' });
        return { files: [{ blob, ext: 'docx' }, { blob: new Blob([tx.join('\n')], { type: MIME.txt }), ext: 'txt' }] };
      } };
  }

  /* ----- التشغيل ----- */
  async function runFile(ocr) {
    if (F.busy || !F.file) return;
    const TRM = TR();
    const run = ++F.run;
    F.busy = true; F.cancel = false;
    const go = $('#fGo'), cancel = $('#fCancel'), other = $('#fOther');
    go.disabled = true; other.disabled = true; cancel.hidden = false;
    fUi.res.replaceChildren();
    const fail = (msg, extra) => { fUi.res.replaceChildren(h('div', { class: 't-err', role: 'alert' }, h('p', {}, msg), extra || null)); fUi.prog.hidden = true; };
    try {
      setProg(0.02, T('جارٍ فتح الملف'));
      let rd;
      try {
        if (F.kind === 'docx') rd = await readDocx(F.file);
        else if (F.kind === 'pptx') rd = await readPptx(F.file);
        else if (F.kind === 'xlsx') rd = await readXlsx(F.file);
        else if (F.kind === 'pdf') rd = await readPdf(F.file, { ocr: ocr === true });
        else rd = await readTextual(F.file, F.kind);
      } catch (e) {
        if (e && e.message === 'cancelled') throw e;
        if (e && e.message === 'pwd') return fail(T('الملف محمي بكلمة مرور. أزل الحماية ثم أعد المحاولة.'));
        if (e && e.message === 'pages') return fail(T('ملف PDF فيه {n} صفحة، والحد 150 صفحة. قسّمه ثم أعد المحاولة.', { n: e.n }));
        if (e && e.message === 'nodata') return fail(T('لا يوجد نص قابل للترجمة في هذا الجدول.'));
        if (e && e.message === 'lib') return fail(T('تعذّر تحميل مكتبة قراءة الملفات. أعد تحميل الصفحة وحاول مجدداً.'));
        return fail(T('تعذّر فتح الملف. قد يكون تالفاً أو بصيغة غير مطابقة لامتداده.'));
      }
      if (run !== F.run) return;
      if (rd.scanned && F.kind === 'pdf' && !rd.segs.length) {
        return fail(T('هذا الـ PDF يبدو صورة ممسوحة ضوئياً ولا يحتوي نصاً قابلاً للنسخ.'),
          h('button', { type: 'button', class: 'mini', onclick: () => { F.busy = false; runFile(true); } }, icon('sparkle'), T('قراءة أول 8 صفحات بالذكاء الاصطناعي')));
      }
      if (!rd.segs.length) return fail(T('لم أجد نصاً قابلاً للترجمة في الملف.'));
      const chars = rd.segs.join('').length;
      if (chars > MAX_CHARS) return fail(T('في الملف {n} حرفاً والحد {max}. قسّم الملف إلى أجزاء أصغر.', { n: chars.toLocaleString('en-US'), max: MAX_CHARS.toLocaleString('en-US') }));
      let { src, tgt } = LW.settings();
      if (src === 'auto') src = detect(rd.segs.slice(0, 8).join(' ').slice(0, 800), 'en');
      if (src === tgt) return fail(T('لغة الملف ولغة الترجمة متطابقتان. اختر لغة هدف مختلفة.'));
      setProg(0.16, T('جارٍ الترجمة'));
      const tr = await TRM.translateBatch(rd.segs, src, tgt, { onProgress: p => setProg(0.16 + 0.72 * p, T('جارٍ الترجمة')), cancelled: () => F.cancel || run !== F.run });
      if (run !== F.run) return;
      setProg(0.92, T('جارٍ بناء الملف'));
      const out = await rd.apply(tr.map, { tgtRtl: RTL_L.has(tgt), srcRtl: RTL_L.has(src) });
      const files = out.files || [out];
      const nm = baseName(F.file.name);
      setProg(1, T('اكتملت الترجمة'));
      const warns = [...rd.warnings];
      if (tr.fallback) warns.push(T('ترجم المحرك السريع {n} مقطعاً بعد تعذّر المحرك الذكي.', { n: tr.fallback }));
      if (tr.failed) warns.push(T('تعذّرت ترجمة {n} مقطعاً وبقيت كما هي في الملف.', { n: tr.failed }));
      warns.push(T('ترجمة آلية: راجع الملف قبل اعتماده أو إرساله، وخاصة المستندات الطبية والقانونية والرسمية.'));
      const sample = rd.segs.slice(0, 3).map(s => h('div', { class: 'row-item' }, h('div', { class: 'ri-body' },
        h('p', { class: 'ri-note', dir: dirOf(src) }, s.slice(0, 160)), h('p', { class: 'ri-text', dir: dirOf(tgt) }, (tr.map.get(s) || s).slice(0, 220)))));
      fUi.res.replaceChildren(
        h('div', { class: 'card ok-card' },
          h('p', { class: 'ok-t' }, icon('check'), h('b', {}, T('تمت الترجمة: {n} مقطعاً ({src} ← {tgt})', { n: rd.segs.length, src: LW.lname(src), tgt: LW.lname(tgt) }))),
          h('div', { class: 'btn-row' }, files.map(f => h('button', { type: 'button', class: 'go', onclick: () => downloadBlob(f.blob, `${nm}.${tgt}.${f.ext}`) }, icon('download'), h('span', {}, T('تنزيل ') + f.ext.toUpperCase())))),
          h('ul', { class: 'hint file-notes' }, warns.map(w => h('li', {}, w)))),
        h('div', { class: 'card' }, h('h3', { class: 'h2 flush' }, T('معاينة')), ...sample));
      toast(T('اكتملت ترجمة الملف'));
      setTimeout(() => { try { fUi.prog.hidden = true; } catch { /* تجاهل */ } }, 1200);
    } catch (e) {
      if (run !== F.run) return;
      if (e && e.message === 'cancelled') { fUi.prog.hidden = true; fUi.res.replaceChildren(h('p', { class: 'hint' }, T('أُوقفت الترجمة.'))); }
      else fail(TRM.errMsg(e));
    } finally { if (run === F.run) { F.busy = false; if (go.isConnected) { go.disabled = false; other.disabled = false; cancel.hidden = true; } } }
  }
  function wireFile() {
    const drop = $('#fileDrop');
    drop.addEventListener('click', e => { if (!e.target.closest('button')) $('#fileIn').click(); });
    drop.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('#fileIn').click(); } });
    $('#filePick').addEventListener('click', () => $('#fileIn').click());
    $('#fileIn').addEventListener('change', e => { pickFile(e.target.files[0]); e.target.value = ''; });
    ['dragover', 'dragenter'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
    ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); }));
    drop.addEventListener('drop', e => pickFile(e.dataTransfer.files[0]));
    document.addEventListener('lw-modal', e => { if (e.detail.id === 'file' && !e.detail.open) fileReset(); });
  }

  function init() { wireImage(); wireFile(); }
  document.addEventListener('DOMContentLoaded', init);
  LW.media = { ocrImage };
})();
