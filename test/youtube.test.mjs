// Teste da importação de aulas a partir do canal do YouTube.
// Roda em Node: node test/youtube.test.mjs
import assert from 'node:assert/strict';

const { parseChannelId, parseFeedXml, parseFeedJson, parseUrlList, decodificarXml } = await import(
  '../youtube.js'
);

/* ------------------------------------------------------- link do canal */
const canais = [
  ['https://www.youtube.com/feeds/videos.xml?channel_id=UC_x5XG1OV2P6uZZ5FSM9Ttw', 'id'],
  ['https://www.youtube.com/channel/UC_x5XG1OV2P6uZZ5FSM9Ttw', 'id'],
  ['UC_x5XG1OV2P6uZZ5FSM9Ttw', 'id'],
  ['https://www.youtube.com/@canaldesign', 'handle'],
  ['https://www.youtube.com/c/CursoDeDesign', 'usuario'],
  ['https://www.youtube.com/user/canalantigo', 'usuario'],
  ['https://exemploqualquer.com/canal', 'desconhecido'],
  ['', 'vazio'],
];

for (const [entrada, esperado] of canais) {
  const obtido = parseChannelId(entrada);
  assert.equal(obtido.tipo, esperado, `parseChannelId(${JSON.stringify(entrada)}) => ${obtido.tipo}`);
}

const comFeed = parseChannelId('https://www.youtube.com/feeds/videos.xml?channel_id=UC_x5XG1OV2P6uZZ5FSM9Ttw');
assert.equal(comFeed.feedUrl, 'https://www.youtube.com/feeds/videos.xml?channel_id=UC_x5XG1OV2P6uZZ5FSM9Ttw');
assert.equal(parseChannelId('https://www.youtube.com/@canaldesign').feedUrl, '', 'handle não tem feed pronto');

/* ------------------------------------------------------------ feed XML */
const feed = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns:media="http://search.yahoo.com/mrss/">
  <title>Canal do Curso</title>
  <entry>
    <id>yt:video:dQw4w9WgXcQ</id>
    <yt:videoId>dQw4w9WgXcQ</yt:videoId>
    <yt:channelId>UC_x5XG1OV2P6uZZ5FSM9Ttw</yt:channelId>
    <title>Aula 1 &amp; introdu&#xE7;&#227;o</title>
    <link rel="alternate" href="https://www.youtube.com/watch?v=dQw4w9WgXcQ"/>
    <author><name>Canal do Curso</name></author>
    <published>2024-05-12T18:00:00+00:00</published>
  </entry>
  <entry>
    <yt:videoId>aqz-KE-bpKQ</yt:videoId>
    <title>Aula 2: cores &amp; tipografia</title>
    <author><name>Canal do Curso</name></author>
    <published>2024-06-01T12:30:00+00:00</published>
  </entry>
</feed>`;

const itens = parseFeedXml(feed);
assert.equal(itens.length, 2, `esperava 2 vídeos do feed, veio ${itens.length}`);
assert.equal(itens[0].youtubeId, 'dQw4w9WgXcQ');
assert.equal(itens[0].titulo, 'Aula 1 & introdução', `título decodificado: ${itens[0].titulo}`);
assert.equal(itens[0].publicado, '2024-05-12T18:00:00+00:00');
assert.equal(itens[0].canal, 'Canal do Curso');
assert.equal(itens[1].youtubeId, 'aqz-KE-bpKQ');
assert.equal(itens[1].titulo, 'Aula 2: cores & tipografia');
assert.ok(itens[0].thumb.includes('dQw4w9WgXcQ'), 'thumbnail do feed');
assert.equal(parseFeedXml('<feed></feed>').length, 0, 'feed sem entradas');

/* ------------------------------------------------------- feed em JSON */
const json = {
  status: 'ok',
  items: [
    {
      title: 'Aula 3',
      link: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      guid: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      pubDate: '2024-07-02T09:00:00Z',
      thumbnail: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
    },
    { title: 'Vídeo sem link', link: '' },
  ],
};
const doJson = parseFeedJson(json);
assert.equal(doJson.length, 1, `esperava 1 item do JSON, veio ${doJson.length}`);
assert.equal(doJson[0].youtubeId, 'dQw4w9WgXcQ');
assert.equal(doJson[0].titulo, 'Aula 3');

/* --------------------------------------------------------- lista manual */
const lista = parseUrlList(
  [
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    'Aula extra https://youtu.be/aqz-KE-bpKQ',
    'https://www.youtube.com/shorts/abcdefghijk',
    'linha sem link',
  ].join('\n'),
);
assert.equal(lista.length, 3, `esperava 3 itens da lista, veio ${lista.length}`);
assert.equal(lista[0].youtubeId, 'dQw4w9WgXcQ');
assert.equal(lista[0].titulo, 'Vídeo dQw4w9WgXcQ', `título padrão: ${lista[0].titulo}`);
assert.equal(lista[1].titulo, 'Aula extra', `título da lista: ${lista[1].titulo}`);
assert.equal(lista[2].youtubeId, 'abcdefghijk');

/* -------------------------------------------------------------- XML */
assert.equal(decodificarXml('a &amp; b &lt;c&gt;'), 'a & b <c>');
assert.equal(decodificarXml('&#65;'), 'A');

console.log('OK — leitura do canal do YouTube (link, feed XML, feed JSON e lista de links) validada.');
