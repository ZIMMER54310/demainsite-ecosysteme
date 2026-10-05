const sections = [
  { fonction: "pages", libelle: "Pages", icone: "file", onglet: "pages" },
  { fonction: "entete", libelle: "En-tête", icone: "panel", onglet: "entetes" },
  { fonction: "footer", libelle: "Footer", icone: "panel", onglet: "footers" },
  { fonction: "menu", libelle: "Menu", icone: "list", composant: "menu" },
  { fonction: "logo-medias", libelle: "Médias", icone: "image", route: "medias" },
  { fonction: "seo", libelle: "SEO", icone: "search", composant: "seo" }
];

export function navigationSite(vue, niveau) {
  const domaine = vue?.acces || vue?.domaine;
  if (!domaine) return [];
  const base = `/cockpit/site/${encodeURIComponent(domaine)}`;
  const fonctions = new Set(vue.fonctions || []);
  const construction = ["pages", "entete", "footer"].some((f) => fonctions.has(f));
  const ecriture = ["ecriture", "administration"].includes(niveau);
  return [
    { libelle: "Vue d'ensemble", icone: "home", url: base },
    ...(construction ? [{ libelle: "Construire le site", icone: "settings", url: `${base}/construire` }] : []),
    ...sections.filter((x) => fonctions.has(x.fonction)).map((x) => ({
      libelle: x.libelle, icone: x.icone,
      url: x.route ? `${base}/${x.route}` : x.onglet && construction ? `${base}/construire?onglet=${x.onglet}`
        : x.composant && ecriture ? `${base}/modifier/${x.composant}` : `${base}?section=${x.fonction === "logo-medias" ? "identite" : x.fonction}`
    })),
    ...(construction ? [{ libelle: "Catalogue / Modèles", icone: "layers", url: `${base}/construire?onglet=catalogue` }] : [])
  ];
}
