import { apiGet } from "../js/api.js";
export const getMoi = () => apiGet("/moi");
export const getSitesCockpit = () => apiGet("/cockpit/sites");
export const getSiteCockpit = (domaine) => apiGet("/cockpit/site", { domaine });
