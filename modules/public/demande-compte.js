import { apiGet, apiPost } from "../../js/api.js";

export async function monterDemandeCompte(racine) {
  const zone = document.createElement("section");
  zone.className = "dse-demande-compte card";
  zone.setAttribute("aria-live", "polite");
  zone.innerHTML = "<h1>Créer mon compte</h1><p>Vérification de l’accès au formulaire…</p>";
  racine.append(zone);
  try {
    const reponse = await apiGet("/acces/status");
    if (!zone.isConnected) return;
    const donnees = reponse.donnees || {};
    zone.replaceChildren();
    const titre = document.createElement("h1");
    titre.textContent = "Créer mon compte";
    zone.append(titre);
    if (!donnees.creationCompteAutorisee) {
      zone.append(document.createTextNode("La création de comptes n’est pas autorisée pour ce site."));
      return;
    }
    if (!donnees.approbationProprietaire) {
      zone.append(document.createTextNode("Les demandes sont suspendues tant que l’approbation du propriétaire n’est pas activée."));
      return;
    }
    if (donnees.etat === "visiteur") {
      const texte = document.createElement("p");
      texte.textContent = "Connectez-vous avec Microsoft pour déposer une demande.";
      const lien = document.createElement("a");
      lien.className = "btn btn-primary";
      lien.href = "/api/v1/auth/entra/connexion?mode=demande-compte";
      lien.textContent = "Continuer avec Microsoft";
      zone.append(texte, lien);
      return;
    }
    if (donnees.etat === "autorise") {
      const texte = document.createElement("p");
      texte.textContent = "Votre compte dispose déjà d’un accès autorisé.";
      zone.append(texte);
      const lien = document.createElement("a");
      lien.href = "/api/v1/acces/entrer";
      lien.textContent = "Accéder au cockpit";
      zone.append(lien);
      return;
    }
    const texte = document.createElement("p");
    texte.textContent = "Votre demande sera examinée. La demande ne crée aucun droit, rôle ou accès automatiquement.";
    const bouton = document.createElement("button");
    bouton.className = "btn btn-primary";
    bouton.type = "button";
    bouton.textContent = "Envoyer ma demande";
    const resultat = document.createElement("p");
    resultat.setAttribute("role", "status");
    bouton.addEventListener("click", async () => {
      bouton.disabled = true;
      resultat.textContent = "Envoi de la demande…";
      try {
        const r = await apiPost("/auth/demande-compte");
        resultat.textContent = r.donnees?.dejaSoumise
          ? "Une demande est déjà enregistrée et reste en attente."
          : "Votre demande a été transmise. Aucun accès n’a été activé.";
        bouton.hidden = true;
      } catch (e) {
        resultat.textContent = e.message || "La demande n’a pas pu être envoyée.";
        bouton.disabled = false;
      }
    });
    zone.append(texte, bouton, resultat);
  } catch (e) {
    console.error("[DSE demande compte]", e.message);
    if (zone.isConnected) zone.textContent = "Le formulaire est momentanément indisponible.";
  }
}
