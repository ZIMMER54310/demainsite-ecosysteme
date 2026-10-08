"use strict";

const crypto = require("node:crypto");
const dse = require("./dse");
const ecriture = require("./ecriture");

const REFS = crypto.randomBytes(32);
const normaliser = (v) => String(v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .toUpperCase().replace(/[^A-Z0-9]/g, "");
const empreinte = (parts) => crypto.createHash("sha256").update(parts.map((x) => normaliser(x)).join("|")).digest("hex");
const ref = (type, id) => `${type}.${crypto.createHmac("sha256", REFS).update(`${type}:${id}`).digest("hex").slice(0, 32)}`;
// SharePoint stocke les dates à la seconde : sans cela la relecture ne correspond jamais.
const maintenantSharePoint = () => new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
const isRef = (candidate, type, id) => candidate === ref(type, id);
const pathList = (g, name) => {
  const liste = dse.trouverListe(g.listes, name);
  if (!liste) throw new Error("Les données de menus ne sont pas disponibles.");
  return liste;
};

const ATTENDUS = {
  "OBJ-MENU": { OBJSITEPUBLIC: "OBJ-SITE-PUBLIC", OBJACTIF: "OBJ-ACTIF", OBJVALIDE: "OBJ-VALIDE" },
  "OBJ-MENU-ENTREE": { OBJMENU: "OBJ-MENU", OBJPAGESSITE: "OBJ-PAGES-SITE", ENTREEPARENTE: "OBJ-MENU-ENTREE", OBJACTIF: "OBJ-ACTIF", OBJVALIDE: "OBJ-VALIDE" },
  "OBJ-MENU-AFFECTATION": { OBJMENU: "OBJ-MENU", OBJENTETESITE: "OBJ-ENTETE-SITE", OBJFOOTERSITE: "OBJ-FOOTER-SITE", OBJACTIF: "OBJ-ACTIF", OBJVALIDE: "OBJ-VALIDE" }
};
const CHAMPS = {
  "OBJ-MENU": ["Title", "OBJSITEPUBLIC", "DESCRIPTION", "OBJACTIF", "OBJVALIDE", "EMPREINTEMENU", "DATEMODIFICATION"],
  "OBJ-MENU-ENTREE": ["Title", "OBJMENU", "OBJPAGESSITE", "URLPERSONNALISEE", "ENTREEPARENTE", "ORDRE", "OUVERTURENOUVELLEFENETRE", "OBJACTIF", "OBJVALIDE", "EMPREINTEENTREE"],
  "OBJ-MENU-AFFECTATION": ["Title", "OBJMENU", "OBJENTETESITE", "OBJFOOTERSITE", "TYPEEMPLACEMENT", "ORDRE", "OBJACTIF", "OBJVALIDE", "EMPREINTEAFFECTATION"]
};
const typeColonne = (c) => c.text ? "text" : c.lookup ? "lookup" : c.number ? "number" :
  c.boolean ? "boolean" : c.dateTime ? "dateTime" : null;
const COLONNES_REQUISES = {
  "OBJ-MENU": { Title: "text", OBJSITEPUBLIC: "lookup", DESCRIPTION: "text", OBJACTIF: "lookup", OBJVALIDE: "lookup", EMPREINTEMENU: "text", DATEMODIFICATION: "dateTime" },
  "OBJ-MENU-ENTREE": { Title: "text", OBJMENU: "lookup", OBJPAGESSITE: "lookup", URLPERSONNALISEE: "text", ENTREEPARENTE: "lookup", ORDRE: "number", OUVERTURENOUVELLEFENETRE: "boolean", OBJACTIF: "lookup", OBJVALIDE: "lookup", EMPREINTEENTREE: "text" },
  "OBJ-MENU-AFFECTATION": { Title: "text", OBJMENU: "lookup", OBJENTETESITE: "lookup", OBJFOOTERSITE: "lookup", TYPEEMPLACEMENT: "text", ORDRE: "number", OBJACTIF: "lookup", OBJVALIDE: "lookup", EMPREINTEAFFECTATION: "text" }
};
const CONTRAINTES = {
  "OBJ-MENU": { Title: { required: true }, OBJSITEPUBLIC: { required: true }, OBJACTIF: { required: true }, OBJVALIDE: { required: true }, EMPREINTEMENU: { required: true, unique: true, indexed: true } },
  "OBJ-MENU-ENTREE": { Title: { required: true }, OBJMENU: { required: true }, ORDRE: { required: true }, OBJACTIF: { required: true }, OBJVALIDE: { required: true }, EMPREINTEENTREE: { required: true, unique: true, indexed: true } },
  "OBJ-MENU-AFFECTATION": { Title: { required: true }, OBJMENU: { required: true }, TYPEEMPLACEMENT: { required: true }, OBJACTIF: { required: true }, OBJVALIDE: { required: true }, EMPREINTEAFFECTATION: { required: true, unique: true, indexed: true } }
};

async function schema(g) {
  const ids = {};
  const colonnes = {};
  const erreurs = [];
  for (const nom of Object.keys(COLONNES_REQUISES)) {
    const liste = pathList(g, nom);
    ids[nom] = liste.id;
    colonnes[nom] = await dse.chargerColonnesListe(g.token, g.siteGraphId, liste.id, { contraintes: true });
    const internes = new Set(colonnes[nom].map((c) => c.name));
    for (const [interne, type] of Object.entries(COLONNES_REQUISES[nom])) {
      const c = colonnes[nom].find((x) => x.name === interne);
      if (!c || typeColonne(c) !== type) erreurs.push(`${nom}.${interne}`);
      const attendu = CONTRAINTES[nom][interne];
      if (c && attendu?.required && !c.required) erreurs.push(`${nom}.${interne}:required`);
      if (c && attendu?.unique && !c.enforceUniqueValues) erreurs.push(`${nom}.${interne}:unique`);
      if (c && attendu?.indexed && !c.indexed) erreurs.push(`${nom}.${interne}:indexed`);
    }
    for (const [interne, cibleNom] of Object.entries(ATTENDUS[nom])) {
      const c = colonnes[nom].find((x) => x.name === interne);
      const cible = dse.trouverListe(g.listes, cibleNom);
      if (!c || !c.lookup || c.lookup.allowMultipleValues || !cible ||
        c.lookup.listId.toLowerCase() !== cible.id.toLowerCase()) erreurs.push(`${nom}.${interne}->${cibleNom}`);
    }
    if (nom === "OBJ-MENU" && !internes.has("EMPREINTEMENU") ||
      nom === "OBJ-MENU-ENTREE" && !internes.has("EMPREINTEENTREE") ||
      nom === "OBJ-MENU-AFFECTATION" && !internes.has("EMPREINTEAFFECTATION")) erreurs.push(`${nom}.EMPREINTE`);
  }
  if (erreurs.length) throw new Error(`Schéma multi-menus incomplet ou incohérent (${erreurs.join(", ")}).`);
  return { ids, colonnes };
}

function col(schemaData, list, internal) {
  const c = schemaData.colonnes[list].find((x) => x.name === internal);
  if (!c) throw new Error("Le schéma des menus a changé. Rechargez la page.");
  return c;
}
function lookupField(schemaData, list, internal, id) {
  const c = col(schemaData, list, internal);
  if (!c.lookup || c.lookup.allowMultipleValues) throw new Error("Une relation du menu n'est pas configurée correctement.");
  return { [`${c.name}LookupId`]: id == null ? null : String(id) };
}
function simpleField(schemaData, list, internal, value) {
  const c = col(schemaData, list, internal);
  if (!(c.text || c.number || c.boolean || c.dateTime)) throw new Error("Un champ du menu a un type inattendu.");
  return { [c.name]: value };
}
async function listeItems(g, s, name, select) {
  const liste = dse.trouverListe(g.listes, name);
  if (!liste) return [];
  const items = await ecriture.collecterFrais(g,
    `/sites/${g.siteGraphId}/lists/${liste.id}/items?$expand=fields($select=${[...new Set(["Title", ...select])].join(",")})&$top=500`);
  return items.map((x) => ({ id: String(x.id), fields: x.fields || {} }));
}
async function siteLookup(g, listName) {
  const list=pathList(g,listName);
  const cols=await dse.chargerColonnesListe(g.token,g.siteGraphId,list.id);
  const siteList=dse.trouverListe(g.listes,"OBJ-SITE-PUBLIC");
  const matches=cols.filter(c=>c.lookup&&siteList&&c.lookup.listId.toLowerCase()===siteList.id.toLowerCase()&&!c.lookup.allowMultipleValues);
  if(matches.length!==1)throw new Error(`${listName}: relation au site indisponible ou ambiguë.`);
  return {list,column:matches[0]};
}
async function lookupVers(g, listName, cibleNom) {
  const liste=pathList(g,listName), cible=pathList(g,cibleNom);
  const cols=await dse.chargerColonnesListe(g.token,g.siteGraphId,liste.id);
  const matches=cols.filter(c=>c.lookup&&c.lookup.listId.toLowerCase()===cible.id.toLowerCase()&&!c.lookup.allowMultipleValues);
  if(matches.length!==1)throw new Error(`${listName}: relation vers ${cibleNom} indisponible ou ambiguë.`);
  return {list:liste,column:matches[0]};
}
const val = (fields, schemaData, list, name) => {
  const c = col(schemaData, list, name);
  return c.lookup ? String(fields[`${c.name}LookupId`] || "") : fields[c.name];
};
const etatOui = async (g) => {
  const [actif, valide] = await Promise.all([
    listeItems(g, null, "OBJ-ACTIF", []), listeItems(g, null, "OBJ-VALIDE", [])
  ]);
  const ouiActif = actif.filter((x) => /^oui\b/i.test(String(x.fields.Title || "")));
  const nonActif = actif.filter((x) => /^non\b/i.test(String(x.fields.Title || "")));
  const brouillons = actif.filter((x) => /^brouillon\b/i.test(String(x.fields.Title || "")));
  const ouiValide = valide.filter((x) => /^oui\b/i.test(String(x.fields.Title || "")));
  const nonValide = valide.filter((x) => /^non\b/i.test(String(x.fields.Title || "")));
  if ([ouiActif, nonActif, brouillons, ouiValide, nonValide].some((x) => x.length !== 1)) {
    throw new Error("Les états nécessaires aux menus doivent être configurés sans ambiguïté.");
  }
  return { actif: ouiActif[0].id, inactif: nonActif[0].id, brouillon: brouillons[0].id, valide: ouiValide[0].id, invalide: nonValide[0].id };
};

/* Autres sites principaux du même client (ID natifs, catalogue SharePoint), avec leur domaine principal. */
async function autresSitesDuClient(siteId) {
  const perimetre = require("./perimetre");
  const index = await require("./catalogue-source").obtenirIndex();
  const groupes = perimetre.regrouperSites([...index.sites.values()]);
  const courant = groupes.find((x) => String(x.id) === String(siteId));
  if (!courant?.clientId) return [];
  return groupes.filter((x) => String(x.id) !== String(siteId) && String(x.clientId) === String(courant.clientId))
    .map((x) => ({ id: String(x.id), titre: String(x.titre || ""), domaine: perimetre.domainesDuSite(x).principal,
      publie: x.actif === true && x.valide === true }))
    .filter((x) => x.domaine);
}
const urlAbsolue = (domaine, chemin) => {
  const c = String(chemin || "").trim();
  if (/^https?:\/\//i.test(c)) return c;
  return `https://${domaine}${c.startsWith("/") ? c : `/${c}`}`;
};

async function lire({ siteId, siteAccessible = null }) {
  const g = await ecriture.contexteGraph();
  const s = await schema(g);
  const [menusRaw, entreesRaw, affectationsRaw, statuts, pagesInfo, headersInfo, footersInfo] = await Promise.all([
    listeItems(g, s, "OBJ-MENU", s.colonnes["OBJ-MENU"].map((c) => c.lookup ? `${c.name}LookupId` : c.name)),
    listeItems(g, s, "OBJ-MENU-ENTREE", s.colonnes["OBJ-MENU-ENTREE"].map((c) => c.lookup ? `${c.name}LookupId` : c.name)),
    listeItems(g, s, "OBJ-MENU-AFFECTATION", s.colonnes["OBJ-MENU-AFFECTATION"].map((c) => c.lookup ? `${c.name}LookupId` : c.name)),
    etatOui(g),
    siteLookup(g, "OBJ-PAGES-SITE"), siteLookup(g, "OBJ-ENTETE-SITE"), siteLookup(g, "OBJ-FOOTER-SITE")
  ]);
  const [pageActifInfo,pageValideInfo]=await Promise.all([
    lookupVers(g,"OBJ-PAGES-SITE","OBJ-ACTIF"),lookupVers(g,"OBJ-PAGES-SITE","OBJ-VALIDE")
  ]);
  const pageColumns=await dse.chargerColonnesListe(g.token,g.siteGraphId,pagesInfo.list.id);
  const pageUrl=pageColumns.find(c=>normaliser(c.name)==="URL"||normaliser(c.displayName)==="URL");
  const [pagesRaw, entetesRaw, footersRaw] = await Promise.all([
    listeItems(g, null, "OBJ-PAGES-SITE", [`${pagesInfo.column.name}LookupId`,`${pageActifInfo.column.name}LookupId`,
      `${pageValideInfo.column.name}LookupId`,...(pageUrl?[pageUrl.name]:[])]),
    listeItems(g, null, "OBJ-ENTETE-SITE", [`${headersInfo.column.name}LookupId`]),
    listeItems(g, null, "OBJ-FOOTER-SITE", [`${footersInfo.column.name}LookupId`])
  ]);
  const site = String(siteId);
  const publiable = (item, list) =>
    val(item.fields, s, list, "OBJACTIF") === statuts.actif &&
    val(item.fields, s, list, "OBJVALIDE") === statuts.valide;
  const menusRawSite = menusRaw.filter((m) => val(m.fields, s, "OBJ-MENU", "OBJSITEPUBLIC") === site);
  const menusIds = new Set(menusRawSite.map((x) => x.id));
  const entreeSite = entreesRaw.filter((x) => menusIds.has(val(x.fields, s, "OBJ-MENU-ENTREE", "OBJMENU")));
  const affectationSite = affectationsRaw.filter((x) =>
    val(x.fields, s, "OBJ-MENU-AFFECTATION", "OBJMENU") && menusIds.has(val(x.fields, s, "OBJ-MENU-AFFECTATION", "OBJMENU")));
  const pages = pagesRaw.filter((p) => String(p.fields[`${pagesInfo.column.name}LookupId`] || "") === site)
    .map((p) => ({ ref: ref("page", p.id), titre: String(p.fields.Title || ""), url: String(pageUrl?p.fields[pageUrl.name]||"":""),
      publie: String(p.fields[`${pageActifInfo.column.name}LookupId`]||"")===statuts.actif&&
        String(p.fields[`${pageValideInfo.column.name}LookupId`]||"")===statuts.valide }));
  const autres = await autresSitesDuClient(site);
  const pageExterne = (p, autre) => ({ ref: ref("page", p.id), titre: String(p.fields.Title || ""),
    url: urlAbsolue(autre.domaine, pageUrl ? p.fields[pageUrl.name] : ""), site: autre.titre, siteRef: ref("site", autre.id),
    publie: autre.publie && String(p.fields[`${pageActifInfo.column.name}LookupId`]||"")===statuts.actif&&
      String(p.fields[`${pageValideInfo.column.name}LookupId`]||"")===statuts.valide });
  const autreDe = (p) => autres.find((a) => a.id === String(p.fields[`${pagesInfo.column.name}LookupId`] || ""));
  const pagesLiees = new Set(entreeSite.map((x) => val(x.fields, s, "OBJ-MENU-ENTREE", "OBJPAGESSITE")).filter(Boolean));
  const pagesExternes = pagesRaw.filter((p) => pagesLiees.has(String(p.id)) && autreDe(p)).map((p) => pageExterne(p, autreDe(p)));
  const sitesClient = typeof siteAccessible === "function"
    ? autres.filter((a) => siteAccessible(a.id)).map((a) => ({ ref: ref("site", a.id), titre: a.titre, domaine: a.domaine,
      pages: pagesRaw.filter((p) => autreDe(p)?.id === a.id).map((p) => pageExterne(p, a))
        .sort((x, y) => x.titre.localeCompare(y.titre, "fr")) }))
    : [];
  const entrees = entreeSite.map((x) => ({
    ref: ref("entry", x.id),
    titre: String(x.fields.Title || ""),
    menuRef: ref("menu", val(x.fields, s, "OBJ-MENU-ENTREE", "OBJMENU")),
    parentRef: val(x.fields, s, "OBJ-MENU-ENTREE", "ENTREEPARENTE") ? ref("entry", val(x.fields, s, "OBJ-MENU-ENTREE", "ENTREEPARENTE")) : "",
    pageRef: val(x.fields, s, "OBJ-MENU-ENTREE", "OBJPAGESSITE") ? ref("page", val(x.fields, s, "OBJ-MENU-ENTREE", "OBJPAGESSITE")) : "",
    url: String(val(x.fields, s, "OBJ-MENU-ENTREE", "URLPERSONNALISEE") || ""),
    ordre: Number(val(x.fields, s, "OBJ-MENU-ENTREE", "ORDRE") || 0),
    nouvelleFenetre: Boolean(val(x.fields, s, "OBJ-MENU-ENTREE", "OUVERTURENOUVELLEFENETRE")),
    visible: val(x.fields, s, "OBJ-MENU-ENTREE", "OBJACTIF") === statuts.actif,
    etat: publiable(x, "OBJ-MENU-ENTREE") ? "Publié" : "Brouillon"
  }));
  const titresEntetes = new Map(entetesRaw.filter((x) => String(x.fields[`${headersInfo.column.name}LookupId`] || "") === site)
    .map((x) => [x.id, String(x.fields.Title || "")]));
  const titresFooters = new Map(footersRaw.filter((x) => String(x.fields[`${footersInfo.column.name}LookupId`] || "") === site)
    .map((x) => [x.id, String(x.fields.Title || "")]));
  const affectations = affectationSite.map((x) => {
    const eid = val(x.fields, s, "OBJ-MENU-AFFECTATION", "OBJENTETESITE");
    const fid = val(x.fields, s, "OBJ-MENU-AFFECTATION", "OBJFOOTERSITE");
    return { ref: ref("assignment", x.id), menuRef: ref("menu", val(x.fields, s, "OBJ-MENU-AFFECTATION", "OBJMENU")),
      emplacement: String(val(x.fields, s, "OBJ-MENU-AFFECTATION", "TYPEEMPLACEMENT") || ""),
      composant: eid ? "En-tête" : fid ? "Pied de page" : "Non affecté",
      composantRef: eid ? ref("header",eid) : fid ? ref("footer",fid) : "",
      composantTitre: (eid && titresEntetes.get(eid)) || (fid && titresFooters.get(fid)) || "",
      actif: publiable(x, "OBJ-MENU-AFFECTATION") };
  });
  const menus = menusRawSite.map((x) => ({
    ref: ref("menu", x.id), titre: String(x.fields.Title || ""), description: String(val(x.fields, s, "OBJ-MENU", "DESCRIPTION") || ""),
    etat: publiable(x, "OBJ-MENU") ? "Publié" : val(x.fields, s, "OBJ-MENU", "OBJACTIF") === statuts.inactif ? "Désactivé" : "Brouillon",
    modifie: String(val(x.fields, s, "OBJ-MENU", "DATEMODIFICATION") || ""),
    nombreEntrees: entrees.filter((e) => e.menuRef === ref("menu", x.id)).length,
    emplacements: affectations.filter((a) => a.menuRef === ref("menu", x.id)).map((a) => `${a.composant}${a.composantTitre ? ` · ${a.composantTitre}` : ""}`),
    entrees: entrees.filter((e) => e.menuRef === ref("menu", x.id))
  }));
  return { menus, pages, pagesExternes, sitesClient, affectations, entetes: entetesRaw.filter((x) => String(x.fields[`${headersInfo.column.name}LookupId`] || "") === site)
    .map((x) => ({ ref: ref("header", x.id), titre: String(x.fields.Title || "") })),
  footers: footersRaw.filter((x) => String(x.fields[`${footersInfo.column.name}LookupId`] || "") === site)
    .map((x) => ({ ref: ref("footer", x.id), titre: String(x.fields.Title || "") })) };
}

async function publicMenu({siteId,headerId}) {
  if(!siteId||!headerId)return null;
  const data=await lire({siteId});
  const headerRef=ref("header",String(headerId));
  const affectations=data.affectations.filter(a=>a.actif&&a.composant==="En-tête"&&a.composantRef===headerRef);
  if(!affectations.length)return null;
  if(affectations.length>1)throw new Error("Plusieurs menus publiés sont affectés au même en-tête.");
  const menu=data.menus.find(m=>m.ref===affectations[0].menuRef&&m.etat==="Publié");
  if(!menu)return null;
  const pages=new Map([...data.pages,...data.pagesExternes].map(p=>[p.ref,p]));
  const entrees=menu.entrees.filter(x=>x.visible&&x.etat==="Publié");
  const construire=(parent="", vus=new Set(), depth=0)=>{
    if(depth>20)return [];
    return entrees.filter(x=>x.parentRef===parent&&!vus.has(x.ref)).sort((a,b)=>a.ordre-b.ordre||a.titre.localeCompare(b.titre,"fr"))
      .flatMap(x=>{
        const page=x.pageRef?pages.get(x.pageRef):null;
        if(x.pageRef&&(!page||!page.publie))return [];
        const href=urlSecurisee(page?.url||x.url);
        if(!href)return [];
        const branche=new Set(vus);branche.add(x.ref);
        return [{titre:x.titre,url:href,nouvelleFenetre:x.nouvelleFenetre,enfants:construire(x.ref,branche,depth+1)}];
      });
  };
  // Le titre du menu est interne aux concepteurs : jamais transmis au site public.
  return {entrees:construire()};
}

function trouverRef(items, candidate, type) {
  const item = items.find((x) => isRef(candidate, type, x.id));
  if (!item) throw new Error("Cet élément n’existe plus dans le site sélectionné.");
  return item;
}

function urlSecurisee(value) {
  const text = String(value || "").trim();
  let url;
  try { url = new URL(text, "https://dse.invalid"); } catch { throw new Error("Saisissez une adresse web valide."); }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password ||
    text.startsWith("//") || /[\u0000-\u001f\u007f]/.test(text)) throw new Error("Cette adresse web n’est pas autorisée.");
  return text;
}

async function preparer({ identite, siteId, siteNom, action, params, siteAccessible = null }) {
  const g = await ecriture.contexteGraph();
  const s = await schema(g);
  const states = await etatOui(g);
  const [menusAll, entriesAll, assignmentsRaw, pagesInfo, headersInfo, footersInfo] = await Promise.all([
    listeItems(g,s,"OBJ-MENU",s.colonnes["OBJ-MENU"].map(c=>c.lookup?`${c.name}LookupId`:c.name)),
    listeItems(g,s,"OBJ-MENU-ENTREE",s.colonnes["OBJ-MENU-ENTREE"].map(c=>c.lookup?`${c.name}LookupId`:c.name)),
    listeItems(g,s,"OBJ-MENU-AFFECTATION",s.colonnes["OBJ-MENU-AFFECTATION"].map(c=>c.lookup?`${c.name}LookupId`:c.name)),
    siteLookup(g,"OBJ-PAGES-SITE"),siteLookup(g,"OBJ-ENTETE-SITE"),siteLookup(g,"OBJ-FOOTER-SITE")
  ]);
  const pageColumns=await dse.chargerColonnesListe(g.token,g.siteGraphId,pagesInfo.list.id);
  const pageUrl=pageColumns.find(c=>normaliser(c.name)==="URL"||normaliser(c.displayName)==="URL");
  const [pagesAll,entetesAll,footersAll]=await Promise.all([
    listeItems(g,null,"OBJ-PAGES-SITE",[`${pagesInfo.column.name}LookupId`,...(pageUrl?[pageUrl.name]:[])]),
    listeItems(g,null,"OBJ-ENTETE-SITE",[`${headersInfo.column.name}LookupId`]),
    listeItems(g,null,"OBJ-FOOTER-SITE",[`${footersInfo.column.name}LookupId`])
  ]);
  const site=String(siteId);
  const menus=menusAll.filter(x=>String(x.fields[`${col(s,"OBJ-MENU","OBJSITEPUBLIC").name}LookupId`]||"")===site);
  const menuIds=new Set(menus.map(x=>x.id));
  const entries=entriesAll.filter(x=>menuIds.has(String(x.fields[`${col(s,"OBJ-MENU-ENTREE","OBJMENU").name}LookupId`]||"")));
  const pages=pagesAll.filter(x=>String(x.fields[`${pagesInfo.column.name}LookupId`]||"")===site);
  // Page d'un autre site du même client, uniquement si l'utilisateur a accès à ce site.
  const pageAutreSite=async()=>{
    const autres=(await autresSitesDuClient(site)).filter(a=>typeof siteAccessible==="function"&&siteAccessible(a.id));
    const cible=autres.find(a=>isRef(params.siteRef,"site",a.id));
    if(!cible)throw new Error("Ce site n’est pas disponible pour votre compte ou n’appartient pas au même client.");
    const page=trouverRef(pagesAll.filter(x=>String(x.fields[`${pagesInfo.column.name}LookupId`]||"")===cible.id),params.pageRef,"page");
    return page.id;
  };
  const entetes=entetesAll.filter(x=>String(x.fields[`${headersInfo.column.name}LookupId`]||"")===site);
  const footers=footersAll.filter(x=>String(x.fields[`${footersInfo.column.name}LookupId`]||"")===site);
  const assignments=assignmentsRaw.filter(x=>menuIds.has(String(x.fields[`${col(s,"OBJ-MENU-AFFECTATION","OBJMENU").name}LookupId`]||"")));
  const name = (v, max=255) => {
    const out=String(v||"").replace(/[\u0000-\u001f\u007f]/g," ").trim().slice(0,max);
    if (!out) throw new Error("Un nom ou un libellé est requis.");
    return out;
  };
  const mk = (type, listName, itemId, fields, oldFields, label, op="menu.modifier") => {
    const list=pathList(g,listName);
    return ecriture.emettreJeton(identite,{
      type:itemId?"modifier":"ajouter",portee:"menus",fonction:"menu",operation:op,siteId:String(siteId),
      listId:list.id,itemId:itemId||undefined,champs:fields,avant:ecriture.hash(Object.fromEntries(Object.entries(oldFields||{}).map(([k,v])=>[k,v===undefined||v===null?"":String(v)]))),
      selectionChamps:Object.keys(fields),journalComptes:true,cleDoublon:`menus:${type}:${empreinte([siteId,itemId||"",JSON.stringify(fields)])}`,
      action:`Menus : ${action}`,nom:`${label} — ${siteNom}`,
      notes:`site=${siteId};type=${type}`,
      verifierCible:async(frais)=>{
        const live=await schema(frais);
        if(live.ids[listName]!==list.id) return "La structure SharePoint du menu a changé.";
        if(itemId){
          const current=await fraisItem(frais,list.id,itemId,Object.keys(fields).concat(
            s.colonnes[listName].filter(c=>c.lookup).map(c=>`${c.name}LookupId`)));
          if(!current) return "Cet élément n’existe plus.";
          if(listName==="OBJ-MENU") {
            if(String(current.fields[`${col(s,"OBJ-MENU","OBJSITEPUBLIC").name}LookupId`]||"")!==String(siteId))return "Ce menu n’appartient plus au site autorisé.";
          } else {
            const menuId=String(current.fields[`${col(s,listName,"OBJMENU").name}LookupId`]||"");
            const menuRow=await fraisItem(frais,live.ids["OBJ-MENU"],menuId,[`${col(s,"OBJ-MENU","OBJSITEPUBLIC").name}LookupId`]);
            if(!menuRow||String(menuRow.fields[`${col(s,"OBJ-MENU","OBJSITEPUBLIC").name}LookupId`]||"")!==String(siteId))return "L’élément n’appartient plus au site autorisé.";
          }
        }
        return null;
      },
      ...(itemId?{}:{doublon:async(frais)=>{
        const c=await schema(frais), f=Object.keys(fields).find(k=>/EMPREINTE/.test(k));
        if(!f)return false;
        const xs=await listeItems(frais,c,listName,[f]);
        return xs.some(x=>x.fields[f]===fields[f]);
      }})
    }).jeton;
  };
  async function fraisItem(frais,listId,itemId,fields){
    try { return await dse.graphSansCache(frais.token,`/sites/${frais.siteGraphId}/lists/${listId}/items/${itemId}?$expand=fields($select=${fields.join(",")})`); }
    catch (e) { if(e.status===404)return null; throw e; }
  }
  let fields={}, old={}, type="", listName="OBJ-MENU", itemId=null, label="", operation="menu.modifier";
  if(action==="menu.creer"){
    const titre=name(params.titre);
    if(menus.some(x=>normaliser(x.fields.Title)===normaliser(titre)))
      throw new Error("Un menu de ce nom existe déjà sur ce site.");
    type="menu"; label=titre; operation="menu.creer";
    Object.assign(fields,simpleField(s,"OBJ-MENU","Title",titre),lookupField(s,"OBJ-MENU","OBJSITEPUBLIC",siteId),
      simpleField(s,"OBJ-MENU","DESCRIPTION",String(params.description||"").trim().slice(0,4000)),
      lookupField(s,"OBJ-MENU","OBJACTIF",states.actif),lookupField(s,"OBJ-MENU","OBJVALIDE",states.invalide),
      simpleField(s,"OBJ-MENU","EMPREINTEMENU",empreinte([siteId,titre])),simpleField(s,"OBJ-MENU","DATEMODIFICATION",maintenantSharePoint()));
  } else if(action==="menu.modifier"||action==="menu.publier"||action==="menu.desactiver"){
    const item=trouverRef(menus,params.menuRef,"menu"); itemId=item.id; type="menu"; label=String(item.fields.Title||""); operation=action==="menu.publier"?"menu.publier":"menu.modifier";
    if(action==="menu.modifier"){
      const titre=name(params.titre);
      if(menus.some(x=>x.id!==item.id&&normaliser(x.fields.Title)===normaliser(titre)))
        throw new Error("Un menu de ce nom existe déjà sur ce site.");
      Object.assign(fields,simpleField(s,"OBJ-MENU","Title",titre),simpleField(s,"OBJ-MENU","DESCRIPTION",String(params.description||"").trim().slice(0,4000)),
        simpleField(s,"OBJ-MENU","EMPREINTEMENU",empreinte([siteId,titre])),
        simpleField(s,"OBJ-MENU","DATEMODIFICATION",maintenantSharePoint()));
      old=Object.fromEntries(Object.keys(fields).map(k=>[k,item.fields[k]??""]));
    } else {
      Object.assign(fields,lookupField(s,"OBJ-MENU","OBJACTIF",action==="menu.publier"?states.actif:states.inactif));
      if(action==="menu.publier")Object.assign(fields,lookupField(s,"OBJ-MENU","OBJVALIDE",states.valide));
      Object.assign(fields,simpleField(s,"OBJ-MENU","DATEMODIFICATION",maintenantSharePoint()));
      old=Object.fromEntries(Object.keys(fields).map(k=>[k,item.fields[k]??""]));
    }
  } else if(action==="entree.ajouter"||action==="entree.modifier"||action==="entree.publier"||action==="entree.masquer"||action==="entree.afficher"||action==="entree.retirer"||action==="entree.ordre"){
    const menu=trouverRef(menus,params.menuRef,"menu");
    const menuId=menu.id;
    if(action==="entree.ajouter"){
      const titre=name(params.titre);type="entry";listName="OBJ-MENU-ENTREE";label=titre;operation="menu.modifier";
      const typeDest=String(params.typeDestination||"page");
      let pageId=null,url="";
      if(typeDest==="page"){
        const page=trouverRef(pages,params.pageRef,"page");
        if(String(page.fields[`${pagesInfo.column.name}LookupId`]||"")!==String(siteId))throw new Error("Cette page n’appartient pas au site sélectionné.");
        pageId=page.id;
      }else if(typeDest==="site")pageId=await pageAutreSite();
      else if(typeDest==="lien")url=urlSecurisee(params.url);
      else throw new Error("Choisissez une destination prise en charge.");
      let parentId=null;
      if(params.parentRef){const parent=trouverRef(entries,params.parentRef,"entry");if(String(parent.fields.OBJMENULookupId)!==menuId)throw new Error("Le parent doit appartenir au même menu.");parentId=parent.id;}
      const fingerprint=empreinte([menuId,titre,typeDest,pageId||url,parentId||""]);
      if(entries.some(x=>x.fields.EMPREINTEENTREE===fingerprint))throw new Error("Cette entrée existe déjà dans ce menu.");
      Object.assign(fields,simpleField(s,"OBJ-MENU-ENTREE","Title",titre),lookupField(s,"OBJ-MENU-ENTREE","OBJMENU",menuId),
        lookupField(s,"OBJ-MENU-ENTREE","OBJPAGESSITE",pageId),simpleField(s,"OBJ-MENU-ENTREE","URLPERSONNALISEE",url),
        lookupField(s,"OBJ-MENU-ENTREE","ENTREEPARENTE",parentId),simpleField(s,"OBJ-MENU-ENTREE","ORDRE",Number(params.ordre)||10),
        simpleField(s,"OBJ-MENU-ENTREE","OUVERTURENOUVELLEFENETRE",params.nouvelleFenetre===true),
        lookupField(s,"OBJ-MENU-ENTREE","OBJACTIF",params.visible===false?states.inactif:states.actif),
        lookupField(s,"OBJ-MENU-ENTREE","OBJVALIDE",states.invalide),
        simpleField(s,"OBJ-MENU-ENTREE","EMPREINTEENTREE",fingerprint));
    } else {
      const item=trouverRef(entries,params.entryRef,"entry");
      if(String(item.fields.OBJMENULookupId)!==menuId)throw new Error("Cette entrée n’appartient pas à ce menu.");
      itemId=item.id;type="entry";listName="OBJ-MENU-ENTREE";label=String(item.fields.Title||"");
      if(action==="entree.ordre"){
        Object.assign(fields,simpleField(s,listName,"ORDRE",Number(params.ordre)));
      }else if(action==="entree.masquer"||action==="entree.retirer"){
        Object.assign(fields,lookupField(s,listName,"OBJACTIF",states.inactif));
      }else if(action==="entree.afficher"){
        Object.assign(fields,lookupField(s,listName,"OBJACTIF",states.actif));
      }else if(action==="entree.publier"){
        Object.assign(fields,lookupField(s,listName,"OBJACTIF",states.actif),lookupField(s,listName,"OBJVALIDE",states.valide));
      }else{
        const titre=name(params.titre);
        let pageId=null,url="";
        if(params.typeDestination==="page"){
          const page=trouverRef(pages,params.pageRef,"page");
          if(String(page.fields[`${pagesInfo.column.name}LookupId`]||"")!==String(siteId))throw new Error("Cette page n’appartient pas au site sélectionné.");
          pageId=page.id;
        }else if(params.typeDestination==="site")pageId=await pageAutreSite();
        else if(params.typeDestination==="lien")url=urlSecurisee(params.url);
        else throw new Error("Choisissez une destination prise en charge.");
        let parentId=null;
        if(params.parentRef){const parent=trouverRef(entries,params.parentRef,"entry");if(parent.id===item.id)throw new Error("Une entrée ne peut pas être son propre parent.");if(String(parent.fields.OBJMENULookupId)!==menuId)throw new Error("Le parent doit appartenir au même menu.");parentId=parent.id;}
        const parentField=`${col(s,listName,"ENTREEPARENTE").name}LookupId`;
        for(let current=parentId,steps=0;current&&steps<entries.length;steps++){
          if(current===item.id)throw new Error("Cette hiérarchie créerait une boucle.");
          const p=entries.find(x=>x.id===current);current=p?String(p.fields[parentField]||""):null;
        }
        const fingerprint=empreinte([menuId,titre,params.typeDestination,pageId||url,parentId||""]);
        if(entries.some(x=>x.id!==item.id&&x.fields.EMPREINTEENTREE===fingerprint))throw new Error("Cette entrée existe déjà dans ce menu.");
        Object.assign(fields,simpleField(s,listName,"Title",titre),lookupField(s,listName,"OBJPAGESSITE",pageId),
          simpleField(s,listName,"URLPERSONNALISEE",url),lookupField(s,listName,"ENTREEPARENTE",parentId),
          simpleField(s,listName,"ORDRE",Number(params.ordre)||10),
          simpleField(s,listName,"OUVERTURENOUVELLEFENETRE",params.nouvelleFenetre===true),
          simpleField(s,listName,"EMPREINTEENTREE",fingerprint),
          lookupField(s,listName,"OBJACTIF",params.visible===false?states.inactif:states.actif));
        old=Object.fromEntries(Object.keys(fields).map(k=>[k,item.fields[k]??""]));
      }
      if(action!=="entree.modifier")old=Object.fromEntries(Object.keys(fields).map(k=>[k,item.fields[k]??""]));
      operation=action==="entree.publier"?"menu.publier":"menu.modifier";
    }
  } else if(action==="affectation.creer"){
    const menu=trouverRef(menus,params.menuRef,"menu");
    const emplacement=String(params.typeEmplacement||"");
    const header=emplacement==="En-tête"?trouverRef(entetes,params.composantRef,"header"):null;
    const footer=emplacement==="Pied de page"?trouverRef(footers,params.composantRef,"footer"):null;
    if(!header&&!footer)throw new Error("Choisissez un en-tête ou un pied de page réel du site.");
    const targetId=header?.id||footer?.id;
    const targetList=header?"OBJ-ENTETE-SITE":"OBJ-FOOTER-SITE";
    const targetField=header?"OBJENTETESITE":"OBJFOOTERSITE";
    const targetLookup=`${col(s,"OBJ-MENU-AFFECTATION",targetField).name}LookupId`;
    const existantes=assignments.filter(a=>String(a.fields[targetLookup]||"")===targetId);
    if(existantes.length>1)throw new Error("Plusieurs affectations existent déjà pour cet emplacement. Une vérification SharePoint est nécessaire.");
    const existante=existantes[0];
    if(existante&&String(existante.fields[`${col(s,"OBJ-MENU-AFFECTATION","OBJMENU").name}LookupId`]||"")===menu.id)
      throw new Error("Ce menu est déjà affecté à cet emplacement.");
    type="assignment";listName="OBJ-MENU-AFFECTATION";label=String(menu.fields.Title||"");operation="menu.affecter";
    const fingerprint=empreinte([siteId,targetList,targetId]);
    Object.assign(fields,simpleField(s,listName,"Title",`${label} — ${emplacement}`),lookupField(s,listName,"OBJMENU",menu.id),
      lookupField(s,listName,targetField,targetId),simpleField(s,listName,"TYPEEMPLACEMENT",emplacement),
      simpleField(s,listName,"ORDRE",Number(params.ordre)||10),lookupField(s,listName,"OBJACTIF",states.actif),
      lookupField(s,listName,"OBJVALIDE",states.valide),simpleField(s,listName,"EMPREINTEAFFECTATION",fingerprint));
    if(existante){itemId=existante.id;old=Object.fromEntries(Object.keys(fields).map(k=>[k,existante.fields[k]??""]));}
  } else throw new Error("Cette action de menu n’est pas prise en charge.");

  const jeton=mk(type,listName,itemId,fields,old, label,operation);
  return {jeton,changements:[{libelle:action,avant:itemId?"Valeur actuelle":"Aucune",apres:label}]};
}

async function revalider(op) {
  const g=await ecriture.contexteGraph();
  const s=await schema(g);
  if(String(op.siteId||"")!==String(op.contexteJournal?.siteId||op.siteId))return "Le site de l’opération a changé.";
  if(!Object.values(s.ids).includes(op.listId))return "La liste cible n’est plus autorisée.";
  return null;
}

module.exports={lire,publicMenu,preparer,revalider,schema,empreinte,_test:{
  normaliser,urlSecurisee,ref,ATTENDUS,COLONNES_REQUISES,lookupVers
}};
