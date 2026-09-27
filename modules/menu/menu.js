export function renderMenuModule(data) {
  const contenu = Array.isArray(data) && data.length
    ? `<span class="pill">${data.length} élément(s)</span>`
    : `<p class="muted">Aucune donnée associée.</p>`;

  return `
    <div class="module card">
      <h3>Menu</h3>
      ${contenu}
    </div>
  `;
}
