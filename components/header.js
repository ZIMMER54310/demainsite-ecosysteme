import { CONFIG } from "../js/config.js";
export function renderHeader(status){ const ok=status?.succes===true; return `<div class="topbar"><div class="brand"><span class="brand-mark">DS</span><span>${CONFIG.APP_NAME}</span></div><div class="topbar-actions"><span class="status ${ok?"":"off"}">${ok?"Service disponible":"Service à vérifier"}</span></div></div>`; }
