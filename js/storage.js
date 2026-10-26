// IndexedDB keeps full-resolution images out of localStorage's small quota.
export const LEGACY_KEY = 'bjornsveen_laserstudio_autosave_v1';
export function createWorkspaceStorage({ databaseName = 'bjornsveen_laserstudio', legacyKey = LEGACY_KEY, onStatus = null, openDatabase = null } = {}) {
  const DB_NAME = databaseName;
  let connection = null;
  const journalKey = legacyKey + '_pending_v3';
  let durableJournal = true;
  let revision = 0;
  let savedImages = new Map();
  const collectImages = (shapes, map = new Map()) => {
    for (const shape of shapes || []) {
      if (shape.type === 'group') collectImages(shape.children, map);
      else if (shape.type === 'image') map.set(shape.id, shape);
    }
    return map;
  };
  function makeJournal(payload) {
    const snapshot = workspacePayload(payload);
    for (const [id, image] of collectImages(snapshot.shapes)) {
      const saved = savedImages.get(id);
      for (const field of ['srcDataUrl', 'dataUrl']) {
        if (saved && image[field] && image[field] === saved[field]) {
          (image._assetRefs ||= []).push(field);
          delete image[field];
        }
      }
    }
    return JSON.stringify(snapshot);
  }
  let pending = null;
  let timer;
  let writing = null;
  let lastSaved = null;
  let restoreFailed = false;
  function status(message, failed = false) {
    if (onStatus) onStatus(message, failed);
    if (typeof window !== 'undefined' && !onStatus) window.dispatchEvent(new CustomEvent('workspace-storage', { detail: { message, failed } }));
  }
  function database() {
    if (connection) return Promise.resolve(connection);
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore('workspace');
      req.onsuccess = () => {
        connection = req.result;
        connection.onversionchange = () => { connection.close(); connection = null; };
        resolve(connection);
      };
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error('Lukk andre faner og prøv igjen.'));
    });
  }
  async function read() {
    const db = await (openDatabase || database)();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('workspace');
      const req = tx.objectStore('workspace').get('current');
      let value;
      req.onsuccess = () => { value = req.result; };
      tx.oncomplete = () => { resolve(value); };
      tx.onabort = tx.onerror = () => { reject(tx.error); };
    });
  }
  function write(payload) {
    const commit = db => new Promise((resolve, reject) => {
      const tx = db.transaction('workspace', 'readwrite');
      tx.objectStore('workspace').put(payload, 'current');
      tx.oncomplete = () => resolve();
      tx.onabort = tx.onerror = () => reject(tx.error);
    });
    // Start a transaction synchronously during pagehide when the database is open.
    if (connection && !openDatabase) return commit(connection);
    return (openDatabase || database)().then(commit);
  }
  function saveWorkspaceToLocal(state) {
    pending = state;
    revision++;
    if (!restoreFailed) {
      try { localStorage.setItem(journalKey, makeJournal(state)); durableJournal = true; }
      catch { durableJournal = false; status('Lagrer stort prosjekt … Vent på «Lagret lokalt» før du lukker.', false); }
    }
    clearTimeout(timer);
    timer = setTimeout(() => { void flushWorkspaceSave(); }, 250);
  }
  async function flushWorkspaceSave() {
    clearTimeout(timer);
    if (!pending || restoreFailed) { if (writing) await writing; return; }
    const state = pending;
    const revisionAtWrite = revision;
    pending = null;
    let payload, signature;
    try { payload = workspacePayload(state); signature = JSON.stringify(payload); }
    catch { status('Kunne ikke lagre prosjektet. Last ned en prosjektfil.', true); return; }
    if (!writing && signature === lastSaved) {
      try { localStorage.removeItem(journalKey); } catch {}
      durableJournal = true;
      return;
    }
    status('Lagrer …');
    // IndexedDB serializes these transactions. Queue the latest snapshot immediately,
    // even if another write is running, so pagehide never leaves it in a JS timer.
    let journalAtWrite;
    try { journalAtWrite = localStorage.getItem(journalKey); } catch {}
    const operation = write({ ...payload, savedAt: new Date().toISOString() })
      .then(() => {
        lastSaved = signature; savedImages = collectImages(payload.shapes);
        if (revision === revisionAtWrite) durableJournal = true;
        try { if (localStorage.getItem(journalKey) === journalAtWrite) localStorage.removeItem(journalKey); } catch {}
        if (revision === revisionAtWrite) status('Lagret lokalt');
      })
      .catch(() => { status('Lokal lagring feilet. Last ned prosjektet med «Lagre».', true); })
      .finally(() => { if (writing === operation) writing = null; });
    writing = operation;
    await operation;
  }
  async function loadWorkspaceFromLocal() {
    try {
      let saved = await read();
      if (saved) savedImages = collectImages(saved.shapes);
      const journal = localStorage.getItem(journalKey);
      if (journal) {
        const recovery = JSON.parse(journal);
        if (!Array.isArray(recovery.shapes)) throw new Error('Ugyldig gjenoppretting');
        for (const [id, image] of collectImages(recovery.shapes)) {
          for (const field of image._assetRefs || []) {
            if (!['srcDataUrl','dataUrl'].includes(field) || !savedImages.get(id)?.[field]) throw new Error('Bildedata mangler i gjenoppretting');
            image[field] = savedImages.get(id)[field];
          }
          delete image._assetRefs;
        }
        await write(recovery);
        saved = recovery; savedImages = collectImages(saved.shapes);
        localStorage.removeItem(journalKey);
      }
      if (saved !== undefined) {
        if (!Array.isArray(saved?.shapes)) throw new Error('Ugyldig lagring');
        lastSaved = JSON.stringify(workspacePayload(saved));
        status('Lagret prosjekt gjenopprettet');
        return saved;
      }
      const raw = localStorage.getItem(legacyKey);
      if (!raw) return null;
      const legacy = JSON.parse(raw);
      if (!Array.isArray(legacy?.shapes)) throw new Error('Ugyldig eldre lagring');
      // Keep the legacy copy until migration has committed successfully.
      await write(legacy);
      savedImages = collectImages(legacy.shapes);
      localStorage.removeItem(legacyKey);
      status('Tidligere prosjekt gjenopprettet');
      return legacy;
    } catch (error) {
      restoreFailed = true; // Never overwrite a project we could not read.
      status('Kunne ikke lese lokal lagring. Eksisterende lagring er bevart. Bruk prosjektfil.', true);
      return null;
    }
  }

  return { saveWorkspaceToLocal, flushWorkspaceSave, loadWorkspaceFromLocal, hasUnprotectedChanges: () => !durableJournal || (restoreFailed && Boolean(pending)) };
}
export function workspacePayload(state) {
  // Copy objects/arrays without re-encoding multi-megabyte immutable image strings.
  const copy = value => {
    if (Array.isArray(value)) return value.map(copy);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value)
      .filter(([key]) => !key.startsWith('_cached') && key !== 'xcsDataUrl' && key !== 'exportDataUrl')
      .map(([key, item]) => [key, copy(item)]));
    return value;
  };
  return copy({ version: 3, machineKey: state.machineKey, targetMachine: state.targetMachine,
    bedWidth: state.bedWidth, bedHeight: state.bedHeight, snapMm: state.snapMm, objectSnap: state.objectSnap,
    laserSettings: state.laserSettings, shapes: state.shapes });
}

export const { saveWorkspaceToLocal, flushWorkspaceSave, loadWorkspaceFromLocal, hasUnprotectedChanges } = createWorkspaceStorage();
