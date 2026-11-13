// Armazenamento dos arquivos das aulas.
//
// Duas camadas:
//  - compartilhada (serviço configurado pelo admin): todo aluno lista e baixa;
//  - local (IndexedDB com fallback para localStorage): usada enquanto não há
//    serviço configurado — nesse caso os materiais ficam só no navegador de
//    quem administra.
import {
  configArmazenamento,
  listarRemoto,
  listarTodosRemoto,
  enviarRemoto,
  atualizarRemoto,
  removerRemoto,
  urlDownloadRemoto,
} from './armazenamento.js';

const DB_NAME = 'curso-aulas-db';
const STORE = 'arquivos';
const FALLBACK_KEY = 'curso:arquivos:fallback:v1';
let dbPromise = null;

/** Timestamp em milissegundos, aceita número ou data ISO. */
function ts(valor) {
  if (typeof valor === 'number') return valor;
  const t = Date.parse(valor || '');
  return Number.isNaN(t) ? 0 : t;
}

/** Há um serviço de armazenamento compartilhado configurado? */
export function armazenamentoCompartilhado() {
  return configArmazenamento().ativo;
}

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
  if (armazenamentoCompartilhado()) return enviarRemoto(aulaId, file);
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
  if (armazenamentoCompartilhado()) {
    const itens = await listarRemoto(aulaId);
    return itens.filter((f) => !f.lixeiraEm).sort((a, b) => ts(b.criadoEm) - ts(a.criadoEm));
  }
  try {
    const db = await openDB();
    const itens = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).index('aulaId').getAll(aulaId);
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
    return itens
      .filter((f) => !f.lixeiraEm)
      .sort((a, b) => b.criadoEm - a.criadoEm);
  } catch {
    return readFallback()
      .filter((f) => f.aulaId === aulaId && !f.lixeiraEm)
      .sort((a, b) => b.criadoEm - a.criadoEm);
  }
}

/** Arquivos marcados como excluídos (na lixeira de 24h). */
export async function listTrashedFiles() {
  if (armazenamentoCompartilhado()) {
    const itens = await listarTodosRemoto();
    return itens.filter((f) => f.lixeiraEm).sort((a, b) => ts(b.lixeiraEm) - ts(a.lixeiraEm));
  }
  try {
    const db = await openDB();
    const itens = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
    return itens
      .filter((f) => f.lixeiraEm)
      .sort((a, b) => b.lixeiraEm - a.lixeiraEm);
  } catch {
    return readFallback()
      .filter((f) => f.lixeiraEm)
      .sort((a, b) => b.lixeiraEm - a.lixeiraEm);
  }
}

/** Move o arquivo para a lixeira: o binário continua guardado por 24h. */
export async function trashFile(id, expiraEm = Date.now() + 24 * 60 * 60 * 1000) {
  if (armazenamentoCompartilhado()) {
    await atualizarRemoto(id, { lixeiraEm: new Date().toISOString(), expiraEm: new Date(expiraEm).toISOString() });
    emit('arquivos:changed');
    return { id, lixeiraEm: Date.now(), expiraEm };
  }
  const item = await getFile(id);
  if (!item) return null;
  item.lixeiraEm = Date.now();
  item.expiraEm = expiraEm;
  try {
    const db = await openDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(item);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    const list = readFallback();
    const i = list.findIndex((f) => f.id === id);
    if (i >= 0) list[i] = { ...list[i], lixeiraEm: item.lixeiraEm, expiraEm };
    writeFallback(list);
  }
  emit('arquivos:changed');
  return item;
}

/** Tira o arquivo da lixeira e devolve para a aula original. */
export async function restoreFile(id) {
  if (armazenamentoCompartilhado()) {
    await atualizarRemoto(id, { lixeiraEm: null, expiraEm: null });
    emit('arquivos:changed');
    return true;
  }
  const item = await getFile(id);
  if (!item) return false;
  delete item.lixeiraEm;
  delete item.expiraEm;
  try {
    const db = await openDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(item);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    const list = readFallback();
    const i = list.findIndex((f) => f.id === id);
    if (i >= 0) list[i] = { ...list[i] };
    writeFallback(list);
  }
  emit('arquivos:changed');
  return true;
}

/** Remove em definitivo os arquivos que passaram do prazo de 24h. */
export async function purgeExpiredFiles() {
  const agora = Date.now();
  if (armazenamentoCompartilhado()) {
    const lixados = await listTrashedFiles();
    let n = 0;
    for (const f of lixados) {
      if (f.expiraEm && ts(f.expiraEm) <= agora) {
        await removerRemoto(f);
        n += 1;
      }
    }
    if (n) emit('arquivos:changed');
    return n;
  }
  const lixados = await listTrashedFiles();
  let n = 0;
  for (const f of lixados) {
    if (f.expiraEm && f.expiraEm <= agora) {
      await deleteFile(f.id);
      n += 1;
    }
  }
  return n;
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
  if (armazenamentoCompartilhado()) {
    const todos = await listarTodosRemoto();
    const alvo = todos.find((f) => f.id === id);
    if (alvo) await removerRemoto(alvo);
    emit('arquivos:changed');
    return;
  }
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
  if (armazenamentoCompartilhado()) {
    const todos = await listarTodosRemoto();
    const alvo = todos.find((f) => f.id === id);
    if (!alvo?.path) return false;
    const res = await fetch(urlDownloadRemoto(alvo));
    if (!res.ok) return false;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nome || alvo.nome;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    return true;
  }
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
