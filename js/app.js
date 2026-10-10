import { getHealth } from "../services/health.service.js"; import { initializeAuth } from "./auth.js"; import { setState,getState } from "./state.js"; import { registerRoute,startRouter,navigationCourante,resolveRoute } from "./router.js"; import { renderHeader } from "../components/header.js"; import { renderSidebar } from "../components/sidebar.js"; import { renderBreadcrumb } from "../components/breadcrumb.js"; import { renderFooter } from "../components/footer.js"; import { showAlert,clearAlert } from "../components/alert.js"; import { notFoundPage } from "../pages/generic.js"; import { cockpitAccueilPage,cockpitSitesPage,cockpitClientPage,cockpitSitePage,activerVueSite,cockpitAssistantPage,activerAssistant,activerFiltresSites,cockpitEditionPage,activerEdition,cockpitAdministrationPage,cockpitUtilisateursPage,activerUtilisateurs,cockpitConstruirePage,activerConstruire,cockpitMenusPage,activerMenusPage,cockpitDemandesComptesPage,activerDemandesComptesPage,cockpitReglagesAccesPage,activerReglagesAccesPage,rendreOuverture,preparerContexteSite,echecChargement,activerGalerie,activerFiltresEspaces } from "../pages/cockpit.js"; import { commencerNavigation,terminerNavigation,rendreChargement,etatPage } from "./chargement.js";
import { activerMisesAJour } from "./mise-a-jour.js";
activerMisesAJour();
function mount(page,breadcrumb){ clearAlert(); document.querySelector("#app-header").innerHTML=renderHeader(getState().apiStatus,getState().user); document.querySelector("#app-sidebar").innerHTML=renderSidebar(); activerCadre(); document.querySelector("#app-breadcrumb").innerHTML=renderBreadcrumb(breadcrumb); document.querySelector("#app-page").innerHTML=page; document.querySelector("#app-page").insertAdjacentHTML("beforeend",renderFooter()); document.querySelector("#main").focus(); }
function activerCadre() {
  const bouton = document.querySelector("[data-reduire-menu]");
  const shell = document.querySelector("#app");
  const synchroniser = () => {
    if (!bouton) return;
    const reduit = shell.classList.contains("cockpit-menu-reduit");
    bouton.setAttribute("aria-expanded", String(!reduit));
    bouton.title = reduit ? "Développer le menu" : "Réduire le menu";
    bouton.querySelector("span").textContent = bouton.title;
  };
  synchroniser();
  bouton?.addEventListener("click", () => { shell.classList.toggle("cockpit-menu-reduit"); synchroniser(); });
  document.querySelector("[data-recherche-cockpit]")?.addEventListener("submit", (ev) => {
    ev.preventDefault();
    location.hash = `/cockpit/sites?q=${encodeURIComponent(new FormData(ev.currentTarget).get("q") || "")}`;
  });
}
registerRoute("/", async () => {
  const domaine = window.location.hostname
    .trim()
    .toLowerCase();

  const page = await accueilPage(domaine);

  mount(page, ["Accueil"]);
  if (document.body.classList.contains("dse-public")) {
    await monterAccesPublic(document.querySelector("#app-page"));
  }

  for (const racineCatalogue of document.querySelectorAll("[data-dse-catalogue], [data-dse-catalogue-builder]")) {
    monterCatalogue(racineCatalogue, { domaine }).catch(() => {
      racineCatalogue.hidden = true;
    });
  }
}); // Cockpit unique : l'interface s'adapte aux droits renvoyes par le serveur.
registerRoute("/demande-compte", async () => {
  document.body.classList.add("dse-public");
  mount("<main id=\"demande-compte\"></main>", ["Accueil", "Créer mon compte"]);
  await monterDemandeCompte(document.querySelector("#demande-compte"));
});
/*
 * Navigation cockpit commune : etat LOADING immediat (indicateur global + squelette), menu et site
 * selectionne conserves, puis seule la reponse de la navigation la plus recente est montee.
 */
const page$ = () => document.querySelector("#app-page");
function monterAttente(html, fil) {
  clearAlert();
  document.querySelector("#app-sidebar").innerHTML = renderSidebar();
  activerCadre();
  document.querySelector("#app-breadcrumb").innerHTML = renderBreadcrumb(fil);
  page$().innerHTML = html;
}
function rafraichirNavigation(fil) {
  document.querySelector("#app-sidebar").innerHTML = renderSidebar();
  activerCadre();
  if (fil) document.querySelector("#app-breadcrumb").innerHTML = renderBreadcrumb(fil);
}
async function naviguer(p, fil, detail, charger, activer, attente) {
  const jeton = navigationCourante();
  if (/^#\/cockpit\/site\//.test(location.hash)) preparerContexteSite(p.domaine);
  commencerNavigation(detail, jeton);
  monterAttente(attente || rendreChargement(detail), fil);
  let page;
  try { page = await charger(); } catch (err) { console.error("[DSE navigation]", err?.message); page = echecChargement(); }
  if (jeton !== navigationCourante()) return;
  const html = typeof page === "string" ? page : page?.html || "";
  mount(html, fil);
  try { activer?.(page$(), page); } finally { terminerNavigation(jeton, etatPage(html)); }
}
const nomSite = (d) => {
  const s = getState().selectedSite;
  return s && !s.provisoire && (s.acces === d || s.domaine === d) && s.nom ? s.nom : nomOuverture(d);
};
const ONGLETS = { entetes: "En-tête", pages: "Pages", footers: "Pied de page", bibliotheque: "Bibliothèque", catalogue: "Catalogue / Modèles" };
const COMPOSANTS = { articles: "Articles", menu: "Menu", seo: "SEO", entete: "En-tête", footer: "Pied de page" };
registerRoute("/cockpit/site/:domaine/menu",p=>naviguer(p,["Cockpit","Mes sites",p.domaine,"Menu"],`Chargement des menus de ${nomSite(p.domaine)}`,()=>cockpitMenusPage(p),(r,pg)=>activerMenusPage(r,pg,p.domaine)));
registerRoute("/cockpit/site/:domaine/demandes-comptes",p=>naviguer(p,["Cockpit","Mes sites",p.domaine,"Demandes de compte"],`Chargement des demandes de ${nomSite(p.domaine)}`,()=>cockpitDemandesComptesPage(p),(r,pg)=>activerDemandesComptesPage(r,pg,p.domaine)));
registerRoute("/cockpit/site/:domaine/reglages-acces",p=>naviguer(p,["Cockpit","Mes sites",p.domaine,"Accès et comptes"],`Chargement des réglages de ${nomSite(p.domaine)}`,()=>cockpitReglagesAccesPage(p),(r,pg)=>activerReglagesAccesPage(r,pg,p.domaine)));
registerRoute("/cockpit",p=>naviguer(p,["Cockpit"],"Chargement du cockpit",()=>cockpitAccueilPage(p)));
registerRoute("/cockpit/sites",p=>naviguer(p,["Cockpit","Mes sites"],"Chargement de Mes sites",()=>cockpitSitesPage(p),activerFiltresSites));
registerRoute("/cockpit/galerie",p=>naviguer(p,["Cockpit","Galerie"],"Chargement de la Galerie",async()=>{ const {cockpitGaleriePage}=await import("../pages/cockpit.js"); return cockpitGaleriePage(p); },(r)=>activerGalerie(r)));
registerRoute("/cockpit/compte",p=>naviguer(p,["Cockpit","Mon compte"],"Chargement de Mon compte",async()=>{ const {cockpitMonComptePage}=await import("../pages/cockpit.js"); return cockpitMonComptePage(p); }));
registerRoute("/cockpit/client/:id",p=>naviguer(p,["Cockpit","Espace client"],"Chargement de l'espace client",()=>cockpitClientPage(p),activerFiltresSites));
registerRoute("/cockpit/site/:domaine",p=>{
  const nom=nomSite(p.domaine);
  return naviguer(p,["Cockpit","Mes sites",p.domaine],`Ouverture de ${nom}`,()=>cockpitSitePage(p),activerVueSite,rendreOuverture(nom));
});
registerRoute("/cockpit/site/:domaine/modifier/:composant",p=>naviguer(p,["Cockpit","Mes sites",p.domaine,"Modifier"],`Chargement de ${COMPOSANTS[p.composant]||"la fonction"} pour ${nomSite(p.domaine)}`,()=>cockpitEditionPage(p),activerEdition));
registerRoute("/cockpit/site/:domaine/construire",p=>{
  const fil=["Cockpit","Mes sites",p.domaine,"Construire"];
  // Changement d'onglet dans le constructeur deja ouvert pour ce site : aucune relecture complete.
  const racine=document.querySelector("#app-page [data-constructeur-racine]");
  if(racine?.dseDomaine===p.domaine&&racine.dseChangerOnglet?.(p.onglet)){ rafraichirNavigation(fil); return; }
  return naviguer(p,fil,`Chargement de ${ONGLETS[p.onglet||"entetes"]||"Construire le site"} pour ${nomSite(p.domaine)}`,()=>cockpitConstruirePage(p),(r,page)=>activerConstruire(r,page,p.domaine));
});
registerRoute("/cockpit/administration",p=>naviguer(p,["Cockpit","Administration"],"Chargement de l'administration",()=>cockpitAdministrationPage(p)));
registerRoute("/cockpit/utilisateurs",p=>naviguer(p,["Cockpit","Utilisateurs et accès"],"Chargement des comptes",()=>cockpitUtilisateursPage(p),activerUtilisateurs));
registerRoute("/cockpit/espaces",p=>naviguer(p,["Cockpit","Espaces"],"Chargement des espaces",async()=>{ const {cockpitEspacesPage}=await import("../pages/cockpit.js"); return cockpitEspacesPage(p); },(r)=>activerFiltresEspaces(r)));
registerRoute("/cockpit/creer",p=>naviguer(p,["Cockpit","Créer un site"],"Chargement de l'assistant",()=>cockpitAssistantPage(p),activerAssistant));
// Anciennes entrees : redirigees vers le cockpit unique.
for (const ancienne of ["/sites","/site/:id","/domaines","/pages","/modules","/medias","/seo","/parametres","/journal"]) registerRoute(ancienne,()=>{ location.replace("#/cockpit"); });
registerRoute("/404",()=>{ document.body.classList.remove("dse-public"); mount(notFoundPage(),["Erreur"]); });
async function boot(){ const user=await initializeAuth(); setState({user}); try{const status=await getHealth();setState({apiStatus:status});}catch(err){showAlert(err.message,"error");} document.querySelector("#app-header").innerHTML=renderHeader(getState().apiStatus); document.querySelector("#app").setAttribute("aria-busy","false"); const redirect=sessionStorage.getItem("dseRedirect");if(redirect){sessionStorage.removeItem("dseRedirect");location.hash=redirect.includes("#")?redirect.split("#")[1]:"/";} await startRouter(); }
boot();
import { accueilPage } from "../pages/accueil.js";
import { monterCatalogue } from "../modules/catalogue/catalogue.js";
import { monterAccesPublic } from "../modules/public/acces.js";
import { monterDemandeCompte } from "../modules/public/demande-compte.js";
import { cockpitMediasPage, activerMedias, cockpitContenusPage, activerContenus } from "../pages/cockpit.js";
registerRoute("/cockpit/contenus", p => naviguer(p, ["Cockpit", "Gestion des contenus"], "Chargement des contenus", () => cockpitContenusPage(p), activerContenus));
import { cockpitSynchronisationsPage, activerSynchronisations } from "../pages/cockpit.js";
registerRoute("/cockpit/synchronisations", p => naviguer(p, ["Cockpit", "Synchronisations"], "Chargement des synchronisations", () => cockpitSynchronisationsPage(p), activerSynchronisations));
registerRoute("/cockpit/site/:domaine/medias", p => naviguer(p, ["Cockpit", "Mes sites", p.domaine, "Médias"], `Chargement des médias pour ${nomSite(p.domaine)}`, () => cockpitMediasPage(p), (r, page) => activerMedias(r, page, p.domaine)));
// Onglet change sur place par le constructeur : le menu suit la fonction active.
document.addEventListener("dse:navigation-locale", () => rafraichirNavigation());
/* Retour immediat sur « Ouvrir » : bouton desactive (aucun double clic) et nom du site memorise pour l'ecran d'ouverture. */
const OUVERTURE_SITE = /^#\/cockpit\/site\/([^/?]+)(\?.*)?$/;
function nomOuverture(domaine) {
  try { return sessionStorage.getItem(`dseOuverture:${domaine}`) || domaine; } catch { return domaine; }
}
document.addEventListener("click", (ev) => {
  const reessai = ev.target.closest?.("[data-reessayer-site]");
  if (reessai && reessai.getAttribute("href") === location.hash) { ev.preventDefault(); resolveRoute(); return; }
  const lien = ev.target.closest?.("a[href^='#/cockpit/site/']");
  if (!lien || ev.button !== 0 || ev.ctrlKey || ev.metaKey || ev.shiftKey || ev.altKey) return;
  const correspondance = OUVERTURE_SITE.exec(lien.getAttribute("href") || "");
  if (!correspondance) return;
  if (lien.getAttribute("aria-disabled") === "true") { ev.preventDefault(); return; }
  const domaine = decodeURIComponent(correspondance[1]);
  try { if (lien.dataset.nom) sessionStorage.setItem(`dseOuverture:${domaine}`, lien.dataset.nom); } catch { /* stockage indisponible */ }
  lien.setAttribute("aria-disabled", "true");
  lien.classList.add("is-chargement");
  if (lien.hasAttribute("data-ouvrir-site")) lien.innerHTML = `<span class="dse-spinner dse-spinner-petit" aria-hidden="true"></span> Ouverture…`;
  // Meme adresse (ex. « Réessayer ») : aucun hashchange, la route est relancee explicitement.
  if (lien.getAttribute("href") === location.hash) { ev.preventDefault(); resolveRoute(); }
});
