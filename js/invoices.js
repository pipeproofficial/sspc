import { db, remoteConfig } from './firebase-config.js';
import { checkAuth, formatDate, downloadCSV, downloadPDF, fetchPostOfficeByPincode } from './dashboard.js';
import { showAlert } from './auth.js';
import { initializeStateDistrictPair, setStateDistrictValues } from './location-data.js';

const invoicesTable = document.getElementById('invoicesTable');
const createInvoiceBtn = document.getElementById('createInvoiceBtn');
const saveInvoiceBtn = document.getElementById('saveInvoiceBtn');
const invoiceSettingsBtn = document.getElementById('invoiceSettingsBtn');
const saveInvoiceSettingsBtn = document.getElementById('saveInvoiceSettingsBtn');
const invItemsContainer = document.getElementById('invItemsContainer');
const invoicePreviewFrame = document.getElementById('invoicePreviewFrame');
const invoiceCopySummary = document.getElementById('invoiceCopySummary');
const invoiceCopyAll = document.getElementById('invoiceCopyAll');
const invoiceCopyOriginal = document.getElementById('invoiceCopyOriginal');
const invoiceCopyDuplicate = document.getElementById('invoiceCopyDuplicate');
const invoiceCopyTriplicate = document.getElementById('invoiceCopyTriplicate');
const invoiceLayoutSelect = document.getElementById('invoiceLayoutSelect');
const printInvoicePreviewBtn = document.getElementById('printInvoicePreviewBtn');
const invoiceFormContainer = document.getElementById('invoiceFormContainer');
const invoiceTemplateThumbList = document.getElementById('invoiceTemplateThumbList');
const invAddItemBtn = document.getElementById('invAddItemBtn');
const clearSignatureBtn = document.getElementById('clearSignatureBtn');
const paymentHistoryModal = document.getElementById('paymentHistoryModal');
const savePaymentBtn = document.getElementById('savePaymentBtn');
const exportInvoicesPdfBtn = document.getElementById('exportInvoicesPdfBtn');
const exportInvoicesCsvBtn = document.getElementById('exportInvoicesCsvBtn');
const invoiceSearch = document.getElementById('invoiceSearch');
const invoiceStatusFilter = document.getElementById('invoiceStatusFilter');
const invoiceDateFrom = document.getElementById('invoiceDateFrom');
const invoiceDateTo = document.getElementById('invoiceDateTo');
const resetInvoiceFilters = document.getElementById('resetInvoiceFilters');

let inventoryCache = [];
let currentTemplate = 'standard';
let currentPaymentInvoiceId = null;
let invoicesData = [];
let pendingOrderPrefill = null;
let businessSettings = { gstRate: 0, invoicePrefix: '', invoicePad: 4, invoiceNextNumber: null };
let companyCache = null;
let companyCachePromise = null;
let invoiceFormReady = false;

// Premium Invoice Templates with Preview System
const invoiceTemplates = {
    modern: {
        name: "Modern Clean",
        description: "Minimalist design with blue accents and ample whitespace",
        category: "Professional",
        color: "#2563eb",
        preview: `
            <div class="template-preview-modern">
                <div class="preview-header">
                    <div class="preview-logo">LOGO</div>
                    <div class="preview-title">INVOICE</div>
                </div>
                <div class="preview-content">
                    <div class="preview-grid">
                        <div class="preview-from">
                            <div class="label">From</div>
                            <div class="value">Your Company</div>
                        </div>
                        <div class="preview-to">
                            <div class="label">Bill To</div>
                            <div class="value">Client Name</div>
                        </div>
                    </div>
                    <div class="preview-items">
                        <div class="preview-item">
                            <div>RCC Pipe 600mm</div>
                            <div>1</div>
                            <div>₹12,500</div>
                        </div>
                    </div>
                    <div class="preview-total">
                        <div>Total</div>
                        <div>₹12,500</div>
                    </div>
                </div>
            </div>`
    },
    corporate: {
        name: "Corporate Pro",
        description: "Professional dark header with clean layout",
        category: "Business",
        color: "#1e293b",
        preview: `
            <div class="template-preview-corporate">
                <div class="preview-header-dark">
                    <div class="preview-company">YOUR COMPANY</div>
                    <div class="preview-invoice-tag">INVOICE</div>
                </div>
                <div class="preview-content">
                    <div class="preview-client">
                        <div class="label">BILL TO</div>
                        <div class="value">Client Corporation</div>
                    </div>
                    <div class="preview-items-striped">
                        <div class="preview-item">
                            <div>Item</div>
                            <div>Qty</div>
                            <div>Amount</div>
                        </div>
                    </div>
                    <div class="preview-grand-total">
                        <div>GRAND TOTAL</div>
                        <div>₹25,000</div>
                    </div>
                </div>
            </div>`
    },
    elegant: {
        name: "Elegant Serif",
        description: "Classic typography with traditional layout",
        category: "Classic",
        color: "#444",
        preview: `
            <div class="template-preview-elegant">
                <div class="preview-header-elegant">
                    <div class="preview-company-name">Your Company Name</div>
                    <div class="preview-invoice-no">INVOICE #001</div>
                </div>
                <div class="preview-content">
                    <div class="preview-elegant-grid">
                        <div class="preview-from-elegant">
                            <div>Invoiced To:</div>
                            <div class="client-name">Client Name</div>
                        </div>
                        <div class="preview-date-elegant">
                            <div>Date:</div>
                            <div>${new Date().toLocaleDateString()}</div>
                        </div>
                    </div>
                    <div class="preview-table-elegant">
                        <div class="preview-table-header">
                            <div>Description</div>
                            <div>Amount</div>
                        </div>
                        <div class="preview-table-row">
                            <div>Professional Services</div>
                            <div>₹15,000</div>
                        </div>
                    </div>
                    <div class="preview-total-elegant">
                        <div>Total Due:</div>
                        <div>₹15,000</div>
                    </div>
                </div>
            </div>`
    },
    bold: {
        name: "Bold Impact",
        description: "High contrast design with strong visual hierarchy",
        category: "Modern",
        color: "#000000",
        preview: `
            <div class="template-preview-bold">
                <div class="preview-header-bold">
                    <div class="preview-brand">YOUR BRAND</div>
                    <div class="preview-invoice-bold">INVOICE</div>
                </div>
                <div class="preview-content-bold">
                    <div class="preview-client-box">
                        <div class="label-bold">BILL TO</div>
                        <div class="client-bold">CLIENT NAME</div>
                    </div>
                    <div class="preview-items-bold">
                        <div class="preview-item-bold">
                            <div>Item Description</div>
                            <div>₹10,000</div>
                        </div>
                    </div>
                    <div class="preview-total-bold">
                        <div>TOTAL</div>
                        <div>₹10,000</div>
                    </div>
                </div>
            </div>`
    },
    minimal: {
        name: "Minimal",
        description: "Ultra-clean design with focus on content",
        category: "Modern",
        color: "#6b7280",
        preview: `
            <div class="template-preview-minimal">
                <div class="preview-header-minimal">
                    <div class="preview-minimal-title">Invoice</div>
                    <div class="preview-minimal-number">#2024001</div>
                </div>
                <div class="preview-content-minimal">
                    <div class="preview-minimal-info">
                        <div>
                            <div class="label-minimal">From</div>
                            <div>Your Business</div>
                        </div>
                        <div>
                            <div class="label-minimal">To</div>
                            <div>Client</div>
                        </div>
                    </div>
                    <div class="preview-items-minimal">
                        <div class="preview-item-minimal">
                            <div>Service</div>
                            <div>₹8,500</div>
                        </div>
                    </div>
                    <div class="preview-total-minimal">
                        <div>Total</div>
                        <div>₹8,500</div>
                    </div>
                </div>
            </div>`
    },
    luxury: {
        name: "Luxury Gold",
        description: "Premium design with gold accents",
        category: "Premium",
        color: "#b8860b",
        preview: `
            <div class="template-preview-luxury">
                <div class="preview-header-luxury">
                    <div class="preview-luxury-logo">PREMIUM</div>
                    <div class="preview-luxury-title">INVOICE</div>
                </div>
                <div class="preview-content-luxury">
                    <div class="preview-luxury-client">
                        <div class="label-luxury">CLIENT</div>
                        <div class="value-luxury">Premium Client</div>
                    </div>
                    <div class="preview-items-luxury">
                        <div class="preview-item-luxury">
                            <div>Premium Service</div>
                            <div>₹50,000</div>
                        </div>
                    </div>
                    <div class="preview-total-luxury">
                        <div>TOTAL AMOUNT</div>
                        <div>₹50,000</div>
                    </div>
                </div>
            </div>`
    }
};

document.addEventListener('DOMContentLoaded', async () => {
    await checkAuth();
    await initializeInvoiceLocationSelectors();
    loadInvoices();
    setupEventListeners();
    
    await checkAndLoadPrefillOrder();
    if (!invoiceFormReady || pendingOrderPrefill) openInvoiceModal({ scroll: !!pendingOrderPrefill });
    
    window.addEventListener('sectionChanged', async (e) => {
        if (e.detail === 'invoices') {
            loadInvoices();
            await checkAndLoadPrefillOrder();
            if (!invoiceFormReady || pendingOrderPrefill) openInvoiceModal({ scroll: !!pendingOrderPrefill });
        }
    });
});

async function checkAndLoadPrefillOrder() {
    const orderId = sessionStorage.getItem('prefill_invoice_order_id');
    if (orderId) {
        sessionStorage.removeItem('prefill_invoice_order_id');
        try {
            const user = JSON.parse(localStorage.getItem('user'));
            const businessId = user.businessId || user.uid;
            const doc = await db.collection('users').doc(businessId).collection('orders').doc(orderId).get();
            if (doc.exists) {
                pendingOrderPrefill = { id: doc.id, ...doc.data() };
            }
        } catch (e) {
            console.error("Error loading prefill order", e);
        }
    }
}

async function initializeInvoiceLocationSelectors() {
    await initializeStateDistrictPair(
        document.getElementById('invShipState'),
        document.getElementById('invShipDistrict')
    );
}

function setupEventListeners() {
    if (createInvoiceBtn) {
        createInvoiceBtn.addEventListener('click', openInvoiceModal);
    }

    if (saveInvoiceBtn) {
        saveInvoiceBtn.addEventListener('click', saveInvoice);
    }

    // Invoice templates removed; no settings modal

    if (invAddItemBtn) {
        invAddItemBtn.addEventListener('click', addInvoiceItemRow);
    }

    if (invItemsContainer) {
        invItemsContainer.addEventListener('change', calculateInvoiceTotal);
        invItemsContainer.addEventListener('input', calculateInvoiceTotal);
        invItemsContainer.addEventListener('click', (e) => {
            if (e.target.closest('.remove-row')) {
                e.target.closest('tr').remove();
                calculateInvoiceTotal();
            }
        });
    }

    if (clearSignatureBtn) {
        clearSignatureBtn.addEventListener('click', clearSignaturePad);
    }

    if (invoiceLayoutSelect) {
        const savedLayout = localStorage.getItem('invoiceLayout');
        if (savedLayout) invoiceLayoutSelect.value = savedLayout;
        invoiceLayoutSelect.addEventListener('change', () => {
            localStorage.setItem('invoiceLayout', invoiceLayoutSelect.value);
            updateInvoicePreview();
        });
    }

    if (invoiceCopyAll) {
        invoiceCopyAll.addEventListener('change', () => {
            const checked = invoiceCopyAll.checked;
            if (invoiceCopyOriginal) invoiceCopyOriginal.checked = checked;
            if (invoiceCopyDuplicate) invoiceCopyDuplicate.checked = checked;
            if (invoiceCopyTriplicate) invoiceCopyTriplicate.checked = checked;
            syncInvoiceCopySelection(true);
        });
    }
    [invoiceCopyOriginal, invoiceCopyDuplicate, invoiceCopyTriplicate]
        .filter(Boolean)
        .forEach(checkbox => {
            checkbox.addEventListener('change', () => syncInvoiceCopySelection(true));
        });
    syncInvoiceCopySelection(false);

    if (printInvoicePreviewBtn) {
        printInvoicePreviewBtn.addEventListener('click', (e) => {
            e.preventDefault();
            printInvoicePreview();
        });
    }
    
    const transportInput = document.getElementById('invTransportCost');
    const paidInput = document.getElementById('invAmountPaid');
    
    if (transportInput && paidInput) {
        transportInput.addEventListener('input', calculateInvoiceTotal);
        paidInput.addEventListener('input', calculateInvoiceTotal);
    }

    const invoiceForm = document.getElementById('invoiceForm');
    if (invoiceForm) {
        invoiceForm.addEventListener('input', updateInvoicePreview);
        invoiceForm.addEventListener('change', updateInvoicePreview);
    }

    setupSignaturePad();

    if (savePaymentBtn) {
        savePaymentBtn.addEventListener('click', savePayment);
    }

    if (exportInvoicesCsvBtn) {
        exportInvoicesCsvBtn.addEventListener('click', exportInvoicesCSV);
    }

    if (exportInvoicesPdfBtn) {
        exportInvoicesPdfBtn.addEventListener('click', exportInvoicesPDF);
    }

    if (invoiceSearch) {
        invoiceSearch.addEventListener('input', applyInvoiceFilters);
    }
    if (invoiceStatusFilter) {
        invoiceStatusFilter.addEventListener('change', applyInvoiceFilters);
    }
    if (invoiceDateFrom) {
        invoiceDateFrom.addEventListener('change', applyInvoiceFilters);
    }
    if (invoiceDateTo) {
        invoiceDateTo.addEventListener('change', applyInvoiceFilters);
    }
    if (resetInvoiceFilters) {
        resetInvoiceFilters.addEventListener('click', () => {
            if (invoiceSearch) invoiceSearch.value = '';
            if (invoiceStatusFilter) invoiceStatusFilter.value = 'all';
            if (invoiceDateFrom) invoiceDateFrom.value = '';
            if (invoiceDateTo) invoiceDateTo.value = '';
            applyInvoiceFilters();
        });
    }

    // Filter projects when customer changes
    const custSelect = document.getElementById('invCustomerSelect');
    const projectSelect = document.getElementById('invProjectSelect');
    if (custSelect && projectSelect) {
        custSelect.addEventListener('change', () => {
            const selectedCustomer = custSelect.value;
            if (selectedCustomer === '__add_customer__') {
                custSelect.value = '';
                if (window.showAddCustomerModal) {
                    window.showAddCustomerModal();
                } else {
                    const customerModal = document.getElementById('customerModal');
                    if (customerModal) {
                        const modal = new bootstrap.Modal(customerModal);
                        modal.show();
                    }
                }
                return;
            }
            Array.from(projectSelect.options).forEach(opt => {
                if (opt.value === "") return;
                const projectCustomer = opt.getAttribute('data-customer');
                opt.hidden = selectedCustomer && projectCustomer && projectCustomer !== selectedCustomer;
            });
            projectSelect.value = "";
            syncShipToFromBillTo();
            updateInvoicePreview();
        });
    }

    const shipSame = document.getElementById('invShipSame');
    if (shipSame) {
        shipSame.addEventListener('change', () => {
            toggleShipToFields();
            syncShipToFromBillTo();
            updateInvoicePreview();
        });
    }

    const shipZip = document.getElementById('invShipZip');
    if (shipZip) {
        shipZip.addEventListener('blur', () => fillShipToFromPincode());
    }

    updateInvoicePreview();
}

async function reloadInvoiceCustomers(selectName = '') {
    const custSelect = document.getElementById('invCustomerSelect');
    if (!custSelect) return;
    const user = JSON.parse(localStorage.getItem('user'));
    const businessId = user?.businessId || user?.uid;
    if (!businessId) return;

    custSelect.innerHTML = '<option value="">Loading...</option>';
    try {
        const custSnap = await db.collection('users').doc(businessId)
            .collection('customers').orderBy('name').get();
        custSelect.innerHTML = '<option value="">Select Customer...</option>';
        custSnap.forEach(doc => {
            const c = doc.data();
            const balText = c.outstandingBalance < 0 ? ` (Credit: ₹${Math.abs(c.outstandingBalance)})` : '';
            custSelect.innerHTML += `
                <option value="${c.name}"
                    data-balance="${c.outstandingBalance || 0}"
                    data-address="${(c.address || '').replace(/"/g, '&quot;')}"
                    data-city="${(c.city || '').replace(/"/g, '&quot;')}"
                    data-state="${(c.state || '').replace(/"/g, '&quot;')}"
                    data-zip="${(c.zip || '').replace(/"/g, '&quot;')}"
                    data-village="${(c.village || '').replace(/"/g, '&quot;')}"
                    data-district="${(c.district || '').replace(/"/g, '&quot;')}"
                    data-mandal="${(c.mandal || '').replace(/"/g, '&quot;')}"
                    data-phone="${(c.phone || '').replace(/"/g, '&quot;')}"
                    data-taxid="${(c.taxId || '').replace(/"/g, '&quot;')}"
                >${c.name}${balText}</option>
            `;
        });
        custSelect.innerHTML += '<option value="__add_customer__">+ Add Customer...</option>';
        if (selectName) {
            custSelect.value = selectName;
            custSelect.dispatchEvent(new Event('change'));
        }
    } catch (e) {
        console.error(e);
        custSelect.innerHTML = '<option value="">Select Customer...</option>';
        custSelect.innerHTML += '<option value="__add_customer__">+ Add Customer...</option>';
    }
}

window.openInvoiceModalWithOrder = async (order) => {
    pendingOrderPrefill = order;
    await openInvoiceModal();
};

async function openInvoiceModal(options = {}) {
    const { scroll = true } = options;
    const user = JSON.parse(localStorage.getItem('user'));
    const businessId = user.businessId || user.uid;
    
    document.getElementById('invoiceForm').reset();
    document.getElementById('invDate').valueAsDate = new Date();
    invItemsContainer.innerHTML = '';
    document.getElementById('invGrandTotal').textContent = '₹0.00';
    document.getElementById('invTransportCost').value = '0';
    document.getElementById('invAmountPaid').value = '0';
    document.getElementById('invBalance').textContent = '₹0.00';
    clearSignaturePad();
    const shipSame = document.getElementById('invShipSame');
    if (shipSame) shipSame.checked = true;
    await setStateDistrictValues(
        document.getElementById('invShipState'),
        document.getElementById('invShipDistrict'),
        '',
        ''
    );
    toggleShipToFields();

    // Load Customers
    const custSelect = document.getElementById('invCustomerSelect');
    const vehicleSelect = document.getElementById('invVehicle');
    const projectSelect = document.getElementById('invProjectSelect');
    custSelect.innerHTML = '<option value="">Loading...</option>';
    
    try {
        const [custSnap, invSnap, vehicleSnap, projectSnap] = await Promise.all([
            db.collection('users').doc(businessId).collection('customers').orderBy('name').get(),
            db.collection('users').doc(businessId).collection('inventory').where('category', 'in', ['RCC Pipe', 'RCC Pipes', 'Septic Tank', 'Septic Tank Product', 'Septic Tank Products', 'Water Tank', 'Water Tank Products']).get(),
            db.collection('users').doc(businessId).collection('vehicles').get(),
            db.collection('users').doc(businessId).collection('orders').where('status', 'in', ['Pending', 'Processing', 'Dispatched']).get()
        ]);

        custSelect.innerHTML = '<option value="">Select Customer...</option>';
        custSnap.forEach(doc => {
            const c = doc.data();
            const balText = c.outstandingBalance < 0 ? ` (Credit: ₹${Math.abs(c.outstandingBalance)})` : '';
            custSelect.innerHTML += `
                <option value="${c.name}"
                    data-balance="${c.outstandingBalance || 0}"
                    data-address="${(c.address || '').replace(/"/g, '&quot;')}"
                    data-city="${(c.city || '').replace(/"/g, '&quot;')}"
                    data-state="${(c.state || '').replace(/"/g, '&quot;')}"
                    data-zip="${(c.zip || '').replace(/"/g, '&quot;')}"
                    data-village="${(c.village || '').replace(/"/g, '&quot;')}"
                    data-district="${(c.district || '').replace(/"/g, '&quot;')}"
                    data-mandal="${(c.mandal || '').replace(/"/g, '&quot;')}"
                    data-phone="${(c.phone || '').replace(/"/g, '&quot;')}"
                    data-taxid="${(c.taxId || '').replace(/"/g, '&quot;')}"
                >${c.name}${balText}</option>
            `;
        });
        custSelect.innerHTML += '<option value="__add_customer__">+ Add Customer...</option>';
        
        vehicleSelect.innerHTML = '<option value="">Select Vehicle...</option>';
        vehicleSnap.forEach(doc => {
            vehicleSelect.innerHTML += `<option value="${doc.data().name}">${doc.data().name}</option>`;
        });

        projectSelect.innerHTML = '<option value="">Select Order...</option>';
        projectSnap.forEach(doc => {
            const p = doc.data();
            projectSelect.innerHTML += `<option value="${p.name}" data-order-id="${doc.id}" data-customer="${p.customerName}">${p.name}</option>`;
        });

        const settingsDoc = await db.collection('users').doc(businessId).collection('settings').doc('business').get();
        if (settingsDoc.exists) {
            const s = settingsDoc.data();
            businessSettings = {
                gstRate: Number(s.gstRate ?? 0),
                invoicePrefix: s.invoicePrefix || '',
                invoicePad: Number(s.invoicePad ?? 4),
                invoiceNextNumber: Number(s.invoiceNextNumber ?? 1)
            };
            companyCache = s;
        } else {
            companyCache = {};
        }

        inventoryCache = invSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        addInvoiceItemRow(); // Add first row

        if (pendingOrderPrefill) {
            const order = pendingOrderPrefill;
            pendingOrderPrefill = null;

            if (order.customerName) {
                custSelect.value = order.customerName;
                custSelect.dispatchEvent(new Event('change'));
            }
            if (order.name) {
                const byId = order.id
                    ? Array.from(projectSelect.options).find(opt => opt.dataset.orderId === order.id)
                    : null;
                if (byId) {
                    projectSelect.value = byId.value;
                } else {
                    const custom = document.createElement('option');
                    custom.value = order.name;
                    custom.dataset.orderId = order.id || '';
                    custom.dataset.customer = order.customerName || '';
                    custom.textContent = order.name;
                    projectSelect.appendChild(custom);
                    projectSelect.value = custom.value;
                }
            }

            if (order.items && order.items.length) {
                invItemsContainer.innerHTML = '';
                order.items.forEach(item => addInvoiceItemRow(item));
            }
            calculateInvoiceTotal();
        }
        toggleShipToFields();
        syncShipToFromBillTo();
        invoiceFormReady = true;
        updateInvoicePreview();
        if (scroll && invoiceFormContainer?.scrollIntoView) {
            invoiceFormContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }

    } catch (e) {
        console.error(e);
        alert("Error loading data");
    }
}

window.addEventListener('customerCreated', (e) => {
    const name = e?.detail?.name || '';
    reloadInvoiceCustomers(name);
});

function addInvoiceItemRow(prefill = {}) {
    const defaultGst = Number(businessSettings.gstRate || 0);
    const options = inventoryCache.map(i => {
        const gstRate = (i.gstRate ?? defaultGst);
        const hsn = i.hsn || '';
        return `<option value="${i.id}" data-price="${i.sellingPrice || 0}" data-cost="${i.costPrice || 0}" data-hsn="${hsn}" data-gst="${gstRate}">${i.name} (Stock: ${i.quantity})</option>`;
    }).join('');
    
    const html = `
        <tr>
            <td>
                <select class="form-select form-select-sm item-select" onchange="updateRowPrice(this)">
                    <option value="">Select Item...</option>
                    ${options}
                </select>
            </td>
            <td><input type="number" class="form-control form-control-sm item-qty" value="${prefill.quantity || 1}" min="1"></td>
            <td><input type="number" class="form-control form-control-sm item-price" value="${prefill.price || 0}"></td>
            <td class="item-total align-middle">₹0.00</td>
            <td class="text-center"><button type="button" class="btn btn-sm btn-outline-danger remove-row"><i class="fas fa-times"></i></button></td>
        </tr>
    `;
    invItemsContainer.insertAdjacentHTML('beforeend', html);

    const row = invItemsContainer.lastElementChild;
    const select = row.querySelector('.item-select');
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

    calculateInvoiceTotal();
}

// Expose to window for inline onchange
window.updateRowPrice = (select) => {
    const option = select.selectedOptions[0];
    const price = option.dataset.price || 0;
    const row = select.closest('tr');
    row.querySelector('.item-price').value = price;
    calculateInvoiceTotal();
};

function calculateInvoiceTotal() {
    let total = 0;
    const transportCost = parseFloat(document.getElementById('invTransportCost').value) || 0;
    const amountPaid = parseFloat(document.getElementById('invAmountPaid').value) || 0;
    
    document.querySelectorAll('#invItemsContainer tr').forEach(row => {
        const qty = parseFloat(row.querySelector('.item-qty').value) || 0;
        const price = parseFloat(row.querySelector('.item-price').value) || 0;
        const option = row.querySelector('.item-select')?.selectedOptions?.[0];
        const gstRate = parseFloat(option?.dataset?.gst || businessSettings.gstRate || 0) || 0;
        const finalRate = price + (price * gstRate / 100);
        const rowTotal = qty * finalRate;
        row.querySelector('.item-total').textContent = `₹${rowTotal.toFixed(2)}`;
        total += rowTotal;
    });
    
    const grandTotal = total + transportCost;
    const balance = grandTotal - amountPaid;
    
    document.getElementById('invGrandTotal').textContent = `₹${grandTotal.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
    document.getElementById('invBalance').textContent = `₹${balance.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
    
    updateInvoicePreview();
    return grandTotal;
}

async function getCompanySettings() {
    if (companyCache) return companyCache;
    if (companyCachePromise) return companyCachePromise;
    const user = JSON.parse(localStorage.getItem('user'));
    const businessId = user?.businessId || user?.uid;
    if (!businessId) return {};
    companyCachePromise = db.collection('users').doc(businessId).collection('settings').doc('business').get()
        .then(doc => {
            companyCache = doc.exists ? doc.data() : {};
            return companyCache;
        })
        .catch(() => (companyCache = {}))
        .finally(() => { companyCachePromise = null; });
    return companyCachePromise;
}

function getPreviewInvoiceNumber() {
    const nextNum = Number(businessSettings.invoiceNextNumber ?? 0);
    if (!nextNum) return '';
    const prefix = businessSettings.invoicePrefix || '';
    const pad = Number(businessSettings.invoicePad ?? 4);
    return `${prefix}${String(nextNum).padStart(pad, '0')}`;
}

function getSelectedInvoiceLayout() {
    if (invoiceLayoutSelect?.value) return invoiceLayoutSelect.value;
    return localStorage.getItem('invoiceLayout') || 'original';
}

function getSelectedInvoiceCopies() {
    const picks = [];
    if (invoiceCopyOriginal?.checked) picks.push('Original');
    if (invoiceCopyDuplicate?.checked) picks.push('Duplicate');
    if (invoiceCopyTriplicate?.checked) picks.push('Triplicate');
    if (!picks.length) return ['Original'];
    return picks;
}

function getPrimaryInvoiceCopyLabel() {
    return getSelectedInvoiceCopies()[0] || 'Original';
}

function syncInvoiceCopySelection(refreshPreview = false) {
    const checkedCount = [invoiceCopyOriginal, invoiceCopyDuplicate, invoiceCopyTriplicate]
        .filter(c => c?.checked)
        .length;

    if (checkedCount === 0 && invoiceCopyOriginal) {
        invoiceCopyOriginal.checked = true;
    }

    const selected = getSelectedInvoiceCopies();
    if (invoiceCopySummary) {
        invoiceCopySummary.textContent = selected.length === 3
            ? 'Original, Duplicate, Triplicate'
            : selected.join(', ');
    }

    if (invoiceCopyAll) {
        invoiceCopyAll.checked = selected.length === 3;
        invoiceCopyAll.indeterminate = selected.length > 0 && selected.length < 3;
    }

    if (refreshPreview) updateInvoicePreview();
}

function toggleShipToFields() {
    const shipSame = document.getElementById('invShipSame');
    const disabled = shipSame ? shipSame.checked : true;
    const fields = [
        'invShipName', 'invShipPhone', 'invShipAddress',
        'invShipState', 'invShipZip', 'invShipTaxId', 'invShipVillage', 'invShipDistrict', 'invShipMandal'
    ];
    fields.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.disabled = disabled;
    });
}

function syncShipToFromBillTo() {
    const shipSame = document.getElementById('invShipSame');
    if (!shipSame || !shipSame.checked) return;
    const customerSelect = document.getElementById('invCustomerSelect');
    const opt = customerSelect?.selectedOptions?.[0];
    if (!opt) return;
    const setVal = (id, val) => {
        const el = document.getElementById(id);
        if (el) {
            if (el.tagName === 'SELECT' && val) {
                const exists = Array.from(el.options).some(o => o.value === val);
                if (!exists) {
                    el.innerHTML = `<option value="">Select</option><option value="${val}">${val}</option>`;
                }
            }
            el.value = val || '';
        }
    };
    setVal('invShipName', opt.value || '');
    setVal('invShipPhone', opt.dataset.phone || '');
    setVal('invShipAddress', opt.dataset.address || '');
    setVal('invShipState', opt.dataset.state || '');
    setVal('invShipZip', opt.dataset.zip || '');
    setVal('invShipVillage', opt.dataset.village || '');
    setVal('invShipDistrict', opt.dataset.district || '');
    setVal('invShipMandal', opt.dataset.mandal || '');
    setVal('invShipTaxId', opt.dataset.taxid || '');
}

function getShipToData() {
    const shipSame = document.getElementById('invShipSame');
    if (shipSame && shipSame.checked) {
        syncShipToFromBillTo();
    }
    return {
        shipSame: shipSame ? shipSame.checked : true,
        shipName: document.getElementById('invShipName')?.value || '',
        shipPhone: document.getElementById('invShipPhone')?.value || '',
        shipAddress: document.getElementById('invShipAddress')?.value || '',
        shipCity: '',
        shipState: document.getElementById('invShipState')?.value || '',
        shipZip: document.getElementById('invShipZip')?.value || '',
        shipVillage: document.getElementById('invShipVillage')?.value || '',
        shipDistrict: document.getElementById('invShipDistrict')?.value || '',
        shipMandal: document.getElementById('invShipMandal')?.value || '',
        shipTaxId: document.getElementById('invShipTaxId')?.value || ''
    };
}

async function fillShipToFromPincode() {
    const pinEl = document.getElementById('invShipZip');
    const villageEl = document.getElementById('invShipVillage');
    const districtEl = document.getElementById('invShipDistrict');
    const stateEl = document.getElementById('invShipState');
    const mandalEl = document.getElementById('invShipMandal');
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
    updateInvoicePreview();
}

function escapeHtmlForSrcdoc(html) {
    return html
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function renderInvoiceTemplateThumbs(company) {
    if (!invoiceTemplateThumbList) return;
    ensureInvoiceThumbStyles();
    const layouts = [
        { key: 'original', label: 'Original' },
        { key: 'corporate', label: 'Corporate' },
        { key: 'accounting', label: 'Accounting' },
        { key: 'manufacturing', label: 'Manufacturing' },
        { key: 'clean-grid', label: 'Clean Grid' },
        { key: 'print-optimized', label: 'Print Optimized' }
    ];
    const baseData = buildInvoicePreviewData(company);
    const current = getSelectedInvoiceLayout();
    invoiceTemplateThumbList.innerHTML = layouts.map(l => {
        const html = getInvoiceTemplate(l.key, { ...baseData, layoutKey: l.key });
        return `
            <div class="invoice-thumb ${current === l.key ? 'active' : ''}" data-layout="${l.key}">
                <iframe srcdoc="${escapeHtmlForSrcdoc(html)}"></iframe>
                <div class="invoice-thumb-label">${l.label}</div>
            </div>
        `;
    }).join('');

    invoiceTemplateThumbList.querySelectorAll('.invoice-thumb').forEach(el => {
        el.addEventListener('click', () => {
            const key = el.getAttribute('data-layout');
            if (invoiceLayoutSelect) invoiceLayoutSelect.value = key;
            localStorage.setItem('invoiceLayout', key);
            updateInvoicePreview();
        });
    });

    const overlay = document.getElementById('invoiceTemplateThumbs');
    if (overlay) {
        overlay.classList.remove('hidden');
    }
}

function buildInvoicePreviewData(company) {
    const customerSelect = document.getElementById('invCustomerSelect');
    const customer = customerSelect?.value || '';
    const selectedCustomerOption = customerSelect?.selectedOptions?.[0] || null;
    const customerAddress = selectedCustomerOption?.dataset?.address || '';
    const customerCity = selectedCustomerOption?.dataset?.city || '';
    const customerState = selectedCustomerOption?.dataset?.state || '';
    const customerZip = selectedCustomerOption?.dataset?.zip || '';
    const customerVillage = selectedCustomerOption?.dataset?.village || '';
    const customerDistrict = selectedCustomerOption?.dataset?.district || '';
    const customerMandal = selectedCustomerOption?.dataset?.mandal || '';
    const customerPhone = selectedCustomerOption?.dataset?.phone || '';
    const customerTaxId = selectedCustomerOption?.dataset?.taxid || '';
    const dateVal = document.getElementById('invDate')?.value || '';
    const project = document.getElementById('invProjectSelect')?.value || '';
    const poNumber = document.getElementById('invPoNumber')?.value || '';
    const poDateVal = document.getElementById('invPoDate')?.value || '';
    const vehicle = document.getElementById('invVehicle')?.value || '';
    const driver = document.getElementById('invDriver')?.value || '';
    const transportCost = parseFloat(document.getElementById('invTransportCost')?.value || '0') || 0;
    const amountPaid = parseFloat(document.getElementById('invAmountPaid')?.value || '0') || 0;
    const copyLabel = getPrimaryInvoiceCopyLabel();
    const shipTo = getShipToData();

    const items = [];
    document.querySelectorAll('#invItemsContainer tr').forEach(row => {
        const select = row.querySelector('.item-select');
        if (!select || !select.value) return;
        const option = select.selectedOptions[0];
        const qty = parseFloat(row.querySelector('.item-qty')?.value || '0') || 0;
        const price = parseFloat(row.querySelector('.item-price')?.value || '0') || 0;
        const gstRate = parseFloat(option?.dataset?.gst || businessSettings.gstRate || 0) || 0;
        const hsn = option?.dataset?.hsn || '';
        const name = option?.text?.split(' (')[0] || 'Item';
        items.push({ name, quantity: qty, price, gstRate, hsn });
    });

    const total = items.reduce((sum, item) => {
        const lineBase = Number(item.price || 0) * Number(item.quantity || 0);
        const lineGst = lineBase * (Number(item.gstRate || 0) / 100);
        return sum + lineBase + lineGst;
    }, 0);
    const amount = total + transportCost;
    const balance = amount - amountPaid;

    const dateStr = dateVal ? formatDate(new Date(dateVal)) : formatDate(new Date());
    const poDateStr = poDateVal ? formatDate(new Date(poDateVal)) : '';
    const invoiceNo = getPreviewInvoiceNumber();

    return {
        id: 'PREVIEW',
        invoiceNo,
        layoutKey: getSelectedInvoiceLayout(),
        copyLabel,
        dateStr,
        company: company || {},
        customer,
        customerAddress,
        customerCity,
        customerState,
        customerZip,
        customerVillage,
        customerDistrict,
        customerMandal,
        customerPhone,
        customerTaxId,
        shipTo,
        items,
        amount,
        project,
        status: balance <= 0 ? 'Paid' : (amountPaid > 0 ? 'Partial' : 'Pending'),
        balance,
        amountPaid,
        transportCost,
        vehicle,
        driver,
        poNumber,
        poDate: poDateStr
    };
}

async function updateInvoicePreview() {
    if (!invoicePreviewFrame) return;
    const company = await getCompanySettings();
    const data = buildInvoicePreviewData(company);
    const templateHTML = getInvoiceTemplate(data.layoutKey, data);
    invoicePreviewFrame.srcdoc = templateHTML;
    renderInvoiceTemplateThumbs(company);
}

function openInvoiceWindow(templateHTML) {
    const printWindow = window.open('', '_blank');
    printWindow.document.write(templateHTML);
}

async function printInvoiceHtml(templateHTML) {
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.left = '-10000px';
    iframe.style.top = '0';
    iframe.style.width = '800px';
    iframe.style.height = '1120px';
    iframe.style.border = '0';
    document.body.appendChild(iframe);
    iframe.contentDocument.open();
    iframe.contentDocument.write(templateHTML);
    iframe.contentDocument.close();

    await new Promise(resolve => {
        iframe.onload = () => setTimeout(resolve, 300);
    });

    const images = Array.from(iframe.contentDocument.images || []);
    await Promise.all(images.map(img => new Promise(res => {
        if (img.complete) return res();
        img.onload = () => res();
        img.onerror = () => res();
    })));

    iframe.contentWindow.focus();
    iframe.contentWindow.print();
    setTimeout(() => iframe.remove(), 500);
}

function startRowDownloadIndicator(id) {
    const statusEl = document.getElementById(`invDownload_${id}`);
    if (!statusEl) return () => {};

    statusEl.classList.remove('d-none');
    statusEl.innerHTML = `
        <div class="progress mt-1" style="height: 4px; width: 140px; display: inline-block; vertical-align: middle;">
            <div class="progress-bar progress-bar-striped progress-bar-animated" style="width: 100%"></div>
        </div>
    `;

    const stop = () => {
        statusEl.innerHTML = '';
        setTimeout(() => {
            statusEl.classList.add('d-none');
            statusEl.textContent = '';
        }, 1500);
    };
    return stop;
}

function ensurePdfSpinStyles() {
    if (document.getElementById('pdfSpinStyles')) return;
    const style = document.createElement('style');
    style.id = 'pdfSpinStyles';
    style.textContent = `
        @keyframes pdfSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .pdf-download-spin { animation: pdfSpin 0.9s linear infinite; }
        .btn-download-pdf { width: 36px; height: 31px; display: inline-flex; align-items: center; justify-content: center; padding: 0; }
        .invoice-actions { white-space: nowrap; }
        .invoice-action-row { flex-wrap: nowrap; position: relative; }
        .invoice-row-status { position: absolute; right: 0; top: 100%; margin-top: 4px; pointer-events: none; }
    `;
    document.head.appendChild(style);
}

function ensureInvoiceThumbStyles() {
    if (document.getElementById('invoiceThumbStyles')) return;
    const style = document.createElement('style');
    style.id = 'invoiceThumbStyles';
    style.textContent = `
        .invoice-thumb {
            width: 110px;
            height: 110px;
            border: 1px solid #e1e1e1;
            border-radius: 6px;
            overflow: hidden;
            background: #fff;
            position: relative;
            cursor: pointer;
        }
        .invoice-thumb.active {
            border-color: #0d6efd;
            box-shadow: 0 0 0 2px rgba(13,110,253,0.2);
        }
        .invoice-thumb iframe {
            width: 794px;
            height: 1123px;
            border: 0;
            transform: scale(0.12);
            transform-origin: top left;
            pointer-events: none;
        }
        .invoice-thumb-label {
            position: absolute;
            bottom: 4px;
            left: 6px;
            right: 6px;
            font-size: 10px;
            background: rgba(255,255,255,0.85);
            padding: 2px 4px;
            border-radius: 4px;
            text-align: center;
        }
        #invoiceTemplateThumbList {
            overflow-x: auto;
            flex-wrap: nowrap;
            padding-bottom: 4px;
        }
        #invoiceTemplateThumbList::-webkit-scrollbar { height: 6px; }
        #invoiceTemplateThumbList::-webkit-scrollbar-thumb { background: #c7c7c7; border-radius: 6px; }
        .invoice-preview-col { display: flex; flex-direction: column; }
        .invoice-preview-wrap { flex: 1; position: relative; padding-top: 150px; }
        .invoice-thumbs-overlay {
            position: absolute;
            top: 8px;
            left: 8px;
            right: 8px;
            z-index: 5;
            background: rgba(255,255,255,0.9);
            border: 1px solid #e1e1e1;
            border-radius: 8px;
            padding: 6px;
            transition: opacity 0.2s ease, transform 0.2s ease;
        }
        #invoicePreviewFrame { position: relative; z-index: 1; }
    `;
    document.head.appendChild(style);
}

async function generateInvoicePdf(templateHTML, filename) {
    const jsPDFRef = window.jspdf && window.jspdf.jsPDF ? window.jspdf.jsPDF : null;
    if (!jsPDFRef || !window.html2canvas) {
        alert('PDF library not loaded. Please refresh and try again.');
        return;
    }

    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.left = '-10000px';
    iframe.style.top = '0';
    iframe.style.width = '900px';
    iframe.style.height = '1300px';
    iframe.style.border = '0';
    document.body.appendChild(iframe);

    try {
        iframe.contentDocument.open();
        iframe.contentDocument.write(templateHTML);
        iframe.contentDocument.close();

        await new Promise(resolve => {
            iframe.onload = () => setTimeout(resolve, 300);
        });

        const images = Array.from(iframe.contentDocument.images || []);
        await Promise.all(images.map(img => new Promise(res => {
            if (img.complete) return res();
            img.onload = () => res();
            img.onerror = () => res();
        })));

        const pdf = new jsPDFRef('p', 'pt', 'a4');
        const pageWidth = pdf.internal.pageSize.getWidth();
        const pageHeight = pdf.internal.pageSize.getHeight();
        const copyPages = Array.from(iframe.contentDocument.querySelectorAll('.invoice-copy-page'));
        const targets = copyPages.length ? copyPages : [iframe.contentDocument.body];

        for (let i = 0; i < targets.length; i++) {
            const canvas = await window.html2canvas(targets[i], {
                scale: 2,
                useCORS: true,
                backgroundColor: '#ffffff'
            });
            const imgData = canvas.toDataURL('image/png');
            const widthRatio = pageWidth / canvas.width;
            const heightRatio = pageHeight / canvas.height;
            const fitRatio = Math.min(widthRatio, heightRatio);
            const drawWidth = canvas.width * fitRatio;
            const drawHeight = canvas.height * fitRatio;
            const offsetX = 0;
            const offsetY = 0;

            if (i > 0) pdf.addPage();
            pdf.addImage(imgData, 'PNG', offsetX, offsetY, drawWidth, drawHeight);
        }

        pdf.save(filename);
    } finally {
        iframe.remove();
    }
}

function printInvoicePreview() {
    const doPrint = async () => {
        const company = await getCompanySettings();
        const data = buildInvoicePreviewData(company);
        const templateHTML = buildMultiCopyInvoiceHTML(data.layoutKey, data, getSelectedInvoiceCopies());
        await printInvoiceHtml(templateHTML);
    };
    doPrint();
}

function buildMultiCopyInvoiceHTML(layoutKey, baseData, copyLabels = ['Original']) {
    const labels = Array.isArray(copyLabels) && copyLabels.length ? copyLabels : ['Original'];
    if (labels.length === 1) {
        return getInvoiceTemplate(layoutKey, { ...baseData, copyLabel: labels[0] });
    }

    const extractBetweenTags = (html, tag) => {
        const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
        const match = html.match(regex);
        return match ? match[1] : '';
    };
    const extractTitle = (html) => {
        const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
        return match ? match[1] : 'Invoice';
    };

    const docs = labels.map(label => getInvoiceTemplate(layoutKey, { ...baseData, copyLabel: label }));
    const title = extractTitle(docs[0] || '');
    const headContent = extractBetweenTags(docs[0] || '', 'head');
    const pages = docs.map((html, idx) => `
        <div class="invoice-copy-page${idx === docs.length - 1 ? ' last' : ''}">
            ${extractBetweenTags(html, 'body') || html}
        </div>
    `).join('');

    return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <title>${title}</title>
        ${headContent}
        <style>
            .invoice-copy-page { page-break-after: always; break-after: page; }
            .invoice-copy-page.last { page-break-after: auto; break-after: auto; }
        </style>
    </head>
    <body>${pages}</body>
    </html>`;
}

function resolveCopyLabels(copySelection) {
    if (Array.isArray(copySelection) && copySelection.length) return copySelection;
    if (!copySelection || copySelection === 'Original') return ['Original'];
    if (copySelection === 'All' || copySelection === 'All Copies') {
        return ['Original', 'Duplicate', 'Triplicate'];
    }
    if (copySelection === 'Duplicate' || copySelection === 'Triplicate') return [copySelection];
    return ['Original'];
}

async function loadInvoices() {
    const user = JSON.parse(localStorage.getItem('user'));
    if (!user || !invoicesTable) return;
    const businessId = user.businessId || user.uid;
    ensurePdfSpinStyles();

    const tbody = invoicesTable.querySelector('tbody');
    tbody.innerHTML = '<tr><td colspan="6" class="text-center">Loading...</td></tr>';

    try {
        const snapshot = await db.collection('users').doc(businessId)
            .collection('transactions')
            .where('type', '==', 'Invoice')
            .orderBy('date', 'desc')
            .get();

        tbody.innerHTML = '';

        if (snapshot.empty) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">No invoices found</td></tr>';
            return;
        }

        invoicesData = [];
        snapshot.forEach(doc => {
            const inv = doc.data();
            invoicesData.push({ id: doc.id, ...inv });
            const escape = (str) => (str || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;').replace(/\n/g, '\\n').replace(/\r/g, '');
            const canDelete = user.permissions ? user.permissions.canDelete : true;
            const displayNo = inv.invoiceNo || `#${doc.id.substr(0, 6).toUpperCase()}`;
            const row = `
                <tr>
                    <td>${formatDate(inv.date)}</td>
                    <td>${displayNo}</td>
                    <td>${inv.customer}</td>
                    <td>₹${(inv.amount || 0).toLocaleString()}</td>
                    <td><span class="badge bg-${inv.status === 'Paid' ? 'success' : 'warning'}">${inv.status}</span></td>
                    <td class="invoice-actions">
                        <div class="invoice-action-row d-flex flex-wrap align-items-center gap-1">
                        <select class="form-select form-select-sm d-inline-block ms-1" id="invLayout_${doc.id}" style="width: 180px;">
                            <option value="original">Original</option>
                            <option value="corporate">Corporate</option>
                            <option value="accounting">Accounting</option>
                            <option value="manufacturing">Manufacturing</option>
                            <option value="clean-grid">Clean Grid</option>
                            <option value="print-optimized">Print Optimized</option>
                        </select>
                        <select class="form-select form-select-sm d-inline-block ms-1" id="invCopy_${doc.id}" style="width: 140px;">
                            <option value="All">All Copies</option>
                            <option value="Original">Original</option>
                            <option value="Duplicate">Duplicate</option>
                            <option value="Triplicate">Triplicate</option>
                        </select>
                        <span class="small text-muted d-none invoice-row-status" id="invDownload_${doc.id}"></span>
                        <button class="btn btn-sm btn-outline-info" onclick="window.openPaymentHistory('${doc.id}')" title="Record Payment"><i class="fas fa-money-bill-wave"></i></button>
                        <button class="btn btn-sm btn-outline-dark" onclick="window.printInvoiceFromList('${doc.id}', '${escape(inv.customer)}', ${inv.amount}, '${formatDate(inv.date)}')" title="Print"><i class="fas fa-print"></i></button>
                        <button class="btn btn-sm btn-outline-primary btn-download-pdf" onclick="window.downloadInvoicePdfFromList('${doc.id}', '${escape(inv.customer)}', ${inv.amount}, '${formatDate(inv.date)}', this)" title="Download PDF"><i class="fas fa-file-pdf text-danger"></i></button>
                        ${canDelete ? `<button class="btn btn-sm btn-outline-danger" onclick="window.deleteInvoice('${doc.id}')"><i class="fas fa-trash"></i></button>` : ''}
                        </div>
                    </td>
                </tr>
            `;
            tbody.innerHTML += row;
        });
        applyInvoiceFilters();
    } catch (error) {
        console.error('Error loading invoices:', error);
        tbody.innerHTML = '<tr><td colspan="6" class="text-center text-danger">Error loading data</td></tr>';
    }
}

function applyInvoiceFilters() {
    const table = document.getElementById('invoicesTable');
    if (!table) return;
    const rows = table.querySelectorAll('tbody tr');
    const searchTerm = (invoiceSearch?.value || '').toLowerCase();
    const statusFilter = invoiceStatusFilter?.value || 'all';
    const fromVal = invoiceDateFrom?.value || '';
    const toVal = invoiceDateTo?.value || '';
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

        const statusText = cells[4]?.textContent?.trim() || '';
        if (statusFilter !== 'all' && statusText !== statusFilter) {
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

function getInvoicesExportRows() {
    return invoicesData.map(inv => ([
        formatDate(inv.date),
        inv.invoiceNo || `#${String(inv.id || '').substr(0, 6).toUpperCase()}`,
        inv.customer || '',
        inv.amount ?? 0,
        inv.status || ''
    ]));
}

function exportInvoicesCSV() {
    if (!invoicesData.length) {
        alert('No invoices to export.');
        return;
    }

    const headers = ['Date', 'Invoice #', 'Customer', 'Amount', 'Status'];
    const rows = getInvoicesExportRows();
    const filename = `invoices_${new Date().toISOString().split('T')[0]}.csv`;
    downloadCSV(filename, headers, rows);
}

function exportInvoicesPDF() {
    if (!invoicesData.length) {
        alert('No invoices to export.');
        return;
    }

    const headers = ['Date', 'Invoice #', 'Customer', 'Amount', 'Status'];
    const rows = getInvoicesExportRows();
    const filename = `invoices_${new Date().toISOString().split('T')[0]}.pdf`;
    downloadPDF(filename, 'Invoices Report', headers, rows);
}

async function loadInvoiceSettings() {
    const user = JSON.parse(localStorage.getItem('user'));
    const businessId = user.businessId || user.uid;
    try {
        const doc = await db.collection('users').doc(businessId).collection('settings').doc('invoice').get();
        if (doc.exists && doc.data().template) {
            currentTemplate = doc.data().template;
        }
    } catch (e) { console.error(e); }
}

// Enhanced Invoice Settings Modal with Preview
function openInvoiceSettings() {
    const modalEl = document.getElementById('invoiceSettingsModal');
    const container = document.querySelector('#invoiceSettingsModal .modal-body');
    
    // Hide default footer as we have custom actions
    const footer = document.querySelector('#invoiceSettingsModal .modal-footer');
    if(footer) footer.style.display = 'none';
    
    container.innerHTML = `
        <div class="row">
            <div class="col-md-8">
                <div class="template-preview-container mb-4">
                    <div id="liveTemplatePreview" class="template-live-preview"></div>
                </div>
                
                <div class="template-info-card card border-0 shadow-sm">
                    <div class="card-body">
                        <h5 id="templateName" class="card-title mb-1">Modern Clean</h5>
                        <p id="templateDescription" class="text-muted small mb-3">Minimalist design with blue accents and ample whitespace</p>
                        <div class="d-flex align-items-center">
                            <span class="badge bg-primary me-2" id="templateCategory">Professional</span>
                        </div>
                    </div>
                </div>
            </div>
            
            <div class="col-md-4">
                <div class="template-sidebar">
                    <h6 class="mb-3 text-primary">Choose Template</h6>
                    
                    <div class="template-thumbnails" id="templateThumbnails">
                        ${Object.entries(invoiceTemplates).map(([key, template]) => `
                            <div class="template-thumbnail ${key === currentTemplate ? 'active' : ''}" 
                                 data-template="${key}"
                                 onclick="window.selectTemplate('${key}')">
                                <div class="thumbnail-preview">
                                    ${template.preview}
                                </div>
                                <div class="thumbnail-label">
                                    <span class="thumbnail-name">${template.name}</span>
                                    <span class="thumbnail-badge" style="background-color: ${template.color}"></span>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                    
                    <div class="template-actions mt-4">
                        <button class="btn btn-outline-primary w-100 mb-2" onclick="window.previewFullTemplate()">
                            <i class="fas fa-eye me-2"></i>Full Preview
                        </button>
                        <button class="btn btn-primary w-100" id="applyTemplateBtn">
                            <i class="fas fa-check me-2"></i>Apply Template
                        </button>
                    </div>
                    
                    <input type="hidden" id="selectedTemplate" value="${currentTemplate}">
                </div>
            </div>
        </div>
    `;
    
    // Initialize preview
    updateTemplatePreview(currentTemplate);
    
    // Attach listener to new button
    document.getElementById('applyTemplateBtn').addEventListener('click', saveInvoiceSettings);
    
    new bootstrap.Modal(modalEl).show();
}

function updateTemplatePreview(templateKey) {
    const template = invoiceTemplates[templateKey];
    const previewContainer = document.getElementById('liveTemplatePreview');
    const templateName = document.getElementById('templateName');
    const templateDescription = document.getElementById('templateDescription');
    const templateCategory = document.getElementById('templateCategory');
    
    if (!template) return;
    
    // Update info
    templateName.textContent = template.name;
    templateDescription.textContent = template.description;
    templateCategory.textContent = template.category;
    templateCategory.style.backgroundColor = template.color;
    
    // Update preview
    previewContainer.innerHTML = template.preview;
    previewContainer.className = `template-live-preview preview-${templateKey}`;
    
    // Update active thumbnail
    document.querySelectorAll('.template-thumbnail').forEach(thumb => {
        thumb.classList.remove('active');
        if (thumb.dataset.template === templateKey) {
            thumb.classList.add('active');
        }
    });
    
    // Update hidden input
    document.getElementById('selectedTemplate').value = templateKey;
}

window.selectTemplate = (templateKey) => {
    updateTemplatePreview(templateKey);
};

window.previewFullTemplate = () => {
    const templateKey = document.getElementById('selectedTemplate').value;
    
    // Create dummy data for preview
    const dummyData = {
        id: 'INV-001',
        dateStr: new Date().toLocaleDateString(),
        company: { 
            companyName: 'Your Company Name', 
            address: '123 Business Street', 
            city: 'City', 
            zip: '12345', 
            phone: '555-0123', 
            email: 'info@example.com' 
        },
        customer: 'Client Name',
        items: [
            { name: 'Professional Service', quantity: 1, price: 5000 },
            { name: 'Product Item', quantity: 2, price: 2500 }
        ],
        amount: 10000,
        logoHtml: '<div style="font-weight:bold; font-size:24px; color:#555;">LOGO</div>',
        signatureHtml: '',
        customerSignatureHtml: '',
        project: 'Project Alpha',
        status: 'Pending'
    };
    
    const templateHTML = getInvoiceTemplate(templateKey, dummyData);
    const printWindow = window.open('', '_blank');
    printWindow.document.write(templateHTML);
};

async function saveInvoiceSettings() {
    const user = JSON.parse(localStorage.getItem('user'));
    const businessId = user.businessId || user.uid;
    const tpl = document.getElementById('selectedTemplate').value;
    
    try {
        await db.collection('users').doc(businessId).collection('settings').doc('invoice').set({ template: tpl }, { merge: true });
        currentTemplate = tpl;
        bootstrap.Modal.getInstance(document.getElementById('invoiceSettingsModal')).hide();
        showAlert('success', 'Invoice template saved');
    } catch (e) { console.error(e); }
}

async function saveInvoice(options = {}) {
    const { autoPrint = true } = options;
    const user = JSON.parse(localStorage.getItem('user'));
    const businessId = user.businessId || user.uid;
    const customer = document.getElementById('invCustomerSelect').value;
    const dateVal = document.getElementById('invDate').value;
    const amount = calculateInvoiceTotal();
    const transportCost = parseFloat(document.getElementById('invTransportCost').value) || 0;
    const amountPaid = parseFloat(document.getElementById('invAmountPaid').value) || 0;
    const vehicle = document.getElementById('invVehicle').value;
    const driver = document.getElementById('invDriver').value;
    const projectSelectEl = document.getElementById('invProjectSelect');
    const project = projectSelectEl?.value || '';
    const selectedOrderOption = projectSelectEl?.selectedOptions?.[0] || null;
    const linkedOrderId = selectedOrderOption?.dataset?.orderId || '';
    const customerSelect = document.getElementById('invCustomerSelect');
    const selectedCustomerOption = customerSelect?.selectedOptions?.[0] || null;
    const customerAddress = selectedCustomerOption?.dataset?.address || '';
    const customerCity = selectedCustomerOption?.dataset?.city || '';
    const customerState = selectedCustomerOption?.dataset?.state || '';
    const customerZip = selectedCustomerOption?.dataset?.zip || '';
    const customerVillage = selectedCustomerOption?.dataset?.village || '';
    const customerDistrict = selectedCustomerOption?.dataset?.district || '';
    const custMandalRaw = selectedCustomerOption?.dataset?.mandal || '';
    const custMandal = (custMandalRaw && typeof custMandalRaw === 'object' && 'value' in custMandalRaw)
        ? custMandalRaw.value
        : custMandalRaw;
    const customerPhone = selectedCustomerOption?.dataset?.phone || '';
    const customerTaxId = selectedCustomerOption?.dataset?.taxid || '';
    const poNumber = document.getElementById('invPoNumber').value;
    const poDateVal = document.getElementById('invPoDate').value;
    const shipTo = getShipToData();
    const balance = amount - amountPaid;
    const selectedCopyLabels = autoPrint
        ? ['Original', 'Duplicate', 'Triplicate']
        : getSelectedInvoiceCopies();

    if (!customer || amount <= 0) {
        alert('Please fill in all fields correctly');
        return;
    }

    // Gather Items & Calculate Profit
    const items = [];
    let totalCostPrice = 0;
    
    document.querySelectorAll('#invItemsContainer tr').forEach(row => {
        const select = row.querySelector('.item-select');
        if (select.value) {
            const option = select.selectedOptions[0];
            const costPrice = parseFloat(option.dataset.cost) || 0;
            const gstRate = parseFloat(option.dataset.gst) || Number(businessSettings.gstRate || 0);
            const hsn = option.dataset.hsn || '';
            const qty = parseFloat(row.querySelector('.item-qty').value);
            
            items.push({
                itemId: select.value,
                name: option.text.split(' (')[0],
                quantity: qty,
                price: parseFloat(row.querySelector('.item-price').value),
                costPrice: costPrice,
                hsn,
                gstRate
            });
            
            totalCostPrice += (costPrice * qty);
        }
    });

    if (items.length === 0) {
        showAlert('warning', 'Please add at least one item to the invoice.');
        return;
    }

    if (items.some(i => !i.quantity || i.quantity <= 0)) {
        showAlert('warning', 'Item quantity must be greater than 0.');
        return;
    }
    
    // Profit Calculation
    // Revenue = Amount (includes transport)
    // Cost = Material Cost + Transport Cost
    // Net Profit = (Item Revenue - Item Cost) + (Transport Revenue - Transport Cost)
    // Assuming Transport Cost input is what we charge or what we pay? 
    // Usually "Transport Cost" in invoice is what we charge customer. 
    // Real transport cost comes from Vehicle Expenses. 
    // For "Profit per piece", we use (Selling Price - Cost Price).
    
    const grossProfit = items.reduce((sum, item) => sum + ((item.price - item.costPrice) * item.quantity), 0);
    // We assume the transport cost added to invoice is revenue, and we don't deduct it here unless we have a specific "Actual Transport Cost" field.
    // For simplicity, let's treat the added transport cost as revenue offset by actual vehicle expenses elsewhere.
    // So Profit = Gross Profit from items.

    const saveBtn = document.getElementById('saveInvoiceBtn');
    const originalText = saveBtn.innerHTML;
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Saving...';

    // Handle Signature Upload
    let customerSignatureUrl = null;
    if (!isSignatureEmpty()) {
        try {
            const canvas = document.getElementById('signaturePad');
            const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
            const file = new File([blob], 'signature.png', { type: 'image/png' });
            
            const apiKey = await getImgBBApiKey(businessId);
            if (apiKey) {
                customerSignatureUrl = await uploadToImgBB(file, apiKey);
            }
        } catch (e) { console.error("Signature upload failed", e); }
    }

    let createdInvoiceNo = '';
    try {
        const invoiceRef = db.collection('users').doc(businessId).collection('transactions').doc();
        const invoiceData = {
            type: 'Invoice',
            customer: customer,
            customerAddress,
            customerCity,
            customerState,
            customerZip,
            customerVillage,
            customerDistrict,
            customerMandal: custMandal,
            customerPhone,
            customerTaxId,
            shipTo,
            amount: amount,
            amountPaid: amountPaid,
            balance: balance,
            transportCost: transportCost,
            project: project,
            orderId: linkedOrderId,
            vehicle: vehicle,
            driver: driver,
            poNumber: poNumber,
            poDate: poDateVal ? new Date(poDateVal) : null,
            items: items,
            profit: grossProfit,
            status: balance <= 0 ? 'Paid' : (amountPaid > 0 ? 'Partial' : 'Pending'),
            description: `Invoice for ${customer}`,
            date: new Date(dateVal),
            createdAt: new Date(),
            customerSignature: customerSignatureUrl
        };

        // Verify stock & create invoice in one transaction (all reads before writes)
        await db.runTransaction(async (transaction) => {
            const settingsRef = db.collection('users').doc(businessId).collection('settings').doc('business');
            const settingsSnap = await transaction.get(settingsRef);
            const settings = settingsSnap.exists ? settingsSnap.data() : {};
            const prefix = settings.invoicePrefix || businessSettings.invoicePrefix || '';
            const pad = Number(settings.invoicePad ?? businessSettings.invoicePad ?? 4);
            const nextNum = Number(settings.invoiceNextNumber ?? 1);
            const invoiceNo = `${prefix}${String(nextNum).padStart(pad, '0')}`;
            createdInvoiceNo = invoiceNo;

            const itemRefs = items.map(item => ({
                item,
                ref: db.collection('users').doc(businessId).collection('inventory').doc(item.itemId)
            }));

            const snapshots = [];
            for (const entry of itemRefs) {
                const snap = await transaction.get(entry.ref);
                snapshots.push({ entry, snap });
            }

            snapshots.forEach(({ entry, snap }) => {
                if (!snap.exists) {
                    throw new Error(`Item not found: ${entry.item.name}`);
                }
                const currentQty = snap.data().quantity || 0;
                if (currentQty < entry.item.quantity) {
                    throw new Error(`Insufficient stock for ${snap.data().name}. Available: ${currentQty}`);
                }
            });

            snapshots.forEach(({ entry, snap }) => {
                const currentQty = snap.data().quantity || 0;
                transaction.update(entry.ref, { quantity: currentQty - entry.item.quantity });
            });

            transaction.set(invoiceRef, { ...invoiceData, invoiceNo });
            transaction.set(settingsRef, { invoiceNextNumber: nextNum + 1 }, { merge: true });
        });

        if (linkedOrderId) {
            await db.collection('users').doc(businessId).collection('orders').doc(linkedOrderId).set({
                invoiceId: invoiceRef.id,
                invoiceNo: createdInvoiceNo,
                invoiceStatus: balance <= 0 ? 'Paid' : (amountPaid > 0 ? 'Partial' : 'Pending'),
                invoicedAt: new Date(),
                updatedAt: new Date()
            }, { merge: true });
        }

        // Update Customer Balance & Stats
        const customersRef = db.collection('users').doc(businessId).collection('customers');
        const custSnapshot = await customersRef.where('name', '==', customer).get();
        
        if (!custSnapshot.empty) {
            const custDoc = custSnapshot.docs[0];
            const currentSpent = custDoc.data().totalSpent || 0;
            const currentBalance = custDoc.data().outstandingBalance || 0;
            
            await customersRef.doc(custDoc.id).update({
                totalSpent: currentSpent + amount,
                outstandingBalance: currentBalance + balance,
                lastContact: new Date()
            });
        }
        
        if (autoPrint) {
            const company = await getCompanySettings();
            const dateStr = formatDate(new Date(dateVal));
            const poDateStr = poDateVal ? formatDate(new Date(poDateVal)) : '';
            const logoHtml = company.logoUrl
                ? `<img src="${company.logoUrl}" style="max-height: 80px; max-width: 200px; margin-bottom: 10px;">`
                : '<div class="invoice-title">INVOICE</div>';
            const signatureHtml = company.signatureUrl
                ? `<div style="text-align: right; margin-top: 30px;"><img src="${company.signatureUrl}" style="max-height: 60px; max-width: 150px;"><br><small>Authorized Signature</small></div>`
                : `<div style="text-align: right; margin-top: 60px; border-top: 1px solid #ccc; display: inline-block; padding-top: 5px; width: 200px;">Authorized Signature</div>`;
            const customerSignatureHtml = customerSignatureUrl
                ? `<div style="text-align: left; margin-top: 30px;"><img src="${customerSignatureUrl}" style="max-height: 60px; max-width: 150px;"><br><small>Receiver's Signature</small></div>`
                : '';
            const layoutKey = getSelectedInvoiceLayout();
            const printBaseData = {
                id: invoiceRef.id,
                invoiceNo: createdInvoiceNo,
                copyLabel: selectedCopyLabels[0] || 'Original',
                dateStr,
                company,
                customer,
                customerAddress,
                customerCity,
                customerState,
                customerZip,
                customerVillage,
                customerDistrict,
                customerMandal: custMandal,
                customerPhone,
                customerTaxId,
                shipTo,
                items,
                amount,
                logoHtml,
                signatureHtml,
                customerSignatureHtml,
                project,
                status: balance <= 0 ? 'Paid' : (amountPaid > 0 ? 'Partial' : 'Pending'),
                balance,
                amountPaid,
                transportCost,
                vehicle,
                driver,
                poNumber,
                poDate: poDateStr
            };
            const mergedTemplate = buildMultiCopyInvoiceHTML(layoutKey, printBaseData, selectedCopyLabels);
            await printInvoiceHtml(mergedTemplate);
        }

        showAlert('success', 'Invoice created successfully');
        loadInvoices();
        document.getElementById('invoiceForm').reset();
        invItemsContainer.innerHTML = '';
        addInvoiceItemRow();
        document.getElementById('invDate').valueAsDate = new Date();
        clearSignaturePad();
        calculateInvoiceTotal();
    } catch (error) {
        console.error('Error creating invoice:', error);
        showAlert('danger', error.message || 'Failed to create invoice');
    } finally {
        saveBtn.disabled = false;
        saveBtn.innerHTML = originalText;
    }
}

window.deleteInvoice = async (id) => {
    window.showConfirm('Delete Invoice', 'Delete this invoice?', async () => {
        const user = JSON.parse(localStorage.getItem('user'));
        if (user.permissions && user.permissions.canDelete === false) {
            return showAlert('danger', 'You do not have permission to delete items.');
        }

        const businessId = user.businessId || user.uid;
        try {
            await db.collection('users').doc(businessId).collection('transactions').doc(id).delete();
            showAlert('success', 'Invoice deleted');
            loadInvoices();
        } catch(e) { console.error(e); showAlert('danger', 'Failed to delete invoice'); }
    });
};

window.openPaymentHistory = async (id) => {
    currentPaymentInvoiceId = id;
    const user = JSON.parse(localStorage.getItem('user'));
    const businessId = user.businessId || user.uid;
    
    const tbody = document.querySelector('#paymentHistoryTable tbody');
    tbody.innerHTML = '<tr><td colspan="4" class="text-center">Loading...</td></tr>';
    document.getElementById('phInvoiceNo').textContent = '';
    document.getElementById('phBalance').textContent = '';
    document.getElementById('paymentForm').reset();
    document.getElementById('payDate').valueAsDate = new Date();
    
    if (paymentHistoryModal) {
        const modal = bootstrap.Modal.getOrCreateInstance(paymentHistoryModal);
        modal.show();
    }

    try {
        const doc = await db.collection('users').doc(businessId).collection('transactions').doc(id).get();
        if (!doc.exists) return;
        
        const inv = doc.data();
        const invNo = inv.invoiceNo || `#${id.substr(0,6).toUpperCase()}`;
        document.getElementById('phInvoiceNo').textContent = invNo;
        document.getElementById('phBalance').textContent = `₹${(inv.balance || 0).toLocaleString()}`;
        
        tbody.innerHTML = '';
        const payments = inv.payments || [];
        
        // Also include initial payment if any
        if (payments.length === 0 && inv.amountPaid > 0) {
            // Legacy support for invoices created before payment tracking
            tbody.innerHTML += `
                <tr class="table-light text-muted">
                    <td>${formatDate(inv.date)}</td>
                    <td>Initial</td>
                    <td>-</td>
                    <td class="text-end">₹${inv.amountPaid.toLocaleString()}</td>
                </tr>
            `;
        }

        payments.forEach(p => {
            tbody.innerHTML += `
                <tr>
                    <td>${formatDate(p.date)}</td>
                    <td>${p.mode}</td>
                    <td>${p.reference || '-'}</td>
                    <td class="text-end fw-bold text-success">₹${p.amount.toLocaleString()}</td>
                </tr>
            `;
        });
        
        if (tbody.innerHTML === '') {
            tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted">No payments recorded</td></tr>';
        }
    } catch(e) { console.error(e); }
};

function closePaymentHistoryModal() {
    if (!paymentHistoryModal) return;
    const modal = bootstrap.Modal.getOrCreateInstance(paymentHistoryModal);
    modal.hide();

    // Defensive cleanup when backdrop gets stuck.
    setTimeout(() => {
        const anyOpenModal = document.querySelector('.modal.show');
        if (!anyOpenModal) {
            document.querySelectorAll('.modal-backdrop').forEach(el => el.remove());
            document.body.classList.remove('modal-open');
            document.body.style.removeProperty('padding-right');
        }
    }, 250);
}

async function savePayment() {
    if (!currentPaymentInvoiceId) return;
    const user = JSON.parse(localStorage.getItem('user'));
    const businessId = user.businessId || user.uid;
    
    const amount = parseFloat(document.getElementById('payAmount').value);
    const date = document.getElementById('payDate').value;
    const mode = document.getElementById('payMode').value;
    const ref = document.getElementById('payRef').value;

    if (!amount || amount <= 0 || !date) return alert("Invalid amount or date");

    const btn = document.getElementById('savePaymentBtn');
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Saving...';

    try {
        const normalizeDate = (value) => {
            if (!value) return null;
            const d = value.toDate ? value.toDate() : new Date(value);
            if (Number.isNaN(d.getTime())) return null;
            return d.toISOString().split('T')[0];
        };

        const isDuplicatePayment = (payments, candidate) => {
            return payments.some((p) => {
                if (p.id && candidate.id && p.id === candidate.id) return true;
                const sameDate = normalizeDate(p.date) === normalizeDate(candidate.date);
                const sameAmount = Number(p.amount) === Number(candidate.amount);
                const sameMode = (p.mode || '') === (candidate.mode || '');
                const refA = (p.reference || '').trim();
                const refB = (candidate.reference || '').trim();
                const sameRef = refA && refB && refA === refB;
                if (sameRef) return true;
                if (!(sameDate && sameAmount && sameMode)) return false;
                const createdA = p.createdAt?.toDate ? p.createdAt.toDate() : new Date(p.createdAt || 0);
                const createdB = candidate.createdAt?.toDate ? candidate.createdAt.toDate() : new Date(candidate.createdAt || 0);
                const diffMs = Math.abs(createdA.getTime() - createdB.getTime());
                return Number.isFinite(diffMs) && diffMs <= 2 * 60 * 1000;
            });
        };

        const paymentId = (window.crypto && window.crypto.randomUUID)
            ? `pay_${window.crypto.randomUUID()}`
            : `pay_${Date.now()}_${Math.random().toString(16).slice(2)}`;

        const paymentObj = { id: paymentId, amount, date: new Date(date), mode, reference: ref, createdAt: new Date() };

        let didRecordPayment = false;

        await db.runTransaction(async (transaction) => {
            const invRef = db.collection('users').doc(businessId).collection('transactions').doc(currentPaymentInvoiceId);
            const invDoc = await transaction.get(invRef);
            if (!invDoc.exists) throw "Invoice not found";
            
            const inv = invDoc.data();
            const newAmountPaid = (inv.amountPaid || 0) + amount;
            const newBalance = (inv.amount || 0) - newAmountPaid;
            const newStatus = newBalance <= 0 ? 'Paid' : 'Partial';
            
            const payments = inv.payments || [];
            if (isDuplicatePayment(payments, paymentObj)) {
                throw new Error('This payment is already recorded.');
            }
            payments.push(paymentObj);

            transaction.update(invRef, {
                amountPaid: newAmountPaid,
                balance: newBalance,
                status: newStatus,
                payments: payments
            });
            didRecordPayment = true;

            // Update Customer Balance
            // Note: We don't update customer doc here inside transaction for simplicity as it requires querying by name.
            // Ideally customer ID should be stored on invoice. 
            // We will do a separate update for customer balance outside transaction or assume eventual consistency.
        });

        if (!didRecordPayment) {
            showAlert('warning', 'Payment not recorded.');
            return;
        }

        // Update Customer Balance (Separate Op)
        const invDoc = await db.collection('users').doc(businessId).collection('transactions').doc(currentPaymentInvoiceId).get();
        const inv = invDoc.data();
        const customersRef = db.collection('users').doc(businessId).collection('customers');
        const custSnap = await customersRef.where('name', '==', inv.customer).limit(1).get();
        if (!custSnap.empty) {
            const custDoc = custSnap.docs[0];
            const currentBal = custDoc.data().outstandingBalance || 0;
            await customersRef.doc(custDoc.id).update({
                outstandingBalance: currentBal - amount,
                lastContact: new Date()
            });
        }

        // Add Payment Transaction Record for Ledger
        await db.collection('users').doc(businessId).collection('transactions').doc(paymentId).set({
            type: 'Payment',
            description: `Payment for Inv #${currentPaymentInvoiceId.substr(0,6).toUpperCase()}`,
            customer: inv.customer,
            amount: amount,
            date: new Date(date),
            mode: mode,
            reference: ref,
            invoiceId: currentPaymentInvoiceId,
            status: 'Paid',
            paymentId: paymentId,
            createdAt: new Date()
        });

        showAlert('success', 'Payment recorded');
        closePaymentHistoryModal();
        loadInvoices(); // Refresh list
    } catch (e) {
        console.error(e);
        showAlert('danger', 'Failed to record payment');
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}

// Premium Invoice Print Function
window.printInvoiceFromList = (id, customer, amount, dateStr) => {
    const copySelect = document.getElementById(`invCopy_${id}`);
    const copyLabel = copySelect?.value || 'All';
    const rowLayoutSelect = document.getElementById(`invLayout_${id}`);
    const layoutKey = rowLayoutSelect?.value || getSelectedInvoiceLayout();
    window.printInvoice(id, customer, amount, dateStr, copyLabel, layoutKey, true);
};

window.downloadInvoicePdfFromList = (id, customer, amount, dateStr, btnEl) => {
    const copySelect = document.getElementById(`invCopy_${id}`);
    const copyLabel = copySelect?.value || 'All';
    const rowLayoutSelect = document.getElementById(`invLayout_${id}`);
    const layoutKey = rowLayoutSelect?.value || getSelectedInvoiceLayout();
    const stopIndicator = startRowDownloadIndicator(id);
    if (btnEl) {
        if (!btnEl.dataset.originalHtml) btnEl.dataset.originalHtml = btnEl.innerHTML;
        btnEl.innerHTML = `
            <span class="spinner-border spinner-border-sm text-danger" role="status"></span>
        `;
        btnEl.disabled = true;
    }
    window.printInvoice(id, customer, amount, dateStr, copyLabel, layoutKey, false, true, () => {
        if (btnEl && btnEl.dataset.originalHtml) {
            btnEl.innerHTML = btnEl.dataset.originalHtml;
            btnEl.disabled = false;
        }
        stopIndicator();
    });
};

window.printInvoice = async (id, customer, amount, dateStr, copyLabel = 'Original', layoutKey = 'corporate', autoPrint = true, downloadPdf = false, onDownloadDone = null) => {
    try {
        const user = JSON.parse(localStorage.getItem('user'));
        const businessId = user.businessId || user.uid;

        let company = { companyName: 'My Company', address: '', phone: '', email: '' };
        try {
            const doc = await db.collection('users').doc(businessId).collection('settings').doc('business').get();
            if (doc.exists) company = doc.data();
        } catch (e) {}

        let itemsData = [{ name: 'RCC Pipe Supply', quantity: 1, price: amount }];
        let invoiceData = {};
        const invDoc = await db.collection('users').doc(businessId).collection('transactions').doc(id).get();
        if (invDoc.exists) {
            invoiceData = invDoc.data();
            if (invoiceData.items) itemsData = invoiceData.items;
        }

        if (!invoiceData.customerAddress && invoiceData.customer) {
            const custSnap = await db.collection('users').doc(businessId)
                .collection('customers')
                .where('name', '==', invoiceData.customer)
                .limit(1)
                .get();
            if (!custSnap.empty) {
                const c = custSnap.docs[0].data();
                invoiceData.customerAddress = c.address || '';
                invoiceData.customerCity = c.city || '';
                invoiceData.customerState = c.state || '';
                invoiceData.customerZip = c.zip || '';
                invoiceData.customerVillage = c.village || '';
                invoiceData.customerDistrict = c.district || '';
                invoiceData.customerMandal = c.mandal || '';
                invoiceData.customerPhone = c.phone || '';
                invoiceData.customerTaxId = c.taxId || '';
            }
        }

        const logoHtml = company.logoUrl
            ? `<img src="${company.logoUrl}" style="max-height: 80px; max-width: 200px; margin-bottom: 10px;">`
            : '<div class="invoice-title">INVOICE</div>';
        const signatureHtml = company.signatureUrl
            ? `<div style="text-align: right; margin-top: 30px;"><img src="${company.signatureUrl}" style="max-height: 60px; max-width: 150px;"><br><small>Authorized Signature</small></div>`
            : `<div style="text-align: right; margin-top: 60px; border-top: 1px solid #ccc; display: inline-block; padding-top: 5px; width: 200px;">Authorized Signature</div>`;
        const customerSignatureHtml = invoiceData.customerSignature
            ? `<div style="text-align: left; margin-top: 30px;"><img src="${invoiceData.customerSignature}" style="max-height: 60px; max-width: 150px;"><br><small>Receiver's Signature</small></div>`
            : '';
        const poDateStr = invoiceData.poDate
            ? formatDate(invoiceData.poDate.toDate ? invoiceData.poDate.toDate() : new Date(invoiceData.poDate))
            : '';

        const baseTemplateData = {
            id,
            invoiceNo: invoiceData.invoiceNo || '',
            copyLabel: resolveCopyLabels(copyLabel)[0] || 'Original',
            dateStr,
            company,
            customer,
            customerAddress: invoiceData.customerAddress || '',
            customerCity: invoiceData.customerCity || '',
            customerState: invoiceData.customerState || '',
            customerZip: invoiceData.customerZip || '',
            customerVillage: invoiceData.customerVillage || '',
            customerDistrict: invoiceData.customerDistrict || '',
            customerMandal: invoiceData.customerMandal || '',
            customerPhone: invoiceData.customerPhone || '',
            customerTaxId: invoiceData.customerTaxId || '',
            shipTo: invoiceData.shipTo || null,
            items: itemsData,
            amount,
            logoHtml,
            signatureHtml,
            customerSignatureHtml,
            project: invoiceData.project,
            status: invoiceData.status,
            balance: invoiceData.balance,
            amountPaid: invoiceData.amountPaid || 0,
            transportCost: invoiceData.transportCost || 0,
            vehicle: invoiceData.vehicle || '',
            driver: invoiceData.driver || '',
            poNumber: invoiceData.poNumber || '',
            poDate: poDateStr
        };

        const selectedCopyLabels = resolveCopyLabels(copyLabel);
        const templateHTML = buildMultiCopyInvoiceHTML(layoutKey || currentTemplate, baseTemplateData, selectedCopyLabels);

        if (downloadPdf) {
            const safeId = (invoiceData.invoiceNo || id.substr(0, 6).toUpperCase()).replace(/[^a-z0-9-_]/gi, '_');
            await generateInvoicePdf(templateHTML, `invoice_${safeId}.pdf`);
            if (onDownloadDone) onDownloadDone('Saved');
            return;
        }

        if (autoPrint) {
            await printInvoiceHtml(templateHTML);
        } else {
            openInvoiceWindow(templateHTML);
        }
    } catch (e) {
        console.error('Error printing/downloading invoice:', e);
        showAlert('danger', 'Print/PDF failed. Please try again.');
        if (downloadPdf && onDownloadDone) onDownloadDone('Failed');
    }
};

function getInvoiceTemplateLegacy2(type, data) {
    const { id, dateStr, company, customer, items, amount, logoHtml, signatureHtml, customerSignatureHtml, project, status } = data;
    
    const itemsRows = items.map(i => `
        <tr>
            <td>${i.name}</td>
            <td style="text-align:center">${i.quantity}</td>
            <td style="text-align:right">₹${(i.price || 0).toLocaleString()}</td>
            <td style="text-align:right">₹${((i.price || 0) * (i.quantity || 0)).toLocaleString()}</td>
        </tr>
    `).join('');

    // UPI QR Code Generation
    let qrCodeHtml = '';
    if (company && company.upiId) {
        const upiString = `upi://pay?pa=${company.upiId}&pn=${encodeURIComponent(company.companyName || 'Merchant')}&am=${amount}&cu=INR`;
        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(upiString)}`;
        qrCodeHtml = `
            <div class="qr-code-box" style="text-align: center; margin: 0 20px;">
                <img src="${qrUrl}" alt="UPI QR" style="width: 90px; height: 90px; border: 1px solid #eee; padding: 4px;">
                <div style="font-size: 10px; margin-top: 4px; color: #555; font-weight: 500;">Scan to Pay</div>
            </div>`;
    }

    const commonCSS = `
        @page { size: A4; margin: 0; }
        body { margin: 0; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .page-container { width: 210mm; min-height: 297mm; margin: 0 auto; background: white; padding: 40px; box-sizing: border-box; position: relative; }
        .footer { position: absolute; bottom: 40px; left: 40px; right: 40px; text-align: center; font-size: 12px; color: #aaa; border-top: 1px solid #eee; padding-top: 20px; }
        .signatures { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 60px; page-break-inside: avoid; }
        .qr-code { text-align: center; margin-top: 30px; border: 1px dashed #ccc; padding: 10px; width: 120px; margin-left: auto; }
    `;

    // --- TEMPLATE 1: MODERN CLEAN ---
    if (type === 'modern') {
        return `
    <html>
    <head>
        <title>Invoice #${id.substr(0,6).toUpperCase()}</title>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;700&display=swap" rel="stylesheet">
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
        <style>
            ${commonCSS}
            body { font-family: 'Inter', sans-serif; color: #1f2937; line-height: 1.5; }
            .header { display: flex; justify-content: space-between; margin-bottom: 40px; padding-bottom: 20px; border-bottom: 1px solid #e5e7eb; }
            .company-name { font-size: 22px; font-weight: 700; color: #111827; margin-top: 10px; }
            .invoice-title { font-size: 32px; font-weight: 800; color: #2563eb; text-transform: uppercase; letter-spacing: -0.5px; text-align: right; }
            .invoice-meta { text-align: right; margin-top: 5px; color: #6b7280; font-size: 14px; }
            .invoice-meta strong { color: #374151; }
            
            .bill-grid { display: flex; justify-content: space-between; margin-bottom: 40px; gap: 40px; }
            .bill-col { flex: 1; }
            .bill-label { font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #9ca3af; font-weight: 600; margin-bottom: 8px; }
            .bill-name { font-size: 16px; font-weight: 600; color: #111827; margin-bottom: 4px; }
            .bill-address { font-size: 14px; color: #4b5563; white-space: pre-line; }
            
            .items-table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
            .items-table th { background-color: #f9fafb; color: #374151; font-weight: 600; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; padding: 12px 16px; text-align: left; border-bottom: 1px solid #e5e7eb; }
            .items-table td { padding: 16px; border-bottom: 1px solid #f3f4f6; font-size: 14px; color: #4b5563; }
            .items-table tr:last-child td { border-bottom: none; }
            
            .total-section { display: flex; justify-content: flex-end; }
            .total-box { width: 300px; }
            .total-row { display: flex; justify-content: space-between; padding: 8px 0; font-size: 14px; color: #4b5563; }
            .grand-total { font-size: 20px; font-weight: 700; color: #2563eb; border-top: 2px solid #e5e7eb; padding-top: 12px; margin-top: 8px; }
            
            .status-badge { display: inline-block; padding: 6px 12px; border-radius: 6px; font-size: 12px; font-weight: 600; text-transform: uppercase; margin-top: 10px; }
            .status-paid { background: #dcfce7; color: #166534; border: 1px solid #bbf7d0; }
            .status-pending { background: #fef9c3; color: #854d0e; border: 1px solid #fde047; }
        </style>
    </head>
    <body>
        <div class="page-container">
            <div class="header">
                <div>
                    ${logoHtml}
                    <div class="company-name">${company.companyName || 'SSPC Business'}</div>
                </div>
                <div>
                    <div class="invoice-title">Invoice</div>
                    <div class="invoice-meta">#${id.substr(0,6).toUpperCase()}</div>
                    <div class="invoice-meta">Date: <strong>${dateStr}</strong></div>
                    ${status ? `<div style="text-align: right;"><span class="status-badge ${status === 'Paid' ? 'status-paid' : 'status-pending'}">${status}</span></div>` : ''}
                </div>
            </div>

            <div class="bill-grid">
                <div class="bill-col">
                    <div class="bill-label">From</div>
                    <div class="bill-name">${company.companyName || 'SSPC Business'}</div>
                    <div class="bill-address">
                        ${company.address || ''}
                        ${company.city ? `<br>${company.city} ${company.zip || ''}` : ''}
                        ${company.phone ? `<br>Phone: ${company.phone}` : ''}
                        ${company.email ? `<br>Email: ${company.email}` : ''}
                    </div>
                </div>
                <div class="bill-col" style="text-align: right;">
                    <div class="bill-label">Bill To</div>
                    <div class="bill-name">${customer}</div>
                    <div class="bill-address">
                        ${project ? `Project: ${project}` : ''}
                    </div>
                </div>
            </div>

            <table class="items-table">
                <thead>
                    <tr>
                        <th style="width: 50%">Description</th>
                        <th style="width: 15%; text-align: center;">Qty</th>
                        <th style="width: 15%; text-align: right;">Price</th>
                        <th style="width: 20%; text-align: right;">Amount</th>
                    </tr>
                </thead>
                <tbody>
                    ${itemsRows}
                </tbody>
            </table>

            <div class="total-section">
                ${qrCodeHtml}
                <div class="total-box">
                    <div class="total-row">
                        <span>Subtotal</span>
                        <span>₹${amount.toLocaleString()}</span>
                    </div>
                    <div class="total-row grand-total">
                        <span>Total</span>
                        <span>₹${amount.toLocaleString()}</span>
                    </div>
                </div>
            </div>

            <div class="signatures">
                ${customerSignatureHtml}
                ${signatureHtml}
            </div>

            <div class="footer">
                Thank you for your business!
            </div>
        </div>
    </body>
    </html>`;
    }

    // --- TEMPLATE 2: CORPORATE PRO ---
    if (type === 'corporate') {
        return `
    <html>
    <head>
        <title>Invoice #${id.substr(0,6).toUpperCase()}</title>
        <link href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&display=swap" rel="stylesheet">
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
        <style>
            ${commonCSS}
            body { font-family: 'Roboto', sans-serif; color: #222; }
            .header-bg { background: #1e293b; color: white; padding: 40px; margin: -40px -40px 40px -40px; display: flex; justify-content: space-between; align-items: center; }
            .company-name { font-size: 28px; font-weight: 700; margin-bottom: 5px; letter-spacing: 0.5px; }
            .items-table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
            .items-table th { background: #f1f5f9; color: #334155; font-weight: 700; padding: 12px; text-align: left; border-bottom: 2px solid #cbd5e1; text-transform: uppercase; font-size: 12px; }
            .items-table td { padding: 12px; border-bottom: 1px solid #ecf0f1; }
            .items-table tr:nth-child(even) { background-color: #f9f9f9; }
            .total-amount { font-size: 24px; font-weight: 700; color: #1e293b; }
            .bill-to-label { color: #64748b; text-transform: uppercase; font-size: 11px; font-weight: 700; letter-spacing: 1px; margin-bottom: 5px; }
        </style>
    </head>
    <body>
        <div class="page-container">
            <div class="header-bg">
                <div>
                    ${logoHtml ? `<div style="background:white; padding:8px; border-radius:4px; display:inline-block; margin-bottom: 10px;">${logoHtml}</div>` : ''}
                    <div class="company-name">${company.companyName || 'SSPC Business'}</div>
                    <div style="font-size: 13px; opacity: 0.8; line-height: 1.4;">
                        ${company.address || ''}<br>
                        ${company.city || ''} ${company.zip || ''}<br>
                        ${company.phone || ''}
                    </div>
                </div>
                <div style="text-align: right;">
                    <h1 style="margin: 0; font-size: 42px; font-weight: 300; letter-spacing: 2px;">INVOICE</h1>
                    <div style="font-size: 18px; opacity: 0.9; margin-top: 5px;">#${id.substr(0,6).toUpperCase()}</div>
                </div>
            </div>

            <div style="margin-bottom: 40px; display: flex; justify-content: space-between;">
                <div>
                    <div class="bill-to-label">Bill To</div>
                    <div style="font-size: 16px; font-weight: 500;">${customer}</div>
                    ${project ? `<div style="font-size: 14px; color: #555;">Project: ${project}</div>` : ''}
                </div>
                <div style="text-align: right;">
                    <div class="bill-to-label">Date</div>
                    <div style="font-size: 16px; font-weight: 500;">${dateStr}</div>
                    ${status ? `<div style="margin-top: 5px;"><span style="background: #e2e8f0; color: #334155; padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: bold; text-transform: uppercase;">${status}</span></div>` : ''}
                </div>
            </div>

            <table class="items-table">
                <thead>
                    <tr>
                        <th>Description</th>
                        <th style="text-align: center;">Qty</th>
                        <th style="text-align: right;">Price</th>
                        <th style="text-align: right;">Total</th>
                    </tr>
                </thead>
                <tbody>
                    ${itemsRows}
                </tbody>
            </table>

            <div style="display: flex; justify-content: flex-end; align-items: center; margin-top: 20px;">
                ${qrCodeHtml}
                <div style="text-align: right;">
                    <span style="font-size: 16px; margin-right: 20px;">Grand Total:</span>
                    <span class="total-amount">₹${amount.toLocaleString()}</span>
                </div>
            </div>

            <div class="signatures">
                ${customerSignatureHtml}
                ${signatureHtml}
            </div>

            <div class="footer">
                Thank you for your business!
            </div>
        </div>
    </body>
    </html>`;
    }

    // --- TEMPLATE 3: ELEGANT SERIF ---
    if (type === 'elegant') {
        return `
    <html>
    <head>
        <title>Invoice #${id.substr(0,6).toUpperCase()}</title>
        <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700&family=Lato:wght@300;400&display=swap" rel="stylesheet">
        <style>
            ${commonCSS}
            body { font-family: 'Lato', sans-serif; color: #444; }
            h1, h2, h3, .company-name { font-family: 'Playfair Display', serif; }
            .page-container { border: 1px solid #ddd; padding: 60px; }
            .header { text-align: center; margin-bottom: 60px; border-bottom: 1px double #ccc; padding-bottom: 30px; }
            .company-name { font-size: 32px; color: #222; margin-bottom: 10px; }
            .items-table th { border-top: 1px solid #444; border-bottom: 1px solid #444; padding: 10px; text-transform: uppercase; font-size: 12px; letter-spacing: 1px; }
            .items-table td { padding: 15px 10px; }
            .total-amount { font-family: 'Playfair Display', serif; font-size: 24px; font-weight: 700; }
        </style>
    </head>
    <body>
        <div class="page-container">
            <div class="header">
                ${logoHtml}
                <div class="company-name">${company.companyName || 'SSPC Business'}</div>
                <div style="font-size: 12px; letter-spacing: 1px; text-transform: uppercase;">${company.city || ''} | ${company.phone || ''}</div>
            </div>

            <div style="display: flex; justify-content: space-between; margin-bottom: 40px;">
                <div>
                    <div style="font-size: 11px; text-transform: uppercase; color: #888;">Invoiced To</div>
                    <div style="font-size: 18px; margin-top: 5px;">${customer}</div>
                    ${project ? `<div style="font-size: 14px; color: #666; margin-top: 2px;">Project: ${project}</div>` : ''}
                </div>
                <div style="text-align: right;">
                    <div style="font-size: 11px; text-transform: uppercase; color: #888;">Invoice No.</div>
                    <div style="font-size: 18px; margin-top: 5px;">#${id.substr(0,6).toUpperCase()}</div>
                    <div style="font-size: 14px; color: #666; margin-top: 2px;">${dateStr}</div>
                </div>
            </div>

            <table class="items-table">
                <thead>
                    <tr>
                        <th>Description</th>
                        <th style="text-align: center;">Qty</th>
                        <th style="text-align: right;">Price</th>
                        <th style="text-align: right;">Amount</th>
                    </tr>
                </thead>
                <tbody>
                    ${itemsRows}
                </tbody>
            </table>

            <div style="display: flex; justify-content: flex-end; align-items: center; margin-top: 30px; border-top: 1px solid #eee; padding-top: 20px;">
                ${qrCodeHtml}
                <div style="text-align: right;">
                    <span style="margin-right: 20px; font-size: 14px; text-transform: uppercase; letter-spacing: 1px;">Total Due</span>
                    <span class="total-amount">₹${amount.toLocaleString()}</span>
                </div>
            </div>

            <div class="signatures">
                ${customerSignatureHtml}
                ${signatureHtml}
            </div>
        </div>
    </body>
    </html>`;
    }

    // --- TEMPLATE 4: MINIMAL ---
    if (type === 'minimal') {
        return `
    <html>
    <head>
        <title>Invoice #${id.substr(0,6).toUpperCase()}</title>
        <link href="https://fonts.googleapis.com/css2?family=Open+Sans:wght@300;400;600&display=swap" rel="stylesheet">
        <style>
            ${commonCSS}
            body { font-family: 'Open Sans', sans-serif; color: #4a5568; }
            .header { padding-bottom: 20px; border-bottom: 1px solid #e2e8f0; margin-bottom: 40px; display: flex; justify-content: space-between; }
            .invoice-title { font-size: 32px; font-weight: 300; color: #2d3748; letter-spacing: 2px; }
            .invoice-number { color: #718096; margin-top: 5px; }
            .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-bottom: 40px; }
            .label { font-size: 11px; text-transform: uppercase; color: #a0aec0; font-weight: 600; margin-bottom: 4px; }
            .value { font-size: 15px; color: #2d3748; }
            .items-table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
            .items-table th { text-align: left; padding: 12px 0; border-bottom: 1px solid #e2e8f0; font-weight: 600; color: #718096; font-size: 12px; text-transform: uppercase; }
            .items-table td { padding: 16px 0; border-bottom: 1px solid #edf2f7; }
            .total-section { display: flex; justify-content: flex-end; margin-top: 20px; }
            .total-row { display: flex; justify-content: space-between; width: 250px; padding: 10px 0; font-size: 18px; font-weight: 600; color: #2d3748; }
        </style>
    </head>
    <body>
        <div class="page-container">
            <div class="header">
                <div>
                    <div class="invoice-title">Invoice</div>
                    <div class="invoice-number">#${id.substr(0,6).toUpperCase()}</div>
                </div>
                <div style="text-align: right;">
                    ${logoHtml}
                </div>
            </div>
            
            <div class="meta-grid">
                <div>
                    <div class="label">From</div>
                    <div class="value">${company.companyName || 'SSPC'}</div>
                    <div style="font-size: 13px; margin-top: 5px;">${company.address || ''}</div>
                </div>
                <div>
                    <div class="label">To</div>
                    <div class="value">${customer}</div>
                    <div class="label" style="margin-top: 15px;">Date</div>
                    <div class="value">${dateStr}</div>
                </div>
            </div>
            
            <table class="items-table">
                <thead>
                    <tr><th>Item</th><th style="text-align:center">Qty</th><th style="text-align:right">Price</th><th style="text-align:right">Total</th></tr>
                </thead>
                <tbody>${itemsRows}</tbody>
            </table>
            
            <div class="total-section">
                ${qrCodeHtml}
                <div class="total-row">
                    <span>Total</span>
                    <span>₹${amount.toLocaleString()}</span>
                </div>
            </div>
            
            <div class="signatures">${customerSignatureHtml}${signatureHtml}</div>
        </div>
    </body>
    </html>`;
    }

    // --- TEMPLATE 5: LUXURY ---
    if (type === 'luxury') {
        return `
    <html>
    <head>
        <title>Invoice #${id.substr(0,6).toUpperCase()}</title>
        <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;600;700&display=swap" rel="stylesheet">
        <style>
            ${commonCSS}
            body { font-family: 'Cormorant Garamond', serif; color: #333; }
            .header { background: linear-gradient(135deg, #1a1a1a 0%, #333 100%); color: #b8860b; padding: 40px; text-align: center; margin: -40px -40px 40px -40px; }
            .company-name { font-size: 36px; font-weight: 300; letter-spacing: 3px; text-transform: uppercase; }
            .invoice-label { font-size: 14px; letter-spacing: 3px; opacity: 0.8; margin-bottom: 5px; text-transform: uppercase; }
            .client-section { text-align: center; margin-bottom: 40px; padding-bottom: 20px; border-bottom: 1px solid #f0f0f0; }
            .label { font-size: 12px; letter-spacing: 2px; color: #b8860b; text-transform: uppercase; margin-bottom: 5px; }
            .value { font-size: 24px; font-weight: 600; }
            .items-table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
            .items-table th { text-align: left; padding: 15px; border-bottom: 1px solid #b8860b; color: #b8860b; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; font-size: 12px; }
            .items-table td { padding: 20px 15px; border-bottom: 1px solid #f0f0f0; font-size: 18px; }
            .total-section { background: #fafafa; padding: 30px; display: flex; justify-content: space-between; align-items: center; margin: 0 -40px; }
            .total-label { font-size: 14px; letter-spacing: 2px; color: #b8860b; text-transform: uppercase; }
            .total-amount { font-size: 32px; font-weight: 700; color: #b8860b; }
        </style>
    </head>
    <body>
        <div class="page-container">
            <div class="header">
                <div class="invoice-label">INVOICE #${id.substr(0,6).toUpperCase()}</div>
                <div class="company-name">${company.companyName || 'SSPC'}</div>
            </div>
            
            <div class="client-section">
                <div class="label">BILLED TO</div>
                <div class="value">${customer}</div>
                <div style="margin-top: 10px; font-size: 16px; color: #666;">${dateStr}</div>
            </div>
            
            <table class="items-table">
                <thead>
                    <tr><th>Description</th><th style="text-align:center">Qty</th><th style="text-align:right">Price</th><th style="text-align:right">Total</th></tr>
                </thead>
                <tbody>${itemsRows}</tbody>
            </table>
            
            <div class="total-section">
                ${qrCodeHtml}
                <div class="total-label">Total Amount</div>
                <div class="total-amount">₹${amount.toLocaleString()}</div>
            </div>
            
            <div class="signatures" style="padding: 0 40px;">${customerSignatureHtml}${signatureHtml}</div>
        </div>
    </body>
    </html>`;
    }

    // --- TEMPLATE 6: BOLD IMPACT (Default Fallback) ---
    return `
    <html>
    <head>
        <title>Invoice #${id.substr(0,6).toUpperCase()}</title>
        <link href="https://fonts.googleapis.com/css2?family=Oswald:wght@400;700&family=Open+Sans:wght@400;600&display=swap" rel="stylesheet">
        <style>
            ${commonCSS}
            body { font-family: 'Open Sans', sans-serif; color: #000; }
            h1, .company-name { font-family: 'Oswald', sans-serif; text-transform: uppercase; }
            .header { border-bottom: 4px solid #000; padding-bottom: 20px; margin-bottom: 40px; display: flex; justify-content: space-between; align-items: flex-end; }
            .company-name { font-size: 36px; line-height: 1; }
            .invoice-tag { background: #000; color: #fff; padding: 5px 15px; font-family: 'Oswald', sans-serif; font-size: 24px; display: inline-block; }
            .items-table th { background: #000; color: #fff; padding: 10px; font-family: 'Oswald', sans-serif; letter-spacing: 1px; }
            .items-table td { padding: 15px 10px; border-bottom: 1px solid #000; font-weight: 600; }
            .total-amount { font-family: 'Oswald', sans-serif; font-size: 28px; background: #000; color: #fff; padding: 5px 15px; }
        </style>
    </head>
    <body>
        <div class="page-container">
            <div class="header">
                <div>
                    ${logoHtml}
                    <div class="company-name">${company.companyName || 'SSPC'}</div>
                    <div>${company.phone || ''}</div>
                </div>
                <div style="text-align: right;">
                    <div class="invoice-tag">INVOICE</div>
                    <div style="font-size: 18px; font-weight: 700; margin-top: 10px;">#${id.substr(0,6).toUpperCase()}</div>
                    <div>${dateStr}</div>
                </div>
            </div>

            <div style="margin-bottom: 40px; background: #f0f0f0; padding: 20px; border-left: 4px solid #000;">
                <div style="font-size: 12px; text-transform: uppercase; font-weight: 700;">Bill To</div>
                <div style="font-size: 20px; font-weight: 700;">${customer}</div>
                ${project ? `<div style="font-size: 14px; margin-top: 5px;">Project: ${project}</div>` : ''}
            </div>

            <table class="items-table">
                <thead>
                    <tr>
                        <th>Item</th>
                        <th style="text-align: center;">Qty</th>
                        <th style="text-align: right;">Rate</th>
                        <th style="text-align: right;">Total</th>
                    </tr>
                </thead>
                <tbody>
                    ${itemsRows}
                </tbody>
            </table>

            <div style="display: flex; justify-content: flex-end; align-items: center; margin-top: 30px;">
                ${qrCodeHtml}
                <div style="text-align: right;">
                    <span class="total-amount">₹${amount.toLocaleString()}</span>
                </div>
            </div>

            <div class="signatures">
                ${customerSignatureHtml}
                ${signatureHtml}
            </div>
        </div>
    </body>
    </html>`;
}

// Delivery Challan Print Function (No Prices)
window.printDeliveryChallan = async (id) => {
    const user = JSON.parse(localStorage.getItem('user'));
    const businessId = user.businessId || user.uid;
    
    try {
        const [settingsDoc, transDoc] = await Promise.all([
            db.collection('users').doc(businessId).collection('settings').doc('business').get(),
            db.collection('users').doc(businessId).collection('transactions').doc(id).get()
        ]);

        let company = settingsDoc.exists ? settingsDoc.data() : { companyName: 'My Company' };
        if (!transDoc.exists) return alert("Invoice not found");
        
        const inv = transDoc.data();
        const items = inv.items || [];
        const dateStr = formatDate(inv.date);

        const receiverSignatureHtml = inv.customerSignature
            ? `<div class="signature-box" style="border-top: none;"><img src="${inv.customerSignature}" style="max-height: 50px; display: block; margin: 0 auto;"><span style="border-top: 1px solid #333; display: block; width: 100%; padding-top: 5px;">Receiver's Signature</span></div>`
            : `<div class="signature-box">Receiver's Signature</div>`;

        const html = `
        <html>
        <head>
            <title>Delivery Challan #${id.substr(0,6).toUpperCase()}</title>
            <style>
                body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #555; padding: 0; margin: 0; }
                .challan-box { max-width: 800px; margin: auto; padding: 30px; border: 1px solid #eee; box-shadow: 0 0 10px rgba(0, 0, 0, .15); font-size: 16px; line-height: 24px; }
                .header { display: flex; justify-content: space-between; margin-bottom: 50px; }
                .company-details { text-align: right; }
                .company-name { font-size: 28px; font-weight: bold; color: #333; margin-bottom: 5px; }
                .title { font-size: 32px; color: #333; font-weight: bold; text-transform: uppercase; }
                .info-table { width: 100%; margin-bottom: 40px; }
                .info-table td { padding: 5px; vertical-align: top; }
                .items-table { width: 100%; border-collapse: collapse; margin-bottom: 40px; }
                .items-table th { background: #f8f9fa; color: #333; font-weight: bold; padding: 12px; text-align: left; border-bottom: 2px solid #ddd; }
                .items-table td { padding: 12px; border-bottom: 1px solid #eee; }
                .footer { margin-top: 50px; text-align: center; font-size: 12px; color: #aaa; border-top: 1px solid #eee; padding-top: 20px; }
                .signatures { display: flex; justify-content: space-between; margin-top: 80px; }
                .signature-box { border-top: 1px solid #333; width: 200px; text-align: center; padding-top: 10px; }
            </style>
        </head>
        <body>
            <div class="challan-box">
                <div class="header">
                    <div>
                        <div class="title">DELIVERY CHALLAN</div>
                        <div>#${id.substr(0,6).toUpperCase()}</div>
                        <div>Date: ${dateStr}</div>
                    </div>
                    <div class="company-details">
                        <div class="company-name">${company.companyName || 'SSPC Business'}</div>
                        <div>${company.address || ''}</div>
                        <div>${company.city || ''} ${company.zip || ''}</div>
                        <div>${company.phone || ''}</div>
                    </div>
                </div>

                <table class="info-table">
                    <tr>
                        <td>
                            <strong>Delivered To:</strong><br>
                            ${inv.customer}<br>
                            ${inv.vehicle ? '<br><strong>Vehicle:</strong> ' + inv.vehicle : ''}
                            ${inv.driver ? '<br><strong>Driver:</strong> ' + inv.driver : ''}
                        </td>
                    </tr>
                </table>

                <table class="items-table">
                    <thead>
                        <tr>
                            <th>Item Description</th>
                            <th>Quantity</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${items.map(i => `
                        <tr>
                            <td>${i.name}</td>
                            <td>${i.quantity}</td>
                        </tr>
                        `).join('')}
                    </tbody>
                </table>

                <div class="signatures">
                    ${receiverSignatureHtml}
                    <div class="signature-box">Authorized Signatory</div>
                </div>

                <div class="footer">
                    This is a computer generated delivery challan.
                </div>
            </div>
            <script>window.print();</script>
        </body>
        </html>`;

        const printWindow = window.open('', '_blank');
        printWindow.document.write(html);
        printWindow.document.close();

    } catch(e) {
        console.error(e);
        alert("Failed to generate challan");
    }
};

// Send WhatsApp Reminder
window.sendWhatsApp = async (id, customerName, amount, status) => {
    const user = JSON.parse(localStorage.getItem('user'));
    const businessId = user.businessId || user.uid;
    
    try {
        const snapshot = await db.collection('users').doc(businessId).collection('customers')
            .where('name', '==', customerName).limit(1).get();
            
        if (snapshot.empty) return alert('Customer details not found');
        
        const customer = snapshot.docs[0].data();
        if (!customer.phone) return alert('Customer phone number missing');
        
        // Basic formatting for India (defaulting if no country code)
        let phone = customer.phone.replace(/\D/g, '');
        if (phone.length === 10) phone = '91' + phone;
        
        const text = encodeURIComponent(`Hello ${customerName},\n\nInvoice #${id.substr(0,6).toUpperCase()} for ₹${amount.toLocaleString()} is currently ${status}.\n\nPlease check and process payment if pending.\n\nThank you.`);
        window.open(`https://wa.me/${phone}?text=${text}`, '_blank');
        
    } catch(e) { 
        console.error(e); 
        alert('Error sending WhatsApp'); 
    }
};

// Send Email Reminder
window.sendEmail = async (id, customerName, amount, status) => {
    const user = JSON.parse(localStorage.getItem('user'));
    const businessId = user.businessId || user.uid;
    
    try {
        const snapshot = await db.collection('users').doc(businessId).collection('customers')
            .where('name', '==', customerName).limit(1).get();
            
        if (snapshot.empty) return alert('Customer details not found');
        
        const customer = snapshot.docs[0].data();
        if (!customer.email) return alert('Customer email missing');
        
        const subject = encodeURIComponent(`Invoice #${id.substr(0,6).toUpperCase()} - Payment Reminder`);
        const body = encodeURIComponent(`Hello ${customerName},\n\nThis is a reminder regarding Invoice #${id.substr(0,6).toUpperCase()}.\nAmount: ₹${amount.toLocaleString()}\nStatus: ${status}\n\nPlease arrange for payment at your earliest convenience.\n\nThank you.`);
        
        window.location.href = `mailto:${customer.email}?subject=${subject}&body=${body}`;
        
    } catch(e) { console.error(e); alert('Error sending Email'); }
};

// --- Signature Pad Logic ---
let isDrawing = false;

function setupSignaturePad() {
    const canvas = document.getElementById('signaturePad');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#000';

    const getPos = (e) => {
        const rect = canvas.getBoundingClientRect();
        const clientX = e.clientX || (e.touches && e.touches[0].clientX);
        const clientY = e.clientY || (e.touches && e.touches[0].clientY);
        return {
            x: clientX - rect.left,
            y: clientY - rect.top
        };
    };

    const startDraw = (e) => {
        isDrawing = true;
        const pos = getPos(e);
        ctx.beginPath();
        ctx.moveTo(pos.x, pos.y);
    };

    const draw = (e) => {
        if (!isDrawing) return;
        e.preventDefault();
        const pos = getPos(e);
        ctx.lineTo(pos.x, pos.y);
        ctx.stroke();
    };

    const stopDraw = () => {
        isDrawing = false;
    };

    canvas.addEventListener('mousedown', startDraw);
    canvas.addEventListener('mousemove', draw);
    canvas.addEventListener('mouseup', stopDraw);
    canvas.addEventListener('mouseout', stopDraw);

    canvas.addEventListener('touchstart', startDraw);
    canvas.addEventListener('touchmove', draw);
    canvas.addEventListener('touchend', stopDraw);
}

function clearSignaturePad() {
    const canvas = document.getElementById('signaturePad');
    if (canvas) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
}

function isSignatureEmpty() {
    const canvas = document.getElementById('signaturePad');
    if (!canvas) return true;
    const blank = document.createElement('canvas');
    blank.width = canvas.width;
    blank.height = canvas.height;
    return canvas.toDataURL() === blank.toDataURL();
}

// --- Image Upload Helpers (Reused) ---
async function getImgBBApiKey(businessId) {
    try {
        await remoteConfig.fetchAndActivate();
        const rcKey = remoteConfig.getValue('imgbb_api_key').asString();
        if (rcKey) return rcKey;
        const doc = await db.collection('users').doc(businessId).collection('settings').doc('integrations').get();
        if (doc.exists && doc.data().imgbbApiKey) return doc.data().imgbbApiKey;
        return "031d6299529790696342316431f5516a"; // Fallback
    } catch (e) { return null; }
}

async function uploadToImgBB(file, apiKey) {
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
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params 
    });
    const data = await response.json();
    if (data.success) return data.data.url;
    throw new Error(data.error ? data.error.message : 'Upload failed');
}

// Inject CSS for Template Previews
const templateStyles = `
<style>
/* Template Preview Container */
.template-preview-container {
    background: #f8f9fa;
    border-radius: 12px;
    padding: 30px;
    border: 2px solid #e9ecef;
    min-height: 400px;
    display: flex;
    align-items: center;
    justify-content: center;
}
.template-live-preview {
    width: 100%;
    max-width: 500px;
    background: white;
    border-radius: 8px;
    box-shadow: 0 10px 30px rgba(0,0,0,0.08);
    overflow: hidden;
    margin: 0 auto;
}
/* Template Thumbnails */
.template-thumbnails {
    display: grid;
    gap: 15px;
    max-height: 500px;
    overflow-y: auto;
    padding-right: 10px;
}
.template-thumbnail {
    border: 2px solid #e9ecef;
    border-radius: 8px;
    padding: 15px;
    cursor: pointer;
    transition: all 0.3s ease;
    background: white;
}
.template-thumbnail:hover {
    border-color: #dee2e6;
    transform: translateY(-2px);
    box-shadow: 0 5px 15px rgba(0,0,0,0.05);
}
.template-thumbnail.active {
    border-color: #0d6efd;
    background: linear-gradient(135deg, #f8f9ff 0%, #e8f4ff 100%);
    box-shadow: 0 5px 20px rgba(13, 110, 253, 0.15);
}
.thumbnail-preview {
    height: 120px;
    overflow: hidden;
    border-radius: 6px;
    margin-bottom: 10px;
    transform: scale(0.8);
    transform-origin: top left;
}
.thumbnail-label {
    display: flex;
    justify-content: space-between;
    align-items: center;
}
.thumbnail-name {
    font-weight: 500;
    font-size: 14px;
    color: #2d3748;
}
.thumbnail-badge {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    display: inline-block;
}
/* Modern Preview */
.template-preview-modern { font-family: 'Inter', sans-serif; color: #1f2937; }
.preview-header { display: flex; justify-content: space-between; padding: 25px; border-bottom: 1px solid #e5e7eb; }
.preview-logo { font-weight: 700; color: #2563eb; }
.preview-title { font-weight: 800; color: #2563eb; }
.preview-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 30px; padding: 25px; }
.preview-from .label, .preview-to .label { font-size: 11px; text-transform: uppercase; color: #6b7280; font-weight: 600; }
.preview-items { padding: 0 25px; }
.preview-item { display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 15px; padding: 12px 0; border-bottom: 1px solid #f3f4f6; font-size: 14px; }
.preview-total { display: flex; justify-content: space-between; padding: 25px; font-weight: 700; color: #2563eb; border-top: 2px solid #e5e7eb; }
/* Corporate Preview */
.template-preview-corporate { font-family: 'Roboto', sans-serif; }
.preview-header-dark { background: #1e293b; color: white; padding: 30px; display: flex; justify-content: space-between; }
.preview-company { font-weight: 700; }
.preview-client { padding: 25px; background: #f8fafc; }
.preview-items-striped { padding: 0 25px; }
.preview-items-striped .preview-item { display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 15px; padding: 15px; background: #f1f5f9; }
.preview-grand-total { padding: 25px; text-align: right; font-weight: 700; color: #1e293b; }
/* Elegant Preview */
.template-preview-elegant { font-family: 'Playfair Display', serif; color: #444; }
.preview-header-elegant { text-align: center; padding: 30px; border-bottom: 1px double #ccc; }
.preview-company-name { font-size: 24px; margin-bottom: 5px; }
.preview-elegant-grid { display: flex; justify-content: space-between; padding: 25px; }
.preview-table-elegant { padding: 0 25px; }
.preview-table-header { display: flex; justify-content: space-between; padding: 12px 0; border-top: 1px solid #444; border-bottom: 1px solid #444; text-transform: uppercase; font-size: 12px; }
.preview-table-row { display: flex; justify-content: space-between; padding: 15px 0; }
.preview-total-elegant { text-align: right; padding: 25px; border-top: 1px solid #eee; font-weight: 700; }
/* Bold Preview */
.template-preview-bold { font-family: 'Oswald', sans-serif; color: #000; }
.preview-header-bold { border-bottom: 4px solid #000; padding: 20px; display: flex; justify-content: space-between; }
.preview-brand { font-size: 24px; font-weight: 700; }
.preview-invoice-bold { background: #000; color: #fff; padding: 5px 15px; }
.preview-client-box { background: #f0f0f0; padding: 20px; border-left: 4px solid #000; margin: 25px; }
.preview-items-bold { padding: 0 25px; }
.preview-item-bold { display: flex; justify-content: space-between; padding: 15px 0; border-bottom: 1px solid #000; font-weight: 600; }
.preview-total-bold { text-align: right; padding: 25px; font-size: 24px; background: #000; color: #fff; margin: 25px; }
/* Minimal Preview */
.template-preview-minimal { font-family: 'Open Sans', sans-serif; color: #4a5568; }
.preview-header-minimal { padding: 25px; border-bottom: 1px solid #e2e8f0; }
.preview-minimal-title { font-size: 24px; font-weight: 300; color: #2d3748; }
.preview-minimal-info { display: grid; grid-template-columns: 1fr 1fr; gap: 25px; padding: 25px; }
.label-minimal { font-size: 11px; text-transform: uppercase; color: #a0aec0; font-weight: 600; }
.preview-items-minimal { padding: 0 25px; }
.preview-item-minimal { display: flex; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid #edf2f7; }
.preview-total-minimal { display: flex; justify-content: space-between; padding: 25px; font-weight: 600; color: #2d3748; }
/* Luxury Preview */
.template-preview-luxury { font-family: 'Cormorant Garamond', serif; color: #333; }
.preview-header-luxury { background: linear-gradient(135deg, #1a1a1a 0%, #333 100%); color: #b8860b; padding: 30px; text-align: center; }
.preview-luxury-title { font-size: 28px; letter-spacing: 3px; }
.preview-luxury-client { padding: 30px; text-align: center; border-bottom: 1px solid #e8e8e8; }
.label-luxury { font-size: 11px; letter-spacing: 2px; color: #b8860b; text-transform: uppercase; }
.preview-items-luxury { padding: 30px; }
.preview-item-luxury { display: flex; justify-content: space-between; padding: 15px 0; border-bottom: 1px solid #f0f0f0; }
.preview-total-luxury { background: #fafafa; padding: 25px 30px; display: flex; justify-content: space-between; font-weight: 600; color: #b8860b; }
/* Scrollbar */
.template-thumbnails::-webkit-scrollbar { width: 6px; }
.template-thumbnails::-webkit-scrollbar-track { background: #f1f1f1; border-radius: 3px; }
.template-thumbnails::-webkit-scrollbar-thumb { background: #c1c1c1; border-radius: 3px; }
</style>
`;
// Template styles removed for standard invoice

// Standard invoice template override (templates removed)
function getInvoiceTemplate(type, data = {}) {
    const {
        id, invoiceNo, copyLabel, dateStr, company, customer, customerAddress, customerCity, customerState, customerZip, customerVillage, customerDistrict, customerMandal, customerPhone, customerTaxId, shipTo, items, amount,
        signatureHtml, customerSignatureHtml, project,
        status, balance, amountPaid, transportCost, vehicle, driver, poNumber, poDate,
        placeOfSupply, reverseCharge, taxMode, docType, transporter, ewayBill
    } = data;

    const safeCompany = company || {};
    const safeItems = Array.isArray(items) ? items : [];
    const safeId = id || 'INV';
    const safeDateStr = dateStr || formatDate(new Date());
    const safeAmount = Number(amount || 0);

    const safe = (val) => (val === null || val === undefined || val === '') ? '-' : val;
    const companyName = safeCompany.companyName || 'SSPC Business';
    const gstin = safeCompany.taxId || safeCompany.gstin || '-';
    const state = safeCompany.state || safeCompany.companyState || '-';
    const phone = safeCompany.phone || safeCompany.companyPhone || '';
    const email = safeCompany.email || safeCompany.companyEmail || '';
    const address = safeCompany.address || safeCompany.companyAddress || '';
    const city = safeCompany.city || safeCompany.companyCity || '';
    const zip = safeCompany.zip || safeCompany.companyZip || '';

    const itemsRows = safeItems.map((i, idx) => {
        const qty = Number(i.quantity || 0);
        const price = Number(i.price || 0);
        const gstRate = Number(i.gstRate || 0);
        const gstAmount = (price * gstRate) / 100;
        const finalRate = price + gstAmount;
        const lineAmount = finalRate * qty;
        return `
            <tr>
                <td>${idx + 1}</td>
                <td>
                    <div class="item-name">${i.name}</div>
                </td>
                <td>${i.hsn || '-'}</td>
                <td class="text-end">${qty}</td>
                <td class="text-end">&#8377;${price.toLocaleString()}</td>
                <td class="text-end">&#8377;${gstAmount.toLocaleString()}<div class="muted">(${gstRate.toFixed(0)}%)</div></td>
                <td class="text-end">&#8377;${finalRate.toLocaleString()}</td>
                <td class="text-end">&#8377;${lineAmount.toLocaleString()}</td>
            </tr>
        `;
    }).join('');

    const itemsSubtotal = safeItems.reduce((sum, i) => sum + (Number(i.price || 0) * Number(i.quantity || 0)), 0);
    const transport = Number(transportCost || 0);
    const grandTotal = Number(safeAmount || (itemsSubtotal + transport));
    const received = Number(amountPaid || 0);
    const balanceDue = Number(balance ?? (grandTotal - received));

    const taxableAmount = itemsSubtotal;
    const totalGstAmount = safeItems.reduce((sum, i) => {
        const rate = Number(i.gstRate || 0);
        const lineTaxable = Number(i.price || 0) * Number(i.quantity || 0);
        return sum + (lineTaxable * rate / 100);
    }, 0);
    const effectiveRate = taxableAmount ? (totalGstAmount / taxableAmount) * 100 : 0;
    const sgstRate = effectiveRate / 2;
    const cgstRate = effectiveRate / 2;
    const sgstAmount = totalGstAmount / 2;
    const cgstAmount = totalGstAmount / 2;
    const igstRate = effectiveRate;
    const igstAmount = totalGstAmount;

    const toWords = (num) => {
        const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
            'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
        const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
        const twoDigit = (n) => n < 20 ? ones[n] : `${tens[Math.floor(n / 10)]}${n % 10 ? ' ' + ones[n % 10] : ''}`;
        const threeDigit = (n) => {
            const h = Math.floor(n / 100);
            const r = n % 100;
            return `${h ? ones[h] + ' Hundred' + (r ? ' ' : '') : ''}${r ? twoDigit(r) : ''}`;
        };
        const parts = [];
        const crore = Math.floor(num / 10000000);
        const lakh = Math.floor((num / 100000) % 100);
        const thousand = Math.floor((num / 1000) % 100);
        const hundred = Math.floor(num % 1000);
        if (crore) parts.push(`${threeDigit(crore)} Crore`);
        if (lakh) parts.push(`${threeDigit(lakh)} Lakh`);
        if (thousand) parts.push(`${threeDigit(thousand)} Thousand`);
        if (hundred) parts.push(threeDigit(hundred));
        return parts.length ? parts.join(' ').trim() : 'Zero';
    };

    const amountWords = `${toWords(Math.round(grandTotal))} Rupees Only`;

    const upiQr = safeCompany.upiId
        ? `<img src="https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(`upi://pay?pa=${safeCompany.upiId}&pn=${encodeURIComponent(companyName)}&am=${grandTotal}&cu=INR`)}" alt="UPI QR">`
        : '';

    const invoiceLabel = invoiceNo || safeId.substr(0,6).toUpperCase();
    const pos = placeOfSupply || state;
    const docTitle = docType || 'Invoice';
    const taxModeValue = taxMode || 'CGST_SGST';
    const eway = ewayBill || data.eWayBill || '';
    const copyText = (copyLabel || '').toUpperCase();
    const layoutKey = type || 'corporate';

    const headerInvoiceMeta = (layoutKey === 'corporate' || layoutKey === 'print-optimized')
        ? `<div class="invoice-meta-box">
                <div class="info-title">Invoice Details</div>
                <div>Invoice No.: ${invoiceLabel}</div>
                <div>Date: ${dateStr}</div>
                <div>Place of supply: ${pos}</div>
                <div>PO Date: ${safe(poDate)}</div>
                <div>PO Number: ${safe(poNumber)}</div>
           </div>`
        : '';

    const headerHtml = `
    ${copyText ? `<div class="copy-label">${copyText}</div>` : ''}
    <div class="header">
        <div>
            <div class="company-name">${companyName}</div>
            <div class="company-meta">
                ${safe(address)}${city ? `, ${city}` : ''}${zip ? ` - ${zip}` : ''}<br>
                ${phone ? `Phone: ${phone}<br>` : ''}
                ${email ? `Email: ${email}<br>` : ''}
                GSTIN: ${gstin}<br>
                State: ${state}
            </div>
        </div>
        <div class="logo-box">
            ${safeCompany.logoUrl ? `<img src="${safeCompany.logoUrl}" alt="Logo">` : ''}
            ${headerInvoiceMeta}
        </div>
    </div>`;

    const billToHtml = `
        <div class="info-box">
            <div class="info-title">Bill To</div>
            <div>${safe(customer)}</div>
            ${customerAddress ? `<div class="muted">${safe(customerAddress)}</div>` : ''}
            ${(customerVillage || customerDistrict || customerMandal) ? `<div class="muted">${safe(`${customerVillage} ${customerMandal || ''} ${customerDistrict}`.trim())}</div>` : ''}
            ${(customerCity || customerState || customerZip) ? `<div class="muted">${safe(`${customerCity} ${customerState} ${customerZip}`.trim())}</div>` : ''}
            ${customerPhone ? `<div class="muted">Contact No.: ${safe(customerPhone)}</div>` : ''}
            ${customerTaxId ? `<div class="muted">GSTIN: ${safe(customerTaxId)}</div>` : ''}
            ${project ? `<div class="muted">Project: ${project}</div>` : ''}
        </div>`;

    const shipSame = shipTo?.shipSame !== undefined ? shipTo.shipSame : true;
    const shipName = shipSame ? customer : (shipTo?.shipName || '');
    const shipAddress = shipSame ? customerAddress : (shipTo?.shipAddress || '');
    const shipCity = shipSame ? customerCity : (shipTo?.shipCity || '');
    const shipState = shipSame ? customerState : (shipTo?.shipState || '');
    const shipZip = shipSame ? customerZip : (shipTo?.shipZip || '');
    const shipVillage = shipSame ? customerVillage : (shipTo?.shipVillage || '');
    const shipDistrict = shipSame ? customerDistrict : (shipTo?.shipDistrict || '');
    const shipMandal = shipSame ? customerMandal : (shipTo?.shipMandal || '');
    const shipPhone = shipSame ? customerPhone : (shipTo?.shipPhone || '');
    const shipTaxId = shipSame ? customerTaxId : (shipTo?.shipTaxId || '');

    const shipToHtml = `
        <div class="info-box">
            <div class="info-title">Ship To</div>
            <div>${safe(shipName)}</div>
            ${shipAddress ? `<div class="muted">${safe(shipAddress)}</div>` : ''}
            ${(shipVillage || shipDistrict || shipMandal) ? `<div class="muted">${safe(`${shipVillage} ${shipMandal || ''} ${shipDistrict}`.trim())}</div>` : ''}
            ${(shipCity || shipState || shipZip) ? `<div class="muted">${safe(`${shipCity} ${shipState} ${shipZip}`.trim())}</div>` : ''}
            ${shipPhone ? `<div class="muted">Contact No.: ${safe(shipPhone)}</div>` : ''}
            ${shipTaxId ? `<div class="muted">GSTIN: ${safe(shipTaxId)}</div>` : ''}
            ${project ? `<div class="muted">Project: ${project}</div>` : ''}
        </div>`;

    const transportHtml = `
        <div class="info-box">
            <div class="info-title">Transportation Details</div>
            ${transporter || eway ? `
                <div>Transporter: ${safe(transporter)}</div>
                <div class="muted">Vehicle: ${safe(vehicle)}</div>
                ${eway ? `<div class="muted">E-way Bill No: ${safe(eway)}</div>` : ''}
                ${driver ? `<div class="muted">Driver: ${safe(driver)}</div>` : ''}
            ` : `
                <div>Vehicle Details: ${safe(vehicle)}</div>
                <div class="muted">Driver: ${safe(driver)}</div>
            `}
        </div>`;

    const invoiceDetailsHtml = `
        <div class="info-box">
            <div class="info-title">Invoice Details</div>
            <div>Invoice No.: ${invoiceLabel}</div>
            <div>Date: ${dateStr}</div>
            <div>Place of supply: ${pos}</div>
            ${reverseCharge ? `<div>Reverse Charge: ${safe(reverseCharge)}</div>` : ''}
            ${taxModeValue ? `<div class="muted">Tax Mode: ${taxModeValue === 'IGST' ? 'IGST (Inter-State)' : 'CGST + SGST'}</div>` : ''}
            ${eway ? `<div class="muted">E-way Bill: ${safe(eway)}</div>` : ''}
            <div>PO Date: ${safe(poDate)}</div>
            <div>PO Number: ${safe(poNumber)}</div>
        </div>`;

    const itemsTableHtml = `
        <table>
            <thead>
                <tr>
                    <th>#</th>
                    <th>Item name</th>
                    <th>HSN/SAC</th>
                    <th class="text-end">Quantity</th>
                    <th class="text-end">Price/unit</th>
                    <th class="text-end">GST</th>
                    <th class="text-end">Final Rate</th>
                    <th class="text-end">Amount</th>
                </tr>
            </thead>
            <tbody>
                ${itemsRows}
            </tbody>
        </table>`;

    const taxTableHtml = `
        <table class="tax-table">
            <thead>
                <tr>
                    <th>Tax type</th>
                    <th class="text-end">Taxable amount</th>
                    <th class="text-end">Rate</th>
                    <th class="text-end">Tax amount</th>
                </tr>
            </thead>
            <tbody>
                ${taxModeValue === 'IGST' ? `
                <tr>
                    <td>IGST</td>
                    <td class="text-end">&#8377;${taxableAmount.toLocaleString()}</td>
                    <td class="text-end">${igstRate.toFixed(0)}%</td>
                    <td class="text-end">&#8377;${igstAmount.toLocaleString()}</td>
                </tr>
                ` : `
                <tr>
                    <td>SGST</td>
                    <td class="text-end">&#8377;${taxableAmount.toLocaleString()}</td>
                    <td class="text-end">${sgstRate.toFixed(0)}%</td>
                    <td class="text-end">&#8377;${sgstAmount.toLocaleString()}</td>
                </tr>
                <tr>
                    <td>CGST</td>
                    <td class="text-end">&#8377;${taxableAmount.toLocaleString()}</td>
                    <td class="text-end">${cgstRate.toFixed(0)}%</td>
                    <td class="text-end">&#8377;${cgstAmount.toLocaleString()}</td>
                </tr>
                `}
            </tbody>
        </table>`;

    const summaryTableHtml = `
        <table class="summary-table">
            <tbody>
                <tr><td>Sub Total</td><td class="text-end">&#8377;${itemsSubtotal.toLocaleString()}</td></tr>
                <tr><td>Transport</td><td class="text-end">&#8377;${transport.toLocaleString()}</td></tr>
                <tr><td>Total</td><td class="text-end">&#8377;${grandTotal.toLocaleString()}</td></tr>
                <tr><td>Received</td><td class="text-end">&#8377;${received.toLocaleString()}</td></tr>
                <tr><td>Balance</td><td class="text-end">&#8377;${balanceDue.toLocaleString()}</td></tr>
            </tbody>
        </table>`;

    const amountWordsHtml = `<div class="amount-words"><strong>Invoice Amount In Words:</strong> ${amountWords}</div>`;

    const paymentHtml = `
        <div class="payment-grid">
            <div class="payment-box combined-pay">
                <div class="info-title">Payment Details</div>
                <div class="pay-flex">
                    <div class="pay-qr">
                        <div class="muted">Scan to Pay</div>
                        ${upiQr || '<div class="muted">UPI QR not available</div>'}
                        ${safeCompany.upiId ? `<div class="muted mt-1 upi-id">UPI: ${safeCompany.upiId}</div>` : ''}
                        <div class="upi-logo">
                            <img src="upilogos.png" alt="UPI Apps" />
                        </div>
                    </div>
                    <div class="pay-bank">
                        <div><strong>Name:</strong> ${safe(safeCompany.bankName)}</div>
                        <div><strong>Acc. Name:</strong> ${safe(safeCompany.bankAccountName)}</div>
                        <div><strong>Acc. No:</strong> ${safe(safeCompany.bankAccountNo)}</div>
                        <div><strong>IFSC:</strong> ${safe(safeCompany.bankIfsc)}</div>
                        <div><strong>Branch:</strong> ${safe(safeCompany.bankBranch)}</div>
                    </div>
                </div>
            </div>
            <div class="sign-box">
                For: ${companyName}<br>
                ${safeCompany.signatureUrl ? `<img src="${safeCompany.signatureUrl}" style="max-height:60px;"><br>` : ''}
                <span class="sign-line">Authorized Signatory</span>
            </div>
        </div>`;

    let infoHtml = '';
    let totalsHtml = '';

    if (layoutKey === 'original') {
        infoHtml = `
            <div class="info-grid four-col">
                ${billToHtml}
                ${shipToHtml}
                ${transportHtml}
                ${invoiceDetailsHtml}
            </div>`;
        totalsHtml = `
            <div class="totals-grid">
                ${taxTableHtml}
                ${summaryTableHtml}
            </div>`;
    } else if (layoutKey === 'accounting') {
        infoHtml = `
            <div class="info-grid three-col">
                ${billToHtml}
                ${shipToHtml}
                <div class="info-box">
                    <div class="info-title">Invoice Details</div>
                    <div>Invoice No.: ${invoiceLabel}</div>
                    <div>Date: ${dateStr}</div>
                    <div>Place of supply: ${state}</div>
                    <div class="muted">PO Date: ${safe(poDate)}</div>
                    <div class="muted">PO Number: ${safe(poNumber)}</div>
                    <div class="muted" style="margin-top:6px;">Vehicle: ${safe(vehicle)}</div>
                    <div class="muted">Driver: ${safe(driver)}</div>
                </div>
            </div>`;
        totalsHtml = `
            <div class="totals-grid">
                ${taxTableHtml}
                ${summaryTableHtml}
            </div>`;
    } else if (layoutKey === 'manufacturing') {
        infoHtml = `
            <div class="info-grid two-col">
                <div class="stacked">
                    ${billToHtml}
                    ${shipToHtml}
                </div>
                <div class="stacked">
                    ${transportHtml}
                    ${invoiceDetailsHtml}
                </div>
            </div>`;
        totalsHtml = `
            <div class="totals-grid">
                ${taxTableHtml}
                ${summaryTableHtml}
            </div>`;
    } else if (layoutKey === 'clean-grid') {
        infoHtml = `
            <div class="info-grid four-col">
                ${billToHtml}
                ${shipToHtml}
                ${transportHtml}
                ${invoiceDetailsHtml}
            </div>`;
        totalsHtml = `
            <div class="summary-box">
                <div class="totals-grid">
                    ${taxTableHtml}
                    ${summaryTableHtml}
                </div>
            </div>`;
    } else if (layoutKey === 'print-optimized') {
        infoHtml = `
            <div class="info-grid two-col">
                ${billToHtml}
                ${shipToHtml}
            </div>
            <div class="info-grid two-col mt-tight">
                <div></div>
                ${transportHtml}
            </div>`;
        totalsHtml = `
            <div class="totals-right-box">
                ${taxTableHtml}
                ${summaryTableHtml}
            </div>`;
    } else {
        // corporate default
        infoHtml = `
            <div class="info-grid two-col">
                ${billToHtml}
                ${shipToHtml}
            </div>
            <div class="info-grid two-col mt-tight">
                <div></div>
                ${transportHtml}
            </div>`;
        totalsHtml = `
            <div class="totals-grid right-summary">
                ${taxTableHtml}
                ${summaryTableHtml}
            </div>`;
    }

    return `
<html>
<head>
    <title>Invoice #${invoiceLabel}</title>
    <style>
        @page { size: A4; margin: 12mm; }
        body { font-family: Arial, Helvetica, sans-serif; color: #111; margin: 0; }
        .page-border { border: 1px solid #1e6b8a; padding: 10px; }
        .copy-label { text-align: right; font-size: 12px; font-weight: 700; letter-spacing: 1px; color: #555; }
        .header { display: grid; grid-template-columns: 1fr 180px; gap: 20px; border-bottom: 1px solid #222; padding-bottom: 12px; }
        .company-name { font-size: 20px; font-weight: 700; text-transform: uppercase; }
        .company-meta { font-size: 12px; line-height: 1.5; margin-top: 6px; }
        .logo-box { text-align: right; }
        .logo-box img { max-width: 120px; max-height: 120px; }
        .invoice-meta-box { font-size: 11px; line-height: 1.5; margin-top: 8px; }
        .title { text-align: center; color: #146c94; font-size: 20px; font-weight: 700; margin: 12px 0; }
        .info-grid { display: grid; gap: 12px; font-size: 12px; }
        .info-grid.two-col { grid-template-columns: 1fr 1fr; }
        .info-grid.three-col { grid-template-columns: 1fr 1fr 1fr; }
        .info-grid.four-col { grid-template-columns: 1fr 1fr 1fr 1fr; }
        .mt-tight { margin-top: 10px; }
        .info-box { border: 1px solid #ddd; padding: 8px; min-height: 90px; }
        .info-title { font-weight: 700; margin-bottom: 4px; }
        .muted { color: #6c757d; font-size: 11px; }
        table { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 10px; }
        thead th { background: #1e6b8a; color: #fff; padding: 6px; border: 1px solid #1e6b8a; }
        tbody td { border: 1px solid #ddd; padding: 6px; vertical-align: top; }
        .text-end { text-align: right; }
        .item-name { font-weight: 600; }
        .totals-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 10px; }
        .right-summary { justify-items: end; }
        .tax-table th { background: #1e6b8a; color: #fff; }
        .summary-table td { padding: 6px; border-bottom: 1px solid #ddd; }
        .summary-table tr:last-child td { border-bottom: none; font-weight: 700; }
        .amount-words { margin-top: 8px; font-size: 12px; }
        .payment-grid { display: grid; grid-template-columns: 2fr 1fr; gap: 12px; margin-top: 12px; align-items: start; }
        .payment-box { border: 1px solid #ddd; border-radius: 6px; padding: 4px 6px; }
        .combined-pay { min-height: auto; }
        .pay-flex { display: grid; grid-template-columns: 96px 1fr; align-items: center; }
        .pay-qr { text-align: center; line-height: 1.2; }
        .pay-qr .upi-id { font-size: 10px; line-height: 1.2; word-break: break-all; display: inline-block; max-width: 90px; }
        .pay-qr img { width: 76px; height: 76px; display: block; margin: 2px auto 4px; }
        .pay-bank { font-size: 12px; padding-left: 8px; border-left: 1px solid #e5e5e5; line-height: 1.35; }
        .sign-box { text-align: right; margin-top: 20px; font-size: 12px; border: none; }
        .sign-line { margin-top: 8px; border-top: 1px solid #111; display: inline-block; padding-top: 4px; }
        .invoice-footer-note { margin-top: 12px; text-align: center; font-size: 11px; color: #666; border-top: 1px solid #eee; padding-top: 6px; }
        .upi-logo { margin-top: 4px; }
        .upi-logo img { height: 18px; width: auto; display: block; margin: 0 auto; object-fit: contain; image-rendering: auto; }
        .summary-box { border: 1px solid #ddd; padding: 8px; margin-top: 10px; }
        .totals-right-box { width: 55%; margin-left: auto; border: 1px solid #ddd; padding: 8px; margin-top: 10px; }
        .stacked .info-box + .info-box { margin-top: 10px; }
    </style>
</head>
<body>
    <div class="page-border">
        ${headerHtml}

        <div class="title">${docTitle}</div>

        ${infoHtml}
        ${itemsTableHtml}
        ${totalsHtml}
        ${amountWordsHtml}
        ${paymentHtml}
        <div class="invoice-footer-note">Thank you for your business!</div>
    </div>
</body>
</html>
    `;
}

window.getInvoiceTemplate = getInvoiceTemplate;
  
