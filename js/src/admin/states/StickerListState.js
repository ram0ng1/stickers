import app from 'flarum/admin/app';

export default class StickerListState {
  constructor() {
    this.stickers     = [];
    this.moreResults  = false;
    this.loading      = false;

    // Selection mode
    this.selectionMode = false;
    this.selectedIds   = new Set();
  }

  // ── Loading ──────────────────────────────────────────────────────────────

  loadResults(offset = 0) {
    if (offset === 0) {
      // Reset on fresh load so re-entering the page never duplicates
      this.stickers    = [];
      this.moreResults = false;
    }
    this.loading = true;
    return app.store.find('stickers', { page: { limit: 24, offset } }).then(this.parseResults.bind(this));
  }

  loadMore() {
    this.loading = true;
    this.loadResults(this.stickers.length);
  }

  parseResults(results) {
    this.stickers.push(...results);
    this.loading     = false;
    this.moreResults = !!results.payload.links && !!results.payload.links.next;
    m.redraw();
    return results;
  }

  addToList(sticker) {
    this.stickers.unshift(sticker);
    m.redraw();
  }

  removeFromList(stickerId) {
    const index = this.stickers.findIndex((s) => stickerId === s.id());
    if (index !== -1) this.stickers.splice(index, 1);
    m.redraw();
  }

  isLoading()      { return this.loading; }
  hasMoreResults() { return this.moreResults; }
  empty()          { return this.stickers.length === 0 && !this.loading; }

  // ── Selection ─────────────────────────────────────────────────────────────

  enterSelectionMode() {
    this.selectionMode = true;
    this.selectedIds.clear();
    m.redraw();
  }

  exitSelectionMode() {
    this.selectionMode = false;
    this.selectedIds.clear();
    m.redraw();
  }

  toggleSelect(id) {
    if (this.selectedIds.has(id)) {
      this.selectedIds.delete(id);
    } else {
      this.selectedIds.add(id);
    }
    m.redraw();
  }

  isSelected(id) {
    return this.selectedIds.has(id);
  }

  get selectedCount() {
    return this.selectedIds.size;
  }

  get selectedArray() {
    return [...this.selectedIds];
  }
}
