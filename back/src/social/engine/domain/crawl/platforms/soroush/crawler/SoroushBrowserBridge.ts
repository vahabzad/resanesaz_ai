/// <reference lib="dom" />

// This executes in Soroush's page. Resolve factories by their capabilities so
// chunk hashes and numeric module IDs are not part of our crawler contract.
export function installSoroushBridge(): boolean {
  const clientWindow = window as any;
  const chunks = clientWindow.webpackChunkSoroushPlus;
  if (!chunks) return false;
  let requireModule: any;
  chunks.push([[`vav-soroush-${Date.now()}`], {}, (runtime: any) => { requireModule = runtime; }]);
  if (!requireModule?.m) return false;
  const entries = Object.entries(requireModule.m) as [string, Function][];
  const storeEntry = entries.find(([, factory]) => {
    const source = factory.toString();
    return source.includes('getGlobal:') && source.includes('getActions:');
  });
  const apiEntry = entries.find(([, factory]) => {
    const source = factory.toString();
    return source.includes('type:"callApi"') && source.includes('toggleDebugMode');
  });
  if (!storeEntry || !apiEntry) return false;
  const storeExports = requireModule(storeEntry[0]);
  const storeFactory = Object.values(storeExports).find((value) =>
    typeof value === 'function' && value.toString().includes('getGlobal:') && value.toString().includes('getActions:'),
  ) as (() => any) | undefined;
  const store = storeFactory?.();
  const api = requireModule(apiEntry[0]);
  if (!store?.getGlobal || !store?.getActions || typeof api.px !== 'function') return false;
  // All native chat objects, sessions and access hashes stay inside the page.
  clientWindow.__vavSoroush = { store, callApi: api.px };
  return true;
}
