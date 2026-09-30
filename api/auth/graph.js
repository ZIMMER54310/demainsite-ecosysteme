"use strict";

const https = require("https");

let cacheJeton = {
  valeur: null,
  expiration: 0
};

function creerErreur(code, status, message) {
  const erreur = new Error(message);
  erreur.codeDse = code;
  erreur.status = status;
  return erreur;
}

function requeteJeton(url, corps) {
  return new Promise((resolve, reject) => {
    const donnees = Buffer.from(corps, "utf8");

    const requete = https.request(
      url,
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/x-www-form-urlencoded",
          "Content-Length":
            donnees.length,
          Accept:
            "application/json"
        }
      },
      (reponse) => {
        let contenu = "";

        reponse.setEncoding("utf8");

        reponse.on(
          "data",
          (morceau) => {
            contenu += morceau;
          }
        );

        reponse.on(
          "end",
          () => {
            let resultat = null;

            try {
              resultat = contenu
                ? JSON.parse(contenu)
                : {};
            } catch {
              return reject(
                creerErreur(
                  "DSE-JETON-GRAPH-REPONSE-INVALIDE",
                  503,
                  "La reponse Microsoft Entra est invalide."
                )
              );
            }

            if (
              reponse.statusCode < 200 ||
              reponse.statusCode >= 300
            ) {
              return reject(
                creerErreur(
                  "DSE-JETON-GRAPH-REFUSE",
                  503,
                  resultat.error_description ||
                    "Le jeton Microsoft Graph a ete refuse."
                )
              );
            }

            resolve(resultat);
          }
        );
      }
    );

    requete.on(
      "error",
      (erreur) => {
        reject(
          creerErreur(
            "DSE-JETON-GRAPH-INACCESSIBLE",
            503,
            erreur.message ||
              "Microsoft Entra est inaccessible."
          )
        );
      }
    );

    requete.write(donnees);
    requete.end();
  });
}

async function obtenirJetonGraph() {
  const maintenant = Date.now();

  if (
    cacheJeton.valeur &&
    cacheJeton.expiration > maintenant + 60000
  ) {
    return cacheJeton.valeur;
  }

  const tenantId =
    String(process.env.DSE_TENANT_ID || "").trim();

  const clientId =
    String(process.env.DSE_CLIENT_ID || "").trim();

  const clientSecret =
    String(process.env.DSE_CLIENT_SECRET || "").trim();

  if (!tenantId || !clientId || !clientSecret) {
    throw creerErreur(
      "DSE-CONFIGURATION-ENTRA-INCOMPLETE",
      500,
      "La configuration Microsoft Entra est incomplete."
    );
  }

  const url =
    new URL(
      `https://login.microsoftonline.com/` +
      `${encodeURIComponent(tenantId)}/` +
      "oauth2/v2.0/token"
    );

  const parametres =
    new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      scope:
        "https://graph.microsoft.com/.default",
      grant_type:
        "client_credentials"
    });

  const resultat =
    await requeteJeton(
      url,
      parametres.toString()
    );

  if (!resultat.access_token) {
    throw creerErreur(
      "DSE-JETON-GRAPH-ABSENT",
      503,
      "Le jeton Microsoft Graph est absent."
    );
  }

  const duree =
    Number(resultat.expires_in || 3600);

  cacheJeton = {
    valeur:
      resultat.access_token,

    expiration:
      Date.now() +
      Math.max(duree - 120, 60) * 1000
  };

  return cacheJeton.valeur;
}

module.exports = {
  obtenirJetonGraph
};
