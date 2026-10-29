import {
  getAulas,
  saveAulas,
  getModulos,
  saveModulos,
  getAula,
  upsertAula,
  deleteAula,
  parseYouTubeId,
  youtubeThumb,
  isAdmin,
  setAdmin,
  uid,
} from './store.js';
import { listFiles, saveFile, deleteFile, downloadFile } from './db.js';
import { buscarVideosDoCanal, parseUrlList } from './youtube.js';
import { esc, formatSize, formatDate } from './util.js';
import content from './content.json';

// Estado da importação em andamento (some do painel quando a página é redesenhada).
let importacao = { itens: [], feedUrl: '' };

function toast(msg, kind = 'ok') {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.className = `toast toast--${kind} is-visible`;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { el.className = 'toast'; }, 3200);
}

/* ------------------------------------------------------------------ login */
function renderLogin(root) {
  root.innerHTML = `
    <section class="login">
      <h1>Painel do admin</h1>
      <p class="muted">Informe o PIN para gerenciar aulas, links do YouTube e arquivos.</p>
      <form id="login-form" class="card-form">
        <label>Digite o PIN
          <input type="password" id="pin" inputmode="numeric" autocomplete="off" required>
        </label>
        <button class="btn btn--primary" type="submit">Entrar</button>
        <p class="muted small">PIN inicial: ${esc(content.adminPin)}. Altere em Configurações após o primeiro acesso.</p>
      </form>
    </section>`;
  root.querySelector('#login-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const pin = root.querySelector('#pin').value.trim();
    if (pin === (localStorage.getItem('curso:admin:pin') || content.adminPin)) {
      setAdmin(true);
      renderAdminPage(root);
    } else {
      toast('PIN incorreto.', 'error');
    }
  });
}

/* -------------------------------------------------------------- admin page */
export function renderAdminPage(root) {
  if (!isAdmin()) return renderLogin(root);
  const aulas = getAulas();
  const modulos = getModulos().sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));

  root.innerHTML = `
    <section class="admin-head">
      <div>
        <h1>Painel do curso</h1>
        <p class="muted">${aulas.length} aula${aulas.length === 1 ? '' : 's'} em ${modulos.length} módulo${modulos.length === 1 ? '' : 's'}. Defina links do YouTube, títulos, ordem e os arquivos de cada aula.</p>
      </div>
      <div class="admin-actions">
        <button class="btn btn--primary" id="nova-aula">+ Nova aula</button>
        <button class="btn btn--ghost" id="novo-modulo">+ Novo módulo</button>
      </div>
    </section>

    <section class="panel">
      <h2>Módulos</h2>
      ${
        modulos.length
          ? `<ul class="module-list">
        ${modulos.map((m) => `
          <li>
            <span class="mod-nome">${esc(m.nome)}</span>
            <span class="muted small">${aulas.filter((a) => a.moduloId === m.id).length} aula${aulas.filter((a) => a.moduloId === m.id).length === 1 ? '' : 's'}</span>
            <span class="row-actions">
              <button class="btn btn--small" data-edit-modulo="${esc(m.id)}">Editar</button>
              <button class="btn btn--small btn--danger" data-del-modulo="${esc(m.id)}">Excluir</button>
            </span>
          </li>`).join('')}
      </ul>`
          : `<div class="empty-state">
             <p>Nenhum módulo cadastrado. As aulas ficam agrupadas por módulo.</p>
             <button class="btn btn--ghost" id="primeiro-modulo">+ Criar módulo</button>
           </div>`
      }
    </section>

    <section class="panel">
      <h2>Aulas</h2>
      ${
        aulas.length
          ? `<div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>Aula</th><th>Módulo</th><th>Vídeo (YouTube)</th><th class="num">Arquivos</th><th>Status</th><th>Ações</th>
            </tr>
          </thead>
          <tbody>
            ${aulas.sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0)).map((a) => adminRow(a, modulos)).join('')}
          </tbody>
        </table>
      </div>`
          : `<div class="empty-state">
             <p>Nenhuma aula cadastrada. Comece pela primeira aula do curso.</p>
             <button class="btn btn--primary" id="primeira-aula">+ Cadastrar a primeira aula</button>
           </div>`
      }
    </section>

    <section class="panel">
      <h2>Importar aulas do canal do YouTube</h2>
      <p class="muted">Cole o link do canal (youtube.com/@canal), o link do feed RSS ou a lista de links das aulas. Cada vídeo vira uma aula no módulo escolhido; os materiais continuam sendo enviados pela aba Arquivos.</p>
      <form class="card-form" id="import-form">
        <label>Link do canal ou feed RSS
          <input type="text" id="imp-url" placeholder="https://www.youtube.com/@canal">
        </label>
        <div class="grid-2">
          <label>Módulo de destino
            <select id="imp-modulo">
              ${modulos.length ? modulos.map((m) => `<option value="${esc(m.id)}">${esc(m.nome)}</option>`).join('') : '<option value="">Criar módulo novo</option>'}
            </select>
          </label>
          <label>Ao importar
            <select id="imp-publicado">
              <option value="1">Publicar</option>
              <option value="0">Rascunho</option>
            </select>
          </label>
        </div>
        <div class="row-actions">
          <button class="btn btn--primary" type="submit">Buscar vídeos</button>
        </div>
        <p class="imp-aviso" id="imp-status"></p>
      </form>
      <form class="card-form" id="import-lista-form">
        <label>Ou cole os links das aulas (um por linha)
          <textarea id="imp-lista" rows="3" placeholder="https://www.youtube.com/watch?v=..."></textarea>
        </label>
        <div class="row-actions">
          <button class="btn btn--ghost" type="submit">Ler lista de links</button>
        </div>
      </form>
      <div id="imp-preview"></div>
    </section>

    <section class="panel">
      <h2>Configurações</h2>
      <form class="card-form" id="pin-form">
        <label>Alterar PIN do admin
          <input type="text" id="novo-pin" value="${esc(localStorage.getItem('curso:admin:pin') || content.adminPin)}">
        </label>
        <button class="btn btn--primary" type="submit">Salvar PIN</button>
      </form>
      <p class="muted small">Os dados ficam salvos neste navegador (localStorage + IndexedDB). Nada é enviado para servidores externos além do player do YouTube.</p>
      <div class="admin-actions admin-actions--row">
        <button class="btn btn--ghost" id="exportar">Exportar dados</button>
        <button class="btn btn--ghost" id="importar">Importar dados</button>
        <button class="btn btn--ghost" id="abrir-painel">Ver como aluno</button>
        <button class="btn btn--danger" id="sair">Sair</button>
      </div>
    </section>
  `;

  bindAdmin(root);
}

function adminRow(a, modulos) {
  const mod = modulos.find((m) => m.id === a.moduloId);
  const id = esc(a.youtubeId || '');
  return `
    <tr data-id="${esc(a.id)}">
      <td>
        <strong>${esc(a.titulo)}</strong>
        <div class="muted small">ordem ${esc(a.ordem ?? 0)}</div>
      </td>
      <td>${esc(mod ? mod.nome : 'sem módulo')}</td>
      <td>${id ? `<code>${id}</code>` : '<span class="muted">sem link</span>'}</td>
      <td class="files-count num" data-count-for="${esc(a.id)}">…</td>
      <td>${a.publicado === false ? '<span class="badge badge--off">Rascunho</span>' : '<span class="badge">Publicado</span>'}</td>
      <td class="row-actions">
        <button class="btn btn--small" data-up="${esc(a.id)}" title="Subir">↑</button>
        <button class="btn btn--small" data-down="${esc(a.id)}" title="Descer">↓</button>
        <button class="btn btn--small" data-edit="${esc(a.id)}">Editar</button>
        <button class="btn btn--small" data-arquivos="${esc(a.id)}">Arquivos</button>
        <button class="btn btn--small btn--danger" data-del="${esc(a.id)}">Excluir</button>
      </td>
    </tr>`;
}

function bindAdmin(root) {
  root.querySelector('#nova-aula')?.addEventListener('click', () => openAulaModal(root, null));
  root.querySelector('#primeira-aula')?.addEventListener('click', () => openAulaModal(root, null));
  root.querySelector('#novo-modulo')?.addEventListener('click', () => openModuloModal(root, null));
  root.querySelector('#primeiro-modulo')?.addEventListener('click', () => openModuloModal(root, null));
  root.querySelector('#abrir-painel')?.addEventListener('click', () => { location.hash = '#/'; });
  root.querySelector('#exportar')?.addEventListener('click', () => {
    const payload = JSON.stringify({ aulas: getAulas(), modulos: getModulos() }, null, 2);
    const blob = new Blob([payload], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'curso-aulas-backup.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
    toast('Backup exportado.');
  });
  root.querySelector('#importar')?.addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const data = JSON.parse(await file.text());
        if (!Array.isArray(data.aulas) || !Array.isArray(data.modulos)) throw new Error('Arquivo inválido');
        saveAulas(data.aulas);
        saveModulos(data.modulos);
        toast('Dados importados.');
        renderAdminPage(root);
      } catch (err) {
        toast(err.message || 'Falha ao importar o backup.', 'error');
      }
    });
    input.click();
  });
  root.querySelector('#sair')?.addEventListener('click', () => { setAdmin(false); renderAdminPage(root); });
  /* ------------------------------------------------ importação do canal */
  root.querySelector('#import-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const url = root.querySelector('#imp-url').value.trim();
    const status = root.querySelector('#imp-status');
    const botao = root.querySelector('#import-form button[type="submit"]');
    if (!url) {
      status.textContent = 'Cole o link do canal ou do feed RSS.';
      return;
    }
    botao.disabled = true;
    status.textContent = 'Buscando vídeos no canal…';
    try {
      const { itens, feedUrl } = await buscarVideosDoCanal(url);
      importacao = { itens, feedUrl };
      mostrarPreview(root);
      status.textContent = `${itens.length} vídeo(s) encontrado(s) no canal.`;
    } catch (err) {
      importacao = { itens: [], feedUrl: '' };
      root.querySelector('#imp-preview').innerHTML = '';
      status.textContent = err.message || 'Não foi possível ler o canal.';
    } finally {
      botao.disabled = false;
    }
  });

  root.querySelector('#import-lista-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const itens = parseUrlList(root.querySelector('#imp-lista').value);
    if (!itens.length) {
      toast('Nenhum link do YouTube reconhecido na lista.', 'warn');
      return;
    }
    importacao = { itens, feedUrl: '' };
    mostrarPreview(root);
    const status = root.querySelector('#imp-status');
    if (status) status.textContent = `${itens.length} link(s) lido(s) da lista.`;
  });
  root.querySelector('#pin-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const pin = root.querySelector('#novo-pin').value.trim();
    if (!pin) return toast('Informe um PIN.', 'warn');
    localStorage.setItem('curso:admin:pin', pin);
    toast('PIN atualizado.');
  });

  root.querySelectorAll('[data-up]').forEach((b) => b.addEventListener('click', () => moverAula(b.dataset.up, -1, root)));
  root.querySelectorAll('[data-down]').forEach((b) => b.addEventListener('click', () => moverAula(b.dataset.down, 1, root)));
  root.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => openAulaModal(root, b.dataset.edit)));
  root.querySelectorAll('[data-arquivos]').forEach((b) => b.addEventListener('click', () => openArquivosModal(root, b.dataset.arquivos)));
  root.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
    const aula = getAula(b.dataset.del);
    if (!aula) return;
    if (confirm(`Excluir a aula "${aula.titulo}"? Os arquivos dela também serão removidos.`)) {
      const vinculados = await listFiles(aula.id);
      for (const f of vinculados) await deleteFile(f.id);
      deleteAula(aula.id);
      toast('Aula excluída.');
      renderAdminPage(root);
    }
  }));
  root.querySelectorAll('[data-edit-modulo]').forEach((b) => b.addEventListener('click', () => openModuloModal(root, b.dataset.editModulo)));
  root.querySelectorAll('[data-del-modulo]').forEach((b) => b.addEventListener('click', () => {
    const mod = getModulos().find((m) => m.id === b.dataset.delModulo);
    if (!mod) return;
    const aulas = getAulas().filter((a) => a.moduloId === mod.id);
    if (aulas.length && !confirm(`O módulo "${mod.nome}" tem ${aulas.length} aula(s). Excluir o módulo e mover essas aulas para o primeiro módulo?`)) return;
    const todos = getModulos();
    const fallback = todos.find((m) => m.id !== mod.id);
    saveAulas(getAulas().map((a) => (a.moduloId === mod.id ? { ...a, moduloId: fallback ? fallback.id : '' } : a)));
    saveModulos(todos.filter((m) => m.id !== mod.id));
    toast('Módulo excluído.');
    renderAdminPage(root);
  }));

  root.querySelectorAll('[data-count-for]').forEach(async (cell) => {
    const n = (await listFiles(cell.dataset.countFor)).length;
    cell.textContent = `${n} arquivo${n === 1 ? '' : 's'}`;
  });
}

/* --------------------------------------------------- importação do canal */
/** Data do feed formatada para leitura (o feed devolve ISO 8601). */
function dataFeed(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
}

/** Mostra a prévia dos vídeos encontrados, marcando os que já são aulas. */
function mostrarPreview(root) {
  const box = root.querySelector('#imp-preview');
  if (!box) return;
  const itens = importacao.itens;
  if (!itens.length) {
    box.innerHTML = '';
    return;
  }
  const existentes = new Set(getAulas().map((a) => a.youtubeId).filter(Boolean));
  box.innerHTML = `
    <div class="imp-lista">
      ${itens
        .map(
          (it) => `
        <label class="imp-item">
          <input type="checkbox" value="${esc(it.youtubeId)}" data-imp-check ${existentes.has(it.youtubeId) ? '' : 'checked'}>
          <img class="imp-thumb" src="${esc(it.thumb)}" alt="" loading="lazy">
          <span class="imp-info">
            <strong>${esc(it.titulo)}</strong>
            <span>${it.publicado ? esc(dataFeed(it.publicado)) : 'sem data informada'}</span>
          </span>
          ${existentes.has(it.youtubeId) ? '<span class="imp-tag imp-tag--dup">já cadastrada</span>' : ''}
        </label>`
        )
        .join('')}
    </div>
    <div class="row-actions" style="margin-top:14px">
      <button class="btn btn--primary" id="imp-confirmar">Importar selecionadas</button>
      <button class="btn btn--ghost" id="imp-limpar">Limpar lista</button>
    </div>`;

  box.querySelector('#imp-confirmar')?.addEventListener('click', () => confirmarImportacao(root));
  box.querySelector('#imp-limpar')?.addEventListener('click', () => {
    importacao = { itens: [], feedUrl: '' };
    box.innerHTML = '';
    const status = root.querySelector('#imp-status');
    if (status) status.textContent = '';
  });
}

/** Cria as aulas a partir dos vídeos marcados na prévia. */
function confirmarImportacao(root) {
  const box = root.querySelector('#imp-preview');
  if (!box) return;
  const marcados = new Set(
    [...box.querySelectorAll('[data-imp-check]')].filter((c) => c.checked).map((c) => c.value),
  );
  if (!marcados.size) return toast('Selecione ao menos um vídeo.', 'warn');

  let modulos = getModulos();
  let modulo = modulos.find((m) => m.id === root.querySelector('#imp-modulo').value);
  if (!modulo) {
    modulo = { id: uid('mod'), nome: 'Aulas importadas', ordem: modulos.length + 1 };
    modulos = [...modulos, modulo];
    saveModulos(modulos);
  }

  const aulas = getAulas();
  const existentes = new Set(aulas.map((a) => a.youtubeId).filter(Boolean));
  let ordem = aulas.reduce((max, a) => Math.max(max, a.ordem ?? 0), 0);
  const publicado = root.querySelector('#imp-publicado').value === '1';
  let criadas = 0;

  for (const item of importacao.itens) {
    if (!marcados.has(item.youtubeId)) continue;
    if (existentes.has(item.youtubeId)) continue;
    ordem += 1;
    aulas.push({
      id: uid('aula'),
      titulo: item.titulo,
      descricao: item.canal ? `Vídeo do canal ${item.canal}.` : '',
      moduloId: modulo.id,
      ordem,
      youtubeId: item.youtubeId,
      publicado,
      origem: 'youtube-import',
      criadoEm: Date.now(),
    });
    existentes.add(item.youtubeId);
    criadas += 1;
  }

  saveAulas(aulas);
  importacao = { itens: [], feedUrl: '' };
  toast(
    criadas ? `${criadas} aula(s) importada(s).` : 'Nenhuma aula nova: os vídeos já estavam cadastrados.',
    criadas ? 'ok' : 'warn',
  );
  renderAdminPage(root);
}

/* Move a aula uma posição na ordem global do curso. */
function moverAula(aulaId, direcao, root) {
  const aulas = getAulas().sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));
  const i = aulas.findIndex((a) => a.id === aulaId);
  const j = i + direcao;
  if (i < 0 || j < 0 || j >= aulas.length) return;
  const a = aulas[i];
  const b = aulas[j];
  const tmp = a.ordem ?? 0;
  a.ordem = b.ordem ?? 0;
  b.ordem = tmp;
  saveAulas(aulas);
  toast('Ordem das aulas atualizada.');
  renderAdminPage(root);
}

/* -------------------------------------------------------------- modais */
function modalRoot() {
  return document.getElementById('modal-root');
}

function openModal(html) {
  const root = modalRoot();
  const focoAnterior = document.activeElement;
  root.innerHTML = `<div class="modal-backdrop" data-close="1">
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">${html}</div>
  </div>`;
  root.querySelector('[data-close]').addEventListener('click', (e) => {
    if (e.target.dataset.close) closeModal();
  });
  document.removeEventListener('keydown', escClose);
  document.addEventListener('keydown', escClose);
  const titulo = root.querySelector('h2');
  if (titulo) titulo.id = 'modal-title';
  const primeiro = root.querySelector('input, select, textarea, button');
  if (primeiro) primeiro.focus();
  root._focoAnterior = focoAnterior;
  return root;
}

function escClose(e) {
  if (e.key === 'Escape') {
    closeModal();
    return;
  }
  // Mantém o foco dentro do modal
  if (e.key !== 'Tab') return;
  const root = modalRoot();
  const focaveis = [...root.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])')];
  if (!focaveis.length) return;
  const primeiro = focaveis[0];
  const ultimo = focaveis[focaveis.length - 1];
  if (e.shiftKey && document.activeElement === primeiro) {
    e.preventDefault();
    ultimo.focus();
  } else if (!e.shiftKey && document.activeElement === ultimo) {
    e.preventDefault();
    primeiro.focus();
  }
}

function closeModal() {
  const root = modalRoot();
  const anterior = root._focoAnterior;
  root.innerHTML = '';
  root._focoAnterior = null;
  document.removeEventListener('keydown', escClose);
  if (anterior && typeof anterior.focus === 'function') anterior.focus();
}

function openAulaModal(root, aulaId) {
  const aula = aulaId ? getAula(aulaId) : null;
  const modulos = getModulos().sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));
  const data = aula || {
    id: uid('aula'), titulo: '', descricao: '', moduloId: modulos[0]?.id || '',
    ordem: (getAulas().reduce((max, a) => Math.max(max, a.ordem ?? 0), 0) || 0) + 1,
    youtubeUrl: '', publicado: true,
  };
  openModal(`
    <h2>${aula ? 'Editar aula' : 'Nova aula'}</h2>
    <form id="aula-form" class="card-form">
      <label>Título da aula
        <input type="text" id="f-titulo" required value="${esc(data.titulo)}">
      </label>
      <label>Link do YouTube
        <input type="url" id="f-url" placeholder="https://www.youtube.com/watch?v=..." value="${esc(data.youtubeUrl || (aula && aula.youtubeId ? `https://www.youtube.com/watch?v=${aula.youtubeId}` : ''))}">
      </label>
      <p class="muted small" id="f-preview"></p>
      <label>Descrição
        <textarea id="f-desc" rows="3">${esc(data.descricao || '')}</textarea>
      </label>
      <div class="grid-2">
        <label>Módulo
          <select id="f-modulo">
            ${modulos.map((m) => `<option value="${esc(m.id)}" ${m.id === data.moduloId ? 'selected' : ''}>${esc(m.nome)}</option>`).join('')}
          </select>
        </label>
        <label>Ordem
          <input type="number" id="f-ordem" min="0" value="${esc(data.ordem ?? 1)}">
        </label>
      </div>
      <label class="check"><input type="checkbox" id="f-pub" ${data.publicado === false ? '' : 'checked'}> Publicada (visível para alunos)</label>
      <div class="modal-actions">
        <button type="button" class="btn btn--ghost" data-close-btn>Cancelar</button>
        <button type="submit" class="btn btn--primary">Salvar aula</button>
      </div>
    </form>
  `);

  const m = modalRoot();
  m.querySelector('[data-close-btn]').addEventListener('click', closeModal);

  const urlInput = m.querySelector('#f-url');
  const preview = m.querySelector('#f-preview');
  const upd = () => {
    const id = parseYouTubeId(urlInput.value);
    preview.innerHTML = id
      ? `<img class="yt-preview" src="${esc(youtubeThumb(id))}" alt=""><span>ID detectado: <code>${esc(id)}</code></span>`
      : '<span>Link inválido ou vazio. Use um link do YouTube (watch, youtu.be, shorts ou embed).</span>';
  };
  urlInput.addEventListener('input', upd);
  upd();

  m.querySelector('#aula-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const youtubeId = parseYouTubeId(urlInput.value);
    const titulo = m.querySelector('#f-titulo').value.trim();
    if (!titulo) return toast('Informe o título da aula.', 'warn');
    upsertAula({
      id: data.id,
      titulo,
      descricao: m.querySelector('#f-desc').value.trim(),
      moduloId: m.querySelector('#f-modulo').value,
      ordem: Number(m.querySelector('#f-ordem').value) || 0,
      youtubeId,
      publicado: m.querySelector('#f-pub').checked,
      criadoEm: aula?.criadoEm || Date.now(),
    });
    closeModal();
    toast('Aula salva.');
    renderAdminPage(root);
  });
}

function openModuloModal(root, moduloId) {
  const mod = moduloId ? getModulos().find((m) => m.id === moduloId) : null;
  openModal(`
    <h2>${mod ? 'Editar módulo' : 'Novo módulo'}</h2>
    <form id="mod-form" class="card-form">
      <label>Nome do módulo
        <input type="text" id="m-nome" required value="${esc(mod?.nome || '')}">
      </label>
      <label>Ordem
        <input type="number" id="m-ordem" min="0" value="${esc(mod?.ordem ?? getModulos().length + 1)}">
      </label>
      <div class="modal-actions">
        <button type="button" class="btn btn--ghost" data-close-btn>Cancelar</button>
        <button type="submit" class="btn btn--primary">Salvar módulo</button>
      </div>
    </form>
  `);
  const m = modalRoot();
  m.querySelector('[data-close-btn]').addEventListener('click', closeModal);
  m.querySelector('#mod-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const nome = m.querySelector('#m-nome').value.trim();
    if (!nome) return toast('Informe o nome do módulo.', 'warn');
    const ordem = Number(m.querySelector('#m-ordem').value) || 0;
    const list = getModulos();
    if (mod) {
      const i = list.findIndex((x) => x.id === mod.id);
      list[i] = { ...list[i], nome, ordem };
    } else {
      list.push({ id: uid('mod'), nome, ordem });
    }
    saveModulos(list);
    closeModal();
    toast('Módulo salvo.');
    renderAdminPage(root);
  });
}

async function openArquivosModal(root, aulaId) {
  const aula = getAula(aulaId);
  if (!aula) return;
  openModal(`
    <h2>Arquivos: ${esc(aula.titulo)}</h2>
    <form id="arq-form" class="upload">
      <label class="dropzone" for="f-arq">
        <strong>Enviar documentos</strong>
        <span>Clique para selecionar ou arraste arquivos (PDF, ZIP, imagens, planilhas…)</span>
        <input type="file" id="f-arq" multiple hidden>
      </label>
      <button class="btn btn--primary" type="submit">Enviar</button>
    </form>
    <div id="arq-list" class="files"><p class="muted">Carregando…</p></div>
  `);
  const m = modalRoot();
  m.querySelector('#arq-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = m.querySelector('#f-arq');
    if (!input.files.length) return toast('Selecione ao menos um arquivo.', 'warn');
    const btn = m.querySelector('#arq-form button');
    btn.disabled = true;
    try {
      for (const f of Array.from(input.files)) await saveFile(aulaId, f);
      input.value = '';
      toast('Arquivo(s) enviado(s).');
      await refreshArqList(m, aulaId);
    } catch (err) {
      toast(err.message || 'Falha ao enviar o arquivo.', 'error');
    } finally {
      btn.disabled = false;
    }
  });
  await refreshArqList(m, aulaId);
}

async function refreshArqList(m, aulaId) {
  const box = m.querySelector('#arq-list');
  const itens = await listFiles(aulaId);
  if (!itens.length) {
    box.innerHTML = '<p class="muted">Nenhum arquivo enviado para esta aula.</p>';
    return;
  }
  box.innerHTML = itens.map((f) => `
    <div class="file" data-id="${esc(f.id)}">
      <div class="file-info">
        <strong>${esc(f.nome)}</strong>
        <span class="muted">${esc(formatSize(f.tamanho))} · ${esc(formatDate(f.criadoEm))}</span>
      </div>
      <div class="file-actions">
        <button class="btn btn--small" data-dl="${esc(f.id)}">Baixar</button>
        <button class="btn btn--small btn--danger" data-rm="${esc(f.id)}">Excluir</button>
      </div>
    </div>`).join('');
  box.querySelectorAll('[data-dl]').forEach((b) => b.addEventListener('click', async () => {
    await downloadFile(b.dataset.dl);
  }));
  box.querySelectorAll('[data-rm]').forEach((b) => b.addEventListener('click', async () => {
    await deleteFile(b.dataset.rm);
    toast('Arquivo excluído.');
    refreshArqList(m, aulaId);
  }));
}
