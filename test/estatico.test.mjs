// Verificação estática dos arquivos do projeto (não precisa de navegador).
// Roda em Node: node test/estatico.test.mjs
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const css = await readFile(new URL('../styles.css', import.meta.url), 'utf8');
const js = await readFile(new URL('../app.js', import.meta.url), 'utf8');
const admin = await readFile(new URL('../admin.js', import.meta.url), 'utf8');
const db = await readFile(new URL('../db.js', import.meta.url), 'utf8');
const store = await readFile(new URL('../store.js', import.meta.url), 'utf8');

// index.html precisa dos hooks usados pelo app
for (const hook of ['id="conteudo"', 'id="modal-root"', 'id="toast"', 'data-brand', 'data-tagline', 'data-nav="aluno"', 'data-nav="admin"', 'skip-link']) {
  assert.ok(html.includes(hook), `index.html sem o hook ${hook}`);
}

// fundo anexado presente e referenciado no CSS
const fundo = await stat(new URL('../public/fundo.png', import.meta.url));
assert.ok(fundo.size > 100000, `public/fundo.png pequeno demais (${fundo.size} bytes)`);
assert.ok(css.includes('/fundo.png'), 'styles.css não referencia /fundo.png');

// funcionalidades pedidas
assert.ok(js.includes('data-tab="arquivos"'), 'app.js sem a aba de arquivos');
assert.ok(js.includes('youtubeEmbed'), 'app.js sem player do YouTube');
assert.ok(js.includes('upload-form'), 'app.js sem formulário de upload na aula');
assert.ok(admin.includes('openAulaModal'), 'admin.js sem editor de aula');
assert.ok(admin.includes('youtubeEmbed') === false, 'admin.js não deve duplicar o player');
assert.ok(admin.includes('openArquivosModal'), 'admin.js sem gestão de arquivos por aula');
assert.ok(db.includes('indexedDB'), 'db.js sem IndexedDB');
assert.ok(store.includes('parseYouTubeId'), 'store.js sem parser de links');

console.log(`OK — estrutura validada (fundo.png ${(fundo.size / 1024 / 1024).toFixed(2)} MB).`);
