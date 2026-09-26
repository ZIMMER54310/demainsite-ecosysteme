import { CONFIG } from "./config.js";

function construireUrl(route) {
  return `${CONFIG.apiBaseUrl}${route}`;
}

async function appelApi(route, options = {}) {
  const controleur = new AbortController();
  const delai = setTimeout(
    () => controleur.abort(),
    CONFIG.timeoutMs
  );

  try {
    const reponse = await fetch(
      construireUrl(route),
      {
        ...options,
        credentials: "include",
        signal: controleur.signal,
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          ...(options.headers || {})
        }
      }
    );

    const contenu = await reponse
      .json()
      .catch(() => null);

    if (!reponse.ok) {
      const erreur = new Error(
        contenu?.erreur?.message ||
        `Erreur HTTP ${reponse.status}`
      );

      erreur.status = reponse.status;
      erreur.codeDse = contenu?.erreur?.code;

      throw erreur;
    }

    return contenu;
  }
  finally {
    clearTimeout(delai);
  }
}

export const apiDse = Object.freeze({
  etat() {
    return appelApi(CONFIG.routes.etat);
  },

  connexion(identifiant, motDePasse) {
    return appelApi(
      CONFIG.routes.connexion,
      {
        method: "POST",
        body: JSON.stringify({
          identifiant,
          motDePasse
        })
      }
    );
  },

  moi() {
    return appelApi(CONFIG.routes.moi);
  },

  deconnexion() {
    return appelApi(
      CONFIG.routes.deconnexion,
      {
        method: "POST",
        body: "{}"
      }
    );
  }
});
