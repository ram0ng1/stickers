import app from 'flarum/admin/app';

export default class StickerListState {
  constructor() {
    this.stickers = [];
    this.moreResults = false;
    this.loading = false;

    // Posição no servidor, separada do tamanho da lista: adicionar ou apagar
    // localmente muda `stickers.length`, e usá-lo como offset faria o
    // "Carregar mais" pular ou repetir itens.
    this.offset = 0;
    this.requestId = 0;

    this.selectionMode = false;
    this.selectedIds = new Set();
  }

  loadResults(offset = 0) {
    if (offset === 0) {
      // Recomeça do zero: voltar à página nunca duplica a lista.
      this.stickers = [];
      this.moreResults = false;
      this.offset = 0;
    }
    this.loading = true;

    // Só a resposta da requisição mais recente vale: recarregar no meio de um
    // "Carregar mais" duplicaria a página.
    const requestId = ++this.requestId;

    return app.store.find('stickers', { page: { limit: 24, offset } }).then((results) => {
      if (requestId !== this.requestId) return results;
      return this.parseResults(results);
    });
  }

  loadMore() {
    this.loadResults(this.offset);
  }

  parseResults(results) {
    const known = new Set(this.stickers.map((s) => s.id()));
    this.stickers.push(...results.filter((s) => !known.has(s.id())));
    this.offset += results.length;
    this.loading = false;
    this.moreResults = !!results.payload.links && !!results.payload.links.next;
    m.redraw();
    return results;
  }

  addToList(sticker) {
    // O novo vai para o fim da ordem do servidor (id): o offset não muda, e o
    // filtro de duplicados do parseResults cobre quando a paginação chegar nele.
    this.stickers.unshift(sticker);
    m.redraw();
  }

  removeFromList(stickerId) {
    const index = this.stickers.findIndex((s) => stickerId === s.id());
    if (index !== -1) {
      this.stickers.splice(index, 1);
      this.offset = Math.max(0, this.offset - 1);
    }
    m.redraw();
  }

  isLoading() {
    return this.loading;
  }
  hasMoreResults() {
    return this.moreResults;
  }
  empty() {
    return this.stickers.length === 0 && !this.loading;
  }

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
