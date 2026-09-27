import { getState } from "../js/state.js"; import { pagesFromSite } from "../services/page.service.js"; import { modulesFromSite } from "../services/module.service.js"; import { journalStatus } from "../services/journal.service.js";
export function pagesPage(){const rows=pagesFromSite(getState().currentSiteFull);return shell("Pages",rows.length?`${rows.length} page(s) chargée(s).`:"Chargez d’abord un site complet. Les pages seront affichées depuis la réponse API.");}
export function modulesPage(){const rows=modulesFromSite(getState().currentSiteFull);return shell("Modules",rows.map(x=>`${x.key} : ${x.disponible===false?"indisponible":"disponible"}`).join("<br>")||"Chargez d’abord un site complet.");}
export const mediasPage=()=>shell("Médias","La V1 attend les données médias retournées par l’API DSE. Aucun média n’est stocké dans GitHub.");
export const seoPage=()=>shell("SEO","Les données SEO sont lues depuis OBJ-SEO via l’API DSE lorsqu’elles sont associées au site.");
export const parametresPage=()=>shell("Paramètres","Configuration publique uniquement. Les secrets restent hors de GitHub.");
export function journalPage(){const s=journalStatus();return shell("Journal",s.enabled?"Journal actif.":s.reason);}
export const notFoundPage=()=>shell("Page introuvable","Utilisez le menu du cockpit.");
function shell(title,text){return `<h1 class="page-title">${title}</h1><div class="card"><p>${text}</p></div>`;}
