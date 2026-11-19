// Options des commandes npm run. Sous Windows PowerShell, `npm run x -- --option` perd le « -- » (npm est lancé
// par un script npm.ps1) : npm garde alors --option pour lui et ne la transmet que par npm_config_option.
// Une option se lit donc sous ses trois formes : --option, option (sans tirets), ou npm_config_option.

const position = (args, nom) => args.findIndex((a) => a === nom || a === `--${nom}`);

// Option sans valeur (--strict) : retirée des arguments si elle y est
export function option(args, nom) {
  const i = position(args, nom);
  if (i >= 0) {
    args.splice(i, 1);
    return true;
  }
  return Boolean(process.env[`npm_config_${nom}`]);
}

// Option suivie d'une valeur (--retirer <empreinte>). Gardée par npm, l'option laisse sa valeur parmi les
// arguments, à la place qu'elle avait : apres = nombre d'arguments qui la précèdent.
export function valeur(args, nom, apres = 0) {
  const i = position(args, nom);
  if (i >= 0) return args.splice(i, 2)[1];
  const npm = process.env[`npm_config_${nom}`];
  if (!npm) return undefined;
  return npm === 'true' ? args.splice(apres, 1)[0] : npm;
}
