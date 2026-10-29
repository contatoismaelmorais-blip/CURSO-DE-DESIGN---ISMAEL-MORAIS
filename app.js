import {
  getAulas,
  getModulos,
  getAula,
  youtubeThumb,
  youtubeEmbed,
  isAdmin,
} from './store.js';
import { listFiles, saveFile, downloadFile, deleteFile, formatSize, formatDate } from './db.js';
import { renderAdminPage } from './admin.js';
import content from './content.json';

const app = document.getElementById('app');
const toastEl = document.getElementById('toast');

/* ---------------------------------------------------------------- helpers */
export function esc(str = '') {
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

export function toast(msg, kind = 'ok') {
  toastEl.textContent = msg;
  toastEl.className = `toast toast--${kind} is-visible`;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => {
    toastEl.className = 'toast';
  }, 3200);
}

function aulaOrdenadas() {
  return getAulas()
    .filter((a) => a.publicado !== false)
    .sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));
}

function modulosOrdenados() {
  return getModulos().sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));
}

/* ------------------------------------------------------------- roteamento */
function parseHash() {
  const hash = window.location.hash.replace(/^#/, '') || '/';
  const parts = hash.split('/').filter(Boolean);
  if (parts[0] === 'aula' && parts[1]) return { name: 'aula', id: parts[1] };
  if (parts[0] === 'admin') return { name: 'admin' };
  return { name: 'home' };
}

function navigate() {
  const route = parseHash();
  document.querySelectorAll('[data-nav]').forEach((el) => {
    el.classList.toggle('is-active', el.dataset.nav === (route.name === 'admin' ? 'admin' : 'aluno'));
  });
  window.scrollTo({ top: 0 });
  if (route.name === 'aula') renderAula(route.id);
  else if (route.name === 'admin') renderAdmin();
  else renderHome();
}

/* ------------------------------------------------------------------ home */
function renderHome() {
  const aulas = aulaOrdenadas();
  const modulos = modulosOrdenados();

  const modulosHtml = modulos
    .map((mod) => {
      const lista = aulas.filter((a) => a.moduloId === mod.id);
      if (!lista.length) return '';
      const cards = lista
        .map((a) => {
          const thumb = youtubeThumb(a.youtubeId);
          return `
          <article class="card" data-aula="${esc(a.id)}" tabindex="0" role="link" aria-label="${esc(a.titulo)}">
            <a class="card-thumb" href="#/aula/${esc(a.id)}">
              ${thumb ? `<img src="${esc(thumb)}" alt="" loading="lazy">` : '<span class="card-thumb-empty"></span>'}
              <span class="card-play" aria-hidden="true">▶</span>
            </a>
            <div class="card-body">
              <h3>${esc(a.titulo)}</h3>
              <p>${esc(a.descricao || 'Sem descrição')}</p>
            </div>
          </article>`;
        })
        .join('');
      return `
        <section class="module">
          <header class="module-head">
            <h2>${esc(mod.nome)}</h2>
            <span class="count">${lista.length} aula${lista.length > 1 ? 's' : ''}</span>
          </header>
          <div class="grid">${cards}</div>
        </section>`;
    })
    .join('');

  app.innerHTML = `
    <section class="hero">
      <span class="eyebrow">${esc(content.tagline)}</span>
      <h1>${esc(content.heroTitle)}</h1>
      <p>${esc(content.heroText)}</p>
      <div class="hero-actions">
        ${aulas.length ? `<a class="btn btn--primary" href="#/aula/${esc(aulas[0].id)}">Começar a assistir</a>` : ''}
        <a class="btn btn--ghost" href="#/admin">Área do admin</a>
      </div>
      <dl class="stats">
        <div><dt>Aulas</dt><dd>${aulas.length}</dd></div>
        <div><dt>Módulos</dt><dd>${modulos.length}</dd></div>
        <div><dt>Vídeos do YouTube</dt><dd>${aulas.filter((a) => a.youtubeId).length}</dd></div>
      </dl>
    </section>
    ${modulosHtml || '<p class="empty">Nenhuma aula publicada ainda. Acesse o painel do admin para cadastrar.</p>'}
  `;
}

/* ------------------------------------------------------------- página aula */
async function renderAula(id) {
  const aula = getAula(id);
  if (!aula) {
    app.innerHTML = `<div class="empty"><h1>Aula não encontrada</h1><a class="btn btn--ghost" href="#/">Voltar ao início</a></div>`;
    return;
  }
  const mod = getModulos().find((m) => m.id === aula.moduloId);
  const embed = aula.youtubeId
    ? `<iframe src="${esc(youtubeEmbed(aula.youtubeId))}" title="${esc(aula.titulo)}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`
    : '<div class="player-empty">Sem vídeo definido para esta aula.</div>';

  app.innerHTML = `
    <nav class="breadcrumb"><a href="#/">Aulas</a> <span>/</span> <span>${esc(mod ? mod.nome : 'Sem módulo')}</span></nav>
    <section class="player">
      <div class="player-frame">${embed}</div>
    </section>
    <div class="lesson">
      <header class="lesson-head">
        <h1>${esc(aula.titulo)}</h1>
        ${mod ? `<span class="chip">${esc(mod.nome)}</span>` : ''}
        <p class="lesson-desc">${esc(aula.descricao || '')}</p>
      </header>
      <div class="tabs" role="tablist">
        <button class="tab is-active" role="tab" data-tab="arquivos" aria-selected="true">Arquivos</button>
        <button class="tab" role="tab" data-tab="sobre" aria-selected="false">Sobre a aula</button>
      </div>
      <div class="tab-panel" data-panel="arquivos" role="tabpanel">
        <div class="files" id="files-list"><p class="muted">Carregando arquivos…</p></div>
        <form class="upload" id="upload-form">
          <label class="dropzone" for="file-input">
            <strong>Adicionar documento nesta aula</strong>
            <span>Arraste o arquivo aqui ou clique para selecionar (PDF, imagens, planilhas…)</span>
            <input type="file" id="file-input" multiple hidden>
          </label>
          <button class="btn btn--primary" type="submit">Enviar arquivos</button>
        </form>
      </div>
      <div class="tab-panel is-hidden" data-panel="sobre" role="tabpanel">
        <p class="lesson-desc">${esc(aula.descricao || 'Sem descrição cadastrada para esta aula.')}</p>
      </div>
    </div>
  `;

  const tabs = app.querySelectorAll('.tab');
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      tabs.forEach((t) => {
        const on = t === tab;
        t.classList.toggle('is-active', on);
        t.setAttribute('aria-selected', String(on));
      });
      app.querySelectorAll('.tab-panel').forEach((p) => {
        p.classList.toggle('is-hidden', p.dataset.panel !== tab.dataset.tab);
      });
    });
  });

  await refreshFiles(aula.id);

  const uploadForm = document.getElementById('upload-form');
  uploadForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = document.getElementById('file-input');
    if (!input.files.length) {
      toast('Selecione ao menos um arquivo.', 'warn');
      return;
    }
    uploadForm.querySelector('button').disabled = true;
    try {
      for (const file of Array.from(input.files)) {
        await saveFile(aula.id, file);
      }
      toast('Arquivo(s) enviado(s) com sucesso.');
      input.value = '';
      await refreshFiles(aula.id);
    } catch (err) {
      toast(err.message || 'Falha ao enviar o arquivo.', 'error');
    } finally {
      uploadForm.querySelector('button').disabled = false;
    }
  });
}

async function refreshFiles(aulaId) {
  const container = document.getElementById('files-list');
  if (!container) return;
  const itens = await listFiles(aulaId);
  if (!itens.length) {
    container.innerHTML = '<p class="muted">Nenhum arquivo nesta aula ainda. Use o campo acima para enviar o material de apoio.</p>';
    return;
  }
  container.innerHTML = itens
    .map(
      (f) => `
      <div class="file" data-id="${esc(f.id)}">
        <span class="file-icon" aria-hidden="true">${extIcon(f.nome)}</span>
        <div class="file-info">
          <strong>${esc(f.nome)}</strong>
          <span class="muted">${esc(formatSize(f.tamanho))} · ${esc(formatDate(f.criadoEm))}</span>
        </div>
        <div class="file-actions">
          <button class="btn btn--small" data-download="${esc(f.id)}">Baixar</button>
          ${isAdmin() ? `<button class="btn btn--small btn--danger" data-remove="${esc(f.id)}">Excluir</button>` : ''}
        </div>
      </div>`
    )
    .join('');

  container.querySelectorAll('[data-download]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const ok = await downloadFile(btn.dataset.download);
      if (!ok) toast('Arquivo não encontrado.', 'error');
    });
  });
  container.querySelectorAll('[data-remove]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await deleteFile(btn.dataset.remove);
      toast('Arquivo excluído.');
      refreshFiles(aulaId);
    });
  });
}

function extIcon(nome = '') {
  const ext = nome.split('.').pop().toLowerCase();
  if (['pdf'].includes(ext)) return 'PDF';
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext)) return 'IMG';
  if (['doc', 'docx', 'txt', 'rtf', 'odt'].includes(ext)) return 'DOC';
  if (['xls', 'xlsx', 'csv', 'ods'].includes(ext)) return 'XLS';
  if (['zip', 'rar', '7z'].includes(ext)) return 'ZIP';
  if (['fig', 'sketch', 'psd', 'ai'].includes(ext)) return ext.toUpperCase();
  return 'ARQ';
}

/* ------------------------------------------------------------------ admin */
function renderAdmin() {
  renderAdminPage(app);
}

/* ------------------------------------------------------------------ boot */
document.querySelector('[data-brand]').textContent = content.brand;
document.querySelector('[data-tagline]').textContent = content.tagline;

window.addEventListener('hashchange', navigate);
window.addEventListener('aulas:changed', () => {
  const route = parseHash();
  if (route.name !== 'admin') navigate();
});
window.addEventListener('arquivos:changed', (e) => {
  const route = parseHash();
  if (route.name === 'aula' && (!e.detail || e.detail.aulaId === route.id)) refreshFiles(route.id);
});

navigate();
