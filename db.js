// Armazenamento dos arquivos das aulas (IndexedDB com fallback em localStorage).
const DB_NAME = 'curso-aulas-db';
const STORE = 'arquivos';
const FALLBACK_KEY = 'curso:arquivos:fallback:v1';
let dbPromise = null;

function emit(name, detail) {
  if (typeof window === 'undefined' || typeof CustomEvent === 'undefined') return;
  window.dispatchEvent(new CustomEvent(name, detail ? { detail } : undefined));
}

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) return reject(new Error('IndexedDB indisponível'));
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('aulaId', 'aulaId', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }).catch((err) => {
    dbPromise = null;
    throw err;
  });
  return dbPromise;
}

function useFallback() {
  try {
    localStorage.setItem('__probe__', '1');
    localStorage.removeItem('__probe__');
    return true;
  } catch {
    return false;
  }
}

function readFallback() {
  try {
    return JSON.parse(localStorage.getItem(FALLBACK_KEY) || '[]');
  } catch {
    return [];
  }
}

function writeFallback(list) {
  localStorage.setItem(FALLBACK_KEY, JSON.stringify(list));
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(blob);
  });
}

async function dataUrlToBlob(dataUrl) {
  const res = await fetch(dataUrl);
  return res.blob();
}

/** Grava um arquivo anexado a uma aula. */
export async function saveFile(aulaId, file) {
  const id = `arq_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  const registro = {
    id,
    aulaId,
    nome: file.name,
    tipo: file.type || 'application/octet-stream',
    tamanho: file.size,
    criadoEm: Date.now(),
  };
  try {
    const db = await openDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put({ ...registro, blob: file });
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    if (!useFallback()) throw new Error('Não foi possível salvar o arquivo neste navegador.');
    const dataUrl = await blobToDataUrl(file);
    const list = readFallback();
    list.push({ ...registro, dataUrl });
    try {
      writeFallback(list);
    } catch {
      throw new Error('Armazenamento local cheio: remova arquivos antigos ou use um navegador com mais espaço.');
    }
  }
  emit('arquivos:changed', { aulaId });
  return registro;
}

export async function listFiles(aulaId) {
  try {
    const db = await openDB();
    const itens = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).index('aulaId').getAll(aulaId);
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
    return itens.sort((a, b) => b.criadoEm - a.criadoEm);
  } catch {
    return readFallback()
      .filter((f) => f.aulaId === aulaId)
      .sort((a, b) => b.criadoEm - a.criadoEm);
  }
}

export async function countFiles(aulaId) {
  const itens = await listFiles(aulaId);
  return itens.length;
}

export async function getFile(id) {
  try {
    const db = await openDB();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    const item = readFallback().find((f) => f.id === id) || null;
    if (!item) return null;
    return { ...item, blob: await dataUrlToBlob(item.dataUrl) };
  }
}

export async function deleteFile(id) {
  try {
    const db = await openDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(id);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    writeFallback(readFallback().filter((f) => f.id !== id));
  }
  emit('arquivos:changed');
}

/** Baixa/abre o arquivo salvo. */
export async function downloadFile(id, nome) {
  const item = await getFile(id);
  if (!item) return false;
  const url = URL.createObjectURL(item.blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nome || item.nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return true;
}

export { formatSize, formatDate } from './util.js';
