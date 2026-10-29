import app from 'flarum/forum/app';
import initPostStickers from './initPostStickers';
import addStickerButton from './addStickerButton';

export { default as extend } from './extend';

app.initializers.add('ramon-stickers', () => {
  initPostStickers();
  addStickerButton();
});
