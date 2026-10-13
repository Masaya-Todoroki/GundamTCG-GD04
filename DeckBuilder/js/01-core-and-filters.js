
   

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
const selectedSets = new Set();
let sortAscending = true;
// Close the set picker when clicking elsewhere or pressing Escape.
document.addEventListener('pointerdown', (event) => {
    const picker = document.getElementById('setFilter');
    if (picker && picker.open && !picker.contains(event.target)) picker.open = false;
});
document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
        const picker = document.getElementById('setFilter');
        if (picker && picker.open) picker.open = false;
    }
});
function setupSetFilters() {
    const setGroup = set => /^ST/i.test(set) ? 0 : /^GD/i.test(set) ? 1 : /^EB/i.test(set) ? 2 : 3;
    const sets = [...new Set(cards.filter(c => !isToken(c)).map(c => c.id.split('-')[0]))].sort((a,b) => setGroup(a)-setGroup(b) || a.localeCompare(b, undefined, {numeric:true}));
    const options = $('setFilterOptions');
    options.innerHTML = '';
    selectedSets.clear();
    sets.forEach(set => selectedSets.add(set));

    const allLabel = document.createElement('label');
    allLabel.className = 'set-filter-all';
    const allInput = document.createElement('input');
    allInput.type = 'checkbox';
    allInput.checked = true;
    allLabel.append(allInput, document.createTextNode(' All Sets'));
    options.append(allLabel);

    const inputs = [];
    const refresh = () => {
        allInput.checked = selectedSets.size === sets.length;
        allInput.indeterminate = selectedSets.size > 0 && selectedSets.size < sets.length;
        $('setFilterLabel').textContent = allInput.checked ? 'All sets' :
            selectedSets.size ? `${selectedSets.size} sets selected` : 'No sets selected';
        page = 0;
        visibleCount = PAGE;
        render();
    };
    allInput.addEventListener('change', () => {
        selectedSets.clear();
        if (allInput.checked) sets.forEach(set => selectedSets.add(set));
        inputs.forEach(input => { input.checked = allInput.checked; });
        refresh();
    });
    const columns = document.createElement('div');
    columns.className = 'set-filter-columns';
    options.append(columns);
    const grouped = [['ST', []], ['GD', []], ['EB', []], ['Other', []]];
    for (const set of sets) grouped[setGroup(set)][1].push(set);
    for (const [groupName, groupSets] of grouped) {
        if (!groupSets.length) continue;
        const column = document.createElement('div');
        column.className = 'set-filter-column';
        const heading = document.createElement('div');
        heading.className = 'set-filter-heading';
        heading.textContent = groupName;
        column.append(heading);
        columns.append(column);
        for (const set of groupSets) {
        const label = document.createElement('label');
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.value = set;
        input.checked = true;
        inputs.push(input);
        input.addEventListener('change', () => {
            if (input.checked) selectedSets.add(set);
            else selectedSets.delete(set);
            refresh();
        });
        label.append(input, document.createTextNode(' ' + set));
        column.append(label);
        }
    }
}

function updateSortDirection() {
    const button = $('sortDirection');
    const isName = $('sort').value === 'name';
    button.textContent = sortAscending ? (isName ? '↑ A to Z' : '↑ Low to high') : (isName ? '↓ Z to A' : '↓ High to low');
    button.title = button.textContent;
    button.setAttribute('aria-label', button.textContent);
}
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
function filtered() {
    const q = $('search').value.trim().toLowerCase();
    const cols = selectedColors, t = $('type').value;
    const eligible = c => !isToken(c) && selectedSets.has(c.id.split('-')[0]) && (!cols.size || cols.has(c.color)) && (!t || c.type === t);
    const directMatch = c => !q || (q === 'token' && (tokensByCard.get(c.id)?.length || 0) > 0) ||
        [c.id, c.name, ...arr(c.traits), ...pilotNames(c), ...pilotTraits(c), ...arr(c.keywords)].join(' ').toLowerCase().includes(q);
    const direct = cards.filter(c => eligible(c) && directMatch(c));
    const sort = $('sort').value;
    const sortCards = list => {
        if (sort === 'name') list.sort((a, b) => (a.name || '').localeCompare(b.name || '') * (sortAscending ? 1 : -1));
        else if (sort === 'level') list.sort((a, b) => ((Number(a.level) || 0) - (Number(b.level) || 0)) * (sortAscending ? 1 : -1) || a.id.localeCompare(b.id));
        else list.sort((a, b) => {
            // EB stays at the end regardless of sort direction.
            const ebA = /^EB/i.test(a.id), ebB = /^EB/i.test(b.id);
            if (ebA !== ebB) return ebA ? 1 : -1;
            return a.id.localeCompare(b.id, undefined, {numeric:true}) * (sortAscending ? 1 : -1);
        });
        return list;
    };
    if (!q) return sortCards(direct);
    // Include Units linked/paired with directly matching Pilots, after all direct search results.
    // Use the same compatibility rules as the card inspector.
    const matchingPilots = cards.filter(c => isPilot(c) && directMatch(c));
    const directIds = new Set(direct.map(c => c.id));
    const linkedUnits = matchingPilots.length ? cards.filter(c => c.type === 'Unit' && eligible(c) && !directIds.has(c.id) &&
        matchingPilots.some(p => { const result = match(c, p); return result.link || result.pair; })) : [];
    return [...sortCards(direct), ...sortCards(linkedUnits)];
}

// #endregion

