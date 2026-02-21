import { db, remoteConfig } from './firebase-config.js';
import { checkAuth } from './dashboard.js';
import { showAlert } from './auth.js';

const productForm = document.getElementById('productMasterFormNew');
const moldForm = document.getElementById('moldMasterForm');
const locationForm = document.getElementById('locationMasterForm');

const productTable = document.getElementById('productMasterTable');
const moldTable = document.getElementById('moldMasterTable');
const locationTable = document.getElementById('locationMasterTable');

const pmCreateBtn = document.getElementById('pmCreateBtn');
const mmCreateBtn = document.getElementById('mmCreateBtn');
const lmCreateBtn = document.getElementById('lmCreateBtn');
const pmImageFile = document.getElementById('pmImageFile');
const pmImageStatus = document.getElementById('pmImageStatus');
const pmImageUrl = document.getElementById('pmImageUrl');
const pmImageProgressWrap = document.getElementById('pmImageProgressWrap');
const pmImageProgress = document.getElementById('pmImageProgress');
const pmRecipeContainer = document.getElementById('pmRecipeContainer');
const pmAddRecipeRowBtn = document.getElementById('pmAddRecipeRowBtn');

let currentProductId = null;
let currentMoldId = null;
let currentLocationId = null;
let pendingOptionType = null;
let productMasterInventoryItems = [];
let appDefaultGstRate = 0;

const DEFAULT_PRODUCT_OPTIONS = {
    category: ['RCC Pipe', 'Septic Tank', 'Water Tank'],
    pipeType: ['Plain End', 'Socket & Spigot', 'Tongue and Groove or T/4'],
    loadClass: ['NP2', 'NP3', 'NP4'],
    unit: ['Nos', 'Pieces', 'Meters', 'Kg', 'Liters']
};

let productOptionSets = {
    category: [...DEFAULT_PRODUCT_OPTIONS.category],
    pipeType: [...DEFAULT_PRODUCT_OPTIONS.pipeType],
    loadClass: [...DEFAULT_PRODUCT_OPTIONS.loadClass],
    unit: [...DEFAULT_PRODUCT_OPTIONS.unit]
};

const PRODUCT_OPTION_META = {
    category: { selectId: 'pmCategoryNew', label: 'Category', storeKey: 'categories' },
    pipeType: { selectId: 'pmPipeTypeNew', label: 'Pipe Type', storeKey: 'pipeTypes' },
    loadClass: { selectId: 'pmLoadClassNew', label: 'Load Class', storeKey: 'loadClasses' },
    unit: { selectId: 'pmUnitNew', label: 'Unit', storeKey: 'units' }
};
const PRODUCT_OPTION_FIELD_MAP = {
    category: 'category',
    pipeType: 'pipeType',
    loadClass: 'loadClass',
    unit: 'unit'
};

function normalizeLocationType(type) {
    const raw = (type || '').trim();
    if (!raw) return '';
    const map = {
        'Production Area': 'Production Output',
        'Curing Yard': 'Curing House',
        'Septic Assembly Area': 'Septic Tank Area'
    };
    return map[raw] || raw;
}

function isRawMaterialInventoryItem(item = {}) {
    const category = (item.category || '').toString().trim().toLowerCase();
    const name = (item.name || '').toString().trim().toLowerCase();
    const source = (item.source || '').toString().trim().toLowerCase();

    const blockedCategoryTokens = ['finished', 'rcc pipe', 'rcc pipes', 'septic', 'water tank', 'product', 'fg'];
    if (blockedCategoryTokens.some(token => category.includes(token))) return false;
    if (source === 'product_master') return false;

    const rawCategoryTokens = ['raw', 'cement', 'sand', 'dust', 'aggregate', 'steel', 'fly ash', 'admixture', 'chemical'];
    if (rawCategoryTokens.some(token => category.includes(token))) return true;

    const rawNameTokens = ['cement', 'sand', 'dust', 'aggregate', 'steel', 'fly ash', 'admixture', 'chemical'];
    return rawNameTokens.some(token => name.includes(token));
}

async function loadProductMasterInventory() {
    const businessId = getBusinessId();
    if (!businessId) return;
    try {
        const snap = await db.collection('users').doc(businessId).collection('inventory').get();
        productMasterInventoryItems = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
        console.error('Failed to load inventory for product recipe', error);
        productMasterInventoryItems = [];
    }
}

function addProductRecipeRow(preSelectedId = '', preQty = '') {
    if (!pmRecipeContainer) return;
    const rowId = `pm-recipe-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const rawItems = (productMasterInventoryItems || []).filter(isRawMaterialInventoryItem);
    const options = rawItems.map(item =>
        `<option value="${item.id}" ${String(preSelectedId) === String(item.id) ? 'selected' : ''}>${item.name || item.id}${item.category ? ` [${item.category}]` : ''}</option>`
    ).join('');
    const html = `
        <div class="row g-2 mb-2 align-items-end pm-recipe-row" id="${rowId}">
            <div class="col-md-7">
                <label class="form-label small">Raw Material</label>
                <select class="form-select form-select-sm pm-recipe-material">
                    <option value="">${rawItems.length ? 'Select Material...' : 'No raw materials found'}</option>
                    ${options}
                </select>
            </div>
            <div class="col-md-4">
                <label class="form-label small">Quantity</label>
                <input type="number" class="form-control form-control-sm pm-recipe-qty" min="0" step="0.01" value="${preQty || ''}">
            </div>
            <div class="col-md-1 d-grid">
                <button type="button" class="btn btn-outline-danger btn-sm pm-recipe-remove-btn">x</button>
            </div>
        </div>`;
    pmRecipeContainer.insertAdjacentHTML('beforeend', html);
}

function setProductRecipeRows(rows = []) {
    if (!pmRecipeContainer) return;
    pmRecipeContainer.innerHTML = '';
    const validRows = (rows || []).filter((row) => {
        const id = row?.id || row?.materialId || '';
        const qty = parseFloat(row?.quantity || row?.qty || '0') || 0;
        return id && qty > 0;
    });
    if (!validRows.length) {
        addProductRecipeRow();
        return;
    }
    validRows.forEach((row) => addProductRecipeRow(row.id || row.materialId || '', row.quantity || row.qty || ''));
}

function getProductRecipeRows() {
    if (!pmRecipeContainer) return [];
    const rows = [];
    pmRecipeContainer.querySelectorAll('.pm-recipe-row').forEach((row) => {
        const id = row.querySelector('.pm-recipe-material')?.value || '';
        const qty = parseFloat(row.querySelector('.pm-recipe-qty')?.value || '0') || 0;
        if (!id || qty <= 0) return;
        const item = (productMasterInventoryItems || []).find(i => i.id === id);
        rows.push({
            id,
            name: item?.name || 'Material',
            unit: item?.unit || '',
            quantity: qty
        });
    });
    return rows;
}

function resolveProductCategory() {
    const categorySelect = document.getElementById('pmCategoryNew');
    return (categorySelect?.value || '').trim();
}

function normalizeText(value) {
    return String(value || '').trim().toLowerCase();
}

function formatProductIdentityLabel(data = {}) {
    const name = data.name || data.productName || 'Product';
    const category = data.category || data.productCategory || '-';
    const pipeType = data.pipeType || '-';
    const loadClass = data.loadClass || '-';
    return `${name} | ${category} | ${pipeType} | ${loadClass}`;
}

function normalizeOptionArray(value) {
    if (!Array.isArray(value)) return [];
    return Array.from(new Set(value.map(v => String(v || '').trim()).filter(Boolean)));
}

function ensureOptionExists(type, value) {
    const val = String(value || '').trim();
    if (!val || !productOptionSets[type]) return;
    if (productOptionSets[type].some(item => item.toLowerCase() === val.toLowerCase())) return;
    productOptionSets[type].push(val);
    productOptionSets[type].sort((a, b) => a.localeCompare(b));
}

function renderSelectOptions(selectId, options, selectedValue = '') {
    const select = document.getElementById(selectId);
    if (!select) return;
    const current = String(selectedValue || '').trim();
    select.innerHTML = '';
    options.forEach((o) => {
        const option = document.createElement('option');
        option.value = o;
        option.textContent = o;
        select.appendChild(option);
    });
    if (current && options.includes(current)) {
        select.value = current;
    } else if (options.length > 0) {
        select.value = options[0];
    } else {
        select.value = '';
    }
}

function renderProductOptionSelects(preferred = {}) {
    renderSelectOptions('pmCategoryNew', productOptionSets.category, preferred.category || document.getElementById('pmCategoryNew')?.value || '');
    renderSelectOptions('pmPipeTypeNew', productOptionSets.pipeType, preferred.pipeType || document.getElementById('pmPipeTypeNew')?.value || '');
    renderSelectOptions('pmLoadClassNew', productOptionSets.loadClass, preferred.loadClass || document.getElementById('pmLoadClassNew')?.value || '');
    renderSelectOptions('pmUnitNew', productOptionSets.unit, preferred.unit || document.getElementById('pmUnitNew')?.value || '');
}

function buildProductOptionsPayload() {
    return {
        categories: productOptionSets.category,
        pipeTypes: productOptionSets.pipeType,
        loadClasses: productOptionSets.loadClass,
        units: productOptionSets.unit,
        updatedAt: new Date()
    };
}

function isDefaultOption(type, value) {
    const defaults = DEFAULT_PRODUCT_OPTIONS[type] || [];
    return defaults.some((v) => v.toLowerCase() === String(value || '').toLowerCase());
}

function renderOptionManagerList(type) {
    const list = document.getElementById('pmOptionExistingList');
    if (!list) return;
    const options = productOptionSets[type] || [];
    if (options.length === 0) {
        list.innerHTML = '<div class="list-group-item text-muted small">No options.</div>';
        return;
    }
    list.innerHTML = '';
    options.forEach((value) => {
        const item = document.createElement('div');
        item.className = 'list-group-item d-flex justify-content-between align-items-center';

        const left = document.createElement('div');
        left.className = 'd-flex align-items-center gap-2';
        const name = document.createElement('span');
        name.textContent = value;
        left.appendChild(name);

        const right = document.createElement('div');
        if (isDefaultOption(type, value)) {
            const badge = document.createElement('span');
            badge.className = 'badge bg-light text-dark border';
            badge.textContent = 'Default';
            right.appendChild(badge);
        } else {
            const delBtn = document.createElement('button');
            delBtn.type = 'button';
            delBtn.className = 'btn btn-sm btn-outline-danger';
            delBtn.dataset.optionType = type;
            delBtn.dataset.optionValue = value;
            delBtn.innerHTML = '<i class="fas fa-trash-alt"></i>';
            right.appendChild(delBtn);
        }

        item.appendChild(left);
        item.appendChild(right);
        list.appendChild(item);
    });
}

async function canDeleteProductOption(type, value) {
    const businessId = getBusinessId();
    if (!businessId) return false;
    const field = PRODUCT_OPTION_FIELD_MAP[type];
    if (!field) return false;
    try {
        const snap = await db
            .collection('users')
            .doc(businessId)
            .collection('product_master')
            .where(field, '==', value)
            .limit(1)
            .get();
        return snap.empty;
    } catch (error) {
        console.error(error);
        return false;
    }
}

async function deleteProductOption(type, value) {
    const meta = PRODUCT_OPTION_META[type];
    if (!meta) return;
    if (isDefaultOption(type, value)) {
        showAlert('danger', 'Default option cannot be deleted');
        return;
    }
    const options = productOptionSets[type] || [];
    if (options.length <= 1) {
        showAlert('danger', `At least one ${meta.label.toLowerCase()} is required`);
        return;
    }
    const unused = await canDeleteProductOption(type, value);
    if (!unused) {
        showAlert('danger', `${meta.label} is used in Product Master and cannot be deleted`);
        return;
    }

    productOptionSets[type] = options.filter((o) => o !== value);
    const businessId = getBusinessId();
    if (!businessId) return;
    try {
        await db.collection('users').doc(businessId).collection('settings').doc('product_master_options').set(buildProductOptionsPayload(), { merge: true });
        renderProductOptionSelects();
        syncProductMasterCategoryFields();
        renderOptionManagerList(type);
        showAlert('success', `${meta.label} deleted`);
    } catch (error) {
        console.error(error);
        showAlert('danger', `Failed to delete ${meta.label.toLowerCase()}`);
    }
}

async function loadProductOptionSets() {
    const businessId = getBusinessId();
    if (!businessId) return;
    productOptionSets = {
        category: [...DEFAULT_PRODUCT_OPTIONS.category],
        pipeType: [...DEFAULT_PRODUCT_OPTIONS.pipeType],
        loadClass: [...DEFAULT_PRODUCT_OPTIONS.loadClass],
        unit: [...DEFAULT_PRODUCT_OPTIONS.unit]
    };
    try {
        const doc = await db.collection('users').doc(businessId).collection('settings').doc('product_master_options').get();
        if (doc.exists) {
            const data = doc.data() || {};
            productOptionSets.category = normalizeOptionArray([...(data.categories || []), ...DEFAULT_PRODUCT_OPTIONS.category]);
            productOptionSets.pipeType = normalizeOptionArray([...(data.pipeTypes || []), ...DEFAULT_PRODUCT_OPTIONS.pipeType]);
            productOptionSets.loadClass = normalizeOptionArray([...(data.loadClasses || []), ...DEFAULT_PRODUCT_OPTIONS.loadClass]);
            productOptionSets.unit = normalizeOptionArray([...(data.units || []), ...DEFAULT_PRODUCT_OPTIONS.unit]);
        }
    } catch (error) {
        console.error('Failed to load product options', error);
    }
    renderProductOptionSelects();
}

function openProductOptionModal(type) {
    const meta = PRODUCT_OPTION_META[type];
    if (!meta) return;
    pendingOptionType = type;
    const title = document.getElementById('pmOptionModalLabel');
    const help = document.getElementById('pmOptionModalHelp');
    const input = document.getElementById('pmOptionNameInput');
    if (title) title.textContent = `Add ${meta.label}`;
    if (help) help.textContent = `Create a new ${meta.label.toLowerCase()} option for Product Master.`;
    if (input) {
        input.value = '';
        input.placeholder = `Enter ${meta.label.toLowerCase()}`;
    }
    const modalEl = document.getElementById('pmOptionModal');
    if (!modalEl) return;
    const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
    renderOptionManagerList(type);
    modal.show();
    setTimeout(() => input?.focus(), 120);
}

async function saveProductOption() {
    if (!pendingOptionType) return;
    const meta = PRODUCT_OPTION_META[pendingOptionType];
    if (!meta) return;
    const input = document.getElementById('pmOptionNameInput');
    const value = String(input?.value || '').trim();
    if (!value) return showAlert('danger', `${meta.label} is required`);

    const exists = productOptionSets[pendingOptionType].some(item => item.toLowerCase() === value.toLowerCase());
    if (!exists) {
        ensureOptionExists(pendingOptionType, value);
        const businessId = getBusinessId();
        if (!businessId) return;
        try {
            await db.collection('users').doc(businessId).collection('settings').doc('product_master_options').set(buildProductOptionsPayload(), { merge: true });
        } catch (error) {
            console.error(error);
            return showAlert('danger', `Failed to save ${meta.label.toLowerCase()}`);
        }
    }

    renderProductOptionSelects({ [pendingOptionType]: value });
    syncProductMasterCategoryFields();
    renderOptionManagerList(pendingOptionType);
    const modalEl = document.getElementById('pmOptionModal');
    if (modalEl) bootstrap.Modal.getOrCreateInstance(modalEl).hide();
    showAlert('success', `${meta.label} added`);
}

document.addEventListener('DOMContentLoaded', async () => {
    await checkAuth();
    await loadBusinessDefaults();
    await loadProductOptionSets();

    window.addEventListener('sectionChanged', (e) => {
        if (e.detail === 'production') {
            loadAllMasters();
        }
    });

    if (pmCreateBtn) pmCreateBtn.addEventListener('click', saveProductMaster);
    if (mmCreateBtn) mmCreateBtn.addEventListener('click', saveMoldMaster);
    if (lmCreateBtn) lmCreateBtn.addEventListener('click', saveLocationMaster);
    if (pmImageFile) pmImageFile.addEventListener('change', handleProductImageSelect);
    if (pmAddRecipeRowBtn) pmAddRecipeRowBtn.addEventListener('click', () => addProductRecipeRow());
    if (pmRecipeContainer) {
        pmRecipeContainer.addEventListener('click', (event) => {
            const btn = event.target.closest('.pm-recipe-remove-btn');
            if (!btn) return;
            const row = btn.closest('.pm-recipe-row');
            if (row) row.remove();
            if (!pmRecipeContainer.querySelector('.pm-recipe-row')) addProductRecipeRow();
        });
    }
    const categorySelect = document.getElementById('pmCategoryNew');
    if (categorySelect) {
        categorySelect.addEventListener('change', syncProductMasterCategoryFields);
        syncProductMasterCategoryFields();
    }
    document.querySelectorAll('.pm-option-add-btn').forEach((btn) => {
        btn.addEventListener('click', () => openProductOptionModal(btn.dataset.optionType));
    });
    const pmOptionSaveBtn = document.getElementById('pmOptionSaveBtn');
    if (pmOptionSaveBtn) pmOptionSaveBtn.addEventListener('click', saveProductOption);
    const pmOptionNameInput = document.getElementById('pmOptionNameInput');
    if (pmOptionNameInput) {
        pmOptionNameInput.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                saveProductOption();
            }
        });
    }
    const pmOptionExistingList = document.getElementById('pmOptionExistingList');
    if (pmOptionExistingList) {
        pmOptionExistingList.addEventListener('click', (event) => {
            const btn = event.target.closest('button[data-option-type][data-option-value]');
            if (!btn) return;
            deleteProductOption(btn.dataset.optionType, btn.dataset.optionValue);
        });
    }
    const pmOptionModal = document.getElementById('pmOptionModal');
    if (pmOptionModal) {
        pmOptionModal.addEventListener('hidden.bs.modal', () => {
            pendingOptionType = null;
            if (pmOptionNameInput) pmOptionNameInput.value = '';
            const list = document.getElementById('pmOptionExistingList');
            if (list) list.innerHTML = '';
        });
    }

    const productMasterModal = document.getElementById('productMasterModal');
    if (productMasterModal) {
        productMasterModal.addEventListener('show.bs.modal', async () => {
            await loadBusinessDefaults();
            await loadProductOptionSets();
            await loadProductMasterInventory();
            if (!currentProductId) setProductRecipeRows([]);
            await loadProducts();
        });
        productMasterModal.addEventListener('hidden.bs.modal', () => {
            currentProductId = null;
            productForm?.reset();
            syncProductMasterCategoryFields();
            resetProductImageUI();
            setProductRecipeRows([]);
        });
    }

    await loadAllMasters();
});

async function loadAllMasters() {
    await loadBusinessDefaults();
    await loadProductOptionSets();
    await Promise.all([loadProducts(), loadMolds(), loadLocations()]);
}

function getBusinessId() {
    const user = JSON.parse(localStorage.getItem('user'));
    return user?.businessId || user?.uid;
}

function resolveGstRate(value, fallback = appDefaultGstRate) {
    const n = Number(value);
    if (Number.isFinite(n) && n > 0) return n;
    const fb = Number(fallback);
    return Number.isFinite(fb) ? fb : 0;
}

async function loadBusinessDefaults() {
    const businessId = getBusinessId();
    if (!businessId) {
        appDefaultGstRate = 0;
        return;
    }
    try {
        const doc = await db.collection('users').doc(businessId).collection('settings').doc('business').get();
        const data = doc.exists ? (doc.data() || {}) : {};
        appDefaultGstRate = Number(data.gstRate ?? 0) || 0;
    } catch (error) {
        console.warn('Failed to load business defaults for Product Master', error);
        appDefaultGstRate = 0;
    }
}

async function loadProducts() {
    const businessId = getBusinessId();
    if (!businessId || !productTable) return;
    const tbody = productTable.querySelector('tbody');
    tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">Loading...</td></tr>';

    try {
        const snap = await db.collection('users').doc(businessId).collection('product_master').orderBy('name').get();
        if (snap.empty) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">No products yet</td></tr>';
            return;
        }
        tbody.innerHTML = '';
        snap.forEach(doc => {
            const p = doc.data();
            const price = (p.sellingPrice ?? 0).toLocaleString();
            const labour = (p.labourCostPerProduct ?? 0).toLocaleString();
            const gstRate = resolveGstRate(p.gstRate);
            const recipeCount = Array.isArray(p.rawMaterials) ? p.rawMaterials.length : 0;
            const priceSummary = `₹${price} | GST ${gstRate}% | Labour ₹${labour}${recipeCount ? ` | RM ${recipeCount}` : ''}`;
            const imageCell = p.imageUrl
                ? `<a href="${p.imageUrl}" target="_blank" class="d-inline-block" title="View Image">
                        <img src="${p.imageUrl}" alt="Product" style="width: 40px; height: 40px; object-fit: cover; border-radius: 6px; border: 1px solid rgba(0,0,0,0.1);">
                   </a>`
                : '<span class="text-muted">-</span>';
            tbody.innerHTML += `
                <tr>
                    <td>${formatProductIdentityLabel(p)}</td>
                    <td>${imageCell}</td>
                    <td>${p.category || p.productCategory || '-'}</td>
                    <td>${priceSummary}</td>
                    <td>
                        <button class="btn btn-sm btn-outline-primary" onclick="window.editProductMaster('${doc.id}')">Edit</button>
                        <button class="btn btn-sm btn-outline-danger ms-1" onclick="window.deleteProductMaster('${doc.id}')">Delete</button>
                    </td>
                </tr>
            `;
        });
    } catch (e) {
        console.error(e);
        tbody.innerHTML = '<tr><td colspan="5" class="text-center text-danger">Error loading</td></tr>';
    }
}

async function loadMolds() {
    const businessId = getBusinessId();
    if (!businessId || !moldTable) return;
    const tbody = moldTable.querySelector('tbody');
    tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted">Loading...</td></tr>';

    try {
        const snap = await db.collection('users').doc(businessId).collection('mold_master').orderBy('moldId').get();
        if (snap.empty) {
            tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted">No molds yet</td></tr>';
            return;
        }
        tbody.innerHTML = '';
        snap.forEach(doc => {
            const m = doc.data();
            tbody.innerHTML += `
                <tr>
                    <td>${m.moldId || '-'}</td>
                    <td>${m.status || 'Available'}</td>
                    <td>${m.supportedProduct || '-'}</td>
                    <td>
                        <button class="btn btn-sm btn-outline-primary" onclick="window.editMoldMaster('${doc.id}')">Edit</button>
                        <button class="btn btn-sm btn-outline-danger ms-1" onclick="window.deleteMoldMaster('${doc.id}')">Delete</button>
                    </td>
                </tr>
            `;
        });
    } catch (e) {
        console.error(e);
        tbody.innerHTML = '<tr><td colspan="4" class="text-center text-danger">Error loading</td></tr>';
    }
}

async function loadLocations() {
    const businessId = getBusinessId();
    if (!businessId || !locationTable) return;
    const tbody = locationTable.querySelector('tbody');
    tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted">Loading...</td></tr>';

    try {
        const snap = await db.collection('users').doc(businessId).collection('location_master').orderBy('name').get();
        if (snap.empty) {
            tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted">No locations yet</td></tr>';
            return;
        }
        tbody.innerHTML = '';
        snap.forEach(doc => {
            const l = doc.data();
            const locationType = normalizeLocationType(l.type) || '-';
            tbody.innerHTML += `
                <tr>
                    <td>${l.name || '-'}</td>
                    <td>${locationType}</td>
                    <td>${l.status || 'Active'}</td>
                    <td>
                        <button class="btn btn-sm btn-outline-primary" onclick="window.editLocationMaster('${doc.id}')">Edit</button>
                        <button class="btn btn-sm btn-outline-danger ms-1" onclick="window.deleteLocationMaster('${doc.id}')">Delete</button>
                    </td>
                </tr>
            `;
        });
    } catch (e) {
        console.error(e);
        tbody.innerHTML = '<tr><td colspan="4" class="text-center text-danger">Error loading</td></tr>';
    }
}

async function saveProductMaster() {
    const businessId = getBusinessId();
    if (!businessId) return;
    const categoryVal = resolveProductCategory();
    if (!categoryVal) return showAlert('danger', 'Product category required');
    const rawMaterials = getProductRecipeRows();
    const data = {
        category: categoryVal,
        name: document.getElementById('pmNameNew').value.trim(),
        pipeType: (document.getElementById('pmPipeTypeNew').value || '').trim(),
        loadClass: (document.getElementById('pmLoadClassNew').value || '').trim(),
        unit: (document.getElementById('pmUnitNew').value || 'Nos').trim(),
        sellingPrice: parseFloat(document.getElementById('pmSellingPriceNew').value) || 0,
        gstRate: resolveGstRate(null),
        labourCostPerProduct: parseFloat(document.getElementById('pmLabourCostPerProductNew')?.value || '0') || 0,
        rawMaterials,
        status: 'Active',
        imageUrl: pmImageUrl ? (pmImageUrl.value || '') : '',
        updatedAt: new Date()
    };
    if (!data.name) return showAlert('danger', 'Product name required');

    try {
        const duplicateSnap = await db.collection('users').doc(businessId).collection('product_master')
            .where('name', '==', data.name)
            .get();
        const duplicate = duplicateSnap.docs.find((doc) => {
            if (currentProductId && doc.id === currentProductId) return false;
            const p = doc.data() || {};
            return normalizeText(p.name) === normalizeText(data.name)
                && normalizeText(p.category || p.productCategory) === normalizeText(data.category)
                && normalizeText(p.pipeType) === normalizeText(data.pipeType)
                && normalizeText(p.loadClass) === normalizeText(data.loadClass);
        });
        if (duplicate) {
            return showAlert('danger', `Duplicate product variant: ${formatProductIdentityLabel(data)}`);
        }

        if (currentProductId) {
            await db.collection('users').doc(businessId).collection('product_master').doc(currentProductId).update(data);
            currentProductId = null;
        } else {
            data.createdAt = new Date();
            await db.collection('users').doc(businessId).collection('product_master').add(data);
        }
        productForm.reset();
        syncProductMasterCategoryFields();
        resetProductImageUI();
        setProductRecipeRows([]);
        showAlert('success', 'Product saved');
        loadProducts();
    } catch (e) {
        console.error(e);
        showAlert('danger', 'Failed to save product');
    }
}

function syncProductMasterCategoryFields() {
    const category = resolveProductCategory().toLowerCase();
    const isPipeCategory = category.includes('pipe');
    const pipeTypeEl = document.getElementById('pmPipeTypeNew');
    const loadClassEl = document.getElementById('pmLoadClassNew');
    const pipeTypeWrap = pipeTypeEl?.closest('.col-md-6');
    const loadClassWrap = loadClassEl?.closest('.col-md-6');

    if (pipeTypeWrap) pipeTypeWrap.classList.toggle('d-none', !isPipeCategory);
    if (loadClassWrap) loadClassWrap.classList.toggle('d-none', !isPipeCategory);

    if (pipeTypeEl) {
        pipeTypeEl.disabled = !isPipeCategory;
        if (!isPipeCategory) {
            pipeTypeEl.value = '';
        } else if (!pipeTypeEl.value && productOptionSets.pipeType.length > 0) {
            pipeTypeEl.value = productOptionSets.pipeType[0];
        }
    }

    if (loadClassEl) {
        loadClassEl.disabled = !isPipeCategory;
        if (!isPipeCategory) {
            loadClassEl.value = '';
        } else if (!loadClassEl.value && productOptionSets.loadClass.length > 0) {
            loadClassEl.value = productOptionSets.loadClass[0];
        }
    }
}

async function saveMoldMaster() {
    const businessId = getBusinessId();
    if (!businessId) return;
    const data = {
        moldId: document.getElementById('mmId').value.trim(),
        moldType: document.getElementById('mmType').value,
        supportedProduct: document.getElementById('mmProduct').value,
        status: document.getElementById('mmStatus').value,
        lastUsedDate: document.getElementById('mmLastUsed').value ? new Date(document.getElementById('mmLastUsed').value) : null,
        remarks: document.getElementById('mmRemarks').value,
        updatedAt: new Date()
    };
    if (!data.moldId) return showAlert('danger', 'Mold ID required');

    try {
        if (currentMoldId) {
            await db.collection('users').doc(businessId).collection('mold_master').doc(currentMoldId).update(data);
            currentMoldId = null;
        } else {
            data.createdAt = new Date();
            await db.collection('users').doc(businessId).collection('mold_master').add(data);
        }
        moldForm.reset();
        showAlert('success', 'Mold saved');
        loadMolds();
    } catch (e) {
        console.error(e);
        showAlert('danger', 'Failed to save mold');
    }
}

async function saveLocationMaster() {
    const businessId = getBusinessId();
    if (!businessId) return;
    const data = {
        name: document.getElementById('lmName').value.trim(),
        type: normalizeLocationType(document.getElementById('lmType').value),
        capacity: parseFloat(document.getElementById('lmCapacity').value) || 0,
        status: document.getElementById('lmStatus').value,
        updatedAt: new Date()
    };
    if (!data.name) return showAlert('danger', 'Location name required');

    try {
        if (currentLocationId) {
            await db.collection('users').doc(businessId).collection('location_master').doc(currentLocationId).update(data);
            currentLocationId = null;
        } else {
            data.createdAt = new Date();
            await db.collection('users').doc(businessId).collection('location_master').add(data);
        }
        locationForm.reset();
        showAlert('success', 'Location saved');
        loadLocations();
    } catch (e) {
        console.error(e);
        showAlert('danger', 'Failed to save location');
    }
}

window.editProductMaster = async (id) => {
    const businessId = getBusinessId();
    const doc = await db.collection('users').doc(businessId).collection('product_master').doc(id).get();
    if (!doc.exists) return;
    await loadProductMasterInventory();
    const p = doc.data();
    currentProductId = id;
    const categoryRaw = p.category || 'RCC Pipe';
    const categoryLower = categoryRaw.toLowerCase();
    const categoryNormalized = categoryLower === 'septic tank product' || categoryLower === 'septic tank products'
        ? 'Septic Tank'
        : categoryLower === 'water tank products'
            ? 'Water Tank'
            : categoryLower === 'rcc pipes'
                ? 'RCC Pipe'
                : categoryRaw;
    ensureOptionExists('category', categoryNormalized);
    ensureOptionExists('pipeType', p.pipeType || '');
    ensureOptionExists('loadClass', p.loadClass || '');
    ensureOptionExists('unit', p.unit || '');
    renderProductOptionSelects({
        category: categoryNormalized,
        pipeType: p.pipeType || '',
        loadClass: p.loadClass || '',
        unit: p.unit || 'Nos'
    });
    document.getElementById('pmNameNew').value = p.name || '';
    document.getElementById('pmSellingPriceNew').value = p.sellingPrice ?? 0;
    const labourInput = document.getElementById('pmLabourCostPerProductNew');
    if (labourInput) labourInput.value = p.labourCostPerProduct ?? p.labourRatePerProduct ?? 0;
    setProductRecipeRows(p.rawMaterials || p.ingredients || []);
    syncProductMasterCategoryFields();
    setProductImageUI(p.imageUrl || '');
};

window.deleteProductMaster = async (id) => {
    if (!confirm('Delete this product?')) return;
    const businessId = getBusinessId();
    await db.collection('users').doc(businessId).collection('product_master').doc(id).delete();
    loadProducts();
};

window.deleteProductImage = () => {
    if (pmImageUrl) pmImageUrl.value = '';
    if (pmImageFile) pmImageFile.value = '';
    const existing = document.getElementById('productImageExisting');
    if (existing) existing.classList.add('d-none');
    if (pmImageStatus) pmImageStatus.innerHTML = '<span class="text-danger">Removed</span>';
    if (pmImageProgressWrap) pmImageProgressWrap.classList.add('d-none');
};

function setProductImageUI(url) {
    if (!pmImageUrl) return;
    pmImageUrl.value = url || '';
    const existing = document.getElementById('productImageExisting');
    const link = document.getElementById('productImageLink');
    if (url) {
        if (existing) existing.classList.remove('d-none');
        if (link) link.href = url;
        if (pmImageStatus) pmImageStatus.innerHTML = '<span class="text-success">Image loaded</span>';
    } else {
        if (existing) existing.classList.add('d-none');
        if (pmImageStatus) pmImageStatus.innerHTML = '';
    }
}

function resetProductImageUI() {
    if (pmImageFile) pmImageFile.value = '';
    if (pmImageUrl) pmImageUrl.value = '';
    const existing = document.getElementById('productImageExisting');
    if (existing) existing.classList.add('d-none');
    if (pmImageStatus) pmImageStatus.innerHTML = '';
    if (pmImageProgressWrap) pmImageProgressWrap.classList.add('d-none');
}

async function handleProductImageSelect() {
    const file = pmImageFile?.files?.[0];
    if (!file) return;

    if (pmImageStatus) {
        pmImageStatus.innerHTML = '<span class="text-info"><i class="fas fa-cog fa-spin"></i> Compressing...</span>';
    }
    if (pmImageProgressWrap) pmImageProgressWrap.classList.add('d-none');

    try {
        const compressedFile = await compressProductImage(file);
        const businessId = getBusinessId();
        const apiKey = await getImgBBApiKey(businessId);
        if (!apiKey) {
            if (pmImageStatus) pmImageStatus.innerHTML = '<span class="text-danger">ImgBB API key not set</span>';
            return;
        }

        if (pmImageStatus) {
            const size = (compressedFile.size / 1024).toFixed(1);
            pmImageStatus.innerHTML = `<span class="text-primary"><i class="fas fa-spinner fa-spin"></i> Uploading (${size} KB)...</span>`;
        }
        if (pmImageProgressWrap) pmImageProgressWrap.classList.remove('d-none');
        if (pmImageProgress) {
            pmImageProgress.style.width = '0%';
            pmImageProgress.textContent = '0%';
        }

        const url = await uploadToImgBBWithProgress(compressedFile, apiKey, (pct) => {
            if (pmImageProgress) {
                pmImageProgress.style.width = `${pct}%`;
                pmImageProgress.textContent = `${pct}%`;
            }
        });

        setProductImageUI(url);
        if (pmImageStatus) pmImageStatus.innerHTML = '<span class="text-success"><i class="fas fa-check-circle"></i> Uploaded</span>';
    } catch (e) {
        console.error(e);
        if (pmImageStatus) pmImageStatus.innerHTML = '<span class="text-danger">Upload failed</span>';
    }
}

async function compressProductImage(file) {
    const maxSize = 100 * 1024; // 100KB target
    let quality = 0.92;
    let width, height;

    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.src = objectUrl;
    await new Promise(r => img.onload = r);

    const MAX_DIMENSION = 1400;
    width = img.width;
    height = img.height;
    if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
        const ratio = Math.min(MAX_DIMENSION / width, MAX_DIMENSION / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, width, height);

    let blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', quality));

    while (blob.size > maxSize) {
        if (quality > 0.72) {
            quality -= 0.04;
            blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', quality));
        } else {
            width = Math.round(width * 0.9);
            height = Math.round(height * 0.9);
            if (width < 500 || height < 500) break;
            canvas.width = width;
            canvas.height = height;
            ctx.drawImage(img, 0, 0, width, height);
            quality = 0.85;
            blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', quality));
        }
    }

    URL.revokeObjectURL(objectUrl);
    return new File([blob], file.name, { type: 'image/jpeg' });
}

async function getImgBBApiKey(businessId) {
    try {
        if (remoteConfig) {
            await remoteConfig.fetchAndActivate();
            const rcKey = remoteConfig.getValue('imgbb_api_key').asString();
            if (rcKey) return rcKey;
        }

        const doc = await db.collection('users').doc(businessId).collection('settings').doc('integrations').get();
        if (doc.exists && doc.data().imgbbApiKey) {
            return doc.data().imgbbApiKey;
        }
        return null;
    } catch (e) {
        console.error('Config Error:', e);
        return null;
    }
}

function uploadToImgBBWithProgress(file, apiKey, onProgress) {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', `https://api.imgbb.com/1/upload?key=${apiKey}`);
        xhr.upload.onprogress = (e) => {
            if (!e.lengthComputable) return;
            const pct = Math.round((e.loaded / e.total) * 100);
            onProgress(pct);
        };
        xhr.onload = () => {
            try {
                const data = JSON.parse(xhr.responseText);
                if (data.success) return resolve(data.data.url);
                reject(new Error(data.error ? data.error.message : 'Upload failed'));
            } catch (err) {
                reject(err);
            }
        };
        xhr.onerror = () => reject(new Error('Upload failed'));
        const formData = new FormData();
        formData.append('image', file);
        xhr.send(formData);
    });
}

window.editMoldMaster = async (id) => {
    const businessId = getBusinessId();
    const doc = await db.collection('users').doc(businessId).collection('mold_master').doc(id).get();
    if (!doc.exists) return;
    const m = doc.data();
    currentMoldId = id;
    document.getElementById('mmId').value = m.moldId || '';
    document.getElementById('mmType').value = m.moldType || 'Pipe Mold';
    document.getElementById('mmProduct').value = m.supportedProduct || '';
    document.getElementById('mmStatus').value = m.status || 'Available';
    document.getElementById('mmLastUsed').value = m.lastUsedDate ? m.lastUsedDate.toDate().toISOString().split('T')[0] : '';
    document.getElementById('mmRemarks').value = m.remarks || '';
};

window.deleteMoldMaster = async (id) => {
    if (!confirm('Delete this mold?')) return;
    const businessId = getBusinessId();
    await db.collection('users').doc(businessId).collection('mold_master').doc(id).delete();
    loadMolds();
};

window.editLocationMaster = async (id) => {
    const businessId = getBusinessId();
    const doc = await db.collection('users').doc(businessId).collection('location_master').doc(id).get();
    if (!doc.exists) return;
    const l = doc.data();
    currentLocationId = id;
    document.getElementById('lmName').value = l.name || '';
    document.getElementById('lmType').value = normalizeLocationType(l.type) || 'Production Output';
    document.getElementById('lmCapacity').value = l.capacity || '';
    document.getElementById('lmStatus').value = l.status || 'Active';
};

window.deleteLocationMaster = async (id) => {
    if (!confirm('Delete this location?')) return;
    const businessId = getBusinessId();
    await db.collection('users').doc(businessId).collection('location_master').doc(id).delete();
    loadLocations();
};
