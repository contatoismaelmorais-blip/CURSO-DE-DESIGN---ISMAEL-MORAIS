// youtube.js — importação de aulas a partir do canal do YouTube.
//
// Não há backend nesta entrega: o feed RSS do canal é lido direto no
// navegador. O YouTube não devolve cabeçalhos CORS no feed, então a leitura
// passa por um espelho público (api.rss2json.com / api.allorigins.win /
// api.codetabs.com). Se nenhum espelho responder, o admin ainda pode colar o
// XML do feed ou a lista de links das aulas na mão.

import { parseYouTubeId } from './store.js';

const FEED_BASE = 'https://www.youtube.com/feeds/videos.xml?channel_id=';

// Espelhos de feed: o primeiro devolve JSON (rss2json), o segundo XML puro.
const ESPELHOS_FEED = [
  (url) => `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(url)}`,
  (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  (url) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
];

// Espelhos de página: usados para descobrir o ID do canal a partir do link.
const ESPELHOS_PAGINA = [
  (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  (url) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
];

const ENTIDADES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

/** Converte entidades XML do feed em texto simples. */
export function decodificarXml(texto = '') {
  return String(texto)
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&([a-z]+);/gi, (todo, nome) => ENTIDADES[nome.toLowerCase()] ?? todo);
}

/**
 * Entende o que o admin colou: link do canal, link do feed RSS ou o ID do
 * canal. Devolve o tipo, o identificador e (quando dá) a URL do feed.
 */
export function parseChannelId(entrada = '') {
  const raw = String(entrada).trim();
  if (!raw) return { tipo: 'vazio', id: '', feedUrl: '', canalUrl: '' };

  const feed = raw.match(/feeds\/videos\.xml\?channel_id=([A-Za-z0-9_-]{20,})/);
  if (feed) return { tipo: 'id', id: feed[1], feedUrl: FEED_BASE + feed[1], canalUrl: '' };

  const doLink = raw.match(/youtube\.com\/channel\/(UC[A-Za-z0-9_-]{20,})/);
  if (doLink) return { tipo: 'id', id: doLink[1], feedUrl: FEED_BASE + doLink[1], canalUrl: raw };

  const soId = raw.match(/^(UC[A-Za-z0-9_-]{20,})$/);
  if (soId) return { tipo: 'id', id: soId[1], feedUrl: FEED_BASE + soId[1], canalUrl: '' };

  const handle = raw.match(/youtube\.com\/@([A-Za-z0-9._-]+)/);
  if (handle) return { tipo: 'handle', id: handle[1], feedUrl: '', canalUrl: raw };

  const usuario = raw.match(/youtube\.com\/(?:user|c)\/([A-Za-z0-9._-]+)/);
  if (usuario) return { tipo: 'usuario', id: usuario[1], feedUrl: '', canalUrl: raw };

  return { tipo: 'desconhecido', id: '', feedUrl: '', canalUrl: '' };
}

/** Lê o feed XML (Atom) do canal e devolve a lista de vídeos. */
export function parseFeedXml(xml = '') {
  const itens = [];
  const entradas = String(xml).match(/<entry[\s\S]*?<\/entry>/gi) || [];
  for (const entrada of entradas) {
    const youtubeId = (entrada.match(/<yt:videoId>([^<]+)<\/yt:videoId>/i) || [])[1]?.trim();
    if (!youtubeId) continue;
    const titulo = decodificarXml((entrada.match(/<title>([\s\S]*?)<\/title>/i) || [])[1] || '').trim();
    const publicado = (entrada.match(/<published>([^<]+)<\/published>/i) || [])[1]?.trim() || '';
    const canal = decodificarXml((entrada.match(/<name>([^<]*)<\/name>/i) || [])[1] || '').trim();
    itens.push({
      youtubeId,
      titulo: titulo || `Vídeo ${youtubeId}`,
      publicado,
      canal,
      thumb: `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg`,
    });
  }
  return itens;
}

/** Lê o JSON do espelho rss2json e devolve a mesma lista de vídeos. */
export function parseFeedJson(payload = {}) {
  const itens = [];
  for (const item of payload.items || []) {
    const id = parseYouTubeId(item.link || '') || parseYouTubeId(item.guid || '');
    if (!id) continue;
    itens.push({
      youtubeId: id,
      titulo: decodificarXml(item.title || '').trim() || `Vídeo ${id}`,
      publicado: item.pubDate || '',
      canal: decodificarXml(item.author || '').trim(),
      thumb: item.thumbnail || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    });
  }
  return itens;
}

/** Transforma uma lista de links colada à mão em itens de importação. */
export function parseUrlList(texto = '') {
  const itens = [];
  for (const linha of String(texto).split(/\r?\n/)) {
    const alvo = linha.trim();
    if (!alvo) continue;
    const youtubeId = parseYouTubeId(alvo);
    if (!youtubeId) continue;
    const resto = alvo.replace(/https?:\/\/\S+/gi, ' ').replace(/^\s*[-–—|]\s*/, '').trim();
    itens.push({
      youtubeId,
      titulo: resto || `Vídeo ${youtubeId}`,
      publicado: '',
      canal: '',
      thumb: `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg`,
    });
  }
  return itens;
}

/** Descobre o ID (UC…) de um canal a partir do link público do canal. */
export async function descobrirChannelId(canalUrl, { signal } = {}) {
  const erros = [];
  for (const espelho of ESPELHOS_PAGINA) {
    try {
      const res = await fetch(espelho(canalUrl), { signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const html = await res.text();
      const achado =
        html.match(/"(?:channelId|externalId)"\s*:\s*"(UC[A-Za-z0-9_-]{20,})"/) ||
        html.match(/channel\/(UC[A-Za-z0-9_-]{20,})/) ||
        html.match(/content="(UC[A-Za-z0-9_-]{20,})"/);
      if (achado) return achado[1];
      throw new Error('o ID do canal não apareceu na página');
    } catch (err) {
      erros.push(err.message);
    }
  }
  throw new Error(
    `Não foi possível descobrir o ID do canal (${erros.join(' · ')}). Use o link do feed RSS em https://www.youtube.com/feeds/videos.xml?channel_id=UC...`,
  );
}

/** Busca os vídeos do canal: descobre o ID se preciso e lê o feed. */
export async function buscarVideosDoCanal(entrada, { signal } = {}) {
  const canal = parseChannelId(entrada);
  if (canal.tipo === 'vazio') throw new Error('Cole o link do canal ou do feed RSS.');
  if (canal.tipo === 'desconhecido') {
    throw new Error('Link não reconhecido. Use o link do canal, o @nome do canal ou o link do feed RSS.');
  }
  let feedUrl = canal.feedUrl;
  if (!feedUrl) {
    const channelId = await descobrirChannelId(canal.canalUrl, { signal });
    feedUrl = FEED_BASE + channelId;
  }
  const itens = await buscarFeed(feedUrl, { signal });
  return { itens, feedUrl, canalId: canal.tipo === 'id' ? canal.id : '' };
}

/** Lê o feed RSS (XML ou JSON, conforme o espelho) e devolve os vídeos. */
export async function buscarFeed(feedUrl, { signal } = {}) {
  const erros = [];
  for (const espelho of ESPELHOS_FEED) {
    const url = espelho(feedUrl);
    try {
      const res = await fetch(url, { signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const texto = await res.text();
      if (/<entry[\s>]/i.test(texto)) {
        const itens = parseFeedXml(texto);
        if (itens.length) return { origem: url, itens };
        throw new Error('feed sem vídeos');
      }
      let json = null;
      try {
        json = JSON.parse(texto);
      } catch {
        throw new Error('resposta em formato desconhecido');
      }
      const itens = parseFeedJson(json);
      if (itens.length) return { origem: url, itens };
      throw new Error('feed sem vídeos');
    } catch (err) {
      erros.push(`${new URL(url).host}: ${err.message}`);
    }
  }
  throw new Error(
    `Não foi possível ler o feed do canal (${erros.join(' · ')}). Cole o XML do feed ou a lista de links no campo de lista.`,
  );
}
