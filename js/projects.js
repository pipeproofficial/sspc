import { db } from './firebase-config.js';
import { checkAuth, formatDate, downloadCSV, downloadPDF } from './dashboard.js';
import { showAlert } from './auth.js';

let currentProjectId = null;
let projectsData = [];
let inventoryCache = [];
const exportProjectsPdfBtn = document.getElementById('exportProjectsPdfBtn');
const exportProjectsCsvBtn = document.getElementById('exportProjectsCsvBtn');
const orderItemsContainer = document.getElementById('orderItemsContainer');
const orderAddItemBtn = document.getElementById('orderAddItemBtn');
const orderGrandTotal = document.getElementById('orderGrandTotal');
const orderSearch = document.getElementById('orderSearch');
const orderStatusFilter = document.getElementById('orderStatusFilter');
const orderDateFrom = document.getElementById('orderDateFrom');
const orderDateTo = document.getElementById('orderDateTo');
const resetOrderFilters = document.getElementById('resetOrderFilters');
const projectCustomerSelect = document.getElementById('projectCustomerId');
const addOrderCustomerBtn = document.getElementById('addOrderCustomerBtn');
const projectCustomerPhone = document.getElementById('projectCustomerPhone');
const projectStateOfSupply = document.getElementById('projectStateOfSupply');
const projectOrderNo = document.getElementById('projectOrderNo');
const projectOrderTime = document.getElementById('projectOrderTime');
const projectPaymentType = document.getElementById('projectPaymentType');
const projectHasAdvance = document.getElementById('projectHasAdvance');
const projectAdvanceAmount = document.getElementById('projectAdvanceAmount');
const ordersListView = document.getElementById('ordersListView');
const orderCreateView = document.getElementById('orderCreateView');
const showOrdersListBtn = document.getElementById('showOrdersListBtn');
const showOrderCreateBtn = document.getElementById('showOrderCreateBtn');
const projectFormTitle = document.getElementById('projectFormTitle');

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

function getAdvanceAmount() {
    if (!projectHasAdvance?.checked) return 0;
    return Math.max(0, Number(projectAdvanceAmount?.value || 0));
}

function updateAdvanceUi() {
    if (!projectAdvanceAmount) return;
    const hasAdvance = !!projectHasAdvance?.checked;
    projectAdvanceAmount.disabled = !hasAdvance;
    if (!hasAdvance) {
        projectAdvanceAmount.value = '0';
    }
}

function fillOrderCustomerMeta() {
    const option = projectCustomerSelect?.selectedOptions?.[0] || null;
    if (!option) return;
    if (projectCustomerPhone) {
        projectCustomerPhone.value = option.dataset.phone || '';
    }
    if (projectStateOfSupply && !projectStateOfSupply.value) {
        projectStateOfSupply.value = option.dataset.state || '';
    }
}

function buildOrderNo(existing = '') {
    if (existing) return existing;
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const t = String(now.getHours()).padStart(2, '0') + String(now.getMinutes()).padStart(2, '0');
    return `SO-${y}${m}${d}-${t}`;
}

function normalizeStateForTax(value) {
    return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function resolveOrderTaxMode(companyState, placeOfSupply) {
    const company = normalizeStateForTax(companyState);
    const pos = normalizeStateForTax(placeOfSupply);
    if (!company || !pos) return 'CGST_SGST';
    return company === pos ? 'CGST_SGST' : 'IGST';
}

function isPurchaseOrderDoc(order = {}) {
    const domain = String(order.orderDomain || order.domain || '').trim().toLowerCase();
    const type = String(order.orderType || order.type || order.docType || '').trim().toLowerCase();
    return domain === 'purchase' || type === 'purchase_order' || type === 'purchase-order';
}

function setOrdersView(view = 'list') {
    const isCreate = view === 'create';
    if (ordersListView) ordersListView.classList.toggle('d-none', isCreate);
    if (orderCreateView) orderCreateView.classList.toggle('d-none', !isCreate);
    if (showOrdersListBtn) {
        showOrdersListBtn.classList.toggle('btn-primary', !isCreate);
        showOrdersListBtn.classList.toggle('btn-outline-primary', isCreate);
    }
    if (showOrderCreateBtn) {
        showOrderCreateBtn.classList.toggle('btn-primary', isCreate);
        showOrderCreateBtn.classList.toggle('btn-outline-primary', !isCreate);
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    await checkAuth();
    await ensureProjectCustomersLoaded();
    loadProjects();
    await checkPendingActions();
    
    window.addEventListener('sectionChanged', async (e) => {
        if (e.detail === 'projects') {
            setOrdersView('list');
            await ensureProjectCustomersLoaded();
            loadProjects();
            await checkPendingActions();
        }
    });
    
    setOrdersView('list');

    document.getElementById('addProjectBtn').addEventListener('click', () => {
        resetProjectForm();
        setOrdersView('create');
    });

    if (showOrdersListBtn) {
        showOrdersListBtn.addEventListener('click', () => setOrdersView('list'));
    }
    if (showOrderCreateBtn) {
        showOrderCreateBtn.addEventListener('click', () => {
            resetProjectForm();
            setOrdersView('create');
        });
    }

    document.getElementById('saveProjectBtn').addEventListener('click', saveProject);

    if (orderAddItemBtn) {
        orderAddItemBtn.addEventListener('click', addOrderItemRow);
    }
    if (orderItemsContainer) {
        orderItemsContainer.addEventListener('change', (e) => {
            const select = e.target.closest('.order-item-select');
            if (select) {
                const option = select.selectedOptions[0];
                const price = option?.dataset?.price || 0;
                const row = select.closest('tr');
                const priceInput = row?.querySelector('.order-item-price');
                if (priceInput) priceInput.value = price;
                calculateOrderTotal();
            }
        });
        orderItemsContainer.addEventListener('input', calculateOrderTotal);
        orderItemsContainer.addEventListener('click', (e) => {
            if (e.target.closest('.order-remove-row')) {
                e.target.closest('tr')?.remove();
                reindexOrderRows();
                calculateOrderTotal();
            }
        });
    }

    if (exportProjectsCsvBtn) {
        exportProjectsCsvBtn.addEventListener('click', exportProjectsCSV);
    }

    if (exportProjectsPdfBtn) {
        exportProjectsPdfBtn.addEventListener('click', exportProjectsPDF);
    }

    if (orderSearch) {
        orderSearch.addEventListener('input', applyOrderFilters);
    }
    if (orderStatusFilter) {
        orderStatusFilter.addEventListener('change', applyOrderFilters);
    }
    if (orderDateFrom) {
        orderDateFrom.addEventListener('change', applyOrderFilters);
    }
    if (orderDateTo) {
        orderDateTo.addEventListener('change', applyOrderFilters);
    }
    if (resetOrderFilters) {
        resetOrderFilters.addEventListener('click', () => {
            if (orderSearch) orderSearch.value = '';
            if (orderStatusFilter) orderStatusFilter.value = 'all';
            if (orderDateFrom) orderDateFrom.value = '';
            if (orderDateTo) orderDateTo.value = '';
            applyOrderFilters();
        });
    }

    if (addOrderCustomerBtn) {
        addOrderCustomerBtn.addEventListener('click', () => {
            sessionStorage.setItem('openOrderModal', 'true');
            if (window.showAddCustomerModal) {
                window.showAddCustomerModal();
            } else {
                alert('Party module not loaded');
            }
        });
    }

    if (projectCustomerSelect) {
        projectCustomerSelect.addEventListener('change', fillOrderCustomerMeta);
    }

    if (projectHasAdvance) {
        projectHasAdvance.addEventListener('change', updateAdvanceUi);
    }

    window.addEventListener('customerCreated', async (e) => {
        const created = e?.detail || {};
        const selectedId = created.id || '';
        const selectedName = created.name || '';
        await ensureProjectCustomersLoaded(selectedId, selectedName);
        const shouldReopen = sessionStorage.getItem('openOrderModal');
        if (shouldReopen) {
            sessionStorage.removeItem('openOrderModal');
            setOrdersView('create');
        }
    });
});

async function checkPendingActions() {
    const openModal = sessionStorage.getItem('openOrderModal');
    if (openModal === 'true') {
        sessionStorage.removeItem('openOrderModal');
        resetProjectForm();
        
        const selectedCustomer = sessionStorage.getItem('selectedCustomer');
        if (selectedCustomer) {
            try {
                const customer = JSON.parse(selectedCustomer);
                if (projectCustomerSelect) {
                    if (projectCustomerSelect.options.length <= 1) {
                        await ensureProjectCustomersLoaded(customer.id);
                    }
                    projectCustomerSelect.value = customer.id;
                    fillOrderCustomerMeta();
                }
                sessionStorage.removeItem('selectedCustomer');
            } catch (e) {
                console.error(e);
            }
        }
        
        setOrdersView('create');
    }
}

async function ensureProjectCustomersLoaded(selectedId = '', selectedName = '') {
    const user = JSON.parse(localStorage.getItem('user'));
    if (!user || !projectCustomerSelect) return;
    const businessId = user.businessId || user.uid;
    try {
        const snap = await db.collection('users').doc(businessId).collection('customers').orderBy('name').get();
        let options = '<option value="">Select Party</option>';
        snap.forEach((doc) => {
            const c = doc.data() || {};
            const label = c.company ? `${c.name} (${c.company})` : (c.name || 'Party');
            const phone = escapeHtml(c.phone || c.mobile || '');
            const state = escapeHtml(c.state || '');
            options += `<option value="${doc.id}" data-phone="${phone}" data-state="${state}">${escapeHtml(label)}</option>`;
        });
        projectCustomerSelect.innerHTML = options;

        if (selectedId) {
            projectCustomerSelect.value = selectedId;
        } else if (selectedName) {
            const match = Array.from(projectCustomerSelect.options).find((o) => {
                const text = (o.textContent || '').toLowerCase();
                return text.startsWith((selectedName || '').toLowerCase());
            });
            if (match) projectCustomerSelect.value = match.value;
        }
        fillOrderCustomerMeta();
    } catch (e) {
        console.error('Failed to load customers for orders', e);
    }
}

async function loadProjects() {
    const user = JSON.parse(localStorage.getItem('user'));
    if (!user) return;
    const businessId = user.businessId || user.uid;
    const tbody = document.querySelector('#projectsTable tbody');
    tbody.innerHTML = '<tr><td colspan="10" class="text-center">Loading...</td></tr>';

    try {
        await loadInventoryCache(businessId);

        const snapshot = await db.collection('users').doc(businessId).collection('orders').orderBy('createdAt', 'desc').get();
        tbody.innerHTML = '';
        
        if (snapshot.empty) {
            projectsData = [];
            tbody.innerHTML = '<tr><td colspan="10" class="text-center">No sales orders found</td></tr>';
            updateOrderMetrics([]);
            return;
        }

        projectsData = [];
        snapshot.forEach(doc => {
            const p = doc.data();
            if (isPurchaseOrderDoc(p)) return;
            projectsData.push({ id: doc.id, ...p });
            const canDelete = user.permissions ? user.permissions.canDelete : true;
            const orderDateIso = toInputDate(p.orderDate || p.createdAt);
            const deliveryDateIso = toInputDate(p.deliveryDate);
            const total = Number(p.total || 0);
            const advanceAmount = Number(p.advanceAmount || 0);
            const balanceAmount = Math.max(0, total - advanceAmount);
            const row = `
                <tr data-order-date="${orderDateIso}" data-delivery-date="${deliveryDateIso}" data-status="${p.status || 'Pending'}" data-total="${total}">
                    <td><small class="text-muted">${escapeHtml(p.orderNo || `#${doc.id.substr(0, 6).toUpperCase()}`)}</small></td>
                    <td>${escapeHtml(p.name || '-')}</td>
                    <td>${escapeHtml(p.customerName || '-')}</td>
                    <td><span class="badge bg-${getStatusColor(p.status)}">${p.status || 'Pending'}</span></td>
                    <td>${formatDate(p.orderDate || p.createdAt)}</td>
                    <td>${p.deliveryDate ? formatDate(p.deliveryDate) : '-'}</td>
                    <td>${formatMoney(total)}</td>
                    <td>${formatMoney(advanceAmount)}</td>
                    <td>${formatMoney(balanceAmount)}</td>
                    <td>
                        <button class="btn btn-sm btn-outline-primary me-1" onclick="window.editProject('${doc.id}')" title="Edit">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn btn-sm btn-outline-success me-1" onclick="window.createInvoiceFromOrder('${doc.id}')" title="Create Invoice">
                            <i class="fas fa-file-invoice"></i>
                        </button>
                        ${canDelete ? `<button class="btn btn-sm btn-outline-danger" onclick="window.deleteProject('${doc.id}')" title="Delete">
                            <i class="fas fa-trash"></i>
                        </button>` : ''}
                    </td>
                </tr>
            `;
            tbody.innerHTML += row;
        });
        if (!projectsData.length) {
            tbody.innerHTML = '<tr><td colspan="10" class="text-center">No sales orders found</td></tr>';
            updateOrderMetrics([]);
            return;
        }
        applyOrderFilters();
    } catch (e) {
        console.error(e);
        tbody.innerHTML = '<tr><td colspan="10" class="text-center text-danger">Error loading sales orders</td></tr>';
    }
}
async function loadInventoryCache(businessId) {
    if (inventoryCache.length) return;
    try {
        const snapshot = await db.collection('users').doc(businessId).collection('inventory').get();
        inventoryCache = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (e) {
        console.error('Error loading inventory', e);
    }
}

function addOrderItemRow(prefill = {}) {
    if (!orderItemsContainer) return;
    const options = inventoryCache.map(i => `
        <option value="${i.id}" data-price="${i.sellingPrice || 0}" data-cost="${i.costPrice || 0}">${i.name} (Stock: ${i.quantity})</option>
    `).join('');

    const row = document.createElement('tr');
    row.innerHTML = `
        <td class="order-row-index text-muted">1</td>
        <td>
            <select class="form-select form-select-sm order-item-select">
                <option value="">Select Item...</option>
                ${options}
            </select>
        </td>
        <td><input type="number" class="form-control form-control-sm order-item-qty" value="${prefill.quantity || 1}" min="1"></td>
        <td><input type="number" class="form-control form-control-sm order-item-price" value="${prefill.price || 0}"></td>
        <td class="order-item-total">₹0.00</td>
        <td class="text-center"><button type="button" class="btn btn-sm btn-outline-danger order-remove-row"><i class="fas fa-times"></i></button></td>
    `;

    const select = row.querySelector('.order-item-select');
    if (prefill.itemId) {
        select.value = prefill.itemId;
    }
    if (prefill.name && !select.value) {
        const opt = document.createElement('option');
        opt.value = '__custom__';
        opt.textContent = `${prefill.name} (Custom)`;
        opt.dataset.price = prefill.price || 0;
        opt.dataset.cost = prefill.costPrice || 0;
        select.appendChild(opt);
        select.value = '__custom__';
    }

    orderItemsContainer.appendChild(row);
    reindexOrderRows();
    calculateOrderTotal();
}

function reindexOrderRows() {
    if (!orderItemsContainer) return;
    const rows = orderItemsContainer.querySelectorAll('tr');
    rows.forEach((row, idx) => {
        const idxEl = row.querySelector('.order-row-index');
        if (idxEl) idxEl.textContent = String(idx + 1);
    });
}

function calculateOrderTotal() {
    if (!orderItemsContainer) return 0;
    let total = 0;
    orderItemsContainer.querySelectorAll('tr').forEach(row => {
        const qty = parseFloat(row.querySelector('.order-item-qty')?.value) || 0;
        const price = parseFloat(row.querySelector('.order-item-price')?.value) || 0;
        const rowTotal = qty * price;
        const totalEl = row.querySelector('.order-item-total');
        if (totalEl) totalEl.textContent = `₹${rowTotal.toFixed(2)}`;
        total += rowTotal;
    });
    if (orderGrandTotal) {
        orderGrandTotal.textContent = formatMoney(total);
    }
    return total;
}
function toInputDate(value) {
    if (!value) return '';
    const d = value.toDate ? value.toDate() : new Date(value);
    return d.toISOString().split('T')[0];
}

function getOrderItemsFromForm() {
    if (!orderItemsContainer) return [];
    const items = [];
    orderItemsContainer.querySelectorAll('tr').forEach(row => {
        const select = row.querySelector('.order-item-select');
        const itemId = select?.value || '';
        const option = select?.selectedOptions?.[0];
        const name = option ? option.textContent.replace(/ \(.*\)$/, '') : '';
        const quantity = parseFloat(row.querySelector('.order-item-qty')?.value) || 0;
        const price = parseFloat(row.querySelector('.order-item-price')?.value) || 0;
        const costPrice = parseFloat(option?.dataset?.cost || 0) || 0;
        if (name && quantity > 0) {
            items.push({ itemId, name, quantity, price, costPrice });
        }
    });
    return items;
}

function setOrderItems(items = []) {
    if (!orderItemsContainer) return;
    orderItemsContainer.innerHTML = '';
    if (!items.length) {
        addOrderItemRow();
        return;
    }
    items.forEach(item => addOrderItemRow(item));
}

function getProjectsExportRows() {
    return projectsData.map(p => ([
        p.orderNo || '',
        p.name || '',
        p.customerName || '',
        p.status || '',
        formatDate(p.orderDate || p.createdAt),
        p.deliveryDate ? formatDate(p.deliveryDate) : '',
        p.total ?? 0,
        p.advanceAmount ?? 0,
        Math.max(0, Number(p.total || 0) - Number(p.advanceAmount || 0))
    ]));
}

function exportProjectsCSV() {
    if (!projectsData.length) {
        alert('No sales orders to export.');
        return;
    }

    const headers = ['Sales Order No', 'Sales Order Name', 'Party', 'Status', 'Sales Order Date', 'Delivery Date', 'Total', 'Advance', 'Balance'];
    const rows = getProjectsExportRows();
    const filename = `orders_${new Date().toISOString().split('T')[0]}.csv`;
    downloadCSV(filename, headers, rows);
}

function exportProjectsPDF() {
    if (!projectsData.length) {
        alert('No sales orders to export.');
        return;
    }

    const headers = ['Sales Order No', 'Sales Order Name', 'Party', 'Status', 'Sales Order Date', 'Delivery Date', 'Total', 'Advance', 'Balance'];
    const rows = getProjectsExportRows();
    const filename = `orders_${new Date().toISOString().split('T')[0]}.pdf`;
    downloadPDF(filename, 'Sales Orders Report', headers, rows);
}

function applyOrderFilters() {
    const table = document.getElementById('projectsTable');
    if (!table) return;
    const rows = table.querySelectorAll('tbody tr');
    const searchTerm = (orderSearch?.value || '').toLowerCase();
    const statusFilter = orderStatusFilter?.value || 'all';
    const fromVal = orderDateFrom?.value || '';
    const toVal = orderDateTo?.value || '';
    const fromDate = fromVal ? new Date(fromVal) : null;
    const toDate = toVal ? new Date(toVal) : null;

    const visibleRows = [];
    rows.forEach(row => {
        if (row.querySelector('td[colspan]')) return;
        const cells = row.querySelectorAll('td');
        const rowText = row.textContent.toLowerCase();
        if (searchTerm && !rowText.includes(searchTerm)) {
            row.style.display = 'none';
            return;
        }

        const statusText = cells[3]?.textContent?.trim() || '';
        if (statusFilter !== 'all' && statusText !== statusFilter) {
            row.style.display = 'none';
            return;
        }

        if (fromDate || toDate) {
            const orderDateIso = row.dataset.orderDate || '';
            const dateObj = orderDateIso ? new Date(`${orderDateIso}T00:00:00`) : null;
            if (fromDate && dateObj && dateObj < fromDate) {
                row.style.display = 'none';
                return;
            }
            if (toDate && dateObj) {
                const end = new Date(toDate);
                end.setHours(23, 59, 59, 999);
                if (dateObj > end) {
                    row.style.display = 'none';
                    return;
                }
            }
        }

        row.style.display = '';
        visibleRows.push(row);
    });

    const tbody = table.querySelector('tbody');
    if (tbody) {
        const noResultsId = 'ordersNoResultsRow';
        const existing = document.getElementById(noResultsId);
        if (existing) existing.remove();
        if (visibleRows.length === 0 && projectsData.length > 0) {
            const tr = document.createElement('tr');
            tr.id = noResultsId;
            tr.innerHTML = '<td colspan="10" class="text-center text-muted">No sales orders match current filters</td>';
            tbody.appendChild(tr);
        }
    }

    updateOrderMetrics(visibleRows);
}

function updateOrderMetrics(visibleRows = []) {
    const shown = visibleRows.length;
    const openCount = visibleRows.filter((row) => {
        const status = row.dataset.status || '';
        return status === 'Pending' || status === 'Processing' || status === 'Dispatched';
    }).length;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const overdueCount = visibleRows.filter((row) => {
        const status = row.dataset.status || '';
        if (status === 'Completed' || status === 'Cancelled') return false;
        const deliveryDate = row.dataset.deliveryDate;
        if (!deliveryDate) return false;
        const delivery = new Date(`${deliveryDate}T00:00:00`);
        return delivery < today;
    }).length;

    const totalValue = visibleRows.reduce((sum, row) => sum + Number(row.dataset.total || 0), 0);
    const setText = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    };
    setText('orderMetricCount', String(shown));
    setText('orderMetricPending', String(openCount));
    setText('orderMetricDispatchDue', String(overdueCount));
    setText('orderMetricValue', `\u20b9${totalValue.toLocaleString(undefined, { maximumFractionDigits: 2 })}`);
}

async function refreshCustomerOrderStats(businessId, customerId) {
    if (!customerId) return;
    try {
        const [customerDoc, ordersSnap] = await Promise.all([
            db.collection('users').doc(businessId).collection('customers').doc(customerId).get(),
            db.collection('users').doc(businessId).collection('orders').where('customerId', '==', customerId).get()
        ]);
        if (!customerDoc.exists) return;
        await customerDoc.ref.update({
            totalProjects: ordersSnap.size,
            lastContact: new Date()
        });
    } catch (e) {
        console.error('Failed to refresh customer order stats', e);
    }
}

async function saveProject() {
    const user = JSON.parse(localStorage.getItem('user'));
    if (!user) return;
    const businessId = user.businessId || user.uid;
    const nameInput = (document.getElementById('projectName').value || '').trim();
    const customerId = projectCustomerSelect?.value || '';
    const customerName = projectCustomerSelect?.selectedOptions?.[0]?.textContent?.replace(/\s+\(.*\)$/, '') || '';
    const customerPhone = (projectCustomerPhone?.value || '').trim();
    const stateOfSupply = (projectStateOfSupply?.value || '').trim();
    const orderNo = buildOrderNo((projectOrderNo?.value || '').trim());
    const status = document.getElementById('projectStatus').value;
    const orderDate = document.getElementById('projectOrderDate').value;
    const orderTime = document.getElementById('projectOrderTime')?.value || '';
    const deliveryDate = document.getElementById('projectDeliveryDate').value;
    const paymentType = projectPaymentType?.value || 'Cash';
    const hasAdvance = !!projectHasAdvance?.checked;
    const advanceAmount = getAdvanceAmount();
    const notes = document.getElementById('projectNotes').value;
    const items = getOrderItemsFromForm();
    const total = calculateOrderTotal();
    const name = nameInput || `${customerName || 'Sales Order'} ${orderNo}`;
    if (projectOrderNo) projectOrderNo.value = orderNo;

    if (!customerId || !customerName || !status || !orderDate) return alert('Please fill required fields');
    if (advanceAmount > total) return alert('Advance amount cannot be more than order total.');

    try {
        const projectData = {
            orderNo,
            name,
            customerId,
            customerName,
            customerPhone,
            stateOfSupply,
            status,
            orderDate: new Date(orderDate),
            orderTime: orderTime || '',
            deliveryDate: deliveryDate ? new Date(deliveryDate) : null,
            paymentType,
            hasAdvance,
            advanceAmount,
            notes: notes || '',
            items,
            total,
            updatedAt: new Date()
        };

        let savedId = currentProjectId;
        let previousCustomerId = '';
        if (currentProjectId) {
            const existingDoc = await db.collection('users').doc(businessId).collection('orders').doc(currentProjectId).get();
            if (existingDoc.exists) {
                previousCustomerId = existingDoc.data().customerId || '';
            }
            await db.collection('users').doc(businessId).collection('orders').doc(currentProjectId).update(projectData);
        } else {
            projectData.createdAt = new Date();
            const docRef = await db.collection('users').doc(businessId).collection('orders').add(projectData);
            savedId = docRef.id;
        }

        await refreshCustomerOrderStats(businessId, customerId);
        if (previousCustomerId && previousCustomerId !== customerId) {
            await refreshCustomerOrderStats(businessId, previousCustomerId);
        }

        if (status === 'Completed') {
            checkAndGenerateGstInvoice(businessId, savedId, projectData);
        }
        
        resetProjectForm();
        loadProjects();
        setOrdersView('list');
    } catch (e) {
        console.error(e);
        alert('Failed to save order');
    }
}

async function checkAndGenerateGstInvoice(businessId, orderId, orderData) {
    const existing = await db.collection('users').doc(businessId).collection('gstDocuments')
        .where('orderId', '==', orderId).limit(1).get();
        
    if (!existing.empty) return;

    window.showConfirm('Generate GST Invoice', 'Order completed. Generate GST Tax Invoice now?', async () => {
        try {
            await generateGstInvoice(businessId, orderId, orderData);
            showAlert('success', 'GST Invoice generated successfully.');
        } catch (e) {
            console.error(e);
            showAlert('danger', 'Failed to generate GST Invoice: ' + e.message);
        }
    });
}

async function generateGstInvoice(businessId, orderId, orderData) {
    const settingsRef = db.collection('users').doc(businessId).collection('settings').doc('business');
    
    let customerDetails = {};
    if (orderData.customerId) {
        const custDoc = await db.collection('users').doc(businessId).collection('customers').doc(orderData.customerId).get();
        if (custDoc.exists) {
            customerDetails = { id: custDoc.id, ...custDoc.data() };
        }
    } else if (orderData.customerName) {
        const custSnap = await db.collection('users').doc(businessId).collection('customers')
            .where('name', '==', orderData.customerName).limit(1).get();
        if (!custSnap.empty) {
            customerDetails = { id: custSnap.docs[0].id, ...custSnap.docs[0].data() };
        }
    }

    await db.runTransaction(async (t) => {
        const settingsSnap = await t.get(settingsRef);
        const settings = settingsSnap.exists ? settingsSnap.data() : {};
        
        const next = Number(settings.gstInvoiceNextNumber ?? 1);
        const prefix = settings.gstInvoicePrefix ?? '';
        const pad = Number(settings.gstInvoicePad ?? 4);
        const docNo = `${prefix}${String(next).padStart(pad, '0')}`;

        const items = (orderData.items || []).map(item => {
            const invItem = inventoryCache.find(i => i.id === item.itemId) || {};
            return {
                id: item.itemId || '',
                name: item.name || '',
                quantity: Number(item.quantity || 0),
                price: Number(item.price || 0),
                gstRate: Number(invItem.gstRate || settings.gstRate || 18),
                hsn: invItem.hsn || ''
            };
        });

        const placeOfSupply = orderData.stateOfSupply || customerDetails.state || '';
        const companyState = settings.state || settings.companyState || '';
        const taxMode = resolveOrderTaxMode(companyState, placeOfSupply);

        t.set(db.collection('users').doc(businessId).collection('gstDocuments').doc(), {
            docNo, docType: 'Tax Invoice', taxMode,
            customerId: customerDetails.id || '', customerName: orderData.customerName || '',
            customerAddress: customerDetails.address || '', customerCity: customerDetails.city || '',
            customerState: customerDetails.state || '', customerZip: customerDetails.zip || '',
            customerPhone: customerDetails.phone || '', customerTaxId: customerDetails.taxId || customerDetails.gstin || '',
            placeOfSupply, reverseCharge: 'No',
            transportCost: 0, amountPaid: Number(orderData.advanceAmount || 0), amount: Number(orderData.total || 0),
            items, date: new Date(), createdAt: new Date(), orderId, status: 'Saved'
        });
        t.set(settingsRef, { gstInvoiceNextNumber: next + 1 }, { merge: true });
    });
}

function getStatusColor(status) {
    if (status === 'Completed') return 'success';
    if (status === 'Dispatched') return 'info';
    if (status === 'Processing') return 'primary';
    if (status === 'Cancelled') return 'danger';
    return 'warning';
}

function resetProjectForm() {
    currentProjectId = null;
    document.getElementById('projectForm').reset();
    if (projectFormTitle) projectFormTitle.textContent = 'Create Sales Order';
    const orderDateInput = document.getElementById('projectOrderDate');
    if (orderDateInput) orderDateInput.valueAsDate = new Date();
    if (projectOrderTime) {
        const now = new Date();
        projectOrderTime.value = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    }
    if (projectOrderNo) projectOrderNo.value = buildOrderNo();
    if (projectPaymentType) projectPaymentType.value = 'Cash';
    if (projectHasAdvance) projectHasAdvance.checked = false;
    if (projectAdvanceAmount) projectAdvanceAmount.value = '0';
    updateAdvanceUi();
    if (orderItemsContainer) orderItemsContainer.innerHTML = '';
    if (orderGrandTotal) orderGrandTotal.textContent = formatMoney(0);
    if (projectCustomerSelect) projectCustomerSelect.value = '';
    if (projectCustomerPhone) projectCustomerPhone.value = '';
    if (projectStateOfSupply) projectStateOfSupply.value = '';
    addOrderItemRow();
}

window.editProject = async (id) => {
    const user = JSON.parse(localStorage.getItem('user'));
    if (!user) return;
    const businessId = user.businessId || user.uid;
    try {
        await loadInventoryCache(businessId);
        await ensureProjectCustomersLoaded();
        const doc = await db.collection('users').doc(businessId).collection('orders').doc(id).get();
        if (!doc.exists) return;
        const order = doc.data();
        currentProjectId = id;
        
        if (projectFormTitle) projectFormTitle.textContent = 'Edit Sales Order';
        document.getElementById('projectName').value = order.name || '';
        if (projectOrderNo) projectOrderNo.value = order.orderNo || buildOrderNo();
        document.getElementById('projectStatus').value = order.status || 'Pending';
        document.getElementById('projectOrderDate').value = toInputDate(order.orderDate);
        if (projectOrderTime) projectOrderTime.value = order.orderTime || '';
        document.getElementById('projectDeliveryDate').value = toInputDate(order.deliveryDate);
        document.getElementById('projectNotes').value = order.notes || '';
        if (projectPaymentType) projectPaymentType.value = order.paymentType || 'Cash';
        if (projectHasAdvance) projectHasAdvance.checked = !!order.hasAdvance || Number(order.advanceAmount || 0) > 0;
        if (projectAdvanceAmount) projectAdvanceAmount.value = String(Number(order.advanceAmount || 0));
        updateAdvanceUi();
        if (projectStateOfSupply) projectStateOfSupply.value = order.stateOfSupply || '';
        if (projectCustomerPhone) projectCustomerPhone.value = order.customerPhone || '';
        
        if (projectCustomerSelect) {
            if (order.customerId) projectCustomerSelect.value = order.customerId;
            else if (order.customerName) {
                // Try to match by text if ID is missing
                const match = Array.from(projectCustomerSelect.options).find(o => o.textContent.includes(order.customerName));
                if (match) projectCustomerSelect.value = match.value;
            }
        }
        if (!projectCustomerPhone?.value || !projectStateOfSupply?.value) fillOrderCustomerMeta();

        setOrderItems(order.items || []);
        calculateOrderTotal();
        
        setOrdersView('create');
    } catch (e) {
        console.error(e);
        alert('Error loading order details');
    }
};

window.deleteProject = async (id) => {
    const confirmed = await window.showConfirmAsync('Delete Sales Order', 'Are you sure you want to delete this sales order?', {
        confirmText: 'Delete',
        cancelText: 'Cancel'
    });
    if (!confirmed) return;
    const user = JSON.parse(localStorage.getItem('user'));
    if (!user) return;
    const businessId = user.businessId || user.uid;
    try {
        const orderDoc = await db.collection('users').doc(businessId).collection('orders').doc(id).get();
        const customerId = orderDoc.exists ? (orderDoc.data().customerId || '') : '';
        await db.collection('users').doc(businessId).collection('orders').doc(id).delete();
        await refreshCustomerOrderStats(businessId, customerId);
        loadProjects();
    } catch (e) {
        console.error(e);
        alert('Failed to delete order');
    }
};

window.createInvoiceFromOrder = (id) => {
    sessionStorage.setItem('prefill_invoice_order_id', id);
    if (window.navigateToSection) {
        window.navigateToSection('sale');
    } else {
        window.location.hash = '#sale';
    }
};
