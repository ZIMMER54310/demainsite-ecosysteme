export const CONFIG = Object.freeze({
  apiBaseUrl:
    "https://dse-api-prod-ajg5akhkavhkb9a4.francecentral-01.azurewebsites.net/api/v1",

  routes: Object.freeze({
    etat: "/etat",
    connexion: "/auth/connexion",
    moi: "/moi",
    deconnexion: "/auth/deconnexion"
  }),

  timeoutMs: 15000
});
