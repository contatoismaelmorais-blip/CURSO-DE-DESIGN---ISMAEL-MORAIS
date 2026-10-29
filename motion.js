/* motion.js — fundo animado ligado à rolagem.
 *
 * O vídeo de fundo fica tocando em loop o tempo todo: a rolagem não pausa
 * nada. Ela apenas puxa o playhead para a posição da página (quando o trecho
 * já está baixado) e desloca o fundo no parallax. Parou de rolar, o vídeo
 * continua tocando de onde parou.
 * Com prefers-reduced-motion o quadro fica fixo (a capa da imagem). */

const IDLE_MS = 260; // ms sem rolagem para o vídeo voltar a tocar sozinho
const CORRIGE = 0.25; // s: desvio do playhead que a rolagem corrige
const ZONE_FIM = 0.5; // s: trecho final do vídeo em que ele toca sozinho (sem o loop reiniciar a imagem)
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
    if (reduce.matches) return;

    const p = scrollProgress();
    const rolando = performance.now() - lastScroll < IDLE_MS;
    const altura = video.clientHeight || window.innerHeight;

    // O fundo desliza devagar junto com a rolagem.
    video.style.setProperty('--fundo-y', `${(-PARALLAX * altura * p).toFixed(1)}px`);

    // O vídeo fica tocando sempre: nem a rolagem nem o fim do trecho o param.
    if (video.paused) play();

    if (!duration || !rolando) return; // parado, o vídeo toca sozinho em loop

    // Durante a rolagem o playhead é puxado para a posição da página. A
    // correção acontece sem pausar, para a animação continuar rodando.
    const alvo = p * duration;
    // No fim do arquivo não há trecho à frente: manter o playhead colado
    // ali reiniciaria a imagem a cada volta do loop. Nessa zona o vídeo
    // simplesmente continua tocando.
    if (alvo > duration - ZONE_FIM) return;
    if (Math.abs(video.currentTime - alvo) > CORRIGE && bufferedAt(alvo)) {
      seekTo(alvo);
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
      // O atributo autoplay pode ter iniciado a reprodução antes do script:
      // o quadro volta ao primeiro e o vídeo fica parado.
      const voltarAoInicio = () => {
        video.pause();
        try {
          video.currentTime = 0;
        } catch {
          /* ignora */
        }
      };
      voltarAoInicio();
      video.addEventListener('loadedmetadata', voltarAoInicio, { once: true });
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
