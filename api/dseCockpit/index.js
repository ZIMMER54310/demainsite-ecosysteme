"use strict";

/*
 * API du cockpit DSE. Toutes les autorisations sont controlees ici, cote serveur :
 * session signee -> droits resolus depuis SharePoint -> perimetre de sites -> fonctions.
 * Modifier l'URL ou un parametre cote navigateur ne donne acces a rien de plus.
 */

const session = require("../auth/session");
const dse = require("../shared/dse");
const fournisseurs = require("../auth/fournisseurs");
const droits = require("../auth/droits");
const cockpit = require("../shared/cockpit");
const perimetre = require("../shared/perimetre");
const controleurSiteComplet = require("../dseSiteComplet");
const resumeSites = require("../shared/resume-sites");
const edition = require("../shared/edition");
const ecriture = require("../shared/ecriture");
const administration = require("../shared/administration");
const inscription = require("../auth/inscription");
const progressionVisuelle = require("../shared/progression-visuelle");
const autorisations = require("../auth/autorisations");
const experienceCockpit = require("../shared/experience-cockpit");
const demandesAcces = require("../shared/demandes-acces");
const galerie = require("../shared/galerie");

const meta = () => ({ genereLe: new Date().toISOString() });

function repondre(res, status, corps) {
  res.status(status).set("Cache-Control", "no-store").json(corps);
}

function refuser(res, status, message) {
  repondre(res, status, { succes: false, erreur: { message }, meta: meta() });
}

async function refuserEcriture(res, ctx, domaine, action, message) {
  console.warn("[DSE cockpit] écriture refusée", action);
  return refuser(res, 403, message);
}

/*
 * Fraicheur des droits : SharePoint reste relu, mais au plus une fois par fenetre
 * (DSE_DROITS_FRAICHEUR_MS, 30 s par defaut) au lieu d'une fois par requete. La fenetre court
 * a partir de la FIN du rechargement : une relecture lente (Graph froid) n'est jamais videe
 * pendant qu'elle est en cours, ce qui provoquait des rechargements en cascade (droits > 18 s).
 * Les ecritures du cockpit invalident toujours explicitement les caches (shared/ecriture.js)
 * et recontrolent les droits ; un changement de droits SharePoint est visible sous 30 s.
 */
const RECHARGEMENT_MAX_MS = 60000;
let debutRafraichissement = 0;
let finRafraichissement = 0;
let rechargementEnCours = false;
function fraicheurDroitsMs() {
  const v = Number(process.env.DSE_DROITS_FRAICHEUR_MS);
  return Number.isFinite(v) && v >= 0 ? v : 30000;
}
function rafraichirLectures() {
  const maintenant = Date.now();
  if (rechargementEnCours && maintenant - debutRafraichissement < RECHARGEMENT_MAX_MS) return;
  if (!rechargementEnCours && maintenant - Math.max(debutRafraichissement, finRafraichissement) < fraicheurDroitsMs()) return;
  debutRafraichissement = maintenant;
  rechargementEnCours = true;
  dse.viderCacheGraph();
  droits.viderCache();
  require("../shared/catalogue-source").viderCache();
}
function lecturesRechargees() {
  if (!rechargementEnCours) return;
  rechargementEnCours = false;
  finRafraichissement = Date.now();
}

/* Mesure des etapes, exposee en en-tete Server-Timing (durees uniquement, aucune donnee). */
function chrono() {
  const debut = Date.now();
  const etapes = [];
  return {
    async etape(nom, fn) {
      const t = Date.now();
      try { return await fn(); } finally { etapes.push([nom, Date.now() - t]); }
    },
    appliquer(res) {
      const valeur = [...etapes, ["total", Date.now() - debut]].map(([n, d]) => `${n};dur=${d}`).join(", ");
      res.set("Server-Timing", valeur);
      if (process.env.DSE_TRACE_PERF === "1") console.log("[DSE perf]", valeur);
    }
  };
}

async function contexteUtilisateur(req) {
  const identite = session.identiteSession(req);
  if (!identite) return null;
  rafraichirLectures();
  try {
    return { identite, droits: await droits.droitsPour(identite) };
  } finally {
    lecturesRechargees();
  }
}

const contextePublic = (d) => ({ role: d.role, niveau: d.niveau, fonctions: d.fonctions,
  porteeGlobale: d.global === true,
  autorisations: d.autorisations ? { operations: d.autorisations.operations, decisions: d.autorisations.decisions,
    affectations: d.autorisations.affectations } : null,
  accesType: d.accesType ? { titre: d.accesType.titre } : null,
  contexte: d.contexte ? { etat: d.contexte.etat, message: d.contexte.message, client: d.contexte.client,
    domaine: d.contexte.domaine,
    role: d.contexte.role, accesType: d.contexte.accesType, verrouille: d.contexte.verrouille } : null });

async function contexteAdmin(ctx, domaine) {
  if (!domaine) return ctx.droits.global ? ctx.droits : null;
  return await siteDuPerimetre(ctx, domaine) ? ctx.droits : null;
}

async function chargerSiteComplet(siteId) {
  const contexte = { res: null, log: { info() {}, warn: console.warn, error: console.error } };
  await controleurSiteComplet(contexte, { params: { siteId: String(siteId) }, query: {}, headers: {} });
  const corps = contexte.res?.body;
  const donnees = typeof corps === "string" ? JSON.parse(corps) : corps;
  return donnees?.succes ? donnees.donnees : null;
}

function normaliserDomaine(valeur) {
  const d = String(valeur || "").trim().toLowerCase().replace(/^www\./, "");
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d) ? d : null;
}

/*
 * Veritables sites principaux visibles : les fiches alias sont regroupees sous leur site
 * (par ID natifs), et un groupe n'est visible que si son site principal est dans le perimetre.
 */
async function groupesAutorises(ctx) {
  const { sites: index, statuts } = await droits.sitesIndex();
  const autorises = new Set(ctx.droits.siteIds);
  const groupes = perimetre.regrouperSites([...index.values()]).filter((g) => autorises.has(String(g.id)));
  return { groupes, statuts };
}

/*
 * Domaine d'accueil calcule cote serveur : le domaine utilise s'il appartient au perimetre,
 * sinon le site principal designe ; sinon null (l'utilisateur choisit dans sa liste).
 */
async function domaineAccueil(req, ctx, groupes = null) {
  if (!ctx.droits.reconnu || !ctx.droits.siteIds.length) return null;
  const autorises = groupes || (await groupesAutorises(ctx)).groupes;
  const demande = normaliserDomaine(req.query.domaine || req.get("x-forwarded-host") || req.hostname);
  if (demande && perimetre.groupeParDomaine(autorises, demande)) return demande;
  const principal = ctx.droits.sitePrincipalId && autorises.find((g) => g.fiches.includes(String(ctx.droits.sitePrincipalId)));
  return principal ? perimetre.domaineAcces(principal) : null;
}

async function moi(req, res) {
  try {
    const t = chrono();
    const ctx = await t.etape("droits", () => contexteUtilisateur(req));
    if (!ctx) {
      return repondre(res, 200, { succes: true, donnees: { connecte: false, fournisseurs: fournisseurs.lister() }, meta: meta() });
    }
    if (req.query.domaine) {
      if (!await t.etape("perimetre", () => siteDuPerimetre(ctx, req.query.domaine))) return refuser(res, 403, ctx.droits.contexte?.message || "Site non autorisé.");
    }
    const groupes = ctx.droits.reconnu ? (await groupesAutorises(ctx)).groupes : [];
    const attribues = new Set(ctx.droits.sitesAttribues || ctx.droits.siteIds);
    const nombreSites = ctx.droits.reconnu
      ? perimetre.regrouperSites([...(await droits.sitesIndex()).sites.values()]).filter((g) => attribues.has(String(g.id))).length : 0;
    const [menu, accueil] = await Promise.all([
      t.etape("menu", async () => administration.menu(ctx.droits, req.query.domaine || null, { galerie: await galerieVisible(ctx, groupes) })),
      domaineAccueil(req, ctx, groupes)
    ]);
    t.appliquer(res);
    return repondre(res, 200, {
      succes: true,
      donnees: {
        connecte: true,
        nom: ctx.identite.nom || ctx.identite.email || null,
        reconnu: ctx.droits.reconnu,
        identification: !ctx.droits.reconnu && ctx.identite.fournisseur === "entra" ? {
          condition: "IDENTITE_NON_LIEE_OU_COMPTE_NON_VALIDE",
          codeLiaison: require("../auth/liaison-identite").proposer(ctx.identite),
          message: "L'identité Microsoft doit être liée explicitement au compte existant par l'administration globale. Ce code personnel expire après 15 minutes."
        } : null,
        role: ctx.droits.role,
        fonctions: ctx.droits.fonctions,
        niveau: ctx.droits.niveau,
        ...contextePublic(ctx.droits),
        accesCommun: ctx.droits.reconnu && (ctx.droits.sitesCommuns || []).length > 0,
        menu,
        nombreSites,
        clients: ctx.droits.global || ctx.droits.contexte?.etat === "COMPLET" ? clientsDuPerimetre(ctx, groupes) : [],
        porteeGlobale: ctx.droits.global === true,
        sitesPublics: groupes.map((g) => {
          const domaines = perimetre.domainesDuSite(g);
          return { nom: g.titre || domaines.principal || "Site sans nom",
            domainePrincipal: domaines.principal, domaines: domaines.tous };
        }),
        domaineAccueil: accueil,
        fournisseurs: fournisseurs.lister()
      },
      meta: meta()
    });
  } catch (e) {
    console.error("[DSE cockpit] moi", e.message);
    refuser(res, 503, "Le service est momentanément indisponible.");
  }
}

/*
 * Cockpit client : uniquement pour une portee « tous » ou « client » ; seuls les clients
 * du perimetre (ID natifs) ayant au moins un site autorise sont proposes.
 */
function clientsDuPerimetre(ctx, groupes) {
  if (!ctx.droits.reconnu || !ctx.droits.fonctions.includes("sites") ||
    !["tous", "client"].includes(ctx.droits.portee) && ctx.droits.contexte?.etat !== "COMPLET") return [];
  const autorises = new Set((ctx.droits.clientIds || []).map(String));
  const parClient = new Map();
  for (const g of groupes) {
    if (!g.clientId || !autorises.has(String(g.clientId))) continue;
    const id = String(g.clientId);
    if (!parClient.has(id)) parClient.set(id, { id, titre: g.client || null, nombreSites: 0 });
    parClient.get(id).nombreSites += 1;
  }
  return [...parClient.values()].sort((a, b) => String(a.titre || "").localeCompare(String(b.titre || ""), "fr"));
}

async function listeSites(ctx, query, groupes, statuts) {
  // Resume leger : chaque liste est lue une seule fois pour tous les sites.
  const resumes = await resumeSites.obtenirResumes();
  const configuration = await progressionVisuelle.lire();
  const clientParAcces = new Map(groupes.map((g) => [perimetre.domaineAcces(g), g.clientId ? String(g.clientId) : null]));
  const liste = cockpit.filtrerSites(groupes
    .map((g) => cockpit.resumeSite(g, statuts.get(String(g.statutId)) || null, resumes.get(String(g.id))))
    .filter((s) => s.acces), query, progressionVisuelle.tranches(configuration));
  const clients = new Set(clientsDuPerimetre(ctx, groupes).map((c) => c.id));
  for (const s of liste.elements) {
    s.progressionVisuelle = progressionVisuelle.pourcentage(configuration, s.progression);
    const clientId = clientParAcces.get(s.acces);
    s.clientCockpit = clientId && clients.has(clientId) ? clientId : null;
    const info = groupes.find((g) => perimetre.domaineAcces(g) === s.acces);
    const contexte = droits.contexteSite(ctx.droits, await droits.donneesDroits(), info.id);
    s.contexte = contextePublic(contexte).contexte;
    s.role = contexte.role?.titre || null;
    s.accesType = contexte.accesType?.titre || null;
  }
  liste.avertissementProgression = configuration.message || configuration.avertissement || null;
  liste.peutChangerStatut = require("../shared/statut-sites").autorise(ctx.droits);
  return liste;
}

async function sites(req, res) {
  try {
    const ctx = await contexteUtilisateur(req);
    if (!ctx) return refuser(res, 401, "Connexion requise.");
    if (!ctx.droits.reconnu) return refuser(res, 403, "Accès non autorisé.");
    const { groupes: tousGroupes, statuts } = await groupesAutorises(ctx);
    const donnees = await droits.donneesDroits();
    const attribues = new Set([...(ctx.droits.sitesAttribues || []), ...donnees.liens.filter((l) => l.actif && l.valide &&
      String(l.utilisateurId) === ctx.droits.utilisateurId && l.siteId && l.clientId &&
      donnees.clients.some((c) => String(c.id) === String(l.clientId)) &&
      donnees.sites.some((s) => String(s.id) === String(l.siteId) && String(s.clientId) === String(l.clientId))).map((l) => String(l.siteId))]);
    const groupes = tousGroupes.filter((g) => attribues.has(String(g.id)));
    const liste = await listeSites(ctx, req.query, groupes, statuts);
    liste.clientsCockpit = clientsDuPerimetre(ctx, groupes);
    repondre(res, 200, { succes: true, donnees: liste, meta: meta() });
  } catch (e) {
    console.error("[DSE cockpit] sites", e.message);
    refuser(res, 503, "Le service est momentanément indisponible.");
  }
}

/*
 * Galerie : sites du perimetre pour lesquels galerie.voir est resolu par site depuis SharePoint.
 * Aucune carte non autorisee n'est construite ; le bouton cockpit exige cockpit.ouvrir et une
 * relation OBJ-SITE-COCKPIT exploitable.
 */
async function cartesGalerie(ctx) {
  const { groupes, statuts } = await groupesAutorises(ctx);
  const donnees = await droits.donneesDroits();
  const [cockpits, resumes] = await Promise.all([galerie.cockpitsParSite(), resumeSites.obtenirResumes().catch(() => null)]);
  return galerie.construireCartes({ groupes, statuts, cockpits, resumes,
    contexte: (g) => droits.contexteSite(ctx.droits, donnees, g.id) });
}

async function galerieVisible(ctx, groupesConnus = null) {
  try {
    if (!ctx.droits.reconnu) return false;
    const groupes = groupesConnus || (await groupesAutorises(ctx)).groupes;
    const donnees = await droits.donneesDroits();
    return groupes.some((g) => galerie.peutLire(droits.contexteSite(ctx.droits, donnees, g.id), galerie.OPERATION_GALERIE, "galerie"));
  } catch (e) {
    console.warn("[DSE cockpit] galerie menu", e.message);
    return false;
  }
}

async function galerieListe(req, res) {
  try {
    const ctx = await contexteUtilisateur(req);
    if (!ctx) return refuser(res, 401, "Connexion requise.");
    if (!ctx.droits.reconnu) return refuser(res, 403, "Accès non autorisé.");
    const cartes = await cartesGalerie(ctx);
    if (!cartes.length) return refuser(res, 403, "La Galerie n'est pas disponible pour votre compte.");
    repondre(res, 200, { succes: true, donnees: galerie.filtrer(cartes, req.query), meta: meta() });
  } catch (e) {
    console.error("[DSE cockpit] galerie", e.message);
    refuser(res, 503, "Le service est momentanément indisponible.");
  }
}

/* Verification serveur avant ouverture : meme refus pour un site absent, hors perimetre ou sans droit. */
async function galerieCockpit(req, res) {
  try {
    const ctx = await contexteUtilisateur(req);
    if (!ctx) return refuser(res, 401, "Connexion requise.");
    const domaine = normaliserDomaine(req.query.domaine);
    const carte = domaine && ctx.droits.reconnu
      ? (await cartesGalerie(ctx)).find((c) => c.cockpit && c.cockpit.url === `/cockpit/site/${encodeURIComponent(domaine)}`) : null;
    if (!carte) return refuser(res, 403, "Le cockpit de ce site n'est pas disponible pour votre compte.");
    repondre(res, 200, { succes: true, donnees: { url: carte.cockpit.url, nom: carte.nom }, meta: meta() });
  } catch (e) {
    console.error("[DSE cockpit] galerie cockpit", e.message);
    refuser(res, 503, "Le service est momentanément indisponible.");
  }
}

async function client(req, res) {
  try {
    const ctx = await contexteUtilisateur(req);
    if (!ctx) return refuser(res, 401, "Connexion requise.");
    if (!ctx.droits.global && !await contexteAdmin(ctx, req.query.contexteDomaine)) return refuser(res, 403, "Contexte client requis.");
    const id = /^\d{1,12}$/.test(String(req.query.id || "")) ? String(req.query.id) : null;
    const { groupes, statuts } = await groupesAutorises(ctx);
    const fiche = id ? clientsDuPerimetre(ctx, groupes).find((c) => c.id === id) : null;
    // Meme reponse pour un client inexistant, sans site ou hors perimetre : rien n'est divulgue.
    if (!fiche) return refuser(res, 403, "Cet espace client n'est pas disponible.");
    const { client: _ignore, ...query } = req.query;
    const liste = await listeSites(ctx, query, groupes.filter((g) => String(g.clientId) === id), statuts);
    liste.client = fiche;
    if (req.query.contexteDomaine) liste.criteres.domaine = req.query.contexteDomaine;
    repondre(res, 200, { succes: true, donnees: liste, meta: meta() });
  } catch (e) {
    console.error("[DSE cockpit] client", e.message);
    refuser(res, 503, "Le service est momentanément indisponible.");
  }
}

/*
 * Gestion transverse : medias, pages, En-tetes, Footer, articles de tous les sites du perimetre.
 * Administration globale : tous les sites ; espace client (?client=ID) : les sites de ce client ;
 * autres profils : leurs sites uniquement. Chaque onglet exige la fonction correspondante.
 */
async function contenus(req, res) {
  try {
    const ctx = await contexteUtilisateur(req);
    if (!ctx) return refuser(res, 401, "Connexion requise.");
    if (!ctx.droits.global && !await contexteAdmin(ctx, req.query.contexteDomaine)) return refuser(res, 403, "Sélectionnez un site autorisé pour gérer ses contenus.");
    const inventaire = require("../shared/inventaire");
    const d = ctx.droits;
    const type = Object.hasOwn(inventaire.TYPES, String(req.query.type || "")) ? String(req.query.type) : "medias";
    if (!d.reconnu || !d.fonctions.includes("sites")) return refuser(res, 403, "Accès non autorisé.");
    let { groupes } = await groupesAutorises(ctx);
    let client = null;
    if (req.query.client !== undefined && req.query.client !== "") {
      const id = /^\d{1,12}$/.test(String(req.query.client)) ? String(req.query.client) : null;
      client = id ? clientsDuPerimetre(ctx, groupes).find((c) => c.id === id) : null;
      if (!client) return refuser(res, 403, "Cet espace client n'est pas disponible.");
      groupes = groupes.filter((g) => String(g.clientId) === id);
    }
    const onglets = Object.entries(inventaire.TYPES).filter(([cle, t]) =>
      d.fonctions.includes(d.autorisations && cle === "articles" ? "articles" : t.fonction))
      .map(([cle, t]) => ({ cle, libelle: t.libelle }));
    if (!onglets.some((o) => o.cle === type)) return refuser(res, 403, "Accès non autorisé.");
    const perim = { global: !client && d.portee === "tous", groupes };
    const [donneesBuilder, indexCatalogue] = await Promise.all([
      require("../shared/builder-source").obtenirDonnees(),
      onglets.some((o) => o.cle === "articles") ? require("../shared/catalogue-source").obtenirIndex().catch(() => null) : null
    ]);
    const compteurs = Object.fromEntries(onglets.map((o) => [o.cle,
      inventaire.construire({ type: o.cle, perimetre: perim, donneesBuilder, indexCatalogue }).length]));
    const lignes = inventaire.construire({ type, perimetre: perim, donneesBuilder, indexCatalogue });
    res.set("Cache-Control", "no-store");
    repondre(res, 200, { succes: true, donnees: {
      type, onglets, compteurs, lignes, client, global: perim.global, nombreSites: groupes.length,
      synchro: perim.global && type === "medias" && require("../shared/statut-sites").autorise(d) ? vueSynchro(require("../shared/medias-synchro").etat()) : null
    }, meta: meta() });
  } catch (e) {
    console.error("[DSE cockpit] contenus", e.message);
    refuser(res, 503, "Le service est momentanément indisponible.");
  }
}

async function site(req, res) {
  try {
    const t = chrono();
    const ctx = await t.etape("droits", () => contexteUtilisateur(req));
    if (!ctx) return refuser(res, 401, "Connexion requise.");
    const domaine = normaliserDomaine(req.query.domaine);
    const { statuts } = await droits.sitesIndex();
    // Un alias ouvre son site principal ; le controle porte sur l'ID natif du site principal.
    const info = await t.etape("perimetre", () => siteDuPerimetre(ctx, domaine));
    // Meme reponse pour un site inexistant ou hors perimetre : rien n'est divulgue.
    if (!info || !ctx.droits.fonctions.includes("sites")) {
      return refuser(res, 403, ctx.droits.contexte?.message || "Ce site n'est pas disponible dans votre espace.");
    }
    // Lectures independantes une fois l'autorisation acquise : executees en parallele.
    const [siteComplet, experience, progression, groupes] = await Promise.all([
      t.etape("site", () => chargerSiteComplet(info.id)),
      t.etape("experience", () => experienceCockpit.lire()),
      t.etape("progression", () => progressionVisuelle.lire()),
      groupesAutorises(ctx).then((g) => g.groupes)
    ]);
    const [donneesBuilder, menu] = await Promise.all([
      experience.realisations.etat === "configuree"
        ? t.etape("builder", () => require("../shared/builder-source").obtenirDonnees()) : null,
      t.etape("menu", async () => administration.menu(ctx.droits, domaine, { galerie: await galerieVisible(ctx, groupes) }))
    ]);
    const vue = cockpit.vueSite({
      siteComplet,
      info,
      statut: statuts.get(String(info.statutId)) || null,
      fonctions: ctx.droits.fonctions,
      domaineDemande: domaine
    });
    if (donneesBuilder) {
      experienceCockpit.appliquerProgression(vue, experience.realisations, donneesBuilder, info.id, ctx.droits.autorisations);
    }
    vue.accompagnement = experience.accompagnement;
    vue.demandesAcces = (ctx.droits.autorisations?.decisions || []).filter((d) => !d.autorise &&
      !d.operation.startsWith("constructeur.") && d.demandable);
    if (ctx.droits.porteeGlobale || ctx.droits.global) vue.configurationCockpit = {
      realisations: { etat: experience.realisations.etat, message: experience.realisations.message },
      accompagnement: { etat: experience.accompagnement.etat, message: experience.accompagnement.message }
    };
    vue.progressionVisuelle = progressionVisuelle.pourcentage(progression, vue.progression);
    const espaceClient = info.clientId && clientsDuPerimetre(ctx, groupes).find((c) => c.id === String(info.clientId));
    vue.clientCockpit = espaceClient ? espaceClient.id : null;
    vue.contexteUtilisateur = { ...contextePublic(ctx.droits), menu };
    t.appliquer(res);
    repondre(res, 200, { succes: true, donnees: vue, meta: meta() });
  } catch (e) {
    console.error("[DSE cockpit] site", e.message);
    refuser(res, 503, "Le service est momentanément indisponible.");
  }
}

/* ---------------- Ecriture : controles communs ---------------- */

/*
 * Les requetes d'ecriture doivent provenir du cockpit lui-meme (meme origine) :
 * protection contre la falsification de requete inter-sites, en plus du cookie SameSite=Lax.
 */
function origineValide(req) {
  return session.origineValide(req);
}

const RANG = { lecture: 0, ecriture: 1, administration: 2 };
const peutOperation = (d, operation, fonction) => !d.contraintesOperations?.includes(operation) && (d.autorisations
  ? autorisations.autoriser(d.autorisations, operation).autorise
  : d.reconnu && d.fonctions.includes(fonction) && RANG[d.niveau] >= RANG.ecriture);
const peutEcrire = (d, fonction) => peutOperation(d, `${fonction}.modifier`, fonction);

/* Site demande -> site principal (ID natif) dans le perimetre, sinon null (aucune divulgation). */
async function siteDuPerimetre(ctx, domaineBrut) {
  const domaine = normaliserDomaine(domaineBrut);
  if (!domaine) return null;
  const { sites: index } = await droits.sitesIndex();
  const info = perimetre.groupeParDomaine(perimetre.regrouperSites([...index.values()]), domaine);
  if (!info) return null;
  const d = droits.contexteSite(ctx.droits, await droits.donneesDroits(), info.id);
  d.contexte.domaine = domaine;
  ctx.droits = d;
  return d.contexte?.etat === "COMPLET" ? info : null;
}

function repondreResultat(res, r) {
  const { status, erreur, ...reste } = r;
  if (erreur) return repondre(res, status || 400, { succes: false, erreur: { message: erreur }, ...reste, meta: meta() });
  return repondre(res, status || 200, { succes: true, donnees: reste, meta: meta() });
}

async function contexteEcriture(req, res) {
  if (!origineValide(req)) { refuser(res, 403, "Requête refusée."); return null; }
  const ctx = await contexteUtilisateur(req);
  if (!ctx) { refuser(res, 401, "Connexion requise."); return null; }
  return ctx;
}

/* ---------------- Edition d'un composant (pilote En-tete / SEO) ---------------- */

async function editionLire(req, res) {
  try {
    const t = chrono();
    const ctx = await t.etape("droits", () => contexteUtilisateur(req));
    if (!ctx) return refuser(res, 401, "Connexion requise.");
    const composant = String(req.query.composant || "");
    const def = edition.COMPOSANTS_EDITABLES[composant];
    const info = await siteDuPerimetre(ctx, req.query.domaine);
    const suffixe = req.query.element === "nouveau" ? "creer" : "modifier";
    if (!info || !def || !peutOperation(ctx.droits, `${def.fonction}.${suffixe}`, def.fonction)) return refuser(res, 403, "Ce réglage n'est pas disponible dans votre espace.");
    const r = await t.etape("edition", () => edition.lire({ composant, siteId: info.id, element: String(req.query.element || "") }));
    t.appliquer(res);
    repondre(res, 200, { succes: true, donnees: { site: info.titre, domaine: perimetre.domaineAcces(info),
      peutCreer: !!def.creation && peutOperation(ctx.droits, `${def.fonction}.creer`, def.fonction), ...r }, meta: meta() });
  } catch (e) {
    console.error("[DSE cockpit] edition", e.message);
    refuser(res, 503, "Le service est momentanément indisponible.");
  }
}

async function editionApercu(req, res) {
  try {
    const ctx = await contexteEcriture(req, res);
    if (!ctx) return;
    const composant = String(req.body?.composant || "");
    const def = edition.COMPOSANTS_EDITABLES[composant];
    const info = await siteDuPerimetre(ctx, req.body?.domaine);
    const suffixe = req.body?.element === "nouveau" ? "creer" : "modifier";
    if (!info || !def || !peutOperation(ctx.droits, `${def.fonction}.${suffixe}`, def.fonction)) return refuserEcriture(res, ctx, req.body?.domaine, "Cockpit : aperçu édition",
      "Ce réglage n'est pas disponible dans votre espace.");
    const r = await edition.preparer({ identite: ctx.identite, composant, siteId: info.id, siteNom: info.titre, valeurs: req.body?.valeurs, element: String(req.body?.element || "") });
    repondreResultat(res, r);
  } catch (e) {
    console.error("[DSE cockpit] edition apercu", e.message);
    refuser(res, 503, "Le service est momentanément indisponible.");
  }
}

async function demandeAccesApercu(req, res) {
  try {
    const ctx = await contexteEcriture(req, res);
    if (!ctx) return;
    const info = await siteDuPerimetre(ctx, req.body?.domaine);
    if (!info) return refuser(res, 403, "Ce site n'est pas disponible dans votre espace.");
    const resultat = await demandesAcces.preparer({ d: ctx.droits, donnees: await droits.donneesDroits(),
      siteId: info.id, operation: String(req.body?.operation || "").slice(0, 160), motif: req.body?.motif }, ctx.identite);
    repondreResultat(res, resultat);
  } catch (e) {
    console.error("[DemainSite Ecosysteme demande]", e.message);
    refuser(res, 503, "Votre demande ne peut pas être préparée pour le moment. Contactez votre interlocuteur.");
  }
}

/* Confirmation commune : les droits sont recalcules au moment de l'ecriture. */
async function confirmer(req, res) {
  try {
    const ctx = await contexteEcriture(req, res);
    if (!ctx) return;
    const r = await ecriture.executer({
      identite: ctx.identite,
      jeton: req.body?.jeton,
      acteur: ctx.identite.email || ctx.identite.sujet,
      revalider: async (op) => {
        dse.viderCacheGraph();
        droits.viderCache();
        let d = await droits.droitsPour(ctx.identite);
        if (op.portee === "demande") {
          const donnees = await droits.donneesDroits();
          d = droits.contexteSite(d, donnees, op.siteId);
          const plan = await demandesAcces.construire({ d, donnees, siteId: op.siteId,
            operation: op.operationDemandee, motif: op.motif });
          if (plan.refus) return plan.refus;
          if (plan.op.listId !== op.listId || ecriture.hash(plan.op.champs) !== ecriture.hash(op.champs)) {
            return "Le contexte de votre demande a changé. Relisez l'aperçu avant de confirmer.";
          }
          op.contexteJournal = plan.op.contexteJournal;
          return null;
        }
        if (op.portee === "site") {
          const donnees = await droits.donneesDroits();
          d = droits.contexteSite(d, donnees, op.siteId);
          const s = donnees.sites.find((s) => String(s.id) === String(op.siteId));
          op.contexteJournal = { acteur: ctx.identite.sujet, utilisateurId: d.utilisateurId,
            clientId: s?.clientId || null, siteId: String(op.siteId) };
          if (!peutOperation(d, op.operation || `${op.fonction}.modifier`, op.fonction) ||
            !d.siteIds.includes(String(op.siteId))) return "Vous n'avez plus l'autorisation de réaliser cette opération.";
          return null;
        }
        if (op.portee === "admin") {
          const adminCtx = { identite: ctx.identite, droits: d };
          d = await contexteAdmin(adminCtx, op.adminParams?.contexteDomaine);
          if (!d) return "Contexte d'administration non autorisé.";
          const a = await administration.construireAction(d, op.adminAction, op.adminParams || {}, null);
          if (a.refus) return a.refus;
          if (a.aucunChangement) return "Cette relation ou modification existe déjà. Relisez avant de recommencer.";
          if (op.adminAction === "changer-statut-site" &&
            (!a.op || a.op.listId !== op.listId || a.op.itemId !== op.itemId ||
              ecriture.hash(a.op.champs) !== ecriture.hash(op.champs))) return "Le site ou le statut a changé. Relisez avant confirmation.";
          if (["ajouter-acces-site", "modifier-acces-site", "deverrouiller-acces-site", "lier-identite-utilisateur"].includes(op.adminAction) && a.op) {
            if (op.listId !== a.op.listId || op.itemId !== a.op.itemId ||
              ecriture.hash(op.champs) !== ecriture.hash(a.op.champs)) return "Le rattachement utilisateur/client/site ou les états ont changé.";
          }
          if (op.type === "ajouter") op.doublon = administration.controleDoublon(op);
          return null;
        }
        return "Opération non autorisée.";
      }
    });
    repondreResultat(res, r);
  } catch (e) {
    console.error("[DSE cockpit] confirmer", e.message);
    refuser(res, 503, "Le service est momentanément indisponible.");
  }
}

/* ---------------- Administration ---------------- */

async function adminTableau(req, res) {
  try {
    const ctx = await contexteUtilisateur(req);
    if (!ctx) return refuser(res, 401, "Connexion requise.");
    if (!await contexteAdmin(ctx, req.query.contexteDomaine)) return refuser(res, 403, "Contexte d'administration requis.");
    if (!ctx.droits.reconnu || !ctx.droits.fonctions.includes("administration")) return refuser(res, 403, "Accès non autorisé.");
    repondre(res, 200, { succes: true, donnees: await administration.tableau(ctx.droits), meta: meta() });
  } catch (e) {
    console.error("[DSE cockpit] admin tableau", e.message);
    refuser(res, 503, "Le service est momentanément indisponible.");
  }
}

async function adminUtilisateurs(req, res) {
  try {
    const ctx = await contexteUtilisateur(req);
    if (!ctx) return refuser(res, 401, "Connexion requise.");
    if (!await contexteAdmin(ctx, req.query.contexteDomaine)) return refuser(res, 403, "Contexte d'administration requis.");
    const r = ctx.droits.reconnu ? await administration.utilisateurs(ctx.droits, req.query) : null;
    if (!r) return refuser(res, 403, "Accès non autorisé.");
    r.peutGererIncidents = false;
    r.contexteDomaine = req.query.contexteDomaine || "";
    repondre(res, 200, { succes: true, donnees: r, meta: meta() });
  } catch (e) {
    console.error("[DSE cockpit] admin utilisateurs", e.message);
    refuser(res, 503, "Le service est momentanément indisponible.");
  }
}

async function espaces(req, res) {
  try {
    const ctx = await contexteUtilisateur(req);
    if (!ctx) return refuser(res, 401, "Connexion requise.");
    const r = await administration.espaces(ctx.droits, req.query);
    if (!r) return refuser(res, 403, "Accès non autorisé.");
    repondre(res, 200, { succes: true, donnees: r, meta: meta() });
  } catch (e) {
    console.error("[DSE cockpit] espaces", e.message);
    refuser(res, 503, "La lecture des espaces est momentanément indisponible.");
  }
}

async function adminApercu(req, res) {
  try {
    const ctx = await contexteEcriture(req, res);
    if (!ctx) return;
    const action = String(req.body?.action || "");
    const p = req.body?.params && typeof req.body.params === "object" ? req.body.params : {};
    const params = Object.fromEntries(["utilisateur", "codeLiaison", "role", "accesType", "relation", "actif", "valide", "verrouille", "contexteDomaine", "domaine", "email", "client", "portee", "niveau", "fonctions", "statut"]
      .filter((k) => typeof p[k] === "string").map((k) => [k, p[k].slice(0, k === "fonctions" ? 2000 : 255)]));
    if (!await contexteAdmin(ctx, params.contexteDomaine)) return refuser(res, 403, "Contexte d'administration requis.");
    repondreResultat(res, await administration.preparerAction({ identite: ctx.identite, d: ctx.droits, action, params }));
  } catch (e) {
    console.error("[DSE cockpit] admin apercu", e.message);
    refuser(res, 503, "Le service est momentanément indisponible.");
  }
}

async function monCompte(req, res) {
  try {
    const ctx = await contexteUtilisateur(req);
    if (!ctx) return refuser(res, 401, "Connexion requise.");
    if (!ctx.droits.reconnu) return refuser(res, 403, "Compte non reconnu ou non validé.");
    const data = await droits.donneesDroits();
    const utilisateur = data.utilisateurs.find((u) => String(u.id) === ctx.droits.utilisateurId);
    const { sites: index } = await droits.sitesIndex();
    const relations = data.liens.filter((l) => String(l.utilisateurId) === ctx.droits.utilisateurId && l.actif && l.valide);
    const sites = relations.map((l) => {
      const info = index.get(String(l.siteId));
      const contexte = droits.contexteSite(ctx.droits, data, l.siteId);
      return { nom: info?.titre || null, domaine: info ? perimetre.domainesDuSite(info).principal : null,
        ...contextePublic(contexte) };
    });
    repondre(res, 200, { succes: true, donnees: { nom: ctx.identite.nom || null,
      email: utilisateur.titre, roleGlobal: utilisateur.roleTitre, sites }, meta: meta() });
  } catch (e) {
    console.error("[DSE cockpit] mon compte", e.message);
    refuser(res, 503, "Compte momentanément indisponible.");
  }
}

async function connexion(req, res) {
  try {
    const f = fournisseurs.trouver(req.params.fournisseur);
    if (f && f.disponible() && await f.demarrer(req, res)) return;
  } catch (e) {
    console.error("[DSE cockpit] demarrage connexion", e.message);
  }
    res.redirect(302, "/#/cockpit?connexion=indisponible");
}

async function inscrire(req, res) {
  try {
    if (!origineValide(req)) return refuser(res, 403, "Requête refusée.");
    const identite = session.identiteSession(req);
    if (!identite || identite.fournisseur !== "entra") return refuser(res, 401, "Connexion Microsoft requise.");
    if (Object.keys(req.body || {}).some((k) => k !== "confirmer") ||
      (Object.hasOwn(req.body || {}, "confirmer") && typeof req.body.confirmer !== "boolean")) {
      console.warn("[DSE inscription] paramètres d'attribution interdits");
      return refuser(res, 403, "Aucune attribution de client, site ou rôle depuis le navigateur.");
    }
    const domaine = req.hostname || String(req.get("host") || "").split(":")[0];
    const r = await inscription.inscrire(identite, domaine, req.body?.confirmer === true);
    if (r.erreur) return repondre(res, r.status, { succes: false, erreur: { message: r.erreur }, journal: r.journal });
    return repondre(res, r.status, { succes: r.status === 200, donnees: r.donnees });
  } catch (e) {
    console.error("[DSE cockpit] inscription", e.message);
    refuser(res, 503, "Inscription momentanément indisponible.");
  }
}

async function retour(req, res) {
  const f = fournisseurs.trouver(req.params.fournisseur);
  try {
    const r = f ? await f.rappel(req, res) : { cible: "/#/cockpit?connexion=echec" };
    res.redirect(302, r.cible);
  } catch (e) {
    console.error("[DSE cockpit] retour connexion", e.message);
    res.redirect(302, "/#/cockpit?connexion=echec");
  }
}

function deconnexion(req, res) {
  session.fermerSession(res);
  res.redirect(302, "/#/cockpit");
}

/* ---------------- Constructeur (En-tetes / Pages / Footer) ---------------- */

const FONCTIONS_CONSTRUCTEUR = ["entete", "footer", "pages"];
const constructeurEnCours = new Map();
const constructeurExecutees = new Map();

async function perimetreConstructeur(ctx, domaine) {
  const info = await siteDuPerimetre(ctx, domaine);
  if (!info) return null;
  const d = ctx.droits;
  if (!d.reconnu || ![...FONCTIONS_CONSTRUCTEUR, "logo-medias"].some((f) => d.fonctions.includes(f))) return null;
  const fiches = new Set((d.autorisations ? [String(info.id)] : info.fiches || [String(info.id)]).map(String));
  const { sites: tous = [] } = await droits.donneesDroits();
  const clients = new Set(tous.filter((s) => fiches.has(String(s.id)) && s.clientId).map((s) => String(s.clientId)));
  return {
    info,
    sites: fiches,
    clients,
    superAdmin: require("../shared/statut-sites").autorise(d),
    peut: (fonction) => peutEcrire(d, fonction),
    lecture: (fonction) => d.fonctions.includes(fonction)
  };
}

async function construireLire(req, res) {
  try {
    const t = chrono();
    const ctx = await t.etape("droits", () => contexteUtilisateur(req));
    if (!ctx) return refuser(res, 401, "Connexion requise.");
    const p = await t.etape("perimetre", () => perimetreConstructeur(ctx, req.query.domaine));
    if (!p) return refuser(res, 403, "Accès non autorisé.");
    const mediasSeulement = req.query.vue === "medias";
    if (mediasSeulement ? !p.lecture("logo-medias") : !FONCTIONS_CONSTRUCTEUR.some((f) => p.lecture(f))) return refuser(res, 403, "Accès non autorisé.");
    const C = require("../shared/constructeur");
    const d = await t.etape("builder", () => require("../shared/builder-source").obtenirDonnees());
    const donnees = { site: { titre: p.info.titre, domaine: (p.info.domaines || [])[0] || null },
      operations: ctx.droits.autorisations ? ctx.droits.autorisations.operations.map((o) => o.operation) : null,
      operationsInterdites: ctx.droits.contraintesOperations || [],
      droits: Object.fromEntries([...FONCTIONS_CONSTRUCTEUR, "logo-medias"].map((f) => [f, { lecture: p.lecture(f), ecriture: p.peut(f) }])),
      superAdmin: p.superAdmin, ...C.vue(d, p) };
    const experience = await t.etape("experience", () => experienceCockpit.lire());
    donnees.accompagnement = experience.accompagnement;
    if (mediasSeulement) {
      let televersement = null;
      if (p.peut("logo-medias")) {
        try { televersement = await require("../shared/medias-televersement").options(await ecriture.contexteGraph()); } catch (e) { console.error("[DSE cockpit] medias options", e.message); }
      }
      t.appliquer(res);
      return repondre(res, 200, { succes: true, donnees: {
        site: donnees.site, droits: { "logo-medias": donnees.droits["logo-medias"] },
        medias: donnees.medias, logo: donnees.logo, televersement
      }, meta: meta() });
    }
    const reference = String(req.query.conteneur || "");
    if (reference) {
      const r = C.resoudre(d, reference, ["entete", "footer", "page"]);
      if (!r || !p.sites.has(String(C.siteDe(d, r.type, r.el))) || !p.lecture(C.CONTENEURS[r.type].fonction)) {
        return refuser(res, 404, "Élément introuvable dans ce site.");
      }
      donnees.arbre = C.arbre(d, r.type, r.el, p);
      const { zone } = require("../dsePageBuilder");
      const apercu = C.apercu(d, p.info.id, r.type, r.el, req.query.appareil, p);
      const z = (x) => (x ? { ...zone(x), _ref: x._ref } : null);
      donnees.apercu = { mode: apercu.mode, ...z(apercu), theme: apercu.theme || {}, entete: z(apercu.entete), footer: z(apercu.footer) };
    }
    experienceCockpit.decorerConstruction(donnees, experience.realisations);
    res.set("Cache-Control", "no-store");
    t.appliquer(res);
    repondre(res, 200, { succes: true, donnees, meta: meta() });
  } catch (e) {
    console.error("[DSE cockpit] constructeur lire", e.message);
    refuser(res, 503, "Le service est momentanément indisponible.");
  }
}

/*
 * Action du constructeur : origine + session + perimetre + droit d'ecriture recontroles a chaque appel,
 * un seul traitement simultane par site, idempotence par cle cliente, sans dependance au journal.
 */
async function construireAction(req, res) {
  let verrou = null;
  try {
    const ctx = await contexteEcriture(req, res);
    if (!ctx) return;
    const domaine = String(req.body?.domaine || "").slice(0, 255);
    const action = String(req.body?.action || "").slice(0, 64);
    const params = req.body?.params && typeof req.body.params === "object" && !Array.isArray(req.body.params) ? req.body.params : {};
    const cleClient = String(req.body?.cle || "").slice(0, 80);
    if (JSON.stringify(params).length > 20000) return refuser(res, 413, "Saisie trop volumineuse.");
    const p = await perimetreConstructeur(ctx, domaine);
    if (!p) return refuserEcriture(res, ctx, domaine, "CONSTRUCTEUR-REFUS", "Site hors de votre périmètre ou fonction non autorisée.");

    const lecture = action === "contenu.formulaire" || action === "design.lire" || (action === "conteneur.modifier" && !params.valeurs);
    const acteur = `OBJ-UTILISATEUR ${ctx.droits.utilisateurId || "non reconnu"}`;
    const cle = ecriture.hash(["constructeur", acteur, String(p.info.id), cleClient || Math.random(), action, params]);
    if (!lecture) {
      if (!/^[A-Za-z0-9-]{16,80}$/.test(cleClient)) return refuser(res, 400, "Requête incomplète.");
      verrou = String(p.info.id);
      if (constructeurEnCours.has(verrou)) {
        verrou = null;
        return refuser(res, 409, "Une autre modification de ce site est en cours. Merci de réessayer.");
      }
      constructeurEnCours.set(verrou, cle);
    }

    const C = require("../shared/constructeur");
    const source = require("../shared/builder-source");
    if (!lecture) source.viderCache();
    const d = await source.obtenirDonnees();
    if (ctx.droits.autorisations || ctx.droits.contraintesOperations?.length) {
      p.peut = (fonction) => {
        const racines = Object.entries(C.CONTENEURS).filter(([, def]) => def.fonction === fonction).map(([type]) => type);
        return racines.some((type) => peutOperation(ctx.droits, `constructeur.${type}.${action}`, fonction) &&
          (action !== "element.etat" || params.etat !== "actif" ||
            peutOperation(ctx.droits, `constructeur.${type}.conteneur.publier`, fonction)));
      };
      if (![...FONCTIONS_CONSTRUCTEUR].some((f) => p.peut(f))) {
        return refuserEcriture(res, ctx, domaine, action, "Vous ne disposez pas de l'autorisation pour cette action dans ce site. Consultez les accès disponibles depuis la fiche du site.");
      }
    }
    if (!lecture && constructeurExecutees.has(cle)) {
      return repondreResultat(res, { ...constructeurExecutees.get(cle), deja: true });
    }
    let r;
    try {
      const confirmation = require("../shared/construction-confirmation");
      let attendus = [];
      if (confirmation.SENSIBLES.has(action)) {
        if (req.body?.apercu === true) {
          const plan = await C.executer({ d, perimetre: p, siteId: p.info.id, action, params, apercu: true });
          if (plan.refus || plan.erreur) return repondreResultat(res, plan.refus ? { status: 403, erreur: plan.refus } : plan);
          if (!plan.modifications?.length) return repondreResultat(res, { status: 409, erreur: "Aucune modification à confirmer." });
          const g = await ecriture.contexteGraph();
          const jeton = ecriture.emettreJeton(ctx.identite, { type: "construction", action, params,
            siteId: String(p.info.id), modifications: plan.modifications }).jeton;
          return repondreResultat(res, { jeton, site: p.info.titre, changements: await confirmation.apercuPublic(g, plan.modifications) });
        }
        const lu = ecriture.lireJeton(ctx.identite, req.body?.jeton);
        if (lu.erreur || lu.op?.type !== "construction" || lu.op.action !== action ||
          lu.op.siteId !== String(p.info.id) || ecriture.hash(lu.op.params) !== ecriture.hash(params)) {
          return refuser(res, 409, "Un aperçu confirmé de cette opération est nécessaire.");
        }
        attendus = lu.op.modifications;
        const g = await ecriture.contexteGraph();
        const lecteur = new C.Ecrivain(g);
        for (const m of attendus) {
          if ((await lecteur.version(m.listeId, m.itemId, Object.keys(m.apres))).etag !== m.etag) {
            return refuser(res, 409, "Les données ont changé depuis l'aperçu. Relisez avant confirmation.");
          }
        }
        confirmation.sauvegarder(cle, { siteId: String(p.info.id), action, modifications: attendus });
        if (!ecriture.consommerJeton(ctx.identite, req.body?.jeton)) return refuser(res, 409, "Cette confirmation a déjà été utilisée.");
      }
      r = await C.executer({ d, perimetre: p, siteId: p.info.id, action, params, attendus });
    } catch (e) {
      if (e.refus) r = { refus: e.message };
      else {
        console.error("[DSE cockpit] constructeur action", action, e.message);
        r = { erreur: "L'enregistrement SharePoint n'a pas abouti.", status: 502, crees: [] };
      }
    }
    if (lecture) return repondreResultat(res, r);
    if (r.refus) return refuserEcriture(res, ctx, domaine, "CONSTRUCTEUR-REFUS", r.refus);

    const succes = !r.erreur;
    ecriture.invaliderCaches();
    const sortie = succes
      ? { message: r.message, nouveau: r.nouveau || {} }
      : { erreur: r.erreur, status: r.status };
    if (succes) {
      constructeurExecutees.set(cle, sortie);
      try {
        sortie.journal = await require("../shared/journal-comptes").enregistrer(await ecriture.contexteGraph(), {
          cle: `CONSTRUCTION-${cle}`, action, avant: (r.modifications || []).map((m) => ({ itemId: m.itemId, champs: m.avant })),
          apres: (r.modifications || []).map((m) => ({ itemId: m.itemId, champs: m.apres })),
          contexte: { utilisateurId: ctx.droits.utilisateurId, siteId: String(p.info.id), clientId: p.info.clientId }
        });
      } catch (e) {
        console.error("[DemainSite Ecosysteme construction journal]", e.message);
        sortie.erreur = "L'opération est enregistrée et relue, mais sa journalisation doit être vérifiée. Ne répétez pas la modification.";
        sortie.status = 502; sortie.enregistrementEffectue = true;
      }
    }
    if (constructeurExecutees.size > 500) constructeurExecutees.delete(constructeurExecutees.keys().next().value);
    return repondreResultat(res, sortie);
  } catch (e) {
    console.error("[DSE cockpit] constructeur", e.message);
    refuser(res, 503, "Le service est momentanément indisponible.");
  } finally {
    if (verrou) constructeurEnCours.delete(verrou);
  }
}

/*
 * Import d'un media (corps binaire) : memes garanties que les actions du constructeur
 * (origine, CSRF via acces.proteger, perimetre, droit d'ecriture, verrou par site, idempotence).
 */
async function mediasTeleverser(req, res) {
  let verrou = null;
  try {
    const ctx = await contexteEcriture(req, res);
    if (!ctx) return;
    const q = req.query || {};
    const domaine = String(q.domaine || "").slice(0, 255);
    const cleClient = String(q.cle || "").slice(0, 80);
    const nomFichier = String(q.nom || "").slice(0, 200);
    const titre = String(q.titre || "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, 255);
    const p = await perimetreConstructeur(ctx, domaine);
    if (!p || !p.peut("logo-medias")) return refuserEcriture(res, ctx, domaine, "MEDIA-IMPORT-REFUS", "Site hors de votre périmètre ou fonction non autorisée.");
    if (!/^[A-Za-z0-9-]{16,80}$/.test(cleClient) || !nomFichier) return refuser(res, 400, "Requête incomplète.");
    if (!Buffer.isBuffer(req.body) || !req.body.length) return refuser(res, 400, "Aucun fichier reçu.");
    const acteur = `OBJ-UTILISATEUR ${ctx.droits.utilisateurId || "non reconnu"}`;
    const cle = ecriture.hash(["media-import", acteur, cleClient, domaine, nomFichier, req.body.length]);
    if (constructeurExecutees.has(cle)) return repondreResultat(res, { ...constructeurExecutees.get(cle), deja: true });
    verrou = String(p.info.id);
    if (constructeurEnCours.has(verrou)) { verrou = null; return refuser(res, 409, "Une autre modification de ce site est en cours. Merci de réessayer."); }
    constructeurEnCours.set(verrou, cle);

    const g = await ecriture.contexteGraph();
    let r;
    try {
      r = await require("../shared/medias-televersement").televerser({ g, perimetre: p, typeRef: String(q.type || ""), titre, nomFichier, contenu: req.body, acteur });
    } catch (e) {
      if (e.refus) r = { refus: e.message };
      else { console.error("[DSE cockpit] import media", e.message); r = { erreur: "Le dépôt dans la bibliothèque n'a pas abouti. Aucun média n'a été créé.", status: 502, crees: [] }; }
    }
    if (r.refus) return refuserEcriture(res, ctx, domaine, "MEDIA-IMPORT-REFUS", r.refus);
    const succes = !r.erreur;
    ecriture.invaliderCaches();
    require("../shared/builder-source").viderCache();
    const sortie = succes
      ? { message: r.message, nouveau: r.nouveau || {} }
      : { erreur: r.erreur, status: r.status };
    if (succes) constructeurExecutees.set(cle, sortie);
    if (constructeurExecutees.size > 500) constructeurExecutees.delete(constructeurExecutees.keys().next().value);
    return repondreResultat(res, sortie);
  } catch (e) {
    console.error("[DSE cockpit] import media", e.message);
    refuser(res, 503, "Le service est momentanément indisponible.");
  } finally {
    if (verrou) constructeurEnCours.delete(verrou);
  }
}

/* Resume affichable de la synchronisation bibliotheque -> catalogue des medias (sans identifiant technique). */
function vueSynchro(etat) {
  const d = etat.dernier;
  return {
    enCours: etat.enCours,
    dernier: d ? {
      le: d.le, ok: d.ok, erreur: d.erreur || null, fichiers: d.fichiers || 0, dejaReferences: d.dejaReferences || 0,
      crees: (d.crees || []).map((c) => ({ chemin: c.chemin, type: c.type, portee: c.portee, aClasser: c.aClasser })),
      ignores: d.ignores || [], erreurs: d.erreurs || [], reste: Boolean(d.reste)
    } : null
  };
}

/* Synchronisation manuelle : administration globale uniquement (meme verrou que la planification). */
async function mediasSynchroniser(req, res) {
  try {
    const ctx = await contexteEcriture(req, res);
    if (!ctx) return;
    if (!require("../shared/statut-sites").autorise(ctx.droits)) {
      return refuserEcriture(res, ctx, "", "MEDIA-SYNCHRO-REFUS", "Synchronisation réservée à l'administration globale.");
    }
    const synchro = require("../shared/medias-synchro");
    await require("../shared/synchronisations").lancer("MEDIAS-BIBLIOTHEQUE", `OBJ-UTILISATEUR ${ctx.droits.utilisateurId || "non reconnu"}`);
    res.set("Cache-Control", "no-store");
    repondre(res, 200, { succes: true, donnees: vueSynchro(synchro.etat()), meta: meta() });
  } catch (e) {
    console.error("[DSE cockpit] synchro medias", e.message);
    refuser(res, 503, "Le service est momentanément indisponible.");
  }
}

/* ---------------- Synchronisations (administration globale uniquement) ---------------- */

const acteurDe = (ctx) => `OBJ-UTILISATEUR ${ctx.droits.utilisateurId || "non reconnu"}`;
const superAdmin = (ctx) => require("../shared/statut-sites").autorise(ctx.droits);

async function synchroLecture(req, res, traiter) {
  try {
    const ctx = await contexteUtilisateur(req);
    if (!ctx) return refuser(res, 401, "Connexion requise.");
    if (!superAdmin(ctx)) return refuser(res, 403, "Accès réservé à l'administration globale.");
    const r = await traiter(ctx);
    if (r?.refus) return refuser(res, 400, r.refus);
    repondre(res, 200, { succes: true, donnees: r, meta: meta() });
  } catch (e) {
    console.error("[DSE cockpit] synchronisations", e.message);
    refuser(res, e.refus ? 400 : 503, e.refus ? e.message : "Le service est momentanément indisponible.");
  }
}

async function synchroEcriture(req, res, action, traiter) {
  try {
    const ctx = await contexteEcriture(req, res);
    if (!ctx) return;
    if (!superAdmin(ctx)) return refuserEcriture(res, ctx, "", action, "Synchronisations réservées à l'administration globale.");
    const r = await traiter(ctx);
    if (r?.refus) return refuser(res, 400, r.refus);
    repondre(res, 200, { succes: true, donnees: r, meta: meta() });
  } catch (e) {
    console.error("[DSE cockpit] synchronisations", e.message, e.detailGraph || "");
    refuser(res, e.refus ? 400 : 503, e.refus ? e.message : "Le service est momentanément indisponible.");
  }
}

const synchroVue = (req, res) => synchroLecture(req, res, () => require("../shared/synchronisations").vue());
const synchroSauvegardes = (req, res) => synchroLecture(req, res, async () => {
  const s = require("../shared/sauvegarde-listes");
  if (req.query.manifeste) return s.listesDeSauvegarde(String(req.query.manifeste));
  return { sauvegardes: (await s.sauvegardes()).slice(0, 60) };
});
const synchroReglage = (req, res) => synchroEcriture(req, res, "SYNCHRO-REGLAGE-REFUS", (ctx) =>
  require("../shared/synchronisations").enregistrer({ code: String(req.body?.code || ""), mode: req.body?.mode,
    frequence: req.body?.frequence, unite: req.body?.unite, acteur: acteurDe(ctx) }));
const synchroLancer = (req, res) => synchroEcriture(req, res, "SYNCHRO-LANCEMENT-REFUS", async (ctx) => {
  const s = require("../shared/synchronisations");
  const p = s.lancer(String(req.body?.code || ""), acteurDe(ctx));
  if (!p) return { refus: "Synchronisation inconnue." };
  // Les passages longs continuent en arriere-plan : l'interface suit l'etat via la lecture.
  const fini = await Promise.race([p, new Promise((r) => setTimeout(() => r(null), 20000))]);
  return { termine: Boolean(fini), resultat: fini, ...(await s.vue()) };
});
const synchroApercu = (req, res) => synchroEcriture(req, res, "SYNCHRO-RESTAURATION-REFUS", (ctx) =>
  require("../shared/sauvegarde-listes").apercu({ identite: ctx.identite, manifeste: String(req.body?.manifeste || ""), listeId: String(req.body?.liste || "") }));
const synchroConfirmer = (req, res) => synchroEcriture(req, res, "SYNCHRO-RESTAURATION-REFUS", (ctx) =>
  require("../shared/sauvegarde-listes").confirmer({ identite: ctx.identite, jeton: req.body?.jeton, selection: req.body?.selection, acteur: acteurDe(ctx) }));

module.exports = {
  client, synchroVue, synchroSauvegardes, synchroReglage, synchroLancer, synchroApercu, synchroConfirmer,
  moi, monCompte, sites, site, galerieListe, galerieCockpit, connexion, retour, deconnexion, inscrire, mediasTeleverser, mediasSynchroniser,
  contenus, espaces, editionLire, editionApercu, demandeAccesApercu, confirmer, construireLire, construireAction, adminTableau, adminUtilisateurs, adminApercu,
  _test: { origineValide, clientsDuPerimetre }
};
