// Lixeira: itens excluídos ficam guardados por 24h antes da remoção definitiva.
// As aulas e módulos vão para o localStorage; os arquivos binários continuam
// no IndexedDB apenas marcados com `lixeiraEm`, para não duplicar os blobs.
const LIJEIRA_KEY = 'curso:lixeira:v1';
export const RETENCAO_MS = 24 * 60 * 60 * 1000; // 24 horas

function emit(name, detail) {
  if (typeof window === 'undefined' || typeof CustomEvent === 'undefined') return;
  window.dispatchEvent(new CustomEvent(name, detail ? { detail } : undefined));
}

function read() {
  try {
    const raw = localStorage.getItem(LIJEIRA_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function write(list) {
  localStorage.setItem(LIJEIRA_KEY, JSON.stringify(list));
  emit('lixeira:changed');
}

function uid(prefix = 'lix') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Remove da lixeira tudo que passou de 24h (limpeza automática). */
export function limparLixeira() {
  const agora = Date.now();
  const lista = read();
  const restantes = lista.filter((it) => it.expiraEm > agora);
  if (restantes.length !== lista.length) write(restantes);
  return restantes;
}

/** Envia um item (aula, módulo ou arquivo) para a lixeira. */
export function enviarParaLixeira(item) {
  const lista = limparLixeira();
  const agora = Date.now();
  const entrada = {
    lixeiraId: uid('lix'),
    tipo: item.tipo, // 'aula' | 'modulo' | 'arquivo'
    titulo: item.titulo || 'Item sem título',
    meta: item.meta || '',
    dados: item.dados || null, // payload completo para restauração
    criadoEm: agora,
    expiraEm: agora + RETENCAO_MS,
  };
  lista.push(entrada);
  write(lista);
  return entrada;
}

/** Itens ainda dentro do prazo de 24h. */
export function getLixeira() {
  return limparLixeira().sort((a, b) => b.criadoEm - a.criadoEm);
}

/** Exclui da lixeira de imediato (limpeza manual). */
export function esvaziarLixeira() {
  write([]);
}

export function removerDaLixeira(lixeiraId) {
  write(read().filter((it) => it.lixeiraId !== lixeiraId));
}

export function formatarRestante(expiraEm) {
  const falta = expiraEm - Date.now();
  if (falta <= 0) return 'expira já';
  const h = Math.floor(falta / 3600000);
  const m = Math.floor((falta % 3600000) / 60000);
  if (h >= 1) return `${h}h ${String(m).padStart(2, '0')}min restantes`;
  if (m >= 1) return `${m}min restantes`;
  return 'expira em instantes';
}
