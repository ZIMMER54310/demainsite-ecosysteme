import { apiGet } from "../js/api.js";
export const getMoi = () => apiGet("/moi");
export const getSitesCockpit = (criteres = {}) => apiGet("/cockpit/sites", criteres);
export const getSiteCockpit = (domaine) => apiGet("/cockpit/site", { domaine });
