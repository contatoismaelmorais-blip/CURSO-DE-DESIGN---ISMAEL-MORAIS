import {
  getAulas,
  getModulos,
  getAula,
  youtubeThumb,
  youtubeEmbed,
  isAdmin,
} from './store.js';
import { listFiles, saveFile, downloadFile, deleteFile } from './db.js';
import { renderAdminPage } from './admin.js';
import { esc, formatSize, formatDate, extIcon } from './util.js';
import { initFundoVideo } from './motion.js';
import content from './content.json';

const app = document.getElementById('conteudo');
const toastEl = document.getElementById('toast');

/* ---------------------------------------------------------------- helpers */
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
  // a rota muda o fundo (mais quieto no painel) e o estilo da tela
  document.body.dataset.rota = route.name;
  app.classList.toggle('is-admin', route.name === 'admin');
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
          <article class="card">
            <a class="card-thumb" href="#/aula/${esc(a.id)}" tabindex="-1" aria-hidden="true">
              ${thumb ? `<img src="${esc(thumb)}" alt="" loading="lazy">` : '<span class="card-thumb-empty"></span>'}
              <span class="card-play" aria-hidden="true">▶</span>
            </a>
            <div class="card-body">
              <h3><a href="#/aula/${esc(a.id)}">${esc(a.titulo)}</a></h3>
              <p>${esc(a.descricao || 'Sem descrição')}</p>
              <span class="card-meta" data-files-for="${esc(a.id)}"></span>
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

  // Contagem de arquivos por aula nos cards
  app.querySelectorAll('[data-files-for]').forEach(async (el) => {
    el.classList.add('is-loading');
    const n = (await listFiles(el.dataset.filesFor)).length;
    el.classList.remove('is-loading');
    el.textContent = n ? `${n} material${n > 1 ? 'is' : ''} para download` : 'Sem materiais anexados';
  });
}

/* ------------------------------------------------------------- página aula */
async function renderAula(id) {
  const aula = getAula(id);
  if (!aula) {
    app.innerHTML = `<div class="empty"><h1>Aula não encontrada</h1><a class="btn btn--ghost" href="#/">Voltar ao início</a></div>`;
    return;
  }
  const mod = getModulos().find((m) => m.id === aula.moduloId);
  const irmas = aulaOrdenadas();
  const idx = irmas.findIndex((a) => a.id === aula.id);
  const anterior = idx > 0 ? irmas[idx - 1] : null;
  const proxima = idx >= 0 && idx < irmas.length - 1 ? irmas[idx + 1] : null;
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
      <div class="tabs" role="tablist" aria-label="Conteúdo da aula">
        <button class="tab is-active" role="tab" id="tab-arquivos" aria-controls="panel-arquivos" data-tab="arquivos" aria-selected="true">Arquivos</button>
        <button class="tab" role="tab" id="tab-sobre" aria-controls="panel-sobre" data-tab="sobre" aria-selected="false" tabindex="-1">Sobre a aula</button>
      </div>
      <div class="tab-panel" id="panel-arquivos" data-panel="arquivos" role="tabpanel" aria-labelledby="tab-arquivos" tabindex="0">
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
      <div class="tab-panel is-hidden" id="panel-sobre" data-panel="sobre" role="tabpanel" aria-labelledby="tab-sobre" tabindex="0">
        <p class="lesson-desc">${esc(aula.descricao || 'Sem descrição cadastrada para esta aula.')}</p>
      </div>
    </div>
    <nav class="lesson-nav">
      ${anterior ? `<a class="btn btn--ghost" href="#/aula/${esc(anterior.id)}">← ${esc(anterior.titulo)}</a>` : '<span></span>'}
      ${proxima ? `<a class="btn btn--primary" href="#/aula/${esc(proxima.id)}">${esc(proxima.titulo)} →</a>` : ''}
    </nav>
  `;

  const tabs = [...app.querySelectorAll('.tab')];
  function selectTab(tab) {
    tabs.forEach((t) => {
      const on = t === tab;
      t.classList.toggle('is-active', on);
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
    });
    app.querySelectorAll('.tab-panel').forEach((p) => {
      p.classList.toggle('is-hidden', p.dataset.panel !== tab.dataset.tab);
    });
  }
  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => selectTab(tab));
    tab.addEventListener('keydown', (e) => {
      const teclas = { ArrowRight: 1, ArrowLeft: -1 };
      if (e.key in teclas) {
        e.preventDefault();
        const alvo = tabs[(i + teclas[e.key] + tabs.length) % tabs.length];
        selectTab(alvo);
        alvo.focus();
      } else if (e.key === 'Home') {
        e.preventDefault();
        selectTab(tabs[0]);
        tabs[0].focus();
      } else if (e.key === 'End') {
        e.preventDefault();
        selectTab(tabs[tabs.length - 1]);
        tabs[tabs.length - 1].focus();
      }
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

/* ------------------------------------------------------------------ admin */
function renderAdmin() {
  renderAdminPage(app);
}

/* ------------------------------------------------------------------ boot */
document.querySelector('[data-brand]').textContent = content.brand;
document.querySelector('[data-tagline]').textContent = content.tagline;
initFundoVideo();

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
