const paths = {
  file: '<path d="M14 3H5v18h14V8Zm0 0v5h5M8 12h8M8 16h8"/>',
  home: '<path d="m3 10 9-7 9 7v10H6V10"/><path d="M9 20v-7h6v7"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c5 5 5 13 0 18-5-5-5-13 0-18Z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  settings: '<path d="m9 3-1 3-3 1v4l-2 1 2 1v4l3 1 1 3h6l1-3 3-1v-4l2-1-2-1V7l-3-1-1-3Z"/><circle cx="12" cy="12" r="3"/>',
  users: '<circle cx="9" cy="8" r="3"/><path d="M3 20v-3a6 6 0 0 1 12 0v3M17 5a3 3 0 0 1 0 6M18 14a5 5 0 0 1 3 6"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1"/><path d="m3 17 5-5 4 4 4-6 5 7"/>',
  layers: '<path d="m12 3 10 5-10 5L2 8Zm-10 9 10 5 10-5M2 16l10 5 10-5"/>',
  edit: '<path d="m15 4 5 5M4 20l4-1L20 7a3 3 0 0 0-4-4L4 15Zm0 0h16"/>',
  search: '<circle cx="10" cy="10" r="7"/><path d="m15 15 6 6"/>',
  chart: '<path d="M4 20V10M12 20V4M20 20v-7"/>',
  list: '<path d="M9 6h12M9 12h12M9 18h12M3 6h1M3 12h1M3 18h1"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  external: '<path d="M14 3h7v7M21 3l-11 11M10 3H3v18h18v-7"/>',
  panel: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M9 3v18m7-13-3 4 3 4"/>',
  arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
  sync: '<path d="M20 11a8 8 0 0 0-14.5-4.5L3 9m0-5v5h5M4 13a8 8 0 0 0 14.5 4.5L21 15m0 5v-5h-5"/>'
};

export function icon(name) {
  return `<svg class="dse-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths[name] || paths.layers}</svg>`;
}

export function iconForRoute(route) {
  if (route.includes("/synchronisations")) return "sync";
  if (route.includes("/utilisateurs")) return "users";
  if (route.includes("/administration")) return "settings";
  if (route.includes("/creer")) return "plus";
  if (route.includes("/sites")) return "globe";
  if (route.includes("medias") || route.includes("identite")) return "image";
  if (route.includes("/construire")) return "layers";
  return route === "/cockpit" ? "home" : "layers";
}
