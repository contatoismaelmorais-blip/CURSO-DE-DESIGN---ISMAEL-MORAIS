// Persistência local: metadados de aulas/módulos em localStorage, binários em IndexedDB.
const AULAS_KEY = 'curso:aulas:v1';
const MODULOS_KEY = 'curso:modulos:v1';
const ADMIN_KEY = 'curso:admin:v1';

export function uid(prefix = 'id') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJSON(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

export function getAulas() {
  const list = readJSON(AULAS_KEY, null);
  if (!Array.isArray(list)) {
    const seeded = seedAulas();
    writeJSON(AULAS_KEY, seeded);
    return seeded;
  }
  return list;
}

export function saveAulas(list) {
  writeJSON(AULAS_KEY, list);
  window.dispatchEvent(new CustomEvent('aulas:changed'));
}

export function getModulos() {
  const list = readJSON(MODULOS_KEY, null);
  if (!Array.isArray(list)) {
    const seeded = seedModulos();
    writeJSON(MODULOS_KEY, seeded);
    return seeded;
  }
  return list;
}

export function saveModulos(list) {
  writeJSON(MODULOS_KEY, list);
  window.dispatchEvent(new CustomEvent('aulas:changed'));
}

export function getAula(id) {
  return getAulas().find((a) => a.id === id) || null;
}

export function upsertAula(aula) {
  const list = getAulas();
  const idx = list.findIndex((a) => a.id === aula.id);
  if (idx >= 0) list[idx] = { ...list[idx], ...aula };
  else list.push(aula);
  saveAulas(list);
  return aula.id;
}

export function deleteAula(id) {
  saveAulas(getAulas().filter((a) => a.id !== id));
}

export function isAdmin() {
  return sessionStorage.getItem(ADMIN_KEY) === '1';
}

export function setAdmin(on) {
  if (on) sessionStorage.setItem(ADMIN_KEY, '1');
  else sessionStorage.removeItem(ADMIN_KEY);
}

/** Extrai o ID do vídeo de URLs do YouTube (watch, youtu.be, embed, shorts, live). */
export function parseYouTubeId(url) {
  if (!url) return '';
  const raw = String(url).trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(raw)) return raw;
  const patterns = [
    /(?:youtube\.com|youtube-nocookie\.com)\/watch\?(?:.*&)?v=([A-Za-z0-9_-]{11})/,
    /youtu\.be\/([A-Za-z0-9_-]{11})/,
    /(?:youtube\.com|youtube-nocookie\.com)\/embed\/([A-Za-z0-9_-]{11})/,
    /(?:youtube\.com|youtube-nocookie\.com)\/shorts\/([A-Za-z0-9_-]{11})/,
    /(?:youtube\.com|youtube-nocookie\.com)\/live\/([A-Za-z0-9_-]{11})/,
    /(?:youtube\.com|youtube-nocookie\.com)\/v\/([A-Za-z0-9_-]{11})/,
  ];
  for (const re of patterns) {
    const m = raw.match(re);
    if (m) return m[1];
  }
  return '';
}

export function youtubeThumb(id) {
  return id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : '';
}

export function youtubeEmbed(id) {
  return `https://www.youtube-nocookie.com/embed/${id}?rel=0&modestbranding=1`;
}

function seedModulos() {
  return [
    { id: 'mod_1', nome: 'Módulo 1 — Fundamentos', ordem: 1 },
    { id: 'mod_2', nome: 'Módulo 2 — Prática', ordem: 2 },
  ];
}

function seedAulas() {
  const agora = Date.now();
  return [
    {
      id: 'aula_1',
      titulo: 'Abertura do curso e apresentação',
      descricao: 'Boas-vindas, apresentação do projeto e como acompanhar as aulas. Baixe o material de apoio desta aula na aba Arquivos.',
      moduloId: 'mod_1',
      ordem: 1,
      youtubeId: 'jNQXAC9IVRw',
      publicado: true,
      criadoEm: agora,
    },
    {
      id: 'aula_2',
      titulo: 'Introdução ao design: conceitos e ferramenta',
      descricao: 'Panorama inicial do design, interfaces e o que você vai produzir ao longo do curso.',
      moduloId: 'mod_1',
      ordem: 2,
      youtubeId: 'aqz-KE-bpKQ',
      publicado: true,
      criadoEm: agora + 1000,
    },
    {
      id: 'aula_3',
      titulo: 'Mão na massa: primeiro projeto guiado',
      descricao: 'Exercício prático do primeiro módulo, do zero até a entrega.',
      moduloId: 'mod_2',
      ordem: 1,
      youtubeId: 'aqz-KE-bpKQ',
      publicado: true,
      criadoEm: agora + 2000,
    },
  ];
}
