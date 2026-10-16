// #region Application Initialisation
// ============================================================================
// APPLICATION INITIALISATION
// ============================================================================
async function start() {
    try {
        if (location.protocol === 'file:') {
            throw new Error('Open this page with VS Code Live Server or GitHub Pages to load JSON card data.');
        }
        const data = await Promise.all(CARD_SETS.map(async (set) => {
            const response = await fetch(`Data/${set}.json`, { cache: 'no-cache' });
            if (!response.ok) {
                throw new Error(`Could not load Data/${set}.json (HTTP ${response.status})`);
            }
            const json = await response.json();
            const setCards = Array.isArray(json) ? json : json.cards;
            if (!Array.isArray(setCards)) {
                throw new Error(`Data/${set}.json must contain a cards array.`);
            }
            return setCards;
        }));
        cards = data.flat().filter(card => card && card.id);
        byId = new Map(cards.map(c => [c.id, c]));
        // Separate token relationships: { "T-001": ["ST01-015", ...], ... }
        // Tokens without their own card data can still be inspected via their artwork.
        const tokenResponse = await fetch('Data/tokens.json', { cache: 'no-cache' });
        if (!tokenResponse.ok) {
            throw new Error(`Could not load Data/tokens.json (HTTP ${tokenResponse.status})`);
        }
        const tokenMappings = await tokenResponse.json();
        if (!tokenMappings || Array.isArray(tokenMappings) || typeof tokenMappings !== 'object') {
            throw new Error('Data/tokens.json must be an object mapping token IDs to arrays of card IDs.');
        }
        tokensByCard = new Map();
        creatorsByToken = new Map();
        for (const [tokenId, creatorIds] of Object.entries(tokenMappings)) {
            if (!/^T-\d+$/i.test(tokenId) || !Array.isArray(creatorIds)) {
                throw new Error(`Invalid token mapping for ${tokenId} in Data/tokens.json`);
            }
            if (!byId.has(tokenId)) byId.set(tokenId, { id: tokenId, name: tokenId, type: 'Token' });
            creatorsByToken.set(tokenId, [...new Set(creatorIds.filter(id => typeof id === 'string'))]);
            for (const cardId of creatorIds) {
                if (typeof cardId !== 'string') continue;
                if (!tokensByCard.has(cardId)) tokensByCard.set(cardId, []);
                if (!tokensByCard.get(cardId).includes(tokenId)) tokensByCard.get(cardId).push(tokenId);
            }
        }
        setupSetFilters();
        setupColorFilters();
        opt('type', cards.filter(c => !isToken(c)).map(c => c.type));
        $('countHeader').textContent = `${cards.filter(c => !isToken(c)).length} deck cards loaded`;
        let saved = null;
        try {
            saved = JSON.parse(localStorage.getItem('gundamDeckMock') || 'null');
        }
        catch (e) {
            console.warn('Legacy deck save unreadable', e);
        }
        if (saved) {
            deck = saved.cards || {};
            $('deckName').value = saved.name || 'My Gundam Deck';
            const savedDecks = getSavedDecks();
            if (!savedDecks.some(d => d.legacyImported)) {
                const imported = { id: newDeckId(), name: saved.name || 'My Gundam Deck', cards: { ...saved.cards }, updated: Date.now(), legacyImported: true };
                savedDecks.push(imported);
                try {
                    putSavedDecks(savedDecks);
                    activeSavedDeckId = imported.id;
                }
                catch (e) {
                    console.warn('Could not migrate saved deck', e);
                }
            }
            else {
                activeSavedDeckId = savedDecks.find(d => d.legacyImported)?.id || null;
            }
        }
        restoreDraft();
        render();
        renderDeck();
        offerSavedDecksOnStartup();
    }
    catch (e) {
        $('cards').innerHTML = '<p class="empty">Could not load card data. Check the Data folder and browser console, then reload.</p>';
        console.error(e);
    }
}
start();
// Create a shareable PNG directly from the deck's existing card artwork.
let generatedDeckImageBlob = null;
const deckImageModal = $('deckImageModal');
const imageStatus = message => { $('deckImageStatus').textContent = message; };

// #endregion

// #region Deck Image Export
// ============================================================================
// DECK IMAGE EXPORT
// ============================================================================
function setDeckImageProgress(completed, total, label = 'Loading card artwork…') {
    const percent = total ? Math.round(completed / total * 90) : 0;
    $('deckImageProgressLabel').textContent = label;
    $('deckImageProgressDetail').textContent = total ? `${completed} / ${total} cards loaded` : 'Preparing…';
    $('deckImageProgressFill').style.width = `${percent}%`;
    $('deckImageProgressTrack').setAttribute('aria-valuenow', String(percent));
}
const rounded = (ctx, x, y, w, h, r) => { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); };
const loadCardImage = src => new Promise((resolve, reject) => { const im = new Image(); im.onload = () => resolve(im); im.onerror = () => reject(new Error('Could not load ' + src)); im.src = src; });
function drawDeckHistogram(ctx, entries, x, y, label, key) {
    const values = Array.from({ length: 8 }, () => 0);
    for (const [id, n] of entries) {
        const c = byId.get(id);
        const raw = c?.[key];
        if (raw === null || raw === undefined || raw === '') continue;
        const v = Number(raw);
        if (Number.isInteger(v) && v >= 0 && v <= 7)
            values[v] += n;
    }
    ctx.fillStyle = '#cbd5e1';
    ctx.font = 'bold 17px Arial';
    ctx.fillText(label, x, y);
    const max = Math.max(1, ...values), base = y + 92;
    for (let i = 0; i < 8; i++) {
        const bh = 65 * values[i] / max;
        ctx.fillStyle = '#4f91e9';
        ctx.fillRect(x + i * 34, base - bh, 24, bh);
        ctx.fillStyle = '#e2e8f0';
        ctx.font = '13px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(String(i), x + i * 34 + 12, base + 18);
        if (values[i])
            ctx.fillText(String(values[i]), x + i * 34 + 12, base - bh - 7);
    }
    ctx.textAlign = 'left';
}
async function generateDeckImage(onProgress = () => {}, sourceDeck = deck, sourceName = null) {
    const typeOrder = { Unit: 0, Pilot: 1, Command: 2, Base: 3 };
    const numericValue = value => value === null || value === undefined || value === '' ? Infinity : (Number.isFinite(Number(value)) ? Number(value) : Infinity);
    const entries = Object.entries(sourceDeck)
        .filter(([id, n]) => n > 0 && byId.has(id) && !isToken(byId.get(id)))
        .sort(([a], [b]) => {
            const cardA = byId.get(a), cardB = byId.get(b);
            return (typeOrder[cardA.type] ?? 99) - (typeOrder[cardB.type] ?? 99)
                || numericValue(cardA.level) - numericValue(cardB.level)
                || numericValue(cardA.cost) - numericValue(cardB.cost)
                || a.localeCompare(b, undefined, { numeric: true });
        });
    if (!entries.length)
        throw new Error('Add some cards to your deck first.');
    const columns = 5, cardW = 178, cardH = 249, gap = 14, side = 28, top = 355, bottom = 72;
    const rows = Math.ceil(entries.length / columns);
    const width = side * 2 + columns * cardW + (columns - 1) * gap;
    const height = top + rows * (cardH + gap) + bottom;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#0d111b';
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = '#182235';
    ctx.fillRect(0, 0, width, 335);
    const name = (sourceName ?? $('deckName').value ?? 'My Gundam Deck').trim();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 38px Arial';
    ctx.fillText(name.slice(0, 48), side, 57);
    const count = entries.reduce((n, [, q]) => n + q, 0);
    ctx.font = '20px Arial';
    ctx.fillStyle = '#a9bad3';
    ctx.fillText(`${count} cards  •  ${entries.length} unique`, side, 92);
    // Card-type totals (copies, not unique card names).
    const typeCounts = { Unit: 0, Pilot: 0, Command: 0, Base: 0 };
    for (const [id, quantity] of entries) {
        const type = byId.get(id)?.type;
        if (Object.hasOwn(typeCounts, type)) typeCounts[type] += quantity;
    }
    Object.entries(typeCounts).forEach(([type, quantity], index) => {
        const x = side + index * 116;
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 25px Arial';
        ctx.fillText(String(quantity), x, 135);
        ctx.fillStyle = '#a9bad3';
        ctx.font = 'bold 12px Arial';
        ctx.fillText(type.toUpperCase() + 'S', x, 153);
    });
    // Include all card types in the cost and level averages, weighted by copies.
    const deckAverage = key => {
        let sum = 0, quantity = 0;
        for (const [id, copies] of entries) {
            const card = byId.get(id);
            const value = Number(card?.[key]);
            if (card && card[key] !== '' && card[key] != null && Number.isFinite(value)) {
                sum += value * copies;
                quantity += copies;
            }
        }
        return quantity ? (sum / quantity).toFixed(1) : '—';
    };
    drawDeckHistogram(ctx, entries, side, 190, `Levels (avg ${deckAverage('level')})`, 'level');
    drawDeckHistogram(ctx, entries, side + 310, 190, `Costs (avg ${deckAverage('cost')})`, 'cost');
    // Colour distribution is weighted by card copies, not unique card IDs.
    // Multicolour cards split their contribution equally between their colours.
    const colourPalette = { Blue: '#2979dc', Green: '#2fa66b', Red: '#d44858', Purple: '#9257ce', White: '#e6eaf0' };
    const colourCounts = new Map();
    for (const [id, quantity] of entries) {
        const card = byId.get(id);
        const names = [...new Set(String(card?.color || '').split(/[\\/,+&]/).map(v => v.trim()).filter(Boolean).map(v => v.charAt(0).toUpperCase() + v.slice(1).toLowerCase()))]
            .filter(v => Object.hasOwn(colourPalette, v));
        if (!names.length)
            continue;
        for (const name of names)
            colourCounts.set(name, (colourCounts.get(name) || 0) + quantity / names.length);
    }
    const portions = [...colourCounts.entries()].sort((a, b) => b[1] - a[1]);
    const colourTotal = portions.reduce((sum, [, n]) => sum + n, 0);
    if (colourTotal > 0) {
        const cx = width - 112, cy = 142, r = 67;
        let angle = -Math.PI / 2;
        for (const [name, n] of portions) {
            const endAngle = angle + (n / colourTotal) * Math.PI * 2;
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.arc(cx, cy, r, angle, endAngle);
            ctx.closePath();
            ctx.fillStyle = colourPalette[name];
            ctx.fill();
            angle = endAngle;
        }
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.strokeStyle = '#c9d3e3';
        ctx.lineWidth = 3;
        ctx.stroke();
        // Colour-keyed legend: each percentage has a matching swatch, avoiding ambiguity.
        ctx.font = 'bold 14px Arial';
        ctx.textAlign = 'left';
        const legendY = cy + r + 17;
        portions.forEach(([name, n], index) => {
            const label = `${name} ${Math.round(n / colourTotal * 100)}%`;
            const y = legendY + index * 21;
            const textWidth = ctx.measureText(label).width;
            const x = cx - (textWidth + 24) / 2;
            ctx.fillStyle = colourPalette[name];
            rounded(ctx, x, y - 11, 13, 13, 3);
            ctx.fill();
            ctx.strokeStyle = '#8492a7';
            ctx.lineWidth = 1;
            ctx.stroke();
            ctx.fillStyle = '#e9eef7';
            ctx.fillText(label, x + 21, y);
        });
    }
    const missing = [];
    let completed = 0;
    onProgress(completed, entries.length);
    const loaded = await Promise.all(entries.map(async ([id]) => {
        const c = byId.get(id);
        let artwork = null;
        try {
            artwork = await loadCardImage(img(c));
        } catch (e) {
            missing.push(id);
        } finally {
            completed++;
            onProgress(completed, entries.length);
        }
        return artwork;
    }));
    entries.forEach(([id, n], i) => {
        const x = side + (i % columns) * (cardW + gap), y = top + Math.floor(i / columns) * (cardH + gap);
        ctx.fillStyle = '#24334a';
        rounded(ctx, x, y, cardW, cardH, 7);
        ctx.fill();
        const art = loaded[i];
        if (art)
            ctx.drawImage(art, x, y, cardW, cardH);
        else {
            ctx.fillStyle = '#e4eaf4';
            ctx.font = 'bold 14px Arial';
            ctx.fillText(id, x + 12, y + cardH / 2);
        }
        const tagW = 65, tagH = 42, tx = x + (cardW - tagW) / 2, ty = y + cardH - tagH - 12;
        ctx.fillStyle = 'rgba(6,10,17,.90)';
        rounded(ctx, tx, ty, tagW, tagH, 9);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 28px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(`×${n}`, x + cardW / 2, ty + 30);
        ctx.textAlign = 'left';
    });
    ctx.fillStyle = '#9fb0ca';
    ctx.font = '15px Arial';
    ctx.fillText('masayatodoroki.com/DeckBuilder', side, height - 28);
    onProgress(entries.length, entries.length, true);
    return { blob: await new Promise((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('PNG generation failed')), 'image/png')), missing };
}
$('createDeckImage').onclick = async () => {
    generatedDeckImageBlob = null;
    $('deckImagePreview').removeAttribute('src');
    $('deckImageLoading').hidden = false;
    setDeckImageProgress(0, 0, 'Preparing deck image…');
    $('saveDeckImage').disabled = true;
    $('copyDeckImage').disabled = true;
    deckImageModal.classList.add('open');
    imageStatus('Generating image…');
    // Allow the modal and loading bar to paint before beginning the work.
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    try {
        const result = await generateDeckImage((completed, total, encoding) => {
            if (encoding) {
                $('deckImageProgressLabel').textContent = 'Creating PNG…';
                $('deckImageProgressDetail').textContent = 'Finishing image export';
                $('deckImageProgressFill').style.width = '95%';
                $('deckImageProgressTrack').setAttribute('aria-valuenow', '95');
            } else {
                setDeckImageProgress(completed, total);
            }
        });
        generatedDeckImageBlob = result.blob;
        $('deckImagePreview').src = URL.createObjectURL(result.blob);
        $('deckImageLoading').hidden = true;
        $('saveDeckImage').disabled = false;
        $('copyDeckImage').disabled = false;
        imageStatus(result.missing.length ? `Image ready, but artwork could not be loaded for: ${result.missing.join(', ')}` : 'Image ready — save it or copy it to your clipboard.');
    }
    catch (e) {
        $('deckImageLoading').hidden = true;
        imageStatus(e.message);
        console.error(e);
    }
};
// Tournament previews use the same renderer without modifying the active deck.
async function previewTournamentDeckImage(sourceDeck, sourceName) {
    generatedDeckImageBlob = null;
    $('deckImagePreview').removeAttribute('src');
    $('deckImageLoading').hidden = false;
    setDeckImageProgress(0, 0, 'Preparing deck image…');
    $('saveDeckImage').disabled = true;
    $('copyDeckImage').disabled = true;
    deckImageModal.classList.add('open');
    imageStatus('Generating image…');
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    try {
        const result = await generateDeckImage((completed, total, encoding) => {
            if (encoding) {
                $('deckImageProgressLabel').textContent = 'Creating PNG…';
                $('deckImageProgressDetail').textContent = 'Finishing image export';
                $('deckImageProgressFill').style.width = '95%';
                $('deckImageProgressTrack').setAttribute('aria-valuenow', '95');
            } else setDeckImageProgress(completed, total);
        }, sourceDeck, sourceName);
        generatedDeckImageBlob = result.blob;
        $('deckImagePreview').src = URL.createObjectURL(result.blob);
        $('deckImageLoading').hidden = true;
        $('saveDeckImage').disabled = false;
        $('copyDeckImage').disabled = false;
        imageStatus(result.missing.length ? `Image ready; missing artwork: ${result.missing.join(', ')}` : 'Image ready — save or copy if you like.');
    } catch (e) {
        $('deckImageLoading').hidden = true;
        imageStatus(e.message);
        console.error(e);
    }
}
$('closeDeckImage').onclick = () => { deckImageModal.classList.remove('open'); };
deckImageModal.addEventListener('click', e => { if (e.target === deckImageModal)
    deckImageModal.classList.remove('open'); });
$('saveDeckImage').onclick = () => {
    if (!generatedDeckImageBlob)
        return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(generatedDeckImageBlob);
    a.download = ($('deckName').value || 'Gundam Deck').trim().replace(/[^\w -]/g, '').replace(/\s+/g, '_') + '.png';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
};
$('copyDeckImage').onclick = async () => {
    if (!generatedDeckImageBlob)
        return;
    try {
        if (!navigator.clipboard?.write || !window.ClipboardItem)
            throw new Error('Image clipboard requires HTTPS or localhost and a supported browser.');
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': generatedDeckImageBlob })]);
        imageStatus('Image copied to clipboard.');
    }
    catch (e) {
        imageStatus('Could not copy image: ' + e.message + ' You can use Save Image instead.');
    }
};
document.addEventListener('keydown', e => { if (e.key === 'Escape' && deckImageModal.classList.contains('open'))
    deckImageModal.classList.remove('open'); });



// =============================================================
// MOBILE DECK DRAWER — handle-only drag/flick and snap positions.
// Scrolling within the card list never moves the drawer.
// =============================================================
(() => {
    const sidebar = document.getElementById('browserDeckSidebar');
    const handle = document.getElementById('mobileDeckHandle');
    const count = document.getElementById('mobileDeckCount');
    const narrow = window.matchMedia('(max-width: 850px)'); // mobile-only inspector sizing
    const minHeight = 54;
    const flickVelocity = 0.45; // px per ms
    let dragging = false;
    let moved = false;
    let pointerStartY = 0;
    let heightStart = minHeight;
    let samples = [];
    const maxHeight = () => Math.max(minHeight, window.visualViewport?.height || window.innerHeight);
    const clamp = h => Math.max(minHeight, Math.min(maxHeight(), h));

    function setHeight(height, animate = true) {
        const next = clamp(height);
        sidebar.classList.toggle('mobile-deck-collapsed', next <= minHeight + 1);
        sidebar.classList.toggle('mobile-deck-dragging', !animate);
        sidebar.style.setProperty('--mobile-deck-height', next + 'px');
        handle.setAttribute('aria-expanded', String(next > minHeight + 1));
    }
    function currentHeight() {
        return sidebar.classList.contains('mobile-deck-collapsed')
            ? minHeight : sidebar.getBoundingClientRect().height;
    }
    function record(y) {
        const now = performance.now();
        samples.push({ y, time: now });
        samples = samples.filter(sample => now - sample.time <= 120);
    }
    handle.addEventListener('pointerdown', event => {
        if (event.button !== 0 || event.target.closest('button')) return;
        dragging = true;
        moved = false;
        pointerStartY = event.clientY;
        heightStart = currentHeight();
        samples = [];
        record(event.clientY);
        sidebar.classList.add('mobile-deck-dragging');
        handle.setPointerCapture(event.pointerId);
        event.preventDefault();
    });
    handle.addEventListener('pointermove', event => {
        if (!dragging) return;
        record(event.clientY);
        const delta = pointerStartY - event.clientY;
        if (Math.abs(delta) > 5) moved = true;
        if (moved) setHeight(heightStart + delta, false);
    });
    function endDrag(event, cancelled = false) {
        if (!dragging) return;
        if (!cancelled) record(event.clientY);
        dragging = false;
        sidebar.classList.remove('mobile-deck-dragging');
        if (!moved || cancelled) {
            setHeight(cancelled ? currentHeight() : currentHeight() > minHeight + 1 ? minHeight : maxHeight());
            return;
        }
        const first = samples[0], last = samples[samples.length - 1];
        const elapsed = Math.max(1, last.time - first.time);
        const velocity = (first.y - last.y) / elapsed;
        if (Math.abs(velocity) >= flickVelocity) {
            setHeight(velocity > 0 ? maxHeight() : minHeight);
        } else {
            // Slow drags stay at the released height instead of snapping.
            setHeight(currentHeight());
        }
    }
    handle.addEventListener('pointerup', event => endDrag(event));
    handle.addEventListener('pointercancel', event => endDrag(event, true));
    handle.addEventListener('keydown', event => {
        if (!['Enter', ' '].includes(event.key)) return;
        event.preventDefault();
        setHeight(currentHeight() > minHeight + 1 ? minHeight : maxHeight());
    });
    document.getElementById('deckDrawerMinimise').addEventListener('click', () => setHeight(minHeight));
    document.getElementById('deckDrawerMaximise').addEventListener('click', () => setHeight(maxHeight()));
    const total = document.getElementById('total');
    if (total && count) {
        const syncCount = () => { count.textContent = '· ' + total.textContent; };
        new MutationObserver(syncCount).observe(total, { childList: true, characterData: true, subtree: true });
        syncCount();
    }
    const syncInspectorSpace = () => {
        document.documentElement.style.setProperty('--inspector-drawer-height',
            sidebar.getBoundingClientRect().height + 'px');
    };
    new ResizeObserver(syncInspectorSpace).observe(sidebar);
    window.addEventListener('resize', () => {
        setHeight(currentHeight());
        syncInspectorSpace();
    });
    narrow.addEventListener('change', syncInspectorSpace);
    setHeight(minHeight);
    syncInspectorSpace();
})();

// v1.0.17: number of columns, independent for gallery and drawer.
(() => {
  const mobile = window.matchMedia('(max-width: 600px)');
  const configs = [
    {id:'browserCardSize', property:'--browser-columns', key:'gcg_browser_columns', desktop:6, phone:3, min:2, max:12},
    {id:'drawerCardSize', property:'--drawer-columns', key:'gcg_drawer_columns', desktop:7, phone:3, min:2, max:12}
  ];
  for (const config of configs) {
    const slider = document.getElementById(config.id);
    if (!slider) continue;
    const storageKey = config.key + (mobile.matches ? '_mobile' : '_desktop');
    let initial = mobile.matches ? config.phone : config.desktop;
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored !== null) {
        const number = Number(stored);
        if (Number.isInteger(number) && number >= config.min && number <= config.max) initial = number;
      }
    } catch (_) {}
    const update = value => {
      const sliderPosition = Math.max(config.min,Math.min(config.max,Math.round(Number(value) || config.min)));
      const columns = config.min + config.max - sliderPosition;
      document.documentElement.style.setProperty(config.property,String(columns));
      slider.value = String(config.min + config.max - columns);
      slider.style.setProperty('--scale-progress', ((Number(slider.value)-config.min)/(config.max-config.min)*100)+'%');
      slider.setAttribute('aria-valuetext', columns + ' cards per row');
      try { localStorage.setItem(storageKey,String(columns)); } catch (_) {}
    };
    slider.addEventListener('input', () => update(slider.value));
    document.querySelectorAll('.scale-step[data-slider="'+config.id+'"]').forEach(button => {
      button.addEventListener('click', () => {
        const next = Math.max(config.min, Math.min(config.max, Number(slider.value) + Number(button.dataset.step)));
        update(next);
      });
    });
    update(config.min + config.max - initial);
  }
})();


// #endregion
  