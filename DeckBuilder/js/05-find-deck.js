// Tournament Deck Finder — reads the existing Supabase Edge Function.
const TOURNAMENT_DECK_API = 'https://vixudhbgvihtdynhcfey.supabase.co/functions/v1/topdecks-test';
let tournamentDecks = [], tournamentVisible = 30, tournamentLoaded = false, tournamentBusy = false;
let pendingTournamentDeck = null;
const findDeckModal = $('findDeckModal');
const findDeckConfirmModal = $('findDeckConfirmModal');
const colourPalette = { B:'#45b8ee', G:'#38bf65', R:'#df4b38', P:'#8a45cb', W:'#d6dbe3' };

function closeTournamentFinder() {
    findDeckModal.classList.remove('open'); findDeckModal.hidden = true;
    $('findDeck').focus();
}
function tournamentMatches() {
    const colour = $('findDeckColors').value;
    return tournamentDecks.filter(d => !colour || String(d.colors || '').toUpperCase() === colour);
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
    const results = tournamentMatches();
    $('findDeckStatus').hidden = true;
    $('findDeckStatus').textContent = '';
    $('findDeckResults').innerHTML = results.slice(0, tournamentVisible).map(d => {
        const index = tournamentDecks.indexOf(d);
        const bars = [...String(d.colors || '').toUpperCase()].filter(x => colourPalette[x]).map(x => `<span style="background:${colourPalette[x]}"></span>`).join('');
        const arts = tournamentArtIds(d).map(c => `<img src="${img(byId.get(c.id))}" alt="${esc(byId.get(c.id).name || c.id)}" loading="lazy" onerror="this.style.display='none'">`).join('');
        return `<div class="find-deck-result"><div class="find-deck-art"><div class="find-deck-bars">${bars}</div><div class="find-deck-cards">${arts}</div></div><div class="find-deck-details"><strong>${esc(d.name || d.profile || 'Unnamed Deck')} · ${esc(d.colors || '?')}</strong><small>${esc(d.player || 'Unknown player')} · ${esc(d.placement || 'Unplaced')} · ${esc(d.country || '')}</small><small>${esc(d.tournament || 'Tournament')} ${d.host ? '· ' + esc(d.host) : ''} ${d.date ? '· ' + esc(d.date) : ''}</small></div><div class="find-deck-actions"><button class="btn" type="button" data-tournament-preview="${index}">Preview</button><button class="btn primary" type="button" data-tournament-index="${index}">Load Deck</button></div></div>`;
    }).join('') || '<p class="empty">No tournament decks found for these colours.</p>';
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
        tournamentLoaded = true; tournamentVisible = 30;
        const select = $('findDeckColors'), selected = select.value;
        select.innerHTML = '<option value="">All colours</option>';
        for (const colours of [...new Set(tournamentDecks.map(d => String(d.colors || '').toUpperCase()).filter(Boolean))].sort()) {
            const option = document.createElement('option'); option.value = colours; option.textContent = colours; select.append(option);
        }
        select.value = [...select.options].some(o => o.value === selected) ? selected : '';
        renderTournamentDecks();

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
    $('findDeckColors').focus(); fetchTournamentDecks();
};
$('closeFindDeck').onclick = closeTournamentFinder;
findDeckModal.addEventListener('click', e => { if (e.target === findDeckModal) closeTournamentFinder(); });
document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (!findDeckConfirmModal.hidden) { e.preventDefault(); closeTournamentConfirmation(); }
    else if (!findDeckModal.hidden) { e.preventDefault(); closeTournamentFinder(); }
});
$('findDeckColors').addEventListener('change', () => { tournamentVisible = 30; if (tournamentLoaded) renderTournamentDecks(); });
$('refreshFindDeck').onclick = () => fetchTournamentDecks(true);
$('findDeckMore').onclick = () => { tournamentVisible += 30; renderTournamentDecks(); };
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
