import { db, remoteConfig } from './firebase-config.js';
import { checkAuth, formatDate, downloadCSV, downloadPDF } from './dashboard.js';

const vehiclesContainer = document.getElementById('vehiclesContainer');
const vehicleExpensesTable = document.getElementById('vehicleExpensesTable');
const addVehicleBtn = document.getElementById('addVehicleBtn');
const expiryReportBtn = document.getElementById('expiryReportBtn');
const emailExpiryReportBtn = document.getElementById('emailExpiryReportBtn');
const saveVehicleBtn = document.getElementById('saveVehicleBtn');
const addExpenseBtn = document.getElementById('addExpenseBtn');
const saveExpenseBtn = document.getElementById('saveExpenseBtn');
const exportVehiclesPdfBtn = document.getElementById('exportVehiclesPdfBtn');
const exportVehiclesCSVBtn = document.getElementById('exportVehiclesCSVBtn');
const vehicleSearch = document.getElementById('vehicleSearch');
const vehicleTypeFilter = document.getElementById('vehicleTypeFilter');
const vehicleStatusFilter = document.getElementById('vehicleStatusFilter');
const resetVehicleFilters = document.getElementById('resetVehicleFilters');
const vehicleExpenseSearch = document.getElementById('vehicleExpenseSearch');
const vehicleExpenseTypeFilter = document.getElementById('vehicleExpenseTypeFilter');
const vehicleExpenseFrom = document.getElementById('vehicleExpenseFrom');
const vehicleExpenseTo = document.getElementById('vehicleExpenseTo');

let currentVehicleId = null;
let vehiclesCache = [];
let pendingFiles = {}; // Store processed files
let currentExpiringItems = []; // Store expiring items for email report

document.addEventListener('DOMContentLoaded', async () => {
    await checkAuth();
    await loadVehicles(); // Wait for vehicles to load
    loadExpenses();
    await checkAutomaticEmailTrigger(); // Check and send email if needed

    window.addEventListener('SectionChanged', (e) => {
        if (e.detail === 'vehicles') {
            loadVehicles();
            loadExpenses();
        }
    });

    if (addVehicleBtn) {
        addVehicleBtn.addEventListener('click', () => {
            currentVehicleId = null;
            document.getElementById('vehicleForm').reset();
            document.querySelector('#vehicleModal .modal-title').textContent = 'Add Vehicle';
            resetDocUI();
            new bootstrap.Modal(document.getElementById('vehicleModal')).show();
        });
    }

    if (expiryReportBtn) {
        expiryReportBtn.addEventListener('click', openExpiryReport);
    }

    if (emailExpiryReportBtn) {
        emailExpiryReportBtn.addEventListener('click', () => sendExpiryReportEmail(false));
    }

    if (saveVehicleBtn) {
        saveVehicleBtn.addEventListener('click', saveVehicle);
    }

    if (addExpenseBtn) {
        addExpenseBtn.addEventListener('click', openExpenseModal);
    }

    if (saveExpenseBtn) {
        saveExpenseBtn.addEventListener('click', saveExpense);
    }

    if (exportVehiclesCSVBtn) {
        exportVehiclesCSVBtn.addEventListener('click', exportVehiclesCSV);
    }

    if (exportVehiclesPdfBtn) {
        exportVehiclesPdfBtn.addEventListener('click', exportVehiclesPDF);
    }

    if (vehicleSearch) {
        vehicleSearch.addEventListener('input', applyVehicleFilters);
    }
    if (vehicleTypeFilter) {
        vehicleTypeFilter.addEventListener('change', applyVehicleFilters);
    }
    if (vehicleStatusFilter) {
        vehicleStatusFilter.addEventListener('change', applyVehicleFilters);
    }
    if (resetVehicleFilters) {
        resetVehicleFilters.addEventListener('click', () => {
            if (vehicleSearch) vehicleSearch.value = '';
            if (vehicleTypeFilter) vehicleTypeFilter.value = 'all';
            if (vehicleStatusFilter) vehicleStatusFilter.value = 'all';
            applyVehicleFilters();
        });
    }

    if (vehicleExpenseSearch) {
        vehicleExpenseSearch.addEventListener('input', applyVehicleExpenseFilters);
    }
    if (vehicleExpenseTypeFilter) {
        vehicleExpenseTypeFilter.addEventListener('change', applyVehicleExpenseFilters);
    }
    if (vehicleExpenseFrom) {
        vehicleExpenseFrom.addEventListener('change', applyVehicleExpenseFilters);
    }
    if (vehicleExpenseTo) {
        vehicleExpenseTo.addEventListener('change', applyVehicleExpenseFilters);
    }
});

async function loadVehicles() {
    const user = JSON.parse(localStorage.getItem('user'));
    if (!user || !vehiclesContainer) return;
    const businessId = user.businessId || user.uid;

    try {
        const snapshot = await db.collection('users').doc(businessId).collection('vehicles').get();
        vehiclesContainer.innerHTML = '';

        if (snapshot.empty) {
            vehiclesContainer.innerHTML = '<div class="col-12 text-center text-muted py-4">No vehicles added yet.</div>';
            return;
        }

        vehiclesCache = [];
        snapshot.forEach(doc => {
            const v = doc.data();
            vehiclesCache.push({ id: doc.id, ...v });

            const getOverallStatus = (vehicle) => {
                const today = new Date();
                const warning = new Date();
                warning.setDate(today.getDate() + 30);
                const dates = [vehicle.insuranceExpiry, vehicle.permitExpiry, vehicle.fitnessExpiry, vehicle.pucExpiry].filter(Boolean);
                let hasExpiring = false;
                for (const dStr of dates) {
                    const d = new Date(dStr);
                    if (d < today) return 'expired';
                    if (d < warning) hasExpiring = true;
                }
                return hasExpiring ? 'expiring' : 'ok';
            };

            const getStatusColor = (dateStr) => {
                if (!dateStr) return 'text-muted';
                const d = new Date(dateStr);
                const today = new Date();
                const warning = new Date();
                warning.setDate(today.getDate() + 30);

                if (d < today) return 'danger'; // Expired
                if (d < warning) return 'warning'; // Expiring Soon
                return 'success'; // OK
            };

            const formatDateShort = (dateStr) => {
                if (!dateStr) return 'N/A';
                const d = new Date(dateStr);
                return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' });
            };

            const getVehicleIcon = (type) => {
                const map = { 'Truck': 'truck', 'Trolley': 'trailer', 'JCB': 'snowplow', 'Mixer': 'truck-monster', 'Car': 'car', 'Bike': 'motorcycle' };
                return map[type] || 'truck-moving';
            };

            const canDelete = user.permissions ? user.permissions.canDelete : true;
            const escape = (str) => (str || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;');

            // Helper to get border class based on expiry
            const getBorderClass = (dateStr) => {
                const status = getStatusColor(dateStr);
                return status === 'danger' ? 'border-danger bg-danger bg-opacity-10' : (status === 'warning' ? 'border-warning bg-warning bg-opacity-10' : 'border-light');
            };

            const getDocLink = (url, label) => {
                if (!url) return '';
                return `<a href="${url}" target="_blank" class="badge bg-white text-primary border border-primary text-decoration-none me-1 mb-1" title="View ${label}"><i class="fas fa-eye me-1"></i>${label}</a>`;
            };
            const docs = v.documents || {};
            const overallStatus = getOverallStatus(v);

            const card = `
                <div class="col-xl-4 col-md-6 mb-4 vehicle-card-item" data-type="${v.type || ''}" data-status="${overallStatus}">
                    <div class="card h-100 border-0 shadow-sm vehicle-card">
                        <div class="card-header bg-white border-bottom-0 pt-3 pb-0">
                            <div class="d-flex justify-content-between align-items-start">
                                <div class="d-flex align-items-center">
                                    <div class="rounded-circle bg-primary bg-opacity-10 p-3 me-3 text-primary">
                                        <i class="fas fa-${getVehicleIcon(v.type)} fa-lg"></i>
                                    </div>
                                    <div>
                                        <h5 class="fw-bold mb-0 text-dark">${v.name}</h5>
                                        <small class="text-muted">${v.model || v.type}</small>
                                    </div>
                                </div>
                                <div class="dropdown">
                                    <button class="btn btn-link text-muted p-0" type="button" data-bs-toggle="dropdown"><i class="fas fa-ellipsis-v"></i></button>
                                    <ul class="dropdown-menu dropdown-menu-end">
                                        <li><a class="dropdown-item" href="#" onclick="window.editVehicle('${doc.id}')"><i class="fas fa-edit me-2"></i>Edit Details</a></li>
                                        <li><a class="dropdown-item" href="#" onclick="window.updateFastag('${doc.id}', ${v.fastagBalance || 0})"><i class="fas fa-wallet me-2"></i>Update Fastag</a></li>
                                        ${canDelete ? `<li><hr class="dropdown-divider"></li><li><a class="dropdown-item text-danger" href="#" onclick="window.deleteVehicle('${doc.id}')"><i class="fas fa-trash me-2"></i>Delete</a></li>` : ''}
                                    </ul>
                                </div>
                            </div>
                        </div>
                        <div class="card-body pt-3">
                            <div class="row g-2 mb-3">
                                <div class="col-6">
                                    <div class="p-2 bg-light rounded border">
                                        <small class="d-block text-muted text-uppercase" style="font-size:0.65rem; letter-spacing:0.5px;">Owner</small>
                                        <span class="fw-medium text-truncate d-block text-dark" style="font-size:0.9rem">${v.owner || '-'}</span>
                                    </div>
                                </div>
                                <div class="col-6">
                                    <div class="p-2 bg-light rounded border">
                                        <small class="d-block text-muted text-uppercase" style="font-size:0.65rem; letter-spacing:0.5px;">Fastag Bal</small>
                                        <span class="fw-bold ${v.fastagBalance < 500 ? 'text-danger' : 'text-success'}" style="font-size:0.9rem">₹${(parseFloat(v.fastagBalance) || 0).toLocaleString()}</span>
                                    </div>
                                </div>
                            </div>
                            
                            <div class="mb-3 px-1">
                                <div class="d-flex justify-content-between mb-1 border-bottom border-light pb-1">
                                    <small class="text-muted">RC / Chassis</small>
                                    <small class="fw-medium text-dark">${v.chassis || '-'}</small>
                                </div>
                                <div class="d-flex justify-content-between">
                                    <small class="text-muted">Engine No</small>
                                    <small class="fw-medium text-dark">${v.engine || '-'}</small>
                                </div>
                            </div>

                            <h6 class="text-uppercase text-muted small fw-bold mb-2" style="font-size:0.7rem">Document Status</h6>
                            <div class="row g-2">
                                <div class="col-6">
                                    <div class="d-flex align-items-center justify-content-between p-2 border rounded ${getBorderClass(v.insuranceExpiry)}">
                                        <small class="text-muted"><i class="fas fa-shield-alt me-1"></i>Ins.</small>
                                        <small class="fw-bold" style="font-size:0.85rem">${formatDateShort(v.insuranceExpiry)}</small>
                                    </div>
                                </div>
                                <div class="col-6">
                                    <div class="d-flex align-items-center justify-content-between p-2 border rounded ${getBorderClass(v.permitExpiry)}">
                                        <small class="text-muted"><i class="fas fa-file-contract me-1"></i>Permit</small>
                                        <small class="fw-bold" style="font-size:0.85rem">${formatDateShort(v.permitExpiry)}</small>
                                    </div>
                                </div>
                                <div class="col-6">
                                    <div class="d-flex align-items-center justify-content-between p-2 border rounded ${getBorderClass(v.fitnessExpiry)}">
                                        <small class="text-muted"><i class="fas fa-heartbeat me-1"></i>Fit.</small>
                                        <small class="fw-bold" style="font-size:0.85rem">${formatDateShort(v.fitnessExpiry)}</small>
                                    </div>
                                </div>
                                <div class="col-6">
                                    <div class="d-flex align-items-center justify-content-between p-2 border rounded ${getBorderClass(v.pucExpiry)}">
                                        <small class="text-muted"><i class="fas fa-smog me-1"></i>PUC</small>
                                        <small class="fw-bold" style="font-size:0.85rem">${formatDateShort(v.pucExpiry)}</small>
                                    </div>
                                </div>
                            </div>
                            ${(docs.rc || docs.insurance || docs.permit || docs.fitness || docs.puc) ? `
                            <div class="mt-2 pt-2 border-top border-light d-flex flex-wrap">
                                ${getDocLink(docs.rc, 'RC')}
                                ${getDocLink(docs.insurance, 'Ins')}
                                ${getDocLink(docs.permit, 'Permit')}
                                ${getDocLink(docs.fitness, 'Fit')}
                                ${getDocLink(docs.puc, 'PUC')}
                            </div>` : ''}
                        </div>
                    </div>
                </div>
            `;
            vehiclesContainer.innerHTML += card;
        });
        applyVehicleFilters();
    } catch (error) {
        console.error("Error loading vehicles", error);
    }
}

function applyVehicleFilters() {
    if (!vehiclesContainer) return;
    const searchTerm = (vehicleSearch?.value || '').toLowerCase();
    const typeFilter = vehicleTypeFilter?.value || 'all';
    const statusFilter = vehicleStatusFilter?.value || 'all';

    const items = vehiclesContainer.querySelectorAll('.vehicle-card-item');
    items.forEach(item => {
        const text = item.textContent.toLowerCase();
        const itemType = item.dataset.type || '';
        const itemStatus = item.dataset.status || '';

        if (searchTerm && !text.includes(searchTerm)) {
            item.style.display = 'none';
            return;
        }
        if (typeFilter !== 'all' && itemType !== typeFilter) {
            item.style.display = 'none';
            return;
        }
        if (statusFilter !== 'all' && itemStatus !== statusFilter) {
            item.style.display = 'none';
            return;
        }
        item.style.display = '';
    });
}

async function saveVehicle() {
    const user = JSON.parse(localStorage.getItem('user'));
    const businessId = user.businessId || user.uid;
    const name = document.getElementById('vehicleName').value;
    const type = document.getElementById('vehicleType').value;
    const model = document.getElementById('vehicleModel').value;
    const owner = document.getElementById('vehicleOwner').value;
    const ownerPhone = document.getElementById('vehicleOwnerPhone').value;
    const chassis = document.getElementById('vehicleChassis').value;
    const engine = document.getElementById('vehicleEngine').value;
    const fastagId = document.getElementById('vehicleFastagId').value;
    const fastagBalance = parseFloat(document.getElementById('vehicleFastagBalance').value) || 0;
    const insuranceExpiry = document.getElementById('insuranceExpiry').value;
    const permitExpiry = document.getElementById('permitExpiry').value;
    const fitnessExpiry = document.getElementById('fitnessExpiry').value;
    const pucExpiry = document.getElementById('pucExpiry').value;

    // Document URLs (Hidden Inputs)
    const urls = {
        rc: document.getElementById('rcUrl').value,
        insurance: document.getElementById('insuranceUrl').value,
        permit: document.getElementById('permitUrl').value,
        fitness: document.getElementById('fitnessUrl').value,
        puc: document.getElementById('pucUrl').value
    };

    // Files
    // Use pendingFiles if available (compressed), else fallback to input
    const getFile = (key) => pendingFiles[key];

    const files = {};
    ['rc', 'insurance', 'permit', 'fitness', 'puc'].forEach(key => {
        files[key] = getFile(key);
    });

    if (!name) return alert("Vehicle name is required");

    // Handle File Uploads
    const hasNewFiles = Object.values(files).some(f => f);
    if (hasNewFiles) {
        const apiKey = await getImgBBApiKey(businessId);
        if (!apiKey) {
            return alert("ImgBB API Key not found. Please configure it in Settings > Integrations (Remote Config).");
        }

        const btn = document.getElementById('saveVehicleBtn');
        const originalText = btn.innerHTML;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Uploading...';
        btn.disabled = true;

        try {
            if (files.rc) urls.rc = await uploadToImgBB(files.rc, apiKey, 'rc');
            if (files.insurance) urls.insurance = await uploadToImgBB(files.insurance, apiKey, 'insurance');
            if (files.permit) urls.permit = await uploadToImgBB(files.permit, apiKey, 'permit');
            if (files.fitness) urls.fitness = await uploadToImgBB(files.fitness, apiKey, 'fitness');
            if (files.puc) urls.puc = await uploadToImgBB(files.puc, apiKey, 'puc');
        } catch (e) {
            console.error(e);
            alert("Upload failed: " + e.message);
            btn.innerHTML = originalText;
            btn.disabled = false;
            return;
        }
        btn.innerHTML = originalText;
        btn.disabled = false;
    }

    try {
        const vehicleData = {
            name, type, model, owner, ownerPhone, chassis, engine, fastagId, fastagBalance,
            insuranceExpiry, permitExpiry, fitnessExpiry, pucExpiry,
            documents: urls,
            updatedAt: new Date()
        };

        if (currentVehicleId) {
            await db.collection('users').doc(businessId).collection('vehicles').doc(currentVehicleId).update(vehicleData);
            showAlert('success', 'Vehicle updated successfully');
        } else {
            vehicleData.createdAt = new Date();
            await db.collection('users').doc(businessId).collection('vehicles').add(vehicleData);
            showAlert('success', 'Vehicle added successfully');
        }

        bootstrap.Modal.getInstance(document.getElementById('vehicleModal')).hide();
        loadVehicles();
    } catch (error) {
        console.error("Error saving vehicle", error);
    }
}

async function openExpenseModal() {
    const user = JSON.parse(localStorage.getItem('user'));
    const businessId = user.businessId || user.uid;
    const select = document.getElementById('expenseVehicleSelect');
    select.innerHTML = '';

    const snapshot = await db.collection('users').doc(businessId).collection('vehicles').get();
    snapshot.forEach(doc => {
        select.innerHTML += `<option value="${doc.data().name}">${doc.data().name}</option>`;
    });

    document.getElementById('vehicleExpenseForm').reset();
    new bootstrap.Modal(document.getElementById('vehicleExpenseModal')).show();
}

async function saveExpense() {
    const user = JSON.parse(localStorage.getItem('user'));
    const businessId = user.businessId || user.uid;
    const vehicle = document.getElementById('expenseVehicleSelect').value;
    const type = document.getElementById('expenseType').value;
    const amount = parseFloat(document.getElementById('expenseAmount').value);
    const odometer = document.getElementById('expenseOdometer').value;
    const description = document.getElementById('expenseDescription').value;

    if (!vehicle || !amount) return alert("Please fill required fields");

    try {
        await db.collection('users').doc(businessId).collection('vehicle_expenses').add({
            vehicle, type, amount, odometer, description, date: new Date()
        });
        bootstrap.Modal.getInstance(document.getElementById('vehicleExpenseModal')).hide();
        showAlert('success', 'Expense recorded');
        loadExpenses();
    } catch (error) {
        console.error("Error saving expense", error);
    }
}

async function loadExpenses() {
    const user = JSON.parse(localStorage.getItem('user'));
    if (!user || !vehicleExpensesTable) return;
    const businessId = user.businessId || user.uid;

    const tbody = vehicleExpensesTable.querySelector('tbody');
    tbody.innerHTML = '<tr><td colspan="7" class="text-center">Loading...</td></tr>';

    try {
        const snapshot = await db.collection('users').doc(businessId)
            .collection('vehicle_expenses')
            .orderBy('date', 'desc')
            .limit(20)
            .get();

        tbody.innerHTML = '';
        const expenseTypes = new Set();
        if (snapshot.empty) {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center">No expenses recorded</td></tr>';
            return;
        }

        snapshot.forEach(doc => {
            const e = doc.data();
            if (e.type) expenseTypes.add(e.type);
            const canDelete = user.permissions ? user.permissions.canDelete : true;
            tbody.innerHTML += `
                <tr>
                    <td>${formatDate(e.date)}</td>
                    <td>${e.vehicle}</td>
                    <td><span class="badge bg-secondary">${e.type}</span></td>
                    <td>${e.description || '-'}</td>
                    <td class="text-danger fw-bold">₹${e.amount}</td>
                    <td>${e.odometer || '-'}</td>
                    <td>
                        ${canDelete ? `<button class="btn btn-sm btn-outline-danger" onclick="window.deleteExpense('${doc.id}')"><i class="fas fa-trash"></i></button>` : ''}
                    </td>
                </tr>`;
        });
        if (vehicleExpenseTypeFilter) {
            vehicleExpenseTypeFilter.innerHTML = '<option value="all">All Types</option>';
            Array.from(expenseTypes).sort().forEach(t => {
                vehicleExpenseTypeFilter.innerHTML += `<option value="${t}">${t}</option>`;
            });
        }
        applyVehicleExpenseFilters();
    } catch (error) {
        console.error("Error loading expenses", error);
    }
}

function applyVehicleExpenseFilters() {
    if (!vehicleExpensesTable) return;
    const rows = vehicleExpensesTable.querySelectorAll('tbody tr');
    const searchTerm = (vehicleExpenseSearch?.value || '').toLowerCase();
    const typeFilter = vehicleExpenseTypeFilter?.value || 'all';
    const fromVal = vehicleExpenseFrom?.value || '';
    const toVal = vehicleExpenseTo?.value || '';
    const fromDate = fromVal ? new Date(fromVal) : null;
    const toDate = toVal ? new Date(toVal) : null;

    rows.forEach(row => {
        if (row.querySelector('td[colspan]')) return;
        const cells = row.querySelectorAll('td');
        const rowText = row.textContent.toLowerCase();
        if (searchTerm && !rowText.includes(searchTerm)) {
            row.style.display = 'none';
            return;
        }
        const typeText = cells[2]?.textContent?.trim() || '';
        if (typeFilter !== 'all' && typeText !== typeFilter) {
            row.style.display = 'none';
            return;
        }
        if (fromDate || toDate) {
            const dateText = cells[0]?.textContent?.trim() || '';
            const dateObj = dateText ? new Date(dateText) : null;
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
    });
}

window.editVehicle = (id) => {
    const v = vehiclesCache.find(v => v.id === id);
    if (!v) return;

    currentVehicleId = id;
    document.getElementById('vehicleName').value = v.name;
    document.getElementById('vehicleType').value = v.type;
    document.getElementById('vehicleModel').value = v.model || '';
    document.getElementById('vehicleOwner').value = v.owner || '';
    document.getElementById('vehicleOwnerPhone').value = v.ownerPhone || '';
    document.getElementById('vehicleChassis').value = v.chassis || '';
    document.getElementById('vehicleEngine').value = v.engine || '';
    document.getElementById('vehicleFastagId').value = v.fastagId || '';
    document.getElementById('vehicleFastagBalance').value = v.fastagBalance || 0;
    document.getElementById('insuranceExpiry').value = v.insuranceExpiry || '';
    document.getElementById('permitExpiry').value = v.permitExpiry || '';
    document.getElementById('fitnessExpiry').value = v.fitnessExpiry || '';
    document.getElementById('pucExpiry').value = v.pucExpiry || '';

    // Set hidden URL inputs and UI
    const docs = v.documents || {};
    resetDocUI(); // Clear previous state
    setDocUI(docs);

    document.querySelector('#vehicleModal .modal-title').textContent = 'Edit Vehicle';
    new bootstrap.Modal(document.getElementById('vehicleModal')).show();
};

window.updateFastag = async (id, currentBal) => {
    window.showPrompt('Update Fastag Balance', 'Enter new balance (₹):', currentBal, async (newBal) => {
        const bal = parseFloat(newBal);
        if (isNaN(bal)) return alert("Invalid amount");

        const user = JSON.parse(localStorage.getItem('user'));
        const businessId = user.businessId || user.uid;

        try {
            await db.collection('users').doc(businessId).collection('vehicles').doc(id).update({
                fastagBalance: bal,
                updatedAt: new Date()
            });
            showAlert('success', 'Fastag balance updated');
            loadVehicles();
        } catch (e) { console.error(e); }
    });
};

window.deleteVehicle = async (id) => {
    window.showConfirm('Delete Vehicle', 'Are you sure you want to delete this vehicle?', async () => {
        const user = JSON.parse(localStorage.getItem('user'));
        if (user.permissions && user.permissions.canDelete === false) {
            return showAlert('danger', 'You do not have permission to delete items.');
        }

        const businessId = user.businessId || user.uid;
        try {
            await db.collection('users').doc(businessId).collection('vehicles').doc(id).delete();
            showAlert('success', 'Vehicle deleted');
            loadVehicles();
        } catch (e) { console.error(e); }
    });
};

window.deleteExpense = async (id) => {
    window.showConfirm('Delete Expense', 'Are you sure you want to delete this expense record?', async () => {
        const user = JSON.parse(localStorage.getItem('user'));
        if (user.permissions && user.permissions.canDelete === false) {
            return showAlert('danger', 'You do not have permission to delete items.');
        }

        const businessId = user.businessId || user.uid;
        try {
            await db.collection('users').doc(businessId).collection('vehicle_expenses').doc(id).delete();
            showAlert('success', 'Expense deleted');
            loadExpenses();
        } catch (e) { console.error(e); }
    });
};

// --- Document & Compression Helpers ---

window.handleFileSelect = async (type) => {
    const input = document.getElementById(`${type}File`);
    const file = input.files[0];
    if (!file) return;

    const statusDiv = document.getElementById(`${type}Status`);
    statusDiv.innerHTML = '<span class="text-info"><i class="fas fa-cog fa-spin"></i> Compressing...</span>';

    try {
        const compressedFile = await compressImage(file);
        pendingFiles[type] = compressedFile;

        const size = (compressedFile.size / 1024).toFixed(1);
        statusDiv.innerHTML = `
            <div class="d-flex align-items-center">
                <span class="text-success me-2"><i class="fas fa-check"></i> Ready (${size} KB)</span>
                <button type="button" class="btn btn-sm btn-outline-primary py-0 px-2" onclick="window.previewCompressedImage('${type}')" style="font-size: 0.75rem;">
                    <i class="fas fa-eye me-1"></i>Preview
                </button>
            </div>`;
    } catch (e) {
        console.error(e);
        statusDiv.innerHTML = '<span class="text-danger">Compression failed</span>';
    }
};

window.previewCompressedImage = (type) => {
    const file = pendingFiles[type];
    if (!file) return;

    const img = document.getElementById('previewImage');
    // Create a new URL for the preview
    const url = URL.createObjectURL(file);
    img.src = url;

    // Clean up the URL when the image loads to avoid memory leaks
    img.onload = () => URL.revokeObjectURL(url);

    document.getElementById('previewInfo').textContent = `Compressed Size: ${(file.size / 1024).toFixed(1)} KB`;
    new bootstrap.Modal(document.getElementById('imagePreviewModal')).show();
};

async function compressImage(file) {
    const maxSize = 50 * 1024; // 50KB
    let quality = 0.9; // Start high for better quality
    let width, height;

    // Create Image
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.src = objectUrl;
    await new Promise(r => img.onload = r);

    // Initial dimensions (Max 1200px)
    const MAX_DIMENSION = 1200;
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

    // Smart Compression Loop
    while (blob.size > maxSize) {
        if (quality > 0.6) {
            // Reduce quality slightly if above threshold
            quality -= 0.05;
            blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', quality));
        } else {
            // Quality is getting too low, resize dimensions instead to maintain sharpness
            width = Math.round(width * 0.9); // Reduce by 10%
            height = Math.round(height * 0.9);

            // Stop if image gets too small (unreadable)
            if (width < 400 || height < 400) break;

            // Re-draw at new size
            canvas.width = width;
            canvas.height = height;
            ctx.drawImage(img, 0, 0, width, height);

            // Reset quality to avoid artifacts on smaller image
            quality = 0.8;
            blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', quality));
        }
    }

    URL.revokeObjectURL(objectUrl);
    return new File([blob], file.name, { type: 'image/jpeg' });
}

window.deleteDoc = (type) => {
    window.showConfirm('Remove Document', 'Are you sure you want to remove this document?', async () => {
        // Clear UI
        document.getElementById(`${type}Url`).value = '';
        document.getElementById(`${type}File`).value = '';
        document.getElementById(`${type}Existing`).classList.add('d-none');

        // Clear pending
        delete pendingFiles[type];

        // Update Status
        const statusDiv = document.getElementById(`${type}Status`);
        if (statusDiv) statusDiv.innerHTML = '<span class="text-danger small">Removed</span>';

        // Persist removal for existing vehicle
        if (currentVehicleId) {
            const user = JSON.parse(localStorage.getItem('user'));
            const businessId = user.businessId || user.uid;
            try {
                await db.collection('users')
                    .doc(businessId)
                    .collection('vehicles')
                    .doc(currentVehicleId)
                    .update({
                        [`documents.${type}`]: firebase.firestore.FieldValue.delete(),
                        updatedAt: new Date()
                    });
                loadVehicles();
                showAlert('success', 'Document removed');
            } catch (e) {
                console.error(e);
                showAlert('danger', 'Failed to remove document');
            }
        }
    });
};

function resetDocUI() {
    pendingFiles = {};
    ['rc', 'insurance', 'permit', 'fitness', 'puc'].forEach(type => {
        document.getElementById(`${type}Url`).value = '';
        document.getElementById(`${type}File`).value = '';
        const statusDiv = document.getElementById(`${type}Status`);
        if (statusDiv) statusDiv.innerHTML = '';
        document.getElementById(`${type}Existing`).classList.add('d-none');
    });
}

function setDocUI(docs) {
    ['rc', 'insurance', 'permit', 'fitness', 'puc'].forEach(type => {
        if (docs[type]) {
            document.getElementById(`${type}Url`).value = docs[type];
            document.getElementById(`${type}Existing`).classList.remove('d-none');
            document.getElementById(`${type}Link`).href = docs[type];
        }
    });
}

// --- ImgBB Integration ---
async function getImgBBApiKey(businessId) {
    try {
        // 1. Try Remote Config
        await remoteConfig.fetchAndActivate();
        const rcKey = remoteConfig.getValue('imgbb_api_key').asString();
        if (rcKey) return rcKey;

        // 2. Fallback to Firestore (Settings > Integrations)
        const doc = await db.collection('users').doc(businessId).collection('settings').doc('integrations').get();
        if (doc.exists && doc.data().imgbbApiKey) {
            return doc.data().imgbbApiKey;
        }

        return null;
    } catch (e) {
        console.error("Config Error:", e);
        return null;
    }
}

async function uploadToImgBB(file, apiKey, type) {
    const statusDiv = document.getElementById(`${type}Status`);
    if (statusDiv) statusDiv.innerHTML = '<span class="text-primary"><i class="fas fa-spinner fa-spin"></i> Uploading...</span>';

    try {
        // Convert to base64 to avoid multipart/form-data CORS issues
        const base64Image = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => resolve(reader.result.split(',')[1]);
            reader.onerror = error => reject(error);
        });

        const params = new URLSearchParams();
        params.append('image', base64Image);

        const response = await fetch(`https://api.imgbb.com/1/upload?key=${apiKey}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: params
        });

        const data = await response.json();
        if (data.success) {
            if (statusDiv) statusDiv.innerHTML = '<span class="text-success"><i class="fas fa-check-circle"></i> Uploaded</span>';
            return data.data.url;
        }
        throw new Error(data.error ? data.error.message : 'Upload failed');
    } catch (error) {
        console.error("ImgBB Upload Error:", error);
        if (statusDiv) statusDiv.innerHTML = '<span class="text-danger"><i class="fas fa-exclamation-circle"></i> Failed</span>';
        throw error;
    }
}

// --- Expiry Report & Renewal ---

window.openExpiryReport = () => {
    const tbody = document.querySelector('#expiryReportTable tbody');
    tbody.innerHTML = '';
    currentExpiringItems = []; // Reset list

    const today = new Date();
    const warningDate = new Date();
    warningDate.setDate(today.getDate() + 30);

    let hasItems = false;

    const formatDateShort = (dateStr) => {
        if (!dateStr) return 'N/A';
        const d = new Date(dateStr);
        return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' });
    };

    vehiclesCache.forEach(v => {
        const checkDoc = (dateStr, type, key) => {
            if (!dateStr) return;
            const d = new Date(dateStr);

            // Check if expired or expiring within 30 days
            if (d < warningDate) {
                hasItems = true;
                const isExpired = d < today;
                const daysLeft = Math.ceil((d - today) / (1000 * 60 * 60 * 24));
                const statusHtml = isExpired
                    ? `<span class="badge bg-danger">Expired (${Math.abs(daysLeft)} days ago)</span>`
                    : `<span class="badge bg-warning text-dark">Expiring in ${daysLeft} days</span>`;

                // Add to list for email
                currentExpiringItems.push({
                    vehicle: v.name,
                    type: type,
                    expiry: formatDateShort(dateStr),
                    status: isExpired ? 'Expired' : 'Expiring Soon',
                    daysLeft: daysLeft
                });

                const formattedDate = formatDateShort(dateStr);
                const ownerPhone = v.ownerPhone || '';

                const row = `
                    <tr>
                        <td>
                            <div class="fw-bold">${v.name}</div>
                            <small class="text-muted">${v.owner || ''}</small>
                        </td>
                        <td>${type}</td>
                        <td>${formattedDate}</td>
                        <td>${statusHtml}</td>
                        <td>
                            <div class="form-check">
                                <input class="form-check-input" type="checkbox" style="cursor:pointer" onchange="window.handleRenewal('${v.id}', '${key}', this)">
                                <label class="form-check-label small text-muted">Mark Renewed</label>
                            </div>
                        </td>
                    </tr>
                `;
                tbody.innerHTML += row;
            }
        };

        checkDoc(v.insuranceExpiry, 'Insurance', 'insuranceExpiry');
        checkDoc(v.permitExpiry, 'Permit', 'permitExpiry');
        checkDoc(v.fitnessExpiry, 'Fitness', 'fitnessExpiry');
        checkDoc(v.pucExpiry, 'PUC', 'pucExpiry');
    });

    if (!hasItems) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center text-success py-3"><i class="fas fa-check-circle me-2"></i>All documents are up to date!</td></tr>';
    }

    new bootstrap.Modal(document.getElementById('expiryReportModal')).show();
};

window.sendExpiryReminder = (vehicleName, docType, expiryDate, ownerPhone) => {
    if (!ownerPhone) {
        window.showPrompt('Phone Number Required', 'Enter owner mobile number for WhatsApp:', '', (phone) => {
            if (phone) window.sendExpiryReminder(vehicleName, docType, expiryDate, phone);
        });
        return;
    }

    // Basic formatting for India (defaulting if no country code)
    let phone = ownerPhone.replace(/\D/g, '');
    if (phone.length === 10) phone = '91' + phone;

    const text = encodeURIComponent(`Hello,\n\nReminder: The ${docType} for vehicle *${vehicleName}* is expiring on *${expiryDate}*.\n\nPlease renew it to avoid penalties.\n\n- PipePro System`);
    window.open(`https://wa.me/${phone}?text=${text}`, '_blank');
};

window.handleRenewal = (vehicleId, docField, checkbox) => {
    if (!checkbox.checked) return;
    checkbox.checked = false; // Reset UI immediately

    const todayStr = new Date().toISOString().split('T')[0];

    // Use generic prompt but switch input type to date
    window.showPrompt('Renew Document', 'Select new expiry date:', todayStr, async (newDate) => {
        document.getElementById('genericInputValue').type = 'text'; // Reset input type
        if (!newDate) return;

        const user = JSON.parse(localStorage.getItem('user'));
        const businessId = user.businessId || user.uid;

        try {
            await db.collection('users').doc(businessId).collection('vehicles').doc(vehicleId).update({
                [docField]: newDate,
                updatedAt: new Date()
            });

            showAlert('success', 'Document renewed successfully');
            await loadVehicles(); // Refresh cache
            openExpiryReport(); // Refresh report
        } catch (e) {
            console.error(e);
            showAlert('danger', 'Failed to update document');
        }
    });

    // Switch input to date for this interaction
    document.getElementById('genericInputValue').type = 'date';
};

// --- Email Alerts & Automation ---

async function getEmailJSConfig() {
    try {
        // Fetch configuration securely from Firebase Remote Config
        await remoteConfig.fetchAndActivate();
        return {
            serviceId: remoteConfig.getValue('emailjs_service_id').asString(),
            // prioritize a specific report template, fallback to generic if not set
            templateId: remoteConfig.getValue('emailjs_report_template_id').asString() || remoteConfig.getValue('emailjs_template_id').asString(),
            publicKey: remoteConfig.getValue('emailjs_public_key').asString()
        };
    } catch (e) {
        console.error("Remote Config Error:", e);
        return null;
    }
}

async function sendExpiryReportEmail(isAuto = false) {
    if (currentExpiringItems.length === 0) {
        if (!isAuto) showAlert('info', 'No expiring items to report.');
        return;
    }

    let btn = null;
    let originalText = '';

    if (!isAuto) {
        btn = document.getElementById('emailExpiryReportBtn');
        if (btn) {
            originalText = btn.innerHTML;
            btn.disabled = true;
            btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Sending...';
        }
    }

    try {
        const config = await getEmailJSConfig();
        if (!config || !config.publicKey || !config.serviceId || !config.templateId) {
            throw new Error("System email configuration is missing. Please contact support.");
        }

        // Initialize EmailJS
        // emailjs.init(config.publicKey); // Passing key directly in send() is more robust

        // Get User Email
        const user = JSON.parse(localStorage.getItem('user'));
        const businessId = user.businessId || user.uid;
        let recipientEmail = user.email || '';

        // Try to get business email from Settings
        try {
            const settingsDoc = await db.collection('users').doc(businessId).collection('settings').doc('business').get();
            if (settingsDoc.exists) {
                const settingsData = settingsDoc.data();
                if (settingsData.email && settingsData.email.trim() !== '') {
                    recipientEmail = settingsData.email.trim();
                }
            }
        } catch (e) {
            console.error("Error fetching business settings:", e);
        }

        if (!recipientEmail || recipientEmail.trim() === '') {
            throw new Error("Recipient email not found. Please check Business Settings.");
        }

        console.log("Sending expiry report to:", recipientEmail);
        console.log("Using Template ID:", config.templateId);

        // Construct HTML table for email body
        // IMPORTANT: In EmailJS Template, use {{{message}}} (triple braces) to render this HTML table correctly.
        let emailBody = `
            <h3>Vehicle Document Expiry Report</h3>
            <p>The following documents are expired or expiring soon:</p>
            <table border="1" cellpadding="5" cellspacing="0" style="border-collapse: collapse; width: 100%;">
                <thead>
                    <tr style="background-color: #f2f2f2;">
                        <th>Vehicle</th>
                        <th>Document</th>
                        <th>Expiry Date</th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody>
        `;

        currentExpiringItems.forEach(item => {
            const color = item.status.includes('Expired') ? '#ffcccc' : '#fff3cd';
            emailBody += `<tr style="background-color: ${color};"><td>${item.vehicle}</td><td>${item.type}</td><td>${item.expiry}</td><td>${item.status} (${item.daysLeft} days)</td></tr>`;
        });
        emailBody += `</tbody></table>`;

        const templateParams = {
            to_email: recipientEmail,
            // Add common fallbacks in case template uses different variable names
            email: recipientEmail,
            recipient: recipientEmail,

            to_name: user.displayName || 'Business Owner',
            subject: 'Vehicle Expiry Report - Action Required',
            message: emailBody
        };

        await emailjs.send(config.serviceId, config.templateId, templateParams, config.publicKey);

        if (isAuto) {
            console.log(`[Auto-Mail] Expiry report sent successfully to ${recipientEmail}`);
            // Save today's date to prevent sending again today
            localStorage.setItem('last_expiry_report_date', new Date().toISOString().split('T')[0]);
        } else {
            showAlert('success', `Report sent to ${recipientEmail}`);
        }

    } catch (error) {
        console.error("Email Error:", error);
        let errorMsg = error.text || error.message || "Unknown error";

        if (errorMsg.toLowerCase().includes("recipient") && errorMsg.toLowerCase().includes("empty")) {
            errorMsg += ". Check EmailJS Template: Ensure 'To' field is set to {{to_email}}";
        }

        if (!isAuto) showAlert('danger', 'Failed to send email: ' + errorMsg);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = originalText;
        }
    }
}

async function checkAutomaticEmailTrigger() {
    // 0. Check if feature is enabled in Settings
    const user = JSON.parse(localStorage.getItem('user'));
    if (!user) return;
    const businessId = user.businessId || user.uid;

    try {
        const sDoc = await db.collection('users').doc(businessId).collection('settings').doc('business').get();
        if (sDoc.exists && sDoc.data().autoExpiryReports === false) {
            console.log("[Auto-Mail] Feature disabled in Settings.");
            return;
        }
    } catch (e) { console.error(e); }

    // 1. Check if already sent today
    const todayStr = new Date().toISOString().split('T')[0];
    const lastSent = localStorage.getItem('last_expiry_report_date');

    // --- TESTING: Uncomment the line below to force email on every refresh ---
    // localStorage.removeItem('last_expiry_report_date'); 

    if (lastSent === todayStr) {
        console.log("[Auto-Mail] Already sent today. Skipping.");
        return;
    }

    // 2. Scan for expiring items (Logic similar to openExpiryReport but silent)
    currentExpiringItems = [];
    const today = new Date();
    const warningDate = new Date();
    warningDate.setDate(today.getDate() + 30); // 30 Days Warning

    vehiclesCache.forEach(v => {
        const check = (dateStr, type) => {
            if (!dateStr) return;
            const d = new Date(dateStr);
            if (d < warningDate) {
                const isExpired = d < today;
                const daysLeft = Math.ceil((d - today) / (1000 * 60 * 60 * 24));
                const status = isExpired ? 'Expired' : 'Expiring Soon';

                currentExpiringItems.push({
                    vehicle: v.name,
                    type: type,
                    expiry: new Date(dateStr).toLocaleDateString('en-GB'),
                    status: status,
                    daysLeft: daysLeft
                });
            }
        };

        check(v.insuranceExpiry, 'Insurance');
        check(v.permitExpiry, 'Permit');
        check(v.fitnessExpiry, 'Fitness');
        check(v.pucExpiry, 'PUC');
    });

    // 3. Send if items found
    if (currentExpiringItems.length > 0) {
        console.log(`[Auto-Mail] Found ${currentExpiringItems.length} expiring items. Sending email...`);
        await sendExpiryReportEmail(true); // true = Automatic Mode
    } else {
        console.log("[Auto-Mail] No expiring items found.");
    }
}

function getVehiclesExportRows() {
    return vehiclesCache.map(v => ([
        v.name || '',
        v.model || '',
        v.type || '',
        v.owner || '',
        v.ownerPhone || '',
        v.fastagBalance ?? 0,
        v.insuranceExpiry || '',
        v.permitExpiry || '',
        v.fitnessExpiry || '',
        v.pucExpiry || ''
    ]));
}

function exportVehiclesCSV() {
    if (!vehiclesCache.length) {
        alert('No vehicles to export.');
        return;
    }

    const headers = ['Vehicle Number', 'Model', 'Type', 'Owner', 'Owner Phone', 'Fastag Balance', 'Insurance Expiry', 'Permit/Tax Expiry', 'Fitness Expiry', 'PUC Expiry'];
    const rows = getVehiclesExportRows();
    const filename = `vehicles_${new Date().toISOString().split('T')[0]}.csv`;
    downloadCSV(filename, headers, rows);
}

function exportVehiclesPDF() {
    if (!vehiclesCache.length) {
        alert('No vehicles to export.');
        return;
    }

    const headers = ['Vehicle Number', 'Model', 'Type', 'Owner', 'Owner Phone', 'Fastag Balance', 'Insurance Expiry', 'Permit/Tax Expiry', 'Fitness Expiry', 'PUC Expiry'];
    const rows = getVehiclesExportRows();
    const filename = `vehicles_${new Date().toISOString().split('T')[0]}.pdf`;
    downloadPDF(filename, 'Vehicles Report', headers, rows);
}

// Helper function to show alerts
function showAlert(type, message) {
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type} alert-dismissible fade show`;
    alertDiv.innerHTML = `
        <i class="fas fa-${type === 'success' ? 'check-circle' : 'exclamation-circle'} me-2"></i>${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    
    const container = document.querySelector('.container-fluid');
    if (container) {
        container.insertBefore(alertDiv, container.firstChild);
        setTimeout(() => alertDiv.remove(), 5000);
    }
}