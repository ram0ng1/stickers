import Button from 'flarum/common/components/Button';
import Tooltip from 'flarum/common/components/Tooltip';

export default class StickerButton extends Button {
  view(vnode) {
    const originalView = super.view(vnode);
    const tooltipText = this.attrs.tooltipText || originalView.attrs.title;
    delete originalView.attrs.title;

    return (
      <Tooltip showOnFocus={false} text={tooltipText}>
        {originalView}
      </Tooltip>
    );
  }

  static initAttrs(attrs) {
    super.initAttrs(attrs);
    attrs.className = 'Button Button--icon Button--link Button-Sticker';
    attrs.tooltipText = attrs.title;
  }
}
