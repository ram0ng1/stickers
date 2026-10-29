import app from 'flarum/admin/app';
import { extend } from 'flarum/common/extend';
import ExtensionPage from 'flarum/admin/components/ExtensionPage';
import StickerListState from './states/StickerListState';
import LazyStickerSection from './components/LazyStickerSection';

export { default as extend } from './extend';

app.initializers.add('ramon-stickers', () => {
  app.stickerListState = new StickerListState();

  extend(ExtensionPage.prototype, 'sections', function (items) {
    if (this.extension.id !== 'ramon-stickers') return;

    // A extensão não tem permissões próprias: a seção vazia só ocupava espaço.
    if (items.has('permissions')) items.remove('permissions');

    items.add('stickers', <LazyStickerSection />);
  });
});
