import { db } from './firebase-config.js';
import { checkAuth, formatDate, downloadCSV, downloadPDF } from './dashboard.js';
import { showAlert } from './auth.js';

const addPurchaseOrderBtn = document.getElementById('addPurchaseOrderBtn');
const exportPurchaseOrdersPdfBtn = document.getElementById('exportPurchaseOrdersPdfBtn');
const exportPurchaseOrdersCsvBtn = document.getElementById('exportPurchaseOrdersCsvBtn');
const purchaseOrderSearch = document.getElementById('purchaseOrderSearch');
const purchaseOrderStatusFilter = document.getElementById('purchaseOrderStatusFilter');
const purchaseOrderDateFrom = document.getElementById('purchaseOrderDateFrom');
const purchaseOrderDateTo = document.getElementById('purchaseOrderDateTo');
const resetPurchaseOrderFilters = document.getElementById('resetPurchaseOrderFilters');
const purchaseOrdersTable = document.getElementById('purchaseOrdersTable');
const purchaseOrderTotalValue = document.getElementById('purchaseOrderTotalValue');

const purchaseOrderModalEl = document.getElementById('purchaseOrderModal');
const purchaseOrderModalTitle = document.getElementById('purchaseOrderModalTitle');
const purchaseOrderForm = document.getElementById('purchaseOrderForm');
const purchaseOrderNo = document.getElementById('purchaseOrderNo');
const purchaseOrderSupplier = document.getElementById('purchaseOrderSupplier');
const purchaseOrderOrderDate = document.getElementById('purchaseOrderOrderDate');
const purchaseOrderExpectedDate = document.getElementById('purchaseOrderExpectedDate');
const purchaseOrderStatus = document.getElementById('purchaseOrderStatus');
const purchaseOrderPaymentType = document.getElementById('purchaseOrderPaymentType');
const purchaseOrderAdvanceAmount = document.getElementById('purchaseOrderAdvanceAmount');
const purchaseOrderNotes = document.getElementById('purchaseOrderNotes');
const purchaseOrderItems = document.getElementById('purchaseOrderItems');
const purchaseOrderAddItemBtn = document.getElementById('purchaseOrderAddItemBtn');
const purchaseOrderGrandTotal = document.getElementById('purchaseOrderGrandTotal');
const savePurchaseOrderBtn = document.getElementById('savePurchaseOrderBtn');

let purchaseOrderModal = null;
let editingPurchaseOrderId = null;
let purchaseOrdersData = [];
let suppliersCache = [];
let materialsCache = [];
let purchaseOrdersCollection = 'purchase_orders';

const RAW_CATEGORIES = ['Raw Materials', 'Cement', 'Sand', 'Dust', 'Aggregate', 'Steel', 'Fly Ash', 'Admixtures', 'Chemicals'];

function getUserContext() {
    const user = JSON.parse(localStorage.getItem('user') || 'null');
    if (!user) return null;
    return { user, businessId: user.businessId || user.uid };
}

function toInputDate(value) {
    if (!value) return '';
    const date = value.toDate ? value.toDate() : new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toISOString().split('T')[0];
}

function formatMoney(value) {
    const amount = Number(value || 0);
    return `\u20b9${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function escapeHtml(value) {
    return String(value || '').replace(/[&<>"']/g, (ch) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    })[ch]);
}

function normalizeDateOnly(value) {
    if (!value) return null;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    d.setHours(0, 0, 0, 0);
    return d;
}

function normalizeText(value) {
    return String(value || '').trim().toLowerCase();
}

function isPermissionDenied(error) {
    return String(error?.code || '').includes('permission-denied');
}

function isPurchaseOrderDoc(data = {}) {
    const domain = normalizeText(data.orderDomain || data.domain || data.module);
    const type = normalizeText(data.orderType || data.type || data.docType);
    return domain === 'purchase' || type === 'purchase_order' || type === 'purchase-order';
}

function buildPoNo(existing = '') {
    if (existing) return existing;
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const t = String(now.getHours()).padStart(2, '0') + String(now.getMinutes()).padStart(2, '0');
    return `PO-${y}${m}${d}-${t}`;
}

function getStatusBadge(status) {
    const map = {
        Pending: 'warning',
        Draft: 'secondary',
        Sent: 'primary',
        'Partially Received': 'warning',
        Completed: 'success',
        Cancelled: 'danger'
    };
    return map[status] || 'secondary';
}

function setSupplierOptions(selectedId = '') {
    if (!purchaseOrderSupplier) return;
    let options = '<option value="">Select Supplier</option>';
    suppliersCache.forEach((s) => {
        options += `<option value="${s.id}">${escapeHtml(s.name || 'Supplier')}</option>`;
    });
    purchaseOrderSupplier.innerHTML = options;
    if (selectedId) purchaseOrderSupplier.value = selectedId;
}

function materialOptionsHtml() {
    const options = ['<option value="">Select Material</option>'];
    materialsCache.forEach((m) => {
        const rate = Number(m.standardRate ?? m.costPrice ?? m.unitCost ?? m.cost ?? 0) || 0;
        options.push(`<option value="${m.id}" data-rate="${rate}">${escapeHtml(m.name || 'Material')}</option>`);
    });
    options.push('<option value="__manual__">Manual Material</option>');
    return options.join('');
}

function addPurchaseOrderItemRow(prefill = {}) {
    if (!purchaseOrderItems) return;
    const tr = document.createElement('tr');
    tr.innerHTML = `
        <td>
            <select class="form-select form-select-sm po-item-material">
                ${materialOptionsHtml()}
            </select>
            <input type="text" class="form-control form-control-sm mt-1 po-item-name d-none" placeholder="Enter material name">
        </td>
        <td><input type="number" class="form-control form-control-sm po-item-qty" min="0.01" step="0.01" value="${Number(prefill.qty || 1)}"></td>
        <td><input type="number" class="form-control form-control-sm po-item-cost" min="0" step="0.01" value="${Number(prefill.unitCost || 0)}"></td>
        <td class="po-item-amount">\u20b90.00</td>
        <td class="text-center">
            <button type="button" class="btn btn-sm btn-outline-danger po-item-remove" title="Remove">
                <i class="fas fa-times"></i>
            </button>
        </td>
    `;
    const select = tr.querySelector('.po-item-material');
    if (prefill.materialId) {
        select.value = prefill.materialId;
    }
    if (prefill.materialName && !select.value) {
        select.value = '__manual__';
    }
    const nameInput = tr.querySelector('.po-item-name');
    if (select.value === '__manual__' && nameInput) {
        nameInput.classList.remove('d-none');
        nameInput.value = String(prefill.materialName || '');
    }
    purchaseOrderItems.appendChild(tr);
    calculateFormTotal();
}

function calculateFormTotal() {
    if (!purchaseOrderItems) return 0;
    let total = 0;
    purchaseOrderItems.querySelectorAll('tr').forEach((row) => {
        const qty = Number(row.querySelector('.po-item-qty')?.value || 0);
        const cost = Number(row.querySelector('.po-item-cost')?.value || 0);
        const amount = Math.max(0, qty * cost);
        total += amount;
        const amountEl = row.querySelector('.po-item-amount');
        if (amountEl) amountEl.textContent = formatMoney(amount);
    });
    if (purchaseOrderGrandTotal) purchaseOrderGrandTotal.textContent = formatMoney(total);
    return total;
}

function getFormItems() {
    if (!purchaseOrderItems) return [];
    const items = [];
    purchaseOrderItems.querySelectorAll('tr').forEach((row) => {
        const select = row.querySelector('.po-item-material');
        const materialIdRaw = String(select?.value || '').trim();
        const materialId = materialIdRaw === '__manual__' ? '' : materialIdRaw;
        const manualName = String(row.querySelector('.po-item-name')?.value || '').trim();
        const materialName = materialIdRaw === '__manual__'
            ? manualName
            : String(select?.selectedOptions?.[0]?.textContent || '').trim();
        const qty = Number(row.querySelector('.po-item-qty')?.value || 0);
        const unitCost = Number(row.querySelector('.po-item-cost')?.value || 0);
        if (materialName && qty > 0) {
            items.push({
                materialId,
                materialName,
                qty,
                unitCost,
                amount: Number((qty * unitCost).toFixed(2))
            });
        }
    });
    return items;
}

function resetForm() {
    editingPurchaseOrderId = null;
    if (purchaseOrderModalTitle) purchaseOrderModalTitle.textContent = 'New Purchase Order';
    if (purchaseOrderForm) purchaseOrderForm.reset();
    if (purchaseOrderNo) purchaseOrderNo.value = buildPoNo();
    if (purchaseOrderOrderDate) purchaseOrderOrderDate.valueAsDate = new Date();
    if (purchaseOrderStatus) purchaseOrderStatus.value = 'Pending';
    if (purchaseOrderPaymentType) purchaseOrderPaymentType.value = 'Cash';
    if (purchaseOrderAdvanceAmount) purchaseOrderAdvanceAmount.value = '0';
    if (purchaseOrderItems) purchaseOrderItems.innerHTML = '';
    addPurchaseOrderItemRow();
    setSupplierOptions();
}

function openCreateModal() {
    resetForm();
    purchaseOrderModal?.show();
}

async function openEditModal(id) {
    const row = purchaseOrdersData.find((p) => p.id === id);
    if (!row) return;
    editingPurchaseOrderId = id;
    if (purchaseOrderModalTitle) purchaseOrderModalTitle.textContent = 'Edit Purchase Order';
    if (purchaseOrderNo) purchaseOrderNo.value = row.poNo || buildPoNo();
    setSupplierOptions(row.supplierId || '');
    if (purchaseOrderOrderDate) purchaseOrderOrderDate.value = toInputDate(row.orderDate || row.createdAt);
    if (purchaseOrderExpectedDate) purchaseOrderExpectedDate.value = toInputDate(row.expectedDate);
    if (purchaseOrderStatus) purchaseOrderStatus.value = row.status || 'Pending';
    if (purchaseOrderPaymentType) purchaseOrderPaymentType.value = row.paymentType || 'Cash';
    if (purchaseOrderAdvanceAmount) purchaseOrderAdvanceAmount.value = String(Number(row.advanceAmount || 0));
    if (purchaseOrderNotes) purchaseOrderNotes.value = row.notes || '';
    if (purchaseOrderItems) purchaseOrderItems.innerHTML = '';
    const items = Array.isArray(row.items) ? row.items : [];
    if (items.length) items.forEach((item) => addPurchaseOrderItemRow(item));
    else addPurchaseOrderItemRow();
    calculateFormTotal();
    purchaseOrderModal?.show();
}

async function loadSuppliersAndMaterials() {
    const ctx = getUserContext();
    if (!ctx) return;
    const root = db.collection('users').doc(ctx.businessId);
    try {
        const suppliersSnap = await root.collection('suppliers').orderBy('name').get();
        suppliersCache = suppliersSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
        suppliersCache = [];
        console.error('Failed to load suppliers for purchase orders', error);
    }

    materialsCache = [];
    try {
        const materialsSnap = await root.collection('raw_materials').orderBy('name').get();
        materialsCache = materialsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
        if (!isPermissionDenied(error)) {
            console.error('Failed to load raw_materials for purchase orders', error);
        }
    }

    // Most setups store raw materials in `inventory`; use it as fallback when the dedicated
    // collection is inaccessible or simply empty.
    if (!materialsCache.length) {
        try {
            const invSnap = await root.collection('inventory').orderBy('name').get();
            materialsCache = invSnap.docs
                .map((doc) => ({ id: doc.id, ...doc.data() }))
                .filter((item) => RAW_CATEGORIES.includes(item.category) || normalizeText(item.materialType) === 'raw');
        } catch (fallbackError) {
            materialsCache = [];
            console.error('Failed to load inventory fallback for purchase order materials', fallbackError);
        }
    }
    setSupplierOptions(purchaseOrderSupplier?.value || '');
}

function getFilteredRows() {
    const search = String(purchaseOrderSearch?.value || '').trim().toLowerCase();
    const status = String(purchaseOrderStatusFilter?.value || 'all');
    const from = normalizeDateOnly(purchaseOrderDateFrom?.value || '');
    const to = normalizeDateOnly(purchaseOrderDateTo?.value || '');

    return purchaseOrdersData.filter((po) => {
        const text = `${po.poNo || ''} ${po.supplierName || ''} ${po.status || ''}`.toLowerCase();
        if (search && !text.includes(search)) return false;
        if (status !== 'all' && (po.status || '') !== status) return false;

        const orderDate = normalizeDateOnly(toInputDate(po.orderDate || po.createdAt));
        if (from && orderDate && orderDate < from) return false;
        if (to && orderDate && orderDate > to) return false;
        return true;
    });
}

function renderTable() {
    const tbody = purchaseOrdersTable?.querySelector('tbody');
    if (!tbody) return;

    const rows = getFilteredRows();
    if (!rows.length) {
        tbody.innerHTML = '<tr><td colspan="9" class="text-center text-muted">No purchase orders found</td></tr>';
        if (purchaseOrderTotalValue) purchaseOrderTotalValue.textContent = formatMoney(0);
        return;
    }

    let totalValue = 0;
    tbody.innerHTML = rows.map((po) => {
        const total = Number(po.total || 0);
        const advance = Number(po.advanceAmount || 0);
        const balance = Math.max(0, total - advance);
        totalValue += total;
        return `
            <tr>
                <td><small class="text-muted">${escapeHtml(po.poNo || '')}</small></td>
                <td>${escapeHtml(po.supplierName || '-')}</td>
                <td>${formatDate(po.orderDate || po.createdAt)}</td>
                <td>${po.expectedDate ? formatDate(po.expectedDate) : '-'}</td>
                <td><span class="badge bg-${getStatusBadge(po.status)}">${escapeHtml(po.status || 'Draft')}</span></td>
                <td>${formatMoney(total)}</td>
                <td>${formatMoney(advance)}</td>
                <td>${formatMoney(balance)}</td>
                <td class="table-actions-cell text-end">
                    <div class="dropdown">
                        <button class="btn btn-sm btn-outline-secondary table-actions-toggle" type="button" data-bs-toggle="dropdown" data-bs-boundary="window" aria-expanded="false" aria-label="Purchase order actions">
                            <i class="fas fa-ellipsis-v"></i>
                        </button>
                        <ul class="dropdown-menu dropdown-menu-end shadow-sm">
                            <li><button class="dropdown-item po-action-edit" data-id="${po.id}" type="button"><i class="fas fa-edit fa-fw me-2"></i>Edit</button></li>
                            <li><button class="dropdown-item po-action-convert" data-id="${po.id}" type="button"><i class="fas fa-file-invoice fa-fw me-2"></i>Create Purchase Bill</button></li>
                            <li><hr class="dropdown-divider"></li>
                            <li><button class="dropdown-item text-danger po-action-delete" data-id="${po.id}" type="button"><i class="fas fa-trash fa-fw me-2"></i>Delete</button></li>
                        </ul>
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    if (purchaseOrderTotalValue) purchaseOrderTotalValue.textContent = formatMoney(totalValue);
}

async function loadPurchaseOrders() {
    const ctx = getUserContext();
    const tbody = purchaseOrdersTable?.querySelector('tbody');
    if (!ctx || !tbody) return;
    tbody.innerHTML = '<tr><td colspan="9" class="text-center">Loading...</td></tr>';

    try {
        const snapshot = await db.collection('users').doc(ctx.businessId)
            .collection('purchase_orders')
            .orderBy('createdAt', 'desc')
            .get();
        purchaseOrdersCollection = 'purchase_orders';
        purchaseOrdersData = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        renderTable();
    } catch (error) {
        if (!isPermissionDenied(error)) {
            console.error('Failed to load purchase orders', error);
            tbody.innerHTML = '<tr><td colspan="9" class="text-center text-danger">Error loading purchase orders</td></tr>';
            return;
        }
        try {
            const fallbackSnap = await db.collection('users').doc(ctx.businessId)
                .collection('orders')
                .orderBy('createdAt', 'desc')
                .get();
            purchaseOrdersCollection = 'orders';
            purchaseOrdersData = fallbackSnap.docs
                .map((doc) => ({ id: doc.id, ...doc.data() }))
                .filter((row) => isPurchaseOrderDoc(row));
            renderTable();
        } catch (fallbackError) {
            console.error('Failed to load purchase orders (fallback)', fallbackError);
            tbody.innerHTML = '<tr><td colspan="9" class="text-center text-danger">Error loading purchase orders</td></tr>';
        }
    }
}

async function savePurchaseOrder() {
    const ctx = getUserContext();
    if (!ctx) return;
    const poNo = String(purchaseOrderNo?.value || '').trim();
    const supplierId = String(purchaseOrderSupplier?.value || '').trim();
    const supplierName = String(purchaseOrderSupplier?.selectedOptions?.[0]?.textContent || '').trim();
    const orderDate = String(purchaseOrderOrderDate?.value || '').trim();
    const expectedDate = String(purchaseOrderExpectedDate?.value || '').trim();
    const status = String(purchaseOrderStatus?.value || 'Pending').trim();
    const paymentType = String(purchaseOrderPaymentType?.value || 'Cash').trim();
    const advanceAmount = Math.max(0, Number(purchaseOrderAdvanceAmount?.value || 0));
    const notes = String(purchaseOrderNotes?.value || '').trim();
    const items = getFormItems();
    const total = Number(calculateFormTotal().toFixed(2));

    if (!poNo || !supplierId || !supplierName || !orderDate) {
        return showAlert('warning', 'Please fill PO number, supplier, and order date.');
    }
    if (!items.length) {
        return showAlert('warning', 'Add at least one item to the purchase order.');
    }
    if (advanceAmount > total) {
        return showAlert('warning', 'Advance amount cannot be greater than total.');
    }

    const payload = {
        poNo,
        supplierId,
        supplierName,
        name: `Purchase Order ${poNo}`,
        orderDate: new Date(orderDate),
        expectedDate: expectedDate ? new Date(expectedDate) : null,
        status,
        paymentType,
        advanceAmount,
        notes,
        items,
        total,
        orderDomain: 'purchase',
        orderType: 'purchase_order',
        updatedAt: new Date()
    };

    try {
        const ref = db.collection('users').doc(ctx.businessId).collection(purchaseOrdersCollection);
        if (editingPurchaseOrderId) {
            await ref.doc(editingPurchaseOrderId).update(payload);
            showAlert('success', 'Purchase order updated');
        } else {
            await ref.add({ ...payload, createdAt: new Date() });
            showAlert('success', 'Purchase order created');
        }
        purchaseOrderModal?.hide();
        await loadPurchaseOrders();
    } catch (error) {
        console.error('Failed to save purchase order', error);
        showAlert('danger', 'Failed to save purchase order');
    }
}

async function deletePurchaseOrder(id) {
    const ctx = getUserContext();
    if (!ctx || !id) return;
    const confirmed = await window.showConfirmAsync?.('Delete Purchase Order', 'Delete this purchase order?', {
        confirmText: 'Delete',
        cancelText: 'Cancel',
        confirmClass: 'btn-danger'
    });
    if (!confirmed) return;

    try {
        await db.collection('users').doc(ctx.businessId).collection(purchaseOrdersCollection).doc(id).delete();
        purchaseOrdersData = purchaseOrdersData.filter((po) => po.id !== id);
        renderTable();
        showAlert('success', 'Purchase order deleted');
    } catch (error) {
        console.error('Failed to delete purchase order', error);
        showAlert('danger', 'Failed to delete purchase order');
    }
}

function convertToPurchaseBill(id) {
    const po = purchaseOrdersData.find((p) => p.id === id);
    if (!po) return;
    sessionStorage.setItem('prefill_purchase_order_id', id);
    sessionStorage.setItem('prefill_purchase_order_data', JSON.stringify(po));
    if (window.navigateToSection) {
        window.navigateToSection('purchase-bills');
    } else {
        window.location.hash = '#purchase-bills';
    }
}

function getExportRows() {
    return getFilteredRows().map((po) => {
        const total = Number(po.total || 0);
        const advance = Number(po.advanceAmount || 0);
        return [
            po.poNo || '',
            po.supplierName || '',
            formatDate(po.orderDate || po.createdAt),
            po.expectedDate ? formatDate(po.expectedDate) : '',
            po.status || '',
            total,
            advance,
            Math.max(0, total - advance)
        ];
    });
}

function exportCSV() {
    const rows = getExportRows();
    if (!rows.length) {
        return showAlert('warning', 'No purchase orders to export.');
    }
    const headers = ['PO No', 'Supplier', 'Order Date', 'Expected Date', 'Status', 'Total', 'Advance', 'Balance'];
    const filename = `purchase_orders_${new Date().toISOString().split('T')[0]}.csv`;
    downloadCSV(filename, headers, rows);
}

function exportPDF() {
    const rows = getExportRows();
    if (!rows.length) {
        return showAlert('warning', 'No purchase orders to export.');
    }
    const headers = ['PO No', 'Supplier', 'Order Date', 'Expected Date', 'Status', 'Total', 'Advance', 'Balance'];
    const filename = `purchase_orders_${new Date().toISOString().split('T')[0]}.pdf`;
    downloadPDF(filename, 'Purchase Orders Report', headers, rows);
}

function bindEvents() {
    if (addPurchaseOrderBtn) addPurchaseOrderBtn.addEventListener('click', openCreateModal);
    if (savePurchaseOrderBtn) savePurchaseOrderBtn.addEventListener('click', savePurchaseOrder);
    if (purchaseOrderAddItemBtn) purchaseOrderAddItemBtn.addEventListener('click', () => addPurchaseOrderItemRow());
    if (exportPurchaseOrdersCsvBtn) exportPurchaseOrdersCsvBtn.addEventListener('click', exportCSV);
    if (exportPurchaseOrdersPdfBtn) exportPurchaseOrdersPdfBtn.addEventListener('click', exportPDF);

    if (purchaseOrderSearch) purchaseOrderSearch.addEventListener('input', renderTable);
    if (purchaseOrderStatusFilter) purchaseOrderStatusFilter.addEventListener('change', renderTable);
    if (purchaseOrderDateFrom) purchaseOrderDateFrom.addEventListener('change', renderTable);
    if (purchaseOrderDateTo) purchaseOrderDateTo.addEventListener('change', renderTable);
    if (resetPurchaseOrderFilters) {
        resetPurchaseOrderFilters.addEventListener('click', () => {
            if (purchaseOrderSearch) purchaseOrderSearch.value = '';
            if (purchaseOrderStatusFilter) purchaseOrderStatusFilter.value = 'all';
            if (purchaseOrderDateFrom) purchaseOrderDateFrom.value = '';
            if (purchaseOrderDateTo) purchaseOrderDateTo.value = '';
            renderTable();
        });
    }

    if (purchaseOrderItems) {
        purchaseOrderItems.addEventListener('change', (e) => {
            const select = e.target.closest('.po-item-material');
            if (select) {
                const row = select.closest('tr');
                const costInput = row?.querySelector('.po-item-cost');
                const nameInput = row?.querySelector('.po-item-name');
                if (nameInput) nameInput.classList.toggle('d-none', select.value !== '__manual__');
                const selectedRate = Number(select.selectedOptions?.[0]?.dataset?.rate || 0);
                if (costInput && Number(costInput.value || 0) <= 0 && selectedRate > 0) {
                    costInput.value = String(selectedRate);
                }
                calculateFormTotal();
            }
        });
        purchaseOrderItems.addEventListener('input', calculateFormTotal);
        purchaseOrderItems.addEventListener('click', (e) => {
            if (!e.target.closest('.po-item-remove')) return;
            const rows = purchaseOrderItems.querySelectorAll('tr');
            if (rows.length <= 1) return;
            e.target.closest('tr')?.remove();
            calculateFormTotal();
        });
    }

    if (purchaseOrdersTable) {
        purchaseOrdersTable.addEventListener('click', (e) => {
            const editBtn = e.target.closest('.po-action-edit');
            if (editBtn) return openEditModal(editBtn.dataset.id || '');
            const convertBtn = e.target.closest('.po-action-convert');
            if (convertBtn) return convertToPurchaseBill(convertBtn.dataset.id || '');
            const deleteBtn = e.target.closest('.po-action-delete');
            if (deleteBtn) return deletePurchaseOrder(deleteBtn.dataset.id || '');
        });
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    await checkAuth();
    purchaseOrderModal = purchaseOrderModalEl ? new bootstrap.Modal(purchaseOrderModalEl) : null;
    bindEvents();
    await loadSuppliersAndMaterials();
    await loadPurchaseOrders();

    window.addEventListener('sectionChanged', async (e) => {
        if (e.detail !== 'purchase-orders') return;
        await loadSuppliersAndMaterials();
        await loadPurchaseOrders();
    });
});
