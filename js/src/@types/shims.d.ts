import type StickerListState from '../admin/states/StickerListState';

declare module 'flarum/admin/AdminApplication' {
  export default interface AdminApplication {
    stickerListState: StickerListState;
  }
}
