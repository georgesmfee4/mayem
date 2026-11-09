// Moteur de traduction : mémoire validée -> modèles à trous -> catégorie -> repli sûr.
// Le moteur ne connaît aucune page : il reçoit une chaîne et rend un résultat.
(() => {
  const SAF = globalThis.SAF;
  // pipelineTest : tant que le bulu n'est pas validé, affiche « ‹bu› + français » pour tester la chaîne.
  // À METTRE À false pour la démo finale : seules les traductions validées s'affichent alors.
  const CONFIG = (SAF.CONFIG = SAF.CONFIG || { pipelineTest: true });

  const norm = (s) => s.normalize('NFC').replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim();
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const SLOT_RE = { ...SAF.RE, name: String.raw`[^\n]+?` };
  const slotType = (k) => k.replace(/_\d+$/, ''); // amount_1 -> amount

  const exact = new Map();
  const templates = [];
  const byId = new Map();

  function toRegex(src) {
    const body = norm(src)
      .split(/(\{\w+\})/)
      .map((p) => {
        const m = p.match(/^\{(\w+)\}$/);
        if (m) return `(?<${m[1]}>${SLOT_RE[slotType(m[1])] || SLOT_RE.name})`;
        return esc(p).replace(/ /g, '\\s*');
      })
      .join('');
    return new RegExp(`^${body}$`, 'iu');
  }

  for (const e of globalThis.SAFINUM_MEMORY || []) {
    byId.set(e.id, e);
    const sources = [e.fr, ...(Array.isArray(e.en) ? e.en : e.en ? [e.en] : [])];
    for (const src of sources) {
      if (/\{\w+\}/.test(src)) {
        templates.push({ re: toRegex(src), e, spec: src.replace(/\{\w+\}/g, '').length });
      } else {
        exact.set(norm(src).toLowerCase(), e);
      }
    }
  }
  templates.sort((a, b) => b.spec - a.spec); // les modèles les plus précis d'abord

  const fill = (tpl, g) => tpl.replace(/\{(\w+)\}/g, (_, k) => (g[k] !== undefined ? g[k] : `{${k}}`));

  function render(hit, groups) {
    if (hit.validated && hit.bu) return { out: fill(hit.bu, groups), status: 'ok' };
    if (CONFIG.pipelineTest) return { out: '‹bu› ' + fill(hit.fr, groups), status: 'test' };
    return { out: null, status: 'unverified' };
  }

  // Catégorie d'un message inconnu (contenu inédit) : sert à afficher une étiquette validée
  const CATS = [
    ['security', /s[ée]curit|security|code secret|secret code|\bpin\b|mot de passe|password|arnaque|fraud|scam|ne partagez|never share|do not share/i],
    ['error', /erreur|error|échec|echec|failed|invalide|invalid|insuffisant|insufficient|impossible|indisponible|unavailable|refus|declined/i],
    ['fees', /frais|\bfees?\b|commission|tarif|charges?\b/i],
  ];
  // Seules les catégories qui changent le comportement de l'utilisateur reçoivent une étiquette :
  // un message neutre ne doit pas être présenté comme important.
  const CAT_LABEL = { security: 'E02', error: 'E01', fees: 'G06' };
  SAF.categorize = (t) => (CATS.find(([, re]) => re.test(t)) || ['info'])[0];

  // Libellé d'une entrée du corpus (pour les étiquettes de catégorie), ou null
  SAF.label = (id) => {
    const e = byId.get(id);
    return e ? render(e, {}).out : null;
  };
  SAF.categoryLabel = (cat) => (CAT_LABEL[cat] ? SAF.label(CAT_LABEL[cat]) : null);

  // Retourne null (rien à traduire) ou { status, critical, out, id, category }
  //   status : 'ok' (bulu validé) | 'test' (mode test) | 'unverified' (original conservé)
  SAF.translate = (raw) => {
    const text = norm(raw);
    if (!text || SAF.isFactOnly(text)) return null;

    let hit = exact.get(text.toLowerCase());
    let groups = {};
    if (!hit) {
      for (const t of templates) {
        const m = text.match(t.re);
        if (m) { hit = t.e; groups = m.groups || {}; break; }
      }
    }
    if (!hit) {
      return { status: 'unverified', critical: false, out: null, id: null,
               category: SAF.isMeaningful(text) ? SAF.categorize(text) : null };
    }

    let { out, status } = render(hit, groups);
    // Garde-fou : jamais de champ non rempli, jamais un chiffre ou une devise qui change
    if (out && (/\{\w+\}/.test(out) || !SAF.sameFinancialTokens(text, out))) {
      out = null;
      status = 'rejected';
    }
    return { status, critical: !!hit.critical, out, id: hit.id, category: null };
  };

  // Point d'accroche pour un brouillon IA sur le contenu inédit. Volontairement NON branché :
  // gratuit et hors ligne par défaut. Signature : async (texteMasqué) => brouillon | null
  SAF.fallback = null;
})();
