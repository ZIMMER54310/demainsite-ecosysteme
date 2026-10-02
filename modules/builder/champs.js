import { urlSure } from "../public/outils.js";

// Acces aux champs normalises par l'API Builder (cles en majuscules sans separateur).
export const premier = (contenu) => (Array.isArray(contenu) ? contenu[0] : null) || null;
export const champ = (element, cle) => {
  const v = element?.champs?.[cle];
  return v === undefined || v === null ? "" : typeof v === "object" ? "" : String(v).trim();
};
export const titreRelation = (element, cle) => element?.relations?.[cle]?.[0]?.titre || "";
export const booleen = (element, cle, defaut = false) => {
  const v = element?.champs?.[cle];
  return v === undefined ? defaut : v === true || /^(1|true|oui|yes)$/i.test(String(v));
};

// URL d'un media : uniquement via l'API a partir de l'ID natif OBJ-MEDIA, jamais d'URL SharePoint brute.
export function urlMedia(media, ctx) {
  return media?.id ? urlSure(`${ctx?.apiBase || "/api/v1"}/media/${encodeURIComponent(media.id)}`, { lien: false }) : "";
}
