#!/usr/bin/env node
// Verificação de ponta a ponta no navegador.
// Sobe um servidor estático local (mesma raiz do projeto), abre o Chrome/Edge
// via CDP e confere o que o aluno e o admin realmente veem: catálogo, player do
// YouTube, aba de arquivos, navegação entre abas e login do painel.
// Uso: npm run browser-check
import { createServer } from 'node:http';
import { createReadStream, existsSync, mkdirSync, statSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { Browser, sleep } from '../taste-skill-main/skills/taste-skill/scripts/lib/cdp.mjs';

const PROJECT = resolve('.');
// O build do Vite é o que o navegador recebe de verdade: importa o JSON do
// projeto como módulo e resolve os assets com hash.
const ROOT = existsSync(join(PROJECT, 'dist', 'index.html')) ? join(PROJECT, 'dist') : PROJECT;
const OUT = join(PROJECT, '.taste-skill', 'shots');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

const server = createServer((req, res) => {
  try {
    const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let file = join(ROOT, path === '/' ? 'index.html' : path);
    if (!file.startsWith(ROOT) || !existsSync(file) || statSync(file).isDirectory()) file = join(ROOT, 'index.html');
    res.writeHead(200, {
      'content-type': MIME[extname(file).toLowerCase()] || 'application/octet-stream',
      'cache-control': 'no-store',
    });
    createReadStream(file).pipe(res);
  } catch {
    res.writeHead(404);
    res.end('not found');
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/`;
mkdirSync(OUT, { recursive: true });

const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'OK   ' : 'FALHA'} ${name}${detail ? ` — ${detail}` : ''}`);
};
// Um passo que quebra não derruba a verificação inteira: vira FALHA e segue.
const step = async (name, fn) => {
  try {
    await fn();
  } catch (e) {
    check(name, false, `erro: ${e.message.split('\n')[0]}`);
  }
};

let browser;
try {
  browser = await Browser.launch();
} catch (e) {
  console.log(`SKIP — nenhum Chrome/Edge/Chromium disponível (${e.message}).`);
  server.close();
  process.exit(0);
}

try {
  /* ------------------------------------------------------------- home */
  await step('página inicial', async () => {
    const page = await browser.newPage({ width: 1440, height: 900 });
    await page.goto(`${base}#/`, { timeoutMs: 20000, settleMs: 900 });
    const home = await page.eval(() => ({
      h1: document.querySelector('h1')?.textContent.trim() || '',
      cards: document.querySelectorAll('.card').length,
      modulos: document.querySelectorAll('.module').length,
      thumbs: document.querySelectorAll('.card-thumb img').length,
      metas: [...document.querySelectorAll('[data-files-for]')].map((e) => e.textContent.trim()),
      fundo: getComputedStyle(document.querySelector('.fundo')).backgroundImage.includes('fundo.png'),
      overflowX: document.documentElement.scrollWidth > window.innerWidth + 1,
    }));
    check('Home renderiza o hero', home.h1.length > 10, `h1: "${home.h1}"`);
    check('Home lista as aulas por módulo', home.cards >= 3 && home.modulos >= 2, `${home.cards} cards em ${home.modulos} módulos`);
    check('Cards mostram a thumbnail do YouTube', home.thumbs === home.cards, `${home.thumbs}/${home.cards} thumbnails`);
    check('Contagem de materiais aparece nos cards', home.metas.every((t) => t.length > 0), home.metas[0] || '');
    check('FUNDO.png aplicado como fundo da plataforma', home.fundo === true);
    check('Sem rolagem horizontal no desktop', home.overflowX === false);
    check('Sem erros de console na home', page.consoleErrors.length === 0, page.consoleErrors[0] || '');
    await page.screenshot({ path: join(OUT, 'home.jpg'), quality: 80 });
    await page.close();
  });
  /* --------------------------------------------------------- página da aula */
  await step('página da aula', async () => {
    const page = await browser.newPage({ width: 1440, height: 900 });
    await page.goto(`${base}#/aula/aula_1`, { timeoutMs: 20000, settleMs: 1200 });
    const aula = await page.eval(() => ({
      iframe: document.querySelector('.player iframe')?.getAttribute('src') || '',
      titulo: document.querySelector('h1')?.textContent.trim() || '',
      tabs: [...document.querySelectorAll('[role="tab"]')].map((t) => t.textContent.trim()),
      painel: document.querySelector('[role="tabpanel"]')?.id || '',
      upload: !!document.querySelector('#upload-form'),
      zona: !!document.querySelector('.dropzone, #upload-form'),
      nav: document.querySelectorAll('.lesson-nav a').length,
    }));
    check('Player do YouTube embutido na aula', aula.iframe.includes('youtube-nocookie.com/embed/'), aula.iframe.slice(0, 70));
    check('Aula mostra o título', aula.titulo.length > 5, `"${aula.titulo}"`);
    check('Aba de arquivos presente', aula.tabs.some((t) => /arquivo/i.test(t)), aula.tabs.join(' | '));
    check('Área de upload de documentos presente', aula.upload && aula.zona);
    check('Navegação entre aulas', aula.nav >= 1, `${aula.nav} links`);

    const troca = await page.eval(() => {
      const b = document.querySelector('[data-tab="sobre"]');
      if (!b) return { ok: false };
      b.click();
      const sel = document.querySelector('[data-tab="sobre"]').getAttribute('aria-selected');
      const visivel = document.querySelector('#panel-sobre');
      const oculto = document.querySelector('#panel-arquivos');
      return {
        ok: sel === 'true',
        visivel: !!visivel && getComputedStyle(visivel).display !== 'none',
        oculto: !oculto || getComputedStyle(oculto).display === 'none',
      };
    });
    check('Aba "Sobre a aula" alterna o painel', troca.ok && troca.visivel && troca.oculto);

    // Envio real de um documento pela aba de arquivos
    const upload = await page.eval(async () => {
      const input = document.querySelector('#file-input');
      const dt = new DataTransfer();
      dt.items.add(new File(['material de apoio da aula'], 'material-aula.txt', { type: 'text/plain' }));
      input.files = dt.files;
      document.querySelector('#upload-form').requestSubmit();
      await new Promise((r) => setTimeout(r, 1500));
      return {
        linhas: [...document.querySelectorAll('#files-list .file')].map((e) => e.textContent.replace(/\s+/g, ' ').trim()),
        toast: (document.querySelector('#toast')?.textContent || '').trim(),
      };
    });
    check('Upload de documento pela aba de arquivos', upload.linhas.some((t) => t.includes('material-aula.txt')), upload.linhas[0] || upload.toast);

    // O arquivo precisa sobreviver a um recarregamento (persistência real)
    await page.send('Page.reload');
    await sleep(1600);
    const depois = await page.eval(() =>
      [...document.querySelectorAll('#files-list .file')].map((e) => e.textContent.replace(/\s+/g, ' ').trim()),
    );
    check('Arquivo persistido após recarregar a página', depois.some((t) => t.includes('material-aula.txt')), depois[0] || 'lista vazia');

    check('Sem erros de console na aula', page.consoleErrors.length === 0, page.consoleErrors[0] || '');
    await page.screenshot({ path: join(OUT, 'aula.jpg'), quality: 80 });
    await page.close();
  });

  /* -------------------------------------------------------------- admin */
  await step('painel do admin', async () => {
    const page = await browser.newPage({ width: 1440, height: 900 });
    await page.goto(`${base}#/admin`, { timeoutMs: 20000, settleMs: 900 });
    const login = await page.eval(() => ({
      form: !!document.querySelector('#login-form'),
      h1: document.querySelector('h1')?.textContent.trim() || '',
    }));
    check('Admin exige PIN', login.form === true, login.h1);

    const Wrong = await page.eval(() => {
      const i = document.querySelector('#pin');
      i.value = '0000';
      document.querySelector('#login-form').requestSubmit();
      return !!document.querySelector('#login-form');
    });
    check('PIN errado não entra no painel', Wrong === true);

    await page.eval(() => {
      const i = document.querySelector('#pin');
      i.value = '1234';
      document.querySelector('#login-form').requestSubmit();
    });
    await sleep(700);
    const painel = await page.eval(() => ({
      tabela: document.querySelectorAll('table tbody tr').length,
      modulos: document.querySelectorAll('.module-list li').length,
      botoes: ['nova-aula', 'novo-modulo', 'exportar', 'importar', 'sair'].filter((id) => !!document.getElementById(id)),
      linha: document.querySelector('table tbody tr')?.textContent.replace(/\s+/g, ' ').trim().slice(0, 90) || '',
    }));
    check('Painel lista as aulas cadastradas', painel.tabela >= 3, `${painel.tabela} linhas`);
    check('Painel lista os módulos', painel.modulos >= 2, `${painel.modulos} módulos`);
    check('Ações do painel presentes', painel.botoes.length === 5, painel.botoes.join(', '));

    // Criar uma aula pelo painel: título + link do YouTube
    await page.eval(() => document.getElementById('nova-aula').click());
    await sleep(400);
    const modal = await page.eval(() => ({
      aberto: !!document.querySelector('#aula-form'),
      campos: ['f-titulo', 'f-url', 'f-desc', 'f-modulo', 'f-ordem'].filter((id) => !!document.getElementById(id)).length,
    }));
    check('Modal de nova aula abre com os campos', modal.aberto && modal.campos === 5, `${modal.campos}/5 campos`);

    const preview = await page.eval(() => {
      const u = document.querySelector('#f-url');
      u.value = 'https://youtu.be/aqz-KE-bpKQ';
      u.dispatchEvent(new Event('input', { bubbles: true }));
      return (document.querySelector('#f-preview')?.textContent || '').trim();
    });
    check('Admin detecta o ID do vídeo no link colado', preview.includes('aqz-KE-bpKQ'), preview);

    await page.eval(() => {
      document.querySelector('#f-titulo').value = 'Aula de teste automático';
      document.querySelector('#aula-form').requestSubmit();
    });
    await sleep(700);
    const criada = await page.eval(() =>
      [...document.querySelectorAll('table tbody tr')].map((r) => r.textContent.replace(/\s+/g, ' ').trim()),
    );
    check('Aula criada pelo admin aparece na tabela', criada.some((r) => r.includes('Aula de teste automático')), criada.find((r) => r.includes('teste')) || criada[0] || '');
    check('Aula criada guarda o ID do YouTube', criada.some((r) => r.includes('aqz-KE-bpKQ')));
    check('Linha da aula mostra título e ações', painel.linha.length > 20, painel.linha);

    // A contagem de arquivos enviada pelo aluno aparece no painel do admin
    const contagem = painel.linha.includes('1 arquivo') || painel.linha.includes('1 arquivos');
    check('Admin mostra o arquivo enviado na aula', contagem, painel.linha);

    // E o card do aluno anuncia o material disponível
    await page.eval(() => {
      location.hash = '#/';
    });
    await sleep(1200);
    const badge = await page.eval(() => {
      const el = document.querySelector('[data-files-for="aula_1"]');
      return el ? el.textContent.trim() : '';
    });
    check('Card da aula anuncia o material anexado', /1 material/.test(badge), badge);

    check('Sem erros de console no admin', page.consoleErrors.length === 0, page.consoleErrors[0] || '');
    await page.screenshot({ path: join(OUT, 'admin.jpg'), quality: 80 });
    await page.close();
  });
  /* ------------------------------------------------------------- mobile */
  await step('versão mobile (390px)', async () => {
    const page = await browser.newPage({ width: 390, height: 844, mobile: true });
    await page.goto(`${base}#/aula/aula_1`, { timeoutMs: 20000, settleMs: 1200 });
    const m = await page.eval(() => {
      const iframe = document.querySelector('.player iframe');
      const botao = document.querySelector('#upload-form button');
      const r = iframe ? iframe.getBoundingClientRect() : null;
      return {
        overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
        larguraPagina: document.documentElement.scrollWidth,
        iframeDentro: r ? r.width <= window.innerWidth + 1 : false,
        botao: botao ? Math.round(botao.getBoundingClientRect().height) : 0,
        botaoVisivel: botao ? botao.getBoundingClientRect().top < window.innerHeight : false,
        fonteCorpo: parseFloat(getComputedStyle(document.body).fontSize),
        tabs: document.querySelectorAll('[role="tab"]').length,
      };
    });
    check('Sem rolagem horizontal no mobile', m.overflow === false, `${m.larguraPagina}px de largura`);
    check('Player cabe na tela do celular', m.iframeDentro === true);
    check('Botão de enviar tem área de toque adequate', m.botao >= 44, `${m.botao}px de altura`);
    check('Abas acessíveis no celular', m.tabs === 2, `${m.tabs} abas`);
    await page.screenshot({ path: join(OUT, 'mobile-aula.jpg'), quality: 80 });
    await page.close();
  });
} finally {
  await browser.close();
  server.close();
}

const falhas = results.filter((r) => !r.ok);
console.log('');
console.log(`RESULTADO: ${results.length - falhas.length}/${results.length} verificações passaram.`);
console.log(`Prints: .taste-skill/shots (home.jpg, aula.jpg, admin.jpg)`);
process.exit(falhas.length ? 1 : 0);
