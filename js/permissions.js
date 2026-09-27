import { CONFIG } from "./config.js";
export function can(action){ if (CONFIG.READ_ONLY && ["create","update","delete","publish"].includes(action)) return false; return action === "read"; }
export function visibleSections(site){ const sections = ["menu","logo","entete","theme","seo"]; return sections.filter(key => site?.[key]?.disponible !== false); }
