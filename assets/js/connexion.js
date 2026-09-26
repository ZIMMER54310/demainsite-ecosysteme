import { apiDse } from "./api-dse.js";

const formulaire =
  document.querySelector("#form-connexion");

const message =
  document.querySelector("#message-connexion");

const etatApi =
  document.querySelector("#etat-api");

const voyant =
  document.querySelector("#voyant-api");

async function controlerApi() {
  try {
    await apiDse.etat();

    etatApi.textContent =
      "API DSE disponible";

    voyant.classList.add("ok");
  }
  catch {
    etatApi.textContent =
      "API DSE indisponible";

    voyant.classList.add("erreur");
  }
}

formulaire.addEventListener(
  "submit",
  async evenement => {
    evenement.preventDefault();

    message.textContent = "";

    if (!formulaire.reportValidity()) {
      return;
    }

    const donnees =
      new FormData(formulaire);

    const identifiant =
      String(
        donnees.get("identifiant") || ""
      ).trim();

    const motDePasse =
      String(
        donnees.get("motDePasse") || ""
      );

    const bouton =
      formulaire.querySelector(
        "button[type=submit]"
      );

    bouton.disabled = true;
    bouton.textContent = "Connexion...";

    try {
      await apiDse.connexion(
        identifiant,
        motDePasse
      );

      window.location.assign("cockpit/");
    }
    catch (erreur) {
      if (erreur.status === 404) {
        message.textContent =
          "Cockpit prêt. La connexion OBJ-CLIENT reste à activer dans l'API DSE.";
      }
      else {
        message.textContent =
          erreur.message ||
          "Connexion impossible.";
      }
    }
    finally {
      bouton.disabled = false;
      bouton.textContent = "Se connecter";
    }
  }
);

controlerApi();
