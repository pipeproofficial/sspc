import { db } from './firebase-config.js';
import { checkAuth, formatDate } from './dashboard.js';
import { showAlert } from './auth.js';

const addPurchaseReturnBtn = document.getElementById('addPurchaseReturnBtn');
const savePurchaseReturnBtn = document.getElementById('savePurchaseReturnBtn');
const purchaseReturnsTable = document.getElementById('purchaseReturnsTable');
const purchaseReturnModalEl = document.getElementById('purchaseReturnModal');
const purchaseReturnModalTitle = document.getElementById('purchaseReturnModalTitle');

const purchaseReturnsSearch = document.getElementById('purchaseReturnsSearch');
const purchaseReturnsStatusFilter = document.getElementById('purchaseReturnsStatusFilter');
const purchaseReturnsDateFrom = document.getElementById('purchaseReturnsDateFrom');
const purchaseReturnsDateTo = document.getElementById('purchaseReturnsDateTo');
const resetPurchaseReturnsFilters = document.getElementById('resetPurchaseReturnsFilters');
const purchaseReturnsTotalAmount = document.getElementById('purchaseReturnsTotalAmount');

const purchaseReturnDate = document.getElementById('purchaseReturnDate');
const purchaseReturnType = document.getElementById('purchaseReturnType');
const purchaseReturnSupplierSelect = document.getElementById('purchaseReturnSupplierSelect');
const purchaseReturnBillSelect = document.getElementById('purchaseReturnBillSelect');
const purchaseReturnParty = document.getElementById('purchaseReturnParty');
const purchaseReturnReference = document.getElementById('purchaseReturnReference');
const purchaseReturnAmount = document.getElementById('purchaseReturnAmount');
const purchaseReturnAmountReceived = document.getElementById('purchaseReturnAmountReceived');
const purchaseReturnPendingAmount = document.getElementById('purchaseReturnPendingAmount');
const purchaseReturnStatus = document.getElementById('purchaseReturnStatus');
const purchaseReturnReason = document.getElementById('purchaseReturnReason');
const purchaseReturnItemsContainer = document.getElementById('purchaseReturnItemsContainer');
const purchaseReturnReceiveModalEl = document.getElementById('purchaseReturnReceiveModal');
const purchaseReturnReceivePending = document.getElementById('purchaseReturnReceivePending');
const purchaseReturnReceiveNow = document.getElementById('purchaseReturnReceiveNow');
const savePurchaseReturnReceiveBtn = document.getElementById('savePurchaseReturnReceiveBtn');

let purchaseReturnsData = [];
let currentPurchaseReturnId = null;
let suppliersData = [];
let purchaseBillsData = [];
let currentReceiveReturnId = null;

document.addEventListener('DOMContentLoaded', async () => {
    await checkAuth();
    setupListeners();

    const hash = String(window.location.hash || '').replace(/^#/, '');
    if (hash === 'purchase-returns') {
        await loadPurchaseReturns();
    }

    window.addEventListener('sectionChanged', async (e) => {
        if (e.detail !== 'purchase-returns') return;
        await loadPurchaseReturns();
    });
});

function setupListeners() {
    if (addPurchaseReturnBtn) addPurchaseReturnBtn.addEventListener('click', openAddPurchaseReturnModal);
    if (savePurchaseReturnBtn) savePurchaseReturnBtn.addEventListener('click', savePurchaseReturn);

    if (purchaseReturnsSearch) purchaseReturnsSearch.addEventListener('input', renderPurchaseReturnsTable);
    if (purchaseReturnsStatusFilter) purchaseReturnsStatusFilter.addEventListener('change', renderPurchaseReturnsTable);
    if (purchaseReturnsDateFrom) purchaseReturnsDateFrom.addEventListener('change', renderPurchaseReturnsTable);
    if (purchaseReturnsDateTo) purchaseReturnsDateTo.addEventListener('change', renderPurchaseReturnsTable);

    if (resetPurchaseReturnsFilters) {
        resetPurchaseReturnsFilters.addEventListener('click', () => {
            if (purchaseReturnsSearch) purchaseReturnsSearch.value = '';
            if (purchaseReturnsStatusFilter) purchaseReturnsStatusFilter.value = 'all';
            if (purchaseReturnsDateFrom) purchaseReturnsDateFrom.value = '';
            if (purchaseReturnsDateTo) purchaseReturnsDateTo.value = '';
            renderPurchaseReturnsTable();
        });
    }

    if (purchaseReturnSupplierSelect) {
        purchaseReturnSupplierSelect.addEventListener('change', () => {
            const supplierName = getSelectedSupplierName();
            if (purchaseReturnParty) purchaseReturnParty.value = supplierName;
            populatePurchaseBillOptions({
                supplierId: purchaseReturnSupplierSelect.value || '',
                supplierName
            });
            applySelectedPurchaseBillDetails();
        });
    }

    if (purchaseReturnBillSelect) {
        purchaseReturnBillSelect.addEventListener('change', () => {
            applySelectedPurchaseBillDetails();
        });
    }

    if (purchaseReturnItemsContainer) {
        purchaseReturnItemsContainer.addEventListener('input', (e) => {
            if (!e.target.classList.contains('purchase-return-item-qty')) return;
            const row = e.target.closest('tr');
            if (!row) return;
            const maxQty = Number(row.dataset.maxQty || 0) || 0;
            let qty = Number(e.target.value || 0);
            if (!Number.isFinite(qty) || qty < 0) qty = 0;
            if (qty > maxQty) qty = maxQty;
            e.target.value = qty;
            const rate = Number(row.dataset.rate || 0) || 0;
            const amount = roundMoney(qty * rate);
            const amountEl = row.querySelector('.purchase-return-item-amount');
            if (amountEl) amountEl.textContent = formatCurrency(amount);
            recalculateTotalsAndStatus();
        });
    }

    if (purchaseReturnAmountReceived) {
        purchaseReturnAmountReceived.addEventListener('input', () => {
            recalculateTotalsAndStatus();
        });
    }

    if (purchaseReturnsTable) {
        purchaseReturnsTable.addEventListener('click', async (e) => {
            const editBtn = e.target.closest('.edit-purchase-return-btn');
            if (editBtn?.dataset?.id) {
                await openEditPurchaseReturnModal(editBtn.dataset.id);
                return;
            }
            const recordBtn = e.target.closest('.record-purchase-return-received-btn');
            if (recordBtn?.dataset?.id) {
                openReceivePendingModal(recordBtn.dataset.id);
                return;
            }
            const deleteBtn = e.target.closest('.delete-purchase-return-btn');
            if (!deleteBtn?.dataset?.id) return;
            await deletePurchaseReturn(deleteBtn.dataset.id);
        });
    }

    if (savePurchaseReturnReceiveBtn) {
        savePurchaseReturnReceiveBtn.addEventListener('click', async () => {
            await saveReceivePendingAmount();
        });
    }
    if (purchaseReturnReceiveModalEl) {
        purchaseReturnReceiveModalEl.addEventListener('hidden.bs.modal', () => {
            currentReceiveReturnId = null;
            if (purchaseReturnReceiveNow) purchaseReturnReceiveNow.value = '';
        });
    }
}

function getUserContext() {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    const businessId = user.businessId || user.uid;
    return { businessId };
}

function roundMoney(value) {
    return Math.round((Number(value) || 0) * 100) / 100;
}

function roundQty(value) {
    return Math.round((Number(value) || 0) * 1000) / 1000;
}

function formatCurrency(amount = 0) {
    const value = Number(amount) || 0;
    return `\u20B9${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function toInputDate(value) {
    if (!value) return '';
    const d = value?.toDate ? value.toDate() : new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    const offset = d.getTimezoneOffset() * 60000;
    return new Date(d.getTime() - offset).toISOString().split('T')[0];
}

function getSelectedSupplierName() {
    return String(purchaseReturnSupplierSelect?.selectedOptions?.[0]?.textContent || '').trim();
}

function billLabel(bill = {}) {
    const ref = String(bill.reference || '').trim() || String(bill.poId || '').trim() || `#${String(bill.id || '').slice(0, 6).toUpperCase()}`;
    const datePart = formatDate(bill.date);
    const amount = Number(bill.totalAmount || 0) || 0;
    return `${ref} | ${datePart} | Amt: \u20B9${amount.toLocaleString()}`;
}

async function loadSuppliersAndPurchaseBills() {
    const { businessId } = getUserContext();
    if (!businessId) return;
    try {
        const root = db.collection('users').doc(businessId);
        const [suppliersSnap, billsSnap] = await Promise.all([
            root.collection('suppliers').orderBy('name').get(),
            root.collection('purchase_bills').orderBy('date', 'desc').get()
        ]);
        suppliersData = suppliersSnap.docs
            .map((doc) => ({ id: doc.id, ...doc.data() }))
            .filter((row) => String(row.name || '').trim());
        purchaseBillsData = billsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
        console.error('Failed to load suppliers/purchase bills for purchase returns', error);
        suppliersData = [];
        purchaseBillsData = [];
    }
}

function populateSupplierOptions(selectedSupplierId = '', selectedSupplierName = '') {
    if (!purchaseReturnSupplierSelect) return;
    purchaseReturnSupplierSelect.innerHTML = '<option value="">Select Supplier...</option>';
    suppliersData.forEach((supplier) => {
        const name = String(supplier.name || '').trim();
        if (!name) return;
        const opt = document.createElement('option');
        opt.value = supplier.id;
        opt.textContent = name;
        purchaseReturnSupplierSelect.appendChild(opt);
    });
    const fallbackName = String(selectedSupplierName || '').trim();
    const fallbackId = String(selectedSupplierId || '').trim();
    if (fallbackName && !Array.from(purchaseReturnSupplierSelect.options).some((o) => o.textContent === fallbackName)) {
        const opt = document.createElement('option');
        opt.value = fallbackId;
        opt.textContent = fallbackName;
        purchaseReturnSupplierSelect.appendChild(opt);
    }
    if (fallbackId && Array.from(purchaseReturnSupplierSelect.options).some((o) => o.value === fallbackId)) {
        purchaseReturnSupplierSelect.value = fallbackId;
    } else if (fallbackName) {
        const byName = Array.from(purchaseReturnSupplierSelect.options).find((o) => o.textContent === fallbackName);
        purchaseReturnSupplierSelect.value = byName?.value || '';
    } else {
        purchaseReturnSupplierSelect.value = '';
    }
}

function populatePurchaseBillOptions({ supplierId = '', supplierName = '', selectedBillId = '' } = {}) {
    if (!purchaseReturnBillSelect) return;
    purchaseReturnBillSelect.innerHTML = '<option value="">Select Purchase Bill...</option>';
    const sid = String(supplierId || '').trim();
    const sname = String(supplierName || '').trim().toLowerCase();
    const selectedId = String(selectedBillId || '').trim();
    const list = purchaseBillsData.filter((bill) => {
        const bidSupplierId = String(bill.supplierId || '').trim();
        const bidSupplierName = String(bill.supplierName || '').trim().toLowerCase();
        if (sid && bidSupplierId === sid) return true;
        if (sname && bidSupplierName && bidSupplierName === sname) return true;
        return false;
    });
    list.forEach((bill) => {
        const opt = document.createElement('option');
        opt.value = bill.id;
        opt.textContent = billLabel(bill);
        opt.dataset.reference = String(bill.reference || '').trim();
        opt.dataset.totalAmount = String(Number(bill.totalAmount || 0) || 0);
        purchaseReturnBillSelect.appendChild(opt);
    });
    purchaseReturnBillSelect.value = (selectedId && Array.from(purchaseReturnBillSelect.options).some((o) => o.value === selectedId))
        ? selectedId
        : '';
}

function getCurrentEditingRow() {
    if (!currentPurchaseReturnId) return null;
    return purchaseReturnsData.find((row) => row.id === currentPurchaseReturnId) || null;
}

function getReturnItemKey(item = {}) {
    const materialId = String(item.materialId || '').trim();
    if (materialId) return `id:${materialId}`;
    return `name:${String(item.materialName || item.name || '').trim().toLowerCase()}`;
}

function buildExistingReturnedQtyMap(billId, excludeReturnId = null) {
    const map = new Map();
    if (!billId) return map;
    (purchaseReturnsData || []).forEach((row) => {
        if (!row || row.id === excludeReturnId) return;
        if (String(row.billId || '') !== String(billId)) return;
        const items = Array.isArray(row.returnItems) ? row.returnItems : [];
        items.forEach((item) => {
            const key = getReturnItemKey(item);
            const qty = Number(item.quantity || 0) || 0;
            if (!key || qty <= 0) return;
            map.set(key, roundQty((map.get(key) || 0) + qty));
        });
    });
    return map;
}

function recalculateTotalsAndStatus() {
    const rows = Array.from(purchaseReturnItemsContainer?.querySelectorAll('tr.purchase-return-item-row') || []);
    const totalAmount = rows.reduce((sum, row) => {
        const qty = Number(row.querySelector('.purchase-return-item-qty')?.value || 0) || 0;
        const rate = Number(row.dataset.rate || 0) || 0;
        return sum + roundMoney(qty * rate);
    }, 0);
    if (purchaseReturnAmount) purchaseReturnAmount.value = String(roundMoney(totalAmount));

    let received = roundMoney(Number(purchaseReturnAmountReceived?.value || 0) || 0);
    if (received < 0) received = 0;
    if (received > totalAmount) received = roundMoney(totalAmount);
    if (purchaseReturnAmountReceived) purchaseReturnAmountReceived.value = String(received);

    const pending = Math.max(0, roundMoney(totalAmount - received));
    if (purchaseReturnPendingAmount) purchaseReturnPendingAmount.value = String(pending);
    if (purchaseReturnStatus) purchaseReturnStatus.value = pending <= 0 ? 'Settled' : 'Open';
}

function collectReturnItemsFromForm() {
    const rows = Array.from(purchaseReturnItemsContainer?.querySelectorAll('tr.purchase-return-item-row') || []);
    return rows.map((row) => {
        const maxQty = Number(row.dataset.maxQty || 0) || 0;
        let qty = Number(row.querySelector('.purchase-return-item-qty')?.value || 0) || 0;
        if (!Number.isFinite(qty) || qty < 0) qty = 0;
        qty = Math.min(maxQty, qty);
        const rate = Number(row.dataset.rate || 0) || 0;
        return {
            materialId: String(row.dataset.materialId || '').trim(),
            materialName: String(row.dataset.materialName || '').trim(),
            quantity: roundQty(qty),
            rate: roundMoney(rate),
            amount: roundMoney(qty * rate)
        };
    }).filter((item) => item.quantity > 0);
}

function renderBillItemsForReturn(bill = null, selectedReturnItems = []) {
    if (!purchaseReturnItemsContainer) return;
    const billItems = Array.isArray(bill?.items) ? bill.items : [];
    if (!bill || !billItems.length) {
        purchaseReturnItemsContainer.innerHTML = '<tr><td colspan="5" class="text-center text-muted">Select purchase bill to load items</td></tr>';
        recalculateTotalsAndStatus();
        return;
    }

    const existingQtyMap = buildExistingReturnedQtyMap(bill.id, currentPurchaseReturnId);
    const selectedMap = new Map((selectedReturnItems || []).map((item) => [getReturnItemKey(item), Number(item.quantity || 0) || 0]));

    purchaseReturnItemsContainer.innerHTML = billItems.map((item, idx) => {
        const materialId = String(item.materialId || '').trim();
        const materialName = String(item.materialName || item.name || `Item ${idx + 1}`).trim();
        const key = getReturnItemKey({ materialId, materialName });
        const billQty = Number(item.qty || 0) || 0;
        const alreadyReturned = Number(existingQtyMap.get(key) || 0) || 0;
        const maxQty = Math.max(0, roundQty(billQty - alreadyReturned));
        const prefillQty = Math.min(maxQty, Math.max(0, Number(selectedMap.get(key) || 0)));
        const rate = Number(item.rate || 0) || 0;
        const amount = roundMoney(prefillQty * rate);
        return `
            <tr class="purchase-return-item-row" data-material-id="${materialId.replace(/"/g, '&quot;')}" data-material-name="${materialName.replace(/"/g, '&quot;')}" data-rate="${rate}" data-max-qty="${maxQty}">
                <td>${materialName}</td>
                <td class="text-end">${billQty.toLocaleString()}</td>
                <td class="text-end">
                    <input type="number" class="form-control form-control-sm text-end purchase-return-item-qty" min="0" max="${maxQty}" step="0.001" value="${prefillQty}">
                </td>
                <td class="text-end">${formatCurrency(rate)}</td>
                <td class="text-end purchase-return-item-amount">${formatCurrency(amount)}</td>
            </tr>
        `;
    }).join('');

    recalculateTotalsAndStatus();
}

function applySelectedPurchaseBillDetails() {
    const selected = purchaseReturnBillSelect?.selectedOptions?.[0];
    const currentRow = getCurrentEditingRow();
    if (!selected || !selected.value) {
        if (purchaseReturnReference) purchaseReturnReference.value = '';
        renderBillItemsForReturn(null, []);
        return;
    }
    const billId = String(selected.value || '').trim();
    const bill = purchaseBillsData.find((row) => row.id === billId) || null;
    if (purchaseReturnReference) purchaseReturnReference.value = String(selected.dataset.reference || '').trim();
    const selectedItems = (currentRow && String(currentRow.billId || '') === billId && Array.isArray(currentRow.returnItems))
        ? currentRow.returnItems
        : [];
    renderBillItemsForReturn(bill, selectedItems);
}

function setFormData(row = null) {
    if (purchaseReturnDate) purchaseReturnDate.value = row ? toInputDate(row.date) : toInputDate(new Date());
    if (purchaseReturnType) purchaseReturnType.value = 'Purchase Return';
    if (purchaseReturnParty) purchaseReturnParty.value = row?.party || row?.supplierName || '';
    if (purchaseReturnReference) purchaseReturnReference.value = row?.reference || '';
    if (purchaseReturnAmount) purchaseReturnAmount.value = String(roundMoney(row?.amount || 0));
    if (purchaseReturnAmountReceived) purchaseReturnAmountReceived.value = String(roundMoney(row?.amountReceived || 0));
    if (purchaseReturnPendingAmount) purchaseReturnPendingAmount.value = String(roundMoney(row?.pendingAmount || 0));
    if (purchaseReturnStatus) purchaseReturnStatus.value = row?.status || 'Open';
    if (purchaseReturnReason) purchaseReturnReason.value = row?.reason || '';
}

async function prepareFormOptions(row = null) {
    await loadSuppliersAndPurchaseBills();
    const supplierId = String(row?.supplierId || '').trim();
    const supplierName = String(row?.supplierName || row?.party || '').trim();
    const billId = String(row?.billId || '').trim();
    populateSupplierOptions(supplierId, supplierName);
    populatePurchaseBillOptions({ supplierId, supplierName, selectedBillId: billId });
    applySelectedPurchaseBillDetails();
}

async function openAddPurchaseReturnModal() {
    currentPurchaseReturnId = null;
    if (purchaseReturnModalTitle) purchaseReturnModalTitle.textContent = 'Add Purchase Return';
    setFormData();
    await prepareFormOptions(null);
    if (purchaseReturnModalEl) bootstrap.Modal.getOrCreateInstance(purchaseReturnModalEl).show();
}

async function openEditPurchaseReturnModal(id) {
    const row = purchaseReturnsData.find((r) => r.id === id);
    if (!row) return;
    currentPurchaseReturnId = id;
    if (purchaseReturnModalTitle) purchaseReturnModalTitle.textContent = 'Edit Purchase Return';
    setFormData(row);
    await prepareFormOptions(row);
    if (purchaseReturnModalEl) bootstrap.Modal.getOrCreateInstance(purchaseReturnModalEl).show();
}

function getFormData() {
    const supplierName = getSelectedSupplierName() || String(purchaseReturnParty?.value || '').trim();
    const returnItems = collectReturnItemsFromForm();
    const returnedQty = roundQty(returnItems.reduce((sum, item) => sum + (Number(item.quantity || 0) || 0), 0));
    const amountFromItems = roundMoney(returnItems.reduce((sum, item) => sum + (Number(item.amount || 0) || 0), 0));
    let amountReceived = roundMoney(Number(purchaseReturnAmountReceived?.value || 0) || 0);
    amountReceived = Math.min(Math.max(amountReceived, 0), amountFromItems);
    const pendingAmount = roundMoney(Math.max(0, amountFromItems - amountReceived));
    const status = pendingAmount <= 0 ? 'Settled' : 'Open';

    return {
        date: purchaseReturnDate?.value ? new Date(purchaseReturnDate.value) : null,
        type: 'Purchase Return',
        supplierId: String(purchaseReturnSupplierSelect?.value || '').trim() || null,
        supplierName,
        party: supplierName,
        billId: String(purchaseReturnBillSelect?.value || '').trim() || null,
        reference: String(purchaseReturnReference?.value || '').trim(),
        amount: amountFromItems,
        amountReceived,
        pendingAmount,
        returnedQty,
        returnItems,
        status,
        reason: String(purchaseReturnReason?.value || '').trim()
    };
}

function buildItemQtyMap(items = []) {
    const map = new Map();
    (items || []).forEach((item) => {
        const materialId = String(item.materialId || '').trim();
        const qty = Number(item.quantity || 0) || 0;
        if (!materialId || qty <= 0) return;
        map.set(materialId, roundQty((map.get(materialId) || 0) + qty));
    });
    return map;
}

function buildInventoryDeltas(prevData = null, nextData = null) {
    const prevItems = Array.isArray(prevData?.returnItems) ? prevData.returnItems : [];
    const nextItems = Array.isArray(nextData?.returnItems) ? nextData.returnItems : [];
    const prevMap = buildItemQtyMap(prevItems);
    const nextMap = buildItemQtyMap(nextItems);
    const keys = new Set([...prevMap.keys(), ...nextMap.keys()]);
    const out = [];
    keys.forEach((materialId) => {
        const prevQty = Number(prevMap.get(materialId) || 0) || 0;
        const nextQty = Number(nextMap.get(materialId) || 0) || 0;
        const diff = roundQty(nextQty - prevQty);
        if (Math.abs(diff) < 0.000001) return;
        out.push({ materialId, deltaQty: roundQty(-1 * diff) });
    });
    return out;
}

async function runPurchaseReturnMutation({ mode, id = null, prevData = null, nextData = null }) {
    const { businessId } = getUserContext();
    if (!businessId) throw new Error('Business context not found');
    const root = db.collection('users').doc(businessId);
    const returnsCol = root.collection('purchase_returns');
    const returnRef = mode === 'create'
        ? returnsCol.doc()
        : returnsCol.doc(id);

    await db.runTransaction(async (t) => {
        const inventoryDeltas = buildInventoryDeltas(prevData, nextData);
        const inventoryPlans = [];
        for (const item of inventoryDeltas) {
            const invRef = root.collection('inventory').doc(item.materialId);
            const invDoc = await t.get(invRef);
            if (!invDoc.exists) throw new Error(`Material not found: ${item.materialId}`);
            const currentQty = Number(invDoc.data()?.quantity || 0) || 0;
            const nextQty = roundQty(currentQty + item.deltaQty);
            if (nextQty < -0.000001) {
                const name = String(invDoc.data()?.name || item.materialId);
                throw new Error(`Insufficient stock to return for ${name}`);
            }
            inventoryPlans.push({
                ref: invRef,
                quantity: Math.max(0, nextQty)
            });
        }

        const prevSupplierId = String(prevData?.supplierId || '').trim();
        const nextSupplierId = String(nextData?.supplierId || '').trim();
        const prevAmount = Number(prevData?.amount || 0) || 0;
        const nextAmount = Number(nextData?.amount || 0) || 0;

        const supplierAmountDiffs = [];
        if (prevSupplierId && nextSupplierId && prevSupplierId === nextSupplierId) {
            const delta = roundMoney(nextAmount - prevAmount);
            if (Math.abs(delta) >= 0.01) supplierAmountDiffs.push({ supplierId: nextSupplierId, delta });
        } else {
            if (prevSupplierId && prevAmount > 0) supplierAmountDiffs.push({ supplierId: prevSupplierId, delta: roundMoney(-prevAmount) });
            if (nextSupplierId && nextAmount > 0) supplierAmountDiffs.push({ supplierId: nextSupplierId, delta: roundMoney(nextAmount) });
        }

        const supplierPlans = [];
        for (const item of supplierAmountDiffs) {
            const supplierRef = root.collection('suppliers').doc(item.supplierId);
            const supplierDoc = await t.get(supplierRef);
            if (!supplierDoc.exists) continue;
            const currentBal = Number(supplierDoc.data()?.balance || 0) || 0;
            const currentTotalPurchase = Number(supplierDoc.data()?.totalPurchase || 0) || 0;
            const nextBal = roundMoney(currentBal - item.delta);
            const nextTotalPurchase = Math.max(0, roundMoney(currentTotalPurchase - item.delta));
            supplierPlans.push({
                ref: supplierRef,
                payload: {
                    balance: nextBal,
                    totalPurchase: nextTotalPurchase,
                    updatedAt: new Date()
                }
            });
        }

        inventoryPlans.forEach((plan) => {
            t.update(plan.ref, { quantity: plan.quantity, updatedAt: new Date() });
        });
        supplierPlans.forEach((plan) => {
            t.update(plan.ref, plan.payload);
        });

        if (mode === 'create') {
            t.set(returnRef, { ...nextData, createdAt: new Date(), updatedAt: new Date() });
            return;
        }
        if (mode === 'update') {
            t.update(returnRef, { ...nextData, updatedAt: new Date() });
            return;
        }
        if (mode === 'delete') {
            t.delete(returnRef);
        }
    });
}

async function savePurchaseReturn() {
    const data = getFormData();
    if (!data.date || Number.isNaN(data.date.getTime())) {
        return showAlert('warning', 'Please select a valid date');
    }
    if (!data.supplierId || !data.supplierName) {
        return showAlert('warning', 'Supplier is required');
    }
    if (!data.billId) {
        return showAlert('warning', 'Please select a purchase bill');
    }
    if (!Array.isArray(data.returnItems) || !data.returnItems.length || data.returnedQty <= 0) {
        return showAlert('warning', 'Select return quantity for at least one item');
    }
    if (data.returnItems.some((item) => !String(item.materialId || '').trim())) {
        return showAlert('warning', 'Selected purchase bill has items without material mapping');
    }
    if (data.amount <= 0) {
        return showAlert('warning', 'Return amount should be greater than zero');
    }

    try {
        if (currentPurchaseReturnId) {
            const prevData = purchaseReturnsData.find((r) => r.id === currentPurchaseReturnId) || null;
            await runPurchaseReturnMutation({
                mode: 'update',
                id: currentPurchaseReturnId,
                prevData,
                nextData: data
            });
            showAlert('success', 'Purchase return updated successfully');
        } else {
            await runPurchaseReturnMutation({
                mode: 'create',
                nextData: data
            });
            showAlert('success', 'Purchase return added successfully');
        }
        bootstrap.Modal.getOrCreateInstance(purchaseReturnModalEl)?.hide();
        await loadPurchaseReturns();
    } catch (error) {
        console.error('Failed to save purchase return', error);
        showAlert('danger', error.message || 'Failed to save purchase return');
    }
}

async function deletePurchaseReturn(id) {
    const ok = await window.showConfirmAsync?.('Delete Purchase Return', 'Delete this purchase return entry?', {
        confirmText: 'Delete',
        confirmClass: 'btn-danger'
    });
    if (!ok) return;

    try {
        const prevData = purchaseReturnsData.find((r) => r.id === id) || null;
        if (!prevData) return;
        await runPurchaseReturnMutation({
            mode: 'delete',
            id,
            prevData,
            nextData: null
        });
        showAlert('success', 'Purchase return deleted');
        await loadPurchaseReturns();
    } catch (error) {
        console.error('Failed to delete purchase return', error);
        showAlert('danger', error.message || 'Failed to delete purchase return');
    }
}

function openReceivePendingModal(id) {
    const row = purchaseReturnsData.find((r) => r.id === id);
    if (!row) return;

    const amount = roundMoney(Number(row.amount || 0) || 0);
    const received = roundMoney(Number(row.amountReceived || 0) || 0);
    const pending = Math.max(0, roundMoney(amount - received));
    if (pending <= 0) {
        showAlert('info', 'No pending amount for this return');
        return;
    }

    currentReceiveReturnId = id;
    if (purchaseReturnReceivePending) purchaseReturnReceivePending.value = String(pending);
    if (purchaseReturnReceiveNow) purchaseReturnReceiveNow.value = String(pending);
    if (purchaseReturnReceiveModalEl) bootstrap.Modal.getOrCreateInstance(purchaseReturnReceiveModalEl).show();
}

async function saveReceivePendingAmount() {
    const { businessId } = getUserContext();
    if (!businessId) return;
    if (!currentReceiveReturnId) return;

    const row = purchaseReturnsData.find((r) => r.id === currentReceiveReturnId);
    if (!row) return;

    const amount = roundMoney(Number(row.amount || 0) || 0);
    const received = roundMoney(Number(row.amountReceived || 0) || 0);
    const pending = Math.max(0, roundMoney(amount - received));
    if (pending <= 0) {
        showAlert('info', 'No pending amount for this return');
        return;
    }

    const delta = roundMoney(Number(purchaseReturnReceiveNow?.value || 0) || 0);
    if (!Number.isFinite(delta) || delta <= 0) {
        showAlert('warning', 'Enter a valid amount greater than zero');
        return;
    }
    if (delta > pending) {
        showAlert('warning', 'Amount cannot be greater than pending');
        return;
    }

    const nextReceived = roundMoney(received + delta);
    const nextPending = Math.max(0, roundMoney(amount - nextReceived));
    const nextStatus = nextPending <= 0 ? 'Settled' : 'Open';

    try {
        await db.collection('users').doc(businessId).collection('purchase_returns').doc(currentReceiveReturnId).update({
            amountReceived: nextReceived,
            pendingAmount: nextPending,
            status: nextStatus,
            updatedAt: new Date()
        });
        if (purchaseReturnReceiveModalEl) bootstrap.Modal.getOrCreateInstance(purchaseReturnReceiveModalEl).hide();
        currentReceiveReturnId = null;
        showAlert('success', 'Pending amount updated');
        await loadPurchaseReturns();
    } catch (error) {
        console.error('Failed to record pending amount', error);
        showAlert('danger', 'Failed to update pending amount');
    }
}

async function loadPurchaseReturns() {
    const { businessId } = getUserContext();
    if (!businessId || !purchaseReturnsTable) return;

    const tbody = purchaseReturnsTable.querySelector('tbody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="9" class="text-center py-4">Loading...</td></tr>';

    try {
        const snap = await db.collection('users').doc(businessId).collection('purchase_returns').orderBy('date', 'desc').get();
        purchaseReturnsData = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        renderPurchaseReturnsTable();
    } catch (error) {
        console.error('Failed to load purchase returns', error);
        purchaseReturnsData = [];
        if (tbody) tbody.innerHTML = '<tr><td colspan="9" class="text-center text-danger py-4">Failed to load purchase returns</td></tr>';
    }
}

function renderPurchaseReturnsTable() {
    if (!purchaseReturnsTable) return;
    const tbody = purchaseReturnsTable.querySelector('tbody');
    if (!tbody) return;

    const q = String(purchaseReturnsSearch?.value || '').toLowerCase().trim();
    const status = String(purchaseReturnsStatusFilter?.value || 'all').trim();
    const from = String(purchaseReturnsDateFrom?.value || '').trim();
    const to = String(purchaseReturnsDateTo?.value || '').trim();

    const rows = purchaseReturnsData.filter((row) => {
        const text = `${row.party || row.supplierName || ''} ${row.reference || ''} ${row.reason || ''}`.toLowerCase();
        if (q && !text.includes(q)) return false;
        if (status !== 'all' && String(row.status || '') !== status) return false;
        const dateText = toInputDate(row.date);
        if (from && dateText && dateText < from) return false;
        if (to && dateText && dateText > to) return false;
        return true;
    });

    const total = rows.reduce((sum, row) => sum + (Number(row.amount || 0) || 0), 0);
    if (purchaseReturnsTotalAmount) purchaseReturnsTotalAmount.textContent = formatCurrency(total);

    if (!rows.length) {
        tbody.innerHTML = '<tr><td colspan="9" class="text-center text-muted py-4">No purchase returns found</td></tr>';
        return;
    }

    tbody.innerHTML = rows.map((row) => {
        const statusBadge = String(row.status || 'Open') === 'Settled' ? 'bg-success' : 'bg-warning text-dark';
        return `
            <tr>
                <td>${formatDate(row.date)}</td>
                <td>${row.party || row.supplierName || '-'}</td>
                <td>${row.reference || '-'}</td>
                <td class="text-end">${Number(row.returnedQty || 0).toLocaleString()}</td>
                <td class="text-end">${formatCurrency(row.amount || 0)}</td>
                <td class="text-end">${formatCurrency(row.amountReceived || 0)}</td>
                <td><span class="badge ${statusBadge}">${row.status || 'Open'}</span></td>
                <td>${row.reason || '-'}</td>
                <td class="table-actions-cell text-end">
                    <div class="dropdown">
                        <button
                            class="btn btn-sm btn-outline-secondary table-actions-toggle"
                            type="button"
                            data-bs-toggle="dropdown" data-bs-boundary="window"
                            aria-expanded="false"
                            aria-label="Open purchase return actions for ${row.reference || row.party || row.supplierName || 'entry'}"
                        >
                            <i class="fas fa-ellipsis-v"></i>
                        </button>
                        <ul class="dropdown-menu dropdown-menu-end shadow-sm">
                            ${(Number(row.pendingAmount || 0) > 0)
                                ? `<li><button class="dropdown-item record-purchase-return-received-btn" data-id="${row.id}" type="button"><i class="fas fa-money-bill-wave fa-fw me-2"></i>Record Received</button></li>`
                                : ''}
                            <li><button class="dropdown-item edit-purchase-return-btn" data-id="${row.id}" type="button"><i class="fas fa-edit fa-fw me-2"></i>Edit</button></li>
                            <li><hr class="dropdown-divider"></li>
                            <li><button class="dropdown-item text-danger delete-purchase-return-btn" data-id="${row.id}" type="button"><i class="fas fa-trash fa-fw me-2"></i>Delete</button></li>
                        </ul>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}
