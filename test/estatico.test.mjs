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
const motion = await readFile(new URL('../motion.js', import.meta.url), 'utf8');
const youtube = await readFile(new URL('../youtube.js', import.meta.url), 'utf8');
const pacote = await readFile(new URL('../package.json', import.meta.url), 'utf8');
const instalador = await readFile(new URL('../tools/install-taste.mjs', import.meta.url), 'utf8');
const readme = await readFile(new URL('../README.md', import.meta.url), 'utf8');

// index.html precisa dos hooks usados pelo app
for (const hook of ['id="conteudo"', 'id="modal-root"', 'id="toast"', 'data-brand', 'data-tagline', 'data-nav="aluno"', 'data-nav="admin"', 'skip-link']) {
  assert.ok(html.includes(hook), `index.html sem o hook ${hook}`);
}

// fundo anexado presente e referenciado no CSS
const fundo = await stat(new URL('../public/fundo.png', import.meta.url));
assert.ok(fundo.size > 100000, `public/fundo.png pequeno demais (${fundo.size} bytes)`);
assert.ok(css.includes('/fundo.png'), 'styles.css não referencia /fundo.png');

// fundo em vídeo: arquivo no projeto, tag no HTML e animação ligada à rolagem
const video = await stat(new URL('../public/fundo.mp4', import.meta.url));
assert.ok(video.size > 500000, `public/fundo.mp4 pequeno demais (${video.size} bytes)`);
assert.ok(html.includes('data-fundo-video'), 'index.html sem o elemento de vídeo do fundo');
assert.ok(html.includes('/fundo.mp4'), 'index.html não aponta para /fundo.mp4');
assert.ok(html.includes('playsinline') && html.includes('muted'), 'o vídeo do fundo precisa de muted e playsinline');
assert.ok(motion.includes('scroll') && motion.includes('currentTime'), 'motion.js não liga a animação do vídeo à rolagem');
assert.ok(motion.includes('prefers-reduced-motion'), 'motion.js sem fallback para movimento reduzido');
assert.ok(motion.includes('buffered'), 'motion.js deve limitar o playhead ao que já está em buffer');

// funcionalidades pedidas
assert.ok(js.includes('data-tab="arquivos"'), 'app.js sem a aba de arquivos');
assert.ok(js.includes('youtubeEmbed'), 'app.js sem player do YouTube');
assert.ok(js.includes('upload-form'), 'app.js sem formulário de upload na aula');
assert.ok(admin.includes('openAulaModal'), 'admin.js sem editor de aula');
assert.ok(admin.includes('youtubeEmbed') === false, 'admin.js não deve duplicar o player');
assert.ok(admin.includes('openArquivosModal'), 'admin.js sem gestão de arquivos por aula');
assert.ok(db.includes('indexedDB'), 'db.js sem IndexedDB');
assert.ok(store.includes('parseYouTubeId'), 'store.js sem parser de links');

// paleta enviada pelo cliente, aplicada como tokens (sem rgba duplicado)
for (const cor of ['#FFFBD1', '#FEFC01', '#9545E7']) {
  assert.ok(css.includes(cor), `styles.css sem a cor ${cor}`);
}
assert.ok(!css.includes('rgba(255,225,21'), 'styles.css ainda tem o amarelo antigo duplicado em rgba');
assert.ok(!css.includes('rgba(124,58,237'), 'styles.css ainda tem o violeta antigo duplicado em rgba');
assert.ok(css.includes('var(--brand-yellow-rgb)') && css.includes('var(--brand-violet-rgb)'), 'styles.css sem tokens de cor da marca');

// bento grid: linhas de 12 colunas fechadas pelos cartões
assert.ok(css.includes('repeat(12,minmax(0,1fr))'), 'styles.css sem a grade de 12 colunas do bento');
for (const classe of ['card--destaque', 'card--par', 'card--terco', 'card--faixa']) {
  assert.ok(css.includes(classe), `styles.css sem a classe ${classe}`);
}
assert.ok(js.includes('bentoClasses'), 'app.js sem a distribuição bento dos cartões');
assert.ok(js.includes('card ${bento[i]}'), 'app.js sem a classe bento no cartão');

// importação do canal do YouTube
assert.ok(youtube.includes('parseChannelId') && youtube.includes('parseFeedXml'), 'youtube.js sem a leitura do canal');
assert.ok(admin.includes('import-form') && admin.includes('buscarVideosDoCanal'), 'admin.js sem o painel de importação');
assert.ok(admin.includes('imp-preview'), 'admin.js sem a prévia dos vídeos importados');

// instalação das skills de design e scripts de manutenção
for (const script of ['taste:install', 'impeccable:install', 'assets:hash', 'lint:skill']) {
  assert.ok(pacote.includes(`"${script}"`), `package.json sem o script ${script}`);
}
assert.ok(instalador.includes('.claude') && instalador.includes('skills'), 'instalador do taste-skill não aponta para .claude/skills');
assert.ok(readme.includes('#FFFBD1') && readme.includes('#9545E7') && readme.includes('#FEFC01'), 'README sem a paleta da marca');
assert.ok(readme.includes('Bento grid'), 'README sem a seção do bento grid');

console.log(`OK — estrutura validada (fundo.png ${(fundo.size / 1024 / 1024).toFixed(2)} MB, fundo.mp4 ${(video.size / 1024 / 1024).toFixed(2)} MB).`);
