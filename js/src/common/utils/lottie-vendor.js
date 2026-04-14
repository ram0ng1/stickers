// Arquivo wrapper para lottie-web dentro de src/.
// O autoChunkNameLoader do flarum-webpack-config consegue registrar este chunk corretamente
// quando importado dinamicamente via import('./lottie-vendor') em renderLottie.js.
import lottie from 'lottie-web/build/player/lottie_canvas';
export default lottie;
