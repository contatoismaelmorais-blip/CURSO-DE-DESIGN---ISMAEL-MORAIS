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

/** Configuração atual (padrões do projeto + ajustes do admin neste navegador). */
export function configArmazenamento() {
  const base = content.armazenamento || {};
  let local = {};
  try {
    local = JSON.parse(localStorage.getItem(CONFIG_KEY) || '{}');
  } catch {
    local = {};
  }
  const url = String(local.url || base.url || '').trim().replace(/\/+$/, '');
  const anonKey = String(local.anonKey || base.anonKey || '');
  const bucket = String(local.bucket || base.bucket || 'materiais');
  return { url, anonKey, bucket, ativo: Boolean(url) };
}

/** Guarda a configuração de armazenamento escolhida pelo admin. */
export function salvarConfigArmazenamento(cfg = {}) {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg));
}

function cabecalhos(extra = {}) {
  const { anonKey } = configArmazenamento();
  return {
    apikey: anonKey,
    Authorization: `Bearer ${anonKey}`,
    ...extra,
  };
}

function caminhoSeguro(aulaId, nome) {
  const ext = String(nome).includes('.') ? String(nome).split('.').pop().toLowerCase() : 'bin';
  const base = String(nome).replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 60);
  return `${aulaId || 'sem-aula'}/${Date.now().toString(36)}-${base}.${ext}`;
}

/** Lista os materiais de uma aula no serviço compartilhado. */
export async function listarRemoto(aulaId) {
  const { url } = configArmazenamento();
  const res = await fetch(`${url}/rest/v1/arquivos?aulaId=eq.${encodeURIComponent(aulaId)}&select=*`, {
    headers: cabecalhos(),
  });
  if (!res.ok) throw new Error(`Falha ao listar materiais (HTTP ${res.status}).`);
  const dados = await res.json();
  return Array.isArray(dados) ? dados : [];
}

/** Lista todos os materiais (inclusive os que estão na lixeira). */
export async function listarTodosRemoto() {
  const { url } = configArmazenamento();
  const res = await fetch(`${url}/rest/v1/arquivos?select=*&order=criadoEm.desc`, {
    headers: cabecalhos(),
  });
  if (!res.ok) throw new Error(`Falha ao listar materiais (HTTP ${res.status}).`);
  const dados = await res.json();
  return Array.isArray(dados) ? dados : [];
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
    aulaId,
    nome: file.name,
    tipo: file.type || 'application/octet-stream',
    tamanho: file.size,
    criadoEm: new Date().toISOString(),
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
  const res = await fetch(`${url}/rest/v1/arquivos?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: cabecalhos({ 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
    body: JSON.stringify(campos),
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
