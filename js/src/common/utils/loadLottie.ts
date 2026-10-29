import type { LottiePlayer } from 'lottie-web';

// Build "light": sem o motor de expressões do lottie-web, que executa o JS
// embutido no arquivo da animação (eval). Telegram proíbe expressões em TGS.
// Vai num chunk separado: só baixa quando a página tem um sticker animado.
let pending: Promise<LottiePlayer> | null = null;

export default function loadLottie(): Promise<LottiePlayer> {
  if (!pending) {
    pending = import('lottie-web/build/player/lottie_light_canvas')
      .then((mod) => (mod.default || mod) as LottiePlayer)
      .catch((err) => {
        pending = null;
        throw err;
      });
  }

  return pending;
}
