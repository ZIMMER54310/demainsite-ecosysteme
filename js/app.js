import { getHealth } from "../services/health.service.js"; import { initializeAuth } from "./auth.js"; import { setState,getState } from "./state.js"; import { registerRoute,startRouter } from "./router.js"; import { renderHeader } from "../components/header.js"; import { renderSidebar } from "../components/sidebar.js"; import { renderBreadcrumb } from "../components/breadcrumb.js"; import { renderFooter } from "../components/footer.js"; import { showAlert,clearAlert } from "../components/alert.js"; import { notFoundPage } from "../pages/generic.js"; import { cockpitAccueilPage,cockpitSitesPage,cockpitClientPage,cockpitSitePage,activerVueSite,cockpitAssistantPage,activerAssistant,activerFiltresSites,cockpitEditionPage,activerEdition,cockpitAdministrationPage,cockpitUtilisateursPage,activerUtilisateurs,cockpitConstruirePage,activerConstruire } from "../pages/cockpit.js";
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
registerRoute("/cockpit",async p=>mount(await cockpitAccueilPage(p),["Cockpit"]));
registerRoute("/cockpit/sites",async p=>{ mount(await cockpitSitesPage(p),["Cockpit","Mes sites"]); activerFiltresSites(document.querySelector("#app-page")); });
registerRoute("/cockpit/galerie",async p=>{ const {cockpitGaleriePage,activerGalerie}=await import("../pages/cockpit.js"); mount(await cockpitGaleriePage(p),["Cockpit","Galerie"]); activerGalerie(document.querySelector("#app-page")); });
registerRoute("/cockpit/compte",async p=>{ const {cockpitMonComptePage}=await import("../pages/cockpit.js"); mount(await cockpitMonComptePage(p),["Cockpit","Mon compte"]); });
registerRoute("/cockpit/client/:id",async p=>{ const html=await cockpitClientPage(p); mount(html,["Cockpit","Espace client"]); activerFiltresSites(document.querySelector("#app-page")); });
registerRoute("/cockpit/site/:domaine",async p=>{ mount(await cockpitSitePage(p),["Cockpit","Mes sites",p.domaine]); activerVueSite(document.querySelector("#app-page")); });
registerRoute("/cockpit/site/:domaine/modifier/:composant",async p=>{ mount(await cockpitEditionPage(p),["Cockpit","Mes sites",p.domaine,"Modifier"]); activerEdition(document.querySelector("#app-page")); });
registerRoute("/cockpit/site/:domaine/construire",async p=>{ const page=await cockpitConstruirePage(p); mount(page.html,["Cockpit","Mes sites",p.domaine,"Construire"]); activerConstruire(document.querySelector("#app-page"),page,p.domaine); });
registerRoute("/cockpit/administration",async p=>mount(await cockpitAdministrationPage(p),["Cockpit","Administration"]));
registerRoute("/cockpit/utilisateurs",async p=>{ mount(await cockpitUtilisateursPage(p),["Cockpit","Utilisateurs et accès"]); activerUtilisateurs(document.querySelector("#app-page")); });
registerRoute("/cockpit/espaces",async p=>{ const {cockpitEspacesPage,activerFiltresEspaces}=await import("../pages/cockpit.js"); mount(await cockpitEspacesPage(p),["Cockpit","Espaces"]); activerFiltresEspaces(document.querySelector("#app-page")); });
registerRoute("/cockpit/creer",async p=>{ mount(await cockpitAssistantPage(p),["Cockpit","Créer un site"]); activerAssistant(document.querySelector("#app-page")); });
// Anciennes entrees : redirigees vers le cockpit unique.
for (const ancienne of ["/sites","/site/:id","/domaines","/pages","/modules","/medias","/seo","/parametres","/journal"]) registerRoute(ancienne,()=>{ location.replace("#/cockpit"); });
registerRoute("/404",()=>{ document.body.classList.remove("dse-public"); mount(notFoundPage(),["Erreur"]); });
async function boot(){ const user=await initializeAuth(); setState({user}); try{const status=await getHealth();setState({apiStatus:status});}catch(err){showAlert(err.message,"error");} document.querySelector("#app-header").innerHTML=renderHeader(getState().apiStatus); document.querySelector("#app").setAttribute("aria-busy","false"); const redirect=sessionStorage.getItem("dseRedirect");if(redirect){sessionStorage.removeItem("dseRedirect");location.hash=redirect.includes("#")?redirect.split("#")[1]:"/";} await startRouter(); }
boot();
import { accueilPage } from "../pages/accueil.js";
import { monterCatalogue } from "../modules/catalogue/catalogue.js";
import { monterAccesPublic } from "../modules/public/acces.js";
import { cockpitMediasPage, activerMedias, cockpitContenusPage, activerContenus } from "../pages/cockpit.js";
registerRoute("/cockpit/contenus", async p => {
  mount(await cockpitContenusPage(p), ["Cockpit", "Gestion des contenus"]);
  activerContenus(document.querySelector("#app-page"));
});
import { cockpitSynchronisationsPage, activerSynchronisations } from "../pages/cockpit.js";
registerRoute("/cockpit/synchronisations", async p => {
  mount(await cockpitSynchronisationsPage(p), ["Cockpit", "Synchronisations"]);
  activerSynchronisations(document.querySelector("#app-page"));
});
registerRoute("/cockpit/site/:domaine/medias", async p => {
  const page = await cockpitMediasPage(p);
  mount(page.html, ["Cockpit", "Mes sites", p.domaine, "Médias"]);
  activerMedias(document.querySelector("#app-page"), page, p.domaine);
});