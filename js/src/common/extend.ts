import Extend from 'flarum/common/extenders';
import Sticker from './models/Sticker';

export default [new Extend.Store().add('stickers', Sticker)];
