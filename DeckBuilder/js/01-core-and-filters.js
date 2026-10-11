
   

// #region Application State & Common Utilities
// ============================================================================
// APPLICATION STATE & COMMON UTILITIES
// ============================================================================
let cards = [], byId = new Map(), deck = {}, page = 0, selected = null, visibleCount = 48;
let inspectorMatches = null; // Frozen ordering for the currently inspected card.
let tokensByCard = new Map(); // Card ID -> token IDs.
let creatorsByToken = new Map(); // Token ID -> card IDs, directly from Data/tokens.json.
const PAGE = 48, $ = id => document.getElementById(id), esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const img = c => {
    const folder = /^T-\d+$/i.test(c.id) ? 'Tokens' : c.id.split('-')[0];
    return `Cards/${esc(folder)}/${esc(c.id)}.webp`;
};
const arr = x => Array.isArray(x) ? x : [];
const pilotNames = c => arr(c.pilot?.names).length ? arr(c.pilot.names) : c.pilot?.name ? [c.pilot.name] : c.type === 'Pilot' ? [c.name] : [];
// Command/Pilot traits may be on the card itself (new JSON) or inside pilot (legacy JSON).
const pilotTraits = c => isPilot(c) ? [...new Set([...arr(c.traits), ...arr(c.pilot?.traits)])] : [];
const isPilot = c => !!c.pilot || c.type === 'Pilot';
function opt(id, values) { for (const v of [...new Set(values.filter(Boolean))].sort()) {
    let o = document.createElement('option');
    o.value = v;
    o.textContent = v;
    $(id).append(o);
} }
function isToken(c) { return /token/i.test(c.type || '') || /^T-\d+$/i.test(c.id || ''); }
const selectedColors = new Set();
const openColourGroups = new Set();

// #endregion

// #region Colour Filters
// ============================================================================
// COLOUR FILTERS
// ============================================================================
function setupColorFilters() {
    const order = ['Blue', 'Green', 'Red', 'Purple', 'White'];
    const palette = { Blue: ['#2267c5', '#192e4c', '#35619a'], Green: ['#25864c', '#193b2d', '#34724e'], Red: ['#c6404b', '#45232e', '#92505a'], Purple: ['#8046bb', '#322442', '#68478a'], White: ['#b7c1d0', '#424a56', '#8e9baa'] };
    const available = new Set(cards.filter(c => !isToken(c)).map(c => c.color).filter(Boolean));
    $('colorFilters').innerHTML = '';
    for (const color of order) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'color-filter';
        b.textContent = color;
        b.dataset.color = color;
        b.setAttribute('aria-pressed', 'false');
        const [shade, dim, edge] = palette[color];
        b.style.setProperty('--shade', shade);
        b.style.setProperty('--shade-dim', dim);
        b.style.setProperty('--shade-edge', edge);
        b.onclick = () => { if (selectedColors.has(color))
            selectedColors.delete(color);
        else if (selectedColors.size < 2)
            selectedColors.add(color); updateColorFilters(); page = 0; visibleCount = PAGE; render(); if (selected && $('modal').classList.contains('open')) show(selected); };
        $('colorFilters').append(b);
    }
    updateColorFilters();
}
function updateColorFilters() {
    $('colourSelectionCount').textContent = `${selectedColors.size} / 2 selected`;
    for (const b of $('colorFilters').querySelectorAll('button')) {
        const selected = selectedColors.has(b.dataset.color);
        b.setAttribute('aria-pressed', String(selected));
        b.disabled = !selected && selectedColors.size >= 2;
        b.title = selected ? 'Click to deselect' : selectedColors.size >= 2 ? 'Deselect a colour first' : 'Click to filter by ' + b.dataset.color;
    }
}

// ============================================================================
// SEARCH, SORT & CARD FILTERING
// ============================================================================
function filtered() { let q = $('search').value.trim().toLowerCase(), s = $('set').value, cols = selectedColors, t = $('type').value; let a = cards.filter(c => !isToken(c) && (!s || c.id.startsWith(s + '-')) && (!cols.size || cols.has(c.color)) && (!t || c.type === t) && (!q || (q === 'token' && (tokensByCard.get(c.id)?.length || 0) > 0) || [c.id, c.name, ...arr(c.traits), ...pilotNames(c), ...pilotTraits(c), ...arr(c.keywords)].join(' ').toLowerCase().includes(q))); let sort = $('sort').value; if (sort === 'name')
    a.sort((a, b) => (a.name || '').localeCompare(b.name || '')); if (sort === 'level')
    a.sort((a, b) => (Number(b.level) || 0) - (Number(a.level) || 0)); return a; }

// #endregion

