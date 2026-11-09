// Couche DOM : traduit la page telle qu'elle est, sans toucher au code du service.
// Règles : on ne modifie que la valeur des nœuds texte déjà présents (jamais de HTML injecté,
// jamais de nœud ajouté dans la page), on ne lit ni ne modifie aucun champ de saisie,
// et toute l'interface de l'extension vit dans un Shadow DOM séparé.
(() => {
  const SAF = globalThis.SAF;
  if (SAF.domStarted) return;
  SAF.domStarted = true;

  const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'INPUT', 'SELECT_VALUE', 'CODE', 'PRE', 'svg', 'SVG']);
  const ATTRS = ['placeholder', 'title', 'aria-label'];
  const HOST_ID = 'mayem-host';
  const records = new Map(); // nœud texte -> { orig, out }
  let showBu = true;

  const inOwnUi = (el) => el.closest(`#${HOST_ID}`);
  const editable = (el) => el.closest('[contenteditable]:not([contenteditable="false"])');

  function clearMarks(el) {
    for (const a of ['data-saf', 'data-saf-critical', 'data-saf-cat']) el.removeAttribute(a);
  }

  function mark(el, res) {
    clearMarks(el);
    el.setAttribute('data-saf', res.status);
    if (res.critical) el.setAttribute('data-saf-critical', '1');
    if (res.status === 'ok') el.setAttribute('lang', 'bum');
    // Contenu inédit : étiquette de catégorie validée, affichée en CSS (::before),
    // donc hors du texte de la page : aucune valeur ni aucun texte d'origine n'est touché.
    if (res.category) {
      const label = SAF.categoryLabel(res.category);
      if (label) el.setAttribute('data-saf-cat', label);
    }
  }

  function applyText(node, out) {
    const raw = node.nodeValue;
    const full = raw.match(/^\s*/)[0] + out + raw.match(/\s*$/)[0];
    records.set(node, { orig: raw, out: full });
    if (showBu) node.nodeValue = full;
  }

  function processText(node) {
    const p = node.parentElement;
    if (!p || SKIP.has(p.tagName) || inOwnUi(p) || editable(p)) return;
    const rec = records.get(node);
    if (rec && (node.nodeValue === rec.out || node.nodeValue === rec.orig)) return; // notre propre écriture
    records.delete(node); // le service a changé le texte : on repart de zéro
    const raw = node.nodeValue;
    const res = SAF.translate(raw);
    if (!res) return;
    if (res.out) {
      applyText(node, res.out);
      mark(p, res);
    } else if (SAF.isMeaningful(raw) || res.critical) {
      mark(p, res); // original conservé, signalé
    }
    scheduleStats();
  }

  function processAttrs(el) {
    if (inOwnUi(el)) return;
    for (const a of ATTRS) {
      const v = el.getAttribute(a);
      if (!v || v === el.getAttribute(`data-saf-out-${a}`)) continue;
      const res = SAF.translate(v);
      if (res && res.out) {
        el.setAttribute(`data-saf-orig-${a}`, v);
        el.setAttribute(`data-saf-out-${a}`, res.out);
        if (showBu) el.setAttribute(a, res.out);
      }
    }
  }

  function walk(root) {
    if (root.nodeType === Node.TEXT_NODE) return processText(root);
    if (root.nodeType !== Node.ELEMENT_NODE || inOwnUi(root)) return;
    processAttrs(root);
    const w = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      if (n.nodeType === Node.TEXT_NODE) processText(n);
      else processAttrs(n);
    }
  }

  // ---------- Interface (Shadow DOM, hors de la page) ----------
  let ui = {};
  function buildUi() {
    const host = document.createElement('div');
    host.id = HOST_ID;
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `
      <style>
        :host { all: initial; }
        .box { position: fixed; left: 12px; bottom: 12px; z-index: 2147483647;
               font: 14px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif; color: #0f172a;
               display: flex; flex-direction: column; align-items: flex-start; gap: 6px; }
        .bar { display: flex; gap: 4px; box-shadow: 0 6px 18px rgba(15,23,42,.25); border-radius: 999px; }
        button { min-height: 44px; border: 0; background: #0f4c5c; color: #fff; font: inherit;
                 font-weight: 700; cursor: pointer; padding: 0 16px; }
        #toggle { border-radius: 999px 0 0 999px; }
        #more { border-radius: 0 999px 999px 0; padding: 0 12px; background: #13677c; }
        button:focus-visible { outline: 3px solid #f59e0b; outline-offset: 2px; }
        .details { width: 240px; background: #fff; border: 1px solid #cbd5e1; border-radius: 12px;
                   padding: 10px 12px; box-shadow: 0 8px 24px rgba(15,23,42,.18); }
        .details[hidden] { display: none; }
        dl { display: grid; grid-template-columns: 1fr auto; gap: 2px 8px; margin: 0; font-size: 13px; }
        dd { margin: 0; font-weight: 700; text-align: right; }
        .ok { color: #047857; } .warn { color: #b45309; }
        .test { margin: 8px 0 0; padding: 6px 8px; border-radius: 6px; background: #fef3c7; color: #78350f; font-size: 12px; }
        @media (prefers-color-scheme: dark) {
          .details { background: #0f172a; color: #e2e8f0; border-color: #334155; }
          .ok { color: #34d399; } .warn { color: #fbbf24; }
        }
      </style>
      <section class="box" role="region" aria-label="Mayem, traduction en bulu">
        <div class="details" id="details" hidden>
          <dl aria-live="polite">
            <dt>Textes traduits</dt><dd id="n-ok">0</dd>
            <dt>Originaux conservés</dt><dd id="n-orig" class="warn">0</dd>
            <dt>Chiffres vérifiés</dt><dd id="n-facts" class="ok">0</dd>
          </dl>
          ${SAF.CONFIG.pipelineTest ? '<p class="test">Mode test : « ‹bu› » = texte pas encore validé en bulu.</p>' : ''}
        </div>
        <div class="bar">
          <button type="button" id="toggle" aria-pressed="true"></button>
          <button type="button" id="more" aria-expanded="false" aria-controls="details" aria-label="Afficher les contrôles">i</button>
        </div>
      </section>`;
    document.documentElement.append(host);
    ui = {
      toggle: root.getElementById('toggle'),
      ok: root.getElementById('n-ok'),
      orig: root.getElementById('n-orig'),
      facts: root.getElementById('n-facts'),
    };
    const more = root.getElementById('more');
    const details = root.getElementById('details');
    more.onclick = () => {
      details.hidden = !details.hidden;
      more.setAttribute('aria-expanded', String(!details.hidden));
    };
    const label = () => {
      ui.toggle.textContent = showBu ? 'Bulu ⇄ original' : 'Original ⇄ bulu';
      ui.toggle.setAttribute('aria-label', showBu ? 'Bulu affiché. Afficher l’original' : 'Original affiché. Afficher le bulu');
      ui.toggle.setAttribute('aria-pressed', String(showBu));
    };
    ui.toggle.onclick = () => {
      showBu = !showBu;
      for (const [n, r] of records) {
        if (!n.isConnected) records.delete(n);
        else n.nodeValue = showBu ? r.out : r.orig;
      }
      document.querySelectorAll('[data-saf-orig-placeholder],[data-saf-orig-title],[data-saf-orig-aria-label]').forEach((el) => {
        for (const a of ATTRS) {
          if (el.hasAttribute(`data-saf-orig-${a}`)) {
            el.setAttribute(a, el.getAttribute(showBu ? `data-saf-out-${a}` : `data-saf-orig-${a}`));
          }
        }
      });
      label();
    };
    label();
  }

  // Compteurs : recalculés à partir de la page, et contrôle réel des chiffres de chaque texte traduit
  let statsQueued = false;
  function scheduleStats() {
    if (statsQueued) return;
    statsQueued = true;
    requestAnimationFrame(() => {
      statsQueued = false;
      let ok = 0, facts = 0, broken = 0;
      for (const [n, r] of records) {
        if (!n.isConnected) { records.delete(n); continue; }
        ok++;
        if (/\d/.test(r.orig)) (SAF.sameFinancialTokens(r.orig, r.out) ? facts++ : broken++);
      }
      const orig = document.querySelectorAll('[data-saf="unverified"],[data-saf="rejected"]').length;
      if (!ui.ok) return;
      ui.ok.textContent = ok;
      ui.orig.textContent = orig;
      ui.facts.textContent = broken ? `${broken} écart(s) !` : `${facts} ✓`;
    });
  }
  SAF.stats = () => ({ translated: records.size });

  const obs = new MutationObserver((muts) => {
    for (const m of muts) {
      if (m.type === 'characterData') processText(m.target);
      else if (m.type === 'attributes') processAttrs(m.target);
      else m.addedNodes.forEach(walk);
    }
  });

  buildUi();
  walk(document.body);
  obs.observe(document.body, {
    childList: true, subtree: true, characterData: true,
    attributes: true, attributeFilter: ATTRS,
  });
  scheduleStats();
})();
