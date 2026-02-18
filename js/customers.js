import { db } from './firebase-config.js';
import { checkAuth, formatDate, downloadCSV, downloadPDF, fetchPostOfficeByPincode } from './dashboard.js';
import { initializeStateDistrictPair, setStateDistrictValues } from './location-data.js';

// DOM Elements
const customersTable = document.getElementById('customersTable');
const addCustomerBtn = document.getElementById('addCustomerBtn');
const customerModal = document.getElementById('customerModal');
const customerForm = document.getElementById('customerForm');
const saveCustomerBtn = document.getElementById('saveCustomerBtn');
const searchCustomers = document.getElementById('searchCustomers');
const filterType = document.getElementById('filterType');
const filterCustomerStatus = document.getElementById('filterCustomerStatus');
const importCustomersBtn = document.getElementById('importCustomersBtn');
const exportCustomersPdfBtn = document.getElementById('exportCustomersPdfBtn');
const exportCustomersCsvBtn = document.getElementById('exportCustomersCsvBtn');
const advancePaymentModal = document.getElementById('advancePaymentModal');
const saveAdvancePaymentBtn = document.getElementById('saveAdvancePaymentBtn');
const filterLedgerBtn = document.getElementById('filterLedgerBtn');

// Variables
let currentCustomerId = null;
let customersData = [];

// Customer Types for Concrete Pipe Manufacturing
const CUSTOMER_TYPES = [
    'Dealer / Stockist',
    'Contractor',
    'Government / Municipality',
    'Infrastructure Company',
    'Real Estate Developer',
    'Construction Firm',
    'Drainage & Sewerage Contractor',
    'Hardware / Building Materials',
    'Industrial',
    'Other'
];

// Services Offered
const SERVICES = [
    'RCC/Hume Pipe Supply',
    'Manhole Rings & Covers',
    'Collars / Joint Rings',
    'Box Culverts',
    'Custom Precast Concrete',
    'Transport & Delivery',
    'Loading / Unloading Support',
    'Quality Certificates / Testing',
    'Other'
];

// Initialize Customers Page
document.addEventListener('DOMContentLoaded', async () => {
    await checkAuth();
    await initCustomerLocationSelectors();
    await loadCustomers();
    setupEventListeners();
    initializeDataTable();
    populateTypeFilter();
});

async function initCustomerLocationSelectors() {
    const stateEl = document.getElementById('customerState');
    const districtEl = document.getElementById('customerDistrict');
    await initializeStateDistrictPair(stateEl, districtEl);
}

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
    const typeBadge = getTypeBadge(customer.type || 'Residential');
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
            <td><span class="badge ${typeBadge}">${customer.type || 'Residential'}</span></td>
            <td>${customer.totalProjects || 0}</td>
            <td>
                <div>₹${parseFloat(customer.totalSpent || 0).toLocaleString(undefined, {minimumFractionDigits: 2})}</div>
                ${balance > 0 ? `<small class="text-danger fw-bold">Due: ₹${balance.toLocaleString()}</small>` : (balance < 0 ? `<small class="text-success fw-bold">Credit: ₹${Math.abs(balance).toLocaleString()}</small>` : '<small class="text-muted">Settled</small>')}
            </td>
            <td><span class="badge ${statusBadge}">${customer.status || 'Active'}</span></td>
            <td>${lastContact}</td>
            <td>
                <div class="btn-group btn-group-sm">
                    <button class="btn btn-outline-primary view-customer" title="View Details">
                        <i class="fas fa-eye"></i>
                    </button>
                    <button class="btn btn-outline-success edit-customer" title="Edit">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn btn-outline-secondary view-ledger" title="View Ledger">
                        <i class="fas fa-book"></i>
                    </button>
                    <button class="btn btn-outline-info add-order" title="Add Order">
                        <i class="fas fa-cart-plus"></i>
                    </button>
                    <button class="btn btn-outline-warning record-advance" title="Record Advance Payment">
                        <i class="fas fa-money-bill-wave"></i>
                    </button>
                    <button class="btn btn-outline-danger delete-customer" title="Delete">
                        <i class="fas fa-trash"></i>
                    </button>
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

// Get Type Badge Class
function getTypeBadge(type) {
    const badgeMap = {
        'Residential': 'bg-primary',
        'Commercial': 'bg-success',
        'Industrial': 'bg-info',
        'Contractor': 'bg-warning',
        'Government': 'bg-danger',
        'Real Estate Developer': 'bg-primary',
        'Maintenance Company': 'bg-success',
        'Plumbing Service': 'bg-info',
        'Construction Firm': 'bg-warning',
        'Other': 'bg-secondary'
    };
    return badgeMap[type] || 'bg-secondary';
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
        saveCustomerBtn.addEventListener('click', saveCustomer);
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

    const customerZip = document.getElementById('customerZip');
    if (customerZip) {
        customerZip.addEventListener('blur', () => fillCustomerAddressFromPincode());
    }
    
    // Modal Close
    if (customerModal) {
        customerModal.addEventListener('hidden.bs.modal', () => {
            resetCustomerForm();
        });
    }
    
    // Edit, Delete, View buttons (event delegation)
    document.addEventListener('click', (e) => {
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
    
    filterType.innerHTML = '<option value="all">All Types</option>';
    CUSTOMER_TYPES.forEach(type => {
        filterType.innerHTML += `<option value="${type}">${type}</option>`;
    });
}

// Show Add Customer Modal
function showAddCustomerModal() {
    currentCustomerId = null;
    document.getElementById('modalTitle').textContent = 'Add New Customer';
    customerForm.reset();
    setStateDistrictValues(
        document.getElementById('customerState'),
        document.getElementById('customerDistrict'),
        '',
        ''
    );
    
    // Populate type dropdown
    const typeSelect = document.getElementById('customerType');
    if (typeSelect) {
        typeSelect.innerHTML = CUSTOMER_TYPES.map(type => 
            `<option value="${type}">${type}</option>`
        ).join('');
    }
    
    // Populate services dropdown
    const servicesSelect = document.getElementById('services');
    if (servicesSelect) {
        servicesSelect.innerHTML = SERVICES.map(service => 
            `<option value="${service}">${service}</option>`
        ).join('');
    }
    
    // Set default values
    document.getElementById('customerStatus').value = 'Active';
    document.getElementById('customerType').value = 'Residential';
    
    const modal = new bootstrap.Modal(customerModal);
    modal.show();
}

window.showAddCustomerModal = showAddCustomerModal;

// Show Edit Customer Modal
async function showEditCustomerModal(customer) {
    currentCustomerId = customer.id;
    document.getElementById('modalTitle').textContent = 'Edit Customer';
    
    // Populate form
    document.getElementById('customerName').value = customer.name;
    document.getElementById('customerEmail').value = customer.email || '';
    document.getElementById('customerPhone').value = customer.phone || '';
    document.getElementById('customerCompany').value = customer.company || '';
    document.getElementById('customerType').value = customer.type || 'Residential';
    document.getElementById('customerAddress').value = customer.address || '';
    document.getElementById('customerZip').value = customer.zip || '';
    if (document.getElementById('customerVillage')) {
        const el = document.getElementById('customerVillage');
        if (customer.village) {
            el.innerHTML = `<option value="">Select Village</option><option value="${customer.village}">${customer.village}</option>`;
        }
        el.value = customer.village || '';
    }
    await setStateDistrictValues(
        document.getElementById('customerState'),
        document.getElementById('customerDistrict'),
        customer.state || '',
        customer.district || ''
    );
    if (document.getElementById('customerMandal')) {
        const el = document.getElementById('customerMandal');
        if (customer.mandal) {
            el.innerHTML = `<option value="">Select Mandal</option><option value="${customer.mandal}">${customer.mandal}</option>`;
        }
        el.value = customer.mandal || '';
    }
    document.getElementById('customerStatus').value = customer.status || 'Active';
    document.getElementById('customerNotes').value = customer.notes || '';
    
    // Set selected services
    if (customer.services && Array.isArray(customer.services)) {
        const servicesSelect = document.getElementById('services');
        customer.services.forEach(service => {
            const option = Array.from(servicesSelect.options).find(opt => opt.value === service);
            if (option) option.selected = true;
        });
    }
    
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
    const customerData = {
        name: document.getElementById('customerName').value,
        email: document.getElementById('customerEmail').value,
        phone: document.getElementById('customerPhone').value,
        company: document.getElementById('customerCompany').value,
        type: document.getElementById('customerType').value,
        address: document.getElementById('customerAddress').value,
        state: document.getElementById('customerState').value,
        zip: document.getElementById('customerZip').value,
        village: document.getElementById('customerVillage')?.value || '',
        district: document.getElementById('customerDistrict')?.value || '',
        mandal: document.getElementById('customerMandal')?.value || '',
        status: document.getElementById('customerStatus').value,
        notes: document.getElementById('customerNotes').value,
        updatedAt: new Date()
    };
    
    // Get selected services
    const servicesSelect = document.getElementById('services');
    if (servicesSelect) {
        customerData.services = Array.from(servicesSelect.selectedOptions).map(option => option.value);
    }
    
    // Add tax info for business customers
    if (customerData.type !== 'Residential') {
        customerData.taxId = document.getElementById('customerTaxId').value || '';
    }
    
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
            
            const newDocRef = await db.collection('users').doc(businessId)
                .collection('customers')
                .add(customerData);
            
            window.dispatchEvent(new CustomEvent('customerCreated', {
                detail: { id: newDocRef.id, name: customerData.name }
            }));
            showSuccess('Customer added successfully!');
        }
        
        // Close modal and refresh data
        bootstrap.Modal.getInstance(customerModal).hide();
        await loadCustomers();
        
    } catch (error) {
        console.error('Error saving customer:', error);
        showError('Failed to save customer.');
    }
}

// View Customer Details
function viewCustomerDetails(customer) {
    // Create modal for customer details
    const detailsModal = document.getElementById('customerDetailsModal');
    if (!detailsModal) {
        createCustomerDetailsModal();
    }
    
    // Populate customer details
    document.getElementById('detailName').textContent = customer.name;
    document.getElementById('detailEmail').textContent = customer.email || 'N/A';
    document.getElementById('detailPhone').textContent = customer.phone || 'N/A';
    document.getElementById('detailCompany').textContent = customer.company || 'N/A';
    document.getElementById('detailType').textContent = customer.type || 'N/A';
    document.getElementById('detailAddress').textContent = customer.address || 'N/A';
    document.getElementById('detailCityStateZip').textContent = 
        `${customer.village || ''} ${customer.mandal || ''} ${customer.district || ''} ${customer.state || ''} ${customer.zip || ''}`.trim() || 'N/A';
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
    
    const modal = new bootstrap.Modal(detailsModal);
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
                                        <h6>Customer Type</h6>
                                        <p><span class="badge bg-primary" id="detailType"></span></p>
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
    if (!confirm('Are you sure you want to delete this customer? This action cannot be undone.')) {
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
            if (!confirm('This customer has associated Orders. Do you want to continue deleting?')) {
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

async function fillCustomerAddressFromPincode() {
    const zipEl = document.getElementById('customerZip');
    const villageEl = document.getElementById('customerVillage');
    const districtEl = document.getElementById('customerDistrict');
    const stateEl = document.getElementById('customerState');
    const mandalEl = document.getElementById('customerMandal');
    if (!zipEl) return;
    const pin = (zipEl.value || '').trim();
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
    const selectedType = filterType?.value || 'all';
    const statusFilter = filterCustomerStatus?.value || 'all';
    const rows = customersTable.querySelectorAll('tbody tr');
    
    rows.forEach(row => {
        const text = row.textContent.toLowerCase();
        if (searchTerm && !text.includes(searchTerm)) {
            row.style.display = 'none';
            return;
        }
        if (selectedType !== 'all') {
            const typeCell = row.querySelector('td:nth-child(4)');
            const type = typeCell ? typeCell.textContent.trim() : '';
            if (type !== selectedType) {
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
        const newCustomer = {
            name: item.name || '',
            email: item.email || '',
            phone: item.phone || '',
            company: item.company || '',
            type: item.type || 'Residential',
            address: item.address || '',
            city: item.city || '',
            state: item.state || '',
            zip: item.zip || '',
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
        customer.type || '',
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

    const headers = ['Name', 'Email', 'Phone', 'Company', 'Type', 'Status', 'Total Orders', 'Total Spent'];
    const rows = getCustomersExportRows();
    const filename = `customers_${new Date().toISOString().split('T')[0]}.csv`;
    downloadCSV(filename, headers, rows);
}

function exportCustomersPDF() {
    if (!customersData.length) {
        showError('No customers to export.');
        return;
    }

    const headers = ['Name', 'Email', 'Phone', 'Company', 'Type', 'Status', 'Total Orders', 'Total Spent'];
    const rows = getCustomersExportRows();
    const filename = `customers_${new Date().toISOString().split('T')[0]}.pdf`;
    downloadPDF(filename, 'Customers Report', headers, rows);
}

// Validate Customer Form
function validateCustomerForm() {
    const name = document.getElementById('customerName').value;
    const email = document.getElementById('customerEmail').value;
    const phone = document.getElementById('customerPhone').value;
    
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
    customerForm.reset();
    const stateEl = document.getElementById('customerState');
    const districtEl = document.getElementById('customerDistrict');
    setStateDistrictValues(stateEl, districtEl, '', '');
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

