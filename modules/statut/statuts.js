// Textes publics officiels des pages de statut (aucune donnee client, aucune info technique).
export const PAGES_STATUT = {
  construction: { titre: "Site en construction", sousTitre: "Ce site est actuellement en préparation.", message: "Nous préparons actuellement ce site. Il sera prochainement disponible." },
  maintenance: { titre: "Maintenance en cours", sousTitre: "Ce site est momentanément indisponible.", message: "Une opération de maintenance est actuellement en cours. Le site sera de nouveau disponible prochainement." },
  suspendu: { titre: "Site temporairement indisponible", sousTitre: "Ce site est actuellement indisponible.", message: "" },
  archive: { titre: "Site archivé", sousTitre: "Ce site n'est actuellement plus disponible.", message: "" },
  indisponible: { titre: "Site temporairement indisponible", sousTitre: "", message: "" },
  inconnu: { titre: "Site indisponible", sousTitre: "", message: "Le site demandé n'est actuellement pas disponible." }
};

export const ETATS_STATUT = Object.keys(PAGES_STATUT);

// Etat inconnu du moteur => jamais le vrai site : page neutre.
export const pageStatut = (etat) => PAGES_STATUT[etat] || PAGES_STATUT.indisponible;
