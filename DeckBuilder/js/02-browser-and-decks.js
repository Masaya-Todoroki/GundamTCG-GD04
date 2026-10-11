// #region Card Browser Rendering
// ============================================================================
// CARD BROWSER RENDERING
// ============================================================================
// #region Shared Card Prefab
// One card template for Browser, Deck Manager, Inspector links and Tokens.
// Variants preserve the existing event attributes and layout-specific CSS.
function cardPrefab(c, variant = 'browser', quantity = deck[c.id] || 0) {
    const id = esc(c.id);
    const name = esc(c.name || c.id);
    const type = esc(c.type || 'Unknown');
    const artwork = img(c);
    const info = `<div class="info"><div class="name" title="${name}">${name}</div><div class="sub">${id}${variant === 'token' ? '' : ` · ${type}`}</div></div>`;
    const controls = (prefix = 'quick') => {
        const attr = action => prefix === 'match' ? `data-match-${action}="${id}"` : `data-quick="${action}" data-id="${id}"`;
        return `<div class="gallery-quick${prefix === 'match' ? ' match-actions' : ''}"><button ${attr('clear')} title="Remove all copies" aria-label="Remove all copies" ${quantity === 0 ? 'disabled' : ''}>🗑</button><button ${attr('minus')} title="Remove one" ${quantity === 0 ? 'disabled' : ''}>−</button><span class="gallery-count${prefix === 'match' ? ' match-count' : ''}">${quantity}/4</span><button class="gallery-add" ${attr('plus')} title="Add one" ${quantity >= 4 ? 'disabled' : ''}>+</button><button class="gallery-add" ${attr('all')} title="Add up to 4 copies" aria-label="Add up to 4 copies" ${quantity >= 4 ? 'disabled' : ''}>4</button></div>`;
    };
    if (variant === 'manager') {
        return `<div class="card-cell deck-grid-item"><button class="deck-grid-art" data-action="view" data-id="${id}" title="Inspect ${name}"><img class="card-cell-art" loading="lazy" src="${artwork}" alt="${name}"></button><span class="deck-qty">×${quantity}</span><div class="deck-grid-actions"><button class="btn" data-action="minus" data-id="${id}" aria-label="Remove one ${name}">−</button><span>${quantity}/4</span><button class="btn" data-action="plus" data-id="${id}" aria-label="Add one ${name}" ${quantity >= 4 ? 'disabled' : ''}>+</button></div></div>`;
    }
    if (variant === 'browser') {
        return `<article class="card card-cell" data-id="${id}"><img class="card-cell-art gallery-card-art" loading="lazy" src="${artwork}" alt="${name}" title="Inspect card" tabindex="0" role="button" aria-label="Inspect ${name}">${controls()}${info}</article>`;
    }
    const token = variant === 'token';
    return `<article class="card card-cell inspector-mini-card ${token ? 'token-preview' : 'match-tile'}"><button class="mini-art-button" data-open="${id}" title="Inspect ${name}"><img class="card-cell-art" loading="lazy" src="${artwork}" alt="${name}"></button>${token ? '' : controls('match')}${info}</article>`;
}
// #endregion Shared Card Prefab

function render() { let a = filtered(); visibleCount = Math.min(Math.max(PAGE, visibleCount), Math.max(PAGE, a.length)); $('results').textContent = `${a.length} matching cards`; $('cards').innerHTML = a.slice(0, visibleCount).map(c => cardPrefab(c, 'browser')).join('') || '<p class="empty">No cards match these filters.</p>'; updateLoadStatus(a.length); }
function updateLoadStatus(total) { const shown = Math.min(visibleCount, total); $('loadStatus').textContent = total > shown ? `Showing ${shown} of ${total} cards · Scroll down to load more` : `Showing all ${total} cards`; }
function loadMoreCards() { if (document.getElementById('deckViewer')?.hidden === false)
    return; const total = filtered().length; if (visibleCount >= total)
    return; visibleCount = Math.min(visibleCount + PAGE, total); render(); }

// #endregion

// #region Deck Viewer / Deck Manager Rendering
// ============================================================================
// DECK VIEWER / DECK MANAGER RENDERING
// ============================================================================
function renderDeck() { autosaveDraft(); let entries = Object.entries(deck).filter(([id, n]) => n > 0 && byId.has(id) && !isToken(byId.get(id))); let total = entries.reduce((n, [id, q]) => n + q, 0); $('total').textContent = `${total} cards`; $('unique').textContent = `${entries.length} unique`; for (const [type, target, label] of [['Unit','unitCount','Units'],['Pilot','pilotCount','Pilots'],['Command','commandCount','Commands'],['Base','baseCount','Bases']]) { const count = entries.reduce((n, [id, q]) => n + (byId.get(id).type === type ? q : 0), 0); $(target).textContent = `${count} ${label}`; } $('tabCount').textContent = `(${total})`; $('viewerTotal').textContent = `${total} / 50 cards`; $('viewerName').textContent = $('deckName').value || 'My Gundam Deck'; renderDeckGrid(entries); document.querySelectorAll('#cards .gallery-quick').forEach(controls => { const id = controls.closest('article.card')?.dataset.id; if (!id)
    return; const n = deck[id] || 0; controls.querySelector('.gallery-count').textContent = n + '/4'; controls.querySelector('[data-quick=clear]').disabled = n === 0; controls.querySelector('[data-quick=minus]').disabled = n === 0; controls.querySelector('[data-quick=plus]').disabled = n >= 4; controls.querySelector('[data-quick=all]').disabled = n >= 4; }); $('deckList').innerHTML = entries.length ? ['Unit', 'Pilot', 'Command', 'Base'].map(type => { const group = entries.filter(([id]) => byId.get(id)?.type === type); const quantity = group.reduce((sum, [, n]) => sum + n, 0); return `<div class="deck-section-heading"><span>${type === 'Base' ? 'Bases' : type + 's'}</span><span class="deck-section-count">${quantity} cards</span></div>` + group.map(([id, n]) => { let c = byId.get(id); return `<div class="deckitem"><div class="deck-art"><img loading="lazy" src="${img(c)}" data-inspect-id="${esc(id)}" role="button" tabindex="0" aria-label="Inspect ${esc(c.name || id)}"></div><div class="label">${esc(c.name || id)}<br><small>${esc(id)}</small><div class="actions"><button data-action="clear" data-id="${esc(id)}" title="Remove all copies" aria-label="Remove all copies">🗑</button><button data-action="minus" data-id="${esc(id)}" title="Remove one">−</button><span>${n}/4</span><button data-action="plus" data-id="${esc(id)}" title="Add one" ${n >= 4 ? 'disabled' : ''}>+</button><button data-action="all" data-id="${esc(id)}" title="Add up to 4 copies" ${n >= 4 ? 'disabled' : ''}>4</button></div></div></div>`; }).join(''); }).join('') : '<p class="empty">Choose a card from the gallery to start building.</p>'; }
function renderDeckGrid(entries) {
    const types = ['Unit', 'Pilot', 'Command', 'Base'];
    const groups = types.map(type => [type, entries.filter(([id]) => byId.get(id)?.type === type)]);
    const other = entries.filter(([id]) => !types.includes(byId.get(id)?.type));
    if (other.length)
        groups.push(['Other', other]);
    $('deckGridGroups').innerHTML = groups.filter(([, items]) => items.length).map(([type, items]) => `<section class="deck-group" data-deck-type="${esc(type)}"><div class="deck-group-head"><h3>${esc(type)}${type === 'Base' ? 's' : 's'}</h3><span class="pill">${items.reduce((a, [, n]) => a + n, 0)} cards</span></div><div class="deck-grid">${items.sort(([a], [b]) => a.localeCompare(b)).map(([id, n]) => cardPrefab(byId.get(id), 'manager', n)).join('')}</div></section>`).join('') || '<p class="empty">Your deck is empty. Switch to Card Browser to add cards.</p>';
    requestAnimationFrame(fitDeckManagerCards);
}

// Fit all unique deck cards in the available Deck Manager viewport on desktop.
// Falls back to page scrolling if the viewport is too small to fit legibly.

// #endregion

// #region Deck Manager Auto-Fit
// ============================================================================
// DECK MANAGER AUTO-FIT
// ============================================================================
function fitDeckManagerCards() {
  const viewer = document.getElementById('deckViewer');
  if (!viewer || viewer.hidden || window.innerWidth <= 1000) return;
  const display = viewer.querySelector('.deck-display');
  if (!display) return;
  const available = Math.max(250, window.innerHeight - display.getBoundingClientRect().top - 10);
  // Use a shared column count to keep the four quadrants visually consistent.
  // Prefer readable artwork, but use additional columns when it helps the
  // two rows of categories fit in the available screen height.
  let chosen = 4;
  for (let columns = 3; columns <= 8; columns++) {
    viewer.style.setProperty('--deck-square-columns', columns);
    if (display.scrollHeight <= available) { chosen = columns; break; }
    chosen = columns;
  }
  viewer.style.setProperty('--deck-square-columns', chosen);
}
window.addEventListener('resize', () => requestAnimationFrame(fitDeckManagerCards));


// #endregion

// #region Page Navigation
// ============================================================================
// PAGE NAVIGATION
// ============================================================================
function setView(view) { let deckMode = view === 'deck'; $('appShell').classList.toggle('deck-mode', deckMode); $('deckViewer').hidden = !deckMode; $('colourBanner').hidden = deckMode; $('browseTab').classList.toggle('primary', !deckMode); $('deckTab').classList.toggle('primary', deckMode); if (deckMode)
    { renderDeck(); requestAnimationFrame(fitDeckManagerCards); } }
$('browseTab').onclick = () => setView('browse');
$('deckTab').onclick = () => setView('deck');
$('deckName').addEventListener('input', () => { $('viewerName').textContent = $('deckName').value || 'My Gundam Deck'; autosaveDraft(); });

// #endregion

// #region Card Quantity Actions
// ============================================================================
// CARD QUANTITY ACTIONS
// ============================================================================
function handleDeckAction(e) { let b = e.target.closest('[data-action][data-id]'); if (!b)
    return; let id = b.dataset.id; if (b.dataset.action === 'view')
    show(id);
else
    change(id, b.dataset.action === 'plus' ? 1 : -1); }
$('deckGridGroups').onclick = handleDeckAction;

// #endregion

// #region Text Import / Export
// ============================================================================
// TEXT IMPORT / EXPORT
// ============================================================================
function exportDeckText() { return Object.entries(deck).filter(([id, n]) => Number.isInteger(n) && n > 0 && byId.has(id) && !isToken(byId.get(id))).sort(([a], [b]) => a.localeCompare(b)).map(([id, n]) => `${n} ${id}`).join('\n'); }
function parseDeckText(input) { const result = {}, errors = []; for (const [index, raw] of input.split(/\r?\n/).entries()) {
    const line = raw.trim();
    if (!line)
        continue;
    const m = /^(?:x)?(\d+)\s+([A-Za-z0-9]+-\d+)$/i.exec(line);
    if (!m) {
        errors.push(`Line ${index + 1}: Expected 1 GD01-001`);
        continue;
    }
    const count = Number(m[1]), id = m[2].toUpperCase();
    if (!byId.has(id) || isToken(byId.get(id))) {
        errors.push(`Line ${index + 1}: Unknown or token card ${id}`);
        continue;
    }
    if (!Number.isSafeInteger(count) || count < 1 || count > 4) {
        errors.push(`Line ${index + 1}: Quantity must be 1–4`);
        continue;
    }
    if ((result[id] || 0) + count > 4) {
        errors.push(`Line ${index + 1}: More than 4 copies of ${id}`);
        continue;
    }
    result[id] = (result[id] || 0) + count;
} return { result, errors }; }
function openDeckTextModal() { const m = $('deckTextModal'); m.hidden = false; $('deckText').value = exportDeckText(); $('importStatus').textContent = ''; $('deckText').focus(); }
function closeDeckTextModal() { $('deckTextModal').hidden = true; $('openDeckText').focus(); }
$('openDeckText').onclick = openDeckTextModal;
$('closeDeckText').onclick = closeDeckTextModal;
$('deckTextModal').addEventListener('click', e => { if (e.target === $('deckTextModal'))
    closeDeckTextModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('deckTextModal').hidden) {
    e.preventDefault();
    closeDeckTextModal();
} });
$('copyDeck').onclick = async () => { const t = $('deckText'); if (!t.value)
    t.value = exportDeckText(); try {
    await navigator.clipboard.writeText(t.value);
    $('importStatus').textContent = 'Copied to clipboard.';
}
catch (e) {
    t.focus();
    t.select();
    $('importStatus').textContent = 'Select and copy the highlighted text (Ctrl+C).';
} };
$('import').onclick = () => { const raw = $('deckText').value; if (!raw.trim()) {
    $('importStatus').textContent = 'Paste a deck list first.';
    return;
} const { result, errors } = parseDeckText(raw); if (errors.length) {
    $('importStatus').textContent = 'Import not applied:\n' + errors.join('\n');
    return;
} deck = result; renderDeck(); $('importStatus').textContent = `Imported ${Object.values(result).reduce((a, b) => a + b, 0)} cards.`; };

// #endregion

// #region Deck Mutation
// ============================================================================
// DECK MUTATION
// ============================================================================
function change(id, d) { if (isToken(byId.get(id) || {}))
    return; let n = Math.max(0, Math.min(4, (deck[id] || 0) + d)); if (n)
    deck[id] = n;
else
    delete deck[id]; renderDeck(); }

// #endregion

// #region Inspector Link Matching
// ============================================================================
// INSPECTOR LINK MATCHING
// ============================================================================
function chip(v) { return `<span class="chip">${esc(v)}</span>`; }
function normalizeMatch(v) { return String(v ?? '').normalize('NFKC').toLowerCase().replace(/[“”"'`]/g, '').replace(/\s+/g, ' ').trim(); }
function cleanTrait(v) { return normalizeMatch(v).replace(/^\(/, '').replace(/\)\s*(trait)?$/, '').replace(/\s+trait$/, '').trim(); }
function match(c, p) {
    const names = new Set(pilotNames(p).map(normalizeMatch));
    const traits = new Set(pilotTraits(p).map(cleanTrait));
    const namedLinks = arr(c.link_conditions);
    const traitLinks = arr(c.link_trait_conditions);
    // Some earlier JSON files put a printed '(Trait) Trait' link into link_conditions.
    // New set JSONs store BOTH Pilot names and Pilot traits in link_conditions.
    // Match either kind, including plain traits such as "Orb" or "Zeon".
    // Legacy link_trait_conditions is supported for older set files.
    const link = namedLinks.some(x => names.has(normalizeMatch(x)) || traits.has(cleanTrait(x)))
        || traitLinks.some(x => traits.has(cleanTrait(x)));
    const pc = c.pair_conditions || {};
    let pair = arr(pc.pilot_names).some(x => names.has(normalizeMatch(x)))
        || arr(pc.pilot_traits).some(x => traits.has(cleanTrait(x)));
    if (pair && c.pair_min_pilot_level != null)
        pair = (Number(p.level) || 0) >= Number(c.pair_min_pilot_level);
    return { link, pair };
}
function matches(c) { if (c.type === 'Unit') {
    return cards.filter(isPilot).map(p => ({ c: p, ...match(c, p) })).filter(x => x.link || x.pair).sort((a, b) => (Number(!!deck[b.c.id]) - Number(!!deck[a.c.id])) || Number(b.link) - Number(a.link));
} if (isPilot(c)) {
    return cards.filter(x => x.type === 'Unit').map(u => ({ c: u, ...match(u, c) })).filter(x => x.link || x.pair).sort((a, b) => (Number(!!deck[b.c.id]) - Number(!!deck[a.c.id])) || Number(b.link) - Number(a.link));
} return []; }

// #endregion

