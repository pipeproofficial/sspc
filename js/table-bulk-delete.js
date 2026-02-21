const BULK_TOOLBAR_CLASS = 'bulk-table-toolbar';
const BULK_ROW_CB_CLASS = 'bulk-row-checkbox';
const BULK_SELECT_ALL_CLASS = 'bulk-select-all-checkbox';
const BULK_DELETE_BTN_CLASS = 'bulk-delete-selected-btn';
const BULK_SKIP_TABLE_IDS = new Set(['invItemsTable', 'gstItemsTable']);

const tableState = new WeakMap();

function hasNativeRowSelection(table) {
    if (!table) return false;
    if (table.querySelector('thead input[type="checkbox"]')) return true;
    return !!table.querySelector('tbody input.prod-run-cb, tbody input.labour-row-cb, tbody input[type="checkbox"]');
}

function shouldSkipTable(table) {
    if (!table) return true;
    if (BULK_SKIP_TABLE_IDS.has(table.id || '')) return true;
    if (table.querySelector('#invItemsContainer')) return true;
    if (table.querySelector('#gstItemsContainer')) return true;
    return false;
}

function isDataRow(row) {
    if (!row) return false;
    const cells = row.querySelectorAll('td');
    if (!cells.length) return false;
    if (cells.length === 1 && cells[0].hasAttribute('colspan')) return false;
    return true;
}

function findDeleteControl(row) {
    if (!row) return null;
    const controls = row.querySelectorAll('button, a, [role="button"]');
    for (const control of controls) {
        if (control.classList.contains(BULK_DELETE_BTN_CLASS)) continue;
        if (control.closest(`.${BULK_TOOLBAR_CLASS}`)) continue;
        const classText = (control.className || '').toString().toLowerCase();
        const titleText = (control.getAttribute('title') || '').toLowerCase();
        const onclickText = (control.getAttribute('onclick') || '').toLowerCase();
        const text = (control.textContent || '').toLowerCase();
        const looksDelete = classText.includes('delete') || titleText.includes('delete') || onclickText.includes('delete') || text.includes('delete');
        if (!looksDelete) continue;
        if (control.disabled) continue;
        return control;
    }
    return null;
}

function ensureRowCheckbox(row) {
    if (!isDataRow(row)) return null;
    const firstCell = row.querySelector('td');
    if (!firstCell) return null;

    let cb = firstCell.querySelector(`.${BULK_ROW_CB_CLASS}`);
    if (!cb) {
        cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.className = `form-check-input me-2 ${BULK_ROW_CB_CLASS}`;
        cb.setAttribute('aria-label', 'Select row');
        firstCell.prepend(cb);
    }
    const hasDelete = !!findDeleteControl(row);
    cb.disabled = !hasDelete;
    if (!hasDelete) cb.checked = false;
    return cb;
}

function getOrCreateToolbar(table) {
    const wrap = table.closest('.table-responsive') || table.parentElement;
    if (!wrap) return null;

    let toolbar = wrap.previousElementSibling;
    if (!toolbar || !toolbar.classList.contains(BULK_TOOLBAR_CLASS)) {
        toolbar = document.createElement('div');
        toolbar.className = `${BULK_TOOLBAR_CLASS} d-flex align-items-center gap-2 mb-2`;
        toolbar.innerHTML = `
            <label class="d-inline-flex align-items-center gap-2 mb-0 small text-muted">
                <input type="checkbox" class="form-check-input ${BULK_SELECT_ALL_CLASS}">
                <span>Select All</span>
            </label>
            <button type="button" class="btn btn-sm btn-outline-danger ${BULK_DELETE_BTN_CLASS}" disabled>Delete Selected</button>
        `;
        wrap.parentElement?.insertBefore(toolbar, wrap);
    }
    return toolbar;
}

function syncTableState(table) {
    const state = tableState.get(table);
    if (!state) return;

    const rows = Array.from(table.querySelectorAll('tbody tr')).filter(isDataRow);
    const checkboxes = rows.map(ensureRowCheckbox).filter(Boolean);
    const enabled = checkboxes.filter(cb => !cb.disabled);
    const selected = enabled.filter(cb => cb.checked);

    state.selectAll.disabled = enabled.length === 0;
    state.selectAll.checked = enabled.length > 0 && selected.length === enabled.length;
    state.selectAll.indeterminate = selected.length > 0 && selected.length < enabled.length;

    state.deleteBtn.disabled = selected.length === 0;
    state.deleteBtn.textContent = selected.length ? `Delete Selected (${selected.length})` : 'Delete Selected';
    state.toolbar.classList.toggle('d-none', enabled.length === 0);
}

async function deleteSelectedRows(table) {
    const state = tableState.get(table);
    if (!state) return;

    const selectedRows = Array.from(table.querySelectorAll(`tbody tr`))
        .filter(isDataRow)
        .filter((row) => {
            const cb = row.querySelector(`.${BULK_ROW_CB_CLASS}`);
            return cb && !cb.disabled && cb.checked;
        });

    if (!selectedRows.length) return;
    if (!window.confirm(`Delete ${selectedRows.length} selected row(s)?`)) return;

    let attempted = 0;
    let missing = 0;
    for (const row of selectedRows) {
        const deleteControl = findDeleteControl(row);
        if (!deleteControl) {
            missing += 1;
            continue;
        }
        attempted += 1;
        deleteControl.click();
        // Small delay helps when handlers update DOM/Firestore asynchronously.
        // eslint-disable-next-line no-await-in-loop
        await new Promise(resolve => setTimeout(resolve, 120));
    }

    setTimeout(() => syncTableState(table), 400);
    if (typeof window.showAlert === 'function') {
        if (attempted > 0) window.showAlert('info', `Triggered delete for ${attempted} selected row(s).`);
        if (missing > 0) window.showAlert('warning', `${missing} selected row(s) had no delete action.`);
    }
}

function bindTable(table) {
    if (!table || tableState.has(table)) return;
    if (shouldSkipTable(table)) return;
    if (hasNativeRowSelection(table)) return;

    const toolbar = getOrCreateToolbar(table);
    if (!toolbar) return;
    const selectAll = toolbar.querySelector(`.${BULK_SELECT_ALL_CLASS}`);
    const deleteBtn = toolbar.querySelector(`.${BULK_DELETE_BTN_CLASS}`);
    if (!selectAll || !deleteBtn) return;

    tableState.set(table, { toolbar, selectAll, deleteBtn });

    table.addEventListener('change', (event) => {
        const target = event.target;
        if (!(target instanceof HTMLInputElement)) return;
        if (!target.classList.contains(BULK_ROW_CB_CLASS)) return;
        syncTableState(table);
    });

    selectAll.addEventListener('change', () => {
        const rows = Array.from(table.querySelectorAll('tbody tr')).filter(isDataRow);
        rows.forEach((row) => {
            const cb = ensureRowCheckbox(row);
            if (!cb || cb.disabled) return;
            cb.checked = selectAll.checked;
        });
        syncTableState(table);
    });

    deleteBtn.addEventListener('click', () => deleteSelectedRows(table));

    const tbody = table.querySelector('tbody');
    if (tbody) {
        const observer = new MutationObserver(() => syncTableState(table));
        observer.observe(tbody, { childList: true, subtree: true });
    }

    syncTableState(table);
}

function initBulkDeleteForTables() {
    const tables = Array.from(document.querySelectorAll('table'));
    tables.forEach(bindTable);
}

document.addEventListener('DOMContentLoaded', () => {
    initBulkDeleteForTables();
    window.addEventListener('sectionChanged', () => setTimeout(initBulkDeleteForTables, 100));
    window.addEventListener('SectionChanged', () => setTimeout(initBulkDeleteForTables, 100));
});
