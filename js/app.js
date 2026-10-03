import { getHealth } from "../services/health.service.js"; import { initializeAuth } from "./auth.js"; import { setState,getState } from "./state.js"; import { registerRoute,startRouter } from "./router.js"; import { renderHeader } from "../components/header.js"; import { renderSidebar } from "../components/sidebar.js"; import { renderBreadcrumb } from "../components/breadcrumb.js"; import { renderFooter } from "../components/footer.js"; import { showAlert,clearAlert } from "../components/alert.js"; import { notFoundPage } from "../pages/generic.js"; import { cockpitAccueilPage,cockpitSitesPage,cockpitSitePage,cockpitAssistantPage,activerAssistant } from "../pages/cockpit.js";
function mount(page,breadcrumb){ clearAlert(); document.querySelector("#app-sidebar").innerHTML=renderSidebar(); document.querySelector("#app-breadcrumb").innerHTML=renderBreadcrumb(breadcrumb); document.querySelector("#app-page").innerHTML=page; document.querySelector("#app-page").insertAdjacentHTML("beforeend",renderFooter()); document.querySelector("#main").focus(); }
registerRoute("/", async () => {
  const domaine = window.location.hostname
    .trim()
    .toLowerCase();

  const page = await accueilPage(domaine);

  mount(page, ["Accueil"]);

  for (const racineCatalogue of document.querySelectorAll("[data-dse-catalogue], [data-dse-catalogue-builder]")) {
    monterCatalogue(racineCatalogue, { domaine }).catch(() => {
      racineCatalogue.hidden = true;
    });
  }
}); // Cockpit unique : l'interface s'adapte aux droits renvoyes par le serveur.
registerRoute("/cockpit",async p=>mount(await cockpitAccueilPage(p),["Cockpit"]));
registerRoute("/cockpit/sites",async p=>mount(await cockpitSitesPage(p),["Cockpit","Mes sites"]));
registerRoute("/cockpit/site/:domaine",async p=>mount(await cockpitSitePage(p),["Cockpit","Mes sites",p.domaine]));
registerRoute("/cockpit/creer",async p=>{ mount(await cockpitAssistantPage(p),["Cockpit","Créer un site"]); activerAssistant(document.querySelector("#app-page")); });
// Anciennes entrees : redirigees vers le cockpit unique.
for (const ancienne of ["/sites","/site/:id","/domaines","/pages","/modules","/medias","/seo","/parametres","/journal"]) registerRoute(ancienne,()=>{ location.replace("#/cockpit"); });
registerRoute("/404",()=>{ document.body.classList.remove("dse-public"); mount(notFoundPage(),["Erreur"]); });
async function boot(){ const user=await initializeAuth(); setState({user}); try{const status=await getHealth();setState({apiStatus:status});}catch(err){showAlert(err.message,"error");} document.querySelector("#app-header").innerHTML=renderHeader(getState().apiStatus); document.querySelector("#app").setAttribute("aria-busy","false"); const redirect=sessionStorage.getItem("dseRedirect");if(redirect){sessionStorage.removeItem("dseRedirect");location.hash=redirect.includes("#")?redirect.split("#")[1]:"/";} await startRouter(); }
boot();
import { accueilPage } from "../pages/accueil.js";
import { monterCatalogue } from "../modules/catalogue/catalogue.js";