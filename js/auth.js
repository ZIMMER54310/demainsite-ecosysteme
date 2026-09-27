// V1 lecture seule. Le raccordement Entra External ID sera ajouté derrière l’API DSE sécurisée.
export async function initializeAuth(){ return { authenticated: false, mode: "lecture-seule", displayName: "Utilisateur DSE" }; }
export function signIn(){ throw new Error("Connexion Entra External ID non activée dans la V1."); }
export function signOut(){ location.hash = "#/"; }
