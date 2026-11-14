// Armazenamento compartilhado dos materiais das aulas.
//
// Sem configuração, os arquivos ficam no navegador de quem administra
// (IndexedDB) — ou seja, os alunos não os veem. Configurando um serviço
// compartilhado (por padrão a API REST do Supabase), os materiais passam a
// ficar num lugar comum: todo aluno consegue listar e baixar.
//
// Configuração (preenchida pelo admin em Configurações):
//   url     — endereço do projeto, ex.: https://SEU-PROJETO.supabase.co
//   anonKey — chave anônima (anon) do projeto
//   bucket  — nome do bucket de Storage (padrão: materiais)
//
// Tabela esperada (public.arquivos) e bucket de Storage, com políticas que
// permitam ler e escrever pelos alunos.

import content from './content.json';

const CONFIG_KEY = 'curso:armazenamento:v1';

/** Variáveis de ambiente injetadas na build (Vite) — quando existirem. */
function env(chaves) {
  try {
    const e = import.meta.env || {};
    for (const k of chaves) {
      if (e[k]) return String(e[k]);
    }
  } catch {
    /* ambiente sem import.meta.env */
  }
  return '';
}

/** Configuração global do site (injetada pelo servidor da plataforma). */
function globalConfig() {
  try {
    const g = (typeof window !== 'undefined' && (window.__SUPABASE__ || window.__NEXUS__?.supabase)) || {};
    return {
      url: String(g.url || g.supabaseUrl || ''),
      anonKey: String(g.anonKey || g.supabaseAnonKey || ''),
    };
  } catch {
    return { url: '', anonKey: '' };
  }
}

/** Configuração atual (padrões do projeto + ajustes do admin neste navegador). */
export function configArmazenamento() {
  const base = content.armazenamento || {};
  let local = {};
  try {
    local = JSON.parse(localStorage.getItem(CONFIG_KEY) || '{}');
  } catch {
    local = {};
  }
  const glob = globalConfig();
  const url = String(
    local.url || glob.url || base.url || env(['VITE_SUPABASE_URL', 'SUPABASE_URL', 'PUBLIC_SUPABASE_URL'])
  )
    .trim()
    .replace(/\/+$/, '');
  const anonKey = String(
    local.anonKey || glob.anonKey || base.anonKey || env(['VITE_SUPABASE_ANON_KEY', 'SUPABASE_ANON_KEY', 'PUBLIC_SUPABASE_ANON_KEY'])
  );
  const bucket = String(local.bucket || base.bucket || 'materiais');
  return { url, anonKey, bucket, ativo: Boolean(url) };
}

/** Guarda a configuração de armazenamento escolhida pelo admin. */
export function salvarConfigArmazenamento(cfg = {}) {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg));
}

function cabecalhos(extra = {}) {
  const { anonKey } = configArmazenamento();
  const base = { apikey: anonKey };
  // A chave pública nova (sb_publishable_…) não é um JWT: usá-la no header
  // Authorization seria rejeitada. Nesse caso, o papel anônimo vem do próprio
  // header apikey.
  if (/^eyJ|^sb_secret_/.test(anonKey)) {
    base.Authorization = `Bearer ${anonKey}`;
  }
  return { ...base, ...extra };
}

/** As colunas do banco são em minúsculas; aqui voltamos para o formato usado na interface. */
function normalizarRegistro(linha = {}) {
  return {
    ...linha,
    aulaId: linha.aulaId ?? linha.aulaid ?? '',
    criadoEm: linha.criadoEm ?? linha.criadoem ?? '',
    lixeiraEm: linha.lixeiraEm ?? linha.lixeiraem ?? null,
    expiraEm: linha.expiraEm ?? linha.expiraem ?? null,
  };
}

function caminhoSeguro(aulaId, nome) {
  const ext = String(nome).includes('.') ? String(nome).split('.').pop().toLowerCase() : 'bin';
  const base = String(nome).replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 60);
  return `${aulaId || 'sem-aula'}/${Date.now().toString(36)}-${base}.${ext}`;
}

/* ------------------------------------------------------------------ catálogo */

/** Catálogo publicado no Supabase (o mesmo para todos os visitantes). */
export async function listarCatalogoRemoto() {
  const { url } = configArmazenamento();
  if (!url) return null;
  const res = await fetch(`${url}/rest/v1/catalogo?id=eq.atual&select=dados`, {
    headers: cabecalhos(),
  });
  if (!res.ok) throw new Error(`Falha ao ler o catálogo publicado (HTTP ${res.status}).`);
  const linhas = await res.json();
  const dados = Array.isArray(linhas) ? linhas[0]?.dados : null;
  return dados && Array.isArray(dados.aulas) ? dados : null;
}

/** Publica o catálogo no Supabase: passa a valer para todos os alunos. */
export async function salvarCatalogoRemoto(dados) {
  const { url } = configArmazenamento();
  if (!url) throw new Error('Armazenamento compartilhado não configurado.');
  const res = await fetch(`${url}/rest/v1/catalogo?id=eq.atual`, {
    method: 'PATCH',
    headers: cabecalhos({ 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
    body: JSON.stringify({
      versao: Date.now(),
      atualizadoem: new Date().toISOString(),
      dados,
    }),
  });
  if (!res.ok) throw new Error(`Falha ao publicar o catálogo (HTTP ${res.status}).`);
  return true;
}

/* ---------------------------------------------------------------- materiais */

/** Lista os materiais de uma aula no serviço compartilhado. */
export async function listarRemoto(aulaId) {
  const { url } = configArmazenamento();
  const res = await fetch(`${url}/rest/v1/arquivos?aulaid=eq.${encodeURIComponent(aulaId)}&select=*`, {
    headers: cabecalhos(),
  });
  if (!res.ok) throw new Error(`Falha ao listar materiais (HTTP ${res.status}).`);
  const dados = await res.json();
  return Array.isArray(dados) ? dados.map(normalizarRegistro) : [];
}

/** Lista todos os materiais (inclusive os que estão na lixeira). */
export async function listarTodosRemoto() {
  const { url } = configArmazenamento();
  const res = await fetch(`${url}/rest/v1/arquivos?select=*&order=criadoem.desc`, {
    headers: cabecalhos(),
  });
  if (!res.ok) throw new Error(`Falha ao listar materiais (HTTP ${res.status}).`);
  const dados = await res.json();
  return Array.isArray(dados) ? dados.map(normalizarRegistro) : [];
}

/** Envia o arquivo para o bucket e grava os metadados na tabela. */
export async function enviarRemoto(aulaId, file) {
  const { url, bucket } = configArmazenamento();
  const id = `arq_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  const path = caminhoSeguro(aulaId, file.name);
  const up = await fetch(`${url}/storage/v1/object/${bucket}/${path}`, {
    method: 'POST',
    headers: cabecalhos({ 'Content-Type': file.type || 'application/octet-stream', 'x-upsert': 'true' }),
    body: file,
  });
  if (!up.ok) throw new Error(`Falha ao enviar o arquivo (HTTP ${up.status}).`);
  const registro = {
    id,
    aulaid: aulaId,
    nome: file.name,
    tipo: file.type || 'application/octet-stream',
    tamanho: file.size,
    criadoem: new Date().toISOString(),
    path,
  };
  const meta = await fetch(`${url}/rest/v1/arquivos`, {
    method: 'POST',
    headers: cabecalhos({ 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
    body: JSON.stringify(registro),
  });
  if (!meta.ok) throw new Error(`Falha ao registrar o arquivo (HTTP ${meta.status}).`);
  return registro;
}

/** Atualiza campos de um material (usado pela lixeira). */
export async function atualizarRemoto(id, campos = {}) {
  const { url } = configArmazenamento();
  // As colunas do banco são em minúsculas (aulaid, criadoem, lixeiraem…).
  const body = {};
  for (const [k, v] of Object.entries(campos)) body[k.toLowerCase()] = v;
  const res = await fetch(`${url}/rest/v1/arquivos?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: cabecalhos({ 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Falha ao atualizar o arquivo (HTTP ${res.status}).`);
  return true;
}

/** Apaga o material e o binário do bucket. */
export async function removerRemoto(registro) {
  const { url, bucket } = configArmazenamento();
  if (registro?.path) {
    await fetch(`${url}/storage/v1/object/${bucket}/${registro.path}`, {
      method: 'DELETE',
      headers: cabecalhos(),
    }).catch(() => {});
  }
  const res = await fetch(`${url}/rest/v1/arquivos?id=eq.${encodeURIComponent(registro.id)}`, {
    method: 'DELETE',
    headers: cabecalhos({ Prefer: 'return=minimal' }),
  });
  if (!res.ok) throw new Error(`Falha ao excluir o arquivo (HTTP ${res.status}).`);
  return true;
}

/** Endereço público de download do material. */
export function urlDownloadRemoto(registro) {
  const { url, bucket } = configArmazenamento();
  if (!registro?.path) return '';
  return `${url}/storage/v1/object/public/${bucket}/${registro.path}`;
}
