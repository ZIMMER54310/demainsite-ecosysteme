const sections = [
  { fonction: "pages", libelle: "Pages", icone: "file", onglet: "pages" },
  { fonction: "entete", libelle: "En-tête", icone: "panel", onglet: "entetes" },
  { fonction: "footer", libelle: "Footer", icone: "panel", onglet: "footers" },
  { fonction: "articles", libelle: "Articles", icone: "file", onglet: "articles", composant: "articles" },
  { fonction: "menu", libelle: "Menu", icone: "list", route: "menu" },
  { fonction: "logo-medias", libelle: "Médias", icone: "image", route: "medias" },
  { fonction: "seo", libelle: "SEO", icone: "search", composant: "seo" }
];

export function navigationSite(vue, niveau) {
  const domaine = vue?.acces || vue?.domaine;
  if (!domaine) return [];
  const base = `/cockpit/site/${encodeURIComponent(domaine)}`;
  const fonctions = new Set(vue.fonctions || []);
  const construction = ["pages", "entete", "footer", "articles"].some((f) => fonctions.has(f));
  const operations = vue.contexteUtilisateur?.autorisations?.operations;
  const ecriture = ["ecriture", "administration"].includes(niveau);
  return [
    { libelle: "Vue d'ensemble", icone: "home", url: base },
    ...(construction ? [{ libelle: "Construire le site", icone: "settings", url: `${base}/construire` }] : []),
    // Avec la construction autorisee, les fonctions du site sont regroupees sous « Construire le site ».
    ...sections.filter((x) => fonctions.has(x.fonction)).map((x) => ({
      libelle: operations?.find((o) => o.fonction === x.fonction)?.libelle || x.libelle, icone: x.icone, enfant: construction,
      url: x.route ? `${base}/${x.route}` : x.onglet && construction ? `${base}/construire?onglet=${x.onglet}`
        : x.composant && ecriture ? `${base}/modifier/${x.composant}${operations &&
          !operations.some((o) => o.operation === `${x.fonction}.modifier`) &&
          operations.some((o) => o.operation === `${x.fonction}.creer`) ? "?element=nouveau" : ""}`
          : `${base}?section=${x.fonction === "logo-medias" ? "identite" : x.fonction}`
    })),
    ...(operations?.some((o) => o.operation === "site.modifier") ? [{
      libelle: "Accès et comptes", icone: "users", url: `${base}/reglages-acces`
    }] : []),
    ...(operations?.some((o) => o.operation === "utilisateurs.demande-compte") ? [{
      libelle: "Demandes de compte", icone: "users", url: `${base}/demandes-comptes`
    }] : []),
    ...(construction ? [{ libelle: "Catalogue / Modèles", icone: "layers", url: `${base}/construire?onglet=catalogue`, enfant: true }] : [])
  ];
}

// Cle de comparaison d'une adresse du menu : chemin, onglet du constructeur (En-tetes par defaut) ou section.
export function cleNavigation(url) {
  const [chemin, requete = ""] = String(url || "").split("?");
  const params = new URLSearchParams(requete);
  if (/\/construire$/.test(chemin)) return `${chemin}?onglet=${params.get("onglet") || "entetes"}`;
  if (params.get("section")) return `${chemin}?section=${params.get("section")}`;
  return chemin;
}

// Element actif : correspondance exacte de la page ouverte ; le parent « Construire le site » suit ses enfants.
export function elementActif(items, route) {
  const cle = cleNavigation(route);
  const enfant = items.find((x) => x.enfant && cleNavigation(x.url) === cle);
  if (enfant) return { actif: enfant, parent: items.find((x) => /\/construire$/.test(x.url)) || null };
  const direct = items.find((x) => !x.enfant && !/\/construire$/.test(x.url) && cleNavigation(x.url) === cle);
  if (direct) return { actif: direct, parent: null };
  const construire = items.find((x) => /\/construire$/.test(x.url));
  if (construire && /\/(construire|modifier\/[^/?]+|medias)(\?|$)/.test(route)) return { actif: null, parent: construire };
  return { actif: null, parent: null };
}
