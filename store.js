// Estado do curso.
//
// O conteúdo publicado vive em `catalogo.json` (empacotado com o site): é o que
// todos os alunos veem. O painel do admin trabalha sobre uma cópia local
// (localStorage) para editar e publicar; a cópia local nunca é lida pelo aluno,
// por isso ele nunca fica com uma versão diferente da publicada.
//
// Antes isto guardava tudo no navegador de cada visitante, então cada pessoa
// via uma cópia diferente do curso (e a cópia de demonstração do código).

import catalogo from './catalogo.json';
import { listarCatalogoRemoto } from './armazenamento.js';

const AULAS_KEY = 'curso:aulas:v2';
const MODULOS_KEY = 'curso:modulos:v2';
const AULAS_OLD = 'curso:aulas:v1';
const MODULOS_OLD = 'curso:modulos:v1';
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

function emit(name, detail) {
  if (typeof window === 'undefined' || typeof CustomEvent === 'undefined') return;
  window.dispatchEvent(new CustomEvent(name, detail ? { detail } : undefined));
}

/* --------------------------------------------------------- catálogo publicado */

// Catálogo publicado no serviço compartilhado (Supabase): é o que vale para
// todos os visitantes. Se ainda não houver nada publicado, vale o arquivo
// `catalogo.json` que vem empacotado com o site.
let catalogoRemoto = null;
let catalogoRemotoTentado = false;

/**
 * Busca o catálogo publicado no serviço compartilhado.
 * `forcar = true` busca de novo (usado para atualizar periodicamente).
 */
export async function carregarCatalogoRemoto(forcar = false) {
  if (catalogoRemotoTentado && !forcar) return catalogoRemoto;
  catalogoRemotoTentado = true;
  try {
    const dados = await listarCatalogoRemoto();
    if (dados && Array.isArray(dados.aulas)) {
      catalogoRemoto = {
        versao: Date.now(),
        atualizadoEm: dados.atualizadoEm || '',
        modulos: Array.isArray(dados.modulos) ? dados.modulos : [],
        aulas: dados.aulas,
      };
    }
  } catch {
    // Sem serviço configurado ou fora do ar: segue com o catálogo do site.
  }
  return catalogoRemoto;
}

/** Catálogo publicado no site: a versão oficial do curso para todos. */
export function catalogoPublico() {
  if (catalogoRemoto) return catalogoRemoto;
  return {
    versao: catalogo.versao ?? 1,
    atualizadoEm: catalogo.atualizadoEm || '',
    modulos: Array.isArray(catalogo.modulos) ? catalogo.modulos : [],
    aulas: Array.isArray(catalogo.aulas) ? catalogo.aulas : [],
  };
}

/** Gera o conteúdo do arquivo `catalogo.json` a partir do estado atual. */
export function montarCatalogo() {
  return {
    versao: Date.now(),
    atualizadoEm: new Date().toISOString(),
    modulos: getModulos(),
    aulas: getAulas(),
  };
}

/** Aplica um catálogo (importado ou publicado) no estado local do admin. */
export function aplicarCatalogo(dados = {}) {
  if (Array.isArray(dados.aulas)) writeJSON(AULAS_KEY, dados.aulas);
  if (Array.isArray(dados.modulos)) writeJSON(MODULOS_KEY, dados.modulos);
  emit('aulas:changed');
}

/* -------------------------------------------------------------------- aulas */

export function getAulas() {
  if (!isAdmin()) return catalogoPublico().aulas;
  const list = readJSON(AULAS_KEY, null);
  if (!Array.isArray(list)) {
    // migração: aproveita o que já existia no navegador do admin
    const antigo = readJSON(AULAS_OLD, null);
    const base = Array.isArray(antigo) && antigo.length ? antigo : catalogoPublico().aulas;
    writeJSON(AULAS_KEY, base);
    return base;
  }
  return list;
}

export function saveAulas(list) {
  writeJSON(AULAS_KEY, list);
  emit('aulas:changed');
}

export function getModulos() {
  if (!isAdmin()) return catalogoPublico().modulos;
  const list = readJSON(MODULOS_KEY, null);
  if (!Array.isArray(list)) {
    const antigo = readJSON(MODULOS_OLD, null);
    const base = Array.isArray(antigo) && antigo.length ? antigo : catalogoPublico().modulos;
    writeJSON(MODULOS_KEY, base);
    return base;
  }
  return list;
}

export function saveModulos(list) {
  writeJSON(MODULOS_KEY, list);
  emit('aulas:changed');
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
