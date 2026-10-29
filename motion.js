/* motion.js — fundo animado ligado à rolagem.
 *
 * O vídeo de fundo toca sozinho enquanto a página está parada. Quando o aluno
 * rola, o playhead caminha junto com a rolagem: a animação do vídeo acompanha o
 * scroll. Parou de rolar, o vídeo volta a tocar de onde parou.
 * Com prefers-reduced-motion o quadro fica fixo (a capa da imagem). */

const IDLE_MS = 260; // ms sem rolagem para o vídeo voltar a tocar sozinho
const TOLERANCE = 0.05; // s: menor deslocamento do playhead que justifica um seek
const PARALLAX = 0.03; // fração da altura que o fundo percorre ao longo da página

export function initFundoVideo() {
  const video = document.querySelector('[data-fundo-video]');
  if (!video) return null;

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  let duration = 0;
  let lastScroll = -Infinity;
  let raf = 0;

  video.muted = true; // alguns navegadores só aceitam a propriedade
  video.setAttribute('muted', '');
  video.playsInline = true;

  function readDuration() {
    duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
  }
  video.addEventListener('loadedmetadata', readDuration);
  video.addEventListener('durationchange', readDuration);
  readDuration();

  function play() {
    const p = video.play();
    if (p && typeof p.catch === 'function') p.catch(() => {});
  }

  function scrollProgress() {
    const doc = document.documentElement;
    const max = doc.scrollHeight - window.innerHeight;
    if (max <= 8) return 0; // página sem rolagem: não há o que accompanyar
    return Math.min(1, Math.max(0, window.scrollY / max));
  }

  function seekTo(t) {
    const limite = Math.max(0, duration - 0.05);
    try {
      video.currentTime = Math.min(Math.max(0, t), limite);
    } catch {
      /* some navegadores recusam seek antes do metadata */
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
    if (reduce.matches) return;

    const p = scrollProgress();
    const rolando = performance.now() - lastScroll < IDLE_MS;
    const altura = video.clientHeight || window.innerHeight;

    // O fundo desliza devagar junto com a rolagem.
    video.style.setProperty('--fundo-y', `${(-PARALLAX * altura * p).toFixed(1)}px`);

    if (!duration) {
      if (video.paused) play();
      return;
    }

    if (rolando) {
      // Durante a rolagem o quadro do vídeo é o da posição da página.
      const alvo = p * duration;
      if (Math.abs(video.currentTime - alvo) > TOLERANCE && bufferedAt(alvo)) {
        if (!video.paused) video.pause();
        seekTo(alvo);
      }
    } else if (video.paused) {
      play();
    }
  }

  window.addEventListener(
    'scroll',
    () => {
      lastScroll = performance.now();
    },
    { passive: true }
  );

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) video.pause();
    else if (!reduce.matches) play();
  });

  function applyMotionPreference() {
    if (reduce.matches) {
      video.pause();
      video.removeAttribute('autoplay');
      try {
        video.currentTime = 0;
      } catch {
        /* ignora */
      }
    } else {
      play();
    }
  }
  if (typeof reduce.addEventListener === 'function') reduce.addEventListener('change', applyMotionPreference);
  applyMotionPreference();

  raf = requestAnimationFrame(frame);

  // Devolve o controle para quem precisar (testes, outras telas).
  return {
    video,
    stop() {
      cancelAnimationFrame(raf);
    },
  };
}
