// #region Card Inspector
// ============================================================================
// CARD INSPECTOR
// ============================================================================
const inspectorHistory = [];
let inspectorHistoryIndex = -1;
const INSPECTOR_HISTORY_LIMIT = 100;

function updateInspectorNavigation() {
    const back = $('inspectorBack');
    const forward = $('inspectorForward');
    back.disabled = inspectorHistoryIndex <= 0;
    forward.disabled = inspectorHistoryIndex < 0 || inspectorHistoryIndex >= inspectorHistory.length - 1;
    back.title = back.disabled ? 'No previous card' : `Back to ${byId.get(inspectorHistory[inspectorHistoryIndex - 1])?.name || inspectorHistory[inspectorHistoryIndex - 1]}`;
    forward.title = forward.disabled ? 'No next card' : `Forward to ${byId.get(inspectorHistory[inspectorHistoryIndex + 1])?.name || inspectorHistory[inspectorHistoryIndex + 1]}`;
}
function closeInspector() {
    $('modal').classList.remove('open');
    inspectorHistory.length = 0;
    inspectorHistoryIndex = -1;
    updateInspectorNavigation();
}
function navigateInspector(delta) {
    const next = inspectorHistoryIndex + delta;
    if (next < 0 || next >= inspectorHistory.length) return;
    inspectorHistoryIndex = next;
    show(inspectorHistory[next], 'history');
}
$('inspectorBack').onclick = () => navigateInspector(-1);
$('inspectorForward').onclick = () => navigateInspector(1);

function show(id, navigation = 'push') {
    const c = byId.get(id);
    if (!c)
        return;
    if (navigation !== 'history') {
        if (!$('modal').classList.contains('open')) {
            inspectorHistory.length = 0;
            inspectorHistoryIndex = -1;
        }
        if (inspectorHistory[inspectorHistoryIndex] !== id) {
            inspectorHistory.splice(inspectorHistoryIndex + 1);
            inspectorHistory.push(id);
            if (inspectorHistory.length > INSPECTOR_HISTORY_LIMIT) inspectorHistory.shift();
            inspectorHistoryIndex = inspectorHistory.length - 1;
        }
    }
    updateInspectorNavigation();
    const sameInspector = selected === id && $('modal').classList.contains('open');
    const dialog = $('modal').querySelector('.dialog');
    const previousScroll = sameInspector && dialog ? dialog.scrollTop : 0;
    if (sameInspector) dialog.querySelectorAll('details[data-colour-section]').forEach(d => { if (d.open) openColourGroups.add(d.dataset.colourSection); else openColourGroups.delete(d.dataset.colourSection); });
    if (!sameInspector || !inspectorMatches) inspectorMatches = matches(c);
    selected = id;
    const m = inspectorMatches;
    const generated = arr(tokensByCard.get(c.id)).map(id => byId.get(id) || { id, name: id, type: 'Token' });
    const tokenCreators = isToken(c) ? arr(creatorsByToken.get(c.id)).map(creatorId => byId.get(creatorId)).filter(Boolean) : [];
    const count = deck[id] || 0;
    const addButton = isToken(c) ? '' : `<button class="btn remove-all" id="removeSelected" title="Remove all copies" aria-label="Remove all copies" ${count === 0 ? 'disabled' : ''}>🗑</button><button class="btn" id="minusSelected" title="Remove one" ${count === 0 ? 'disabled' : ''}>−</button><span class="inspection-count">${count}/4</span><button class="btn primary" id="addSelected" title="Add one" ${count >= 4 ? 'disabled' : ''}>+</button><button class="btn primary" id="addAllSelected" title="Add up to 4 copies" ${count >= 4 ? 'disabled' : ''}>4</button>`;
    const tokenSection = generated.length ? `<section class="inspection-section"><h2>Tokens created <span class="match-section-count">(${generated.length})</span></h2><div class="token-gallery">${generated.map(t => cardPrefab(t, 'token')).join('')}</div></section>` : '';
    // Same portrait artwork, quantity row and name/ID hierarchy as the main browser.
    const renderMatchTile = (x, label = null) => cardPrefab(x.c, 'match');
    const renderMatchSection = (heading, items) => items.length
        ? (() => {
            // With no browser colours selected, retain the original single grid.
            if (!selectedColors.size) return `<section class="inspection-section"><h2>${heading} <span class="match-section-count">(${items.length})</span></h2><div class="match-grid">${items.map(x => renderMatchTile(x)).join('')}</div></section>`;
            const matching = items.filter(x => selectedColors.has(x.c.color));
            const other = items.filter(x => !selectedColors.has(x.c.color));
            const grid = group => `<div class="match-grid">${group.map(x => renderMatchTile(x)).join('')}</div>`;
            return `<section class="inspection-section"><h2>${heading} <span class="match-section-count">(${items.length})</span></h2>`
                + `<div class="inspection-colour-group"><h3>Matching Colours (${matching.length})</h3>${matching.length ? grid(matching) : '<p class="empty">No links in the selected colours.</p>'}</div>`
                + (other.length ? `<details class="inspection-other-colours" data-colour-section="${esc(heading)}" ${openColourGroups.has(heading) ? 'open' : ''}><summary>Other Colours (${other.length})</summary>${grid(other)}</details>` : '')
                + `</section>`;
        })()
        : '';
    const subject = c.type === 'Unit' ? 'Pilots' : 'Units';
    const linkMatches = m.filter(x => x.link);
    const pairMatches = m.filter(x => x.pair && !x.link);
    const creatorSection = isToken(c)
        ? (tokenCreators.length
            ? `<section class="inspection-section"><h2>Created by <span class="match-section-count">(${tokenCreators.length})</span></h2><div class="match-grid">${tokenCreators.map(creator => renderMatchTile({ c: creator, link: false, pair: false }, 'Creates this token')).join('')}</div></section>`
            : '<section class="inspection-section"><h2>Created by</h2><p class="empty">No generating cards listed in tokens.json.</p></section>')
        : '';
    const compatibility = (c.type === 'Unit' || isPilot(c))
        ? (renderMatchSection(`Link ${subject}`, linkMatches)
            + renderMatchSection(`Compatible Pair ${subject}`, pairMatches)
            || '<section class="inspection-section"><p class="empty">No compatible cards found.</p></section>')
        : '';
    $('detail').innerHTML = `<div class="inspection-layout"><div class="inspection-hero"><img class="inspection-card" src="${img(c)}" alt="${esc(c.name || id)}"><div class="inspection-controls">${addButton}</div></div><div class="inspection-related">${compatibility}${tokenSection}${creatorSection}</div></div>`;
    $('modal').classList.add('open');
    $('detail').querySelectorAll('details[data-colour-section]').forEach(d => d.addEventListener('toggle', () => { if (d.open) openColourGroups.add(d.dataset.colourSection); else openColourGroups.delete(d.dataset.colourSection); }));
    if (sameInspector && dialog) dialog.scrollTop = previousScroll;
    if (!isToken(c)) {
        $('addSelected').onclick = () => { change(id, 1); refreshInspectorQuantities(); }; $('addAllSelected').onclick = () => { change(id, 4); refreshInspectorQuantities(); };
        $('minusSelected').onclick = () => { change(id, -1); refreshInspectorQuantities(); };
        $('removeSelected').onclick = () => { change(id, -(deck[id] || 0)); refreshInspectorQuantities(); };
    }
}
$('cards').onclick = e => { const quick = e.target.closest('button[data-quick]'); if (quick) {
    e.stopPropagation();
    const id = quick.dataset.id;
    const action = quick.dataset.quick;
    change(id, action === 'clear' ? -(deck[id] || 0) : action === 'minus' ? -1 : action === 'all' ? 4 : 1);
    render();
    return;
} const art = e.target.closest('img.gallery-card-art'); if (art) {
    const el = art.closest('article.card[data-id]');
    if (el)
        show(el.dataset.id);
} };
$('cards').addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('img.gallery-card-art')) {
    e.preventDefault();
    const el = e.target.closest('article.card[data-id]');
    if (el)
        show(el.dataset.id);
} });
$('deckList').onclick = e => {
    const art = e.target.closest('img[data-inspect-id]');
    if (art) { document.getElementById('browserDeckSidebar').dispatchEvent(new Event('deck:collapse')); show(art.dataset.inspectId); return; }
    const b = e.target.closest('button[data-action]');
    if (!b) return;
    const id = b.dataset.id;
    change(id, b.dataset.action === 'clear' ? -(deck[id] || 0) : b.dataset.action === 'all' ? 4 : b.dataset.action === 'plus' ? 1 : -1);
};
$('deckList').addEventListener('keydown', e => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('img[data-inspect-id]')) {
        e.preventDefault(); document.getElementById('browserDeckSidebar').dispatchEvent(new Event('deck:collapse')); show(e.target.dataset.inspectId);
    }
});
// Update quantities in-place so clicking related-card controls never recreates the tiles.
function refreshInspectorQuantities() {
    if (!$('modal').classList.contains('open')) return;
    $('detail').querySelectorAll('.inspector-mini-card.match-tile').forEach(tile => {
        const id = tile.querySelector('[data-match-plus]')?.dataset.matchPlus;
        if (!id) return;
        const n = deck[id] || 0;
        const count = tile.querySelector('.match-count');
        if (count) count.textContent = `${n}/4`;
        for (const action of ['clear', 'minus', 'plus', 'all']) {
            const button = tile.querySelector(`[data-match-${action}]`);
            if (button) button.disabled = action === 'clear' || action === 'minus' ? n === 0 : n >= 4;
        }
    });
    const n = deck[selected] || 0;
    const count = $('detail').querySelector('.inspection-count');
    if (count) count.textContent = `${n}/4`;
    for (const [buttonId, disabled] of [['removeSelected', n === 0], ['minusSelected', n === 0], ['addSelected', n >= 4], ['addAllSelected', n >= 4]]) {
        const button = $(buttonId);
        if (button) button.disabled = disabled;
    }
}
$('detail').onclick = e => { let b = e.target.closest('[data-open],[data-match-clear],[data-match-minus],[data-match-plus],[data-match-all]'); if (!b)
    return; if (b.dataset.open) {
    show(b.dataset.open);
    return;
} const id = b.dataset.matchClear || b.dataset.matchMinus || b.dataset.matchPlus || b.dataset.matchAll; if (!id)
    return; const delta = b.dataset.matchClear !== undefined ? -(deck[id] || 0) : b.dataset.matchMinus !== undefined ? -1 : b.dataset.matchAll !== undefined ? 4 : 1; change(id, delta); refreshInspectorQuantities(); };
$('close').onclick = closeInspector;
$('modal').onclick = e => { if (e.target === $('modal'))
    closeInspector(); };
document.addEventListener('keydown', e => { if (e.key === 'Escape' && $('modal').classList.contains('open'))
    closeInspector(); });
for (const id of ['search', 'type', 'sort'])
    $(id).addEventListener('input', () => { page = 0; visibleCount = PAGE; render(); });
const cardLoadObserver = new IntersectionObserver(entries => { if (entries.some(e => e.isIntersecting))
    loadMoreCards(); }, { rootMargin: '650px 0px' });
cardLoadObserver.observe($('loadSentinel'));
const DRAFT_KEY = 'gundamDeckAutosaveDraftV1';

// #endregion

// #region Local Draft & Saved Decks
// ============================================================================
// LOCAL DRAFT & SAVED DECKS
// ============================================================================
function autosaveDraft() {
    try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify({
            name: $('deckName').value,
            cards: { ...deck },
            activeSavedDeckId,
            updated: Date.now()
        }));
    } catch (error) { console.warn('Unable to autosave deck draft', error); }
}
function restoreDraft() {
    try {
        const draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
        if (!draft || !draft.cards || typeof draft.cards !== 'object' || Array.isArray(draft.cards)) return false;
        deck = Object.fromEntries(Object.entries(draft.cards).filter(([id, n]) =>
            byId.has(id) && !isToken(byId.get(id)) && Number.isInteger(n) && n >= 1 && n <= 4));
        $('deckName').value = typeof draft.name === 'string' ? draft.name : 'My Gundam Deck';
        activeSavedDeckId = typeof draft.activeSavedDeckId === 'string' ? draft.activeSavedDeckId : null;
        return true;
    } catch (error) { console.warn('Unable to restore deck draft', error); return false; }
}
const SAVED_DECKS_KEY = 'gundamDeckSavedCollectionV1';
let activeSavedDeckId = null;
function getSavedDecks() { try {
    const data = JSON.parse(localStorage.getItem(SAVED_DECKS_KEY) || '[]');
    return Array.isArray(data) ? data : [];
}
catch {
    return [];
} }
function putSavedDecks(items) { localStorage.setItem(SAVED_DECKS_KEY, JSON.stringify(items)); }
function newDeckId() { return crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + '-' + Math.random().toString(36).slice(2); }
function deckSnapshot(id) { return { id, name: ($('deckName').value || 'Untitled Deck').trim(), cards: { ...deck }, updated: Date.now() }; }
// Compare card quantities regardless of insertion order or deck name.
function sameDeckCards(a, b) {
    const entriesA = Object.entries(a || {}).filter(([, n]) => Number(n) > 0);
    const entriesB = Object.entries(b || {}).filter(([, n]) => Number(n) > 0);
    return entriesA.length === entriesB.length && entriesA.every(([id, n]) => Number(b?.[id]) === Number(n));
}
// Keep names unique: Name, Name (1), Name (2), etc.
function uniqueDeckName(requested, items, excludeId = null) {
    const existing = new Set(items.filter(d => d.id !== excludeId).map(d => String(d.name || '').toLowerCase()));
    const base = (requested || 'Untitled Deck').trim();
    if (!existing.has(base.toLowerCase())) return base;
    let n = 1;
    while (existing.has(`${base} (${n})`.toLowerCase())) n++;
    return `${base} (${n})`;
}
function savedDeckMessage(message) { $('savedDeckStatus').textContent = message; }
function showSavedDecks() { if (!$('savedDecksModal').classList.contains('startup-mode')) exitStartupDeckSelection(); renderSavedDecks(); $('savedDecksModal').classList.add('open'); }
function renderSavedDecks() { const items = getSavedDecks().sort((a, b) => (b.updated || 0) - (a.updated || 0)); $('savedDeckList').innerHTML = items.length ? items.map(d => { const count = Object.values(d.cards || {}).reduce((sum, n) => sum + (Number(n) || 0), 0); return `<div class="saved-deck-row" data-save-id="${esc(d.id)}"><div><strong>${esc(d.name || 'Untitled Deck')} ${d.id === activeSavedDeckId ? '<span class="saved-deck-current">(Current)</span>' : ''}</strong><small>${count} cards · ${new Date(d.updated || Date.now()).toLocaleDateString()}</small></div><div class="saved-deck-row-actions"><button class="btn primary" data-saved-action="load">Load</button><button class="btn" data-saved-action="rename">Rename</button><button class="btn danger" data-saved-action="delete">Delete</button></div></div>`; }).join('') : '<p class="empty">No saved decks yet. Use Save Deck to create your first save.</p>'; }
// Saving is name-based, never based on the previously loaded deck ID.
// A name collision always requires an explicit decision before replacing data.
let pendingSaveConflict = null;
function closeSaveConflict() {
    $('saveConflictModal').classList.remove('open');
    pendingSaveConflict = null;
}
function writeNamedDeck(name, overwriteId = null) {
    try {
        const items = getSavedDecks();
        const snapshot = deckSnapshot(overwriteId || newDeckId());
        snapshot.name = name.trim();
        const collision = items.find(d => d.name.trim().toLowerCase() === snapshot.name.toLowerCase());
        if (collision && collision.id !== overwriteId) {
            showSaveConflict(snapshot.name, collision);
            return;
        }
        if (overwriteId) {
            const i = items.findIndex(d => d.id === overwriteId);
            if (i < 0) { savedDeckMessage('The saved deck no longer exists. Please save again.'); return; }
            items[i] = snapshot;
        } else {
            items.push(snapshot);
        }
        putSavedDecks(items);
        activeSavedDeckId = snapshot.id;
        $('deckName').value = snapshot.name;
        autosaveDraft();
        renderSavedDecks();
        savedDeckMessage(overwriteId ? `Overwrote "${snapshot.name}".` : `Saved "${snapshot.name}" as a new deck.`);
        closeSaveConflict();
    } catch (e) {
        savedDeckMessage('Unable to save: ' + e.message);
    }
}
function showSaveConflict(name, existing) {
    pendingSaveConflict = { name, existingId: existing.id };
    $('saveConflictMessage').textContent = `A saved deck named "${existing.name}" already exists. Rename this deck to save a new copy, or explicitly overwrite the existing saved deck.`;
    $('saveConflictModal').classList.add('open');
}
function saveDeckChanges() {
    const name = ($('deckName').value || '').trim();
    if (!name) { savedDeckMessage('Please enter a deck name.'); return; }
    const existing = getSavedDecks().find(d => String(d.name || '').trim().toLowerCase() === name.toLowerCase());
    if (existing) { showSaveConflict(name, existing); return; }
    writeNamedDeck(name);
}
$('saveConflictCancel').onclick = closeSaveConflict;
$('saveConflictModal').addEventListener('click', e => { if (e.target === $('saveConflictModal')) closeSaveConflict(); });
$('saveConflictOverwrite').onclick = () => {
    if (!pendingSaveConflict) return;
    const { name, existingId } = pendingSaveConflict;
    // Check again in case another tab changed localStorage while the dialog was open.
    const existing = getSavedDecks().find(d => d.id === existingId);
    if (!existing || existing.name.trim().toLowerCase() !== name.toLowerCase()) {
        closeSaveConflict();
        savedDeckMessage('Saved decks changed. Please try saving again.');
        return;
    }
    writeNamedDeck(existing.name, existingId);
};
// #region Styled Rename Dialog
let renameDeckContext = null;
function openRenameDeckDialog(context, suggestedName) {
    renameDeckContext = context;
    $('renameDeckTitle').textContent = context.mode === 'saved' ? 'Rename Saved Deck' : 'Save as New Deck';
    $('renameDeckHelp').textContent = context.mode === 'saved'
        ? 'Choose a new name for this saved deck.'
        : 'Choose a different name to keep the existing saved deck unchanged.';
    $('renameDeckSubmit').textContent = context.mode === 'saved' ? 'Rename Deck' : 'Save New Deck';
    $('renameDeckInput').value = suggestedName;
    $('renameDeckError').textContent = '';
    $('renameDeckModal').classList.add('open');
    $('renameDeckInput').focus();
    $('renameDeckInput').select();
}
function closeRenameDeckDialog() {
    $('renameDeckModal').classList.remove('open');
    renameDeckContext = null;
}
$('renameDeckCancel').onclick = closeRenameDeckDialog;
$('renameDeckModal').addEventListener('click', e => {
    if (e.target === $('renameDeckModal')) closeRenameDeckDialog();
});
$('renameDeckForm').addEventListener('submit', e => {
    e.preventDefault();
    if (!renameDeckContext) return;
    const name = $('renameDeckInput').value.trim();
    if (!name) { $('renameDeckError').textContent = 'Please enter a deck name.'; return; }
    const context = renameDeckContext;
    const items = getSavedDecks();
    const collision = items.find(d => String(d.name || '').trim().toLowerCase() === name.toLowerCase() && d.id !== context.id);
    if (collision) {
        $('renameDeckError').textContent = 'That name is already used. Choose another name.';
        return;
    }
    if (context.mode === 'saved') {
        const item = items.find(d => d.id === context.id);
        if (!item) { $('renameDeckError').textContent = 'This saved deck no longer exists.'; return; }
        item.name = name;
        item.updated = Date.now();
        try { putSavedDecks(items); } catch (err) { $('renameDeckError').textContent = 'Unable to rename: ' + err.message; return; }
        if (activeSavedDeckId === item.id) {
            $('deckName').value = name;
            renderDeck();
            autosaveDraft();
        }
        closeRenameDeckDialog();
        renderSavedDecks();
        savedDeckMessage('Deck renamed.');
    } else {
        closeRenameDeckDialog();
        $('deckName').value = name;
        renderDeck();
        autosaveDraft();
        writeNamedDeck(name);
    }
});
$('saveConflictRename').onclick = () => {
    if (!pendingSaveConflict) return;
    const name = pendingSaveConflict.name;
    closeSaveConflict();
    openRenameDeckDialog({ mode: 'new' }, `${name} (2)`);
};
// #endregion Styled Rename Dialog
function offerSavedDecksOnStartup() {
    if (!getSavedDecks().length) return;
    const modal = $('savedDecksModal');
    modal.classList.add('startup-mode');
    $('savedDecksTitle').textContent = 'Your Saved Decks';
    $('closeSavedDecks').textContent = '✕ Continue Current Deck';
    showSavedDecks();
}
function exitStartupDeckSelection() {
    const modal = $('savedDecksModal');
    modal.classList.remove('startup-mode');
    $('savedDecksTitle').textContent = 'Save / Load Decks';
    $('closeSavedDecks').textContent = '✕ Close';
}
$('save').onclick = showSavedDecks;
$('closeSavedDecks').onclick = () => { $('savedDecksModal').classList.remove('open'); exitStartupDeckSelection(); };
$('saveCurrentDeck').onclick = saveDeckChanges;
function loadSavedDeck(d) {
    deck = { ...d.cards };
    $('deckName').value = d.name || 'Untitled Deck';
    activeSavedDeckId = d.id;
    render();
    renderDeck();
    renderSavedDecks();
    autosaveDraft();
    savedDeckMessage(`Loaded "${d.name}".`);
}
$('savedDeckList').onclick = e => { const button = e.target.closest('[data-saved-action]'); if (!button)
    return; const id = button.closest('[data-save-id]')?.dataset.saveId; const items = getSavedDecks(), i = items.findIndex(d => d.id === id); if (i < 0)
    return; const d = items[i]; switch (button.dataset.savedAction) {
    case 'load':
        loadSavedDeck(d);
        if ($('savedDecksModal').classList.contains('startup-mode')) { $('savedDecksModal').classList.remove('open'); exitStartupDeckSelection(); }
        break;
    case 'rename': {
        openRenameDeckDialog({ mode: 'saved', id: d.id }, d.name);
        break;
    }
    case 'delete': {
        if (!confirm(`Delete saved deck "${d.name}"? This cannot be undone.`))
            return;
        items.splice(i, 1);
        putSavedDecks(items);
        if (activeSavedDeckId === id) {
            activeSavedDeckId = null;
            autosaveDraft();
        }
        renderSavedDecks();
        savedDeckMessage('Saved deck deleted.');
        break;
    }
} };
$('savedDecksModal').addEventListener('click', e => { if (e.target === $('savedDecksModal'))
    $('savedDecksModal').classList.remove('open'); exitStartupDeckSelection(); });
$('clear').onclick = () => $('clearConfirmModal').classList.add('open');

// #endregion

// #region Clear-Deck Dialog
// ============================================================================
// CLEAR-DECK DIALOG
// ============================================================================
function closeClearDialog() { $('clearConfirmModal').classList.remove('open'); }
$('closeClearConfirm').onclick = closeClearDialog;
$('cancelClear').onclick = closeClearDialog;
$('confirmClear').onclick = () => { deck = {}; activeSavedDeckId = null; $('deckName').value = 'New Deck'; render(); renderDeck(); renderSavedDecks(); autosaveDraft(); closeClearDialog(); };
$('clearConfirmModal').addEventListener('click', e => { if (e.target === $('clearConfirmModal'))
    closeClearDialog(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') {
    $('savedDecksModal').classList.remove('open');
    closeClearDialog();
    closeRenameDeckDialog();
    closeSaveConflict();
} });


// #endregion


$('sortDirection').addEventListener('click', () => { sortAscending = !sortAscending; updateSortDirection(); page = 0; visibleCount = PAGE; render(); });
$('sort').addEventListener('change', updateSortDirection);
updateSortDirection();
