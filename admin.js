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
import { listFiles, saveFile, deleteFile, downloadFile, formatSize, formatDate } from './db.js';
import content from './content.json';

function esc(str = '') {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

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
        <p class="muted small">PIN inicial: ${esc(content.adminPin)} — altere em Configurações após o primeiro acesso.</p>
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
        <span class="eyebrow">Administração</span>
        <h1>Painel do curso</h1>
        <p class="muted">Cadastre aulas, defina os links do YouTube, títulos, ordem e os arquivos de cada aula.</p>
      </div>
      <div class="admin-actions">
        <button class="btn btn--primary" id="nova-aula">+ Nova aula</button>
        <button class="btn btn--ghost" id="novo-modulo">+ Novo módulo</button>
        <button class="btn btn--ghost" id="abrir-painel">Ver como aluno</button>
        <button class="btn btn--danger" id="sair">Sair</button>
      </div>
    </section>

    <section class="panel">
      <h2>Módulos</h2>
      <ul class="module-list">
        ${modulos.map((m) => `
          <li>
            <span class="mod-nome">${esc(m.nome)}</span>
            <span class="muted small">${aulas.filter((a) => a.moduloId === m.id).length} aula(s)</span>
            <span class="row-actions">
              <button class="btn btn--small" data-edit-modulo="${esc(m.id)}">Editar</button>
              <button class="btn btn--small btn--danger" data-del-modulo="${esc(m.id)}">Excluir</button>
            </span>
          </li>`).join('')}
      </ul>
    </section>

    <section class="panel">
      <h2>Aulas</h2>
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>Aula</th><th>Módulo</th><th>Vídeo (YouTube)</th><th>Arquivos</th><th>Status</th><th>Ações</th>
            </tr>
          </thead>
          <tbody>
            ${aulas.length ? aulas.sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0)).map((a) => adminRow(a, modulos)).join('') : '<tr><td colspan="6" class="muted">Nenhuma aula cadastrada.</td></tr>'}
          </tbody>
        </table>
      </div>
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
      <td>${esc(mod ? mod.nome : '—')}</td>
      <td>${id ? `<code>${id}</code>` : '<span class="muted">sem link</span>'}</td>
      <td class="files-count" data-count-for="${esc(a.id)}">…</td>
      <td>${a.publicado === false ? '<span class="badge badge--off">Rascunho</span>' : '<span class="badge">Publicado</span>'}</td>
      <td class="row-actions">
        <button class="btn btn--small" data-edit="${esc(a.id)}">Editar</button>
        <button class="btn btn--small" data-arquivos="${esc(a.id)}">Arquivos</button>
        <button class="btn btn--small btn--danger" data-del="${esc(a.id)}">Excluir</button>
      </td>
    </tr>`;
}

function bindAdmin(root) {
  root.querySelector('#nova-aula').addEventListener('click', () => openAulaModal(root, null));
  root.querySelector('#novo-modulo').addEventListener('click', () => openModuloModal(root, null));
  root.querySelector('#abrir-painel').addEventListener('click', () => { location.hash = '#/'; });
  root.querySelector('#sair').addEventListener('click', () => { setAdmin(false); renderAdminPage(root); });
  root.querySelector('#pin-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const pin = root.querySelector('#novo-pin').value.trim();
    if (!pin) return toast('Informe um PIN.', 'warn');
    localStorage.setItem('curso:admin:pin', pin);
    toast('PIN atualizado.');
  });

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

/* -------------------------------------------------------------- modais */
function modalRoot() {
  return document.getElementById('modal-root');
}

function openModal(html) {
  const root = modalRoot();
  root.innerHTML = `<div class="modal-backdrop" data-close="1"><div class="modal">${html}</div></div>`;
  root.querySelector('[data-close]').addEventListener('click', (e) => {
    if (e.target.dataset.close) closeModal();
  });
  document.addEventListener('keydown', escClose);
  return root;
}

function escClose(e) {
  if (e.key === 'Escape') closeModal();
}

function closeModal() {
  modalRoot().innerHTML = '';
  document.removeEventListener('keydown', escClose);
}

function openAulaModal(root, aulaId) {
  const aula = aulaId ? getAula(aulaId) : null;
  const modulos = getModulos().sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));
  const data = aula || {
    id: uid('aula'), titulo: '', descricao: '', moduloId: modulos[0]?.id || '', ordem: 1,
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
      : '<span>Link inválido ou vazio — use um link do YouTube (watch, youtu.be, shorts ou embed).</span>';
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
    <h2>Arquivos — ${esc(aula.titulo)}</h2>
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
    for (const f of Array.from(input.files)) await saveFile(aulaId, f);
    input.value = '';
    toast('Arquivo(s) enviado(s).');
    await refreshArqList(m, aulaId);
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
