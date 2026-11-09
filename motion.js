/* motion.js — fundo animado ligado à rolagem.
 *
 * O vídeo de fundo fica tocando em loop o tempo todo: nem a rolagem nem a
 * preferência de movimento reduzido param a reprodução. A rolagem apenas
 * desloca o fundo no parallax. Parou de rolar, o vídeo continua tocando de
 * onde parou e reinicia sozinho no fim do arquivo.
 * Se o arquivo do vídeo não carregar (404, codec sem suporte), o elemento
 * sai de cena e o PNG do fundo — que o CSS já coloca em .fundo — continua
 * cobrindo a tela. */

const IDLE_MS = 260; // ms sem rolagem para o vídeo voltar a tocar sozinho
const PARALLAX = 0.03; // fração da altura que o fundo percorre ao longo da página
const CLASSE_ERRO = 'fundo-video--erro'; // marca o vídeo que não pôde ser carregado

export function initFundoVideo() {
  const video = document.querySelector('[data-fundo-video]');
  if (!video) return null;

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  let duration = 0;
  let lastScroll = -Infinity;
  let raf = 0;
  let falhou = false;
  let reduceAntes = reduce.matches;
  let aoCarregar = null;
  const limpezas = [];

  // Todo listener registrado aqui é desfeito no stop(): nenhuma tela
  // desmontada fica chamando o vídeo.
  const on = (alvo, tipo, fn, opcoes) => {
    alvo.addEventListener(tipo, fn, opcoes);
    limpezas.push(() => alvo.removeEventListener(tipo, fn, opcoes));
  };

  video.muted = true; // alguns navegadores só aceitam a propriedade
  video.setAttribute('muted', '');
  video.playsInline = true;
  video.dataset.estado = 'parado';

  function readDuration() {
    duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
  }
  on(video, 'loadedmetadata', readDuration);
  on(video, 'durationchange', readDuration);
  readDuration();

  function play() {
    if (falhou) return;
    // O atributo `loop` garante o reinício; alguns navegadores recusam iniciar
    // antes do metadata, por isso a tentativa é repetida no canplay.
    if (!video.hasAttribute('loop')) video.setAttribute('loop', '');
    const p = video.play();
    if (p && typeof p.catch === 'function') p.catch(() => {});
  }

  on(video, 'canplay', play);
  on(video, 'loadeddata', play);
  on(video, 'ended', play);

  on(video, 'play', () => {
    video.dataset.estado = 'tocando';
  });
  on(video, 'pause', () => {
    if (!falhou) video.dataset.estado = 'parado';
  });

  // O arquivo não carregou ou não decodificou: o vídeo sai de cena e o PNG
  // de fundo (definido no CSS de .fundo) fica no lugar dele.
  function semVideo() {
    if (falhou) return;
    falhou = true;
    video.dataset.estado = 'erro';
    video.classList.add(CLASSE_ERRO);
    video.removeAttribute('autoplay');
    try {
      video.pause();
    } catch {
      /* ignora */
    }
  }
  on(video, 'error', semVideo);
  const fonte = video.querySelector('source');
  if (fonte) on(fonte, 'error', semVideo);

  // O navegador interrompeu a reprodução esperando bytes: o playhead volta a
  // andar assim que o trecho chega.
  const retomar = () => {
    if (!falhou && video.paused) play();
  };
  on(video, 'waiting', retomar);
  on(video, 'stalled', retomar);

  function scrollProgress() {
    const doc = document.documentElement;
    const max = doc.scrollHeight - window.innerHeight;
    if (max <= 8) return 0; // página sem rolagem: não há o que acompanhar
    return Math.min(1, Math.max(0, window.scrollY / max));
  }

  function seekTo(t) {
    const limite = Math.max(0, duration - 0.05);
    try {
      video.currentTime = Math.min(Math.max(0, t), limite);
      return true;
    } catch {
      /* some navegadores recusam seek antes do metadata */
      return false;
    }
  }

  // O playhead só anda para dentro de um trecho já baixado. Pedir bytes fora
  // do buffer reinicia o download no Chrome e a imagem volta para o começo.
  function bufferedAt(t) {
    const ranges = video.buffered;
    if (!ranges || ranges.length === 0) return false;
    for (let i = 0; i < ranges.length; i += 1) {
      if (t >= ranges.start(i) - 0.2 && t <= ranges.end(i) + 0.2) return true;
    }
    return false;
  }

  function frame() {
    raf = requestAnimationFrame(frame);

    // A preferência de movimento pode mudar sem evento (alguns navegadores
    // headless): conferindo a cada quadro, o parallax liga ou desliga.
    if (reduce.matches !== reduceAntes) {
      reduceAntes = reduce.matches;
      applyMotionPreference();
    }
    if (falhou) return;

    const p = scrollProgress();
    const rolando = performance.now() - lastScroll < IDLE_MS;
    const altura = video.clientHeight || window.innerHeight;

    // O fundo desliza devagar junto da rolagem.
    if (!reduce.matches) {
      video.style.setProperty('--fundo-y', `${(-PARALLAX * altura * p).toFixed(1)}px`);
    } else {
      video.style.setProperty('--fundo-y', '0px');
    }

    // O vídeo fica tocando sempre: nem a rolagem nem o fim do trecho o param.
    // O atributo `loop` do <video> reinicia a reprodução sozinho.
    if (video.paused) play();
  }

  function marcarScroll() {
    lastScroll = performance.now();
  }
  on(window, 'scroll', marcarScroll, { passive: true });

  function aoMudarAba() {
    if (document.hidden) {
      video.pause();
    } else if (!reduce.matches) {
      play();
    }
  }
  on(document, 'visibilitychange', aoMudarAba);

  function applyMotionPreference() {
    // O vídeo de fundo é decorativo e sempre toca em loop; a preferência de
    // movimento reduzido só desliga o parallax (e o tremor da rolagem).
    play();
  }
  if (typeof reduce.addEventListener === 'function') {
    reduce.addEventListener('change', applyMotionPreference);
    limpezas.push(() => reduce.removeEventListener('change', applyMotionPreference));
  }
  applyMotionPreference();

  raf = requestAnimationFrame(frame);

  // Devolve o controle para quem precisar (testes, outras telas).
  return {
    video,
    stop() {
      cancelAnimationFrame(raf);
      raf = 0;
      while (limpezas.length) limpezas.pop()();
    },
  };
}
