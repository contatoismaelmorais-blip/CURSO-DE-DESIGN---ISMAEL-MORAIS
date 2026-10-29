# Plataforma de aulas: Curso de Design

Plataforma web onde o aluno assiste às aulas do curso (vídeos do YouTube) e baixa os
materiais de apoio de cada aula. O admin cadastra aulas, define links, títulos e envia
arquivos por um painel próprio.

## Como rodar

```bash
npm install
npm run dev      # servidor de desenvolvimento
npm run build    # build de produção em dist/
npm test         # suíte de verificação (Node, sem navegador)
npm run browser-check  # verificação ponta a ponta no Chrome/Edge (build + navegador)
npm run lint     # lint estático de estilo (bundle taste-skill do projeto)
npm run lint:skill  # mesmo lint usando a skill instalada em .claude/skills
npm run video:info  # metadados do vídeo de fundo (codec, resolução, duração)
npm run assets:hash # sha256/tamanho do fundo (confere se o arquivo = anexo)
npm run assets:limpar # apaga as cópias temporárias do fundo
npm run impeccable:install  # instala/atualiza a skill impeccable (npx impeccable install)
npm run taste:install # instala a skill do taste-skill em .claude/skills
```

## Skills de design instaladas

| Skill | Origem | Estado |
|-------|--------|--------|
| `impeccable` | `npx --yes impeccable install` | instalada no projeto (`.claude/skills/impeccable`, v4.8.0 + engine v0.1.18) |
| `design-taste-frontend` | `taste-skill-main/skills/taste-skill` | instalada no projeto (`.claude/skills/design-taste-frontend`) |

O `taste-skill-main/install.sh` exige bash e não roda no Windows; o equivalente
cross-platform é `npm run taste:install` (`tools/install-taste.mjs`), que cria a
junction em `.claude/skills/` — use `--copy` se a junction for bloqueada.
`npm run taste:uninstall` remove.

## Estrutura

| Arquivo            | Responsabilidade |
|--------------------|------------------|
| `index.html`       | Shell da aplicação (topo, navegação, área de conteúdo, modal, toast) |
| `styles.css`       | Tema completo: fundo em vídeo, brilhos amarelo/violeta, layout responsivo |
| `app.js`           | Visão do aluno: catálogo, player, abas por aula, upload/download de arquivos |
| `motion.js`        | Fundo animado: vídeo tocado pela rolagem + parallax do vídeo de fundo |
| `admin.js`         | Painel do admin: login por PIN, CRUD de aulas e módulos, arquivos, backup, importação do canal |
| `youtube.js`      | Leitura do canal do YouTube: feed RSS (XML/JSON), descoberta do ID do canal, lista de links |
| `store.js`         | Estado das aulas/módulos (localStorage) + extração do ID do YouTube |
| `db.js`            | Arquivos das aulas em IndexedDB (fallback: localStorage) |
| `util.js`          | Funções compartilhadas (escape de HTML, tamanho de arquivo, data, ícone) |
| `public/fundo.mp4` | Vídeo de fundo da plataforma (H.264, 1920x1080, 5,97 s) |
| `public/fundo.png` | Primeiro quadro do vídeo, usado de poster e de recuo sem vídeo |
| `tools/video-codec.mjs` | Leitor do cabeçalho do MP4 (codec, duração, resolução) |
| `tools/assets-hash.mjs` | sha256/tamanho dos assets do fundo (compara com o anexo enviado) |
| `tools/install-taste.mjs` | Instalador da skill do taste-skill em `.claude/skills` (versão sem bash) |
| `tools/browser-check.mjs` | Verificação ponta a ponta no navegador (render, bento, vídeo de fundo, upload, persistência, importação, mobile) |

## Fluxo do aluno

1. `#/`: hero, estatísticas e as aulas agrupadas por módulo, com thumbnail do YouTube.
2. `#/aula/<id>`: player do YouTube, título, descrição e as abas:
   - **Arquivos**: lista dos materiais da aula com download e área de envio.
   - **Sobre a aula**: descrição completa.
3. Navegação "aula anterior / próxima" no rodapé da aula.

## Painel do admin (`#/admin`)

- Entrada por PIN (padrão `1234`, alterável em Configurações).
- Tabela de aulas com título, módulo, ID do vídeo, contagem de arquivos e status
  (publicada / rascunho), com botões para subir/descer a ordem.
- Modal de edição: título, link do YouTube (com prévia do thumbnail e ID detectado),
  descrição, módulo, ordem e visibilidade.
- Modal de arquivos por aula: upload e exclusão.
- Exportar/importar backup em JSON.
- **Importar aulas do canal do YouTube** (seção "Importar aulas do canal do YouTube"):
  - campo 1 — link do canal (`youtube.com/@canal`), link do feed RSS
    (`youtube.com/feeds/videos.xml?channel_id=UC…`), `@nome`, `/c/nome`, `/user/nome`
    ou o ID `UC…` direto;
  - campo 2 — lista de links colada (um por linha), caminho que não depende de rede;
  - prévia com thumbnail, título, data de publicação e aviso de "já cadastrada" para
    vídeos que já são aulas; os duplicados vêm desmarcados e são ignorados na criação;
  - destino: módulo escolhido (ou um módulo "Aulas importadas" novo) e status
    publicado/rascunho.

Como o YouTube não envia cabeçalhos CORS, a leitura do feed acontece no navegador
por espelhos públicos (`api.rss2json.com`, `api.allorigins.win`, `api.codetabs.com`)
com fallback para a lista de links colada. Se os espelhos estiverem fora do ar, o
admin mostra o erro e o caminho manual continua funcionando.

## Bento grid

Os cards das aulas são organizados em bento grid de 12 colunas (`styles.css` +
`bentoClasses()` em `app.js`), sem buraco na linha:

| Variante | Colunas | Quando |
|----------|---------|--------|
| `card--destaque` | 7 | primeiro card do par |
| `card--par` | 5 | segundo card do par |
| `card--terco` | 4 | trio (4+4+4) |
| `card--faixa` | 12 | módulo com uma aula só (ou resto ímpar) |

Responsivo: 6 colunas até 1079px, faixa vira uma coluna até 820px e 1 coluna até
699px.

## Fundo em vídeo

- `public/fundo.mp4` é o fundo da plataforma: toca sozinho enquanto a página está
  parada e, durante a rolagem, o playhead caminha junto com o scroll — a animação do
  vídeo acompanha a posição da página (`motion.js`).
- O quadro é reposicionado por parallax (`--fundo-y`, 3% da altura) e o vídeo fica
  um pouco ampliado (`scale(1.08)`) para não mostrar borda.
- O `fundo.png` continua como `poster` e como fundo de recuo em CSS (navegador sem
  H.264, vídeo ainda carregando ou `prefers-reduced-motion`).
- O playhead só avança para trechos já baixados; assim a rolagem não reinicia o
  download do arquivo nem zera a imagem.
- Com `prefers-reduced-motion: reduce` o fundo fica parado no primeiro quadro.

## Paleta

As três cores enviadas pelo cliente viraram tokens no `:root` do `styles.css`, com
três canais RGB para uso com alpha (`rgb(var(--brand-yellow-rgb) / .20)`):

| Token | Hex | Uso |
|-------|-----|-----|
| `--brand-cream` | `#FFFBD1` | texto, superfícies claras e bordas |
| `--brand-yellow` | `#FEFC01` | acento, ações e detalhes |
| `--brand-violet` | `#9545E7` | brilho da marca (vem do vídeo de fundo) |

Derivados: `--text`/`--muted`/`--subtle` a partir do creme, `--surface*` em violeta
escuro, `--accent` (amarelo) e `--accent-ink` (texto sobre amarelo). As regras do
bundle `taste-skill` que proíbem gradiente, blur e cor de marca estão marcadas com
`taste-skill-ignore` no `styles.css`, com o motivo de cada caso.

## Notas técnicas

- Não há backend nesta entrega: metadados ficam em `localStorage` e os arquivos em
  `IndexedDB` (com fallback para `localStorage`). Para produção, troque as funções de
  `store.js`/`db.js` por chamadas a uma API.
- O player usa `youtube-nocookie.com`; as thumbnails vêm de `i.ytimg.com`.
- Links aceitos: `watch?v=`, `youtu.be/`, `/embed/`, `/shorts/`, `/live/`, `m.youtube.com`
  e o ID do vídeo direto.
- Os arquivos do fundo são conferidos por sha256 (`npm run assets:hash`): o
  `public/fundo.mp4` e o `public/fundo.png` são byte a byte os arquivos anexados.
- O fundo, o brilho violeta e os vidros escuros vêm do vídeo `fundo.mp4` e da imagem
  `FUNDO.png`; por isso as regras que proíbem gradiente e blur do bundle `taste-skill`
  estão marcadas com `taste-skill-ignore` no `styles.css`, com o motivo de cada caso.
