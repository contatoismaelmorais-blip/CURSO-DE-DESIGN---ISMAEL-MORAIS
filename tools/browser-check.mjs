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
// A pasta public do Vite é servida na raiz do site: /fundo.mp4 e /fundo.png
// precisam responder mesmo quando o teste roda sem o build.
const PUBLIC = join(PROJECT, 'public');
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
  '.mp4': 'video/mp4',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

const server = createServer((req, res) => {
  try {
    const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let file = join(ROOT, path === '/' ? 'index.html' : path);
    if (!file.startsWith(ROOT) || !existsSync(file) || statSync(file).isDirectory()) {
      const publico = join(PUBLIC, path);
      file =
        publico.startsWith(PUBLIC) && existsSync(publico) && statSync(publico).isFile()
          ? publico
          : join(ROOT, 'index.html');
    }
    const stat = statSync(file);
    const type = MIME[extname(file).toLowerCase()] || 'application/octet-stream';
    // O player precisa de respostas parciais para conseguir avançar no vídeo.
    const range = req.headers.range;
    if (range) {
      const m = /bytes=(\d*)-(\d*)/.exec(range);
      const start = m && m[1] ? parseInt(m[1], 10) : 0;
      const end = m && m[2] ? parseInt(m[2], 10) : stat.size - 1;
      res.writeHead(206, {
        'content-type': type,
        'content-range': `bytes ${start}-${end}/${stat.size}`,
        'accept-ranges': 'bytes',
        'content-length': end - start + 1,
        'cache-control': 'no-store',
      });
      createReadStream(file, { start, end }).pipe(res);
      return;
    }
    res.writeHead(200, {
      'content-type': type,
      'accept-ranges': 'bytes',
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
      video: !!document.querySelector('[data-fundo-video]'),
      overflowX: document.documentElement.scrollWidth > window.innerWidth + 1,
    }));
    check('Home renderiza o hero', home.h1.length > 10, `h1: "${home.h1}"`);
    check('Home lista as aulas por módulo', home.cards >= 3 && home.modulos >= 2, `${home.cards} cards em ${home.modulos} módulos`);
    check('Cards mostram a thumbnail do YouTube', home.thumbs === home.cards, `${home.thumbs}/${home.cards} thumbnails`);
    check('Contagem de materiais aparece nos cards', home.metas.every((t) => t.length > 0), home.metas[0] || '');
    check('Vídeo de fundo no lugar da imagem fixa', home.video === true);
    check('Imagem antiga mantida como recuo do fundo', home.fundo === true);
    check('Sem rolagem horizontal no desktop', home.overflowX === false);
    check('Sem erros de console na home', page.consoleErrors.length === 0, page.consoleErrors[0] || '');

    // Bento grid: 12 colunas, linhas fechadas e cartões de tamanhos diferentes
    const bento = await page.eval(() =>
      [...document.querySelectorAll('.grid')].map((g) => {
        const estilo = getComputedStyle(g);
        return {
          colunas: estilo.gridTemplateColumns.split(' ').filter(Boolean).length,
          gap: parseFloat(estilo.gap) || 0,
          largura: g.getBoundingClientRect().width,
          cards: [...g.querySelectorAll('.card')].map((c) => ({
            classe: [...c.classList].find((x) => x.startsWith('card--')) || '',
            largura: c.getBoundingClientRect().width,
          })),
        };
      }),
    );
    check(
      'Bento: cada módulo usa uma grade de 12 colunas',
      bento.length > 0 && bento.every((g) => g.colunas === 12),
      bento.map((g) => `${g.cards.length} cards / ${g.colunas} colunas`).join(' · '),
    );
    check(
      'Bento: as linhas fecham sem buraco',
      bento.every((g) => {
        const soma = g.cards.reduce((t, c) => t + c.largura, 0) + Math.max(0, g.cards.length - 1) * g.gap;
        return Math.abs(soma - g.largura) < 2;
      }),
      bento.map((g) => `${g.cards.map((c) => c.classe.replace('card--', '')).join('+')}`).join(' · '),
    );
    check(
      'Bento: destaque (7) e par (5) com larguras diferentes',
      bento.some((g) => new Set(g.cards.map((c) => Math.round(c.largura))).size > 1),
      bento.map((g) => g.cards.map((c) => `${c.classe.replace('card--', '')}:${Math.round(c.largura)}px`).join('+')).join(' · '),
    );
    check(
      'Bento: módulo com uma aula vira faixa de largura total',
      bento.some(
        (g) => g.cards.length === 1 && g.cards[0].classe === 'card--faixa' && Math.abs(g.cards[0].largura - g.largura) < 2,
      ),
      bento.map((g) => g.cards[0]?.classe.replace('card--', '') || '').join(' · '),
    );
    await page.screenshot({ path: join(OUT, 'home.jpg'), quality: 80 });
    await page.close();
  });
  /* ------------------------------------------------- assets do fundo */
  await step('assets do fundo servidos', async () => {
    // Os dois arquivos precisam responder de verdade, com o tipo certo:
    // sem isso o navegador baixa o vídeo como texto e o fundo não abre.
    const mp4 = await fetch(`${base}fundo.mp4`);
    check(
      'O vídeo do fundo é servido como video/mp4',
      mp4.status === 200 && mp4.headers.get('content-type') === 'video/mp4',
      `${mp4.status} ${mp4.headers.get('content-type')}`,
    );
    check(
      'O servidor aceita pedido de trecho do vídeo (range)',
      mp4.headers.get('accept-ranges') === 'bytes',
      mp4.headers.get('accept-ranges') || 'sem accept-ranges',
    );
    const parcial = await fetch(`${base}fundo.mp4`, { headers: { Range: 'bytes=0-1023' } });
    check(
      'O navegador consegue baixar só um pedaço do vídeo',
      parcial.status === 206 && (parcial.headers.get('content-range') || '').startsWith('bytes 0-1023/'),
      `${parcial.status} ${parcial.headers.get('content-range') || ''}`,
    );
    const png = await fetch(`${base}fundo.png`);
    check(
      'A imagem de fundo é servida como image/png',
      png.status === 200 && png.headers.get('content-type') === 'image/png',
      `${png.status} ${png.headers.get('content-type')}`,
    );
  });

  /* -------------------------------------------------- fundo em vídeo */
  await step('fundo em vídeo', async () => {
    const page = await browser.newPage({ width: 1440, height: 900 });
    await page.goto(`${base}#/`, { timeoutMs: 20000, settleMs: 1500 });
    const info = await page.eval(() => {
      const v = document.querySelector('[data-fundo-video]');
      return {
        existe: !!v,
        src: v?.currentSrc || v?.querySelector('source')?.src || '',
        largura: v?.videoWidth || 0,
        altura: v?.videoHeight || 0,
        duracao: v?.duration || 0,
        pausado: v?.paused ?? true,
        tempo: v?.currentTime || 0,
        mudo: v?.muted ?? false,
        inline: v?.hasAttribute('playsinline') ?? false,
      };
    });
    check('Elemento de vídeo do fundo existe', info.existe === true, info.src.split('/').pop());
    check('Fonte do vídeo é o arquivo do projeto', info.src.includes('fundo.mp4'), info.src.split('/').pop());
    check('Vídeo mudo e em linha (autoplay permitido)', info.mudo === true && info.inline === true);

    // O arquivo é H.264: alguns builds de navegador não decodificam.
    if (info.largura > 0) {
      check('Vídeo do fundo decodificado', true, `${info.largura}x${info.altura}, ${info.duracao.toFixed(2)}s`);
    } else {
      check('Vídeo do fundo decodificado', false, 'o navegador não decodificou o H.264 (o arquivo está correto)');
    }

    // Movimento reduzido (padrão do harness): o quadro do vídeo fica fixo.
    const reduzido = await page.eval(async () => {
      const v = document.querySelector('[data-fundo-video]');
      await new Promise((r) => setTimeout(r, 700));
      return { pausado: v.paused, tempo: v.currentTime };
    });
    check(
      'Movimento reduzido: o fundo fica parado no primeiro quadro',
      reduzido.pausado === true && reduzido.tempo === 0,
      `pausado=${reduzido.pausado} t=${reduzido.tempo.toFixed(2)}s`,
    );

    // Sem a restrição de movimento: o vídeo toca e a animação segue a rolagem.
    await page.send('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }],
    });
    await page.send('Page.reload');
    await sleep(1800);

    // O fundo precisa estar de fato na tela: existir no DOM não basta.
    // O teste pega o ponto que o mouse alcançaria e pergunta quem está
    // pintado ali — se o body cobrir o vídeo, a resposta não é o vídeo.
    const pintura = await page.eval(() => {
      const v = document.querySelector('[data-fundo-video]');
      const r = v.getBoundingClientRect();
      const y = Math.round(window.innerHeight / 2);
      const ponto = document.elementFromPoint(10, y);
      return {
        visivel: !!ponto && (ponto === v || v.contains(ponto)),
        quem: ponto ? `${ponto.tagName.toLowerCase()}${ponto.className ? `.${ponto.className}` : ''}` : 'nada',
        cobreTela: r.width >= window.innerWidth - 1 && r.height >= window.innerHeight - 1,
        body: getComputedStyle(document.body).backgroundColor,
      };
    });
    check('Vídeo de fundo visível na tela (não só no DOM)', pintura.visivel, `elementFromPoint → ${pintura.quem}`);
    check('Vídeo de fundo cobre a tela inteira', pintura.cobreTela === true);
    check('O body não cobre o fundo com cor opaca', pintura.body === 'rgba(0, 0, 0, 0)', pintura.body);

    // Toca sozinho quando a página está parada
    const parado = await page.eval(async () => {
      const v = document.querySelector('[data-fundo-video]');
      const t0 = v.currentTime;
      await new Promise((r) => setTimeout(r, 900));
      return { t0, t1: v.currentTime, pausado: v.paused };
    });
    check('Vídeo toca sozinho com a página parada', parado.pausado === false && parado.t1 !== parado.t0, `t=${parado.t1.toFixed(2)}s`);

    // O quadro é desenhado de verdade (uma tela preta não contaria como fundo)
    const quadro = await page.eval(() => {
      const v = document.querySelector('[data-fundo-video]');
      const c = document.createElement('canvas');
      c.width = 32;
      c.height = 18;
      const ctx = c.getContext('2d');
      ctx.drawImage(v, 0, 0, 32, 18);
      const d = ctx.getImageData(0, 0, 32, 18).data;
      let soma = 0;
      for (let i = 0; i < d.length; i += 4) soma += (d[i] + d[i + 1] + d[i + 2]) / 3;
      return soma / (d.length / 4);
    });
    check('O vídeo desenha o quadro na tela', quadro > 3, `luminância média ${quadro.toFixed(1)}`);

    // A capa do vídeo (poster) precisa carregar de verdade: é ela que
    // aparece enquanto o arquivo não chega e o que fica no lugar se o vídeo
    // falhar.
    const capa = await page.eval(async () => {
      const v = document.querySelector('[data-fundo-video]');
      const r = await fetch(v.poster);
      const img = new Image();
      img.src = v.poster;
      const carregou = await new Promise((res) => {
        img.onload = () => res(true);
        img.onerror = () => res(false);
        setTimeout(() => res(false), 3000);
      });
      return {
        status: r.status,
        tipo: r.headers.get('content-type'),
        carregou,
        largura: img.naturalWidth,
        altura: img.naturalHeight,
        erro: v.error ? v.error.code : 0,
      };
    });
    check(
      'A capa do vídeo (poster) carrega de verdade',
      capa.status === 200 && capa.tipo === 'image/png' && capa.carregou && capa.largura > 0,
      `${capa.largura}x${capa.altura} · ${capa.tipo}`,
    );
    check('O vídeo do fundo não acusa erro de mídia', capa.erro === 0, `código ${capa.erro}`);

    // Ida e volta da preferência de movimento, sem recarregar a página: o
    // quadro precisa parar no "reduce" e a reprodução voltar no "no-preference".
    await page.send('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
    });
    await sleep(600);
    const parou = await page.eval(() => {
      const v = document.querySelector('[data-fundo-video]');
      return { pausado: v.paused, tempo: v.currentTime, estado: v.dataset.estado };
    });
    check(
      'Movimento reduzido em tempo real: o quadro para',
      parou.pausado === true,
      `pausado=${parou.pausado} t=${parou.tempo.toFixed(2)}s estado=${parou.estado}`,
    );

    await page.send('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }],
    });
    await sleep(600);
    const voltou = await page.eval(async () => {
      const v = document.querySelector('[data-fundo-video]');
      const t0 = v.currentTime;
      await new Promise((r) => setTimeout(r, 600));
      return { pausado: v.paused, t0, t1: v.currentTime, estado: v.dataset.estado };
    });
    check(
      'Movimento normal em tempo real: a reprodução volta sozinha',
      voltou.pausado === false && voltou.t1 > voltou.t0,
      `pausado=${voltou.pausado} t=${voltou.t0.toFixed(2)}s → ${voltou.t1.toFixed(2)}s`,
    );

    // O loop fecha de verdade: o playhead dá a volta no arquivo, sem travar
    // e sem pausar nenhuma vez.
    const loop = await page.eval(async () => {
      const v = document.querySelector('[data-fundo-video]');
      const eventos = { waiting: 0, stalled: 0, playing: 0, ended: 0, error: 0 };
      for (const nome of Object.keys(eventos)) {
        v.addEventListener(nome, () => {
          eventos[nome] += 1;
        });
      }
      // Deixa qualquer correção de rolagem pendente assentar antes de medir.
      window.scrollTo(0, 0);
      await new Promise((r) => setTimeout(r, 500));
      const duracao = v.duration || 0;
      const janela = duracao * 1000 + 1500; // passa da duração para pegar a volta
      const inicio = performance.now();
      let pausado = false;
      let parouPor = 0; // ms sem o playhead andar
      let ultimoTempo = v.currentTime;
      let ultimoAvanco = inicio;
      const voltas = [];
      while (performance.now() - inicio < janela) {
        await new Promise((r) => setTimeout(r, 50));
        const agora = performance.now();
        const t = v.currentTime;
        if (v.paused) pausado = true;
        if (t < ultimoTempo - 0.05) {
          voltas.push({ de: ultimoTempo, para: t, em: Math.round(agora - inicio) });
        }
        if (Math.abs(t - ultimoTempo) > 0.001) {
          parouPor = Math.max(parouPor, agora - ultimoAvanco);
          ultimoAvanco = agora;
        }
        ultimoTempo = t;
      }
      return {
        duracao,
        medido: Math.round(performance.now() - inicio),
        pausado,
        parouPor: Math.round(parouPor),
        voltas,
        eventos,
      };
    });
    const volta = loop.voltas.find((x) => x.de > loop.duracao - 0.8 && x.para < 0.8);
    check(
      'O vídeo fica tocando o tempo todo (nenhuma pausa no meio)',
      loop.pausado === false,
      `pausado=${loop.pausado}`,
    );
    check(
      'O loop fecha: o playhead dá a volta no arquivo',
      !!volta,
      volta
        ? `${volta.de.toFixed(2)}s → ${volta.para.toFixed(2)}s em ${volta.em}ms`
        : `nenhuma volta em ${loop.medido}ms`,
    );
    check(
      'O vídeo não trava durante o loop',
      loop.parouPor <= 300,
      `parado por até ${loop.parouPor}ms · waiting=${loop.eventos.waiting} stalled=${loop.eventos.stalled}`,
    );
    check(
      'O vídeo não dá erro nem encerra sozinho',
      loop.eventos.error === 0 && loop.eventos.ended === 0,
      `error=${loop.eventos.error} ended=${loop.eventos.ended} playing=${loop.eventos.playing}`,
    );

    // A animação acompanha a rolagem: o playhead caminha com a página
    const rolagem = await page.eval(async () => {
      const v = document.querySelector('[data-fundo-video]');
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const espera = (ms) => new Promise((r) => setTimeout(r, ms));
      // O CSS usa scroll-behavior suave; o teste precisa de saltos imediatos.
      document.documentElement.style.scrollBehavior = 'auto';
      let pausou = false;
      // Deixa o arquivo começar a baixar antes de medir o playhead.
      await espera(600);

      const irPara = async (y) => {
        window.scrollTo(0, y);
        for (let i = 0; i < 40; i += 1) {
          await espera(25);
          if (Math.abs(window.scrollY - y) <= 2) break;
        }
        // Refaz um movimento real de rolagem para o fundo reagir ao gesto.
        window.scrollTo(0, y + 1);
        await espera(40);
        window.scrollTo(0, y);
        await espera(160);
        if (v.paused) pausou = true;
        return v.currentTime;
      };

      const inicio = await irPara(0);
      const quarto = await irPara(Math.round(max * 0.25));
      const meio = await irPara(Math.round(max / 2));
      const tresQuartos = await irPara(Math.round(max * 0.75));
      const yFim = getComputedStyle(v).getPropertyValue('--fundo-y').trim();
      const fim = await irPara(max);
      return { max, inicio, quarto, meio, tresQuartos, fim, duracao: v.duration, yFim, pausou, pausado: v.paused };
    });

    if (rolagem.max > 100) {
      check(
        'O vídeo continua reproduzindo durante a rolagem',
        rolagem.pausou === false && rolagem.pausado === false,
        `pausado=${rolagem.pausado}`,
      );
      check(
        'Rolagem leva o playhead do vídeo junto',
        rolagem.quarto > rolagem.inicio && rolagem.meio > rolagem.quarto && rolagem.tresQuartos > rolagem.meio,
        `topo ${rolagem.inicio.toFixed(2)}s · 1/4 ${rolagem.quarto.toFixed(2)}s · meio ${rolagem.meio.toFixed(2)}s · 3/4 ${rolagem.tresQuartos.toFixed(2)}s`,
      );
      check(
        'Quadro do vídeo acompanha a posição da rolagem',
        Math.abs(rolagem.meio - rolagem.duracao / 2) < 1.2 && Math.abs(rolagem.tresQuartos - rolagem.duracao * 0.75) < 1.2,
        `meio ${rolagem.meio.toFixed(2)}s de ${rolagem.duracao.toFixed(2)}s`,
      );
      check('Fundo desliza com a rolagem (parallax)', rolagem.yFim !== '' && rolagem.yFim !== '0px', rolagem.yFim);
    } else {
      check('Página rola o suficiente para testar o fundo', false, `scroll máximo ${rolagem.max}px`);
    }

    await page.screenshot({ path: join(OUT, 'fundo-video.jpg'), quality: 80 });
    check('Sem erros de console com o vídeo', page.consoleErrors.length === 0, page.consoleErrors[0] || '');
    await page.close();
  });

  /* --------------------------------------- fundo em vídeo (celular) */
  await step('fundo em vídeo no celular', async () => {
    const page = await browser.newPage({ width: 390, height: 844, mobile: true });
    await page.send('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }],
    });
    await page.goto(`${base}#/`, { timeoutMs: 20000, settleMs: 1800 });
    const movel = await page.eval(() => {
      const v = document.querySelector('[data-fundo-video]');
      const r = v.getBoundingClientRect();
      // No celular o conteúdo ocupa a largura toda: para perguntar quem está
      // pintado no fundo, o conteúdo sai de cena por um instante.
      const conteudo = document.querySelector('main.app');
      const antes = conteudo ? conteudo.style.visibility : '';
      if (conteudo) conteudo.style.visibility = 'hidden';
      const ponto = document.elementFromPoint(10, Math.round(window.innerHeight / 2));
      if (conteudo) conteudo.style.visibility = antes;

      const c = document.createElement('canvas');
      c.width = 24;
      c.height = 40;
      const ctx = c.getContext('2d');
      ctx.drawImage(v, 0, 0, 24, 40);
      const d = ctx.getImageData(0, 0, 24, 40).data;
      let soma = 0;
      for (let i = 0; i < d.length; i += 4) soma += (d[i] + d[i + 1] + d[i + 2]) / 3;

      return {
        visivel: !!ponto && (ponto === v || v.contains(ponto)),
        quem: ponto ? `${ponto.tagName.toLowerCase()}${ponto.className ? `.${ponto.className}` : ''}` : 'nada',
        cobre: r.width >= window.innerWidth - 1 && r.height >= window.innerHeight - 1,
        body: getComputedStyle(document.body).backgroundColor,
        pausado: v.paused,
        erro: v.error ? v.error.code : 0,
        luminancia: soma / (d.length / 4),
      };
    });
    check('Fundo em vídeo visível no celular', movel.visivel === true, `elementFromPoint → ${movel.quem}`);
    check('Fundo em vídeo cobre a tela do celular', movel.cobre === true);
    check('O body não cobre o fundo no celular', movel.body === 'rgba(0, 0, 0, 0)', movel.body);
    check('O vídeo toca no celular', movel.pausado === false, `pausado=${movel.pausado}`);
    check('O quadro do vídeo é desenhado no celular', movel.luminancia > 3, `luminância média ${movel.luminancia.toFixed(1)}`);
    check('O vídeo não acusa erro no celular', movel.erro === 0, `código ${movel.erro}`);
    check('Sem erros de console no celular', page.consoleErrors.length === 0, page.consoleErrors[0] || '');
    await page.screenshot({ path: join(OUT, 'fundo-video-mobile.jpg'), quality: 80 });
    await page.close();
  });

  /* ------------------------------------------ recuo quando o vídeo falha */
  await step('recuo quando o vídeo falha', async () => {
    const page = await browser.newPage({ width: 1440, height: 900 });
    await page.send('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }],
    });
    await page.goto(`${base}#/`, { timeoutMs: 20000, settleMs: 1500 });
    const recuo = await page.eval(async () => {
      const v = document.querySelector('[data-fundo-video]');
      const fundo = document.querySelector('.fundo');
      // Reproduz o que o navegador dispara quando o arquivo não carrega.
      v.dispatchEvent(new Event('error'));
      await new Promise((r) => setTimeout(r, 300));
      const r = fundo.getBoundingClientRect();
      return {
        escondido: getComputedStyle(v).display === 'none',
        classe: v.classList.contains('fundo-video--erro'),
        estado: v.dataset.estado,
        pausado: v.paused,
        png: getComputedStyle(fundo).backgroundImage.includes('fundo.png'),
        cobre: r.width >= window.innerWidth - 1 && r.height >= window.innerHeight - 1,
      };
    });
    check('Vídeo que falha sai de cena', recuo.escondido === true && recuo.classe === true, `estado=${recuo.estado}`);
    check('Vídeo que falha para de tocar', recuo.pausado === true);
    check('O PNG do fundo continua cobrindo a tela', recuo.png === true && recuo.cobre === true);
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
      i.value = '196532';
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

    // Importação de aulas: leitura da lista de links (caminho sem rede)
    const antes = await page.eval(() => document.querySelectorAll('table tbody tr').length);
    const previa = await page.eval(async () => {
      const painel = document.querySelector('#import-form');
      const lista = document.querySelector('#imp-lista');
      if (!painel || !lista) return { erro: 'painel de importação ausente' };
      lista.value = 'https://youtu.be/dQw4w9WgXcQ\nhttps://youtu.be/aqz-KE-bpKQ';
      document.querySelector('#import-lista-form').requestSubmit();
      await new Promise((r) => setTimeout(r, 300));
      return {
        itens: document.querySelectorAll('#imp-preview .imp-item').length,
        marcados: document.querySelectorAll('#imp-preview [data-imp-check]:checked').length,
        dups: document.querySelectorAll('#imp-preview .imp-tag--dup').length,
        status: (document.querySelector('#imp-status')?.textContent || '').trim(),
      };
    });
    check(
      'Admin lê a lista de links e monta a prévia',
      previa.itens === 2 && previa.marcados === 1,
      previa.erro || `${previa.itens} itens · ${previa.marcados} marcado(s) · ${previa.status}`,
    );
    check('Vídeo já cadastrado é marcado como duplicado', previa.dups === 1, `${previa.dups} aviso(s)`);

    const importado = await page.eval(async () => {
      document.querySelector('#imp-confirmar')?.click();
      await new Promise((r) => setTimeout(r, 500));
      return {
        linhas: document.querySelectorAll('table tbody tr').length,
        tem: [...document.querySelectorAll('table tbody tr')].some((r) => r.textContent.includes('dQw4w9WgXcQ')),
        toast: (document.querySelector('#toast')?.textContent || '').trim(),
      };
    });
    check(
      'Importação cria a aula do vídeo novo e ignora o duplicado',
      importado.linhas === antes + 1 && importado.tem,
      `${antes} → ${importado.linhas} linhas · ${importado.toast}`,
    );
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
console.log(`Prints: .taste-skill/shots (home.jpg, fundo-video.jpg, fundo-video-mobile.jpg, aula.jpg, admin.jpg)`);
process.exit(falhas.length ? 1 : 0);
