import { db } from './firebase-config.js';
import { checkAuth, formatDate } from './dashboard.js';
import { showAlert } from './auth.js';

const addReturnBtn = document.getElementById('addReturnBtn');
const saveReturnBtn = document.getElementById('saveReturnBtn');
const returnsTable = document.getElementById('returnsTable');
const returnModalEl = document.getElementById('returnModal');
const returnModalTitle = document.getElementById('returnModalTitle');

const returnsSearch = document.getElementById('returnsSearch');
const returnsStatusFilter = document.getElementById('returnsStatusFilter');
const returnsDateFrom = document.getElementById('returnsDateFrom');
const returnsDateTo = document.getElementById('returnsDateTo');
const resetReturnsFilters = document.getElementById('resetReturnsFilters');
const returnsTotalAmount = document.getElementById('returnsTotalAmount');
const returnCustomerSelect = document.getElementById('returnCustomerSelect');
const returnInvoiceSelect = document.getElementById('returnInvoiceSelect');
const returnItemsContainer = document.getElementById('returnItemsContainer');

let returnsData = [];
let currentReturnId = null;
let customersData = [];
let customerInvoicesMap = new Map();
let invoicesById = new Map();

document.addEventListener('DOMContentLoaded', async () => {
    await checkAuth();
    setupListeners();

    const hash = String(window.location.hash || '').replace(/^#/, '');
    if (hash === 'returns' || hash === 'sales-return' || hash === 'sales-returns' || hash === 'sale-return' || hash === 'sale-returns') {
        loadReturns();
    }

    window.addEventListener('sectionChanged', (e) => {
        if (e.detail === 'returns') loadReturns();
    });
});

function setupListeners() {
    if (addReturnBtn) addReturnBtn.addEventListener('click', () => { openAddReturnModal(); });
    if (saveReturnBtn) saveReturnBtn.addEventListener('click', saveReturn);
    if (returnsSearch) returnsSearch.addEventListener('input', renderReturnsTable);
    if (returnsStatusFilter) returnsStatusFilter.addEventListener('change', renderReturnsTable);
    if (returnsDateFrom) returnsDateFrom.addEventListener('change', renderReturnsTable);
    if (returnsDateTo) returnsDateTo.addEventListener('change', renderReturnsTable);

    if (resetReturnsFilters) {
        resetReturnsFilters.addEventListener('click', () => {
            if (returnsSearch) returnsSearch.value = '';
            if (returnsStatusFilter) returnsStatusFilter.value = 'all';
            if (returnsDateFrom) returnsDateFrom.value = '';
            if (returnsDateTo) returnsDateTo.value = '';
            renderReturnsTable();
        });
    }

    if (returnCustomerSelect) {
        returnCustomerSelect.addEventListener('change', () => {
            const customer = returnCustomerSelect.value || '';
            const partyInput = document.getElementById('returnParty');
            if (partyInput) partyInput.value = customer;
            populateReturnInvoiceOptions(customer);
            applySelectedInvoiceDetails();
        });
    }

    if (returnInvoiceSelect) {
        returnInvoiceSelect.addEventListener('change', () => applySelectedInvoiceDetails());
    }

    if (returnItemsContainer) {
        returnItemsContainer.addEventListener('input', (e) => {
            if (!e.target.classList.contains('return-item-qty')) return;
            const row = e.target.closest('tr');
            if (!row) return;
            const sold = Number(row.dataset.soldQty || 0) || 0;
            const rate = Number(row.dataset.rate || 0) || 0;
            let qty = Number(e.target.value || 0);
            if (!Number.isFinite(qty) || qty < 0) qty = 0;
            if (qty > sold) qty = sold;
            e.target.value = qty;
            const amount = roundMoney(qty * rate);
            const amountEl = row.querySelector('.return-item-amount');
            if (amountEl) amountEl.textContent = formatCurrency(amount);
            recalculateReturnAmountFromItems();
        });
    }

    if (returnsTable) {
        returnsTable.addEventListener('click', async (e) => {
            const editBtn = e.target.closest('.edit-return-btn');
            if (editBtn) {
                const id = editBtn.dataset.id;
                if (id) await openEditReturnModal(id);
                return;
            }

            const deleteBtn = e.target.closest('.delete-return-btn');
            if (!deleteBtn) return;
            const id = deleteBtn.dataset.id;
            if (!id) return;
            await deleteReturn(id);
        });
    }
}

function getUserContext() {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    const businessId = user.businessId || user.uid;
    return { user, businessId };
}

function toInputDate(value) {
    if (!value) return '';
    const d = value.toDate ? value.toDate() : new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    const offset = d.getTimezoneOffset() * 60000;
    return new Date(d.getTime() - offset).toISOString().split('T')[0];
}

function formatCurrency(amount = 0) {
    const value = Number(amount) || 0;
    return `₹${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function roundMoney(value) {
    return Math.round((Number(value) || 0) * 100) / 100;
}

function deriveInvoiceStatusForReturn(netAmount, amountPaid) {
    const net = roundMoney(netAmount);
    const paid = roundMoney(amountPaid);
    const balance = roundMoney(net - paid);
    if (net <= 0) return 'Returned';
    if (balance <= 0) return 'Paid';
    if (paid > 0) return 'Partial';
    return 'Pending';
}

async function applyCustomerOutstandingDelta(businessId, customerName, balanceDiff) {
    const delta = roundMoney(balanceDiff);
    if (!businessId || !customerName || Math.abs(delta) < 0.01) return;
    const customersCol = db.collection('users').doc(businessId).collection('customers');
    const snap = await customersCol.where('name', '==', customerName).limit(1).get();
    if (snap.empty) return;
    const customerRef = snap.docs[0].ref;
    await db.runTransaction(async (t) => {
        const doc = await t.get(customerRef);
        if (!doc.exists) return;
        const current = roundMoney(doc.data()?.outstandingBalance || 0);
        t.update(customerRef, {
            outstandingBalance: roundMoney(current + delta),
            lastContact: new Date()
        });
    });
}

async function applyReturnImpactToInvoice(businessId, invoiceId, deltaAmount) {
    const delta = roundMoney(deltaAmount);
    if (!businessId || !invoiceId || Math.abs(delta) < 0.01) return;

    const txCol = db.collection('users').doc(businessId).collection('transactions');
    const invoiceRef = txCol.doc(invoiceId);

    const result = await db.runTransaction(async (t) => {
        const invoiceDoc = await t.get(invoiceRef);
        if (!invoiceDoc.exists) return null;

        const inv = invoiceDoc.data() || {};
        const invoiceAmount = roundMoney(inv.amount || inv.totalAmount || inv.grandTotal || 0);
        const currentPaid = roundMoney(inv.amountPaid || 0);
        const currentReturns = roundMoney(inv.returnsTotal || 0);
        const nextReturns = Math.max(0, roundMoney(currentReturns + delta));
        const netAmount = Math.max(0, roundMoney(invoiceAmount - nextReturns));
        const nextBalance = roundMoney(netAmount - currentPaid);
        const nextStatus = deriveInvoiceStatusForReturn(netAmount, currentPaid);

        t.update(invoiceRef, {
            returnsTotal: nextReturns,
            effectiveAmount: netAmount,
            balance: nextBalance,
            status: nextStatus,
            updatedAt: new Date()
        });

        const oldBalance = roundMoney(inv.balance || 0);
        const balanceDiff = roundMoney(nextBalance - oldBalance);
        return {
            customer: String(inv.customer || '').trim(),
            balanceDiff
        };
    });

    if (result?.customer && Math.abs(result.balanceDiff) >= 0.01) {
        await applyCustomerOutstandingDelta(businessId, result.customer, result.balanceDiff);
    }
}

function buildReturnItemQtyMap(items = []) {
    const map = new Map();
    (items || []).forEach((item) => {
        const key = getReturnItemKey(item);
        const qty = Number(item?.quantity || 0) || 0;
        if (!key || Math.abs(qty) < 0.0001) return;
        const current = Number(map.get(key)?.quantity || 0) || 0;
        const itemId = String(item?.itemId || '').trim();
        const name = String(item?.name || '').trim();
        map.set(key, {
            itemId,
            name,
            quantity: roundMoney(current + qty)
        });
    });
    return map;
}

async function applyStockDeltas(businessId, itemDeltas = []) {
    const valid = (itemDeltas || []).filter((item) => String(item?.itemId || '').trim() && Math.abs(Number(item?.quantityDelta || 0)) >= 0.0001);
    if (!valid.length) return;
    await db.runTransaction(async (t) => {
        for (const item of valid) {
            const itemId = String(item.itemId || '').trim();
            const delta = Number(item.quantityDelta || 0) || 0;
            const ref = db.collection('users').doc(businessId).collection('inventory').doc(itemId);
            const doc = await t.get(ref);
            if (!doc.exists) continue;
            const currentQty = Number(doc.data()?.quantity || 0) || 0;
            const nextQty = Math.max(0, roundMoney(currentQty + delta));
            t.update(ref, { quantity: nextQty, updatedAt: new Date() });
        }
    });
}

async function getInvoiceDocData(businessId, invoiceId) {
    if (!businessId || !invoiceId) return null;
    const cached = invoicesById.get(invoiceId);
    if (cached) return cached;
    const doc = await db.collection('users').doc(businessId).collection('transactions').doc(invoiceId).get();
    if (!doc.exists) return null;
    const data = { id: doc.id, ...doc.data() };
    invoicesById.set(invoiceId, data);
    return data;
}

async function applyReturnStockByAmountRatio(businessId, invoiceId, deltaAmount) {
    const delta = roundMoney(deltaAmount);
    if (!invoiceId || Math.abs(delta) < 0.01) return;
    const inv = await getInvoiceDocData(businessId, invoiceId);
    if (!inv) return;
    const invoiceAmount = roundMoney(inv.amount || inv.totalAmount || inv.grandTotal || 0);
    if (invoiceAmount <= 0 || !Array.isArray(inv.items) || !inv.items.length) return;
    const ratio = delta / invoiceAmount;
    const itemDeltas = inv.items.map((item) => ({
        itemId: String(item?.itemId || '').trim(),
        quantityDelta: roundMoney((Number(item?.quantity || 0) || 0) * ratio)
    })).filter((item) => item.itemId && Math.abs(item.quantityDelta) >= 0.0001);
    await applyStockDeltas(businessId, itemDeltas);
}

async function applyReturnStockByItemDelta(businessId, prevData = null, nextData = null) {
    const prevInvoiceId = String(prevData?.invoiceId || '').trim();
    const nextInvoiceId = String(nextData?.invoiceId || '').trim();
    const prevItems = Array.isArray(prevData?.returnItems) ? prevData.returnItems : [];
    const nextItems = Array.isArray(nextData?.returnItems) ? nextData.returnItems : [];

    if (prevInvoiceId && nextInvoiceId && prevInvoiceId === nextInvoiceId) {
        const prevMap = buildReturnItemQtyMap(prevItems);
        const nextMap = buildReturnItemQtyMap(nextItems);
        const keys = new Set([...prevMap.keys(), ...nextMap.keys()]);
        const itemDeltas = Array.from(keys).map((key) => {
            const prev = prevMap.get(key) || {};
            const next = nextMap.get(key) || {};
            const itemId = String(next.itemId || prev.itemId || '').trim();
            const qty = roundMoney((Number(next.quantity || 0) || 0) - (Number(prev.quantity || 0) || 0));
            return { itemId, quantityDelta: qty };
        }).filter((item) => item.itemId && Math.abs(item.quantityDelta) >= 0.0001);
        if (itemDeltas.length) {
            await applyStockDeltas(businessId, itemDeltas);
            return;
        }
    } else {
        const revertDeltas = buildReturnItemQtyMap(prevItems);
        const applyDeltas = buildReturnItemQtyMap(nextItems);
        const itemDeltas = [];
        revertDeltas.forEach((val) => {
            if (!val.itemId) return;
            itemDeltas.push({ itemId: val.itemId, quantityDelta: roundMoney(-1 * (Number(val.quantity || 0) || 0)) });
        });
        applyDeltas.forEach((val) => {
            if (!val.itemId) return;
            itemDeltas.push({ itemId: val.itemId, quantityDelta: roundMoney(Number(val.quantity || 0) || 0) });
        });
        if (itemDeltas.length) {
            await applyStockDeltas(businessId, itemDeltas);
            return;
        }
    }

    // Legacy fallback for old returns without item lines.
    const prevAmount = roundMoney(prevData?.amount || 0);
    const nextAmount = roundMoney(nextData?.amount || 0);
    if (prevInvoiceId && nextInvoiceId && prevInvoiceId === nextInvoiceId) {
        const delta = roundMoney(nextAmount - prevAmount);
        if (Math.abs(delta) >= 0.01) await applyReturnStockByAmountRatio(businessId, nextInvoiceId, delta);
        return;
    }
    if (prevInvoiceId && prevAmount > 0) await applyReturnStockByAmountRatio(businessId, prevInvoiceId, -prevAmount);
    if (nextInvoiceId && nextAmount > 0) await applyReturnStockByAmountRatio(businessId, nextInvoiceId, nextAmount);
}

async function applyReturnDeltaChanges(businessId, prevData = null, nextData = null) {
    const prevInvoiceId = String(prevData?.invoiceId || '').trim();
    const nextInvoiceId = String(nextData?.invoiceId || '').trim();
    const prevAmount = roundMoney(prevData?.amount || 0);
    const nextAmount = roundMoney(nextData?.amount || 0);

    if (prevInvoiceId && nextInvoiceId && prevInvoiceId === nextInvoiceId) {
        const delta = roundMoney(nextAmount - prevAmount);
        if (Math.abs(delta) >= 0.01) {
            await applyReturnImpactToInvoice(businessId, nextInvoiceId, delta);
        }
        await applyReturnStockByItemDelta(businessId, prevData, nextData);
        return;
    }

    if (prevInvoiceId && prevAmount > 0) {
        await applyReturnImpactToInvoice(businessId, prevInvoiceId, -prevAmount);
    }
    if (nextInvoiceId && nextAmount > 0) {
        await applyReturnImpactToInvoice(businessId, nextInvoiceId, nextAmount);
    }
    await applyReturnStockByItemDelta(businessId, prevData, nextData);
}

function getReturnCustomerName() {
    const selected = returnCustomerSelect?.value || '';
    if (selected) return selected;
    return (document.getElementById('returnParty')?.value || '').trim();
}

function toInvoiceOptionLabel(invoice = {}) {
    const number = invoice.invoiceNo || `#${String(invoice.id || '').slice(0, 6).toUpperCase()}`;
    const date = formatDate(invoice.date);
    const amount = Number(invoice.amount || 0) || 0;
    const balance = Number(invoice.balance || 0) || 0;
    return `${number} | ${date} | Amt: ₹${amount.toLocaleString()} | Bal: ₹${balance.toLocaleString()}`;
}

async function loadCustomersAndInvoices() {
    const { businessId } = getUserContext();
    if (!businessId) return;

    try {
        const [customersSnap, invoicesSnap] = await Promise.all([
            db.collection('users').doc(businessId).collection('customers').orderBy('name').get(),
            db.collection('users').doc(businessId).collection('transactions')
                .where('type', '==', 'Invoice')
                .orderBy('date', 'desc')
                .get()
        ]);

        customersData = customersSnap.docs
            .map((doc) => ({ id: doc.id, ...doc.data() }))
            .filter((c) => String(c.name || '').trim());

        customerInvoicesMap = new Map();
        invoicesById = new Map();
        invoicesSnap.forEach((doc) => {
            const data = doc.data() || {};
            invoicesById.set(doc.id, { id: doc.id, ...data });
            const customer = String(data.customer || '').trim();
            if (!customer) return;
            const list = customerInvoicesMap.get(customer) || [];
            list.push({ id: doc.id, ...data });
            customerInvoicesMap.set(customer, list);
        });
    } catch (error) {
        console.error('Failed to load customers/invoices for returns', error);
        customersData = [];
        customerInvoicesMap = new Map();
        invoicesById = new Map();
    }
}

function populateReturnCustomerOptions(selectedCustomer = '') {
    if (!returnCustomerSelect) return;
    returnCustomerSelect.innerHTML = '<option value="">Select Customer...</option>';

    customersData.forEach((customer) => {
        const name = String(customer.name || '').trim();
        if (!name) return;
        const opt = document.createElement('option');
        opt.value = name;
        opt.textContent = name;
        returnCustomerSelect.appendChild(opt);
    });

    const fallback = String(selectedCustomer || '').trim();
    if (fallback && !Array.from(returnCustomerSelect.options).some((o) => o.value === fallback)) {
        const opt = document.createElement('option');
        opt.value = fallback;
        opt.textContent = fallback;
        returnCustomerSelect.appendChild(opt);
    }

    returnCustomerSelect.value = fallback || '';
}

function populateReturnInvoiceOptions(customerName, selectedInvoiceId = '', selectedReference = '') {
    if (!returnInvoiceSelect) return;
    returnInvoiceSelect.innerHTML = '<option value="">Select Invoice...</option>';
    const customer = String(customerName || '').trim();
    if (!customer) return;

    const list = customerInvoicesMap.get(customer) || [];
    let matchedValue = '';

    list.forEach((invoice) => {
        const opt = document.createElement('option');
        opt.value = invoice.id;
        opt.textContent = toInvoiceOptionLabel(invoice);
        opt.dataset.reference = String(invoice.invoiceNo || '').trim();
        opt.dataset.amount = String(Number(invoice.amount || 0) || 0);
        opt.dataset.balance = String(Number(invoice.balance || 0) || 0);
        returnInvoiceSelect.appendChild(opt);

        if (!matchedValue && selectedInvoiceId && invoice.id === selectedInvoiceId) {
            matchedValue = invoice.id;
        }
        const ref = String(invoice.invoiceNo || '').trim();
        if (!matchedValue && selectedReference && ref && ref === selectedReference) {
            matchedValue = invoice.id;
        }
    });

    returnInvoiceSelect.value = matchedValue || '';
}

function getReturnItemKey(item = {}) {
    const itemId = String(item.itemId || '').trim();
    if (itemId) return `id:${itemId}`;
    return `name:${String(item.name || '').trim().toLowerCase()}`;
}

function buildExistingReturnedQtyMap(invoiceId, excludeReturnId = null) {
    const map = new Map();
    if (!invoiceId) return map;
    (returnsData || []).forEach((row) => {
        if (!row || row.id === excludeReturnId) return;
        if (String(row.invoiceId || '') !== String(invoiceId)) return;
        const items = Array.isArray(row.returnItems) ? row.returnItems : [];
        items.forEach((item) => {
            const key = getReturnItemKey(item);
            const qty = Number(item.quantity || 0) || 0;
            if (!key || qty <= 0) return;
            map.set(key, (map.get(key) || 0) + qty);
        });
    });
    return map;
}

function getCurrentEditingReturn() {
    if (!currentReturnId) return null;
    return (returnsData || []).find((r) => r.id === currentReturnId) || null;
}

function recalculateReturnAmountFromItems() {
    const amountInput = document.getElementById('returnAmount');
    if (!amountInput || !returnItemsContainer) return;
    const rows = Array.from(returnItemsContainer.querySelectorAll('tr.return-item-row'));
    const total = rows.reduce((sum, row) => {
        const qtyInput = row.querySelector('.return-item-qty');
        const qty = Number(qtyInput?.value || 0) || 0;
        const rate = Number(row.dataset.rate || 0) || 0;
        return sum + roundMoney(qty * rate);
    }, 0);
    amountInput.value = String(roundMoney(total));
}

function renderReturnItemsForInvoice(invoice = null, selectedReturnItems = []) {
    if (!returnItemsContainer) return;
    if (!invoice || !Array.isArray(invoice.items) || !invoice.items.length) {
        returnItemsContainer.innerHTML = '<tr><td colspan="5" class="text-center text-muted">No invoice items found</td></tr>';
        recalculateReturnAmountFromItems();
        return;
    }

    const existingQtyMap = buildExistingReturnedQtyMap(invoice.id, currentReturnId);
    const selectedMap = new Map((selectedReturnItems || []).map((item) => [getReturnItemKey(item), Number(item.quantity || 0) || 0]));

    returnItemsContainer.innerHTML = invoice.items.map((item, idx) => {
        const key = getReturnItemKey(item);
        const soldQty = Number(item.quantity || 0) || 0;
        const alreadyReturned = Number(existingQtyMap.get(key) || 0) || 0;
        const maxAllowed = Math.max(0, roundMoney(soldQty - alreadyReturned));
        const defaultQty = Math.min(maxAllowed, Math.max(0, Number(selectedMap.get(key) || 0)));
        const rate = Number(item.price || item.rate || item.unitPrice || 0) || 0;
        const amount = roundMoney(defaultQty * rate);
        const name = String(item.name || `Item ${idx + 1}`);
        return `
            <tr class="return-item-row" data-item-id="${String(item.itemId || '').replace(/"/g, '&quot;')}" data-item-name="${name.replace(/"/g, '&quot;')}" data-rate="${rate}" data-sold-qty="${maxAllowed}">
                <td>${name}</td>
                <td class="text-end">${soldQty.toLocaleString()}</td>
                <td class="text-end">
                    <input type="number" class="form-control form-control-sm text-end return-item-qty" min="0" max="${maxAllowed}" step="0.01" value="${defaultQty}">
                </td>
                <td class="text-end">${formatCurrency(rate)}</td>
                <td class="text-end return-item-amount">${formatCurrency(amount)}</td>
            </tr>
        `;
    }).join('');

    recalculateReturnAmountFromItems();
}

function collectReturnItemsFromForm() {
    if (!returnItemsContainer) return [];
    const rows = Array.from(returnItemsContainer.querySelectorAll('tr.return-item-row'));
    return rows.map((row) => {
        const qtyInput = row.querySelector('.return-item-qty');
        const maxQty = Number(row.dataset.soldQty || 0) || 0;
        let qty = Number(qtyInput?.value || 0) || 0;
        if (!Number.isFinite(qty) || qty < 0) qty = 0;
        qty = Math.min(maxQty, qty);
        const rate = Number(row.dataset.rate || 0) || 0;
        const itemId = String(row.dataset.itemId || '').trim();
        const name = String(row.dataset.itemName || '').trim();
        return {
            itemId,
            name,
            quantity: roundMoney(qty),
            rate: roundMoney(rate),
            amount: roundMoney(qty * rate)
        };
    }).filter((item) => item.quantity > 0);
}

function applySelectedInvoiceDetails() {
    const selectedOption = returnInvoiceSelect?.selectedOptions?.[0] || null;
    if (!selectedOption || !selectedOption.value) {
        renderReturnItemsForInvoice(null, []);
        const amountInput = document.getElementById('returnAmount');
        if (amountInput) amountInput.value = '0';
        return;
    }

    const reference = selectedOption.dataset.reference || '';

    const referenceInput = document.getElementById('returnReference');
    if (referenceInput) referenceInput.value = reference;

    const invoice = invoicesById.get(selectedOption.value) || null;
    const editing = getCurrentEditingReturn();
    const selectedItems = (editing && String(editing.invoiceId || '') === String(selectedOption.value) && Array.isArray(editing.returnItems))
        ? editing.returnItems
        : [];
    renderReturnItemsForInvoice(invoice, selectedItems);
}

async function prepareReturnFormOptions(selectedCustomer = '', selectedInvoiceId = '', selectedReference = '') {
    await loadCustomersAndInvoices();
    populateReturnCustomerOptions(selectedCustomer);
    populateReturnInvoiceOptions(selectedCustomer, selectedInvoiceId, selectedReference);
    applySelectedInvoiceDetails();
}

function getReturnFormData() {
    const dateVal = document.getElementById('returnDate')?.value || '';
    const selectedInvoice = returnInvoiceSelect?.selectedOptions?.[0] || null;
    const customer = getReturnCustomerName();
    const party = customer;
    const referenceInput = (document.getElementById('returnReference')?.value || '').trim();
    const invoiceNo = (selectedInvoice?.dataset?.reference || '').trim();
    const returnItems = collectReturnItemsFromForm();
    const itemsAmount = roundMoney(returnItems.reduce((sum, item) => sum + (Number(item.amount || 0) || 0), 0));
    const amountInputVal = parseFloat(document.getElementById('returnAmount')?.value || '0') || 0;
    const amount = itemsAmount > 0 ? itemsAmount : amountInputVal;

    return {
        date: dateVal ? new Date(dateVal) : null,
        type: 'Sales Return',
        party,
        customer,
        invoiceId: returnInvoiceSelect?.value || null,
        invoiceNo: invoiceNo || referenceInput || null,
        reference: referenceInput || invoiceNo,
        amount,
        returnItems,
        status: document.getElementById('returnStatus')?.value || 'Open',
        reason: (document.getElementById('returnReason')?.value || '').trim()
    };
}

function setReturnFormData(row = null) {
    document.getElementById('returnDate').value = row ? toInputDate(row.date) : toInputDate(new Date());
    document.getElementById('returnType').value = 'Sales Return';
    document.getElementById('returnParty').value = row?.party || row?.customer || '';
    document.getElementById('returnReference').value = row?.reference || row?.invoiceNo || '';
    document.getElementById('returnAmount').value = row?.amount ?? 0;
    document.getElementById('returnStatus').value = row?.status || 'Open';
    document.getElementById('returnReason').value = row?.reason || '';
    if (!row && returnItemsContainer) {
        returnItemsContainer.innerHTML = '<tr><td colspan="5" class="text-center text-muted">Select invoice to load items</td></tr>';
    }
}

async function openAddReturnModal() {
    currentReturnId = null;
    if (returnModalTitle) returnModalTitle.textContent = 'Add Sales Return';
    setReturnFormData();
    await prepareReturnFormOptions();
    if (returnModalEl) bootstrap.Modal.getOrCreateInstance(returnModalEl).show();
}

async function openEditReturnModal(id) {
    const row = returnsData.find((r) => r.id === id);
    if (!row) return;
    currentReturnId = id;
    if (returnModalTitle) returnModalTitle.textContent = 'Edit Sales Return';
    setReturnFormData(row);
    const selectedCustomer = row.customer || row.party || '';
    await prepareReturnFormOptions(selectedCustomer, row.invoiceId || '', row.reference || row.invoiceNo || '');
    if (returnModalEl) bootstrap.Modal.getOrCreateInstance(returnModalEl).show();
}

async function saveReturn() {
    const { businessId } = getUserContext();
    if (!businessId) return;
    const existingRow = currentReturnId
        ? (returnsData.find((r) => r.id === currentReturnId) || null)
        : null;

    const data = getReturnFormData();
    if (!data.date || Number.isNaN(data.date.getTime())) {
        return showAlert('warning', 'Please select a valid date');
    }
    if (!data.party) {
        return showAlert('warning', 'Customer is required');
    }
    if (!data.invoiceId) {
        return showAlert('warning', 'Please select an invoice for this return.');
    }
    if (data.amount <= 0) {
        return showAlert('warning', 'Amount should be greater than zero');
    }
    const isLegacyEditWithoutItems = Boolean(
        existingRow
        && String(existingRow.invoiceId || '') === String(data.invoiceId || '')
        && (!Array.isArray(existingRow.returnItems) || !existingRow.returnItems.length)
    );
    if (data.invoiceId && (!Array.isArray(data.returnItems) || !data.returnItems.length) && !isLegacyEditWithoutItems) {
        return showAlert('warning', 'Select returned item quantity from invoice lines.');
    }

    const payload = {
        ...data,
        updatedAt: new Date()
    };

    try {
        const col = db.collection('users').doc(businessId).collection('returns');
        const prevRow = existingRow;
        if (currentReturnId) {
            await col.doc(currentReturnId).update(payload);
            await applyReturnDeltaChanges(businessId, prevRow, payload);
            showAlert('success', 'Sales return updated successfully');
        } else {
            payload.createdAt = new Date();
            await col.add(payload);
            await applyReturnDeltaChanges(businessId, null, payload);
            showAlert('success', 'Sales return added successfully');
        }
        bootstrap.Modal.getOrCreateInstance(returnModalEl)?.hide();
        await loadReturns();
    } catch (error) {
        console.error('Failed to save return', error);
        showAlert('danger', 'Failed to save return');
    }
}

async function deleteReturn(id) {
    const { businessId } = getUserContext();
    if (!businessId) return;
    const ok = await window.showConfirmAsync?.('Delete Sales Return', 'Delete this sales return entry?', {
        confirmText: 'Delete',
        confirmClass: 'btn-danger'
    });
    if (!ok) return;

    try {
        const oldRow = returnsData.find((r) => r.id === id) || null;
        await db.collection('users').doc(businessId).collection('returns').doc(id).delete();
        await applyReturnDeltaChanges(businessId, oldRow, null);
        showAlert('success', 'Sales return deleted');
        await loadReturns();
    } catch (error) {
        console.error('Failed to delete return', error);
        showAlert('danger', 'Failed to delete return');
    }
}

async function loadReturns() {
    const { businessId } = getUserContext();
    if (!businessId || !returnsTable) return;

    const tbody = returnsTable.querySelector('tbody');
    tbody.innerHTML = '<tr><td colspan="7" class="text-center py-4">Loading...</td></tr>';

    try {
        const snap = await db.collection('users').doc(businessId).collection('returns').orderBy('date', 'desc').get();
        returnsData = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        renderReturnsTable();
    } catch (error) {
        console.error('Failed to load returns', error);
        returnsData = [];
        tbody.innerHTML = '<tr><td colspan="7" class="text-center text-danger py-4">Failed to load returns</td></tr>';
    }
}

function renderReturnsTable() {
    if (!returnsTable) return;
    const tbody = returnsTable.querySelector('tbody');
    if (!tbody) return;

    const q = (returnsSearch?.value || '').toLowerCase().trim();
    const status = returnsStatusFilter?.value || 'all';
    const from = returnsDateFrom?.value || '';
    const to = returnsDateTo?.value || '';

    const rows = returnsData.filter((row) => {
        const text = `${row.party || ''} ${row.reference || ''} ${row.reason || ''}`.toLowerCase();
        if (q && !text.includes(q)) return false;
        if (status !== 'all' && row.status !== status) return false;

        const d = toInputDate(row.date);
        if (from && d && d < from) return false;
        if (to && d && d > to) return false;
        return true;
    });

    const total = rows.reduce((sum, r) => sum + (parseFloat(r.amount || 0) || 0), 0);
    if (returnsTotalAmount) returnsTotalAmount.textContent = formatCurrency(total);

    if (!rows.length) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted py-4">No sales returns found</td></tr>';
        return;
    }

    tbody.innerHTML = rows.map((row) => {
        const amount = parseFloat(row.amount || 0) || 0;
        const badge = row.status === 'Settled' ? 'bg-success' : 'bg-warning text-dark';
        return `
            <tr>
                <td>${formatDate(row.date)}</td>
                <td>${row.party || '-'}</td>
                <td>${row.reference || '-'}</td>
                <td class="text-end">${formatCurrency(amount)}</td>
                <td><span class="badge ${badge}">${row.status || 'Open'}</span></td>
                <td>${row.reason || '-'}</td>
                <td class="table-actions-cell text-end">
                    <div class="dropdown">
                        <button
                            class="btn btn-sm btn-outline-secondary table-actions-toggle"
                            type="button"
                            data-bs-toggle="dropdown" data-bs-boundary="window"
                            aria-expanded="false"
                            aria-label="Open return actions for ${row.reference || row.party || 'entry'}"
                        >
                            <i class="fas fa-ellipsis-v"></i>
                        </button>
                        <ul class="dropdown-menu dropdown-menu-end shadow-sm">
                            <li><button class="dropdown-item edit-return-btn" data-id="${row.id}" type="button"><i class="fas fa-edit fa-fw me-2"></i>Edit</button></li>
                            <li><hr class="dropdown-divider"></li>
                            <li><button class="dropdown-item text-danger delete-return-btn" data-id="${row.id}" type="button"><i class="fas fa-trash fa-fw me-2"></i>Delete</button></li>
                        </ul>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}
