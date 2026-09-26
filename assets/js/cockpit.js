import { apiDse } from "./api-dse.js";

const menu =
  document.querySelector("#menu-dynamique");

const sites =
  document.querySelector("#sites-autorises");

const actions =
  document.querySelector("#actions-autorisees");

const indicateurs =
  document.querySelector("#indicateurs");

const message =
  document.querySelector("#message-cockpit");

function texte(valeur, defaut = "") {
  if (
    valeur === null ||
    valeur === undefined
  ) {
    return defaut;
  }

  return String(valeur);
}

function afficherMenu(elements = []) {
  menu.replaceChildren(
    ...elements.map(element => {
      const li =
        document.createElement("li");

      const lien =
        document.createElement("a");

      lien.href = element.url || "#";
      lien.textContent =
        texte(
          element.titre,
          element.code || "Module"
        );

      li.append(lien);

      return li;
    })
  );
}

function afficherSites(elements = []) {
  if (!elements.length) {
    sites.textContent =
      "Aucun site autorisé.";
    return;
  }

  sites.replaceChildren(
    ...elements.map(site => {
      const article =
        document.createElement("article");

      article.className = "carte";

      const titre =
        document.createElement("h3");

      titre.textContent =
        texte(site.nom, "Site DSE");

      const domaine =
        document.createElement("p");

      domaine.textContent =
        texte(
          site.domaine,
          "Domaine non renseigné"
        );

      article.append(titre, domaine);

      return article;
    })
  );
}

function afficherActions(elements = []) {
  actions.replaceChildren(
    ...elements.map(action => {
      const bouton =
        document.createElement("button");

      bouton.type = "button";

      bouton.textContent =
        texte(
          action.titre,
          action.code || "Action"
        );

      bouton.disabled =
        action.autorisee === false;

      return bouton;
    })
  );
}

function afficherIndicateurs(objet = {}) {
  indicateurs.replaceChildren(
    ...Object.entries(objet)
      .map(([cle, valeur]) => {
        const article =
          document.createElement("article");

        article.className =
          "indicateur";

        const valeurElement =
          document.createElement("strong");

        valeurElement.textContent =
          texte(valeur);

        const libelle =
          document.createElement("span");

        libelle.textContent = cle;

        article.append(
          valeurElement,
          libelle
        );

        return article;
      })
  );
}

async function initialiser() {
  try {
    const reponse =
      await apiDse.moi();

    const donnees =
      reponse?.donnees || {};

    document.querySelector(
      "#bienvenue"
    ).textContent =
      `Bienvenue ${texte(
        donnees.compte?.nom,
        ""
      )}`.trim();

    document.querySelector(
      "#client-actif"
    ).textContent =
      texte(
        donnees.client?.nom,
        "Client DSE"
      );

    document.querySelector(
      "#role-actif"
    ).textContent =
      texte(
        donnees.role?.nom,
        "Rôle DSE"
      );

    document.querySelector(
      "#resume-contexte"
    ).textContent =
      texte(
        donnees.contexte?.resume,
        "Vue limitée au périmètre autorisé."
      );

    afficherMenu(donnees.menu);
    afficherSites(donnees.sites);
    afficherActions(donnees.actions);
    afficherIndicateurs(
      donnees.indicateurs
    );
  }
  catch (erreur) {
    if (
      erreur.status === 401 ||
      erreur.status === 403
    ) {
      window.location.replace("../");
      return;
    }

    if (erreur.status === 404) {
      message.textContent =
        "Le cockpit est installé. L'endpoint /moi basé sur OBJ-CLIENT reste à publier.";
    }
    else {
      message.textContent =
        "Chargement du cockpit impossible.";
    }

    afficherMenu([
      {
        code: "ACCUEIL",
        titre: "Accueil",
        url: "./"
      }
    ]);
  }
}

document.querySelector(
  "#deconnexion"
).addEventListener(
  "click",
  async () => {
    try {
      await apiDse.deconnexion();
    }
    catch {
    }

    window.location.replace("../");
  }
);

initialiser();
