export function renderAlert(message,type="info"){ return `<div class="alert alert-${type}" role="alert">${message}</div>`; }
export function showAlert(message,type="info"){ const host=document.querySelector("#app-alerts"); if(host)host.innerHTML=renderAlert(message,type); }
export function clearAlert(){ const host=document.querySelector("#app-alerts"); if(host)host.innerHTML=""; }