/** Escapa HTML para uso em templates innerHTML. */
export function esc(str = '') {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

/** Formata bytes em KB/MB. */
export function formatSize(bytes) {
  if (!bytes && bytes !== 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Formata timestamp em data curta pt-BR. */
export function formatDate(ts) {
  return new Date(ts).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
}

/** Rótulo curto do tipo de arquivo, usado como ícone. */
export function extIcon(nome = '') {
  const ext = String(nome).split('.').pop().toLowerCase();
  if (ext === 'pdf') return 'PDF';
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'heic'].includes(ext)) return 'IMG';
  if (['doc', 'docx', 'odt', 'rtf'].includes(ext)) return 'DOC';
  if (['xls', 'xlsx', 'ods'].includes(ext)) return 'XLS';
  if (['ppt', 'pptx', 'key'].includes(ext)) return 'PPT';
  if (['txt', 'md', 'log'].includes(ext)) return 'TXT';
  if (ext === 'csv') return 'CSV';
  if (['zip', 'rar', '7z'].includes(ext)) return 'ZIP';
  if (['fig', 'sketch', 'psd', 'ai'].includes(ext)) return ext.toUpperCase();
  return 'ARQ';
}
