import { DSE_CONFIG } from "./config.js";
async function request(path, options={}) {
 const c=new AbortController(); const t=setTimeout(()=>c.abort(),DSE_CONFIG.TIMEOUT_MS);
 try { const r=await fetch(`${DSE_CONFIG.API_BASE_URL}${path}`,{...options,headers:{"Content-Type":"application/json",...(options.headers||{})},signal:c.signal}); if(!r.ok) throw new Error(`API DSE : HTTP ${r.status}`); return await r.json(); } finally { clearTimeout(t); }
}
const q=v=>encodeURIComponent(v);
export const api={
 etat:()=>request(DSE_CONFIG.ROUTES.etat),
 siteParId:id=>request(`${DSE_CONFIG.ROUTES.siteParId}?id=${q(id)}`),
 siteParDomaine:d=>request(`${DSE_CONFIG.ROUTES.siteParDomaine}?domaine=${q(d)}`),
 siteComplet:id=>request(`${DSE_CONFIG.ROUTES.siteComplet}?id=${q(id)}`)
};
