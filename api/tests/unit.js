"use strict";
// Tests unitaires sans reseau ni ecriture : securite DNS, filtrage --domaine, Nginx.
const assert = require("assert");
const { calculerPlanDns } = require("../shared/ovh");
const { selectionner, confHttp, DOMAINE_VALIDE } = require("../shared/domaines");
const IP = "1.2.3.4";
const A = (id, t) => ({ id, fieldType: "A", target: t });

// DNS : deja correct -> aucune action
assert.deepStrictEqual(calculerPlanDns("x.fr", IP, [A(1, IP)], [{ id: 2, fieldType: "CNAME", target: "x.fr." }]), []);
// DNS : absent -> creations seulement, aucune suppression
let p = calculerPlanDns("x.fr", IP, [], []);
assert.ok(p.length === 2 && p.every((a) => a.op === "creer" && a.ids.length === 0));
// DNS : mauvais A -> seul cet id est remplace
p = calculerPlanDns("x.fr", IP, [A(9, "9.9.9.9")], [{ id: 2, fieldType: "CNAME", target: "x.fr." }]);
assert.deepStrictEqual(p.map((a) => [a.op, a.ids]), [["remplacer", [9]]]);
// Le plan ne vise jamais MX/TXT/etc.
assert.ok(calculerPlanDns("x.fr", IP, [A(9, "z")], [A(8, "z")]).every((a) => ["A", "CNAME"].includes(a.type) && ["", "www"].includes(a.sousDomaine)));

// Filtrage
const tous = [{ domaine: "a.fr" }, { domaine: "b.fr" }];
assert.deepStrictEqual(selectionner(tous, { filtre: "a.fr", ecriture: true }).domaines, [{ domaine: "a.fr" }]);
assert.ok(selectionner(tous, { ecriture: true }).erreur, "ecriture sans domaine refusee");
assert.ok(selectionner(tous, { filtre: "", ecriture: false }).erreur, "--domaine= vide refuse");
assert.ok(selectionner(tous, { filtre: "inconnu.fr", ecriture: false }).erreur, "domaine hors SharePoint refuse");
assert.ok(selectionner(tous, { filtre: "a.fr; rm -rf /", ecriture: true }).erreur, "injection refusee");
assert.strictEqual(selectionner(tous, { ecriture: false }).domaines.length, 2, "plan = tous, lecture seule");
assert.strictEqual(selectionner(tous, { ecriture: true, tous: true }).domaines.length, 2);

// Noms et Nginx
for (const m of ["a b.fr", "../etc.fr", "a.fr;x", "a", "-a.fr", "a/b.fr"]) assert.ok(!DOMAINE_VALIDE.test(m), m);
const conf = confHttp("x.fr");
assert.ok(/server_name x\.fr www\.x\.fr;/.test(conf) && !/ssl_certificate/.test(conf));
// Rattachement au site par l'ID natif de la liste cible du Lookup (OBJ-SITE -> OBJ-SITE-PUBLIC)
const { correspondAuSite } = require("../shared/dse");
const colSite = [{ name: "OBJ_x002d_SITE", displayName: "OBJ-SITE", lookup: { listId: "{ABC}" } }];
assert.ok(correspondAuSite({ OBJ_x002d_SITELookupId: "4" }, colSite, 4, "abc"));
assert.ok(!correspondAuSite({ OBJ_x002d_SITELookupId: "5" }, colSite, 4, "abc"));
assert.ok(!correspondAuSite({ OBJ_x002d_SITELookupId: "4" }, colSite, 4, "autre"));
console.log("unit OK");
