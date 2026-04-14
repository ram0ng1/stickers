import Model from 'flarum/common/Model';
import mixin from 'flarum/common/utils/mixin';

export default class Sticker extends mixin(Model, {
  category: Model.attribute('category'),
  categoryName: Model.attribute('categoryName'),
  title: Model.attribute('title'),
  textToReplace: Model.attribute('textToReplace'),
  path: Model.attribute('path'),
}) {
  apiEndpoint() {
    return '/stickers' + (this.exists ? '/' + this.data.id : '');
  }
}
