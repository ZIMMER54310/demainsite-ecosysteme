# ============================================================
# DEMAINSITE ECOSYSTEME - CONFIGURATION GEOGRAPHIE
# V1.3 - Controle manuel + controle mensuel + journalisation
# ============================================================

$global:DSE_GEO_Config = [ordered]@{
    SiteUrl = "https://blogssite.sharepoint.com/sites/Bibliotheque"

    # Listes SharePoint de reference
    ListPays = "Pays"
    ListRegions = "Regions"
    ListDepartements = "Departements"
    ListVilles = "Villes"
    ListCodesPostaux = "CodesPostaux"
    ListCodesPostauxVilles = "CodesPostauxVilles"

    # Journaux SharePoint
    ListJournalActions = "Journal actions"
    ListJournalErreurs = "Journal erreurs"

    # Seuils de controle attendus France 2026
    ExpectedMinRegions = 18
    ExpectedMinDepartements = 100
    ExpectedMinVilles = 30000
    ExpectedMinCodesPostaux = 5000
    ExpectedMinRelationsCPVilles = 30000

    # Source officielle recommandee pour controle annuel.
    # Page INSEE COG 2026. Le script de controle ne telecharge rien par defaut.
    # Le script de synchronisation lit cette reference si tu actives le mode SourceWeb.
    SourceCogPageUrl = "https://www.insee.fr/fr/information/8740222"

    # Mode securite : AuditOnly ne modifie pas les donnees metier.
    # AutoUpdate peut mettre a jour les statuts et journaliser les ecarts.
    DefaultMode = "AuditOnly"

    # Si une ville disparait de la source future, on ne supprime jamais.
    # On marque seulement Statut Geo = ArchiveSource et on journalise.
    ArchiveInsteadOfDelete = $true

    # Nom de la tache Windows mensuelle
    ScheduledTaskName = "DemainSite - Controle geographie mensuel"
}
