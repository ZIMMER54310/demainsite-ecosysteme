import { CONFIG } from "./config.js";

export class ApiError extends Error {
  constructor(message, status = 0, details = null) { super(message); this.name = "ApiError"; this.status = status; this.details = details; }
}

function buildUrl(path, query = {}) {
  const url = new URL(`${CONFIG.API_BASE_URL}${path}`, window.location.origin);
  Object.entries(query).forEach(([key, value]) => { if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, value); });
  return url;
}

export async function apiGet(path, query = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CONFIG.REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(buildUrl(path, query), { headers: { Accept: "application/json" }, signal: controller.signal, cache: "no-store" });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new ApiError(payload?.erreur?.message || payload?.error?.message || `Erreur API ${response.status}`, response.status, payload);
    return payload;
  } catch (error) {
    if (error.name === "AbortError") throw new ApiError("Le délai de réponse de l’API est dépassé.");
    if (error instanceof ApiError) throw error;
    throw new ApiError("Connexion à l’API DSE impossible.", 0, error);
  } finally { clearTimeout(timer); }
}

// Ecritures du cockpit : meme origine, cookie de session HttpOnly, corps JSON.
export async function apiPost(path, corps = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(CONFIG.REQUEST_TIMEOUT_MS, 30000));
  try {
    const acces = await apiGet("/acces/status");
    const response = await fetch(buildUrl(path), {
      method: "POST", credentials: "same-origin", cache: "no-store", signal: controller.signal,
      headers: { Accept: "application/json", "Content-Type": "application/json",
        "X-DSE-CSRF": acces?.donnees?.csrf || "" }, body: JSON.stringify(corps)
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new ApiError(payload?.erreur?.message || payload?.error?.message || `Erreur API ${response.status}`, response.status, payload);
    return payload;
  } catch (error) {
    if (error.name === "AbortError") throw new ApiError("Le délai de réponse est dépassé. Vérifiez le résultat avant de recommencer.");
    if (error instanceof ApiError) throw error;
    throw new ApiError("Connexion à l’API DSE impossible.", 0, error);
  } finally { clearTimeout(timer); }
}
