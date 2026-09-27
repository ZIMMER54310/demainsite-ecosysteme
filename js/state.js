const initialState = { apiStatus: null, currentDomain: null, currentSite: null, currentSiteFull: null, user: null };
const state = { ...initialState };
const listeners = new Set();
export function getState(){ return Object.freeze({ ...state }); }
export function setState(patch){ Object.assign(state, patch); listeners.forEach(fn => fn(getState())); }
export function subscribe(fn){ listeners.add(fn); return () => listeners.delete(fn); }
