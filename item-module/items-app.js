/* ============================================================
   NED AMS — Items module application
   ============================================================ */

(function () {
  'use strict';

  const state = {
    selectedId: null,
    activeTab: 'distribution', // distribution | info | activity
    filter: 'all',
    search: '',
    expandedNodes: new Set(),
    locateOpen: false,
  };

  // ---------- icons ----------
  const ICONS = {
    box: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><path d="M3.3 7L12 12l8.7-5M12 22V12"/></svg>`,
    chevron: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>`,
    pin: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-7-6.5-7-12a7 7 0 1114 0c0 5.5-7 12-7 12z"/><circle cx="12" cy="9" r="2.5"/></svg>`,
    building: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="2" width="16" height="20" rx="1"/><path d="M9 6h6M9 10h6M9 14h6M9 18h2"/></svg>`,
    shelf: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6" width="18" height="4"/><rect x="3" y="14" width="18" height="4"/></svg>`,
    door: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 22V4a2 2 0 012-2h12a2 2 0 012 2v18"/><path d="M2 22h20M16 11v2"/></svg>`,
    person: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 22c0-4.4 3.6-8 8-8s8 3.6 8 8"/></svg>`,
    wrench: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a4 4 0 015.4 5.4l-9.4 9.4-3.4 1.2 1.2-3.4 9.4-9.4-3.2-3.2"/></svg>`,
    arrow: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>`,
    in: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12l7 7 7-7"/></svg>`,
    out: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>`,
    move: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8l4-4 4 4M7 4v12M21 16l-4 4-4-4M17 20V8"/></svg>`,
    search: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>`,
    close: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>`,
    qr: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3M21 14v7M14 21h3"/></svg>`,
    print: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><path d="M6 14h12v8H6z"/></svg>`,
    edit: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9M16.5 3.5a2.121 2.121 0 113 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>`,
    paper: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/></svg>`,
    flask: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 2v6L4 20a2 2 0 002 2h12a2 2 0 002-2L15 8V2"/><path d="M8 2h8M7 14h10"/></svg>`,
  };

  function trackingIcon(t) {
    if (t === 'individual') return ICONS.box;
    if (t === 'perishable') return ICONS.flask;
    return ICONS.paper;
  }
  function trackingLabel(t) {
    if (t === 'individual') return 'Individual tracking';
    if (t === 'perishable') return 'Perishable batches';
    return 'Quantity tracking';
  }
  function locKindIcon(kind) {
    switch (kind) {
      case 'standalone': return ICONS.building;
      case 'sub-store': return ICONS.shelf;
      case 'sub-location': return ICONS.building;
      case 'leaf-room': return ICONS.door;
      case 'persons': return ICONS.person;
      case 'repair': return ICONS.wrench;
      default: return ICONS.pin;
    }
  }

  // ---------- list rendering ----------
  function renderList() {
    const body = document.getElementById('il-body');
    const q = state.search.toLowerCase().trim();
    const filtered = window.ITEMS.filter(it => {
      if (state.filter === 'quantity' && it.tracking !== 'quantity') return false;
      if (state.filter === 'individual' && it.tracking !== 'individual') return false;
      if (state.filter === 'perishable' && it.tracking !== 'perishable') return false;
      if (state.filter === 'low' && !it.isLow) return false;
      if (state.filter === 'expiring' && !(it.batches || []).some(b => b.status === 'expiring')) return false;
      if (q) {
        const hay = (it.name + ' ' + it.code + ' ' + (it.category || '')).toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    if (!filtered.length) {
      body.innerHTML = `<div class="il-empty">No items match your filter.</div>`;
      return;
    }

    body.innerHTML = filtered.map(it => {
      const sel = it.id === state.selectedId ? 'true' : 'false';
      const lowBadge = it.isLow ? `<span class="il-row-warn low">LOW</span>` : '';
      const expBadge = (it.batches || []).some(b => b.status === 'expiring') ? `<span class="il-row-warn expiring">EXP</span>` : '';
      return `
        <div class="il-row" data-tracking="${it.tracking}" data-selected="${sel}" data-id="${it.id}">
          <div class="il-row-icon">${trackingIcon(it.tracking)}</div>
          <div class="il-row-main">
            <div class="il-row-name">${it.name}</div>
            <div class="il-row-sub">
              <span class="doc">${it.code}</span>
              <span class="dot">·</span>
              <span class="cat">${it.category || ''}</span>
              <span class="dot">·</span>
              <span>${it.locationCount} locations</span>
            </div>
          </div>
          <div class="il-row-right">
            <div class="il-row-qty">${it.totalQty.toLocaleString()}<span class="unit">${it.unit || ''}</span></div>
            <div style="display:flex;gap:4px">${lowBadge}${expBadge}</div>
          </div>
        </div>`;
    }).join('');

    body.querySelectorAll('.il-row').forEach(r => {
      r.addEventListener('click', () => selectItem(r.dataset.id));
    });
  }

  function selectItem(id) {
    state.selectedId = id;
    state.activeTab = 'distribution';
    state.expandedNodes = new Set();
    document.querySelectorAll('.il-row').forEach(r => {
      r.dataset.selected = r.dataset.id === id ? 'true' : 'false';
    });
    document.getElementById('items-shell').dataset.mobileDetail = 'true';
    renderDetail();
  }

  // ---------- detail rendering ----------
  function renderDetail() {
    const detail = document.getElementById('items-detail');
    const it = window.ITEMS.find(x => x.id === state.selectedId);
    if (!it) {
      detail.dataset.empty = 'true';
      detail.innerHTML = `
        <div class="id-empty">
          <div class="id-empty-art">${ICONS.box}</div>
          <h3>Select an item</h3>
          <p>Pick an item from the list to see its full distribution across departments, sub-stores, persons and batches — all on one page.</p>
        </div>`;
      return;
    }
    detail.dataset.empty = 'false';

    // tab counts
    const distCount = (it.locations || []).length;
    const instCount = it.tracking === 'individual' ? (it.totalQty || 0) : null;
    const batCount = it.tracking === 'perishable' ? (it.batches || []).length : null;

    // totals
    const totalsHtml = (() => {
      if (it.tracking === 'individual') {
        return `
          <div class="tot"><div class="tot-lbl">Total units</div><div class="tot-val">${it.totalQty}<span class="unit">${it.unit}</span></div><div class="tot-sub">across ${it.locationCount} locations</div></div>
          <div class="tot"><div class="tot-lbl">Deployed</div><div class="tot-val">${it.deployed || '—'}</div><div class="tot-sub">in active use</div></div>
          <div class="tot ${it.idle && it.idle > (it.minStock || 999) ? '' : 'warn'}"><div class="tot-lbl">Idle / Stock</div><div class="tot-val">${it.idle || 0}</div><div class="tot-sub">in stores · min ${it.minStock || '—'}</div></div>
          <div class="tot ${(it.repair || 0) > 0 ? 'warn' : ''}"><div class="tot-lbl">In repair</div><div class="tot-val">${it.repair || 0}</div><div class="tot-sub">${(it.repair || 0) > 0 ? 'awaiting service' : 'all healthy'}</div></div>`;
      }
      if (it.tracking === 'perishable') {
        const expiring = (it.batches || []).filter(b => b.status === 'expiring').reduce((s, b) => s + b.qty, 0);
        const warn = (it.batches || []).filter(b => b.status === 'warn').reduce((s, b) => s + b.qty, 0);
        return `
          <div class="tot"><div class="tot-lbl">Total stock</div><div class="tot-val">${it.totalQty}<span class="unit">${it.unit}</span></div><div class="tot-sub">across ${it.locationCount} locations</div></div>
          <div class="tot"><div class="tot-lbl">Active batches</div><div class="tot-val">${(it.batches || []).length}</div><div class="tot-sub">in stock</div></div>
          <div class="tot ${warn > 0 ? 'warn' : ''}"><div class="tot-lbl">Expiring &lt; 6mo</div><div class="tot-val">${warn}<span class="unit">${it.unit}</span></div><div class="tot-sub">${warn > 0 ? 'plan rotation' : 'none'}</div></div>
          <div class="tot ${expiring > 0 ? 'danger' : ''}"><div class="tot-lbl">Expiring &lt; 30d</div><div class="tot-val">${expiring}<span class="unit">${it.unit}</span></div><div class="tot-sub">${expiring > 0 ? 'urgent' : 'none'}</div></div>`;
      }
      // quantity
      return `
        <div class="tot"><div class="tot-lbl">Total stock</div><div class="tot-val">${it.totalQty.toLocaleString()}<span class="unit">${it.unit}</span></div><div class="tot-sub">across ${it.locationCount} locations</div></div>
        <div class="tot"><div class="tot-lbl">Min stock</div><div class="tot-val">${it.minStock}<span class="unit">${it.unit}</span></div><div class="tot-sub">re-order threshold</div></div>
        <div class="tot"><div class="tot-lbl">Last 30d out</div><div class="tot-val">240<span class="unit">${it.unit}</span></div><div class="tot-sub">average draw</div></div>
        <div class="tot"><div class="tot-lbl">Days of cover</div><div class="tot-val">~155</div><div class="tot-sub">at current draw</div></div>`;
    })();

    detail.innerHTML = `
      <div class="id-wrap">
        <button class="id-back" onclick="window.__items.clearSelection()">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
          Back to items
        </button>

        <!-- identity strip -->
        <div class="id-identity">
          <div class="id-identity-main">
            <div class="eyebrow">${it.category || 'Item'}</div>
            <h1>${it.name}</h1>
            <div class="id-id-row">
              <span class="doc-no">${it.code}</span>
              <span class="id-tracking-pill" data-t="${it.tracking}"><span class="dot"></span>${trackingLabel(it.tracking)}</span>
              <span class="id-meta">
                <span>Last movement <strong>${it.lastMovement || '—'}</strong></span>
                <span class="dot-sep">·</span>
                <span>${it.mfg || '—'}</span>
              </span>
            </div>
          </div>
          <div class="id-actions">
            <button class="btn btn-ghost btn-sm">${ICONS.qr} QR labels</button>
            <button class="btn btn-ghost btn-sm">${ICONS.print} Print card</button>
            <button class="btn btn-sm">${ICONS.edit} Edit item</button>
            <button class="btn btn-primary btn-sm">${ICONS.arrow} New entry</button>
          </div>
        </div>

        <!-- totals -->
        <div class="id-totals">${totalsHtml}</div>

        <!-- tabs -->
        <div class="id-tabs">
          <button class="id-tab" data-tab="distribution" data-active="${state.activeTab === 'distribution'}">Distribution <span class="tab-count">${distCount}</span></button>
          ${it.tracking === 'individual' ? `<button class="id-tab" data-tab="instances" data-active="${state.activeTab === 'instances'}">Instances <span class="tab-count">${instCount}</span></button>` : ''}
          ${it.tracking === 'perishable' ? `<button class="id-tab" data-tab="batches" data-active="${state.activeTab === 'batches'}">Batches <span class="tab-count">${batCount}</span></button>` : ''}
          <button class="id-tab" data-tab="info" data-active="${state.activeTab === 'info'}">Item info</button>
          <button class="id-tab" data-tab="activity" data-active="${state.activeTab === 'activity'}">Activity</button>
        </div>

        <div class="id-tab-body" id="id-tab-body">
          ${renderTabBody(it)}
        </div>
      </div>
    `;

    detail.querySelectorAll('.id-tab').forEach(t => {
      t.addEventListener('click', () => {
        state.activeTab = t.dataset.tab;
        renderDetail();
      });
    });
    bindTreeHandlers();
    bindLocateHandler();
  }

  function renderTabBody(it) {
    if (state.activeTab === 'distribution') return renderDistributionTab(it);
    if (state.activeTab === 'instances') return renderInstancesTab(it);
    if (state.activeTab === 'batches') return renderBatchesTab(it);
    if (state.activeTab === 'info') return renderInfoTab(it);
    if (state.activeTab === 'activity') return renderActivityTab(it);
    return '';
  }

  // -------- distribution tab (location tree) --------
  function renderDistributionTab(it) {
    const max = Math.max(...(it.locations || []).map(l => l.qty));
    const tree = (it.locations || []).map(loc => renderTreeNode(loc, 0, max, it)).join('');
    return `
      <div class="id-locate" onclick="window.__items.openLocate()" title="Locate within this item">
        ${ICONS.search}
        <div class="id-locate-text">Locate within ${it.name.split('—')[0].trim()} — search by department, room, person, batch…</div>
        <span class="id-locate-kbd">⌘K</span>
      </div>

      <div class="loc-tree-section-head">
        <h3>Distribution by location</h3>
        <div class="meta">${it.locationCount} locations · expand to see allocations</div>
      </div>
      <div class="loc-tree-list">
        ${tree}
      </div>
    `;
  }

  function renderTreeNode(node, depth, max, item) {
    const hasChildren = (node.children && node.children.length) || (node.instances && node.instances.length) || (node.persons && node.persons.length);
    const isLeaf = !hasChildren && depth > 0;
    const open = state.expandedNodes.has(node.id);
    const pct = max > 0 ? Math.min(100, (node.qty / max) * 100) : 0;

    const subPills = [];
    if (node.deployed) subPills.push(`<span class="pill-mini deployed">${node.deployed} deployed</span>`);
    if (node.idle) subPills.push(`<span class="pill-mini">${node.idle} in stock</span>`);
    if (node.allocated) subPills.push(`<span class="pill-mini allocated">${node.allocated} allocated</span>`);
    if (node.repair) subPills.push(`<span class="pill-mini" style="background:var(--warn-weak);color:var(--warn);border-color:oklch(0.88 0.05 75)">${node.repair} repair</span>`);

    const childrenHtml = (() => {
      if (!hasChildren) return '';
      // Standard children
      if (node.children && node.children.length) {
        return node.children.map(c => renderTreeNode(c, depth + 1, max, item)).join('');
      }
      // Instances under a leaf-ish node (e.g. CS Main Store)
      if (node.instances && node.instances.length) {
        return `<div class="leaf-group">${node.instances.map(inst => `
          <div class="leaf-row">
            <span class="lr-tag">${inst.tag}</span>
            <div class="lr-mid">
              <span class="lr-name">${inst.name}</span>
              <span class="lr-status ${inst.status}">${inst.status}</span>
              <span style="color:var(--muted-2)">·</span>
              <span>${inst.meta}</span>
            </div>
            <div class="lr-right">${inst.tag}</div>
          </div>`).join('')}
        </div>`;
      }
      if (node.persons && node.persons.length) {
        return `<div class="leaf-group">${node.persons.map(p => `
          <div class="leaf-row">
            <span class="lr-tag">${p.tag}</span>
            <div class="lr-mid">
              <span class="lr-name">${p.person}</span>
              <span class="lr-status in-use">allocated</span>
              <span style="color:var(--muted-2)">·</span>
              <span>${p.meta}</span>
            </div>
            <div class="lr-right">since ${p.allocated}</div>
          </div>`).join('')}
        </div>`;
      }
      return '';
    })();

    // Inline single instance for leaf-room
    const inlineInstance = node.instance ? `
      <div class="leaf-group">
        <div class="leaf-row">
          <span class="lr-tag">${node.instance.tag}</span>
          <div class="lr-mid">
            <span class="lr-name">${node.instance.name}</span>
            <span class="lr-status ${node.instance.status}">${node.instance.status}</span>
            <span style="color:var(--muted-2)">·</span>
            <span>${node.instance.meta}</span>
          </div>
          <div class="lr-right">${node.instance.tag}</div>
        </div>
      </div>` : '';

    const reallyHasChildren = hasChildren || !!node.instance;

    return `
      <div class="tn-wrap" data-depth="${depth}" data-id="${node.id}" data-open="${open}">
        <div class="tn" data-id="${node.id}" data-leaf="${!reallyHasChildren}" data-open="${open}">
          <div class="tn-caret">${reallyHasChildren ? ICONS.chevron : ''}</div>
          <div class="tn-main">
            <div class="tn-icon">${locKindIcon(node.kind)}</div>
            <div style="min-width:0">
              <div class="tn-name">${node.name}<span class="tn-code">${node.code || ''}</span></div>
              ${subPills.length ? `<div class="tn-sub">${subPills.join('')}</div>` : ''}
            </div>
          </div>
          <div class="tn-right">
            <div class="tn-bar"><div class="tn-bar-fill" style="width:${pct}%"></div></div>
            <div class="tn-qty">${node.qty}<span class="unit">${item.unit}</span></div>
            <button class="tn-jump" data-jump="${node.id}" title="Open at this location">${ICONS.arrow}</button>
          </div>
        </div>
        <div class="tn-children">${childrenHtml || inlineInstance}</div>
      </div>
    `;
  }

  function bindTreeHandlers() {
    document.querySelectorAll('.tn').forEach(tn => {
      tn.addEventListener('click', e => {
        if (e.target.closest('.tn-jump')) return;
        if (tn.dataset.leaf === 'true') return;
        const id = tn.dataset.id;
        if (state.expandedNodes.has(id)) state.expandedNodes.delete(id);
        else state.expandedNodes.add(id);
        // toggle just this node without full re-render
        const wrap = tn.parentElement;
        const open = state.expandedNodes.has(id);
        wrap.dataset.open = open;
        tn.dataset.open = open;
      });
    });
    document.querySelectorAll('.tn-jump').forEach(b => {
      b.addEventListener('click', e => {
        e.stopPropagation();
        const id = b.dataset.jump;
        openLocationPanel(id);
      });
    });
  }

  // -------- instances tab --------
  function renderInstancesTab(it) {
    // flatten instances from locations tree
    const all = [];
    function walk(node) {
      if (node.instances) node.instances.forEach(i => all.push({ ...i, location: node.name }));
      if (node.instance) all.push({ ...node.instance, location: node.name });
      if (node.children) node.children.forEach(walk);
    }
    (it.locations || []).forEach(walk);
    // top up to total qty with placeholders
    while (all.length < (it.totalQty || 0)) {
      const i = all.length + 1;
      all.push({ tag: `${it.code.split('-').slice(-1)[0]}-${String(i).padStart(3, '0')}`, name: it.name.split('—')[0].trim(), status: 'idle', meta: 'Inventoried', location: 'Central Store · Main' });
    }

    const rows = all.slice(0, 80).map(inst => `
      <div class="inst-row">
        <div>
          <span class="inst-tag">${inst.tag}</span>
          <div class="inst-name">${inst.name}</div>
          <div class="inst-meta">${inst.location}<span class="sep">·</span>${inst.meta || ''}</div>
        </div>
        <div><span class="inst-status-pill ${inst.status}">${inst.status}</span></div>
      </div>`).join('');

    return `
      <div class="loc-tree-section-head">
        <h3>All instances</h3>
        <div class="meta">${all.length} units · individually serial-tagged</div>
      </div>
      <div class="card"><div class="card-body" style="padding:0 18px">${rows}</div></div>
    `;
  }

  // -------- batches tab --------
  function renderBatchesTab(it) {
    const rows = (it.batches || []).map(b => {
      const cls = b.status === 'expiring' ? 'expiring' : b.status === 'warn' ? 'warn' : '';
      return `
        <div class="batch-row">
          <div>
            <div class="batch-num">${b.batch}</div>
            <div class="batch-meta">${b.location}<span style="color:var(--muted-2)"> · </span>Mfg ${b.mfgDate}</div>
          </div>
          <div class="batch-qty">${b.qty}<span class="unit">${it.unit}</span></div>
          <div class="batch-expiry ${cls}">Exp ${b.expiry}</div>
        </div>`;
    }).join('');

    return `
      <div class="loc-tree-section-head">
        <h3>Active batches</h3>
        <div class="meta">${(it.batches || []).length} batches · sorted by expiry</div>
      </div>
      <div class="card"><div class="card-body" style="padding:4px 18px">${rows}</div></div>
    `;
  }

  // -------- info tab --------
  function renderInfoTab(it) {
    return `
      <div class="id-info" style="grid-template-columns:1fr 1fr">
        <div class="card">
          <div class="card-head"><h3>Master data</h3></div>
          <div class="card-pad">
            <div class="id-info-kv">
              <div><div class="k">Item code</div><div class="v mono">${it.code}</div></div>
              <div><div class="k">Item ID</div><div class="v mono">${it.id}</div></div>
              <div><div class="k">Category</div><div class="v">${it.category}</div></div>
              <div><div class="k">Tracking</div><div class="v">${trackingLabel(it.tracking)}</div></div>
              <div><div class="k">Unit</div><div class="v">${it.unit}</div></div>
              <div><div class="k">Min stock</div><div class="v">${it.minStock || '—'}</div></div>
              <div><div class="k">Manufacturer</div><div class="v">${it.mfg || '—'}</div></div>
              <div><div class="k">Unit price</div><div class="v">${it.price || '—'}</div></div>
            </div>
          </div>
        </div>
        <div class="card">
          <div class="card-head"><h3>Specifications</h3></div>
          <div class="card-pad">
            <p style="margin:0 0 12px 0;font-size:13px;color:var(--ink-2);line-height:1.6">${it.description || '—'}</p>
            ${it.spec ? `<div style="font-size:12px;color:var(--muted);font-family:var(--font-mono);background:var(--surface);padding:10px 12px;border-radius:var(--radius);border:1px solid var(--hairline)">${it.spec}</div>` : ''}
          </div>
        </div>
      </div>
    `;
  }

  // -------- activity tab --------
  function renderActivityTab(it) {
    const rows = (it.activity || []).map(a => `
      <div class="act-row">
        <div class="act-icon ${a.kind}">${ICONS[a.kind]}</div>
        <div class="act-text">${a.text}</div>
        <div class="act-meta">${a.meta}</div>
      </div>`).join('');
    return `
      <div class="loc-tree-section-head">
        <h3>Recent activity</h3>
        <div class="meta">last 30 days</div>
      </div>
      <div class="card"><div class="card-body" style="padding:4px 18px">${rows}</div></div>
    `;
  }

  // ---------- slide panel ----------
  function openLocationPanel(locId) {
    const it = window.ITEMS.find(x => x.id === state.selectedId);
    if (!it) return;
    let found = null;
    function walk(nodes) {
      for (const n of nodes) {
        if (n.id === locId) { found = n; return; }
        if (n.children) walk(n.children);
      }
    }
    walk(it.locations || []);
    if (!found) return;

    const panel = document.getElementById('slide-panel');
    const allInstances = collectInstances(found);
    const sections = [];

    if (allInstances.length) {
      sections.push(`
        <div class="sp-section">
          <div class="sp-section-h">Instances at this location · ${allInstances.length}</div>
          <div class="inst-list">
            ${allInstances.map(inst => `
              <div class="inst-row">
                <div>
                  <span class="inst-tag">${inst.tag}</span>
                  <div class="inst-name">${inst.name}</div>
                  <div class="inst-meta">${inst.location || found.name}<span class="sep">·</span>${inst.meta || ''}</div>
                </div>
                <div><span class="inst-status-pill ${inst.status}">${inst.status}</span></div>
              </div>`).join('')}
          </div>
        </div>`);
    }
    if (found.children && found.children.length) {
      sections.push(`
        <div class="sp-section">
          <div class="sp-section-h">Sub-locations · ${found.children.length}</div>
          <div class="loc-tree-list">
            ${found.children.map(c => {
              const pills = [];
              if (c.deployed) pills.push(`<span class="pill-mini deployed">${c.deployed} deployed</span>`);
              if (c.idle) pills.push(`<span class="pill-mini">${c.idle} in stock</span>`);
              return `
                <div class="tn" style="cursor:pointer" data-leaf="false">
                  <div class="tn-caret"></div>
                  <div class="tn-main">
                    <div class="tn-icon">${locKindIcon(c.kind)}</div>
                    <div><div class="tn-name">${c.name}<span class="tn-code">${c.code || ''}</span></div>${pills.length ? `<div class="tn-sub">${pills.join('')}</div>` : ''}</div>
                  </div>
                  <div class="tn-right"><div class="tn-qty">${c.qty}<span class="unit">${it.unit}</span></div></div>
                </div>`;
            }).join('')}
          </div>
        </div>`);
    }

    panel.innerHTML = `
      <div class="sp-head">
        <div>
          <div class="eyebrow">Location · ${found.kind || ''}</div>
          <h2 class="sp-title">${found.name}</h2>
          <div class="sp-sub">${found.code || ''} · ${found.qty} ${it.unit} of ${it.name.split('—')[0].trim()}</div>
        </div>
        <button class="sp-close" onclick="window.__items.closePanel()" aria-label="Close">${ICONS.close}</button>
      </div>
      <div class="sp-body">
        ${sections.join('') || `<div style="text-align:center;padding:60px 0;color:var(--muted);font-size:13px">No deeper detail available for this location.</div>`}
        <div style="margin-top:24px;display:flex;gap:8px">
          <button class="btn btn-sm">${ICONS.qr} Print location QR</button>
          <button class="btn btn-sm">${ICONS.arrow} New entry from here</button>
        </div>
      </div>
    `;
    document.getElementById('panel-backdrop').dataset.open = 'true';
    panel.dataset.open = 'true';
    panel.setAttribute('aria-hidden', 'false');
  }

  function collectInstances(node) {
    const out = [];
    if (node.instance) out.push({ ...node.instance, location: node.name });
    if (node.instances) node.instances.forEach(i => out.push({ ...i, location: node.name }));
    if (node.persons) node.persons.forEach(p => out.push({ tag: p.tag, name: p.person, status: 'in-use', meta: p.meta, location: 'Allocated · ' + p.person }));
    if (node.children) node.children.forEach(c => collectInstances(c).forEach(i => out.push(i)));
    return out;
  }

  function closePanel() {
    document.getElementById('panel-backdrop').dataset.open = 'false';
    const p = document.getElementById('slide-panel');
    p.dataset.open = 'false';
    p.setAttribute('aria-hidden', 'true');
  }

  // ---------- locate palette ----------
  function bindLocateHandler() { /* nothing extra; bound in setup */ }

  function openLocate() {
    const it = window.ITEMS.find(x => x.id === state.selectedId);
    if (!it) return;
    state.locateOpen = true;
    renderLocate(it, '');
    document.getElementById('locate-backdrop').dataset.open = 'true';
    document.getElementById('locate-panel').dataset.open = 'true';
    setTimeout(() => {
      const i = document.getElementById('locate-input');
      if (i) i.focus();
    }, 80);
  }
  function closeLocate() {
    state.locateOpen = false;
    document.getElementById('locate-backdrop').dataset.open = 'false';
    document.getElementById('locate-panel').dataset.open = 'false';
  }

  function flattenForLocate(it) {
    const out = [];
    function walk(node, path) {
      const fullPath = path ? `${path} › ${node.name}` : node.name;
      out.push({ kind: 'location', id: node.id, name: node.name, code: node.code || '', path: fullPath, qty: node.qty });
      if (node.instance) out.push({ kind: 'instance', tag: node.instance.tag, name: node.instance.name, path: fullPath, status: node.instance.status });
      if (node.instances) node.instances.forEach(i => out.push({ kind: 'instance', tag: i.tag, name: i.name, path: fullPath, status: i.status }));
      if (node.persons) node.persons.forEach(p => out.push({ kind: 'person', name: p.person, tag: p.tag, path: fullPath }));
      if (node.children) node.children.forEach(c => walk(c, fullPath));
    }
    (it.locations || []).forEach(n => walk(n, ''));
    if (it.batches) it.batches.forEach(b => out.push({ kind: 'batch', name: b.batch, path: b.location, qty: b.qty, status: b.status, expiry: b.expiry }));
    return out;
  }

  function renderLocate(it, query) {
    const all = flattenForLocate(it);
    const q = query.toLowerCase().trim();
    const filtered = q ? all.filter(r => (r.name + ' ' + (r.path || '') + ' ' + (r.tag || '') + ' ' + (r.code || '')).toLowerCase().includes(q)) : all;
    const groups = { location: [], instance: [], person: [], batch: [] };
    filtered.forEach(r => groups[r.kind].push(r));

    const sections = [];
    if (groups.location.length) sections.push(`
      <div class="lp-section-h">Locations · ${groups.location.length}</div>
      ${groups.location.slice(0, 10).map(r => `
        <div class="lp-row" data-kind="location" data-id="${r.id}">
          <div class="lp-icon">${ICONS.pin}</div>
          <div><div class="lp-name">${r.name}</div><div class="lp-path">${r.code} · ${r.path}</div></div>
          <div class="lp-qty">${r.qty} ${it.unit}</div>
        </div>`).join('')}
    `);
    if (groups.instance.length) sections.push(`
      <div class="lp-section-h">Instances · ${groups.instance.length}</div>
      ${groups.instance.slice(0, 10).map(r => `
        <div class="lp-row">
          <div class="lp-icon">${ICONS.box}</div>
          <div><div class="lp-name">${r.tag} — ${r.name}</div><div class="lp-path">${r.path}</div></div>
          <div class="lp-qty">${r.status}</div>
        </div>`).join('')}
    `);
    if (groups.person.length) sections.push(`
      <div class="lp-section-h">Allocated to persons · ${groups.person.length}</div>
      ${groups.person.slice(0, 10).map(r => `
        <div class="lp-row">
          <div class="lp-icon">${ICONS.person}</div>
          <div><div class="lp-name">${r.name}</div><div class="lp-path">${r.tag} · ${r.path}</div></div>
          <div class="lp-qty">allocated</div>
        </div>`).join('')}
    `);
    if (groups.batch.length) sections.push(`
      <div class="lp-section-h">Batches · ${groups.batch.length}</div>
      ${groups.batch.slice(0, 10).map(r => `
        <div class="lp-row">
          <div class="lp-icon">${ICONS.flask}</div>
          <div><div class="lp-name">${r.name}</div><div class="lp-path">${r.path} · Exp ${r.expiry}</div></div>
          <div class="lp-qty">${r.qty} ${it.unit}</div>
        </div>`).join('')}
    `);

    document.getElementById('locate-panel').innerHTML = `
      <div class="lp-search">
        ${ICONS.search}
        <input id="locate-input" placeholder="Find a location, instance, person or batch within ${it.name.split('—')[0].trim()}…" value="${query}"/>
        <span class="lp-foot kbd" style="border:1px solid var(--border)">esc</span>
      </div>
      <div class="lp-results">
        ${sections.join('') || `<div style="padding:40px 0;text-align:center;color:var(--muted);font-size:13px">No matches</div>`}
      </div>
      <div class="lp-foot">
        <div class="lp-keys">
          <span><span class="kbd">↑↓</span>navigate</span>
          <span><span class="kbd">⏎</span>jump to</span>
          <span><span class="kbd">esc</span>close</span>
        </div>
        <div>${filtered.length} results</div>
      </div>
    `;
    const i = document.getElementById('locate-input');
    if (i) {
      i.addEventListener('input', e => renderLocate(it, e.target.value));
      i.addEventListener('keydown', e => { if (e.key === 'Escape') closeLocate(); });
    }
    document.querySelectorAll('.lp-row[data-kind="location"]').forEach(r => {
      r.addEventListener('click', () => {
        closeLocate();
        // expand path & open panel
        const id = r.dataset.id;
        // expand this node and ancestors
        function findPath(nodes, target, path = []) {
          for (const n of nodes) {
            if (n.id === target) return [...path, n.id];
            if (n.children) {
              const sub = findPath(n.children, target, [...path, n.id]);
              if (sub) return sub;
            }
          }
          return null;
        }
        const path = findPath(it.locations || [], id);
        if (path) path.slice(0, -1).forEach(p => state.expandedNodes.add(p));
        renderDetail();
        // scroll into view
        setTimeout(() => {
          const el = document.querySelector(`.tn[data-id="${id}"]`);
          if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
          if (el) {
            el.style.transition = 'background 1.2s';
            const orig = el.style.background;
            el.style.background = 'color-mix(in oklch, var(--primary) 22%, var(--card))';
            setTimeout(() => { el.style.background = orig; }, 1300);
          }
        }, 50);
      });
    });
  }

  // ---------- list interactions ----------
  function bindListHandlers() {
    document.querySelectorAll('.filter-pill').forEach(p => {
      p.addEventListener('click', () => {
        document.querySelectorAll('.filter-pill').forEach(x => x.dataset.active = 'false');
        p.dataset.active = 'true';
        state.filter = p.dataset.filter;
        renderList();
      });
    });
    document.getElementById('list-search').addEventListener('input', e => {
      state.search = e.target.value;
      renderList();
    });
  }

  // ---------- public API ----------
  window.__items = {
    selectItem,
    clearSelection: () => { 
      state.selectedId = null;
      document.querySelectorAll('.il-row').forEach(r => r.dataset.selected = 'false');
      document.getElementById('items-shell').dataset.mobileDetail = 'false';
      renderDetail();
    },
    closePanel,
    openLocate,
    closeLocate,
    setLayout: (l) => { document.getElementById('items-shell').dataset.layout = l; },
    setDensity: (d) => { document.getElementById('items-shell').dataset.density = d; },
    state,
  };
  // global so onclick handlers in HTML can find them
  window.closePanel = closePanel;
  window.closeLocate = closeLocate;

  // ---------- bootstrap ----------
  document.addEventListener('DOMContentLoaded', () => {
    renderList();
    renderDetail();
    bindListHandlers();
    // global keyboard
    document.addEventListener('keydown', e => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        if (state.selectedId) openLocate();
      }
      if (e.key === 'Escape') {
        if (state.locateOpen) closeLocate();
        else closePanel();
      }
      if (e.key === '/' && document.activeElement.tagName !== 'INPUT') {
        e.preventDefault();
        document.getElementById('list-search').focus();
      }
    });
    // auto-select the first item to show the detail page filled in
    selectItem('ITM-0142');
  });
})();
