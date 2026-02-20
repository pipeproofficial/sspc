import { db } from './firebase-config.js';
import { checkAuth, formatDate, downloadCSV, downloadPDF } from './dashboard.js';

// DOM Elements
const inventoryTable = document.getElementById('inventoryTable');
const inventoryModal = document.getElementById('inventoryModal');
const inventoryForm = document.getElementById('inventoryForm');
const SaveItemBtn = document.getElementById('SaveItemBtn');
const searchInput = document.getElementById('searchInventory');
const filterInventoryCategory = document.getElementById('filterInventoryCategory');
const filterInventoryStock = document.getElementById('filterInventoryStock');
const resetInventoryFilters = document.getElementById('resetInventoryFilters');
const confirmStockInBtn = document.getElementById('confirmStockInBtn');
const confirmStockOutBtn = document.getElementById('confirmStockOutBtn');
const exportInventorypdfBtn = document.getElementById('exportInventorypdfBtn');
const exportInventoryCSVBtn = document.getElementById('exportInventoryCSVBtn');

// Variables
let currentItemId = null;
let inventoryData = [];
let productImageMap = new Map();
let productCategoryMap = new Map();

const RAW_CATEGORIES = ['Raw Materials', 'Cement', 'Sand', 'Aggregate', 'Steel', 'Fly Ash', 'Admixtures', 'Chemicals'];

function buildFeaturedStockPayload(item = {}) {
    const nameKey = (item.name || '').toLowerCase().trim();
    const fallbackCategory = nameKey ? (productCategoryMap.get(nameKey) || '') : '';
    const resolvedCategory = item.category || item.type || fallbackCategory || 'Other';
    return {
        name: item.name || 'Item',
        category: resolvedCategory,
        type: item.type || '',
        description: item.description || '',
        sku: item.sku || '',
        dimensions: item.dimensions || '',
        quantity: Number(item.quantity ?? 0),
        unit: item.unit || 'pcs',
        imageUrl: item.imageUrl || '',
        updatedAt: new Date()
    };
}

// Initialize Inventory page
document.addEventListener('DOMContentLoaded', async () => {
    await checkAuth();
    await loadInventory();
    setupEventListeners();
    initializeDataTable();

    const onSectionChanged = (e) => {
        if (e.detail === 'inventory') loadInventory();
    };
    window.addEventListener('sectionChanged', onSectionChanged);
    // Backward compatibility for any legacy emitters.
    window.addEventListener('SectionChanged', onSectionChanged);
});

// Load Inventory Data
async function loadInventory() {
    const user = JSON.parse(localStorage.getItem('user'));

    if (!user || !inventoryTable) return;
    const businessId = user.businessId || user.uid;

    try {
        // Destroy existing DataTable if it exists to prevent errors when modifying DOM
        if ($.fn.DataTable.isDataTable(inventoryTable)) {
            $(inventoryTable).DataTable().destroy();
        }

        const productSnapshot = await db.collection('users').doc(businessId)
            .collection('product_master')
            .get();
        productImageMap = new Map();
        productCategoryMap = new Map();
        productSnapshot.forEach(doc => {
            const p = doc.data();
            if (p?.name && p?.imageUrl) {
                productImageMap.set(p.name.toLowerCase(), p.imageUrl);
            }
            if (p?.name && (p?.category || p?.productCategory)) {
                productCategoryMap.set(p.name.toLowerCase(), p.category || p.productCategory);
            }
        });

        const inventorySnapshot = await db.collection('users').doc(businessId)
            .collection('inventory')
            .orderBy('name')
            .get();

        inventoryData = [];
        const allInventoryItems = [];
        const tbody = inventoryTable.querySelector('tbody');
        tbody.innerHTML = '';

        if (inventorySnapshot.empty) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="11" class="text-center py-4">
                        <i class="fas fa-boxes fa-3x text-muted mb-3"></i>
                        <p class="text-muted">No finished goods found. Create products in Production > Masters.</p>
                    </td>
                </tr>
            `;

            return;
        }

        let rowsHtml = '';
        inventorySnapshot.forEach(doc => {
            const item = {
                id: doc.id,
                ...doc.data()
            };
            allInventoryItems.push(item);

            // Filter out Raw Materials (handled in Separate Section)
            if (RAW_CATEGORIES.includes(item.category)) return;

            if (!item.imageUrl && item.name) {
                const fallbackUrl = productImageMap.get(item.name.toLowerCase());
                if (fallbackUrl) item.imageUrl = fallbackUrl;
            }

            inventoryData.push(item);
            rowsHtml += createInventoryRow(item);
        });
        tbody.innerHTML = rowsHtml;

        // Sync featured stock docs so landing/public products always reflect latest inventory changes.
        await syncFeaturedStockCollection(businessId, allInventoryItems);

        // Update Stats
        updateInventoryStats();
        populateInventoryCategoryFilter();
        applyInventoryFilters();

    } catch (error) {
        console.error('Error loading inventory:', error);
        showError('Failed to load inventory data.');
    }
}

async function syncFeaturedStockCollection(businessId, allInventoryItems = []) {
    try {
        const publicRef = db.collection('public').doc(businessId);
        const contact = await getBusinessContact(businessId);
        await publicRef.set({
            companyName: contact.companyName || '',
            email: contact.email || '',
            phone: contact.phone || '',
            whatsapp: contact.whatsapp || contact.phone || '',
            updatedAt: new Date()
        }, { merge: true });

        const featuredSnap = await publicRef.collection('featured_stock').get();
        const keepIds = new Set();

        let batch = db.batch();
        let ops = 0;
        const commitIfNeeded = async () => {
            if (ops < 400) return;
            await batch.commit();
            batch = db.batch();
            ops = 0;
        };

        for (const item of allInventoryItems) {
            if (!item.showOnLanding) continue;
            keepIds.add(item.id);
            const featuredRef = publicRef.collection('featured_stock').doc(item.id);
            batch.set(featuredRef, buildFeaturedStockPayload(item), { merge: true });
            ops += 1;
            // eslint-disable-next-line no-await-in-loop
            await commitIfNeeded();
        }

        for (const doc of featuredSnap.docs) {
            if (keepIds.has(doc.id)) continue;
            batch.delete(doc.ref);
            ops += 1;
            // eslint-disable-next-line no-await-in-loop
            await commitIfNeeded();
        }

        if (ops > 0) await batch.commit();
    } catch (error) {
        console.error('Featured stock cleanup failed', error);
    }
}

// Create Inventory Row HTML
function createInventoryRow(item) {
    const lowStock = item.quantity <= item.reorderLevel;
    const user = JSON.parse(localStorage.getItem('user'));
    const canDelete = user.permissions ? user.permissions.canDelete : true;
    const showOnLanding = !!item.showOnLanding;
    const stockClass = lowStock ? 'text-danger fw-bold' :
        (item.quantity <= item.reorderLevel * 2 ? 'text-warning' : 'text-success');
    const imageHtml = item.imageUrl
        ? `<a href="${item.imageUrl}" target="_blank" class="inventory-thumb-link" title="View Image">
                <img src="${item.imageUrl}" alt="${item.name || 'product'}" class="inventory-thumb">
           </a>`
        : `<div class="inventory-icon">
                <i class="fas fa-${getItemIcon(item.category)}"></i>
           </div>`;

    let metaHtml = '';
    if (item.type || item.dimensions) {
        metaHtml = '<div class="mt-1">';
        if (item.type) metaHtml += `<span class="badge bg-light text-dark border me-1">${item.type}</span>`;
        if (item.dimensions) metaHtml += `<span class="badge bg-light text-dark border"><i class="fas fa-ruler-combined me-1"></i> ${item.dimensions}</span>`;
        metaHtml += '</div>';
    }

    return `
        <tr data-id="${item.id}">
            <td>
                <div class="d-flex align-items-center">
                    <div class="me-3">
                        ${imageHtml}
                    </div>
                    <div>
                        <h6 class="mb-0">${item.name}</h6>
                        ${metaHtml}
                        <small class="text-muted">${item.sku || 'No SKU'}</small>
                    </div>
                </div>
            </td>
            <td>${item.category}</td>
            <td>${item.description || '-'}</td>
            <td>${item.hsn || '-'}</td>
            <td>${item.gstRate === 0 ? '0%' : (item.gstRate ? `${item.gstRate}%` : '-')}</td>
            <td class="${stockClass}">${item.quantity}</td>
            <td>${item.reorderLevel}</td>
            <td>${item.unit}</td>
            <td>₹${parseFloat(item.costPrice || 0).toFixed(2)}</td>
            <td>₹${parseFloat(item.sellingPrice || 0).toFixed(2)}</td>
            <td>
                <div class="btn-group btn-group-sm">
                    <button class="btn btn-outline-info view-history" title="History">
                        <i class="fas fa-history"></i>
                    </button>
                    <button class="btn ${showOnLanding ? 'btn-success' : 'btn-outline-secondary'} toggle-landing" title="${showOnLanding ? 'Remove from Landing page' : 'Show on Landing page'}">
                        <i class="fas fa-star"></i>
                    </button>
                    ${canDelete ? `<button class="btn btn-outline-danger delete-item" title="Delete">
                        <i class="fas fa-trash"></i>
                    </button>` : ''}
                </div>
            </td>
        </tr>
    `;
}

// Get Icon Based on Category
function getItemIcon(category) {
    const iconMap = {
        'Raw Materials': 'layer-group',
        'Cement': 'cubes',
        'Sand': 'mountain',
        'Aggregate': 'shapes',
        'Steel': 'bars',
        'Fly Ash': 'cloud',
        'Admixtures': 'flask',
        'Chemicals': 'flask',
        'RCC Pipe': 'pipe',
        'RCC Pipes': 'pipe',
        'Septic Tank': 'dumster',
        'Septic Tank Product': 'dumster',
        'Septic Tank Products': 'dumster',
        'Water Tank': 'water',
        'Water Tank Products': 'water',
        'Moulds & Equipment': 'toolbox',
        'Tools & Handling': 'tools'
    };
    return iconMap[category] || 'box';
}

// Update Inventory Statistics
function updateInventoryStats() {
    const totalItems = inventoryData.length;
    const lowStockItems = inventoryData.filter(item => item.quantity <= item.reorderLevel).length;
    const outOfStockItems = inventoryData.filter(item => item.quantity === 0).length;
    const totalValue = inventoryData.reduce((sum, item) => {
        return sum + (item.quantity * (item.costPrice || 0));
    }, 0);

    // Update UI elements
    updateStatElement('inv_totalItems', totalItems);
    updateStatElement('inv_lowStockItems', lowStockItems);
    updateStatElement('inv_outOfStockItems', outOfStockItems);
    updateStatElement('inv_inventoryValue', `₹${totalValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}`);
}

function updateStatElement(id, value) {
    const element = document.getElementById(id);
    if (element) element.textContent = value;
}

// setup Event Listeners
function setupEventListeners() {
    // Add Item Button

    // Save Item Button
    if (SaveItemBtn) {
        SaveItemBtn.addEventListener('click', saveInventoryItem);
    }

    // Search Input
    if (searchInput) {
        searchInput.addEventListener('input', filterInventory);
    }
    if (filterInventoryCategory) {
        filterInventoryCategory.addEventListener('change', applyInventoryFilters);
    }
    if (filterInventoryStock) {
        filterInventoryStock.addEventListener('change', applyInventoryFilters);
    }
    if (resetInventoryFilters) {
        resetInventoryFilters.addEventListener('click', () => {
            if (searchInput) searchInput.value = '';
            if (filterInventoryCategory) filterInventoryCategory.value = 'all';
            if (filterInventoryStock) filterInventoryStock.value = 'all';
            applyInventoryFilters();
        });
    }

    if (confirmStockInBtn) {
        confirmStockInBtn.addEventListener('click', handleStockIn);
    }

    if (confirmStockOutBtn) {
        confirmStockOutBtn.addEventListener('click', handleStockOut);
    }

    if (exportInventoryCSVBtn) {
        exportInventoryCSVBtn.addEventListener('click', exportInventoryCSV);
    }

    if (exportInventorypdfBtn) {
        exportInventorypdfBtn.addEventListener('click', exportInventoryPDF);
    }

    // Modal Close
    if (inventoryModal) {
        inventoryModal.addEventListener('hidden.bs.modal', () => {
            resetForm();
        });
    }

    // Edit, Delete, Stock In/Out buttons (event delegation)
    document.addEventListener('click', (e) => {
        const row = e.target.closest('tr[data-id]');
        if (!row) return;

        const itemId = row.dataset.id;
        const item = inventoryData.find(i => i.id === itemId);
        if (!item) return; // Item not found in this view (might be raw material)

        if (e.target.closest('.view-history')) {
            viewItemHistory(item);
        } else if (e.target.closest('.toggle-landing')) {
            toggleLandingFeature(item);
        } else if (e.target.closest('.delete-item')) {
            deleteInventoryItem(itemId);
        }
    });
}

async function getBusinessContact(businessId) {
    try {
        const doc = await db.collection('users').doc(businessId).collection('settings').doc('business').get();
        if (!doc.exists) return { companyName: '', email: '', phone: '', whatsapp: '' };
        const data = doc.data();
        return {
            companyName: data.companyName || '',
            email: data.email || '',
            phone: data.companyPhone || data.phone || '',
            whatsapp: data.companyWhatsapp || data.companyPhone || data.phone || ''
        };
    } catch (e) {
        console.error('Failed to load business contact', e);
        return { companyName: '', email: '', phone: '', whatsapp: '' };
    }
}

async function toggleLandingFeature(item) {
    const user = JSON.parse(localStorage.getItem('user'));
    if (!user) return;
    const businessId = user.businessId || user.uid;

    const nextValue = !item.showOnLanding;
    const contact = await getBusinessContact(businessId);
    let imageUrl = item.imageUrl || '';
    if (!imageUrl && item.name) {
        imageUrl = productImageMap.get(item.name.toLowerCase()) || '';
    }

    try {
        const batch = db.batch();
        const itemRef = db.collection('users').doc(businessId).collection('inventory').doc(item.id);
        batch.update(itemRef, { showOnLanding: nextValue });

        const publicRef = db.collection('public').doc(businessId);
        batch.set(publicRef, {
            companyName: contact.companyName || '',
            email: contact.email || '',
            phone: contact.phone || '',
            whatsapp: contact.whatsapp || contact.phone || '',
            updatedAt: new Date()
        }, { merge: true });

        const featuredRef = publicRef.collection('featured_stock').doc(item.id);
        if (nextValue) {
            batch.set(featuredRef, buildFeaturedStockPayload({ ...item, imageUrl }), { merge: true });
        } else {
            batch.delete(featuredRef);
        }

        await batch.commit();
        showSuccess(nextValue ? 'Item added to landing page.' : 'Item removed from landing page.');
        loadInventory();
    } catch (error) {
        console.error('Failed to update landing Stock', error);
        showError('Failed to update landing page Stock.');
    }
}

function getInventoryExportRows() {
    return inventoryData.map(item => ([
        item.name || '',
        item.category || '',
        item.description || '',
        item.hsn || '',
        item.gstRate ?? '',
        item.quantity ?? 0,
        item.reorderLevel ?? 0,
        item.unit || '',
        item.costPrice ?? 0,
        item.sellingPrice ?? 0
    ]));
}

function exportInventoryCSV() {
    if (!inventoryData.length) {
        alert('No inventory data to export.');
        return;
    }

    const headers = ['Item', 'Category', 'Description', 'HSN/SAC', 'GST%', 'Qty', 'Reorder', 'Unit', 'Cost', 'Price'];
    const rows = getInventoryExportRows();
    const filename = `inventory_${new Date().toISOString().split('T')[0]}.csv`;
    downloadCSV(filename, headers, rows);
}

function exportInventoryPDF() {
    if (!inventoryData.length) {
        alert('No inventory data to export.');
        return;
    }

    const headers = ['Item', 'Category', 'Description', 'HSN/SAC', 'GST%', 'Qty', 'Reorder', 'Unit', 'Cost', 'Price'];
    const rows = getInventoryExportRows();
    const filename = `inventory_${new Date().toISOString().split('T')[0]}.pdf`;
    downloadPDF(filename, 'Inventory Report', headers, rows);
}

// View Item History
async function viewItemHistory(item) {
    const user = JSON.parse(localStorage.getItem('user'));
    const businessId = user.businessId || user.uid;
    const tbody = document.querySelector('#itemHistoryTable tbody');
    document.getElementById('historyItemName').textContent = item.name;
    tbody.innerHTML = '<tr><td colspan="4" class="text-center">Loading history...</td></tr>';

    new bootstrap.Modal(document.getElementById('itemHistoryModal')).show();

    try {
        const history = [];

        // 1. Get purchases (Stock In)
        const purchasesSnap = await db.collection('users').doc(businessId).collection('purchases')
            .where('itemId', '==', item.id).orderBy('date', 'desc').limit(10).get();

        purchasesSnap.forEach(doc => {
            const d = doc.data();
            history.push({
                date: d.date.toDate(),
                type: '<span class="badge bg-success">Stock In</span>',
                qty: `+${d.quantity}`,
                details: `Supplier: ${d.supplier || 'N/A'}`
            });
        });

        // 2. Get Challans (Stock Out) - Note: This requires querying arrays or Separate logs. 
        // For simplicity in this flow, we assume we can query challans or just show purchases.
        // A better way for "Used" is checking production runs, but that's complex to query inversely.
        // We will stick to purchases for now as "Received" status.

        history.sort((a, b) => b.date - a.date);

        tbody.innerHTML = '';
        if (history.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted">No history found</td></tr>';
        } else {
            history.forEach(h => {
                tbody.innerHTML += `
                    <tr>
                        <td>${formatDate(h.date)}</td>
                        <td>${h.type}</td>
                        <td class="fw-bold">${h.qty}</td>
                        <td><small>${h.details}</small></td>
                    </tr>
                `;
            });
        }
    } catch (e) {
        console.error(e);
        tbody.innerHTML = '<tr><td colspan="4" class="text-center text-danger">Error loading history</td></tr>';
    }
}

// Helper to populate Supplier dropdown
async function populateSupplierDropdown(elementId, selectedValue = null) {
    const select = document.getElementById(elementId);
    if (!select) return;

    const user = JSON.parse(localStorage.getItem('user'));
    const businessId = user.businessId || user.uid;

    try {
        const snapshot = await db.collection('users').doc(businessId).collection('suppliers').orderBy('name').get();
        select.innerHTML = '<option value="">Select Supplier...</option>';

        snapshot.forEach(doc => {
            const s = doc.data();
            const option = document.createElement('option');
            option.value = s.name;
            option.textContent = s.name;
            if (selectedValue && s.name === selectedValue) {
                option.selected = true;
            }
            select.appendChild(option);
        });
    } catch (error) {
        console.error("Error loading suppliers for dropdown", error);
    }
}

// Show Edit Modal
async function showEditModal(item) {
    currentItemId = item.id;
    document.getElementById('modalTitle').textContent = 'Edit product';

    // populate form
    document.getElementById('name').value = item.name;
    document.getElementById('sku').value = item.sku || '';
    document.getElementById('category').value = item.category;
    if (document.getElementById('description')) {
        document.getElementById('description').value = item.description || '';
    }
    document.getElementById('quantity').value = item.quantity;
    document.getElementById('quantity').readOnly = true;
    document.getElementById('reorderLevel').value = item.reorderLevel;
    document.getElementById('unit').value = item.unit;
    document.getElementById('costPrice').value = item.costPrice || '';
    document.getElementById('sellingPrice').value = item.sellingPrice || '';
    document.getElementById('location').value = item.location || '';

    await populateSupplierDropdown('supplier', item.supplier);

    const modal = new bootstrap.Modal(inventoryModal);
    modal.show();
}

// Show Stock Modal
async function showStockModal(item, type) {
    currentItemId = item.id;

    const modalId = type === 'in' ? 'StockInModal' : 'StockOutModal';
    const modalElement = document.getElementById(modalId);
    const modalTitle = document.querySelector(`#${modalId} .modal-title`);
    const itemNameElement = document.querySelector(`#${modalId} .item-name`);

    if (type === 'in') {
        modalTitle.textContent = 'Stock In';
        itemNameElement.textContent = item.name;
        const today = new Date().toISOString().split('T')[0];
        document.getElementById('StockInDate').value = today;
        document.getElementById('StockInMaterialName').value = item.name || '';
        document.getElementById('StockInQuantity').value = '';
        document.getElementById('StockInCost').value = item.standardRate ?? item.costPrice ?? '';
        document.getElementById('StockInTransportCost').value = 0;
        document.getElementById('StockInTotal').value = '';
        document.getElementById('StockInVehicleNo').value = '';
        document.getElementById('StockInReceivedBy').value = '';
        document.getElementById('StockInRemarks').value = '';

        const unitSelect = document.getElementById('StockInUnit');
        if (unitSelect) unitSelect.value = item.unit || 'Bag';

        // populate Suppliers
        await populateSupplierDropdown('StockInSupplier');

        const qtyEl = document.getElementById('StockInQuantity');
        const costEl = document.getElementById('StockInCost');
        const transportEl = document.getElementById('StockInTransportCost');
        const totalEl = document.getElementById('StockInTotal');
        const updateTotal = () => {
            const qtyVal = parseFloat(qtyEl.value) || 0;
            const costVal = parseFloat(costEl.value) || 0;
            const transportVal = parseFloat(transportEl.value) || 0;
            totalEl.value = (qtyVal * costVal + transportVal).toFixed(2);
        };
        if (!qtyEl.dataset.bound) {
            qtyEl.addEventListener('input', updateTotal);
            costEl.addEventListener('input', updateTotal);
            transportEl.addEventListener('input', updateTotal);
            qtyEl.dataset.bound = 'true';
        }
        updateTotal();
    } else {
        modalTitle.textContent = 'Stock Out';
        itemNameElement.textContent = item.name;
        document.getElementById('StockOutQuantity').value = '';
        document.getElementById('StockOutReason').value = 'Project Use';
        document.getElementById('StockOutProject').value = '';
        document.getElementById('StockOutDriver').value = '';

        // populate Customers
        const customerSelect = document.getElementById('StockOutCustomer');
        if (customerSelect) {
            customerSelect.innerHTML = '<option value="">Select Customer (Optional)</option>';
            const user = JSON.parse(localStorage.getItem('user'));
            const businessId = user.businessId || user.uid;
            try {
                const snap = await db.collection('users').doc(businessId).collection('customers').orderBy('name').get();
                snap.forEach(doc => {
                    customerSelect.innerHTML += `<option value="${doc.data().name}">${doc.data().name}</option>`;
                });
            } catch (e) { console.error(e); }
        }

        // populate Vehicles for Dispatch
        const vehicleSelect = document.getElementById('StockOutVehicle');
        if (vehicleSelect) {
            vehicleSelect.innerHTML = '<option value="">Select Vehicle (Optional)</option>';
            const user = JSON.parse(localStorage.getItem('user'));
            const businessId = user.businessId || user.uid;
            try {
                const snap = await db.collection('users').doc(businessId).collection('vehicles').get();
                snap.forEach(doc => { vehicleSelect.innerHTML += `<option value="${doc.data().name}">${doc.data().name}</option>`; });
            } catch (e) { }
        }
    }

    const modal = new bootstrap.Modal(modalElement);
    modal.show();
}

// Handle Stock In
async function handleStockIn() {
    if (!currentItemId) return;
    const user = JSON.parse(localStorage.getItem('user'));
    const businessId = user.businessId || user.uid;
    const qty = parseFloat(document.getElementById('StockInQuantity').value);
    const cost = parseFloat(document.getElementById('StockInCost').value);
    const supplier = document.getElementById('StockInSupplier').value;
    const invoiceNo = document.getElementById('StockInInvoice').value;
    const transportCost = parseFloat(document.getElementById('StockInTransportCost').value) || 0;
    const purchaseDate = document.getElementById('StockInDate').value;
    const vehicleNo = document.getElementById('StockInVehicleNo').value;
    const unit = document.getElementById('StockInUnit').value;
    const receivedBy = document.getElementById('StockInReceivedBy').value;
    const remarks = document.getElementById('StockInRemarks').value;
    const totalCost = (qty * cost) + transportCost;

    if (!qty || qty <= 0) {
        alert('Please enter a valid quantity');
        return;
    }

    try {
        const itemRef = db.collection('users').doc(businessId).collection('inventory').doc(currentItemId);

        await db.runTransaction(async (transaction) => {
            const doc = await transaction.get(itemRef);
            if (!doc.exists) throw "Document does not exist!";

            const newQty = (doc.data().quantity || 0) + qty;
            transaction.update(itemRef, { quantity: newQty });

            // Record Purchase Transaction
            const purchaseRef = db.collection('users').doc(businessId).collection('purchases').doc();
            transaction.set(purchaseRef, {
                date: purchaseDate ? new Date(purchaseDate) : new Date(),
                itemId: currentItemId,
                itemName: doc.data().name,
                quantity: qty,
                unit,
                unitCost: cost,
                totalCost: totalCost,
                supplier: supplier,
                invoiceNo: invoiceNo,
                transportCost: transportCost,
                vehicleNo,
                receivedBy,
                remarks
            });
        });

        // Update Supplier Stats (Total purchase & Balance)
        if (supplier) {
            const suppliersRef = db.collection('users').doc(businessId).collection('suppliers');
            const snapshot = await suppliersRef.where('name', '==', supplier).limit(1).get();
            if (!snapshot.empty) {
                const supDoc = snapshot.docs[0];
                const currentTotal = supDoc.data().totalPurchase || 0;
                const currentBal = supDoc.data().balance || 0;

                await suppliersRef.doc(supDoc.id).update({
                    totalPurchase: currentTotal + totalCost,
                    balance: currentBal + totalCost,
                    updatedAt: new Date()
                });
            }
        }

        bootstrap.Modal.getInstance(document.getElementById('StockInModal')).hide();
        showSuccess(`Added ${qty} units to Stock`);
        loadInventory();
        if (window.loadRawMaterials) window.loadRawMaterials();
    } catch (error) {
        console.error("Stock In Error", error);
        showError("Failed to update Stock");
    }
}

// Handle Stock Out
async function handleStockOut() {
    if (!currentItemId) return;
    const user = JSON.parse(localStorage.getItem('user'));
    const businessId = user.businessId || user.uid;
    const qty = parseInt(document.getElementById('StockOutQuantity').value);
    const reason = document.getElementById('StockOutReason').value;

    if (!qty || qty <= 0) {
        alert('Please enter a valid quantity');
        return;
    }

    try {
        const itemRef = db.collection('users').doc(businessId).collection('inventory').doc(currentItemId);
        const customerName = document.getElementById('StockOutCustomer').value;
        const project = document.getElementById('StockOutProject').value;
        const vehicle = document.getElementById('StockOutVehicle').value;
        const driver = document.getElementById('StockOutDriver').value;
        let challanData = null;

        await db.runTransaction(async (transaction) => {
            const doc = await transaction.get(itemRef);
            if (!doc.exists) throw "Document does not exist!";

            const currentQty = doc.data().quantity || 0;
            if (currentQty < qty) throw "Insufficient Stock!";

            const newQty = currentQty - qty;
            transaction.update(itemRef, { quantity: newQty });

            // Prepare Challan Data if customer is Selected
            if (customerName) {
                const challanRef = db.collection('users').doc(businessId).collection('challans').doc();
                challanData = {
                    id: challanRef.id,
                    date: new Date(),
                    customer: customerName,
                    project: project,
                    vehicle: vehicle,
                    driver: driver,
                    items: [{
                        itemId: currentItemId,
                        name: doc.data().name,
                        quantity: qty,
                        unit: doc.data().unit
                    }],
                    createdAt: new Date()
                };
                transaction.set(challanRef, challanData);
            }
        });

        bootstrap.Modal.getInstance(document.getElementById('StockOutModal')).hide();
        showSuccess(`Removed ${qty} units from Stock`);

        if (challanData) {
            window.showConfirm('Generate Challan', 'Stock transferred. Generate Gate Pass / Delivery Challan?', () => {
                printGatePass(challanData);
            });
        }

        loadInventory();
    } catch (error) {
        console.error("Stock Out Error", error);
        showError(error === "Insufficient Stock!" ? "Insufficient Stock!" : "Failed to update Stock");
    }
}

// Save Inventory Item
async function saveInventoryItem() {
    const user = JSON.parse(localStorage.getItem('user'));
    if (!user) return;
    const businessId = user.businessId || user.uid;

    // Validate form
    if (!validateInventoryForm()) return;

    // Get form data
    const existingItem = currentItemId ? inventoryData.find(i => i.id === currentItemId) : null;
    const itemData = {
        name: document.getElementById('name').value,
        sku: document.getElementById('sku').value,
        category: document.getElementById('category').value,
        description: document.getElementById('description') ? document.getElementById('description').value : '',
        quantity: existingItem ? (existingItem.quantity || 0) : 0,
        reorderLevel: parseInt(document.getElementById('reorderLevel').value),
        unit: document.getElementById('unit').value,
        costPrice: parseFloat(document.getElementById('costPrice').value) || 0,
        sellingPrice: parseFloat(document.getElementById('sellingPrice').value) || 0,
        supplier: document.getElementById('supplier') ? document.getElementById('supplier').value : '',
        location: document.getElementById('location') ? document.getElementById('location').value : '',
        updatedAt: new Date()
    };

    try {
        if (currentItemId) {
            // Update existing item
            await db.collection('users').doc(businessId)
                .collection('inventory')
                .doc(currentItemId)
                .update(itemData);

            showSuccess('Inventory item updated successfully!');
        } else {
            // Add new item
            itemData.createdAt = new Date();
            await db.collection('users').doc(businessId)
                .collection('inventory')
                .add(itemData);

            showSuccess('Inventory item added successfully!');
        }

        // Close modal and refresh data
        bootstrap.Modal.getInstance(inventoryModal).hide();
        await loadInventory();

    } catch (error) {
        console.error('Error saving inventory item:', error);
        showError('Failed to save inventory item.');
    }
}

// Delete Inventory Item
async function deleteInventoryItem(itemId) {
    window.showConfirm('Delete Item', 'Are you Sure you want to delete this item?', async () => {
        const user = JSON.parse(localStorage.getItem('user'));
        if (!user) return;

        if (user.permissions && user.permissions.canDelete === false) {
            return showError('You do not have permission to delete items.');
        }

        const businessId = user.businessId || user.uid;

        try {
            const batch = db.batch();
            const inventoryRef = db.collection('users').doc(businessId)
                .collection('inventory')
                .doc(itemId);
            const featuredRef = db.collection('public').doc(businessId)
                .collection('featured_stock')
                .doc(itemId);

            batch.delete(inventoryRef);
            batch.delete(featuredRef);
            await batch.commit();

            showSuccess('Inventory item deleted successfully!');
            await loadInventory();

        } catch (error) {
            console.error('Error deleting inventory item:', error);
            showError('Failed to delete inventory item.');
        }
    });
}

// Validate Form
function validateInventoryForm() {
    const name = document.getElementById('name').value;
    const quantity = document.getElementById('quantity').value;
    const reorderLevel = document.getElementById('reorderLevel').value;

    if (!name.trim()) {
        showError('Item name is required.');
        return false;
    }

    if (quantity < 0) {
        showError('Quantity cannot be negative.');
        return false;
    }

    if (reorderLevel < 0) {
        showError('Reorder level cannot be negative.');
        return false;
    }

    return true;
}

// Filter Inventory
function filterInventory() {
    applyInventoryFilters();
}

function populateInventoryCategoryFilter() {
    if (!filterInventoryCategory) return;
    const categories = Array.from(new Set(inventoryData.map(p => p.category).filter(Boolean))).sort();
    filterInventoryCategory.innerHTML = '<option value="all">All Categories</option>';
    categories.forEach(cat => {
        filterInventoryCategory.innerHTML += `<option value="${cat}">${cat}</option>`;
    });
}

function applyInventoryFilters() {
    if (!inventoryTable) return;
    if ($.fn.DataTable.isDataTable(inventoryTable)) {
        $(inventoryTable).DataTable().destroy();
    }
    const searchTerm = (searchInput?.value || '').toLowerCase();
    const categoryFilter = filterInventoryCategory?.value || 'all';
    const stockFilter = filterInventoryStock?.value || 'all';

    const filtered = inventoryData.filter(item => {
        const text = `${item.name || ''} ${item.category || ''} ${item.description || ''} ${item.sku || ''} ${item.hsn || ''} ${item.gstRate || ''}`.toLowerCase();
        if (searchTerm && !text.includes(searchTerm)) return false;
        if (categoryFilter !== 'all' && item.category !== categoryFilter) return false;
        const qty = Number(item.quantity || 0);
        const reorder = Number(item.reorderLevel || 0);
        if (stockFilter === 'low' && qty > reorder) return false;
        if (stockFilter === 'out' && qty !== 0) return false;
        if (stockFilter === 'available' && qty <= 0) return false;
        return true;
    });

    const tbody = inventoryTable.querySelector('tbody');
    if (!filtered.length) {
        tbody.innerHTML = `
            <tr>
                <td colspan="11" class="text-center py-4 text-muted">No items match the filters</td>
            </tr>
        `;
    } else {
        tbody.innerHTML = filtered.map(createInventoryRow).join('');
    }

    initializeDataTable();
}

// Reset Form
function resetForm() {
    currentItemId = null;
    inventoryForm.reset();
}

// Initialize DataTable (if using DataTables library)
function initializeDataTable() {
    if ($.fn.DataTable && inventoryTable && !$.fn.DataTable.isDataTable(inventoryTable)) {
        // Safety check: Do not initialize if there are colspan rows (e.g. "No items found")
        if ($(inventoryTable).find('tbody tr td[colspan]').length > 0) return;

        $(inventoryTable).DataTable({
            pageLength: 10,
            responsive: true,
            order: [[0, 'asc']],
            language: {
                search: "_INPUT_",
                searchPlaceholder: "Search inventory..."
            }
        });
    }
}

// Show Success Message
function showSuccess(message) {
    const alertDiv = document.createElement('div');
    alertDiv.className = 'alert alert-success alert-dismissible fade show';
    alertDiv.innerHTML = `
        <i class="fas fa-check-circle me-2"></i>${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;

    const container = document.querySelector('.container-fluid');
    container.insertBefore(alertDiv, container.firstChild);

    setTimeout(() => alertDiv.remove(), 5000);
}

// Show Error Message
function showError(message) {
    const alertDiv = document.createElement('div');
    alertDiv.className = 'alert alert-danger alert-dismissible fade show';
    alertDiv.innerHTML = `
        <i class="fas fa-exclamation-circle me-2"></i>${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;

    const container = document.querySelector('.container-fluid');
    container.insertBefore(alertDiv, container.firstChild);

    setTimeout(() => alertDiv.remove(), 5000);
}

// Print Gate Pass / Delivery Challan
async function printGatePass(challanData) {
    const user = JSON.parse(localStorage.getItem('user'));
    const businessId = user.businessId || user.uid;
    let company = { companyName: 'My Company', address: '', phone: '', email: '' };
    try {
        const doc = await db.collection('users').doc(businessId).collection('settings').doc('business').get();
        if (doc.exists) company = doc.data();
    } catch (e) { }

    const dateStr = formatDate(challanData.date);

    const html = `
    <html>
    <head>
        <title>Gate Pass / Delivery Challan</title>
        <style>
            body { font-family: 'Helvetica Neue', Helvetica, Arial, Sans-Serif; color: #555; padding: 0; margin: 0; }
            .challan-box { max-width: 800px; margin: auto; padding: 30px; border: 1px Solid #eee; box-shadow: 0 0 10px rgba(0, 0, 0, .15); font-size: 16px; line-height: 24px; }
            .header { display: flex; justify-content: space-between; margin-bottom: 50px; }
            .company-details { text-align: right; }
            .company-name { font-size: 28px; font-weight: bold; color: #333; margin-bottom: 5px; }
            .title { font-size: 32px; color: #333; font-weight: bold; text-transform: uppercase; }
            .info-table { width: 100%; margin-bottom: 40px; }
            .info-table td { padding: 5px; vertical-align: top; }
            .items-table { width: 100%; border-collapse: collapse; margin-bottom: 40px; }
            .items-table th { background: #f8f9fa; color: #333; font-weight: bold; padding: 12px; text-align: left; border-bottom: 2px Solid #ddd; }
            .items-table td { padding: 12px; border-bottom: 1px Solid #eee; }
            .footer { margin-top: 50px; text-align: center; font-size: 12px; color: #aaa; border-top: 1px Solid #eee; padding-top: 20px; }
            .signatures { display: flex; justify-content: space-between; margin-top: 80px; }
            .signature-box { border-top: 1px Solid #333; width: 200px; text-align: center; padding-top: 10px; }
        </style>
    </head>
    <body>
        <div class="challan-box">
            <div class="header">
                <div>
                    <div class="title">GATE PASS</div>
                    <div>Date: ${dateStr}</div>
                    <div>Ref: ${challanData.id ? challanData.id.substr(0, 8).toUpperCase() : 'N/A'}</div>
                </div>
                <div class="company-details">
                    <div class="company-name">${company.companyName || 'PipePro Business'}</div>
                    <div>${company.address || ''}</div>
                    <div>${company.city || ''} ${company.zip || ''}</div>
                    <div>${company.phone || ''}</div>
                </div>
            </div>

            <table class="info-table">
                <tr>
                    <td>
                        <strong>Delivered To:</strong><br>
                        ${challanData.customer}<br>
                        ${challanData.project ? 'Project: ' + challanData.project : ''}
                        <br><strong>Vehicle:</strong> ${challanData.vehicle || 'N/A'}
                        <br><strong>Driver:</strong> ${challanData.driver || 'N/A'}
                    </td>
                </tr>
            </table>

            <table class="items-table">
                <thead>
                    <tr>
                        <th>Item Description</th>
                        <th>Quantity</th>
                        <th>Unit</th>
                    </tr>
                </thead>
                <tbody>
                    ${challanData.items.map(item => `
                    <tr>
                        <td>${item.name}</td>
                        <td>${item.quantity}</td>
                        <td>${item.unit}</td>
                    </tr>
                    `).join('')}
                </tbody>
            </table>

            <div class="signatures">
                <div class="signature-box">Security / Gate Check</div>
                <div class="signature-box">Authorized Signatory</div>
            </div>

            <div class="footer">
                This is a computer generated gate pass.
            </div>
        </div>
        <script>window.print();</script>
    </body>
    </html>`;

    const printWindow = window.open('', '_blank');
    printWindow.document.write(html);
    printWindow.document.close();
}

// Expose Stock-in modal for raw materials
window.openStockInModal = async (item) => {
    if (!item) return;
    await showStockModal(item, 'in');
};

// Export functions
export { loadInventory, showEditModal };
