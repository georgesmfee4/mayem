// Le bouton et le panneau de l'extension. Ils vivent dans un Shadow DOM séparé :
// rien de la page n'est touché, et le style de la page ne déborde pas sur eux.

export const ID_HOTE = 'mayem-host';

export interface Compteurs { traduits: number; conserves: number; chiffres: string }

export interface Interface {
  afficherCompteurs(c: Compteurs): void;
}

const STYLE = `
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
  }`;

function gabarit(modeTest: boolean): string {
  const avisTest = modeTest
    ? '<p class="test">Mode test : « ‹bu› » = texte pas encore validé en bulu.</p>'
    : '';
  return `
    <style>${STYLE}</style>
    <section class="box" role="region" aria-label="Mayem, traduction en bulu">
      <div class="details" id="details" hidden>
        <dl aria-live="polite">
          <dt>Textes traduits</dt><dd id="n-ok">0</dd>
          <dt>Originaux conservés</dt><dd id="n-orig" class="warn">0</dd>
          <dt>Chiffres vérifiés</dt><dd id="n-facts" class="ok">0</dd>
        </dl>
        ${avisTest}
      </div>
      <div class="bar">
        <button type="button" id="toggle" aria-pressed="true"></button>
        <button type="button" id="more" aria-expanded="false" aria-controls="details" aria-label="Afficher les contrôles">i</button>
      </div>
    </section>`;
}

// basculer reçoit true quand le bulu doit être affiché, false pour l'original
export function creerInterface(modeTest: boolean, basculer: (bulu: boolean) => void): Interface {
  const hote = document.createElement('div');
  hote.id = ID_HOTE;
  const racine = hote.attachShadow({ mode: 'open' });
  // innerHTML sur notre propre Shadow DOM, jamais sur la page, avec un gabarit fixe
  racine.innerHTML = gabarit(modeTest);
  document.documentElement.append(hote);

  const trouver = (id: string) => racine.getElementById(id) as HTMLElement;
  const bouton = trouver('toggle');
  const plus = trouver('more');
  const details = trouver('details');
  let afficheBulu = true;

  plus.onclick = () => {
    details.hidden = !details.hidden;
    plus.setAttribute('aria-expanded', String(!details.hidden));
  };
  const majBouton = () => {
    bouton.textContent = afficheBulu ? 'Bulu ⇄ original' : 'Original ⇄ bulu';
    bouton.setAttribute('aria-label', afficheBulu ? 'Bulu affiché. Afficher l’original' : 'Original affiché. Afficher le bulu');
    bouton.setAttribute('aria-pressed', String(afficheBulu));
  };
  bouton.onclick = () => {
    afficheBulu = !afficheBulu;
    basculer(afficheBulu);
    majBouton();
  };
  majBouton();

  return {
    afficherCompteurs({ traduits, conserves, chiffres }) {
      trouver('n-ok').textContent = String(traduits);
      trouver('n-orig').textContent = String(conserves);
      trouver('n-facts').textContent = chiffres;
    },
  };
}
