// Tournament Deck Finder — reads the existing Supabase Edge Function.
const TOURNAMENT_DECK_API = 'https://vixudhbgvihtdynhcfey.supabase.co/functions/v1/topdecks-test';
let tournamentDecks = [], tournamentVisible = 8, tournamentLoaded = false, tournamentBusy = false;
let tournamentEvents = [], selectedTournamentKey = null, tournamentListScroll = 0, tournamentDeckScroll = 0;
let pendingTournamentDeck = null;
let tournamentDecksOnly = false;
const findDeckModal = $('findDeckModal');
const findDeckConfirmModal = $('findDeckConfirmModal');
const colourPalette = { B:'#45b8ee', G:'#38bf65', R:'#df4b38', P:'#8a45cb', W:'#d6dbe3' };

function closeTournamentFinder() {
    findDeckModal.classList.remove('open'); findDeckModal.hidden = true;
    $('findDeck').focus();
}
function tournamentDateValue(raw) {
    const value = String(raw || '').trim();
    if (!value) return 0;
    const numeric = value.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/);
    if (numeric) return Date.UTC(Number(numeric[3]), Number(numeric[2]) - 1, Number(numeric[1]));
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
}
function tournamentPlacementRank(raw) {
    const value = String(raw || '').toLowerCase().trim();
    const explicit = value.match(/^(\d+)(?:st|nd|rd|th)?(?:\s|$|\()/);
    if (explicit) return Number(explicit[1]);
    const top = value.match(/(?:top\s*|^t)(\d+)/);
    if (top) return Number(top[1]);
    const winner = /(?:winner|champion|first place)/.test(value);
    return winner ? 1 : Number.POSITIVE_INFINITY;
}
function tournamentEventIdentity(d) {
    // Host distinguishes individual events that share a tournament type.
    // Country and date prevent unrelated events from being merged.
    return [d.host, d.tournament, d.date, d.country].map(x => String(x || '').trim().toLowerCase()).join('\u001f');
}
function buildTournamentEvents() {
    const groups = new Map();
    for (const d of tournamentDecks) {
        const key = tournamentEventIdentity(d);
        if (!groups.has(key)) groups.set(key, {key, host: d.host || '', tournament: d.tournament || '', date: d.date || '', country: d.country || '', decks: []});
        groups.get(key).decks.push(d);
    }
    tournamentEvents = [...groups.values()];
    for (const event of tournamentEvents) {
        event.decks.sort((a,b) => tournamentPlacementRank(a.placement) - tournamentPlacementRank(b.placement) || String(a.player || '').localeCompare(String(b.player || '')));
    }
    tournamentEvents.sort((a,b) => tournamentDateValue(b.date) - tournamentDateValue(a.date) || String(a.host || a.tournament).localeCompare(String(b.host || b.tournament)));
}
function tournamentMatches() {
    const colour = $('findDeckColors').value;
    const event = tournamentEvents.find(e => e.key === selectedTournamentKey);
    const source = tournamentDecksOnly ? tournamentDecks : (event ? event.decks : []);
    return source.filter(d => !colour || String(d.colors || '').toUpperCase() === colour);
}
function tournamentEventName(event) {
    return event.host || event.tournament || 'Unnamed tournament';
}
function renderTournamentEvents() {
    if ($('findDeckEventType').value === 'decks') {
        tournamentDecksOnly = true;
        selectedTournamentKey = null;
        tournamentVisible = Math.max(8, tournamentVisible);
        $('findDeckEventFilter').hidden = false;
        $('findDeckNavigation').hidden = true;
        $('findDeckFilters').hidden = false;
        renderTournamentDecks();
        return;
    }
    tournamentDecksOnly = false;
    $('findDeckEventFilter').hidden = false;
    $('findDeckNavigation').hidden = true;
    $('findDeckFilters').hidden = true;
    $('findDeckMore').hidden = true;
    const eventType = $('findDeckEventType').value;
    const visibleEvents = tournamentEvents.map((event, index) => ({event, index})).filter(({event}) => event.decks.length > 1 && (eventType === 'all' || /regional/i.test(`${event.tournament || ''} ${event.host || ''}`)));
    $('findDeckResults').innerHTML = visibleEvents.map(({event, index}) => `
        <button type="button" class="find-deck-event" data-event-index="${index}">
            <span class="find-deck-event-copy"><strong>${esc(tournamentEventName(event))}</strong>
            <small>${esc([event.date, event.tournament !== event.host ? event.tournament : '', event.country].filter(Boolean).join(' · '))}</small></span>
            <span class="find-deck-event-end"><small>${event.decks.length} ${event.decks.length === 1 ? 'deck' : 'decks'}</small><span aria-hidden="true">›</span></span>
        </button>`).join('') || (eventType === 'regional' ? `<div class="find-deck-empty"><strong>No regional tournaments found</strong><p>Try All tournaments to see the other events.</p><button class="btn" type="button" id="findDeckShowAll">Show all tournaments</button></div>` : `<div class="find-deck-empty"><strong>No tournaments with multiple decks found</strong><p>Choose Decks only to browse individual decklists.</p></div>`);
    $('findDeckResults').scrollTop = tournamentListScroll;
}
function showTournamentEvent(index) {
    const event = tournamentEvents[index];
    if (!event) return;
    tournamentListScroll = $('findDeckResults').scrollTop;
    tournamentDecksOnly = false;
    selectedTournamentKey = event.key;
    tournamentVisible = 8;
    $('findDeckColors').value = '';
    $('findDeckNavigation').hidden = false;
    $('findDeckFilters').hidden = false;
    $('findDeckEventFilter').hidden = true;
    $('findDeckEventTitle').textContent = tournamentEventName(event);
    $('findDeckEventInfo').textContent = [event.date, event.tournament !== event.host ? event.tournament : '', event.country].filter(Boolean).join(' · ');
    renderTournamentDecks();
    $('findDeckResults').scrollTop = 0;
}
function backToTournamentEvents() {
    tournamentDeckScroll = $('findDeckResults').scrollTop;
    selectedTournamentKey = null;
    tournamentDecksOnly = false;
    $('findDeckStatus').hidden = true;
    renderTournamentEvents();
}
function tournamentArtIds(d) {
    // The current API does not return the site's ViewDeck thumbnails.
    // Prefer explicit card IDs if a future API supplies them; otherwise choose
    // two high-level Units from the actual deck, with different colours if possible.
    const supplied = Array.isArray(d.thumbnailCardIds) ? d.thumbnailCardIds : [];
    const candidates = supplied.length ? supplied.map(id => ({id})) : (d.cards || []).map(e => byId.get(String(e.id || '').toUpperCase())).filter(c => c && String(c.type).toLowerCase() === 'unit');
    const sorted = supplied.length ? candidates : candidates.sort((a,b) => (Number(b.level)||0)-(Number(a.level)||0));
    const picked = [], usedColours = new Set();
    for (const c of sorted) {
        if (!byId.has(c.id) || picked.some(x => x.id === c.id)) continue;
        const color = byId.get(c.id).color;
        if (!usedColours.has(color)) { picked.push(c); usedColours.add(color); }
        if (picked.length === 2) break;
    }
    for (const c of sorted) {
        if (picked.length === 2) break;
        if (byId.has(c.id) && !picked.some(x => x.id === c.id)) picked.push(c);
    }
    return picked;
}
function renderTournamentDecks() {
    const results = tournamentMatches().slice();
    if (tournamentDecksOnly) {
        results.sort((a,b) => tournamentDateValue(b.date) - tournamentDateValue(a.date)
            || tournamentPlacementRank(a.placement) - tournamentPlacementRank(b.placement)
            || String(a.player || '').localeCompare(String(b.player || '')));
    }
    $('findDeckStatus').hidden = true;
    $('findDeckStatus').textContent = '';
    $('findDeckResults').innerHTML = results.slice(0, tournamentVisible).map(d => {
        const index = tournamentDecks.indexOf(d);
        const bars = [...String(d.colors || '').toUpperCase()].filter(x => colourPalette[x]).map(x => `<span style="background:${colourPalette[x]}"></span>`).join('');
        const arts = tournamentArtIds(d).map(c => `<img src="${img(byId.get(c.id))}" alt="${esc(byId.get(c.id).name || c.id)}" loading="lazy" onerror="this.style.display='none'">`).join('');
        return `<div class="find-deck-result"><div class="find-deck-art"><div class="find-deck-bars">${bars}</div><div class="find-deck-cards">${arts}</div></div><div class="find-deck-details"><strong>${esc(d.name || d.profile || 'Unnamed Deck')} · ${esc(d.colors || '?')}</strong><small>${esc(d.player || 'Unknown player')} · ${esc(d.placement || 'Unplaced')} · ${esc(d.country || '')}</small><small>${esc(d.tournament || 'Tournament')} ${d.host ? '· ' + esc(d.host) : ''} ${d.date ? '· ' + esc(d.date) : ''}</small></div><div class="find-deck-actions"><button class="btn" type="button" data-tournament-preview="${index}">Preview</button><button class="btn primary" type="button" data-tournament-index="${index}">Load Deck</button></div></div>`;
    }).join('') || ( $('findDeckColors').value ? '<div class="find-deck-empty"><strong>No decks found</strong><p>No decks match the selected colours${tournamentDecksOnly ? "." : " in this tournament."}</p><button class="btn" type="button" id="clearFindDeckFilter">Clear Filter</button></div>' : '<p class="empty">No decklists available for this tournament.</p>');
    $('findDeckMore').hidden = results.length <= tournamentVisible;
}
async function fetchTournamentDecks(force = false) {
    if (tournamentBusy || (tournamentLoaded && !force)) return;
    tournamentBusy = true; $('refreshFindDeck').disabled = true;
    $('findDeckStatus').hidden = true;
    $('findDeckStatus').textContent = '';
    if (!tournamentLoaded) $('findDeckResults').innerHTML = '<p class="empty">Finding decks…</p>';
    try {
        const response = await fetch(`${TOURNAMENT_DECK_API}?limit=1000`, {cache:force?'reload':'default'});
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const payload = await response.json();
        if (!Array.isArray(payload.decks)) throw new Error('Unexpected API response');
        tournamentDecks = payload.decks.filter(d => d && Array.isArray(d.cards));
        tournamentLoaded = true; tournamentVisible = 8;
        buildTournamentEvents();
        const select = $('findDeckColors'), selected = select.value;
        select.innerHTML = '<option value="">All colours</option>';
        for (const colours of [...new Set(tournamentDecks.map(d => String(d.colors || '').toUpperCase()).filter(Boolean))].sort()) {
            const option = document.createElement('option'); option.value = colours; option.textContent = colours; select.append(option);
        }
        select.value = [...select.options].some(o => o.value === selected) ? selected : '';
        if ($('findDeckEventType').value === 'decks') { tournamentDecksOnly = true; selectedTournamentKey = null; renderTournamentEvents(); }
        else if (selectedTournamentKey && tournamentEvents.some(e => e.key === selectedTournamentKey)) {
            const event = tournamentEvents.find(e => e.key === selectedTournamentKey);
            $('findDeckEventTitle').textContent = tournamentEventName(event);
            renderTournamentDecks();
        } else { selectedTournamentKey = null; tournamentListScroll = 0; renderTournamentEvents(); }

    } catch (error) {
        $('findDeckStatus').hidden = false;
        $('findDeckStatus').textContent = `Could not retrieve decks: ${error.message}. Check Edge Function CORS and logs.`;
        if (!tournamentLoaded) $('findDeckResults').innerHTML = '<p class="empty">Unable to find decks.</p>';
    } finally { tournamentBusy = false; $('refreshFindDeck').disabled = false; }
}
function closeTournamentConfirmation() {
    findDeckConfirmModal.classList.remove('open'); findDeckConfirmModal.hidden = true;
    pendingTournamentDeck = null;
}
function applyTournamentDeck() {
    if (!pendingTournamentDeck) return;
    const {nextDeck, found} = pendingTournamentDeck;
    deck = nextDeck; activeSavedDeckId = null;
    $('deckName').value = found.name || found.profile || `${found.player || 'Tournament'} Deck`;
    render(); renderDeck(); autosaveDraft();
    closeTournamentConfirmation(); closeTournamentFinder();
    const deckTab = $('deckTab'); if (deckTab) deckTab.click();
}
$('findDeck').onclick = () => {
    findDeckModal.hidden = false; findDeckModal.classList.add('open');
    if (tournamentLoaded) { if (selectedTournamentKey) renderTournamentDecks(); else renderTournamentEvents(); }
    fetchTournamentDecks();
};
$('closeFindDeck').onclick = closeTournamentFinder;
findDeckModal.addEventListener('click', e => { if (e.target === findDeckModal) closeTournamentFinder(); });
document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (!findDeckConfirmModal.hidden) { e.preventDefault(); closeTournamentConfirmation(); }
    else if (!findDeckModal.hidden) { e.preventDefault(); closeTournamentFinder(); }
});
$('findDeckColors').addEventListener('change', () => { tournamentVisible = 8; if (tournamentLoaded && (selectedTournamentKey || tournamentDecksOnly)) { renderTournamentDecks(); $('findDeckResults').scrollTop = 0; } });
$('findDeckBack').onclick = backToTournamentEvents;
$('findDeckEventType').addEventListener('change', () => { tournamentListScroll = 0; tournamentVisible = 8; $('findDeckColors').value = ''; renderTournamentEvents(); $('findDeckResults').scrollTop = 0; });
$('findDeckResults').addEventListener('click', e => {
    if (e.target.closest('#findDeckShowAll')) { $('findDeckEventType').value = 'all'; tournamentListScroll = 0; renderTournamentEvents(); return; }
    const eventButton = e.target.closest('[data-event-index]');
    if (eventButton) showTournamentEvent(Number(eventButton.dataset.eventIndex));
    if (e.target.closest('#clearFindDeckFilter')) { $('findDeckColors').value = ''; tournamentVisible = 8; renderTournamentDecks(); }
});
$('refreshFindDeck').onclick = () => fetchTournamentDecks(true);
$('findDeckMore').onclick = () => { const position = $('findDeckResults').scrollTop; tournamentVisible += 8; renderTournamentDecks(); $('findDeckResults').scrollTop = position; };
$('closeFindDeckConfirm').onclick = closeTournamentConfirmation;
$('cancelFindDeckLoad').onclick = closeTournamentConfirmation;
findDeckConfirmModal.addEventListener('click', e => { if (e.target === findDeckConfirmModal) closeTournamentConfirmation(); });
$('confirmFindDeckLoad').onclick = applyTournamentDeck;
function buildTournamentDeck(found) {
    const nextDeck = {}, unknown = [];
    for (const entry of found.cards) {
        const id = String(entry.id || '').toUpperCase(), qty = Number(entry.quantity);
        if (!byId.has(id) || isToken(byId.get(id))) { unknown.push(id); continue; }
        if (!Number.isInteger(qty) || qty < 1 || qty > 4 || (nextDeck[id] || 0) + qty > 4)
            throw new Error(`Invalid quantity for ${id}.`);
        nextDeck[id] = (nextDeck[id] || 0) + qty;
    }
    if (unknown.length) throw new Error(`${unknown.length} card ID(s) missing from local card data: ${unknown.slice(0,8).join(', ')}${unknown.length > 8 ? '…' : ''}`);
    return nextDeck;
}
let tournamentPreviewOpen = false;
function restoreTournamentFinderAfterPreview() {
    if (!tournamentPreviewOpen) return;
    tournamentPreviewOpen = false;
    findDeckModal.hidden = false;
    findDeckModal.classList.add('open');
}
$('closeDeckImage').addEventListener('click', restoreTournamentFinderAfterPreview);
$('deckImageModal').addEventListener('click', e => {
    if (e.target === $('deckImageModal')) restoreTournamentFinderAfterPreview();
});
document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && tournamentPreviewOpen) restoreTournamentFinderAfterPreview();
});
$('findDeckResults').addEventListener('click', async e => {
    const previewButton = e.target.closest('[data-tournament-preview]');
    const loadButton = e.target.closest('[data-tournament-index]');
    const button = previewButton || loadButton;
    if (!button) return;
    const index = Number(previewButton ? button.dataset.tournamentPreview : button.dataset.tournamentIndex);
    const found = tournamentDecks[index];
    if (!found) return;
    let nextDeck;
    try { nextDeck = buildTournamentDeck(found); }
    catch (error) {
        $('findDeckStatus').hidden = false;
        $('findDeckStatus').textContent = `Deck unavailable: ${error.message}`;
        return;
    }
    if (previewButton) {
        tournamentPreviewOpen = true;
        findDeckModal.classList.remove('open'); findDeckModal.hidden = true;
        await previewTournamentDeckImage(nextDeck, found.name || found.profile || 'Tournament Deck');
        return;
    }
    pendingTournamentDeck = {nextDeck, found};
    if (!Object.values(deck).some(q => q > 0)) { applyTournamentDeck(); return; }
    $('findDeckConfirmText').textContent = `Replace the current deck with “${found.name || found.profile || 'Tournament Deck'}” by ${found.player || 'Unknown player'}? Your saved decks will not be changed.`;
    findDeckConfirmModal.hidden = false; findDeckConfirmModal.classList.add('open');
    $('confirmFindDeckLoad').focus();
});
