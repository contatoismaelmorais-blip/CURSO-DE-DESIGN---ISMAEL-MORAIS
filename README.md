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
npm run video:info  # metadados do vídeo de fundo (codec, resolução, duração)
```

## Estrutura

| Arquivo            | Responsabilidade |
|--------------------|------------------|
| `index.html`       | Shell da aplicação (topo, navegação, área de conteúdo, modal, toast) |
| `styles.css`       | Tema completo: fundo em vídeo, brilhos amarelo/violeta, layout responsivo |
| `app.js`           | Visão do aluno: catálogo, player, abas por aula, upload/download de arquivos |
| `motion.js`        | Fundo animado: vídeo tocado pela rolagem + parallax do vídeo de fundo |
| `admin.js`         | Painel do admin: login por PIN, CRUD de aulas e módulos, arquivos, backup |
| `store.js`         | Estado das aulas/módulos (localStorage) + extração do ID do YouTube |
| `db.js`            | Arquivos das aulas em IndexedDB (fallback: localStorage) |
| `util.js`          | Funções compartilhadas (escape de HTML, tamanho de arquivo, data, ícone) |
| `public/fundo.mp4` | Vídeo de fundo da plataforma (H.264, 1920x1080, 5,97 s) |
| `public/fundo.png` | Primeiro quadro do vídeo, usado de poster e de recuo sem vídeo |
| `tools/video-codec.mjs` | Leitor do cabeçalho do MP4 (codec, duração, resolução) |
| `tools/browser-check.mjs` | Verificação ponta a ponta no navegador (render, vídeo de fundo, upload, persistência, mobile) |

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

O fundo define a paleta da plataforma: amarelo `#ffe115` (acento), violeta `#7c3aed`
(brilho e apoio), violeta claro `#c9b8ff` e preto `#06060a` (base). As regras do
bundle `taste-skill` que proíbem gradiente, blur e cor de marca estão marcadas com
`taste-skill-ignore` no `styles.css`, com o motivo de cada caso.

## Notas técnicas

- Não há backend nesta entrega: metadados ficam em `localStorage` e os arquivos em
  `IndexedDB` (com fallback para `localStorage`). Para produção, troque as funções de
  `store.js`/`db.js` por chamadas a uma API.
- O player usa `youtube-nocookie.com`; as thumbnails vêm de `i.ytimg.com`.
- Links aceitos: `watch?v=`, `youtu.be/`, `/embed/`, `/shorts/`, `/live/`, `m.youtube.com`
  e o ID do vídeo direto.
- O fundo, o brilho violeta e os vidros escuros vêm do vídeo `fundo.mp4` e da imagem
  `FUNDO.png`; por isso as regras que proíbem gradiente e blur do bundle `taste-skill`
  estão marcadas com `taste-skill-ignore` no `styles.css`, com o motivo de cada caso.
