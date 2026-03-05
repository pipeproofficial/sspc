import { db } from './firebase-config.js';
import { checkAuth, formatDate, downloadCSV, downloadPDF } from './dashboard.js';
import { initializeStateSelect } from './location-data.js';
import { deriveTaxpayerDetailsFromGstin, isValidGstin, normalizeGstin } from './gst-lookup.js';

// DOM Elements
const customersTable = document.getElementById('customersTable');
const addCustomerBtn = document.getElementById('addCustomerBtn');
const customerModal = document.getElementById('customerModal');
const customerForm = document.getElementById('customerForm');
const saveCustomerBtn = document.getElementById('saveCustomerBtn');
const saveCustomerAndNewBtn = document.getElementById('saveCustomerAndNewBtn');
const addCustomerGroupBtn = document.getElementById('addCustomerGroupBtn');
const addBillingAddressBtn = document.getElementById('addBillingAddressBtn');
const addShippingAddressBtn = document.getElementById('addShippingAddressBtn');
const searchCustomers = document.getElementById('searchCustomers');
const filterType = document.getElementById('filterType');
const filterCustomerStatus = document.getElementById('filterCustomerStatus');
const importCustomersBtn = document.getElementById('importCustomersBtn');
const exportCustomersPdfBtn = document.getElementById('exportCustomersPdfBtn');
const exportCustomersCsvBtn = document.getElementById('exportCustomersCsvBtn');
const advancePaymentModal = document.getElementById('advancePaymentModal');
const saveAdvancePaymentBtn = document.getElementById('saveAdvancePaymentBtn');
const filterLedgerBtn = document.getElementById('filterLedgerBtn');
const customerGstinLookupBtn = document.getElementById('customerGstinLookupBtn');
const customerGstinLookupStatus = document.getElementById('customerGstinLookupStatus');

// Variables
let currentCustomerId = null;
let customersData = [];
let saveAndAddNew = false;
const CUSTOMER_GROUPS_KEY = 'customerGroups';
let customerGroups = [];
let customerGstinLookupInProgress = false;

let customerServices = [];

function getCustomerGroup(customer = {}) {
    return (customer.group || customer.type || '').toString().trim();
}

// Initialize Customers Page
document.addEventListener('DOMContentLoaded', async () => {
    await checkAuth();
    loadCustomerGroups();
    await loadCustomers();
    setupEventListeners();
    await initializeCustomerStaticFields();
    initializeDataTable();
    populateTypeFilter();
});

// Load Customers Data
async function loadCustomers() {
    const user = JSON.parse(localStorage.getItem('user'));
    
    if (!user || !customersTable) return;
    const businessId = user.businessId || user.uid;
    
    try {
        showLoading();
        
        // Destroy existing DataTable if it exists
        if ($.fn.DataTable.isDataTable(customersTable)) {
            $(customersTable).DataTable().destroy();
        }

        const customersSnapshot = await db.collection('users').doc(businessId)
            .collection('customers')
            .orderBy('createdAt', 'desc')
            .get();
        
        customersData = [];
        const tbody = customersTable.querySelector('tbody');
        tbody.innerHTML = '';
        
        if (customersSnapshot.empty) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="9" class="text-center py-5">
                        <div class="empty-state">
                            <i class="fas fa-users fa-3x text-muted mb-3"></i>
                            <h5 class="text-muted">No Customers Yet</h5>
                            <p class="text-muted mb-4">Start by adding your first customer</p>
                            <button class="btn btn-primary" id="addFirstCustomer">
                                <i class="fas fa-user-plus me-2"></i>Add First Customer
                            </button>
                        </div>
                    </td>
                </tr>
            `;
            
            document.getElementById('addFirstCustomer')?.addEventListener('click', () => {
                showAddCustomerModal();
            });
            
            hideLoading();
            return;
        }
        
        let rowsHtml = '';
        customersSnapshot.forEach(doc => {
            const customer = {
                id: doc.id,
                ...doc.data()
            };
            customersData.push(customer);
            
            rowsHtml += createCustomerRow(customer);
        });

        hydrateCustomerGroupsFromData();
        
        tbody.innerHTML = rowsHtml;
        
        // Update stats
        updateCustomerStats();
        initializeDataTable();
        hideLoading();
        
    } catch (error) {
        console.error('Error loading customers:', error);
        showError('Failed to load customers data.');
        hideLoading();
    }
}

// Create Customer Row HTML
function createCustomerRow(customer) {
    const lastContact = customer.lastContact ? formatDate(customer.lastContact) : 'Never';
    const statusBadge = getStatusBadge(customer.status || 'Active');
    const customerGroup = getCustomerGroup(customer) || '-';
    const groupBadge = getGroupBadge(customerGroup);
    const balance = customer.outstandingBalance || 0;
    
    return `
        <tr data-id="${customer.id}">
            <td>
                <div class="d-flex align-items-center">
                    <div class="customer-avatar me-3">
                        <div class="avatar-circle ${getAvatarColor(customer.name)}">
                            ${getInitials(customer.name)}
                        </div>
                    </div>
                    <div>
                        <h6 class="mb-0">${customer.name}</h6>
                        <small class="text-muted">${customer.email || 'No email'}</small>
                    </div>
                </div>
            </td>
            <td>${customer.phone || '-'}</td>
            <td>${customer.company || '-'}</td>
            <td><span class="badge ${groupBadge}">${customerGroup}</span></td>
            <td>${customer.totalProjects || 0}</td>
            <td>
                <div>₹${parseFloat(customer.totalSpent || 0).toLocaleString(undefined, {minimumFractionDigits: 2})}</div>
                ${balance > 0 ? `<small class="text-danger fw-bold">Due: ₹${balance.toLocaleString()}</small>` : (balance < 0 ? `<small class="text-success fw-bold">Credit: ₹${Math.abs(balance).toLocaleString()}</small>` : '<small class="text-muted">Settled</small>')}
            </td>
            <td><span class="badge ${statusBadge}">${customer.status || 'Active'}</span></td>
            <td>${lastContact}</td>
            <td class="table-actions-cell text-end">
                <div class="dropdown">
                    <button
                        class="btn btn-sm btn-outline-secondary table-actions-toggle"
                        type="button"
                        data-bs-toggle="dropdown" data-bs-boundary="window"
                        aria-expanded="false"
                        aria-label="Open actions menu for ${customer.name}"
                    >
                        <i class="fas fa-ellipsis-v"></i>
                    </button>
                    <ul class="dropdown-menu dropdown-menu-end shadow-sm">
                        <li><button class="dropdown-item view-customer" type="button"><i class="fas fa-eye fa-fw me-2"></i>View Details</button></li>
                        <li><button class="dropdown-item edit-customer" type="button"><i class="fas fa-edit fa-fw me-2"></i>Edit</button></li>
                        <li><button class="dropdown-item view-ledger" type="button"><i class="fas fa-book fa-fw me-2"></i>View Ledger</button></li>
                        <li><button class="dropdown-item add-order" type="button"><i class="fas fa-cart-plus fa-fw me-2"></i>Add Order</button></li>
                        <li><button class="dropdown-item record-advance" type="button"><i class="fas fa-money-bill-wave fa-fw me-2"></i>Record Advance</button></li>
                        <li><hr class="dropdown-divider"></li>
                        <li><button class="dropdown-item text-danger delete-customer" type="button"><i class="fas fa-trash fa-fw me-2"></i>Delete</button></li>
                    </ul>
                </div>
            </td>
        </tr>
    `;
}

// Get Avatar Color
function getAvatarColor(name) {
    const colors = ['bg-primary', 'bg-success', 'bg-info', 'bg-warning', 'bg-danger', 'bg-secondary'];
    const index = name.length % colors.length;
    return colors[index];
}

// Get Initials
function getInitials(name) {
    return name.split(' ')
        .map(part => part[0])
        .join('')
        .toUpperCase()
        .substring(0, 2);
}

// Get Status Badge Class
function getStatusBadge(status) {
    const badgeMap = {
        'Active': 'bg-success',
        'Inactive': 'bg-secondary',
        'Lead': 'bg-info',
        'Prospect': 'bg-warning',
        'Blocked': 'bg-danger'
    };
    return badgeMap[status] || 'bg-secondary';
}

// Get Group Badge Class
function getGroupBadge(group) {
    const palette = ['bg-primary', 'bg-success', 'bg-info', 'bg-warning', 'bg-danger', 'bg-secondary'];
    const key = (group || '').toString();
    if (!key || key === '-') return 'bg-secondary';
    const hash = key.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
    return palette[hash % palette.length];
}

// Update Customer Statistics
function updateCustomerStats() {
    const totalCustomers = customersData.length;
    const activeCustomers = customersData.filter(c => c.status === 'Active').length;
    const leadCustomers = customersData.filter(c => c.status === 'Lead').length;
    const totalRevenue = customersData.reduce((sum, customer) => {
        return sum + (customer.totalSpent || 0);
    }, 0);
    
    // Update UI elements
    updateStatElement('cust_totalCustomers', totalCustomers);
    updateStatElement('cust_activeCustomers', activeCustomers);
    updateStatElement('cust_leadCustomers', leadCustomers);
    updateStatElement('cust_customerRevenue', `₹${totalRevenue.toLocaleString(undefined, {minimumFractionDigits: 2})}`);
}

function updateStatElement(id, value) {
    const element = document.getElementById(id);
    if (element) element.textContent = value;
}

// Setup Event Listeners
function setupEventListeners() {
    // Add Customer Button
    if (addCustomerBtn) {
        addCustomerBtn.addEventListener('click', showAddCustomerModal);
    }
    
    // Save Customer Button
    if (saveCustomerBtn) {
        saveCustomerBtn.addEventListener('click', () => {
            saveAndAddNew = false;
            saveCustomer();
        });
    }

    if (saveCustomerAndNewBtn) {
        saveCustomerAndNewBtn.addEventListener('click', () => {
            saveAndAddNew = true;
            saveCustomer();
        });
    }

    if (addCustomerGroupBtn) {
        addCustomerGroupBtn.addEventListener('click', addCustomerGroup);
    }

    if (addBillingAddressBtn) {
        addBillingAddressBtn.addEventListener('click', () => addAddressEntry('bill'));
    }

    if (addShippingAddressBtn) {
        addShippingAddressBtn.addEventListener('click', () => addAddressEntry('ship'));
    }
    
    // Search Customers
    if (searchCustomers) {
        searchCustomers.addEventListener('input', applyCustomerFilters);
    }
    
    // Filter by Type
    if (filterType) {
        filterType.addEventListener('change', applyCustomerFilters);
    }
    if (filterCustomerStatus) {
        filterCustomerStatus.addEventListener('change', applyCustomerFilters);
    }
    
    // Import/Export Buttons
    if (importCustomersBtn) {
        importCustomersBtn.addEventListener('click', importCustomers);
    }
    
    if (exportCustomersCsvBtn) {
        exportCustomersCsvBtn.addEventListener('click', exportCustomersCSV);
    }

    if (exportCustomersPdfBtn) {
        exportCustomersPdfBtn.addEventListener('click', exportCustomersPDF);
    }

    // Save Advance Payment
    if (saveAdvancePaymentBtn) {
        saveAdvancePaymentBtn.addEventListener('click', saveAdvancePayment);
    }

    // Filter Ledger
    if (filterLedgerBtn) {
        filterLedgerBtn.addEventListener('click', loadLedgerData);
    }

    const addServiceBtn = document.getElementById('addCustomerServiceBtn');
    if (addServiceBtn) addServiceBtn.addEventListener('click', addServiceFromInput);
    const serviceInput = document.getElementById('customerServiceInput');
    if (serviceInput) {
        serviceInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                addServiceFromInput();
            }
        });
    }

    const gstTypeEl = document.getElementById('customerGstType');
    if (gstTypeEl) {
        gstTypeEl.addEventListener('change', syncGstControls);
    }
    const customerTaxIdEl = document.getElementById('customerTaxId');
    if (customerTaxIdEl) {
        customerTaxIdEl.addEventListener('input', () => {
            customerTaxIdEl.value = normalizeGstin(customerTaxIdEl.value);
            setCustomerGstinLookupStatus('');
        });
        customerTaxIdEl.addEventListener('blur', () => lookupCustomerTaxpayer(false));
        customerTaxIdEl.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                lookupCustomerTaxpayer(true);
            }
        });
    }
    if (customerGstinLookupBtn) {
        customerGstinLookupBtn.addEventListener('click', () => lookupCustomerTaxpayer(true));
    }
    
    // Modal Close
    if (customerModal) {
        customerModal.addEventListener('hidden.bs.modal', () => {
            resetCustomerForm();
        });
    }
    
    // Edit, Delete, View buttons (event delegation)
    document.addEventListener('click', (e) => {
        if (e.target.closest('.remove-service-btn')) {
            const idx = Number(e.target.closest('.remove-service-btn')?.dataset?.index || -1);
            if (idx >= 0) {
                customerServices.splice(idx, 1);
                renderServicesList();
            }
            return;
        }

        if (e.target.closest('.remove-party-address-btn')) {
            const card = e.target.closest('.party-address-entry');
            const container = card?.parentElement;
            if (card) card.remove();
            if (container && !container.querySelector('.party-address-entry')) {
                const isShip = container.id === 'customerShippingAddressesContainer';
                addAddressEntry(isShip ? 'ship' : 'bill');
            }
            return;
        }

        const row = e.target.closest('tr[data-id]');
        if (!row) return;
        
        const customerId = row.dataset.id;
        const customer = customersData.find(c => c.id === customerId);
        
        if (e.target.closest('.view-customer')) {
            viewCustomerDetails(customer);
        } else if (e.target.closest('.edit-customer')) {
            showEditCustomerModal(customer);
        } else if (e.target.closest('.delete-customer')) {
            deleteCustomer(customerId);
        } else if (e.target.closest('.add-order')) {
            addOrderForCustomer(customer);
        } else if (e.target.closest('.record-advance')) {
            window.recordAdvancePayment(customer);
        } else if (e.target.closest('.view-ledger')) {
            window.viewCustomerLedger(customer);
        }
    });
}

// Populate Type Filter
function populateTypeFilter() {
    if (!filterType) return;
    
    filterType.innerHTML = '<option value="all">All Groups</option>';
    customerGroups.forEach(type => {
        filterType.innerHTML += `<option value="${type}">${type}</option>`;
    });
}

function populateCustomerTypeSelect() {
    const typeSelect = document.getElementById('customerType');
    if (!typeSelect) return;
    const current = typeSelect.value || '';
    typeSelect.innerHTML = `<option value="">Select Group</option>${customerGroups.map(type => `<option value="${type}">${type}</option>`).join('')}`;
    typeSelect.value = current;
}

function normalizeCustomerGroups(list) {
    return Array.from(new Set((Array.isArray(list) ? list : [])
        .map(v => (v || '').toString().trim())
        .filter(Boolean)));
}

function loadCustomerGroups() {
    try {
        const raw = localStorage.getItem(CUSTOMER_GROUPS_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        customerGroups = normalizeCustomerGroups(parsed);
    } catch {
        customerGroups = [];
    }
}

function saveCustomerGroups() {
    localStorage.setItem(CUSTOMER_GROUPS_KEY, JSON.stringify(customerGroups));
}

function hydrateCustomerGroupsFromData() {
    const fromData = customersData.map(c => getCustomerGroup(c)).filter(Boolean);
    customerGroups = normalizeCustomerGroups([...customerGroups, ...fromData]);
    saveCustomerGroups();
    populateTypeFilter();
    populateCustomerTypeSelect();
}

async function addCustomerGroup() {
    const entered = await window.showPromptAsync('Add Group', 'Enter new party group name', '', { submitText: 'Add' });
    const value = (entered || '').trim();
    if (!value) return;
    customerGroups = normalizeCustomerGroups([...customerGroups, value]);
    saveCustomerGroups();
    populateTypeFilter();
    populateCustomerTypeSelect();
    const typeSelect = document.getElementById('customerType');
    if (typeSelect) typeSelect.value = value;
}

async function initializeCustomerStaticFields() {
    const gstState = document.getElementById('customerGstState');
    if (gstState) {
        await initializeStateSelect(gstState, { placeholder: 'Select State' });
    }
    syncGstControls();
}

function setCustomerTab(tabId = 'customer-address-tab') {
    const tabEl = document.getElementById(tabId);
    if (!tabEl) return;
    bootstrap.Tab.getOrCreateInstance(tabEl).show();
}

function syncGstControls() {
    const gstTypeEl = document.getElementById('customerGstType');
    const gstinEl = document.getElementById('customerTaxId');
    if (!gstTypeEl || !gstinEl) return;
    const isRegistered = gstTypeEl.value !== 'Unregistered/Consumer';
    gstinEl.required = isRegistered;
    if (!isRegistered) gstinEl.value = '';
    if (customerGstinLookupBtn) customerGstinLookupBtn.disabled = !isRegistered;
    if (!isRegistered) setCustomerGstinLookupStatus('');
}

function setCustomerGstinLookupStatus(message = '', tone = '') {
    if (!customerGstinLookupStatus) return;
    customerGstinLookupStatus.textContent = message || '';
    customerGstinLookupStatus.classList.remove('text-success', 'text-danger', 'text-muted');
    if (tone === 'success') customerGstinLookupStatus.classList.add('text-success');
    else if (tone === 'danger') customerGstinLookupStatus.classList.add('text-danger');
    else if (message) customerGstinLookupStatus.classList.add('text-muted');
}

function setCustomerStateSelectValue(state = '') {
    const stateSelect = document.getElementById('customerGstState');
    const value = String(state || '').trim();
    if (!stateSelect || !value) return;
    const normalized = value.toLowerCase();
    const matched = Array.from(stateSelect.options).find((opt) => String(opt.value || '').trim().toLowerCase() === normalized);
    if (matched) {
        stateSelect.value = matched.value;
        return;
    }
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value;
    stateSelect.appendChild(option);
    stateSelect.value = value;
}

function applyTaxpayerDataToCustomer(details = {}) {
    const gstinEl = document.getElementById('customerTaxId');
    const gstTypeEl = document.getElementById('customerGstType');
    const nameEl = document.getElementById('customerName');
    const companyEl = document.getElementById('customerCompany');
    const billingAddressEl = document.querySelector('#customerBillingAddressesContainer .party-address-text');
    const normalizedGstin = normalizeGstin(details.gstin || '');
    if (gstinEl && normalizedGstin) gstinEl.value = normalizedGstin;
    if (gstTypeEl && gstTypeEl.value === 'Unregistered/Consumer') {
        gstTypeEl.value = 'Registered Business - Regular';
        syncGstControls();
    }
    const suggestedName = details.tradeName || details.legalName || '';
    if (nameEl && suggestedName && !nameEl.value.trim()) nameEl.value = suggestedName;
    if (companyEl && details.legalName && !companyEl.value.trim()) companyEl.value = details.legalName;
    if (details.state) setCustomerStateSelectValue(details.state);
    if (billingAddressEl && details.address && !billingAddressEl.value.trim()) {
        billingAddressEl.value = details.address;
    }
}

async function lookupCustomerTaxpayer(manual = false) {
    if (customerGstinLookupInProgress) return;
    const gstType = document.getElementById('customerGstType')?.value || 'Unregistered/Consumer';
    if (gstType === 'Unregistered/Consumer') {
        if (manual) showError('Select registered GST type before taxpayer search.');
        return;
    }

    const gstinEl = document.getElementById('customerTaxId');
    const gstin = normalizeGstin(gstinEl?.value || '');
    if (gstinEl) gstinEl.value = gstin;
    if (!isValidGstin(gstin)) {
        if (manual) {
            setCustomerGstinLookupStatus('Enter valid GSTIN before search.', 'danger');
            showError('Enter a valid GSTIN.');
        }
        return;
    }

    customerGstinLookupInProgress = true;
    if (customerGstinLookupBtn) {
        customerGstinLookupBtn.disabled = true;
        customerGstinLookupBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Searching';
    }
    setCustomerGstinLookupStatus('Validating GSTIN...', '');
    try {
        const details = deriveTaxpayerDetailsFromGstin(gstin);
        if (!details) throw new Error('Enter a valid GSTIN.');
        applyTaxpayerDataToCustomer(details);
        setCustomerGstinLookupStatus('GSTIN verified. State auto-filled. Enter party name/address manually.', 'success');
    } catch (error) {
        console.error('Customer GST lookup failed:', error);
        const message = error?.message || 'GSTIN validation failed.';
        setCustomerGstinLookupStatus(message, 'danger');
        if (manual) showError(message);
    } finally {
        customerGstinLookupInProgress = false;
        if (customerGstinLookupBtn) {
            customerGstinLookupBtn.innerHTML = '<i class="fas fa-search me-1"></i>Search';
            syncGstControls();
        }
    }
}

function getAddressContainerByKind(kind = 'bill') {
    return document.getElementById(kind === 'ship'
        ? 'customerShippingAddressesContainer'
        : 'customerBillingAddressesContainer');
}

function buildAddressEntryHtml(kind = 'bill', data = {}) {
    const safeLabel = String(data.label || (kind === 'ship' ? 'Shipping' : 'Billing')).replace(/"/g, '&quot;');
    const safeAddress = String(data.address || '').replace(/"/g, '&quot;');
    const placeholder = kind === 'ship' ? 'Shipping Address' : 'Billing Address';
    return `
        <div class="card border party-address-entry">
            <div class="card-body p-2">
                <div class="mb-2">
                    <label class="form-label small mb-1">Label</label>
                    <input type="text" class="form-control form-control-sm party-address-label" value="${safeLabel}" placeholder="Label">
                </div>
                <div>
                    <label class="form-label small mb-1">Address</label>
                    <textarea class="form-control form-control-sm party-address-text" rows="3" placeholder="${placeholder}">${safeAddress}</textarea>
                </div>
                <div class="text-end mt-2">
                    <button type="button" class="btn btn-sm btn-outline-danger remove-party-address-btn">Remove</button>
                </div>
            </div>
        </div>
    `;
}

function addAddressEntry(kind = 'bill', data = {}) {
    const container = getAddressContainerByKind(kind);
    if (!container) return;
    container.insertAdjacentHTML('beforeend', buildAddressEntryHtml(kind, data));
}

function collectAddressEntries(kind = 'bill', gstState = '') {
    const container = getAddressContainerByKind(kind);
    if (!container) return [];
    const entries = Array.from(container.querySelectorAll('.party-address-entry')).map((entry, idx) => ({
        label: (entry.querySelector('.party-address-label')?.value || '').trim() || (kind === 'ship' ? `Shipping ${idx + 1}` : `Billing ${idx + 1}`),
        address: (entry.querySelector('.party-address-text')?.value || '').trim(),
        state: gstState,
        district: '',
        mandal: '',
        village: '',
        zip: '',
        isDefault: idx === 0
    })).filter(a => a.address);
    return entries;
}

// Show Add Customer Modal
function prepareAddCustomerForm() {
    currentCustomerId = null;
    document.getElementById('modalTitle').textContent = 'Add Party';
    customerForm.reset();
    
    // Populate type dropdown
    populateCustomerTypeSelect();

    // Set default values
    document.getElementById('customerStatus').value = 'Active';
    document.getElementById('customerType').value = '';
    document.getElementById('customerGstType').value = 'Unregistered/Consumer';
    document.getElementById('customerOpeningBalance').value = '';
    document.getElementById('customerOpeningBalanceType').value = 'to_receive';
    document.getElementById('customerOpeningBalanceDate').value = new Date().toISOString().split('T')[0];
    const billWrap = document.getElementById('customerBillingAddressesContainer');
    const shipWrap = document.getElementById('customerShippingAddressesContainer');
    if (billWrap) billWrap.innerHTML = '';
    if (shipWrap) shipWrap.innerHTML = '';
    addAddressEntry('bill', { label: 'Billing', address: '' });
    addAddressEntry('ship', { label: 'Shipping', address: '' });
    customerServices = [];
    renderServicesList();
    setCustomerGstinLookupStatus('');
    initializeCustomerStaticFields();
    setCustomerTab('customer-address-tab');
}

function showAddCustomerModal() {
    prepareAddCustomerForm();
    const modal = new bootstrap.Modal(customerModal);
    modal.show();
}

function renderServicesList() {
    const wrap = document.getElementById('customerServicesList');
    if (!wrap) return;
    if (!customerServices.length) {
        wrap.innerHTML = '<span class="text-muted small">No services added</span>';
        return;
    }
    wrap.innerHTML = customerServices.map((service, idx) => `
        <span class="badge bg-info text-dark">
            ${service}
            <button type="button" class="btn btn-link btn-sm p-0 ms-1 text-dark remove-service-btn" data-index="${idx}">
                <i class="fas fa-times"></i>
            </button>
        </span>
    `).join('');
}

function addServiceFromInput() {
    const input = document.getElementById('customerServiceInput');
    const value = (input?.value || '').trim();
    if (!value) return;
    if (!customerServices.some(s => s.toLowerCase() === value.toLowerCase())) {
        customerServices.push(value);
    }
    if (input) input.value = '';
    renderServicesList();
}

window.showAddCustomerModal = showAddCustomerModal;

// Show Edit Customer Modal
async function showEditCustomerModal(customer) {
    currentCustomerId = customer.id;
    document.getElementById('modalTitle').textContent = 'Edit Party';
    populateCustomerTypeSelect();
    await initializeCustomerStaticFields();
    
    // Populate form
    document.getElementById('customerName').value = customer.name;
    document.getElementById('customerEmail').value = customer.email || '';
    document.getElementById('customerPhone').value = customer.phone || '';
    document.getElementById('customerCompany').value = customer.company || '';
    const customerGroup = getCustomerGroup(customer);
    if (customerGroup && !customerGroups.includes(customerGroup)) {
        customerGroups = normalizeCustomerGroups([...customerGroups, customerGroup]);
        saveCustomerGroups();
        populateTypeFilter();
        populateCustomerTypeSelect();
    }
    document.getElementById('customerType').value = customerGroup || '';
    document.getElementById('customerStatus').value = customer.status || 'Active';
    document.getElementById('customerNotes').value = customer.notes || '';
    document.getElementById('customerTaxId').value = customer.taxId || '';
    document.getElementById('customerGstType').value = customer.gstType || (customer.taxId ? 'Registered Business - Regular' : 'Unregistered/Consumer');
    document.getElementById('customerGstState').value = customer.gstState || customer.state || '';
    document.getElementById('customerOpeningBalance').value = Number(customer.openingBalance || 0) || '';
    document.getElementById('customerOpeningBalanceType').value = customer.openingBalanceType || 'to_receive';
    document.getElementById('customerOpeningBalanceDate').value = customer.openingBalanceDate || '';
    syncGstControls();

    const billWrap = document.getElementById('customerBillingAddressesContainer');
    const shipWrap = document.getElementById('customerShippingAddressesContainer');
    if (billWrap) billWrap.innerHTML = '';
    if (shipWrap) shipWrap.innerHTML = '';

    const billToList = Array.isArray(customer.billToAddresses) && customer.billToAddresses.length
        ? customer.billToAddresses
        : [{ label: 'Billing', address: customer.address || '', isDefault: true }];
    const shipToList = Array.isArray(customer.shipToAddresses) && customer.shipToAddresses.length
        ? customer.shipToAddresses
        : [{ label: 'Shipping', address: '', isDefault: true }];

    billToList.forEach(addr => addAddressEntry('bill', addr));
    shipToList.forEach(addr => addAddressEntry('ship', addr));

    customerServices = Array.isArray(customer.services) ? [...customer.services] : [];
    renderServicesList();
    setCustomerGstinLookupStatus('');
    setCustomerTab('customer-address-tab');
    
    const modal = new bootstrap.Modal(customerModal);
    modal.show();
}

// Save Customer
async function saveCustomer() {
    const user = JSON.parse(localStorage.getItem('user'));
    if (!user) return;
    const businessId = user.businessId || user.uid;
    
    // Validate form
    if (!validateCustomerForm()) return;
    
    // Get form data
    const gstState = document.getElementById('customerGstState').value || '';
    const billToAddresses = collectAddressEntries('bill', gstState);
    const shipToAddresses = collectAddressEntries('ship', gstState);
    const billingAddress = billToAddresses[0]?.address || '';
    const primaryBill = billToAddresses[0] || {};
    const openingBalance = Number(document.getElementById('customerOpeningBalance').value || 0) || 0;
    const openingBalanceType = document.getElementById('customerOpeningBalanceType').value || 'to_receive';
    const openingBalanceDate = document.getElementById('customerOpeningBalanceDate').value || '';
    const customerData = {
        name: document.getElementById('customerName').value,
        email: document.getElementById('customerEmail').value,
        phone: document.getElementById('customerPhone').value,
        company: document.getElementById('customerCompany').value,
        group: document.getElementById('customerType').value,
        type: document.getElementById('customerType').value,
        gstType: document.getElementById('customerGstType').value || 'Unregistered/Consumer',
        gstState,
        billToAddresses,
        shipToAddresses,
        address: primaryBill.address || billingAddress,
        state: primaryBill.state || gstState,
        zip: primaryBill.zip || '',
        village: primaryBill.village || '',
        district: primaryBill.district || '',
        mandal: primaryBill.mandal || '',
        status: document.getElementById('customerStatus').value,
        notes: document.getElementById('customerNotes').value,
        taxId: document.getElementById('customerTaxId').value || '',
        openingBalance,
        openingBalanceType,
        openingBalanceDate,
        updatedAt: new Date()
    };
    
    customerData.services = [...customerServices];
    
    try {
        if (currentCustomerId) {
            // Update existing customer
            await db.collection('users').doc(businessId)
                .collection('customers')
                .doc(currentCustomerId)
                .update(customerData);
            
            showSuccess('Customer updated successfully!');
        } else {
            // Add new customer
            customerData.createdAt = new Date();
            customerData.totalProjects = 0;
            customerData.totalSpent = 0;
            customerData.lastContact = new Date();
            if (openingBalance > 0) {
                customerData.outstandingBalance = openingBalanceType === 'to_pay' ? -openingBalance : openingBalance;
            }
            
            const newDocRef = await db.collection('users').doc(businessId)
                .collection('customers')
                .add(customerData);
            
            window.dispatchEvent(new CustomEvent('customerCreated', {
                detail: { id: newDocRef.id, name: customerData.name }
            }));
            showSuccess('Customer added successfully!');
        }
        
        // Close modal and refresh data
        if (saveAndAddNew) {
            prepareAddCustomerForm();
        } else {
            bootstrap.Modal.getInstance(customerModal).hide();
        }
        await loadCustomers();
        
    } catch (error) {
        console.error('Error saving customer:', error);
        showError('Failed to save customer.');
    } finally {
        saveAndAddNew = false;
    }
}

// View Customer Details
function viewCustomerDetails(customer) {
    if (!customer) {
        showError('Customer details not found.');
        return;
    }
    // Create modal for customer details
    let detailsModal = document.getElementById('customerDetailsModal');
    if (!detailsModal) {
        createCustomerDetailsModal();
        detailsModal = document.getElementById('customerDetailsModal');
    }
    if (!detailsModal) {
        showError('Unable to open customer details.');
        return;
    }
    
    // Populate customer details
    document.getElementById('detailName').textContent = customer.name;
    document.getElementById('detailEmail').textContent = customer.email || 'N/A';
    document.getElementById('detailPhone').textContent = customer.phone || 'N/A';
    document.getElementById('detailCompany').textContent = customer.company || 'N/A';
    document.getElementById('detailGroup').textContent = getCustomerGroup(customer) || 'N/A';
    const primaryBill = (Array.isArray(customer.billToAddresses) && customer.billToAddresses.length)
        ? customer.billToAddresses[0]
        : {
            address: customer.address || '',
            village: customer.village || '',
            mandal: customer.mandal || '',
            district: customer.district || '',
            state: customer.state || '',
            zip: customer.zip || ''
        };
    document.getElementById('detailAddress').textContent = primaryBill.address || 'N/A';
    document.getElementById('detailCityStateZip').textContent =
        `${primaryBill.village || ''} ${primaryBill.mandal || ''} ${primaryBill.district || ''} ${primaryBill.state || ''} ${primaryBill.zip || ''}`.trim() || 'N/A';
    document.getElementById('detailStatus').textContent = customer.status || 'N/A';
    document.getElementById('detailNotes').textContent = customer.notes || 'No notes';
    
    // Update stats
    document.getElementById('detailTotalOrders').textContent = customer.totalProjects || 0;
    document.getElementById('detailTotalSpent').textContent = 
        `₹${parseFloat(customer.totalSpent || 0).toLocaleString(undefined, {minimumFractionDigits: 2})}`;
    document.getElementById('detailLastContact').textContent = 
        customer.lastContact ? formatDate(customer.lastContact) : 'Never';
    
    // Show services
    const servicesList = document.getElementById('detailServices');
    if (servicesList) {
        servicesList.innerHTML = '';
        if (customer.services && customer.services.length > 0) {
            customer.services.forEach(service => {
                const badge = document.createElement('span');
                badge.className = 'badge bg-info me-1 mb-1';
                badge.textContent = service;
                servicesList.appendChild(badge);
            });
        } else {
            servicesList.textContent = 'No services specified';
        }
    }
    
    const modal = bootstrap.Modal.getOrCreateInstance(detailsModal);
    modal.show();
}

// Create Customer Details Modal
function createCustomerDetailsModal() {
    const modalHTML = `
        <div class="modal fade" id="customerDetailsModal" tabindex="-1">
            <div class="modal-dialog modal-lg">
                <div class="modal-content">
                    <div class="modal-header bg-primary text-white">
                        <h5 class="modal-title">Customer Details</h5>
                        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <div class="row">
                            <div class="col-md-8">
                                <h4 id="detailName" class="mb-3"></h4>
                                <div class="row mb-3">
                                    <div class="col-md-6">
                                        <h6>Contact Information</h6>
                                        <p><i class="fas fa-envelope me-2 text-muted"></i>Email: <span id="detailEmail"></span></p>
                                        <p><i class="fas fa-phone me-2 text-muted"></i>Phone: <span id="detailPhone"></span></p>
                                        <p><i class="fas fa-building me-2 text-muted"></i>Company: <span id="detailCompany"></span></p>
                                    </div>
                                    <div class="col-md-6">
                                        <h6>Address</h6>
                                        <p id="detailAddress"></p>
                                        <p id="detailCityStateZip"></p>
                                    </div>
                                </div>
                                
                                <div class="row mb-3">
                                    <div class="col-md-6">
                                        <h6>Group</h6>
                                        <p><span class="badge bg-primary" id="detailGroup"></span></p>
                                    </div>
                                    <div class="col-md-6">
                                        <h6>Status</h6>
                                        <p><span class="badge bg-success" id="detailStatus"></span></p>
                                    </div>
                                </div>
                                
                                <div class="mb-3">
                                    <h6>Services Used</h6>
                                    <div id="detailServices"></div>
                                </div>
                                
                                <div class="mb-3">
                                    <h6>Notes</h6>
                                    <div class="card">
                                        <div class="card-body">
                                            <p id="detailNotes" class="mb-0"></p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            
                            <div class="col-md-4">
                                <div class="card">
                                    <div class="card-body">
                                        <h6 class="card-title">Customer Stats</h6>
                                        <div class="text-center mb-4">
                                            <div class="avatar-circle-lg bg-primary mx-auto mb-3">
                                                <span id="detailInitials"></span>
                                            </div>
                                        </div>
                                        <div class="stats-grid">
                                            <div class="stat-item">
                                                <div class="stat-value" id="detailTotalOrders">0</div>
                                                <div class="stat-label">Orders</div>
                                            </div>
                                            <div class="stat-item">
                                                <div class="stat-value" id="detailTotalSpent">₹0</div>
                                                <div class="stat-label">Total Spent</div>
                                            </div>
                                        </div>
                                        <hr>
                                        <p><i class="fas fa-calendar me-2"></i>Last Contact: <span id="detailLastContact"></span></p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
                        <button type="button" class="btn btn-primary" id="editFromDetails">Edit Customer</button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHTML);
}

// Delete Customer
async function deleteCustomer(customerId) {
    const confirmed = await window.showConfirmAsync('Delete Party', 'Are you sure you want to delete this customer? This action cannot be undone.', {
        confirmText: 'Delete',
        cancelText: 'Cancel'
    });
    if (!confirmed) {
        return;
    }
    
    const user = JSON.parse(localStorage.getItem('user'));
    if (!user) return;
    const businessId = user.businessId || user.uid;
    const customer = customersData.find(c => c.id === customerId);
    const customerName = customer?.name || '';
    
    try {
        // Check if customer has associated Orders
        const ordersSnapshot = customerName ? await db.collection('users').doc(businessId)
            .collection('orders')
            .where('customerName', '==', customerName)
            .get() : { empty: true };
        
        if (!ordersSnapshot.empty) {
            const linkedConfirmed = await window.showConfirmAsync('Linked Orders Found', 'This customer has associated orders. Do you want to continue deleting?', {
                confirmText: 'Delete Anyway',
                cancelText: 'Cancel'
            });
            if (!linkedConfirmed) {
                return;
            }
        }
        
        await db.collection('users').doc(businessId)
            .collection('customers')
            .doc(customerId)
            .delete();
        
        showSuccess('Customer deleted successfully!');
        await loadCustomers();
        
    } catch (error) {
        console.error('Error deleting customer:', error);
        showError('Failed to delete customer.');
    }
}

// Add Project for Customer
function addOrderForCustomer(customer) {
    // Store customer info in session storage for project creation
    sessionStorage.setItem('selectedCustomer', JSON.stringify({
        id: customer.id,
        name: customer.name,
        email: customer.email,
        phone: customer.phone,
        company: customer.company
    }));
    
    // Navigate to Orders section
    sessionStorage.setItem('openOrderModal', 'true');
    if (window.navigateToSection) {
        window.navigateToSection('projects');
    }
}

// Record Advance Payment
window.recordAdvancePayment = (customer) => {
    document.getElementById('advCustomerId').value = customer.id;
    document.getElementById('advCustomerName').value = customer.name;
    document.getElementById('advDate').valueAsDate = new Date();
    document.getElementById('advAmount').value = '';
    document.getElementById('advRef').value = '';
    document.getElementById('advNotes').value = '';
    new bootstrap.Modal(advancePaymentModal).show();
};

async function saveAdvancePayment() {
    const user = JSON.parse(localStorage.getItem('user'));
    const businessId = user.businessId || user.uid;
    
    const customerId = document.getElementById('advCustomerId').value;
    const customerName = document.getElementById('advCustomerName').value;
    const amount = parseFloat(document.getElementById('advAmount').value);
    const date = document.getElementById('advDate').value;
    const mode = document.getElementById('advMode').value;
    const ref = document.getElementById('advRef').value;
    const notes = document.getElementById('advNotes').value;

    if (!amount || amount <= 0 || !date) return alert("Invalid amount or date");

    try {
        // 1. Create Transaction
        await db.collection('users').doc(businessId).collection('transactions').add({
            type: 'Payment',
            description: notes || 'Advance Payment',
            customer: customerName,
            amount: amount,
            date: new Date(date),
            mode: mode,
            reference: ref,
            status: 'Paid'
        });

        // 2. Update Customer Balance
        const customerRef = db.collection('users').doc(businessId).collection('customers').doc(customerId);
        await db.runTransaction(async (transaction) => {
            const doc = await transaction.get(customerRef);
            if (!doc.exists) throw "Customer not found";
            
            const currentBal = doc.data().outstandingBalance || 0;
            transaction.update(customerRef, {
                outstandingBalance: currentBal - amount,
                lastContact: new Date()
            });
        });

        bootstrap.Modal.getInstance(advancePaymentModal).hide();
        showSuccess('Advance payment recorded successfully!');
        loadCustomers();
    } catch (e) {
        console.error(e);
        showError('Failed to record payment');
    }
}

// --- Customer Ledger Logic ---
let currentLedgerCustomer = null;

window.viewCustomerLedger = (customer) => {
    currentLedgerCustomer = customer;
    const modal = new bootstrap.Modal(document.getElementById('customerLedgerModal'));
    document.getElementById('ledgerCustomerName').textContent = customer.name;
    
    // Set default dates (Current Month)
    const date = new Date();
    const firstDay = new Date(date.getFullYear(), date.getMonth(), 1);
    const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0);
    
    // Adjust for timezone offset to ensure input type="date" gets correct YYYY-MM-DD
    const toISODate = (d) => {
        const offset = d.getTimezoneOffset() * 60000;
        return new Date(d.getTime() - offset).toISOString().split('T')[0];
    };

    document.getElementById('ledgerStartDate').value = toISODate(firstDay);
    document.getElementById('ledgerEndDate').value = toISODate(lastDay);
    
    modal.show();
    loadLedgerData();
};

async function loadLedgerData() {
    if (!currentLedgerCustomer) return;
    
    const user = JSON.parse(localStorage.getItem('user'));
    const businessId = user.businessId || user.uid;
    const startDate = new Date(document.getElementById('ledgerStartDate').value);
    const endDate = new Date(document.getElementById('ledgerEndDate').value);
    endDate.setHours(23, 59, 59); // End of day

    const tbody = document.querySelector('#ledgerTable tbody');
    tbody.innerHTML = '<tr><td colspan="6" class="text-center">Loading...</td></tr>';

    try {
        // Fetch all transactions for this customer
        // Note: For scalability, we should index 'date' and 'customer' together, but for now we filter in memory
        const snapshot = await db.collection('users').doc(businessId).collection('transactions')
            .where('customer', '==', currentLedgerCustomer.name)
            .orderBy('date', 'asc')
            .get();

        let balance = 0;
        let totalDebit = 0;
        let totalCredit = 0;
        let rows = '';
        
        const allTrans = [];
        snapshot.forEach(doc => {
            allTrans.push({ id: doc.id, ...doc.data() });
        });

        // Calculate Opening Balance (Transactions before start date)
        let openingBalance = 0;
        
        allTrans.forEach(t => {
            const tDate = t.date.toDate();
            const isDebit = t.type === 'Invoice'; // Invoice = Debit (Receivable)
            const amount = t.amount || 0;
            
            if (tDate < startDate) {
                if (isDebit) openingBalance += amount;
                else openingBalance -= amount;
            }
        });

        balance = openingBalance;
        
        // Add Opening Balance Row
        rows += `
            <tr class="table-secondary">
                <td>${formatDate(startDate)}</td>
                <td colspan="4"><strong>Opening Balance</strong></td>
                <td class="text-end fw-bold">₹${balance.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
            </tr>
        `;

        // Process transactions within range
        allTrans.forEach(t => {
            const tDate = t.date.toDate();
            if (tDate >= startDate && tDate <= endDate) {
                const isDebit = t.type === 'Invoice';
                const debit = isDebit ? t.amount : 0;
                const credit = !isDebit ? t.amount : 0; // Payment = Credit
                
                balance += (debit - credit);
                totalDebit += debit;
                totalCredit += credit;
                
                let ref = '-';
                if (t.type === 'Invoice') ref = `#${t.id.substr(0,6).toUpperCase()}`;
                if (t.type === 'Payment') ref = t.reference || t.mode || '-';

                rows += `
                    <tr>
                        <td>${formatDate(t.date)}</td>
                        <td>${t.description || t.type}</td>
                        <td>${ref}</td>
                        <td class="text-end text-danger">${debit > 0 ? '₹'+debit.toLocaleString() : '-'}</td>
                        <td class="text-end text-success">${credit > 0 ? '₹'+credit.toLocaleString() : '-'}</td>
                        <td class="text-end fw-bold">₹${balance.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                    </tr>
                `;
            }
        });

        tbody.innerHTML = rows;
        document.getElementById('ledgerTotalDebit').textContent = `₹${totalDebit.toLocaleString()}`;
        document.getElementById('ledgerTotalCredit').textContent = `₹${totalCredit.toLocaleString()}`;
        document.getElementById('ledgerFinalBalance').textContent = `₹${balance.toLocaleString()}`;

    } catch (e) {
        console.error(e);
        tbody.innerHTML = '<tr><td colspan="6" class="text-center text-danger">Error loading ledger</td></tr>';
    }
}

window.printLedger = () => {
    const customerName = document.getElementById('ledgerCustomerName').textContent;
    const startDate = document.getElementById('ledgerStartDate').value;
    const endDate = document.getElementById('ledgerEndDate').value;
    const tableContent = document.getElementById('ledgerTable').outerHTML;
    
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`<html><head><title>Ledger - ${customerName}</title><link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet"><style>body{padding:20px;} table{font-size:12px;} @media print{.no-print{display:none;}}</style></head><body><h3 class="text-center mb-4">Customer Statement</h3><h5 class="mb-3">Customer: ${customerName}</h5><p>Period: ${startDate} to ${endDate}</p>${tableContent}<script>window.print();</script></body></html>`);
    printWindow.document.close();
};

// Filter Customers
function applyCustomerFilters() {
    const searchTerm = (searchCustomers?.value || '').toLowerCase();
    const selectedGroup = filterType?.value || 'all';
    const statusFilter = filterCustomerStatus?.value || 'all';
    const rows = customersTable.querySelectorAll('tbody tr');
    
    rows.forEach(row => {
        const text = row.textContent.toLowerCase();
        if (searchTerm && !text.includes(searchTerm)) {
            row.style.display = 'none';
            return;
        }
        if (selectedGroup !== 'all') {
            const groupCell = row.querySelector('td:nth-child(4)');
            const group = groupCell ? groupCell.textContent.trim() : '';
            if (group !== selectedGroup) {
                row.style.display = 'none';
                return;
            }
        }
        if (statusFilter !== 'all') {
            const statusCell = row.querySelector('td:nth-child(7)');
            const status = statusCell ? statusCell.textContent.trim() : '';
            if (status !== statusFilter) {
                row.style.display = 'none';
                return;
            }
        }
        row.style.display = '';
    });
}

// Import Customers (CSV)
async function importCustomers() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv,.xlsx,.xls';
    
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        try {
            showLoading('Importing customers...');
            const data = await readCSVFile(file);
            await processImportedData(data);
            showSuccess(`${data.length} customers imported successfully!`);
            await loadCustomers();
        } catch (error) {
            console.error('Error importing customers:', error);
            showError('Failed to import customers. Please check the file format.');
        } finally {
            hideLoading();
        }
    };
    
    input.click();
}

// Read CSV File
function readCSVFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        
        reader.onload = (e) => {
            const text = e.target.result;
            const lines = text.split('\n');
            const headers = lines[0].split(',').map(h => h.trim());
            
            const data = lines.slice(1).map(line => {
                const values = line.split(',').map(v => v.trim());
                const obj = {};
                headers.forEach((header, index) => {
                    obj[header] = values[index] || '';
                });
                return obj;
            }).filter(obj => obj.name); // Filter out empty rows
            
            resolve(data);
        };
        
        reader.onerror = reject;
        reader.readAsText(file);
    });
}

// Process Imported Data
async function processImportedData(data) {
    const user = JSON.parse(localStorage.getItem('user'));
    if (!user) return;
    const businessId = user.businessId || user.uid;
    
    const batch = db.batch();
    const customerRef = db.collection('users').doc(businessId).collection('customers');
    
    for (const item of data) {
        const importedGroup = (item.group || item.type || '').trim();
        const importedAddress = (item.address || item.billingAddress || '').trim();
        const importedShipAddress = (item.shippingAddress || '').trim();
        const importedState = (item.state || item.gstState || '').trim();
        const billToAddresses = importedAddress ? [{
            label: 'Billing',
            address: importedAddress,
            state: importedState,
            district: '',
            mandal: '',
            village: '',
            zip: (item.zip || '').trim(),
            isDefault: true
        }] : [];
        const shipToAddresses = importedShipAddress ? [{
            label: 'Shipping',
            address: importedShipAddress,
            state: importedState,
            district: '',
            mandal: '',
            village: '',
            zip: (item.zip || '').trim(),
            isDefault: true
        }] : [];
        const newCustomer = {
            name: item.name || '',
            email: item.email || '',
            phone: item.phone || '',
            company: item.company || '',
            group: importedGroup,
            type: importedGroup,
            address: importedAddress,
            city: item.city || '',
            state: importedState,
            zip: item.zip || '',
            billToAddresses,
            shipToAddresses,
            status: item.status || 'Active',
            notes: item.notes || '',
            totalProjects: parseInt(item.totalProjects) || 0,
            totalSpent: parseFloat(item.totalSpent) || 0,
            createdAt: new Date(),
            updatedAt: new Date(),
            lastContact: new Date()
        };
        
        const docRef = customerRef.doc();
        batch.set(docRef, newCustomer);
    }
    
    await batch.commit();
}

function getCustomersExportRows() {
    return customersData.map(customer => ([
        customer.name || '',
        customer.email || '',
        customer.phone || '',
        customer.company || '',
        getCustomerGroup(customer) || '',
        customer.status || '',
        customer.totalProjects || 0,
        customer.totalSpent || 0
    ]));
}

function exportCustomersCSV() {
    if (!customersData.length) {
        showError('No customers to export.');
        return;
    }

    const headers = ['Name', 'Email', 'Phone', 'Company', 'Group', 'Status', 'Total Orders', 'Total Spent'];
    const rows = getCustomersExportRows();
    const filename = `customers_${new Date().toISOString().split('T')[0]}.csv`;
    downloadCSV(filename, headers, rows);
}

function exportCustomersPDF() {
    if (!customersData.length) {
        showError('No customers to export.');
        return;
    }

    const headers = ['Name', 'Email', 'Phone', 'Company', 'Group', 'Status', 'Total Orders', 'Total Spent'];
    const rows = getCustomersExportRows();
    const filename = `customers_${new Date().toISOString().split('T')[0]}.pdf`;
    downloadPDF(filename, 'Customers Report', headers, rows);
}

// Validate Customer Form
function validateCustomerForm() {
    const name = document.getElementById('customerName').value;
    const email = document.getElementById('customerEmail').value;
    const phone = document.getElementById('customerPhone').value;
    const customerGroup = (document.getElementById('customerType')?.value || '').trim();
    const gstState = document.getElementById('customerGstState')?.value || '';
    const billingAddresses = collectAddressEntries('bill', gstState);
    const gstType = document.getElementById('customerGstType')?.value || 'Unregistered/Consumer';
    const taxId = (document.getElementById('customerTaxId')?.value || '').trim();
    
    if (!name.trim()) {
        showError('Customer name is required.');
        return false;
    }
    
    if (email && !isValidEmail(email)) {
        showError('Please enter a valid email address.');
        return false;
    }
    
    if (phone && !isValidPhone(phone)) {
        showError('Please enter a valid phone number.');
        return false;
    }

    if (!customerGroup) {
        showError('Select a party group or add a new one.');
        return false;
    }

    if (!billingAddresses.length) {
        showError('At least one billing address is required.');
        setCustomerTab('customer-address-tab');
        return false;
    }

    if (gstType !== 'Unregistered/Consumer' && !gstState) {
        showError('Select GST state for registered customer.');
        setCustomerTab('customer-gst-tab');
        return false;
    }

    if (gstType !== 'Unregistered/Consumer' && !taxId) {
        showError('GSTIN is required for registered customer.');
        setCustomerTab('customer-gst-tab');
        return false;
    }

    return true;
}

// Email validation
function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

// Phone validation (basic)
function isValidPhone(phone) {
    const phoneRegex = /^[\+]?[1-9][\d]{0,15}$/;
    return phoneRegex.test(phone.replace(/\D/g, ''));
}

// Reset Customer Form
function resetCustomerForm() {
    currentCustomerId = null;
    saveAndAddNew = false;
    customerForm.reset();
    customerServices = [];
    renderServicesList();
    const billWrap = document.getElementById('customerBillingAddressesContainer');
    const shipWrap = document.getElementById('customerShippingAddressesContainer');
    if (billWrap) billWrap.innerHTML = '';
    if (shipWrap) shipWrap.innerHTML = '';
    setCustomerGstinLookupStatus('');
    setCustomerTab('customer-address-tab');
}

// Initialize DataTable
function initializeDataTable() {
    if ($.fn.DataTable && customersTable && !$.fn.DataTable.isDataTable(customersTable)) {
        // Safety check: Do not initialize if there are colspan rows (e.g. "No customers found")
        if ($(customersTable).find('tbody tr td[colspan]').length > 0) return;

        $(customersTable).DataTable({
            pageLength: 10,
            responsive: true,
            order: [[0, 'asc']],
            language: {
                search: "_INPUT_",
                searchPlaceholder: "Search customers..."
            }
        });
    }
}

// Show Loading
function showLoading(message = 'Loading...') {
    let loadingDiv = document.getElementById('loadingOverlay');
    
    if (!loadingDiv) {
        loadingDiv = document.createElement('div');
        loadingDiv.id = 'loadingOverlay';
        loadingDiv.className = 'loading-overlay';
        loadingDiv.innerHTML = `
            <div class="loading-content">
                <div class="spinner-border text-primary" role="status"></div>
                <p class="mt-3">${message}</p>
            </div>
        `;
        document.body.appendChild(loadingDiv);
    }
    
    loadingDiv.style.display = 'flex';
}

// Hide Loading
function hideLoading() {
    const loadingDiv = document.getElementById('loadingOverlay');
    if (loadingDiv) {
        loadingDiv.style.display = 'none';
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

// Export functions
export { loadCustomers, showAddCustomerModal, viewCustomerDetails };

