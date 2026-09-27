const routes = new Map();
export function registerRoute(path, handler){ routes.set(path, handler); }
export function navigate(path){ location.hash = `#${path}`; }
export async function resolveRoute(){ const raw = location.hash.slice(1) || "/"; const [path, queryString=""] = raw.split("?"); const params = Object.fromEntries(new URLSearchParams(queryString)); const exact = routes.get(path); if (exact) return exact(params); const match = [...routes.entries()].find(([pattern]) => pattern.includes(":") && matchPattern(pattern,path)); if(match){ const [pattern,handler]=match; return handler({...params,...extract(pattern,path)}); } return routes.get("/404")?.({}); }
function matchPattern(pattern,path){ const a=pattern.split("/").filter(Boolean),b=path.split("/").filter(Boolean); return a.length===b.length && a.every((x,i)=>x.startsWith(":")||x===b[i]); }
function extract(pattern,path){ const a=pattern.split("/").filter(Boolean),b=path.split("/").filter(Boolean),out={}; a.forEach((x,i)=>{if(x.startsWith(":"))out[x.slice(1)]=decodeURIComponent(b[i]);}); return out; }
export function startRouter(){ addEventListener("hashchange",resolveRoute); return resolveRoute(); }
