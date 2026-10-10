import { apiGet } from "../../js/api.js";

const libelles = {
  visiteur: "🔐 Accéder à mon espace",
  autorise: "🛡 Retourner au Cockpit",
  attente: "⏳ Accès en attente",
  refuse: "🔒 Accès sécurisé",
  bloque: "🔒 Accès temporairement sécurisé"
};

export async function monterAccesPublic(racine) {
  const zone = document.createElement("div");
  zone.className = "dse-acces-public";
  zone.setAttribute("aria-live", "polite");
  racine.append(zone);
  try {
    const r = await apiGet("/acces/status");
    if (!zone.isConnected) return;
    const etat = r.donnees?.etat;
    if (r.donnees?.afficherAccesCockpit !== false) {
      const autorise = etat === "visiteur" || etat === "autorise";
      const bouton = document.createElement(autorise ? "a" : "span");
      bouton.className = "dse-acces-bouton dse-acces-icone";
      const libelle = libelles[etat] || "🔒 Accès sécurisé";
      const texte = libelle.replace(/^\S+\s+/, "");
      bouton.setAttribute("aria-label", texte);
      const icone = document.createElement("span");
      icone.textContent = libelle.split(" ")[0];
      icone.setAttribute("aria-hidden", "true");
      const bulle = document.createElement("span");
      bulle.className = "dse-acces-infobulle";
      bulle.textContent = autorise ? texte : `${texte} — Contactez votre administrateur pour vérifier votre accès.`;
      bouton.append(icone);
      bouton.append(bulle);
      if (autorise) bouton.href = "/#/cockpit";
      else {
        bouton.setAttribute("tabindex", "0");
        bouton.setAttribute("aria-disabled", "true");
      }
      zone.append(bouton);
    }
    if (r.donnees?.creationCompteAutorisee && etat === "visiteur") {
      const creer = document.createElement("a");
      creer.className = "dse-acces-bouton";
      creer.href = "/api/v1/auth/entra/connexion?mode=demande-compte";
      creer.textContent = "Créer mon compte";
      zone.append(creer);
    } else if (r.donnees?.creationCompteAutorisee && etat === "attente") {
      const demande = document.createElement("a");
      demande.className = "dse-acces-bouton";
      demande.href = "#/demande-compte";
      demande.textContent = "Demander la création de mon compte";
      zone.append(demande);
    }
  } catch (e) {
    console.error("[DSE accès public]", e.message);
    if (zone.isConnected) zone.textContent = "Accès à l’espace momentanément indisponible.";
  }
}
