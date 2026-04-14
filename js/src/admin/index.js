import app from 'flarum/admin/app';
import { extend } from 'flarum/common/extend';
import ExtensionPage from 'flarum/admin/components/ExtensionPage';
import Sticker from '../common/models/Sticker';
import StickerListState from './states/StickerListState';
import StickerSection from './components/StickerSection';

app.initializers.add('ramon-stickers', () => {
  app.store.models['stickers'] = Sticker;
  app.stickerListState = new StickerListState();

  extend(ExtensionPage.prototype, 'sections', function (items) {
    if (this.extension.id !== 'ramon-stickers') return;

    if (items.has('permissions')) items.remove('permissions');

    items.add('stickers', <StickerSection />);
  });
});
