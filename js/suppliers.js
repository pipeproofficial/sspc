import { db } from './firebase-config.js';
import { checkAuth, formatDate, downloadCSV, downloadPDF, fetchPostOfficeByPincode } from './dashboard.js';
import { showAlert } from './auth.js';
import { initializeStateDistrictPair, setStateDistrictValues } from './location-data.js';

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

let currentSupplierId = null;
let suppliersCache = [];

const MATERIAL_TYPES = ['Cement', 'Sand', 'Dust', 'Aggregate', 'Steel'];

document.addEventListener('DOMContentLoaded', async () => {
    await checkAuth();
    await initSupplierLocationSelectors();
    populateTypeFilter();
    loadSuppliers();

    window.addEventListener('sectionChanged', (e) => {
        if (e.detail === 'suppliers' || e.detail === 'supply') loadSuppliers();
    });

    if (addSupplierBtn) {
        addSupplierBtn.addEventListener('click', () => {
            currentSupplierId = null;
            supplierForm.reset();
            setStateDistrictValues(
                document.getElementById('supplierState'),
                document.getElementById('supplierDistrict'),
                '',
                ''
            );
            const materialsSelect = document.getElementById('supplierMaterials');
            if (materialsSelect) {
                Array.from(materialsSelect.options).forEach(opt => { opt.selected = false; });
            }
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

    const supplierPaymentTerms = document.getElementById('supplierPaymentTerms');
    if (supplierPaymentTerms) {
        supplierPaymentTerms.addEventListener('change', setCreditDaysVisibility);
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
    if (supplierPaymentModal) {
        supplierPaymentModal.addEventListener('hidden.bs.modal', () => {
            resetSupplierPaymentTxId();
        });
    }

    if (filterSupplierLedgerBtn) {
        filterSupplierLedgerBtn.addEventListener('click', loadSupplierLedgerData);
    }

    const supplierPincode = document.getElementById('supplierPincode');
    if (supplierPincode) {
        supplierPincode.addEventListener('blur', () => fillSupplierAddressFromPincode());
    }

    if (exportSuppliersCsvBtn) {
        exportSuppliersCsvBtn.addEventListener('click', exportSuppliersCSV);
    }

    if (exportSuppliersPdfBtn) {
        exportSuppliersPdfBtn.addEventListener('click', exportSuppliersPDF);
    }
});

async function initSupplierLocationSelectors() {
    await initializeStateDistrictPair(
        document.getElementById('supplierState'),
        document.getElementById('supplierDistrict')
    );
}

const normalizeName = (value) => (value || '').trim().replace(/\s+/g, ' ').toLowerCase();
const normalizeRef = (value) => (value || '').trim().toLowerCase();

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

function setCreditDaysVisibility() {
    const terms = document.getElementById('supplierPaymentTerms');
    const creditDays = document.getElementById('supplierCreditDays');
    if (!terms || !creditDays) return;
    const wrapper = creditDays.closest('.col-md-6') || creditDays.parentElement;
    const isCredit = terms.value === 'Credit';
    if (wrapper) wrapper.classList.toggle('d-none', !isCredit);
    if (!isCredit) creditDays.value = 0;
}

async function fillSupplierAddressFromPincode() {
    const pinEl = document.getElementById('supplierPincode');
    const villageEl = document.getElementById('supplierVillage');
    const districtEl = document.getElementById('supplierDistrict');
    const stateEl = document.getElementById('supplierState');
    const mandalEl = document.getElementById('supplierMandal');
    if (!pinEl) return;
    const pin = (pinEl.value || '').trim();
    if (!pin) return;
    const data = await fetchPostOfficeByPincode(pin);
    if (!data) return;
    if (villageEl && data.postOffices) {
        const villages = Array.from(new Set(data.postOffices.map(p => p.Name).filter(Boolean)));
        villageEl.innerHTML = `<option value="">Select Village</option>` + villages.map(v => `<option value="${v}">${v}</option>`).join('');
        villageEl.value = data.village || villageEl.value;
    }
    if (mandalEl && data.postOffices) {
        const mandals = Array.from(new Set(data.postOffices.map(p => p.Block).filter(Boolean)));
        mandalEl.innerHTML = `<option value="">Select Mandal</option>` + mandals.map(m => `<option value="${m}">${m}</option>`).join('');
        mandalEl.value = data.mandal || mandalEl.value;
    }
    if (stateEl && districtEl) {
        await setStateDistrictValues(
            stateEl,
            districtEl,
            data.state || stateEl.value,
            data.district || districtEl.value
        );
    }
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
                            <button class="btn btn-link text-secondary p-0" type="button" data-bs-toggle="dropdown"><i class="fas fa-ellipsis-v"></i></button>
                            <ul class="dropdown-menu dropdown-menu-end">
                                <li><a class="dropdown-item" href="#" onclick="window.editSupplier('${s.id}')"><i class="fas fa-edit fa-fw me-2"></i>Edit</a></li>
                                <li><a class="dropdown-item" href="#" onclick="window.recordSupplierPayment('${s.id}', '${escape(s.name)}')"><i class="fas fa-money-bill-wave fa-fw me-2"></i>Record Payment</a></li>
                                <li><a class="dropdown-item" href="#" onclick="window.viewSupplierLedger('${s.id}', '${escape(s.name)}')"><i class="fas fa-book fa-fw me-2"></i>View Ledger</a></li>
                                <li><a class="dropdown-item" href="#" onclick="window.viewSupplierHistory('${escape(s.name)}')"><i class="fas fa-history fa-fw me-2"></i>Purchase History</a></li>
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
        const materialsSupplied = Array.from(document.getElementById('supplierMaterials').selectedOptions).map(o => o.value);
        const data = {
            name: trimmedName,
            contactPerson: document.getElementById('supplierContact').value,
            phone: document.getElementById('supplierPhone').value,
            altPhone: document.getElementById('supplierAltPhone').value,
            address: document.getElementById('supplierAddress').value,
            pincode: document.getElementById('supplierPincode')?.value || '',
            village: document.getElementById('supplierVillage')?.value || '',
            district: document.getElementById('supplierDistrict')?.value || '',
            state: document.getElementById('supplierState')?.value || '',
            mandal: document.getElementById('supplierMandal')?.value || '',
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
    document.getElementById('supplierAltPhone').value = s.altPhone || '';
    document.getElementById('supplierAddress').value = s.address || '';
    if (document.getElementById('supplierPincode')) document.getElementById('supplierPincode').value = s.pincode || '';
    if (document.getElementById('supplierVillage')) {
        const el = document.getElementById('supplierVillage');
        if (s.village) {
            el.innerHTML = `<option value="">Select Village</option><option value="${s.village}">${s.village}</option>`;
        }
        el.value = s.village || '';
    }
    await setStateDistrictValues(
        document.getElementById('supplierState'),
        document.getElementById('supplierDistrict'),
        s.state || '',
        s.district || ''
    );
    if (document.getElementById('supplierMandal')) {
        const el = document.getElementById('supplierMandal');
        if (s.mandal) {
            el.innerHTML = `<option value="">Select Mandal</option><option value="${s.mandal}">${s.mandal}</option>`;
        }
        el.value = s.mandal || '';
    }
    document.getElementById('supplierGstin').value = s.gstin || '';
    document.getElementById('supplierPaymentTerms').value = s.paymentTerms || 'Cash';
    document.getElementById('supplierCreditDays').value = s.creditDays ?? 0;
    document.getElementById('supplierStatus').value = s.status || 'Active';
    document.getElementById('supplierNotes').value = s.notes || '';
    setCreditDaysVisibility();

    const materialsSelect = document.getElementById('supplierMaterials');
    if (materialsSelect) {
        const selected = new Set(s.materialsSupplied || []);
        Array.from(materialsSelect.options).forEach(opt => { opt.selected = selected.has(opt.value); });
    }
    
    document.querySelector('#supplierModal .modal-title').textContent = 'Edit Supplier';
    new bootstrap.Modal(supplierModal).show();
};

window.deleteSupplier = async (id) => {
    if(!confirm('Delete this supplier?')) return;
    const user = JSON.parse(localStorage.getItem('user'));
    if (user.permissions && user.permissions.canDelete === false) {
        return showAlert('danger', 'You do not have permission to delete items.');
    }

    const businessId = user.businessId || user.uid;
    try {
        await db.collection('users').doc(businessId).collection('suppliers').doc(id).delete();
        loadSuppliers();
        showAlert('success', 'Supplier deleted');
    } catch(e) {
        console.error(e);
        showAlert('danger', 'Failed to delete');
    }
};

window.viewSupplierHistory = async (supplierName) => {
    const user = JSON.parse(localStorage.getItem('user'));
    const businessId = user.businessId || user.uid;
    const historyModal = new bootstrap.Modal(document.getElementById('supplierHistoryModal'));
    const tbody = document.querySelector('#supplierHistoryTable tbody');
    document.getElementById('historySupplierName').textContent = supplierName;
    
    tbody.innerHTML = '<tr><td colspan="5" class="text-center">Loading...</td></tr>';
    historyModal.show();

    try {
        const snapshot = await db.collection('users').doc(businessId)
            .collection('purchases')
            .where('supplier', '==', supplierName)
            .orderBy('date', 'desc')
            .get();

        tbody.innerHTML = '';
        if (snapshot.empty) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center">No purchase history found</td></tr>';
            return;
        }

        snapshot.forEach(doc => {
            const p = doc.data();
            tbody.innerHTML += `
                <tr>
                    <td>${formatDate(p.date)}</td>
                    <td>${p.itemName}</td>
                    <td>${p.quantity}</td>
                    <td>₹${p.unitCost}</td>
                    <td>${p.invoiceNo || '-'}</td>
                </tr>
            `;
        });
    } catch (error) {
        console.error(error);
        tbody.innerHTML = '<tr><td colspan="5" class="text-center text-danger">Error loading history</td></tr>';
    }
};

window.recordSupplierPayment = (id, name) => {
    document.getElementById('spId').value = id;
    document.getElementById('spName').value = name;
    const labourPayableInput = document.getElementById('spLabourPayableId');
    if (labourPayableInput) labourPayableInput.value = '';
    document.getElementById('spNameDisplay').value = name;
    document.getElementById('spDate').valueAsDate = new Date();
    document.getElementById('spAmount').value = '';
    const amountInput = document.getElementById('spAmount');
    if (amountInput) amountInput.removeAttribute('max');
    document.getElementById('spRef').value = '';
    document.getElementById('spNotes').value = '';
    const labourInfo = document.getElementById('spLabourDueInfo');
    if (labourInfo) {
        labourInfo.classList.add('d-none');
        labourInfo.textContent = '';
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
        resetSupplierPaymentTxId();
        new bootstrap.Modal(supplierPaymentModal).show();
    } catch (error) {
        console.error('Failed to open labour due payment', error);
        showAlert('danger', 'Failed to load labour due');
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
    const paidAt = new Date(date);
    const clientTxId = (btn?.dataset?.clientTxId || '').trim() || createClientTxId();
    if (!amount || amount <= 0 || !date || Number.isNaN(paidAt.getTime())) {
        return alert('Invalid amount or date');
    }
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Saving...';
    try {
        const duplicate = await hasRecentDuplicateSupplierPayment(businessId, {
            supplierId,
            supplierName,
            amount,
            date: paidAt,
            mode,
            reference: ref,
            labourPayableId
        });
        if (duplicate) throw new Error('A similar payment was just recorded. Duplicate entry blocked.');
        const txRef = db.collection('users').doc(businessId).collection('transactions').doc(clientTxId);
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
        } else {
            const supplierRef = db.collection('users').doc(businessId).collection('suppliers').doc(supplierId);
            await db.runTransaction(async (t) => {
                const existingTx = await t.get(txRef);
                if (existingTx.exists) return;
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
                const supplierDoc = await t.get(supplierRef);
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
        showAlert('success', labourPayableId ? 'Labour payment recorded successfully' : 'Payment recorded successfully');
        window.dispatchEvent(new CustomEvent('paymentsUpdated'));
        loadSuppliers();
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
        // 1. Fetch Purchases (Credits) - Linked by Name
        const purchasesSnap = await db.collection('users').doc(businessId).collection('purchases')
            .where('supplier', '==', currentLedgerSupplier.name)
            .get();

        // 2. Fetch Payments (Debits) - by name and id, then de-duplicate by tx id
        const paymentsByNameSnap = await db.collection('users').doc(businessId).collection('transactions')
            .where('type', '==', 'SupplierPayment')
            .where('supplier', '==', currentLedgerSupplier.name)
            .get();
        const paymentsByIdSnap = currentLedgerSupplier.id
            ? await db.collection('users').doc(businessId).collection('transactions')
                .where('supplierId', '==', currentLedgerSupplier.id)
                .get()
            : { docs: [] };

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
            transactions.push({
                date: d.date.toDate(),
                desc: d.description || 'Payment',
                ref: d.reference || d.mode,
                credit: 0,
                debit: d.amount || 0 // We paid this
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
                        <td class="text-end text-danger">${t.credit > 0 ? '₹'+t.credit.toLocaleString() : '-'}</td>
                        <td class="text-end text-success">${t.debit > 0 ? '₹'+t.debit.toLocaleString() : '-'}</td>
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
