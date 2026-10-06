"use strict";

const normaliser = (v) => String(v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr");

function paginer(elements, query, { tris, filtres = {}, recherche }) {
  const tri = Object.hasOwn(tris, query.tri) ? query.tri : Object.keys(tris)[0];
  const sens = query.sens === "desc" ? "desc" : "asc";
  const parPage = [10, 25, 50, 100].includes(Number(query.parPage)) ? Number(query.parPage) : 25;
  const q = String(query.q || "").trim().slice(0, 255);
  const criteres = { q, tri, sens, parPage };
  for (const cle of Object.keys(filtres)) criteres[cle] = String(query[cle] || "").slice(0, 255);
  const selection = elements.filter((el) => (!q || normaliser(recherche(el)).includes(normaliser(q))) &&
    Object.entries(filtres).every(([cle, valeur]) => !criteres[cle] || String(valeur(el)) === criteres[cle]));
  selection.sort((a, b) => {
    const va = tris[tri](a), vb = tris[tri](b);
    const ordre = typeof va === "number" ? va - vb : normaliser(va).localeCompare(normaliser(vb), "fr");
    return (sens === "desc" ? -1 : 1) * ordre || String(a.ref || a.id).localeCompare(String(b.ref || b.id));
  });
  const pages = Math.max(1, Math.ceil(selection.length / parPage));
  const page = Math.min(pages, Math.max(1, parseInt(query.page, 10) || 1));
  return { elements: selection.slice((page - 1) * parPage, page * parPage), total: elements.length,
    totalElements: elements.length, page, pages, parPage, criteres: { ...criteres, page } };
}

module.exports = { paginer };
