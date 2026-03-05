import { db } from './firebase-config.js';
import { checkAuth, formatDate, downloadCSV, downloadPDF } from './dashboard.js';
import { showAlert } from './auth.js';
import { deriveTaxpayerDetailsFromGstin, isValidGstin, normalizeGstin } from './gst-lookup.js';

const suppliersContainer = document.getElementById('suppliersContainer');
const addSupplierBtn = document.getElementById('addSupplierBtn');
const supplierModal = document.getElementById('supplierModal');
const supplierForm = document.getElementById('supplierForm');
const saveSupplierBtn = document.getElementById('saveSupplierBtn');
const searchSuppliers = document.getElementById('searchSuppliers');
const filterSupplierType = document.getElementById('filterSupplierType');
const filterSupplierStatus = document.getElementById('filterSupplierStatus');
const supplierPaymentModal = document.getElementById('supplierPaymentModal');
const saveSupplierPaymentBtn = document.getElementById('saveSupplierPaymentBtn');
const supplierLedgerModal = document.getElementById('supplierLedgerModal');
const filterSupplierLedgerBtn = document.getElementById('filterSupplierLedgerBtn');
const exportSuppliersPdfBtn = document.getElementById('exportSuppliersPdfBtn');
const exportSuppliersCsvBtn = document.getElementById('exportSuppliersCsvBtn');
const supplierMaterialsContainer = document.getElementById('supplierMaterialsContainer');
const addSupplierMaterialBtn = document.getElementById('addSupplierMaterialBtn');
const spBillModeInfo = document.getElementById('spBillModeInfo');
const spBillItemsWrap = document.getElementById('spBillItemsWrap');
const spBillItemsBody = document.getElementById('spBillItemsBody');
const spAddBillItemBtn = document.getElementById('spAddBillItemBtn');
const spBillItemsTotal = document.getElementById('spBillItemsTotal');
const spBillIdInput = document.getElementById('spBillId');
const spPoIdInput = document.getElementById('spPoId');
const supplierGstinLookupBtn = document.getElementById('supplierGstinLookupBtn');
const supplierGstinLookupStatus = document.getElementById('supplierGstinLookupStatus');

let currentSupplierId = null;
let suppliersCache = [];
let billMaterialsCache = [];
let supplierGstinLookupInProgress = false;

const MATERIAL_TYPES = ['Cement', 'Sand', 'Dust', 'Aggregate', 'Steel'];

document.addEventListener('DOMContentLoaded', async () => {
    await checkAuth();
    resetSupplierMaterialRows();
    populateTypeFilter();
    loadSuppliers();

    window.addEventListener('sectionChanged', (e) => {
        if (e.detail === 'suppliers' || e.detail === 'supply') loadSuppliers();
    });
    window.addEventListener('paymentsUpdated', () => {
        loadSuppliers();
    });

    if (addSupplierBtn) {
        addSupplierBtn.addEventListener('click', () => {
            currentSupplierId = null;
            supplierForm.reset();
            setSupplierGstinLookupStatus('');
            resetSupplierMaterialRows();
            const creditDays = document.getElementById('supplierCreditDays');
            if (creditDays) creditDays.value = 0;
            const paymentTerms = document.getElementById('supplierPaymentTerms');
            if (paymentTerms) paymentTerms.value = 'Cash';
            const status = document.getElementById('supplierStatus');
            if (status) status.value = 'Active';
            setCreditDaysVisibility();
            document.querySelector('#supplierModal .modal-title').textContent = 'Add Supplier';
            new bootstrap.Modal(supplierModal).show();
        });
    }

    if (saveSupplierBtn) {
        saveSupplierBtn.addEventListener('click', saveSupplier);
    }
    const supplierGstinInput = document.getElementById('supplierGstin');
    if (supplierGstinInput) {
        supplierGstinInput.addEventListener('input', () => {
            supplierGstinInput.value = normalizeGstin(supplierGstinInput.value);
            setSupplierGstinLookupStatus('');
        });
        supplierGstinInput.addEventListener('blur', () => lookupSupplierTaxpayer(false));
        supplierGstinInput.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                lookupSupplierTaxpayer(true);
            }
        });
    }
    if (supplierGstinLookupBtn) {
        supplierGstinLookupBtn.addEventListener('click', () => lookupSupplierTaxpayer(true));
    }

    const supplierPaymentTerms = document.getElementById('supplierPaymentTerms');
    if (supplierPaymentTerms) {
        supplierPaymentTerms.addEventListener('change', setCreditDaysVisibility);
    }
    if (addSupplierMaterialBtn) {
        addSupplierMaterialBtn.addEventListener('click', () => addSupplierMaterialRow(''));
    }
    if (supplierMaterialsContainer) {
        supplierMaterialsContainer.addEventListener('click', (e) => {
            const target = e.target instanceof Element ? e.target.closest('.remove-supplier-material-btn') : null;
            if (!target) return;
            const row = target.closest('.supplier-material-row');
            if (!row) return;
            const allRows = supplierMaterialsContainer.querySelectorAll('.supplier-material-row');
            if (allRows.length <= 1) {
                const select = row.querySelector('.supplier-material-select');
                if (select) select.value = '';
                return;
            }
            row.remove();
        });
    }

    if (searchSuppliers) {
        searchSuppliers.addEventListener('input', renderSupplierCards);
    }

    if (filterSupplierType) {
        filterSupplierType.addEventListener('change', renderSupplierCards);
    }
    if (filterSupplierStatus) {
        filterSupplierStatus.addEventListener('change', renderSupplierCards);
    }

    if (saveSupplierPaymentBtn) {
        saveSupplierPaymentBtn.addEventListener('click', saveSupplierPayment);
    }
    if (spAddBillItemBtn) {
        spAddBillItemBtn.addEventListener('click', () => addBillItemRow());
    }
    if (spBillItemsBody) {
        spBillItemsBody.addEventListener('change', (e) => {
            const materialSelect = e.target.closest('.sp-bill-material');
            if (materialSelect) {
                const row = materialSelect.closest('tr');
                const rateEl = row?.querySelector('.sp-bill-rate');
                const selectedRate = Number(materialSelect.selectedOptions?.[0]?.dataset?.rate || 0);
                if (rateEl && Number(rateEl.value || 0) <= 0 && selectedRate > 0) {
                    rateEl.value = String(selectedRate);
                }
            }
            recalculateBillAmountFromRows();
        });
        spBillItemsBody.addEventListener('input', recalculateBillAmountFromRows);
        spBillItemsBody.addEventListener('click', (e) => {
            const removeBtn = e.target.closest('.sp-bill-remove');
            if (!removeBtn) return;
            const rows = spBillItemsBody.querySelectorAll('tr');
            if (rows.length <= 1) return;
            removeBtn.closest('tr')?.remove();
            recalculateBillAmountFromRows();
        });
    }
    if (supplierPaymentModal) {
        supplierPaymentModal.addEventListener('hidden.bs.modal', () => {
            resetSupplierPaymentTxId();
            setBillModeUI(false);
        });
    }

    if (filterSupplierLedgerBtn) {
        filterSupplierLedgerBtn.addEventListener('click', loadSupplierLedgerData);
    }

    if (exportSuppliersCsvBtn) {
        exportSuppliersCsvBtn.addEventListener('click', exportSuppliersCSV);
    }

    if (exportSuppliersPdfBtn) {
        exportSuppliersPdfBtn.addEventListener('click', exportSuppliersPDF);
    }
});

const normalizeName = (value) => (value || '').trim().replace(/\s+/g, ' ').toLowerCase();
const normalizeRef = (value) => (value || '').trim().toLowerCase();
const escapeHtml = (value) => String(value || '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
}[ch]));

function setSupplierGstinLookupStatus(message = '', tone = '') {
    if (!supplierGstinLookupStatus) return;
    supplierGstinLookupStatus.textContent = message || '';
    supplierGstinLookupStatus.classList.remove('text-success', 'text-danger', 'text-muted');
    if (tone === 'success') supplierGstinLookupStatus.classList.add('text-success');
    else if (tone === 'danger') supplierGstinLookupStatus.classList.add('text-danger');
    else if (message) supplierGstinLookupStatus.classList.add('text-muted');
}

function applyTaxpayerDataToSupplier(details = {}) {
    const supplierNameEl = document.getElementById('supplierName');
    const supplierAddressEl = document.getElementById('supplierAddress');
    const gstinEl = document.getElementById('supplierGstin');
    const normalizedGstin = normalizeGstin(details.gstin || '');
    if (gstinEl && normalizedGstin) gstinEl.value = normalizedGstin;
    const supplierName = details.tradeName || details.legalName || '';
    if (supplierNameEl && supplierName && !supplierNameEl.value.trim()) {
        supplierNameEl.value = supplierName;
    }
    if (supplierAddressEl && details.address && !supplierAddressEl.value.trim()) {
        supplierAddressEl.value = details.address;
    }
}

async function lookupSupplierTaxpayer(manual = false) {
    if (supplierGstinLookupInProgress) return;
    const gstinEl = document.getElementById('supplierGstin');
    const gstin = normalizeGstin(gstinEl?.value || '');
    if (gstinEl) gstinEl.value = gstin;
    if (!gstin) return;
    if (!isValidGstin(gstin)) {
        if (manual) {
            setSupplierGstinLookupStatus('Enter valid GSTIN before search.', 'danger');
            showAlert('danger', 'Enter a valid GSTIN.');
        }
        return;
    }

    supplierGstinLookupInProgress = true;
    if (supplierGstinLookupBtn) {
        supplierGstinLookupBtn.disabled = true;
        supplierGstinLookupBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Searching';
    }
    setSupplierGstinLookupStatus('Validating GSTIN...', '');
    try {
        const details = deriveTaxpayerDetailsFromGstin(gstin);
        if (!details) throw new Error('Enter a valid GSTIN.');
        applyTaxpayerDataToSupplier(details);
        setSupplierGstinLookupStatus('GSTIN verified. Enter supplier name/address manually.', 'success');
    } catch (error) {
        console.error('Supplier GST lookup failed:', error);
        const message = error?.message || 'GSTIN validation failed.';
        setSupplierGstinLookupStatus(message, 'danger');
        if (manual) showAlert('danger', message);
    } finally {
        supplierGstinLookupInProgress = false;
        if (supplierGstinLookupBtn) {
            supplierGstinLookupBtn.disabled = false;
            supplierGstinLookupBtn.innerHTML = '<i class="fas fa-search me-1"></i>Search';
        }
    }
}

function createClientTxId() {
    if (window.crypto?.randomUUID) return `sup_pay_${window.crypto.randomUUID()}`;
    return `sup_pay_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function resetSupplierPaymentTxId() {
    if (saveSupplierPaymentBtn) {
        saveSupplierPaymentBtn.dataset.clientTxId = createClientTxId();
    }
}

async function hasRecentDuplicateSupplierPayment(businessId, {
    supplierId = '',
    supplierName = '',
    amount = 0,
    date = null,
    mode = '',
    reference = '',
    labourPayableId = ''
}) {
    const snap = await db.collection('users').doc(businessId).collection('transactions')
        .where('type', '==', 'SupplierPayment')
        .limit(250)
        .get();

    const inputDate = date instanceof Date ? date : new Date(date);
    const inputDay = Number.isNaN(inputDate.getTime()) ? '' : inputDate.toISOString().split('T')[0];
    const amountRounded = Math.round(Number(amount || 0) * 100) / 100;
    const modeNorm = (mode || '').trim().toLowerCase();
    const refNorm = normalizeRef(reference);
    const supplierNorm = normalizeName(supplierName);
    const now = Date.now();

    for (const doc of snap.docs) {
        const tx = doc.data() || {};
        const txAmount = Math.round(Number(tx.amount || 0) * 100) / 100;
        if (txAmount !== amountRounded) continue;

        const supplierMatch = (supplierId && tx.supplierId === supplierId)
            || (supplierNorm && normalizeName(tx.supplier || '') === supplierNorm);
        if (!supplierMatch) continue;

        if (labourPayableId && tx.payableId && tx.payableId !== labourPayableId) continue;
        if ((tx.mode || '').trim().toLowerCase() !== modeNorm) continue;
        if (normalizeRef(tx.reference || '') !== refNorm) continue;

        const txDate = tx.date?.toDate ? tx.date.toDate() : (tx.date ? new Date(tx.date) : null);
        const txDay = txDate && !Number.isNaN(txDate.getTime()) ? txDate.toISOString().split('T')[0] : '';
        if (txDay !== inputDay) continue;

        const createdAt = tx.createdAt?.toDate ? tx.createdAt.toDate() : (tx.createdAt ? new Date(tx.createdAt) : null);
        const createdMs = createdAt && !Number.isNaN(createdAt.getTime()) ? createdAt.getTime() : 0;
        if (!createdMs || (now - createdMs) <= 5 * 60 * 1000) return true;
    }

    return false;
}

function isPurchaseBillsRoute() {
    return window.location.hash === '#purchase-bills';
}

function setBillModeUI(enabled) {
    if (spBillItemsWrap) spBillItemsWrap.classList.toggle('d-none', !enabled);
    if (spBillModeInfo) spBillModeInfo.classList.toggle('d-none', !enabled);
    if (spBillIdInput && !enabled) spBillIdInput.value = '';
    if (spPoIdInput && !enabled) spPoIdInput.value = '';
    if (!enabled && spBillItemsBody) spBillItemsBody.innerHTML = '';
    if (enabled && spBillItemsBody && !spBillItemsBody.children.length) addBillItemRow();
    recalculateBillAmountFromRows();
}

async function loadBillMaterials() {
    const user = JSON.parse(localStorage.getItem('user') || 'null');
    if (!user) {
        billMaterialsCache = [];
        return;
    }
    const businessId = user.businessId || user.uid;
    const rawTokens = ['raw material', 'cement', 'sand', 'dust', 'aggregate', 'steel', 'fly ash', 'admixture', 'chemical'];
    const snap = await db.collection('users').doc(businessId).collection('inventory').orderBy('name').get();
    billMaterialsCache = snap.docs
        .map((doc) => ({ id: doc.id, ...doc.data() }))
        .filter((item) => {
            const category = String(item.category || '').toLowerCase();
            const materialType = String(item.materialType || '').toLowerCase();
            return materialType === 'raw' || rawTokens.some((token) => category.includes(token));
        });
}

function getBillMaterialOptionsHtml() {
    const options = ['<option value="">Select Material</option>'];
    billMaterialsCache.forEach((item) => {
        const rate = Number(item.standardRate ?? item.costPrice ?? item.unitCost ?? 0) || 0;
        const name = escapeHtml(item.name || 'Material');
        options.push(`<option value="${item.id}" data-rate="${rate}">${name}</option>`);
    });
    return options.join('');
}

function addBillItemRow(prefill = {}) {
    if (!spBillItemsBody) return;
    const tr = document.createElement('tr');
    tr.innerHTML = `
        <td>
            <select class="form-select form-select-sm sp-bill-material">
                ${getBillMaterialOptionsHtml()}
            </select>
        </td>
        <td><input type="number" class="form-control form-control-sm sp-bill-qty" min="0.001" step="0.001" value="${Number(prefill.qty || 1)}"></td>
        <td><input type="number" class="form-control form-control-sm sp-bill-rate" min="0" step="0.01" value="${Number(prefill.rate || 0)}"></td>
        <td class="sp-bill-amount text-end">&#8377;0.00</td>
        <td>
            <button type="button" class="btn btn-sm btn-outline-danger sp-bill-remove" title="Remove">
                <i class="fas fa-times"></i>
            </button>
        </td>
    `;
    const select = tr.querySelector('.sp-bill-material');
    if (prefill.materialId) select.value = prefill.materialId;
    if (!prefill.rate && select?.selectedOptions?.[0]?.dataset?.rate) {
        const r = Number(select.selectedOptions[0].dataset.rate || 0);
        if (r > 0) tr.querySelector('.sp-bill-rate').value = String(r);
    }
    spBillItemsBody.appendChild(tr);
    recalculateBillAmountFromRows();
}

function recalculateBillAmountFromRows() {
    let total = 0;
    if (spBillItemsBody) {
        spBillItemsBody.querySelectorAll('tr').forEach((row) => {
            const qty = Number(row.querySelector('.sp-bill-qty')?.value || 0);
            const rate = Number(row.querySelector('.sp-bill-rate')?.value || 0);
            const amount = Math.max(0, qty * rate);
            total += amount;
            const amountEl = row.querySelector('.sp-bill-amount');
            if (amountEl) amountEl.innerHTML = `&#8377;${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        });
    }
    if (spBillItemsTotal) {
        spBillItemsTotal.innerHTML = `&#8377;${total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    if (isPurchaseBillsRoute()) {
        const amountEl = document.getElementById('spAmount');
        if (amountEl) amountEl.value = total > 0 ? total.toFixed(2) : '';
    }
    return Math.round(total * 100) / 100;
}

function getBillItemsFromRows() {
    if (!spBillItemsBody) return [];
    const rows = [];
    spBillItemsBody.querySelectorAll('tr').forEach((row) => {
        const select = row.querySelector('.sp-bill-material');
        const materialId = String(select?.value || '').trim();
        const materialName = String(select?.selectedOptions?.[0]?.textContent || '').trim();
        const qty = Number(row.querySelector('.sp-bill-qty')?.value || 0);
        const rate = Number(row.querySelector('.sp-bill-rate')?.value || 0);
        if (!materialId || !materialName || qty <= 0) return;
        rows.push({
            materialId,
            materialName,
            qty: Math.round(qty * 1000) / 1000,
            rate: Math.round(rate * 100) / 100,
            amount: Math.round(qty * rate * 100) / 100
        });
    });
    return rows;
}

async function resolvePurchaseOrderRef(t, businessId, poId) {
    const poRefPrimary = db.collection('users').doc(businessId).collection('purchase_orders').doc(poId);
    const poDocPrimary = await t.get(poRefPrimary);
    if (poDocPrimary.exists) return { ref: poRefPrimary, doc: poDocPrimary };
    const poRefFallback = db.collection('users').doc(businessId).collection('orders').doc(poId);
    const poDocFallback = await t.get(poRefFallback);
    if (poDocFallback.exists) return { ref: poRefFallback, doc: poDocFallback };
    return { ref: null, doc: null };
}

function setCreditDaysVisibility() {
    const terms = document.getElementById('supplierPaymentTerms');
    const creditDays = document.getElementById('supplierCreditDays');
    if (!terms || !creditDays) return;
    const wrapper = creditDays.closest('.col-md-6') || creditDays.parentElement;
    const isCredit = terms.value === 'Credit';
    if (wrapper) wrapper.classList.toggle('d-none', !isCredit);
    if (!isCredit) creditDays.value = 0;
}

function addSupplierMaterialRow(value = '') {
    if (!supplierMaterialsContainer) return;
    const allTypes = Array.from(new Set([...MATERIAL_TYPES, ...(value ? [value] : [])]));
    const options = ['<option value="">Select material</option>']
        .concat(allTypes.map((type) => `<option value="${type.replace(/"/g, '&quot;')}">${type}</option>`))
        .join('');
    const row = document.createElement('div');
    row.className = 'input-group mb-2 supplier-material-row';
    row.innerHTML = `
        <select class="form-select supplier-material-select">${options}</select>
        <button type="button" class="btn btn-outline-danger remove-supplier-material-btn">Remove</button>
    `;
    supplierMaterialsContainer.appendChild(row);
    const select = row.querySelector('.supplier-material-select');
    if (select && value) select.value = value;
}

function resetSupplierMaterialRows(values = ['']) {
    if (!supplierMaterialsContainer) return;
    supplierMaterialsContainer.innerHTML = '';
    const list = Array.isArray(values) && values.length ? values : [''];
    list.forEach((value) => addSupplierMaterialRow(value));
}

function getSupplierMaterials() {
    if (!supplierMaterialsContainer) return [];
    const seen = new Set();
    const materials = [];
    supplierMaterialsContainer.querySelectorAll('.supplier-material-select').forEach((select) => {
        const value = (select.value || '').trim();
        const key = value.toLowerCase();
        if (!value || seen.has(key)) return;
        seen.add(key);
        materials.push(value);
    });
    return materials;
}

function populateTypeFilter() {
    if (!filterSupplierType) return;
    filterSupplierType.innerHTML = '<option value="all">All Materials</option>';
    MATERIAL_TYPES.forEach(type => {
        filterSupplierType.innerHTML += `<option value="${type}">${type}</option>`;
    });
}

async function loadSuppliers() {
    const user = JSON.parse(localStorage.getItem('user'));
    if (!user || !suppliersContainer) return;
    const businessId = user.businessId || user.uid;

    suppliersContainer.innerHTML = '<div class="col-12 text-center p-5"><span class="spinner-border"></span></div>';

    try {
        const snapshot = await db.collection('users').doc(businessId).collection('suppliers').orderBy('name').get();

        suppliersCache = [];
        snapshot.forEach(doc => {
            suppliersCache.push({ id: doc.id, ...doc.data() });
        });

        renderSupplierCards();

    } catch (error) {
        console.error("Error loading suppliers", error);
        suppliersContainer.innerHTML = '<div class="col-12 text-center text-danger p-5">Error loading data</div>';
    }
}

function renderSupplierCards() {
    suppliersContainer.innerHTML = '';

    const searchTerm = searchSuppliers ? searchSuppliers.value.toLowerCase() : '';
    const filterType = filterSupplierType ? filterSupplierType.value : 'all';
    const statusFilter = filterSupplierStatus ? filterSupplierStatus.value : 'all';

    const filtered = suppliersCache.filter(s => {
        const matchesSearch = (s.name || '').toLowerCase().includes(searchTerm) ||
            (s.contactPerson || '').toLowerCase().includes(searchTerm) ||
            (s.phone || '').includes(searchTerm);
        const materials = Array.isArray(s.materialsSupplied) ? s.materialsSupplied : [];
        const matchesType = filterType === 'all' || materials.includes(filterType);
        const status = s.status || 'Active';
        const matchesStatus = statusFilter === 'all' || status === statusFilter;
        return matchesSearch && matchesType && matchesStatus;
    });

    if (filtered.length === 0) {
        suppliersContainer.innerHTML = '<div class="col-12 text-center text-muted p-5"><h5>No suppliers found</h5></div>';
        return;
    }

    const user = JSON.parse(localStorage.getItem('user'));
    const canDelete = user.permissions ? user.permissions.canDelete : true;

    filtered.forEach(s => {
        const materialsBadge = getMaterialsBadges(s.materialsSupplied);
        const escape = (str) => (str || '').replace(/'/g, "\\'");

        const totalPurchase = s.totalPurchase || 0;
        const balance = s.balance || 0;
        const balanceClass = balance > 0 ? 'text-danger' : 'text-success';

        const cardHtml = `
        <div class="col-xl-4 col-md-6 mb-4">
            <div class="card h-100 shadow-sm border-start-primary">
                <div class="card-body d-flex flex-column">
                    <div class="d-flex justify-content-between">
                        <div>
                            <h5 class="card-title fw-bold text-primary mb-1">${s.name}</h5>
                            ${materialsBadge}
                        </div>
                        <div class="dropdown">
                            <button class="btn btn-link text-secondary p-0" type="button" data-bs-toggle="dropdown" data-bs-boundary="window"><i class="fas fa-ellipsis-v"></i></button>
                            <ul class="dropdown-menu dropdown-menu-end">
                                <li><a class="dropdown-item" href="#" onclick="window.editSupplier('${s.id}')"><i class="fas fa-edit fa-fw me-2"></i>Edit</a></li>
                                <li><a class="dropdown-item" href="#" onclick="window.recordSupplierPayment('${s.id}', '${escape(s.name)}')"><i class="fas fa-money-bill-wave fa-fw me-2"></i>Record Payment</a></li>
                                <li><a class="dropdown-item" href="#" onclick="window.viewSupplierLedger('${s.id}', '${escape(s.name)}')"><i class="fas fa-book fa-fw me-2"></i>View Ledger</a></li>
                                <li><a class="dropdown-item" href="#" onclick="window.viewSupplierHistory('${s.id}', '${escape(s.name)}')"><i class="fas fa-history fa-fw me-2"></i>Purchase History</a></li>
                                ${canDelete ? `<li><hr class="dropdown-divider"></li><li><a class="dropdown-item text-danger" href="#" onclick="window.deleteSupplier('${s.id}')"><i class="fas fa-trash fa-fw me-2"></i>Delete</a></li>` : ''}
                            </ul>
                        </div>
                    </div>
                    <div class="mt-3">
                        <p class="card-text mb-2"><i class="fas fa-user-tie fa-fw me-2 text-muted"></i> ${s.contactPerson || 'N/A'}</p>
                        <p class="card-text mb-2"><i class="fas fa-phone fa-fw me-2 text-muted"></i> ${s.phone || 'N/A'}</p>
                    </div>
                    
                    <div class="row g-2 mt-3">
                        <div class="col-6">
                            <div class="p-2 bg-light rounded border text-center">
                                <small class="d-block text-muted text-uppercase" style="font-size:0.65rem;">Purchases</small>
                                <span class="fw-bold text-dark">₹${totalPurchase.toLocaleString()}</span>
                            </div>
                        </div>
                        <div class="col-6">
                            <div class="p-2 bg-light rounded border text-center">
                                <small class="d-block text-muted text-uppercase" style="font-size:0.65rem;">Balance</small>
                                <span class="fw-bold ${balanceClass}">₹${balance.toLocaleString()}</span>
                            </div>
                        </div>
                    </div>

                    <div class="mt-auto pt-3 border-top border-light">
                        <small class="text-muted">GSTIN: <strong>${s.gstin || 'N/A'}</strong></small>
                    </div>
                </div>
            </div>
        </div>
        `;
        suppliersContainer.innerHTML += cardHtml;
    });
}

function getSuppliersExportRows() {
    return suppliersCache.map(s => ([
        s.name || '',
        (s.materialsSupplied || []).join(', '),
        s.contactPerson || '',
        s.phone || '',
        s.altPhone || '',
        s.address || '',
        s.gstin || '',
        s.paymentTerms || '',
        s.creditDays ?? 0,
        s.status || '',
        s.notes || '',
        s.totalPurchase ?? 0,
        s.balance ?? 0
    ]));
}

function exportSuppliersCSV() {
    if (!suppliersCache.length) {
        alert('No suppliers to export.');
        return;
    }

    const headers = ['Name', 'Materials Supplied', 'Contact Person', 'Phone', 'Alternate Phone', 'Address', 'GSTIN', 'Payment Terms', 'Credit Days', 'Status', 'Notes', 'Total Purchase', 'Balance'];
    const rows = getSuppliersExportRows();
    const filename = `suppliers_${new Date().toISOString().split('T')[0]}.csv`;
    downloadCSV(filename, headers, rows);
}

function exportSuppliersPDF() {
    if (!suppliersCache.length) {
        alert('No suppliers to export.');
        return;
    }

    const headers = ['Name', 'Materials Supplied', 'Contact Person', 'Phone', 'Alternate Phone', 'Address', 'GSTIN', 'Payment Terms', 'Credit Days', 'Status', 'Notes', 'Total Purchase', 'Balance'];
    const rows = getSuppliersExportRows();
    const filename = `suppliers_${new Date().toISOString().split('T')[0]}.pdf`;
    downloadPDF(filename, 'Suppliers Report', headers, rows);
}

function getMaterialsBadges(materials) {
    const map = {
        'Cement': 'bg-secondary',
        'Sand': 'bg-warning text-dark',
        'Dust': 'bg-dark',
        'Aggregate': 'bg-info text-dark',
        'Steel': 'bg-danger'
    };
    const list = Array.isArray(materials) ? materials : [];
    if (!list.length) return '<span class="badge bg-light text-dark border">Unspecified</span>';
    return list.slice(0, 3).map(m => `<span class="badge ${map[m] || 'bg-light text-dark border'} me-1">${m}</span>`).join('');
}

async function saveSupplier() {
    const user = JSON.parse(localStorage.getItem('user'));
    const name = document.getElementById('supplierName').value;
    const businessId = user.businessId || user.uid;

    const trimmedName = name.trim();
    const normalizedName = normalizeName(trimmedName);
    if (!trimmedName) return alert("Supplier Name is required");

    const btn = document.getElementById('saveSupplierBtn');
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Saving...';

    try {
        const materialsSupplied = getSupplierMaterials();
        const data = {
            name: trimmedName,
            contactPerson: document.getElementById('supplierContact').value,
            phone: document.getElementById('supplierPhone').value,
            address: document.getElementById('supplierAddress').value,
            gstin: document.getElementById('supplierGstin').value,
            materialsSupplied,
            paymentTerms: document.getElementById('supplierPaymentTerms').value,
            creditDays: parseInt(document.getElementById('supplierCreditDays').value) || 0,
            status: document.getElementById('supplierStatus').value,
            notes: document.getElementById('supplierNotes').value,
            updatedAt: new Date()
        };

        const duplicate = suppliersCache.find(s => normalizeName(s.name) === normalizedName);
        if (currentSupplierId) {
            if (duplicate && duplicate.id !== currentSupplierId) {
                showAlert('warning', 'Supplier already exists. Please edit the existing entry.');
                return;
            }
            await db.collection('users').doc(businessId).collection('suppliers').doc(currentSupplierId).update(data);
            showAlert('success', 'Supplier updated successfully');
        } else {
            if (duplicate) {
                showAlert('warning', 'Supplier already exists. Please edit the existing entry.');
                return;
            }
            data.createdAt = new Date();
            await db.collection('users').doc(businessId).collection('suppliers').add(data);
            showAlert('success', 'Supplier added successfully');
        }

        bootstrap.Modal.getInstance(supplierModal).hide();
        loadSuppliers();
    } catch (error) {
        console.error("Error saving supplier", error);
        showAlert('danger', 'Failed to save supplier');
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}

window.editSupplier = async (id) => {
    const s = suppliersCache.find(sup => sup.id === id);
    if (!s) return;

    currentSupplierId = id;
    document.getElementById('supplierName').value = s.name;
    document.getElementById('supplierContact').value = s.contactPerson || '';
    document.getElementById('supplierPhone').value = s.phone || '';
    document.getElementById('supplierAddress').value = s.address || '';
    document.getElementById('supplierGstin').value = s.gstin || '';
    document.getElementById('supplierPaymentTerms').value = s.paymentTerms || 'Cash';
    document.getElementById('supplierCreditDays').value = s.creditDays ?? 0;
    document.getElementById('supplierStatus').value = s.status || 'Active';
    document.getElementById('supplierNotes').value = s.notes || '';
    setSupplierGstinLookupStatus('');
    setCreditDaysVisibility();

    resetSupplierMaterialRows(Array.isArray(s.materialsSupplied) && s.materialsSupplied.length ? s.materialsSupplied : ['']);

    document.querySelector('#supplierModal .modal-title').textContent = 'Edit Supplier';
    new bootstrap.Modal(supplierModal).show();
};

async function deleteQueryInBatches(query, maxRounds = 20) {
    let deleted = 0;
    for (let i = 0; i < maxRounds; i += 1) {
        const snap = await query.limit(400).get();
        if (snap.empty) break;
        const batch = db.batch();
        snap.docs.forEach((doc) => {
            batch.delete(doc.ref);
            deleted += 1;
        });
        await batch.commit();
        if (snap.size < 400) break;
    }
    return deleted;
}

async function deleteDocsInBatches(docs, chunkSize = 400) {
    let deleted = 0;
    for (let i = 0; i < docs.length; i += chunkSize) {
        const slice = docs.slice(i, i + chunkSize);
        if (!slice.length) continue;
        const batch = db.batch();
        slice.forEach((doc) => {
            batch.delete(doc.ref);
            deleted += 1;
        });
        await batch.commit();
    }
    return deleted;
}

window.deleteSupplier = async (id) => {
    const confirmed = await window.showConfirmAsync('Delete Supplier', 'Delete this supplier and all related supplier/material transactions?', {
        confirmText: 'Delete',
        cancelText: 'Cancel'
    });
    if (!confirmed) return;
    const user = JSON.parse(localStorage.getItem('user'));
    if (user.permissions && user.permissions.canDelete === false) {
        return showAlert('danger', 'You do not have permission to delete items.');
    }

    const businessId = user.businessId || user.uid;
    try {
        const root = db.collection('users').doc(businessId);
        const supplierRef = root.collection('suppliers').doc(id);
        const supplierDoc = await supplierRef.get();
        const supplierName = String(supplierDoc.data()?.name || '').trim();

        const normalizedSupplierName = normalizeName(supplierName);
        const [deletedBySupplierId, deletedPurchases, deletedPurchaseReturnsById] = await Promise.all([
            deleteQueryInBatches(root.collection('transactions').where('type', '==', 'SupplierPayment').where('supplierId', '==', id)),
            supplierName ? deleteQueryInBatches(root.collection('purchases').where('supplier', '==', supplierName)) : Promise.resolve(0),
            deleteQueryInBatches(root.collection('purchase_returns').where('supplierId', '==', id))
        ]);

        const [deletedBySupplierName, deletedPurchaseReturnsByName] = supplierName
            ? await Promise.all([
                deleteQueryInBatches(root.collection('transactions').where('type', '==', 'SupplierPayment').where('supplier', '==', supplierName)),
                deleteQueryInBatches(root.collection('purchase_returns').where('supplierName', '==', supplierName))
            ])
            : [0, 0];
        let fallbackDeleted = 0;

        if (normalizedSupplierName) {
            const [allPurchasesSnap, allSupplierTxSnap, allPurchaseReturnsSnap] = await Promise.all([
                root.collection('purchases').get(),
                root.collection('transactions').where('type', '==', 'SupplierPayment').get(),
                root.collection('purchase_returns').get()
            ]);
            const purchaseDocsToDelete = allPurchasesSnap.docs.filter((doc) => {
                const supplier = normalizeName(doc.data()?.supplier || '');
                return supplier === normalizedSupplierName;
            });
            const supplierTxDocsToDelete = allSupplierTxSnap.docs.filter((doc) => {
                const data = doc.data() || {};
                const supplierByName = normalizeName(data.supplier || '') === normalizedSupplierName;
                const supplierById = data.supplierId === id;
                return supplierByName || supplierById;
            });
            const purchaseReturnDocsToDelete = allPurchaseReturnsSnap.docs.filter((doc) => {
                const data = doc.data() || {};
                const supplierByName = normalizeName(data.supplierName || data.party || '') === normalizedSupplierName;
                const supplierById = data.supplierId === id;
                return supplierByName || supplierById;
            });
            fallbackDeleted += await deleteDocsInBatches(purchaseDocsToDelete);
            fallbackDeleted += await deleteDocsInBatches(supplierTxDocsToDelete);
            fallbackDeleted += await deleteDocsInBatches(purchaseReturnDocsToDelete);
        }

        await supplierRef.delete();
        loadSuppliers();
        window.dispatchEvent(new CustomEvent('paymentsUpdated'));
        const totalRelated = deletedBySupplierId + deletedPurchases + deletedPurchaseReturnsById + deletedBySupplierName + deletedPurchaseReturnsByName + fallbackDeleted;
        showAlert('success', `Supplier deleted${totalRelated ? ` with ${totalRelated} related entries removed` : ''}`);
    } catch (e) {
        console.error(e);
        showAlert('danger', 'Failed to delete');
    }
};

window.viewSupplierHistory = async (supplierId, supplierName) => {
    const user = JSON.parse(localStorage.getItem('user'));
    const businessId = user.businessId || user.uid;
    const historyModal = new bootstrap.Modal(document.getElementById('supplierHistoryModal'));
    const tbody = document.querySelector('#supplierHistoryTable tbody');
    document.getElementById('historySupplierName').textContent = supplierName;

    tbody.innerHTML = '<tr><td colspan="5" class="text-center">Loading...</td></tr>';
    historyModal.show();

    try {
        const root = db.collection('users').doc(businessId);
        const [legacyPurchasesSnap, purchaseBillsSnap] = await Promise.all([
            root.collection('purchases')
                .where('supplier', '==', supplierName)
                .orderBy('date', 'desc')
                .get(),
            supplierId
                ? root.collection('purchase_bills')
                    .where('supplierId', '==', supplierId)
                    .orderBy('date', 'desc')
                    .get()
                : root.collection('purchase_bills')
                    .where('supplierName', '==', supplierName)
                    .orderBy('date', 'desc')
                    .get()
        ]);

        const rows = [];
        legacyPurchasesSnap.forEach((doc) => {
            const p = doc.data() || {};
            const date = p.date?.toDate ? p.date.toDate() : new Date(p.date || Date.now());
            rows.push({
                date,
                itemName: p.itemName || 'Raw Material',
                quantity: Number(p.quantity || 0),
                unitCost: Number(p.unitCost || 0),
                reference: p.invoiceNo || '-'
            });
        });

        purchaseBillsSnap.forEach((doc) => {
            const b = doc.data() || {};
            const date = b.date?.toDate ? b.date.toDate() : new Date(b.date || Date.now());
            const items = Array.isArray(b.items) ? b.items : [];
            items.forEach((item) => {
                rows.push({
                    date,
                    itemName: item.materialName || item.materialId || 'Raw Material',
                    quantity: Number(item.qty || 0),
                    unitCost: Number(item.rate || 0),
                    reference: b.reference || b.poId || doc.id
                });
            });
        });

        rows.sort((a, b) => b.date - a.date);
        tbody.innerHTML = '';
        if (!rows.length) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center">No purchase history found</td></tr>';
            return;
        }

        rows.forEach((p) => {
            tbody.innerHTML += `
                <tr>
                    <td>${formatDate(p.date)}</td>
                    <td>${p.itemName}</td>
                    <td>${p.quantity}</td>
                    <td>&#8377;${Number(p.unitCost || 0).toLocaleString()}</td>
                    <td>${p.reference || '-'}</td>
                </tr>
            `;
        });
    } catch (error) {
        console.error(error);
        tbody.innerHTML = '<tr><td colspan="5" class="text-center text-danger">Error loading history</td></tr>';
    }
};

window.recordSupplierPayment = (id, name, prefill = {}) => {
    document.getElementById('spId').value = id;
    document.getElementById('spName').value = name;
    const labourPayableInput = document.getElementById('spLabourPayableId');
    if (labourPayableInput) labourPayableInput.value = '';
    if (spBillIdInput) spBillIdInput.value = '';
    if (spPoIdInput) spPoIdInput.value = String(prefill?.poId || '').trim();
    document.getElementById('spNameDisplay').value = name;
    const spDateEl = document.getElementById('spDate');
    if (spDateEl) {
        const prefillDate = prefill?.date ? new Date(prefill.date) : null;
        spDateEl.valueAsDate = (prefillDate && !Number.isNaN(prefillDate.getTime())) ? prefillDate : new Date();
    }
    const spAmountEl = document.getElementById('spAmount');
    if (spAmountEl) spAmountEl.value = Number(prefill?.amount || 0) > 0 ? String(Number(prefill.amount)) : '';
    const amountInput = document.getElementById('spAmount');
    if (amountInput) amountInput.removeAttribute('max');
    document.getElementById('spRef').value = prefill?.reference || '';
    document.getElementById('spNotes').value = prefill?.notes || '';
    const spModeEl = document.getElementById('spMode');
    if (spModeEl && prefill?.mode) spModeEl.value = prefill.mode;
    const labourInfo = document.getElementById('spLabourDueInfo');
    if (labourInfo) {
        labourInfo.classList.add('d-none');
        labourInfo.textContent = '';
    }

    const billMode = isPurchaseBillsRoute();
    setBillModeUI(billMode);
    if (billMode) {
        loadBillMaterials()
            .then(() => {
                if (spBillItemsBody) spBillItemsBody.innerHTML = '';
                const poItems = Array.isArray(prefill?.poItems) ? prefill.poItems : [];
                if (poItems.length) {
                    poItems.forEach((item) => {
                        addBillItemRow({
                            materialId: item.materialId || '',
                            qty: Number(item.qty || 0),
                            rate: Number(item.unitCost ?? item.rate ?? item.cost ?? 0)
                        });
                    });
                } else {
                    addBillItemRow();
                }
                recalculateBillAmountFromRows();
            })
            .catch((error) => {
                console.error('Failed to load bill materials', error);
                showAlert('danger', 'Failed to load bill materials');
            });
    }

    resetSupplierPaymentTxId();
    new bootstrap.Modal(supplierPaymentModal).show();
};

window.recordLabourPayment = async (payableId) => {
    if (!payableId) return;
    const user = JSON.parse(localStorage.getItem('user'));
    const businessId = user?.businessId || user?.uid;
    if (!businessId) return;
    try {
        const payableDoc = await db.collection('users').doc(businessId).collection('labour_payables').doc(payableId).get();
        if (!payableDoc.exists) return showAlert('danger', 'Labour due not found');
        const payable = payableDoc.data() || {};
        if (payable.isDeleted) return showAlert('danger', 'Selected labour due is deleted');
        const amountDue = Number(payable.amountDue || 0);
        const amountPaid = Math.max(Number(payable.amountPaid || 0), 0);
        const amountPending = Math.max(Number(payable.amountPending ?? (amountDue - amountPaid)), 0);
        if (amountPending <= 0) return showAlert('warning', 'Selected labour due is already paid');

        document.getElementById('spId').value = 'LABOUR';
        document.getElementById('spName').value = 'Labour';
        const labourPayableInput = document.getElementById('spLabourPayableId');
        if (labourPayableInput) labourPayableInput.value = payableId;
        const worker = (payable.workerName || 'Labour').toString().trim() || 'Labour';
        const batch = payable.batchId || '-';
        const date = payable.workDate || '-';
        document.getElementById('spNameDisplay').value = `Labour: ${worker} | Batch ${batch} | ${date}`;
        document.getElementById('spDate').valueAsDate = new Date();
        document.getElementById('spAmount').value = amountPending.toFixed(2);
        document.getElementById('spRef').value = '';
        document.getElementById('spNotes').value = `Labour due payment | Batch ${batch} | Worker ${worker} | Work Date ${date}`;
        const labourInfo = document.getElementById('spLabourDueInfo');
        if (labourInfo) {
            labourInfo.classList.remove('d-none');
            labourInfo.textContent = `Pending labour due: ₹${amountPending.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        }
        const amountInput = document.getElementById('spAmount');
        if (amountInput) amountInput.max = amountPending.toFixed(2);
        setBillModeUI(false);
        resetSupplierPaymentTxId();
        new bootstrap.Modal(supplierPaymentModal).show();
    } catch (error) {
        console.error('Failed to open labour due payment', error);
        showAlert('danger', 'Failed to load labour due');
    }
};

window.editPurchaseBill = async (txId) => {
    if (!txId) return;
    const user = JSON.parse(localStorage.getItem('user') || 'null');
    if (!user) return;
    const businessId = user.businessId || user.uid;
    try {
        const txDoc = await db.collection('users').doc(businessId).collection('transactions').doc(txId).get();
        if (!txDoc.exists) return showAlert('warning', 'Bill transaction not found');
        const tx = txDoc.data() || {};
        if (String(tx.source || '').toLowerCase() !== 'purchase_bill') {
            return showAlert('warning', 'Selected entry is not a purchase bill');
        }
        const billId = tx.billId || txId;
        const billDoc = await db.collection('users').doc(businessId).collection('purchase_bills').doc(billId).get();
        const bill = billDoc.exists ? (billDoc.data() || {}) : {};
        const supplierId = tx.supplierId || bill.supplierId || '';
        const supplierName = tx.supplier || bill.supplierName || '';
        if (!supplierId || !supplierName) return showAlert('danger', 'Bill supplier not found');

        document.getElementById('spId').value = supplierId;
        document.getElementById('spName').value = supplierName;
        document.getElementById('spNameDisplay').value = supplierName;
        document.getElementById('spLabourPayableId').value = '';
        if (spBillIdInput) spBillIdInput.value = billId;
        if (spPoIdInput) spPoIdInput.value = String(bill.poId || tx.poId || '').trim();
        const paidDate = tx.date?.toDate ? tx.date.toDate() : (tx.date ? new Date(tx.date) : new Date());
        document.getElementById('spDate').valueAsDate = Number.isNaN(paidDate.getTime()) ? new Date() : paidDate;
        document.getElementById('spMode').value = tx.mode || 'Cash';
        document.getElementById('spRef').value = tx.reference || '';
        document.getElementById('spNotes').value = tx.description || bill.notes || 'Purchase Bill';

        setBillModeUI(true);
        await loadBillMaterials();
        if (spBillItemsBody) spBillItemsBody.innerHTML = '';
        const items = Array.isArray(bill.items) ? bill.items : [];
        if (items.length) items.forEach((item) => addBillItemRow(item));
        else addBillItemRow();
        recalculateBillAmountFromRows();
        resetSupplierPaymentTxId();
        new bootstrap.Modal(supplierPaymentModal).show();
    } catch (error) {
        console.error('Failed to edit purchase bill', error);
        showAlert('danger', 'Failed to open purchase bill');
    }
};

async function saveSupplierPayment() {
    const user = JSON.parse(localStorage.getItem('user'));
    if (!user) return;
    const businessId = user.businessId || user.uid;
    const btn = document.getElementById('saveSupplierPaymentBtn');
    if (!btn) return;
    const supplierId = document.getElementById('spId').value;
    const supplierName = document.getElementById('spName').value;
    const amount = parseFloat(document.getElementById('spAmount').value);
    const date = document.getElementById('spDate').value;
    const mode = document.getElementById('spMode').value;
    const ref = document.getElementById('spRef').value;
    const notes = document.getElementById('spNotes').value;
    const labourPayableId = document.getElementById('spLabourPayableId')?.value || '';
    const billId = spBillIdInput?.value || '';
    const poId = spPoIdInput?.value || '';
    const billMode = isPurchaseBillsRoute() && !labourPayableId;
    const computedBillTotal = billMode ? recalculateBillAmountFromRows() : amount;
    const paidAt = new Date(date);
    const clientTxId = (btn?.dataset?.clientTxId || '').trim() || createClientTxId();
    if (!computedBillTotal || computedBillTotal <= 0 || !date || Number.isNaN(paidAt.getTime())) {
        return alert('Invalid amount or date');
    }
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Saving...';
    try {
        const duplicate = await hasRecentDuplicateSupplierPayment(businessId, {
            supplierId,
            supplierName,
            amount: computedBillTotal,
            date: paidAt,
            mode,
            reference: ref,
            labourPayableId
        });
        if (!billMode && duplicate) throw new Error('A similar payment was just recorded. Duplicate entry blocked.');
        const txDocId = billMode ? (billId || clientTxId) : clientTxId;
        const txRef = db.collection('users').doc(businessId).collection('transactions').doc(txDocId);
        let created = false;
        if (labourPayableId) {
            await db.runTransaction(async (t) => {
                const existingTx = await t.get(txRef);
                if (existingTx.exists) return;
                const payableRef = db.collection('users').doc(businessId).collection('labour_payables').doc(labourPayableId);
                const payableDoc = await t.get(payableRef);
                if (!payableDoc.exists) throw new Error('Labour payable not found');
                const payable = payableDoc.data() || {};
                if (payable.isDeleted) throw new Error('Selected labour payable is deleted');
                const due = Number(payable.amountDue || 0);
                const paid = Math.max(Number(payable.amountPaid || 0), 0);
                const pending = Math.max(Number(payable.amountPending ?? (due - paid)), 0);
                if (pending <= 0) throw new Error('Labour payable already settled');
                if (amount > pending) throw new Error(`Amount exceeds pending due (${pending.toFixed(2)})`);
                const nextPaid = Math.round((paid + amount) * 100) / 100;
                const nextPending = Math.max(Math.round((due - nextPaid) * 100) / 100, 0);
                const nextStatus = nextPending <= 0 ? 'paid' : 'partial';
                t.set(txRef, {
                    type: 'SupplierPayment',
                    description: notes || `Labour payment | Batch ${payable.batchId || '-'} | Worker ${payable.workerName || 'Labour'} | Work Date ${payable.workDate || '-'}`,
                    supplierId: 'LABOUR',
                    supplier: 'Labour',
                    amount,
                    date: paidAt,
                    mode,
                    reference: ref || `LAB-${String(payable.batchId || '').replace(/\s+/g, '').slice(0, 12)}-${String(payable.workDate || '').replace(/-/g, '')}`,
                    source: 'production_labour',
                    payableId: labourPayableId,
                    runId: payable.runId || null,
                    batchId: payable.batchId || null,
                    labourDate: payable.workDate || null,
                    workerName: payable.workerName || null,
                    clientTxId,
                    createdAt: new Date(),
                    updatedAt: new Date()
                });
                const txIds = Array.isArray(payable.txIds) ? payable.txIds.filter(Boolean) : [];
                txIds.push(txRef.id);
                t.update(payableRef, {
                    amountPaid: nextPaid,
                    amountPending: nextPending,
                    status: nextStatus,
                    paidAt,
                    txIds: Array.from(new Set(txIds)),
                    updatedAt: new Date()
                });
                created = true;
            });
        } else if (billMode) {
            const supplierRef = db.collection('users').doc(businessId).collection('suppliers').doc(supplierId);
            const billRef = db.collection('users').doc(businessId).collection('purchase_bills').doc(txDocId);
            const billItems = getBillItemsFromRows();
            const billTotalFromRows = recalculateBillAmountFromRows();
            if (!billItems.length) throw new Error('Add at least one bill item');
            if (billTotalFromRows <= 0) throw new Error('Bill total must be greater than zero');

            await db.runTransaction(async (t) => {
                const supplierDoc = await t.get(supplierRef);
                if (!supplierDoc.exists) throw new Error('Supplier not found');
                const existingBillDoc = await t.get(billRef);
                const previousBill = existingBillDoc.exists ? (existingBillDoc.data() || {}) : null;
                const previousItems = Array.isArray(previousBill?.items) ? previousBill.items : [];
                const previousTotal = Number(previousBill?.totalAmount || 0);
                const previousPoId = String(previousBill?.poId || '').trim();

                const oldByMaterial = new Map();
                previousItems.forEach((item) => {
                    const mid = String(item.materialId || '').trim();
                    const qty = Number(item.qty || 0);
                    if (!mid || qty <= 0) return;
                    oldByMaterial.set(mid, (oldByMaterial.get(mid) || 0) + qty);
                });
                const newByMaterial = new Map();
                billItems.forEach((item) => {
                    const mid = String(item.materialId || '').trim();
                    const qty = Number(item.qty || 0);
                    if (!mid || qty <= 0) return;
                    newByMaterial.set(mid, (newByMaterial.get(mid) || 0) + qty);
                });

                const materialIds = Array.from(new Set([...oldByMaterial.keys(), ...newByMaterial.keys()]));
                const invUpdates = [];
                for (const materialId of materialIds) {
                    const oldQty = oldByMaterial.get(materialId) || 0;
                    const newQty = newByMaterial.get(materialId) || 0;
                    const delta = Math.round((newQty - oldQty) * 1000) / 1000;
                    if (Math.abs(delta) < 0.000001) continue;
                    const invRef = db.collection('users').doc(businessId).collection('inventory').doc(materialId);
                    const invDoc = await t.get(invRef);
                    if (!invDoc.exists) throw new Error(`Material not found: ${materialId}`);
                    const currentQty = Number(invDoc.data()?.quantity || 0);
                    if (delta < 0 && currentQty < Math.abs(delta)) {
                        throw new Error(`Cannot reduce bill quantity. Insufficient stock for ${invDoc.data()?.name || materialId}`);
                    }
                    invUpdates.push({
                        ref: invRef,
                        quantity: Math.round((currentQty + delta) * 1000) / 1000
                    });
                }

                const statusUpdates = [];
                if (poId) {
                    const poResult = await resolvePurchaseOrderRef(t, businessId, poId);
                    if (!poResult.ref || !poResult.doc) throw new Error('Linked purchase order not found');
                    const po = poResult.doc.data() || {};
                    const poItems = Array.isArray(po.items) ? po.items : [];
                    const poQtyByMaterial = new Map();
                    poItems.forEach((item) => {
                        const mid = String(item.materialId || '').trim();
                        const q = Number(item.qty || 0);
                        if (!mid || q <= 0) return;
                        poQtyByMaterial.set(mid, (poQtyByMaterial.get(mid) || 0) + q);
                    });
                    for (const item of billItems) {
                        if (!poQtyByMaterial.has(item.materialId)) {
                            throw new Error(`Material ${item.materialName} is not in the linked PO`);
                        }
                    }
                    const existingBillsSnap = await db.collection('users').doc(businessId).collection('purchase_bills').where('poId', '==', poId).get();
                    const billedByMaterial = new Map();
                    existingBillsSnap.forEach((doc) => {
                        if (doc.id === txDocId) return;
                        const b = doc.data() || {};
                        const items = Array.isArray(b.items) ? b.items : [];
                        items.forEach((item) => {
                            const mid = String(item.materialId || '').trim();
                            const q = Number(item.qty || 0);
                            if (!mid || q <= 0) return;
                            billedByMaterial.set(mid, (billedByMaterial.get(mid) || 0) + q);
                        });
                    });
                    billItems.forEach((item) => {
                        billedByMaterial.set(item.materialId, (billedByMaterial.get(item.materialId) || 0) + Number(item.qty || 0));
                    });
                    for (const [materialId, billedQty] of billedByMaterial.entries()) {
                        const orderedQty = Number(poQtyByMaterial.get(materialId) || 0);
                        if (billedQty - orderedQty > 1e-9) {
                            throw new Error('Billed quantity exceeds PO quantity');
                        }
                    }
                    let totalOrdered = 0;
                    let totalBilled = 0;
                    poItems.forEach((item) => {
                        const mid = String(item.materialId || '').trim();
                        const ordered = Number(item.qty || 0);
                        if (ordered <= 0) return;
                        totalOrdered += ordered;
                        totalBilled += mid ? (billedByMaterial.get(mid) || 0) : 0;
                    });
                    const status = totalBilled <= 0
                        ? 'Pending'
                        : (totalBilled + 1e-9 >= totalOrdered ? 'Completed' : 'Partially Received');
                    statusUpdates.push({ ref: poResult.ref, status });
                }

                if (previousPoId && previousPoId !== poId) {
                    const oldPoResult = await resolvePurchaseOrderRef(t, businessId, previousPoId);
                    if (oldPoResult.ref && oldPoResult.doc) {
                        const oldPo = oldPoResult.doc.data() || {};
                        const oldPoItems = Array.isArray(oldPo.items) ? oldPo.items : [];
                        const oldBillsSnap = await db.collection('users').doc(businessId).collection('purchase_bills').where('poId', '==', previousPoId).get();
                        const oldBilledByMaterial = new Map();
                        oldBillsSnap.forEach((doc) => {
                            if (doc.id === txDocId) return;
                            const b = doc.data() || {};
                            const items = Array.isArray(b.items) ? b.items : [];
                            items.forEach((item) => {
                                const mid = String(item.materialId || '').trim();
                                const q = Number(item.qty || 0);
                                if (!mid || q <= 0) return;
                                oldBilledByMaterial.set(mid, (oldBilledByMaterial.get(mid) || 0) + q);
                            });
                        });
                        let oldTotalOrdered = 0;
                        let oldTotalBilled = 0;
                        oldPoItems.forEach((item) => {
                            const mid = String(item.materialId || '').trim();
                            const ordered = Number(item.qty || 0);
                            if (ordered <= 0) return;
                            oldTotalOrdered += ordered;
                            oldTotalBilled += mid ? (oldBilledByMaterial.get(mid) || 0) : 0;
                        });
                        const oldStatus = oldTotalBilled <= 0
                            ? 'Pending'
                            : (oldTotalBilled + 1e-9 >= oldTotalOrdered ? 'Completed' : 'Partially Received');
                        statusUpdates.push({ ref: oldPoResult.ref, status: oldStatus });
                    }
                }

                invUpdates.forEach((entry) => {
                    t.update(entry.ref, { quantity: entry.quantity, updatedAt: new Date() });
                });
                const txPayload = {
                    type: 'SupplierPayment',
                    description: notes || `Purchase Bill${ref ? ` ${ref}` : ''}`,
                    supplierId,
                    supplier: supplierName,
                    amount: billTotalFromRows,
                    date: paidAt,
                    mode,
                    reference: ref,
                    source: 'purchase_bill',
                    poId: poId || null,
                    billId: txDocId,
                    clientTxId: txDocId,
                    createdAt: previousBill ? (previousBill.createdAt || new Date()) : new Date(),
                    updatedAt: new Date()
                };
                t.set(txRef, txPayload, { merge: true });
                t.set(billRef, {
                    supplierId,
                    supplierName,
                    poId: poId || null,
                    reference: ref || '',
                    notes: notes || '',
                    date: paidAt,
                    mode,
                    items: billItems,
                    totalAmount: billTotalFromRows,
                    updatedAt: new Date(),
                    createdAt: previousBill ? (previousBill.createdAt || new Date()) : new Date()
                }, { merge: true });

                const currentBal = Number(supplierDoc.data().balance || 0);
                const currentTotalPurchase = Number(supplierDoc.data().totalPurchase || 0);
                const nextBal = Math.round((currentBal - previousTotal + billTotalFromRows) * 100) / 100;
                const nextTotalPurchase = Math.max(0, Math.round((currentTotalPurchase - previousTotal + billTotalFromRows) * 100) / 100);
                t.update(supplierRef, { balance: nextBal, totalPurchase: nextTotalPurchase, updatedAt: new Date() });
                statusUpdates.forEach((entry) => t.set(entry.ref, { status: entry.status, updatedAt: new Date() }, { merge: true }));
                created = true;
            });
        } else {
            const supplierRef = db.collection('users').doc(businessId).collection('suppliers').doc(supplierId);
            await db.runTransaction(async (t) => {
                const existingTx = await t.get(txRef);
                if (existingTx.exists) return;
                const supplierDoc = await t.get(supplierRef);
                t.set(txRef, {
                    type: 'SupplierPayment',
                    description: notes || 'Payment to Supplier',
                    supplierId,
                    supplier: supplierName,
                    amount,
                    date: paidAt,
                    mode,
                    reference: ref,
                    clientTxId,
                    createdAt: new Date(),
                    updatedAt: new Date()
                });
                if (supplierDoc.exists) {
                    const currentBal = Number(supplierDoc.data().balance || 0);
                    t.update(supplierRef, {
                        balance: currentBal - amount,
                        updatedAt: new Date()
                    });
                }
                created = true;
            });
        }
        if (!created) throw new Error('Payment already recorded. Duplicate request ignored.');
        bootstrap.Modal.getInstance(supplierPaymentModal).hide();
        showAlert('success', labourPayableId ? 'Labour payment recorded successfully' : (billMode ? 'Purchase bill saved successfully' : 'Payment recorded successfully'));
        window.dispatchEvent(new CustomEvent('paymentsUpdated'));
        loadSuppliers();
        setBillModeUI(false);
        resetSupplierPaymentTxId();
    } catch (e) {
        console.error(e);
        showAlert('danger', e.message || 'Failed to record payment');
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}
let currentLedgerSupplier = null;

window.viewSupplierLedger = (id, name) => {
    currentLedgerSupplier = { id, name };
    document.getElementById('slName').textContent = name;

    // Default dates (Current Month)
    const date = new Date();
    const firstDay = new Date(date.getFullYear(), date.getMonth(), 1);
    const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0);

    // Timezone fix for date input
    const toISODate = (d) => {
        const offset = d.getTimezoneOffset() * 60000;
        return new Date(d.getTime() - offset).toISOString().split('T')[0];
    };

    document.getElementById('slStartDate').value = toISODate(firstDay);
    document.getElementById('slEndDate').value = toISODate(lastDay);

    new bootstrap.Modal(supplierLedgerModal).show();
    loadSupplierLedgerData();
};

async function loadSupplierLedgerData() {
    if (!currentLedgerSupplier) return;
    const user = JSON.parse(localStorage.getItem('user'));
    const businessId = user.businessId || user.uid;

    const startDate = new Date(document.getElementById('slStartDate').value);
    const endDate = new Date(document.getElementById('slEndDate').value);
    endDate.setHours(23, 59, 59);

    const tbody = document.querySelector('#supplierLedgerTable tbody');
    tbody.innerHTML = '<tr><td colspan="6" class="text-center">Loading...</td></tr>';

    try {
        const root = db.collection('users').doc(businessId);
        // 1. Fetch Purchases (Credits) - Linked by Name
        const purchasesSnap = await root.collection('purchases')
            .where('supplier', '==', currentLedgerSupplier.name)
            .get();

        // 2. Fetch Payments (Debits/Credits) - by name and id, then de-duplicate by tx id
        const paymentsByNameSnap = await root.collection('transactions')
            .where('type', '==', 'SupplierPayment')
            .where('supplier', '==', currentLedgerSupplier.name)
            .get();
        const paymentsByIdSnap = currentLedgerSupplier.id
            ? await root.collection('transactions')
                .where('supplierId', '==', currentLedgerSupplier.id)
                .get()
            : { docs: [] };
        const purchaseBillsSnap = currentLedgerSupplier.id
            ? await root.collection('purchase_bills')
                .where('supplierId', '==', currentLedgerSupplier.id)
                .get()
            : await root.collection('purchase_bills')
                .where('supplierName', '==', currentLedgerSupplier.name)
                .get();
        const purchaseReturnsSnap = currentLedgerSupplier.id
            ? await root.collection('purchase_returns')
                .where('supplierId', '==', currentLedgerSupplier.id)
                .get()
            : await root.collection('purchase_returns')
                .where('supplierName', '==', currentLedgerSupplier.name)
                .get();

        let transactions = [];

        purchasesSnap.forEach(doc => {
            const d = doc.data();
            transactions.push({
                date: d.date.toDate(),
                desc: `Purchase: ${d.itemName} (${d.quantity})`,
                ref: d.invoiceNo || '-',
                credit: d.totalCost || 0, // We owe this
                debit: 0
            });
        });

        const paymentDocs = new Map();
        const addPaymentDoc = (doc) => {
            if (!doc || paymentDocs.has(doc.id)) return;
            const d = doc.data() || {};
            if (d.type !== 'SupplierPayment') return;
            paymentDocs.set(doc.id, d);
        };
        paymentsByNameSnap.forEach(addPaymentDoc);
        paymentsByIdSnap.docs?.forEach(addPaymentDoc);

        paymentDocs.forEach((d) => {
            const isPurchaseBill = String(d.source || '').toLowerCase() === 'purchase_bill';
            const txDate = d.date?.toDate ? d.date.toDate() : new Date(d.date);
            transactions.push({
                date: txDate,
                desc: d.description || 'Payment',
                ref: d.reference || d.mode,
                credit: isPurchaseBill ? (d.amount || 0) : 0,
                debit: isPurchaseBill ? 0 : (d.amount || 0)
            });
        });
        const billedIds = new Set();
        paymentDocs.forEach((d, txId) => {
            if (String(d.source || '').toLowerCase() !== 'purchase_bill') return;
            const bid = String(d.billId || d.clientTxId || txId || '').trim();
            if (bid) billedIds.add(bid);
        });
        purchaseBillsSnap.forEach((doc) => {
            if (billedIds.has(doc.id)) return;
            const b = doc.data() || {};
            const txDate = b.date?.toDate ? b.date.toDate() : new Date(b.date || Date.now());
            const totalAmount = Number(b.totalAmount || 0);
            if (totalAmount <= 0) return;
            transactions.push({
                date: txDate,
                desc: b.notes || 'Purchase Bill',
                ref: b.reference || b.poId || doc.id,
                credit: totalAmount,
                debit: 0
            });
        });
        purchaseReturnsSnap.forEach((doc) => {
            const r = doc.data() || {};
            const txDate = r.date?.toDate ? r.date.toDate() : new Date(r.date || Date.now());
            const returnAmount = Number(r.amount || 0);
            if (returnAmount <= 0) return;
            const qty = Number(r.returnedQty || 0) || 0;
            const received = Number(r.amountReceived || 0) || 0;
            transactions.push({
                date: txDate,
                desc: `Purchase Return${qty > 0 ? ` (${qty})` : ''}${received > 0 ? ` | Received: ₹${received.toLocaleString()}` : ''}`,
                ref: r.reference || r.billId || doc.id,
                credit: 0,
                debit: returnAmount
            });
        });

        // Sort by Date
        transactions.sort((a, b) => a.date - b.date);

        // Render
        tbody.innerHTML = '';
        let balance = 0; // Positive means we owe money
        let totalCr = 0, totalDr = 0;

        transactions.forEach(t => {
            if (t.date >= startDate && t.date <= endDate) {
                balance += (t.credit - t.debit);
                totalCr += t.credit;
                totalDr += t.debit;

                tbody.innerHTML += `
                    <tr>
                        <td>${formatDate(t.date)}</td>
                        <td>${t.desc}</td>
                        <td>${t.ref}</td>
                        <td class="text-end text-danger">${t.credit > 0 ? '₹' + t.credit.toLocaleString() : '-'}</td>
                        <td class="text-end text-success">${t.debit > 0 ? '₹' + t.debit.toLocaleString() : '-'}</td>
                        <td class="text-end fw-bold">₹${balance.toLocaleString()}</td>
                    </tr>
                `;
            } else if (t.date < startDate) {
                balance += (t.credit - t.debit);
            }
        });

        // Prepend Opening Balance
        const openingRow = `
            <tr class="table-secondary">
                <td colspan="3"><strong>Opening Balance</strong></td>
                <td colspan="2"></td>
                <td class="text-end fw-bold">₹${(balance - (totalCr - totalDr)).toLocaleString()}</td>
            </tr>
        `;
        tbody.insertAdjacentHTML('afterbegin', openingRow);

        document.getElementById('slTotalPurchase').textContent = `₹${totalCr.toLocaleString()}`;
        document.getElementById('slTotalPayment').textContent = `₹${totalDr.toLocaleString()}`;
        document.getElementById('slFinalBalance').textContent = `₹${balance.toLocaleString()}`;

    } catch (e) {
        console.error(e);
        tbody.innerHTML = '<tr><td colspan="6" class="text-center text-danger">Error loading ledger</td></tr>';
    }
}

window.printSupplierLedger = () => {
    const name = document.getElementById('slName').textContent;
    const table = document.getElementById('supplierLedgerTable').outerHTML;
    const win = window.open('', '_blank');
    win.document.write(`
        <html><head><title>Supplier Ledger - ${name}</title>
        <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
        <style>body{padding:20px} table{font-size:12px}</style>
        </head><body>
        <h4 class="text-center mb-4">Supplier Ledger: ${name}</h4>
        ${table}
        <script>window.print()</script>
        </body></html>
    `);
    win.document.close();
};
