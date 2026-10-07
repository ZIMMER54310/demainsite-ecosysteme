import { escapeHtml, urlSure } from "../public/outils.js";
import { getMenus, apercuMenu, confirmerEdition, initialiserMenusSite } from "../../services/cockpit.service.js";

const e = escapeHtml;
const lienMenu = (domaine, menuRef = "") => `#/cockpit/site/${encodeURIComponent(domaine)}/menu${menuRef ? `?menuRef=${encodeURIComponent(menuRef)}` : ""}`;
const toutesPages = (d) => [...(d.pages || []), ...(d.pagesExternes || []), ...(d.sitesClient || []).flatMap((x) => x.pages || [])];
const parOrdre = (a, b) => Number(a.ordre) - Number(b.ordre) || a.titre.localeCompare(b.titre, "fr");

function entreeHtml(entree, data, niveau = 0) {
  const enfants = data.menu.entrees.filter((x) => x.parentRef === entree.ref).sort(parOrdre);
  const page = toutesPages(data).find((x) => x.ref === entree.pageRef);
  const destination = page ? (page.site ? `${page.site} · ${page.titre}` : page.titre) : entree.url;
  return `<li class="dse-menu-entry" data-entry="${e(entree.ref)}" style="--menu-level:${Math.min(niveau, 5)}">
    <div class="dse-menu-entry__row"><div><strong>${e(entree.titre)}</strong><span class="muted">${e(destination || "Destination à compléter")}</span>
      <small>${entree.visible ? "Visible" : "Masquée"} · ${e(entree.etat)}${entree.nouvelleFenetre ? " · Nouvelle fenêtre" : ""}</small></div>
      <div class="dse-menu-actions">
        <button class="btn btn-mini btn-secondary" type="button" data-entry-edit="${e(entree.ref)}">Modifier</button>
        <button class="btn btn-mini btn-secondary" type="button" data-entry-move="${e(entree.ref)}" data-direction="-1" aria-label="Monter ${e(entree.titre)}">Monter</button>
        <button class="btn btn-mini btn-secondary" type="button" data-entry-move="${e(entree.ref)}" data-direction="1" aria-label="Descendre ${e(entree.titre)}">Descendre</button>
        <button class="btn btn-mini btn-secondary" type="button" data-entry-visible="${e(entree.ref)}" data-visible="${!entree.visible}">${entree.visible ? "Masquer" : "Afficher"}</button>
        <button class="btn btn-mini btn-secondary" type="button" data-entry-remove="${e(entree.ref)}">Retirer logiquement</button>
      </div></div><div data-entry-form="${e(entree.ref)}"></div>
    ${enfants.length ? `<ol>${enfants.map((x) => entreeHtml(x, data, niveau + 1)).join("")}</ol>` : ""}</li>`;
}

function selectOptions(items, value = "", empty = "— Choisir —") {
  return `<option value="">${e(empty)}</option>${items.map((x) => `<option value="${e(x.ref)}"${x.ref === value ? " selected" : ""}>${e(x.titre)}</option>`).join("")}`;
}

function formulaireEntree(donnees, entry = null) {
  const page = entry?.pageRef || "";
  const custom = !page && Boolean(entry?.url);
  const sites = donnees.sitesClient || [];
  const siteCible = page && !donnees.pages.some((x) => x.ref === page) ? sites.find((x) => x.pages.some((p) => p.ref === page)) : null;
  const type = custom ? "lien" : siteCible ? "site" : "page";
  const menuEntrees = donnees.menu.entrees.filter((x) => x.ref !== entry?.ref);
  return `<form class="card dse-menu-form" data-entry-form-submit="${e(entry?.ref || "")}">
    <h3>${entry ? "Modifier l’entrée" : "Ajouter une entrée"}</h3>
    <label>Libellé<input name="titre" maxlength="255" required value="${e(entry?.titre || "")}"></label>
    <label>Type de destination<select name="typeDestination"><option value="page"${type === "page" ? " selected" : ""}>Page du site</option>${sites.length ? `<option value="site"${type === "site" ? " selected" : ""}>Autre site du client</option>` : ""}<option value="lien"${type === "lien" ? " selected" : ""}>Lien personnalisé</option></select></label>
    <label data-destination-site>Site du client<select name="siteRef">${selectOptions(sites.map((x) => ({ ref: x.ref, titre: `${x.titre} (${x.domaine})` })), siteCible?.ref || "", "Choisir un site")}</select></label>
    <label data-destination-page>Page<select name="pageRef">${selectOptions(siteCible ? siteCible.pages : donnees.pages, page, "Choisir une page")}</select></label>
    <label data-destination-url>Lien personnalisé<input name="url" type="url" placeholder="https://…" value="${e(entry?.url || "")}"></label>
    <label>Parent éventuel<select name="parentRef">${selectOptions(menuEntrees, entry?.parentRef || "", "Aucun (niveau principal)")}</select></label>
    <label>Ordre<input name="ordre" type="number" step="1" value="${Number(entry?.ordre || (donnees.menu.entrees.length + 1) * 10)}"></label>
    <label class="dse-menu-check"><input name="visible" type="checkbox"${entry?.visible === false ? "" : " checked"}> Visible</label>
    <label class="dse-menu-check"><input name="nouvelleFenetre" type="checkbox"${entry?.nouvelleFenetre ? " checked" : ""}> Ouvrir dans une nouvelle fenêtre</label>
    <div class="cockpit-actions"><button class="btn btn-primary" type="submit">Enregistrer l’entrée</button>
      <button class="btn btn-secondary" type="button" data-entry-cancel>Annuler</button></div></form>`;
}

function formulaireAffectation(donnees, menu) {
  return `<form class="card dse-menu-form" data-assignment-form>
    <h3>Gérer les emplacements</h3><label>Menu<select name="menuRef" required>${selectOptions(donnees.menus,menu.ref)}</select></label>
    <label>Emplacement<select name="typeEmplacement" required><option value="">— Choisir —</option><option>En-tête</option><option>Pied de page</option></select></label>
    <label>Composant<select name="composantRef" required><option value="">— Choisir —</option></select></label>
    <label>Ordre<input name="ordre" type="number" value="10"></label>
    <div class="cockpit-actions"><button class="btn btn-primary" type="submit">Affecter le menu</button><button class="btn btn-secondary" type="button" data-assignment-cancel>Annuler</button></div></form>`;
}

function apercuHtml(menu, donnees) {
  const tree = menu.entrees.filter((x) => x.visible).sort(parOrdre);
  const htmlItems = (parent = "") => tree.filter((x) => x.parentRef === parent).map((x) => {
    const page = toutesPages(donnees).find((p) => p.ref === x.pageRef);
    const url = urlSure(page?.url || x.url) || "#";
    return `<li><a href="${e(url)}"${x.nouvelleFenetre ? ' target="_blank" rel="noopener noreferrer"' : ""}>${e(x.titre)}</a>${tree.some((y) => y.parentRef === x.ref) ? `<ul>${htmlItems(x.ref)}</ul>` : ""}</li>`;
  }).join("");
  return `<dialog class="dse-menu-preview" data-menu-preview><form method="dialog"><header><h2>Aperçu · ${e(menu.titre)}</h2>
    <button class="btn btn-secondary" value="close" aria-label="Fermer l’aperçu">Fermer</button></header>
    <p class="muted">Identité du site · ${e(donnees.site || "")}</p>
    <div class="dse-menu-preview__sizes"><button type="button" data-preview-size="desktop" aria-pressed="true">Ordinateur</button>
      <button type="button" data-preview-size="tablet" aria-pressed="false">Tablette</button>
      <button type="button" data-preview-size="mobile" aria-pressed="false">Mobile</button></div>
    <nav class="dse-menu-preview__viewport" data-preview-viewport aria-label="${e(menu.titre)}"><ul>${htmlItems()}</ul></nav>
    <p class="muted">Navigation au clavier : Tab pour parcourir les liens, Entrée pour ouvrir la destination.</p></form></dialog>`;
}

export function rendreMenus(donnees, { domaine, menuRef = "", action = "" } = {}) {
  const menu = donnees.menus.find((x) => x.ref === menuRef);
  if (menu) {
    const roots = menu.entrees.filter((x) => !x.parentRef).sort(parOrdre);
    return `<section class="cockpit dse-menus" data-dse-menus data-domaine="${e(domaine)}" data-menu-ref="${e(menu.ref)}">
      <header class="dse-menus__heading"><div><h1>${e(menu.titre)}</h1><p>${e(menu.description || "Organisez les liens et sous-menus de votre navigation.")}</p>
      <span class="badge">${e(menu.etat)}</span></div><a class="btn btn-secondary" href="${e(lienMenu(domaine))}">← Retour aux menus</a></header>
      <section class="card dse-menu-form"><h2>Réglages du menu</h2><form data-menu-edit>
        <label>Nom du menu<input name="titre" maxlength="255" required value="${e(menu.titre)}"></label>
        <label>Description facultative<textarea name="description" rows="3" maxlength="4000">${e(menu.description)}</textarea></label>
        <button class="btn btn-secondary" type="submit">Enregistrer le brouillon</button>
      </form></section>
      <section class="card"><header class="dse-menus__heading"><h2>Éléments du menu</h2>
        <button class="btn btn-primary" type="button" data-entry-add>+ Ajouter une entrée</button></header>
        <div data-entry-new></div><ol class="dse-menu-tree">${roots.map((x) => entreeHtml(x, { ...donnees, menu })).join("") || "<li class=\"muted\">Aucune entrée. Commencez par ajouter une page ou un lien.</li>"}</ol>
      </section><div class="cockpit-actions"><button class="btn btn-secondary" type="button" data-menu-preview-open>Prévisualiser</button>
        <button class="btn btn-primary" type="button" data-menu-publish>${menu.etat === "Publié" ? "Publié" : "Publier"}</button></div>
      <p class="muted" role="status" data-menu-message>${e(action)}</p>${apercuHtml(menu, donnees)}</section>`;
  }
  return `<section class="cockpit dse-menus" data-dse-menus data-domaine="${e(domaine)}" data-peut-initialiser="${donnees.peutInitialiser === true}">
    <header><h1>Menus</h1><p>Créez et organisez les menus de votre site.</p></header>
    <div class="dse-menu-list-actions"><button class="btn btn-primary" type="button" data-menu-create-toggle>+ Créer un menu</button>
      <button class="btn btn-secondary" type="button" data-manage-placements>Gérer les emplacements</button>
      ${donnees.peutInitialiser === true ? '<button class="btn btn-secondary" type="button" data-menu-initialiser>Vérifier / réparer le Menu principal</button>' : ""}</div>
    <div data-menu-create-form hidden><form class="card dse-menu-form" data-menu-create><h2>Nouveau menu</h2>
      <label>Nom du menu<input name="titre" maxlength="255" required></label>
      <label>Description facultative<textarea name="description" rows="3" maxlength="4000"></textarea></label>
      <div class="cockpit-actions"><button class="btn btn-primary" type="submit">Créer le menu</button><button class="btn btn-secondary" type="button" data-menu-create-cancel>Annuler</button></div></form></div>
    <div data-assignment-container></div>
    <div class="dse-menu-cards">${donnees.menus.map((m) => `<article class="card dse-menu-card"><div><h2>${e(m.titre)}</h2>
      <p>${e(m.description || "Aucune description")}</p><dl><dt>Emplacement</dt><dd>${m.emplacements.map(e).join(", ") || "Non affecté"}</dd>
      <dt>Éléments</dt><dd>${m.nombreEntrees}</dd><dt>État</dt><dd>${e(m.etat)}</dd>
      ${m.modifie ? `<dt>Modifié</dt><dd>${e(m.modifie)}</dd>` : ""}</dl></div>
      <div class="cockpit-actions"><a class="btn btn-primary" href="${e(lienMenu(domaine,m.ref))}">Modifier</a>
        <button class="btn btn-secondary" type="button" data-card-preview="${e(m.ref)}">Prévisualiser</button>
        <button class="btn btn-secondary" type="button" data-card-assign="${e(m.ref)}">Affecter</button>
        <button class="btn btn-secondary" type="button" data-menu-deactivate="${e(m.ref)}">Désactiver</button></div></article>`).join("") ||
      `<div class="card"><p>Aucun menu. Créez un menu pour commencer.</p></div>`}</div>
    <p class="muted" role="status" data-menu-message>${e(action)}</p><div data-preview-container></div></section>`;
}

export function activerMenus(root, donnees, { domaine, menuRef = "" } = {}) {
  const host = root.querySelector("[data-dse-menus]");
  if (!host) return;
  const currentMenu = donnees.menus.find((x) => x.ref === menuRef);
  const message = (text, error = false) => {
    const p = host.querySelector("[data-menu-message]");
    if (p) { p.textContent = text; p.classList.toggle("alerte-erreur", error); p.classList.toggle("alerte-succes", !error); }
  };
  host.querySelector("[data-menu-initialiser]")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    message("Vérification du Menu principal en cours…");
    try {
      const resultat = (await initialiserMenusSite(domaine)).donnees;
      const elements = [
        `Menu principal ${resultat?.menu?.cree ? "créé" : "déjà présent"}`,
        resultat?.accueil?.presente ? `Accueil ${resultat.accueil.creee ? "ajoutée" : "déjà présente"}` : resultat?.accueil?.raison,
        resultat?.affectation?.affectee ? `en-tête ${resultat.affectation.creee ? "affecté" : "déjà affecté"}` : resultat?.affectation?.raison
      ].filter(Boolean);
      message(elements.join(" · "), resultat?.aReparer === true);
      if (resultat?.menu?.id) await reload("Menu principal");
      button.disabled = false;
    } catch (err) {
      message(err.message || "La vérification n’a pas abouti.", true);
      button.disabled = false;
    }
  });
  const reload = async (openTitle = "") => {
    const next = (await getMenus(domaine)).donnees;
    if (openTitle) {
      const target = next.menus.find((x) => x.titre.toLocaleLowerCase("fr") === openTitle.toLocaleLowerCase("fr"));
      if (target) { allerA(lienMenu(domaine, target.ref)); return; }
    }
    allerA(lienMenu(domaine, menuRef));
  };
  // Même adresse : aucun hashchange natif, la route est relancée pour réafficher le menu à jour.
  const allerA = (lien) => {
    const cible = lien.startsWith("#") ? lien : `#${lien}`;
    if (location.hash === cible) window.dispatchEvent(new HashChangeEvent("hashchange"));
    else location.hash = cible;
  };
  const confirmer = async (action, params) => {
    const preview = (await apercuMenu(domaine, action, params)).donnees;
    if (!preview?.jeton) throw new Error("L’aperçu sécurisé n’a pas été préparé.");
    const result = (await confirmerEdition(preview.jeton)).donnees;
    if (!result?.succes) throw new Error(result?.erreur || "L’enregistrement SharePoint n’a pas été confirmé.");
  };
  const run = async (button, action, params, openTitle = "") => {
    button.disabled = true;
    try { await confirmer(action, params); await reload(openTitle); }
    catch (err) { message(err.message || "L’opération n’a pas abouti.", true); button.disabled = false; }
  };
  host.querySelector("[data-menu-create-toggle]")?.addEventListener("click", () => {
    const form = host.querySelector("[data-menu-create-form]");
    form.hidden = !form.hidden;
  });
  host.querySelector("[data-menu-create-cancel]")?.addEventListener("click", () => { host.querySelector("[data-menu-create-form]").hidden = true; });
  host.querySelector("[data-menu-create]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget, data = new FormData(form), button = form.querySelector('[type="submit"]');
    const titre = String(data.get("titre") || "").trim();
    button.disabled = true; message("Préparation de la création…");
    try { await confirmer("menu.creer", { titre, description: String(data.get("description") || "") }); await reload(titre); }
    catch (err) { message(err.message, true); button.disabled = false; }
  });
  host.querySelector("[data-menu-edit]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form=event.currentTarget,data=new FormData(form),button=form.querySelector('[type="submit"]');
    await run(button,"menu.modifier",{menuRef,titre:String(data.get("titre")||""),description:String(data.get("description")||"")});
  });
  host.querySelector("[data-entry-add]")?.addEventListener("click", () => {
    const zone=host.querySelector("[data-entry-new]");
    zone.innerHTML=formulaireEntree({ ...donnees, menu: currentMenu },{});
    activerFormulaireEntree(zone);
  });
  host.querySelectorAll("[data-entry-edit]").forEach((button) => button.addEventListener("click", () => {
    const entry=donnees.menus.find((x)=>x.ref===menuRef)?.entrees.find((x)=>x.ref===button.dataset.entryEdit);
    const zone=host.querySelector(`[data-entry-form="${CSS.escape(button.dataset.entryEdit)}"]`);
    if(entry&&zone){zone.innerHTML=formulaireEntree({ ...donnees, menu: currentMenu },entry);activerFormulaireEntree(zone,entry);}
  }));
  function activerFormulaireEntree(zone, entry = null) {
    const form=zone.querySelector("[data-entry-form-submit]");
    if(!form)return;
    const sites=donnees.sitesClient||[];
    const remplirPages=()=>{
      const type=form.elements.typeDestination.value;
      const liste=type==="site"?(sites.find((x)=>x.ref===form.elements.siteRef.value)?.pages||[]):donnees.pages;
      const actuel=form.elements.pageRef.value;
      form.elements.pageRef.innerHTML=selectOptions(liste,liste.some((x)=>x.ref===actuel)?actuel:"",type==="site"&&!form.elements.siteRef.value?"Choisir d’abord un site":"Choisir une page");
    };
    const sync=()=>{const type=form.elements.typeDestination.value;form.querySelector("[data-destination-site]").hidden=type!=="site";
      form.querySelector("[data-destination-page]").hidden=type==="lien";form.querySelector("[data-destination-url]").hidden=type!=="lien";};
    form.elements.typeDestination.addEventListener("change",()=>{sync();remplirPages();});
    form.elements.siteRef.addEventListener("change",remplirPages);sync();
    form.querySelector("[data-entry-cancel]").addEventListener("click",()=>zone.replaceChildren());
    form.addEventListener("submit",async(event)=>{
      event.preventDefault();const data=new FormData(form),button=form.querySelector('[type="submit"]');
      const params={menuRef,entryRef:entry?.ref,titre:String(data.get("titre")||""),typeDestination:String(data.get("typeDestination")||"page"),
        siteRef:String(data.get("siteRef")||""),pageRef:String(data.get("pageRef")||""),url:String(data.get("url")||""),parentRef:String(data.get("parentRef")||""),
        ordre:Number(data.get("ordre")||0),visible:data.has("visible"),nouvelleFenetre:data.has("nouvelleFenetre")};
      await run(button,entry?"entree.modifier":"entree.ajouter",params);
    });
  }
  host.querySelectorAll("[data-entry-move]").forEach((button)=>button.addEventListener("click",()=>{
    const entry=donnees.menus.find((x)=>x.ref===menuRef)?.entrees.find((x)=>x.ref===button.dataset.entryMove);
    if(entry)run(button,"entree.ordre",{menuRef,entryRef:entry.ref,ordre:Math.max(0,entry.ordre+Number(button.dataset.direction)*10)});
  }));
  host.querySelectorAll("[data-entry-visible]").forEach((button)=>button.addEventListener("click",()=>{
    const entry=donnees.menus.find((x)=>x.ref===menuRef)?.entrees.find((x)=>x.ref===button.dataset.entryVisible);
    if(entry)run(button,button.dataset.visible==="true"?"entree.afficher":"entree.masquer",{menuRef,entryRef:entry.ref});
  }));
  host.querySelectorAll("[data-entry-remove]").forEach((button)=>button.addEventListener("click",()=>{
    if(confirm("Retirer logiquement cette entrée ? Elle sera conservée dans SharePoint."))run(button,"entree.retirer",{menuRef,entryRef:button.dataset.entryRemove});
  }));
  host.querySelector("[data-menu-publish]")?.addEventListener("click",async(event)=>{
    const button=event.currentTarget;button.disabled=true;message("Publication des entrées visibles…");
    try{
      const menu=donnees.menus.find(x=>x.ref===menuRef);
      for(const entry of [...menu.entrees].filter(x=>x.visible&&x.etat!=="Publié").sort(parOrdre))
        await confirmer("entree.publier",{menuRef,entryRef:entry.ref});
      await confirmer("menu.publier",{menuRef});
      await reload();
    }catch(err){message(err.message,true);button.disabled=false;}
  });
  host.querySelector("[data-menu-preview-open]")?.addEventListener("click",()=>openPreview(host.querySelector("[data-menu-preview]")));
  host.querySelectorAll("[data-card-preview]").forEach((button)=>button.addEventListener("click",()=>{
    const menu=donnees.menus.find(x=>x.ref===button.dataset.cardPreview);
    if(!menu)return;
    const container=host.querySelector("[data-preview-container]");
    container.innerHTML=apercuHtml(menu,donnees);openPreview(container.querySelector("[data-menu-preview]"));
  }));
  host.querySelectorAll("[data-card-assign]").forEach((button)=>button.addEventListener("click",()=>{
    const menu=donnees.menus.find(x=>x.ref===button.dataset.cardAssign),zone=host.querySelector("[data-assignment-container]");
    zone.innerHTML=formulaireAffectation(donnees,menu);
    bindAssignment(zone,menu);
  }));
  host.querySelector("[data-manage-placements]")?.addEventListener("click",()=>{
    const zone=host.querySelector("[data-assignment-container]");
    zone.innerHTML=formulaireAffectation(donnees,donnees.menus[0]||{ref:"",titre:""});
    bindAssignment(zone,donnees.menus[0]);
  });
  host.querySelectorAll("[data-menu-deactivate]").forEach((button)=>button.addEventListener("click",()=>{
    if(confirm("Désactiver ce menu ? Il sera conservé et pourra être réactivé plus tard."))run(button,"menu.desactiver",{menuRef:button.dataset.menuDeactivate});
  }));
  function bindAssignment(zone,menu){
    const form=zone.querySelector("[data-assignment-form]");
    if(!form)return;
    const emplacement=form.elements.typeEmplacement,component=form.elements.composantRef;
    const remplir=()=>{const options=emplacement.value==="En-tête"?donnees.entetes:emplacement.value==="Pied de page"?donnees.footers:[];
      component.innerHTML=selectOptions(options);};
    emplacement.addEventListener("change",remplir);remplir();
    zone.querySelector("[data-assignment-cancel]")?.addEventListener("click",()=>zone.replaceChildren());
    form.addEventListener("submit",async(event)=>{event.preventDefault();const data=new FormData(form),button=form.querySelector('[type="submit"]');
      await run(button,"affectation.creer",{menuRef:String(data.get("menuRef")||menu?.ref||""),typeEmplacement:String(data.get("typeEmplacement")||""),
        composantRef:String(data.get("composantRef")||""),ordre:Number(data.get("ordre")||10)});});
  }
  function openPreview(dialog){
    if(!dialog)return;dialog.showModal();
    dialog.querySelectorAll("[data-preview-size]").forEach((button)=>button.addEventListener("click",()=>{
      dialog.querySelectorAll("[data-preview-size]").forEach(x=>x.setAttribute("aria-pressed",String(x===button)));
      dialog.querySelector("[data-preview-viewport]").dataset.size=button.dataset.previewSize;
    }));
  }
}
