// Pages du site de l'API (accueil, documentation, confidentialité, démonstration, studio de voix) : sources dans docs/.
// Les parties qui changent (langues publiées, adresses du contrat OpenAPI) sont remplies ici à chaque
// publication, pour que le site ne puisse pas s'écarter de ce que l'API publie vraiment.

import { cpSync, readFileSync, writeFileSync } from 'node:fs';
import { racine } from './langues.js';
import { cheminEnLigne } from './cloudflare.js';
import { listesVoix } from './voix.js';

const echapper = (texte) => String(texte).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const ancre = (texte) => texte.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const dateLongue = (iso) => new Date(iso + 'T00:00:00Z').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

function languesPubliees(resumes) {
  const titre = resumes.length > 1 ? 'Langues prises en charge aujourd\'hui' : 'Langue prise en charge aujourd\'hui';
  const lignes = resumes.map((l) => `        <li class="langue">
          <span class="langue-nom">${echapper(l.nom)}</span><span class="langue-code">${echapper(l.langue)}</span>
          <span class="langue-liens"><a href="v1/${echapper(l.liens.pack)}">Pack</a><a href="v1/${echapper(l.liens.detail)}">Versions</a></span>
          <p class="langue-detail">Version ${echapper(l.derniere.version)} du ${dateLongue(l.derniere.date)}, ${l.phrases_validees} phrases validées</p>
        </li>`);
  return `      <h2>${titre}</h2>\n      <ul class="langues">\n${lignes.join('\n')}\n      </ul>`;
}

// Une adresse du contrat : paramètres en évidence, et un exemple à ouvrir quand elle est publique
function adresse(chemin, operation, communs) {
  const parametres = (operation.parameters || []).map((p) => (p.$ref ? communs[p.$ref.split('/').pop()] : p));
  const exemple = parametres.reduce((lien, p) => lien.replace(`{${p.name}}`, p.example), chemin);
  const protegee = Boolean(operation.security?.length);
  const morceaux = [
    `<article class="adresse">`,
    `<div class="adresse-tete"><span class="methode">GET</span><code class="chemin">${echapper(chemin).replace(/\{(\w+)\}/g, '<em>{$1}</em>')}</code>${protegee ? '<span class="verrou">Clé d\'accès</span>' : ''}</div>`,
    `<p class="objet">${echapper(operation.summary)}</p>`,
  ];
  if (operation.description) morceaux.push(`<p>${echapper(operation.description)}</p>`);
  if (parametres.length) {
    const lignes = parametres.map((p) => `<dt><code>${echapper(p.name)}</code></dt><dd>${p.description ? echapper(p.description) + ', par exemple' : 'Par exemple'} <code>${echapper(p.example)}</code></dd>`);
    morceaux.push(`<dl class="parametres">${lignes.join('')}</dl>`);
  }
  const reponses = Object.entries(operation.responses).map(([code, r]) => `<li><b>${code}</b>${echapper(r.description)}</li>`);
  morceaux.push(`<ul class="reponses">${reponses.join('')}</ul>`);
  if (!protegee) morceaux.push(`<a class="essayer" href="${echapper(cheminEnLigne(exemple).slice(1))}">Ouvrir ${echapper(cheminEnLigne(exemple))}</a>`);
  return morceaux.join('\n') + '\n</article>';
}

// Les adresses, rangées par thème dans l'ordre du contrat
export function adresses(openapi) {
  const communs = openapi.components.parameters;
  return openapi.tags.map((theme) => {
    const liste = Object.entries(openapi.paths).filter(([, chemin]) => chemin.get.tags.includes(theme.name))
      .map(([chemin, { get }]) => adresse(chemin, get, communs));
    return `<h3 id="adresses-${ancre(theme.name)}">${echapper(theme.name)}</h3>\n<p>${echapper(theme.description)}.</p>\n${liste.join('\n')}`;
  }).join('\n');
}

function remplir(nom, morceaux) {
  let page = readFileSync(racine + 'docs/' + nom, 'utf8');
  for (const [repere, html] of Object.entries(morceaux)) {
    if (!page.includes(`<!-- ${repere} -->`)) throw new Error(`docs/${nom} : repère <!-- ${repere} --> absent.`);
    page = page.replace(`<!-- ${repere} -->`, html);
  }
  return page;
}

export function ecrireSite(sortie, resumes) {
  const openapi = JSON.parse(readFileSync(racine + 'docs/openapi.json', 'utf8'));
  writeFileSync(sortie + 'index.html', remplir('accueil.html', { LANGUES: languesPubliees(resumes) }));
  writeFileSync(sortie + 'documentation.html', remplir('documentation.html', { ADRESSES: adresses(openapi) }));
  // Studio de voix : page des locuteurs, les listes de phrases y sont embarquées ; les voix ne quittent
  // l'appareil que lorsque le locuteur envoie lui-même son fichier
  const listes = JSON.stringify(listesVoix()).replace(/</g, '\\u003c');
  writeFileSync(sortie + 'studio.html', remplir('studio.html', { LISTES: listes }));
  // Politique de confidentialité : l'adresse que demandent les boutiques ; démonstration : banque fictive
  // où essayer l'extension (relecteurs de la boutique, jury), rien n'y est envoyé
  for (const nom of ['confidentialite.html', 'demo.html', 'site.css']) cpSync(racine + 'docs/' + nom, sortie + nom);
  cpSync(racine + 'docs/polices', sortie + 'polices', { recursive: true });
  cpSync(racine + 'icones/icone.svg', sortie + 'icone.svg');
}
