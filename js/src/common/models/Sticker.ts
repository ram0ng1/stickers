import Model from 'flarum/common/Model';

export default class Sticker extends Model {
  category() {
    return Model.attribute<string | null>('category').call(this);
  }

  categoryName() {
    return Model.attribute<string | null>('categoryName').call(this);
  }

  title() {
    return Model.attribute<string | null>('title').call(this);
  }

  textToReplace() {
    return Model.attribute<string>('textToReplace').call(this);
  }

  path() {
    return Model.attribute<string>('path').call(this);
  }
}
