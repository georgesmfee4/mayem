// La langue choisie par un client, retrouvée sur tous les canaux : choisie une fois sur l'USSD, elle vaut aussi pour
// l'application mobile et l'assistant. Seule la langue est gardée, rattachée à l'empreinte du numéro de téléphone :
// jamais le numéro en clair, rien d'autre sur le client. En mémoire ici ; un hébergeur peut fournir un autre stockage
// qui respecte le même contrat.

export interface Preferences {
  lire(numero: string): Promise<string | null>;
  ecrire(numero: string, langue: string): Promise<void>;
}

// Les 9 derniers chiffres : « +237 677 12 34 56 » et « 677123456 » sont le même client
export const numeroNormal = (numero: string) => numero.replace(/\D/g, '').slice(-9);

export async function empreinteNumero(numero: string): Promise<string> {
  const octets = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`mayem-langue:${numeroNormal(numero)}`));
  return [...new Uint8Array(octets)].map((o) => o.toString(16).padStart(2, '0')).join('');
}

export function preferencesEnMemoire(): Preferences {
  const langues = new Map<string, string>();
  return {
    async lire(numero) {
      return numeroNormal(numero).length === 9 ? langues.get(await empreinteNumero(numero)) ?? null : null;
    },
    async ecrire(numero, langue) {
      if (numeroNormal(numero).length === 9) langues.set(await empreinteNumero(numero), langue);
    },
  };
}
