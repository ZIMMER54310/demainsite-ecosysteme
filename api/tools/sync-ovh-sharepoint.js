"use strict";

// OVH -> SharePoint : cree dans SharePoint les domaines OVH inconnus et leur site (etat "Site en construction").
//   node tools/sync-ovh-sharepoint.js             plan (lecture seule)
//   node tools/sync-ovh-sharepoint.js --apply     ecrit dans SharePoint (anti-doublon, jamais de suppression)
//   --orphelins                                   cree aussi un site pour les domaines SharePoint sans site
// Valeurs par defaut (IDs natifs SharePoint) : DSE_DEFAUT_CLIENT_ID (obligatoire), DSE_DEFAUT_TYPE_ID,
// DSE_DEFAUT_TEMPS_ID (sinon recherche par titre "1 AN" / "Principal" / fournisseur "OVH").
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const dse = require("../shared/dse");
const P = require("../shared/provisionnement");
const { listerDomainesOvh, planifier, lien } = require("../shared/ovh-sharepoint");

const OPTIONS = ["--apply", "--orphelins"];
for (const a of process.argv.slice(2)) if (!OPTIONS.includes(a)) { console.log(`Option inconnue : ${a}`); process.exit(1); }
const APPLY = process.argv.includes("--apply");

async function items(token, siteId, listes, nom) {
  const l = listes.find((x) => x.displayName === nom);
  if (!l) throw new Error(`Liste ${nom} introuvable`);
  return { id: l.id, items: await dse.collecter(token, `/sites/${siteId}/lists/${l.id}/items?$expand=fields&$top=500`) };
}

const parTitre = (liste, titre) => liste.items.find((i) => String(i.fields.Title || "").trim().toLowerCase() === titre)?.id;

(async () => {
  const domainesOvh = await listerDomainesOvh();
  const token = await dse.obtenirJetonGraph();
  const site = await dse.obtenirSiteGraph(token);
  const listes = await dse.collecter(token, `/sites/${site.id}/lists?$select=id,displayName`);
  const L = {};
  for (const n of ["OBJ-NOM DE DOMAINE", "OBJ-SITE-PUBLIC", "OBJ-NOM DE DOMAINE-TYPE", "OBJ-NOM DE DOMAINE-FOURNISSEUR", "OBJ-TEMPS", "OBJ-ACTIF", "OBJ-VALIDE", "OBJ-VEROUILLE"]) L[n] = await items(token, site.id, listes, n);

  const defauts = {
    client: process.env.DSE_DEFAUT_CLIENT_ID || null,
    type: process.env.DSE_DEFAUT_TYPE_ID || parTitre(L["OBJ-NOM DE DOMAINE-TYPE"], "principal"),
    fournisseur: parTitre(L["OBJ-NOM DE DOMAINE-FOURNISSEUR"], "ovh"),
    temps: process.env.DSE_DEFAUT_TEMPS_ID || parTitre(L["OBJ-TEMPS"], "1 an"),
    actif: parTitre(L["OBJ-ACTIF"], "oui") || "1",
    valide: parTitre(L["OBJ-VALIDE"], "oui") || "1",
    nonVerrouille: parTitre(L["OBJ-VEROUILLE"], "non") || "2"
  };

  const domainesSp = L["OBJ-NOM DE DOMAINE"].items.map((i) => ({
    id: String(i.id), domaine: dse.normaliserDomaine(i.fields.Title), siteId: lien(i.fields, /^OBJSITE/), clientId: lien(i.fields, /^OBJ_x002d_CLIENT$/)
  }));
  const sites = L["OBJ-SITE-PUBLIC"].items.map((i) => ({
    id: String(i.id),
    domaineIds: (i.fields.OBJ_x002d_NOM_x0020_DE_x0020_DOM || []).map((v) => String(v.LookupId))
  }));

  const plan = planifier(domainesOvh, { domainesSp, sites }, defauts, { orphelins: process.argv.includes("--orphelins") });
  console.log(`Domaines OVH : ${domainesOvh.length} | SharePoint : ${domainesSp.length}`);
  for (const d of plan.aCreerDomaines) console.log(`CREER domaine ${d.domaine} (+ site en construction)`);
  for (const s of plan.sitesACreer.filter((x) => x.domaineId)) console.log(`CREER site pour domaine existant ${s.domaine} (ID ${s.domaineId})`);
  for (const i of plan.ignores) console.log(`IGNORE ${i.domaine} : ${i.raison}`);
  if (!plan.aCreerDomaines.length && !plan.sitesACreer.length) console.log("Rien a synchroniser.");
  if (!APPLY) { console.log("Plan seulement (--apply pour ecrire).\nFIN\nTERMINÉ"); return; }

  const ecrire = async (liste, champs) => P.appel(token, "POST", `/sites/${site.id}/lists/${liste.id}/items`, { fields: champs });
  const aujourdhui = new Date().toISOString().slice(0, 10) + "T00:00:00Z";
  const nomDom = "OBJ_x002d_NOM_x0020_DE_x0020_DOM";

  for (const s of plan.sitesACreer) {
    // Relecture juste avant ecriture : anti-doublon strict.
    const frais = await dse.collecter(token, `/sites/${site.id}/lists/${L["OBJ-NOM DE DOMAINE"].id}/items?$expand=fields&$top=500`);
    let dom = frais.find((i) => dse.normaliserDomaine(i.fields.Title) === s.domaine);
    if (!dom) {
      dom = await ecrire(L["OBJ-NOM DE DOMAINE"], {
        Title: s.domaine,
        [`${nomDom}LookupId`]: defauts.type,
        OBJ_x002d_CLIENTLookupId: defauts.client,
        [`${nomDom}1LookupId`]: defauts.fournisseur,
        DateAchat: aujourdhui,
        Temps_x0020_de_x0020_souscriptioLookupId: defauts.temps,
        OBJ_x002d_ACTIFLookupId: defauts.actif,
        OBJ_x002d_VALIDELookupId: defauts.valide,
        OBJ_x002d_VEROUILLELookupId: defauts.nonVerrouille
      });
      console.log(`OK domaine ${s.domaine} -> ID ${dom.id}`);
    }
    const domId = String(dom.id);
    const sitesFrais = await dse.collecter(token, `/sites/${site.id}/lists/${L["OBJ-SITE-PUBLIC"].id}/items?$expand=fields&$top=500`);
    const dejaLie = sitesFrais.find((i) => (i.fields[nomDom] || []).some((v) => String(v.LookupId) === domId));
    if (dejaLie) { console.log(`SKIP site deja lie a ${s.domaine} (ID ${dejaLie.id})`); continue; }
    const client = s.clientId || (dom.fields && lien(dom.fields, /^OBJ_x002d_CLIENT$/)) || defauts.client;
    const nouveau = await ecrire(L["OBJ-SITE-PUBLIC"], {
      Title: s.domaine,
      OBJ_x002d_CLIENTLookupId: client,
      [`${nomDom}@odata.type`]: "Collection(Edm.Int32)",
      [`${nomDom}LookupId`]: [Number(domId)],
      ACTIFLookupId: defauts.actif,
      OBJ_x002d_VALIDELookupId: defauts.valide,
      OBJ_x002d_VEROUILLELookupId: defauts.nonVerrouille
    });
    console.log(`OK site ${s.domaine} -> ID ${nouveau.id} (Site en construction)`);
    await P.appel(token, "PATCH", `/sites/${site.id}/lists/${L["OBJ-NOM DE DOMAINE"].id}/items/${domId}/fields`, { OBJSITELookupId: String(nouveau.id) });
  }
  console.log("FIN\nTERMINÉ");
})().catch((e) => { console.log(`ERREUR ${e.code || ""} ${e.message}\nFIN\nTERMINÉ (ECHEC)`); process.exit(1); });
