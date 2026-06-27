const devStores = new Map<string, Map<string, unknown>>();

function devNamespace(namespace: string) {
  let store = devStores.get(namespace);
  if (!store) {
    store = new Map<string, unknown>();
    devStores.set(namespace, store);
  }
  return store;
}

function objectName(namespace: string, id: string) {
  return `${namespace}:${id}`;
}

export async function readJsonStore<T>(
  env: any,
  namespace: string,
  id: string,
  key: string,
  fallback: T,
): Promise<T> {
  if (env?.DEMO_JSON_STORE) {
    const stub = env.DEMO_JSON_STORE.get(env.DEMO_JSON_STORE.idFromName(objectName(namespace, id)));
    const res = await stub.fetch(`https://demo-json-store.local/${encodeURIComponent(key)}`);
    if (res.status === 404) return fallback;
    if (!res.ok) throw new Error(`json store read failed: ${res.status}`);
    return (await res.json()) as T;
  }
  return (devNamespace(objectName(namespace, id)).get(key) as T | undefined) ?? fallback;
}

export async function writeJsonStore(
  env: any,
  namespace: string,
  id: string,
  key: string,
  value: unknown,
): Promise<void> {
  if (env?.DEMO_JSON_STORE) {
    const stub = env.DEMO_JSON_STORE.get(env.DEMO_JSON_STORE.idFromName(objectName(namespace, id)));
    const res = await stub.fetch(`https://demo-json-store.local/${encodeURIComponent(key)}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(value),
    });
    if (!res.ok) throw new Error(`json store write failed: ${res.status}`);
    return;
  }
  devNamespace(objectName(namespace, id)).set(key, value);
}

export async function deleteJsonStore(env: any, namespace: string, id: string, key?: string): Promise<void> {
  if (env?.DEMO_JSON_STORE) {
    const stub = env.DEMO_JSON_STORE.get(env.DEMO_JSON_STORE.idFromName(objectName(namespace, id)));
    const path = key ? `/${encodeURIComponent(key)}` : '/';
    const res = await stub.fetch(`https://demo-json-store.local${path}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(`json store delete failed: ${res.status}`);
    return;
  }
  const store = devNamespace(objectName(namespace, id));
  if (key) store.delete(key);
  else store.clear();
}
