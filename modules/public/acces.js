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
    const autorise = etat === "visiteur" || etat === "autorise";
    const bouton = document.createElement(autorise ? "a" : "span");
    bouton.className = "dse-acces-bouton";
    bouton.textContent = libelles[etat] || "🔒 Accès sécurisé";
    if (autorise) bouton.href = "/api/v1/acces/entrer";
    else bouton.title = etat === "bloque" ? "Contactez votre administrateur pour vérifier votre accès." : "Votre administrateur doit vérifier votre accès.";
    zone.append(bouton);
  } catch (e) {
    console.error("[DSE accès public]", e.message);
    if (zone.isConnected) zone.textContent = "Accès à l’espace momentanément indisponible.";
  }
}
