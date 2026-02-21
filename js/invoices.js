import { db, remoteConfig } from './firebase-config.js';
import { checkAuth, formatDate, downloadCSV, downloadPDF, fetchPostOfficeByPincode } from './dashboard.js';
import { showAlert } from './auth.js';
import { initializeStateDistrictPair, setStateDistrictValues } from './location-data.js';

const invoicesTable = document.getElementById('invoicesTable');
const estimatesTable = document.getElementById('estimatesTable');
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

function toFiniteNumber(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

function resolveGstRate(value, fallback = businessSettings.gstRate) {
    const n = Number(value);
    if (Number.isFinite(n) && n > 0) return n;
    const fb = Number(fallback);
    return Number.isFinite(fb) ? fb : 0;
}

function resolveHsn(value, ...fallbacks) {
    const candidates = [value, ...fallbacks];
    for (const candidate of candidates) {
        const normalized = String(candidate ?? '').trim();
        if (normalized) return normalized;
    }
    return '';
}

function inferHsnFromItem(item = {}) {
    const text = `${item?.name || ''} ${item?.category || ''}`.toLowerCase();
    if (!text.trim()) return '';
    if (/(rcc|pipe|septic|tank|manhole|concrete|cement)/.test(text)) return '6810';
    if (/(steel|tmt|bar|rod)/.test(text)) return '7214';
    return '';
}

function resolveInvoiceItemPrice(item = {}) {
    return toFiniteNumber(
        item.sellingPrice ?? item.price ?? item.salePrice ?? item.rate ?? item.unitPrice ?? 0,
        0
    );
}

function getInvoiceAmount(inv = {}) {
    const directCandidates = [
        inv.amount,
        inv.total,
        inv.totalAmount,
        inv.grandTotal,
        inv.finalAmount,
        inv.netAmount
    ];
    for (const candidate of directCandidates) {
        const n = Number(candidate);
        if (Number.isFinite(n)) return n;
    }

    const items = Array.isArray(inv.items) ? inv.items : [];
    const itemsTotal = items.reduce((sum, item) => {
        const qty = toFiniteNumber(item.quantity, 0);
        const price = toFiniteNumber(item.price ?? item.rate ?? item.unitPrice ?? item.sellingPrice, 0);
        const gstRate = toFiniteNumber(item.gstRate ?? item.gst, 0);
        const finalRate = price + (price * gstRate / 100);
        return sum + (qty * finalRate);
    }, 0);
    return itemsTotal + toFiniteNumber(inv.transportCost, 0);
}

function isRawMaterialInventoryItem(item = {}) {
    const category = String(item.category || '').trim().toLowerCase();
    const source = String(item.source || '').trim().toLowerCase();
    if (source.includes('raw_material')) return true;
    const rawTokens = ['raw material', 'cement', 'sand', 'dust', 'aggregate', 'steel', 'fly ash', 'admixture', 'chemical'];
    return rawTokens.some(token => category.includes(token));
}

function normalizeInvoiceText(value) {
    return String(value || '').trim();
}

function buildInvoiceItemMetaLine(item = {}) {
    const parts = [
        normalizeInvoiceText(item.category || item.productCategory || item.productType || ''),
        normalizeInvoiceText(item.pipeType || ''),
        normalizeInvoiceText(item.loadClass || '')
    ].filter(Boolean);
    return parts.join(' | ');
}

function buildInvoiceItemDisplayName(item = {}) {
    const name = normalizeInvoiceText(item.name || item.itemName || 'Item') || 'Item';
    const meta = buildInvoiceItemMetaLine(item);
    return meta ? `${name} | ${meta}` : name;
}

function parseInvoiceItemNameFromOption(option) {
    if (!option) return 'Item';
    return normalizeInvoiceText(option.dataset.name || option.textContent || '').split(' (Stock:')[0] || 'Item';
}

function normalizeStateForTax(value) {
    return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function resolveAutoTaxMode(companyState, customerState) {
    const company = normalizeStateForTax(companyState);
    const customer = normalizeStateForTax(customerState);
    if (!company || !customer) return 'CGST_SGST';
    return company === customer ? 'CGST_SGST' : 'IGST';
}

function resolveTaxMode(preferredTaxMode, companyState, customerState) {
    const explicit = String(preferredTaxMode || '').trim().toUpperCase();
    if (explicit === 'IGST' || explicit === 'CGST_SGST') return explicit;
    return resolveAutoTaxMode(companyState, customerState);
}

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

function encodeAddressList(addresses = []) {
    try {
        return encodeURIComponent(JSON.stringify(addresses || []));
    } catch (error) {
        return encodeURIComponent('[]');
    }
}

function decodeAddressList(encoded = '') {
    if (!encoded) return [];
    try {
        const data = JSON.parse(decodeURIComponent(encoded));
        return Array.isArray(data) ? data : [];
    } catch (error) {
        return [];
    }
}

function normalizeCustomerAddresses(customer = {}, kind = 'bill') {
    const key = kind === 'ship' ? 'shipToAddresses' : 'billToAddresses';
    const list = Array.isArray(customer?.[key]) ? customer[key] : [];
    if (list.length) {
        const mapped = list.map((a, idx) => ({
            label: String(a?.label || (kind === 'ship' ? 'Ship' : 'Bill')).trim() || (kind === 'ship' ? 'Ship' : 'Bill'),
            address: String(a?.address || '').trim(),
            state: String(a?.state || '').trim(),
            district: String(a?.district || '').trim(),
            mandal: String(a?.mandal || '').trim(),
            village: String(a?.village || '').trim(),
            zip: String(a?.zip || '').trim(),
            isDefault: Boolean(a?.isDefault) || idx === 0
        }));
        if (!mapped.some(a => a.isDefault) && mapped[0]) mapped[0].isDefault = true;
        return mapped;
    }
    const legacy = {
        label: kind === 'ship' ? 'Ship' : 'Bill',
        address: String(customer?.address || '').trim(),
        state: String(customer?.state || '').trim(),
        district: String(customer?.district || '').trim(),
        mandal: String(customer?.mandal || '').trim(),
        village: String(customer?.village || '').trim(),
        zip: String(customer?.zip || '').trim(),
        isDefault: true
    };
    return (legacy.address || legacy.state || legacy.district || legacy.mandal || legacy.village || legacy.zip) ? [legacy] : [];
}

function getDefaultAddress(addresses = []) {
    if (!Array.isArray(addresses) || !addresses.length) return null;
    return addresses.find(a => a?.isDefault) || addresses[0] || null;
}

function getAddressOptionLabel(address = {}, idx = 0, kind = 'bill') {
    const customLabel = String(address?.label || '').trim();
    const label = customLabel || `${kind === 'ship' ? 'Ship' : 'Bill'} ${idx + 1}`;
    const line = String(address?.address || '').trim();
    return line ? `${label} - ${line}` : label;
}

function populateInvoiceAddressSelect(selectEl, addresses = [], kind = 'bill') {
    if (!selectEl) return;
    const placeholder = kind === 'ship' ? 'Select Ship To...' : 'Select Bill To...';
    selectEl.innerHTML = `<option value="">${placeholder}</option>`;
    addresses.forEach((address, idx) => {
        const option = document.createElement('option');
        option.value = String(idx);
        option.textContent = getAddressOptionLabel(address, idx, kind);
        option.dataset.label = String(address?.label || '').trim();
        option.dataset.address = String(address?.address || '');
        option.dataset.state = String(address?.state || '');
        option.dataset.district = String(address?.district || '');
        option.dataset.mandal = String(address?.mandal || '');
        option.dataset.village = String(address?.village || '');
        option.dataset.zip = String(address?.zip || '');
        option.dataset.isDefault = String(Boolean(address?.isDefault));
        selectEl.appendChild(option);
    });
    const defaultIdx = addresses.findIndex(a => a?.isDefault);
    if (defaultIdx >= 0) {
        selectEl.value = String(defaultIdx);
    } else if (addresses.length) {
        selectEl.value = '0';
    }
}

function getSelectedAddressFromSelect(selectId) {
    const selectEl = document.getElementById(selectId);
    const option = selectEl?.selectedOptions?.[0];
    if (!option || !option.value) return null;
    return {
        label: option.dataset.label || '',
        address: option.dataset.address || '',
        state: option.dataset.state || '',
        district: option.dataset.district || '',
        mandal: option.dataset.mandal || '',
        village: option.dataset.village || '',
        zip: option.dataset.zip || ''
    };
}

function populateInvoiceAddressSelectorsFromCustomerOption(customerOption) {
    const billSelect = document.getElementById('invBillToSelect');
    const shipSelect = document.getElementById('invShipToSelect');
    const billAddresses = decodeAddressList(customerOption?.dataset?.billto || '');
    const shipAddressesRaw = decodeAddressList(customerOption?.dataset?.shipto || '');
    const shipAddresses = shipAddressesRaw.length ? shipAddressesRaw : billAddresses;

    populateInvoiceAddressSelect(billSelect, billAddresses, 'bill');
    populateInvoiceAddressSelect(shipSelect, shipAddresses, 'ship');
}

function escapeAttr(value) {
    return String(value || '').replace(/"/g, '&quot;');
}

function buildCustomerOptionHtml(customer = {}) {
    const name = String(customer.name || '').trim();
    const balance = Number(customer.outstandingBalance || 0);
    const balText = balance < 0 ? ` (Credit: ₹${Math.abs(balance)})` : '';
    const billTo = normalizeCustomerAddresses(customer, 'bill');
    const shipTo = normalizeCustomerAddresses(customer, 'ship');
    const primaryBill = getDefaultAddress(billTo) || {};
    return `
        <option value="${escapeAttr(name)}"
            data-balance="${balance}"
            data-address="${escapeAttr(primaryBill.address || '')}"
            data-city="${escapeAttr(customer.city || '')}"
            data-state="${escapeAttr(primaryBill.state || customer.state || '')}"
            data-zip="${escapeAttr(primaryBill.zip || customer.zip || '')}"
            data-village="${escapeAttr(primaryBill.village || customer.village || '')}"
            data-district="${escapeAttr(primaryBill.district || customer.district || '')}"
            data-mandal="${escapeAttr(primaryBill.mandal || customer.mandal || '')}"
            data-phone="${escapeAttr(customer.phone || '')}"
            data-taxid="${escapeAttr(customer.taxId || '')}"
            data-billto="${escapeAttr(encodeAddressList(billTo))}"
            data-shipto="${escapeAttr(encodeAddressList(shipTo))}"
        >${name}${balText}</option>
    `;
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
    const docTypeEl = document.getElementById('invDocType');
    if (docTypeEl) {
        docTypeEl.addEventListener('change', () => {
            syncSaveInvoiceButtonLabel();
            updateDocumentModeUi();
            updateInvoicePreview();
        });
    }
    ['invFontFamily', 'invFontScale', 'invBusinessNameOverride', 'invBusinessAddressOverride', 'invShowGstin', 'invEnableCustomTerms', 'invCustomTermsText']
        .forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;
            const ev = (id === 'invShowGstin' || id === 'invFontScale' || id === 'invFontFamily' || id === 'invEnableCustomTerms') ? 'change' : 'input';
            el.addEventListener(ev, () => {
                if (id === 'invEnableCustomTerms') toggleInvoiceTermsEditor();
                updateInvoicePreview();
            });
        });
    const toggleDocDesignBtn = document.getElementById('toggleDocDesignBtn');
    if (toggleDocDesignBtn) {
        toggleDocDesignBtn.addEventListener('click', () => {
            const panel = document.getElementById('docDesignPanel');
            if (!panel) return;
            panel.classList.toggle('d-none');
        });
    }
    const fillDefaultTermsBtn = document.getElementById('invFillDefaultTermsBtn');
    if (fillDefaultTermsBtn) {
        fillDefaultTermsBtn.addEventListener('click', () => {
            const enableEl = document.getElementById('invEnableCustomTerms');
            const textEl = document.getElementById('invCustomTermsText');
            if (enableEl && !enableEl.checked) enableEl.checked = true;
            toggleInvoiceTermsEditor();
            if (textEl) textEl.value = getDefaultInvoiceTermsText();
            updateInvoicePreview();
        });
    }
    syncSaveInvoiceButtonLabel();
    updateDocumentModeUi();
    toggleInvoiceTermsEditor();

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
    const billToSelect = document.getElementById('invBillToSelect');
    const shipToSelect = document.getElementById('invShipToSelect');
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
            populateInvoiceAddressSelectorsFromCustomerOption(custSelect.selectedOptions?.[0] || null);
            syncShipToFromBillTo();
            updateInvoicePreview();
        });
    }

    if (billToSelect) {
        billToSelect.addEventListener('change', () => {
            syncShipToFromBillTo();
            updateInvoicePreview();
        });
    }

    if (shipToSelect) {
        shipToSelect.addEventListener('change', () => {
            const shipSame = document.getElementById('invShipSame');
            if (!shipSame?.checked) {
                syncShipToFromBillTo();
                updateInvoicePreview();
            }
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

function syncSaveInvoiceButtonLabel() {
    if (!saveInvoiceBtn) return;
    const docType = getDocumentTypeFromForm();
    if (docType === 'Estimate') {
        saveInvoiceBtn.textContent = 'Create Estimate';
        return;
    }
    saveInvoiceBtn.textContent = 'Create Invoice';
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
            const c = doc.data() || {};
            custSelect.innerHTML += buildCustomerOptionHtml(c);
        });
        custSelect.innerHTML += '<option value="__add_customer__">+ Add Customer...</option>';
        populateInvoiceAddressSelectorsFromCustomerOption(custSelect.selectedOptions?.[0] || null);
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
    const docTypeEl = document.getElementById('invDocType');
    if (docTypeEl) docTypeEl.value = 'Invoice';
    const fontFamilyEl = document.getElementById('invFontFamily');
    if (fontFamilyEl) fontFamilyEl.value = 'Arial, Helvetica, sans-serif';
    const fontScaleEl = document.getElementById('invFontScale');
    if (fontScaleEl) fontScaleEl.value = 'medium';
    const bizNameOverrideEl = document.getElementById('invBusinessNameOverride');
    if (bizNameOverrideEl) bizNameOverrideEl.value = '';
    const bizAddressOverrideEl = document.getElementById('invBusinessAddressOverride');
    if (bizAddressOverrideEl) bizAddressOverrideEl.value = '';
    const showGstinEl = document.getElementById('invShowGstin');
    if (showGstinEl) showGstinEl.checked = true;
    const enableCustomTermsEl = document.getElementById('invEnableCustomTerms');
    if (enableCustomTermsEl) enableCustomTermsEl.checked = false;
    const customTermsTextEl = document.getElementById('invCustomTermsText');
    if (customTermsTextEl) customTermsTextEl.value = '';
    toggleInvoiceTermsEditor();
    document.getElementById('invBalance').textContent = '₹0.00';
    syncSaveInvoiceButtonLabel();
    updateDocumentModeUi();
    clearSignaturePad();
    const shipSame = document.getElementById('invShipSame');
    if (shipSame) shipSame.checked = true;
    const billToSelect = document.getElementById('invBillToSelect');
    const shipToSelect = document.getElementById('invShipToSelect');
    if (billToSelect) billToSelect.innerHTML = '<option value="">Select Bill To...</option>';
    if (shipToSelect) shipToSelect.innerHTML = '<option value="">Select Ship To...</option>';
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
        const [custSnap, invSnap, vehicleSnap, projectSnap, productSnap] = await Promise.all([
            db.collection('users').doc(businessId).collection('customers').orderBy('name').get(),
            db.collection('users').doc(businessId).collection('inventory').get(),
            db.collection('users').doc(businessId).collection('vehicles').get(),
            db.collection('users').doc(businessId).collection('orders').where('status', 'in', ['Pending', 'Processing', 'Dispatched']).get(),
            db.collection('users').doc(businessId).collection('product_master').get()
        ]);

        custSelect.innerHTML = '<option value="">Select Customer...</option>';
        custSnap.forEach(doc => {
            const c = doc.data() || {};
            custSelect.innerHTML += buildCustomerOptionHtml(c);
        });
        custSelect.innerHTML += '<option value="__add_customer__">+ Add Customer...</option>';
        populateInvoiceAddressSelectorsFromCustomerOption(custSelect.selectedOptions?.[0] || null);
        
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

        const productMetaByName = new Map();
        productSnap.forEach((doc) => {
            const p = doc.data() || {};
            const key = String(p.name || p.productName || '').trim().toLowerCase();
            if (!key) return;
            productMetaByName.set(key, {
                hsn: resolveHsn(p.hsn, inferHsnFromItem(p)),
                gstRate: Number(p.gstRate ?? 0) || 0
            });
        });

        inventoryCache = invSnap.docs
            .map(doc => {
                const item = { id: doc.id, ...doc.data() };
                const key = String(item.name || '').trim().toLowerCase();
                const meta = productMetaByName.get(key);
                if (meta) {
                    item.hsn = resolveHsn(item.hsn, meta.hsn, inferHsnFromItem(item));
                    if (!(Number(item.gstRate) > 0) && Number(meta.gstRate) > 0) {
                        item.gstRate = Number(meta.gstRate);
                    }
                } else {
                    item.hsn = resolveHsn(item.hsn, inferHsnFromItem(item));
                }
                return item;
            })
            .filter(item => !isRawMaterialInventoryItem(item))
            .filter(item => Number(item.quantity || 0) > 0);
        
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
        const gstRate = resolveGstRate(i.gstRate, defaultGst);
        const hsn = resolveHsn(i.hsn, inferHsnFromItem(i));
        const sellingPrice = resolveInvoiceItemPrice(i);
        const costPrice = toFiniteNumber(i.costPrice ?? i.purchasePrice, 0);
        const category = normalizeInvoiceText(i.productCategory || i.productType || i.category || '');
        const pipeType = normalizeInvoiceText(i.pipeType || '');
        const loadClass = normalizeInvoiceText(i.loadClass || '');
        const displayName = buildInvoiceItemDisplayName({ name: i.name, category, pipeType, loadClass });
        return `<option value="${escapeAttr(i.id)}" data-name="${escapeAttr(i.name || '')}" data-category="${escapeAttr(category)}" data-pipetype="${escapeAttr(pipeType)}" data-loadclass="${escapeAttr(loadClass)}" data-price="${sellingPrice}" data-cost="${costPrice}" data-hsn="${escapeAttr(hsn)}" data-gst="${gstRate}">${displayName} (Stock: ${i.quantity})</option>`;
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
        opt.dataset.name = prefill.name || '';
        opt.dataset.category = prefill.category || prefill.productCategory || prefill.productType || '';
        opt.dataset.pipetype = prefill.pipeType || '';
        opt.dataset.loadclass = prefill.loadClass || '';
        opt.textContent = `${buildInvoiceItemDisplayName(prefill)} (Custom)`;
        opt.dataset.price = prefill.price || 0;
        opt.dataset.cost = prefill.costPrice || 0;
        opt.dataset.hsn = prefill.hsn || '';
        opt.dataset.gst = resolveGstRate(prefill.gstRate, defaultGst);
        select.appendChild(opt);
        select.value = '__custom__';
    }

    calculateInvoiceTotal();
}

// Expose to window for inline onchange
window.updateRowPrice = (select) => {
    const option = select.selectedOptions[0];
    const price = toFiniteNumber(option?.dataset?.price, 0);
    const row = select.closest('tr');
    if (!row) return;
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
        const gstRate = resolveGstRate(option?.dataset?.gst, businessSettings.gstRate);
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

function toggleInvoiceTermsEditor() {
    const enableEl = document.getElementById('invEnableCustomTerms');
    const wrapEl = document.getElementById('invCustomTermsWrap');
    const textEl = document.getElementById('invCustomTermsText');
    const enabled = Boolean(enableEl?.checked);
    if (wrapEl) wrapEl.classList.toggle('d-none', !enabled);
    if (textEl) textEl.disabled = !enabled;
}

function getDefaultInvoiceTermsText() {
    return [
        '1. Goods once sold will not be taken back.',
        '2. Payment due within 7 days from invoice date unless otherwise agreed.',
        '3. Interest @18% p.a. may be charged on overdue balances.',
        '4. Any shortage/damage must be reported at the time of delivery.',
        '5. Subject to local jurisdiction only.'
    ].join('\n');
}

function getCopyLabelDisplay(value) {
    const v = (value || '').toString().trim();
    if (v === 'Original') return 'Original for Recipient';
    if (v === 'Duplicate') return 'Duplicate for Transporter';
    if (v === 'Triplicate') return 'Triplicate for Supplier';
    return v;
}

function getSelectedInvoiceCopies() {
    if (isEstimateDocumentType()) return ['Original'];
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
    if (isEstimateDocumentType()) {
        if (invoiceCopyOriginal) invoiceCopyOriginal.checked = true;
        if (invoiceCopyDuplicate) invoiceCopyDuplicate.checked = false;
        if (invoiceCopyTriplicate) invoiceCopyTriplicate.checked = false;
        if (invoiceCopySummary) invoiceCopySummary.textContent = getCopyLabelDisplay('Original');
        if (invoiceCopyAll) {
            invoiceCopyAll.checked = false;
            invoiceCopyAll.indeterminate = false;
        }
        if (refreshPreview) updateInvoicePreview();
        return;
    }
    const checkedCount = [invoiceCopyOriginal, invoiceCopyDuplicate, invoiceCopyTriplicate]
        .filter(c => c?.checked)
        .length;

    if (checkedCount === 0 && invoiceCopyOriginal) {
        invoiceCopyOriginal.checked = true;
    }

    const selected = getSelectedInvoiceCopies();
    if (invoiceCopySummary) {
        invoiceCopySummary.textContent = selected.length === 3
            ? `${getCopyLabelDisplay('Original')}, ${getCopyLabelDisplay('Duplicate')}, ${getCopyLabelDisplay('Triplicate')}`
            : selected.map(getCopyLabelDisplay).join(', ');
    }

    if (invoiceCopyAll) {
        invoiceCopyAll.checked = selected.length === 3;
        invoiceCopyAll.indeterminate = selected.length > 0 && selected.length < 3;
    }

    if (refreshPreview) updateInvoicePreview();
}

function isEstimateDocumentType() {
    return getDocumentTypeFromForm() === 'Estimate';
}

function updateDocumentModeUi() {
    const isEstimate = isEstimateDocumentType();
    const copyWrap = document.getElementById('invoiceCopyDropdownWrap');
    const printBtn = document.getElementById('printInvoicePreviewBtn');
    if (copyWrap) copyWrap.classList.toggle('d-none', isEstimate);
    if (printBtn) printBtn.innerHTML = isEstimate
        ? '<i class="fas fa-print me-1"></i>Print Estimate'
        : '<i class="fas fa-print me-1"></i>Print Selected';
    syncInvoiceCopySelection(false);
}

function toggleShipToFields() {
    const shipSame = document.getElementById('invShipSame');
    const disabled = shipSame ? shipSame.checked : true;
    const fields = [
        'invShipToSelect',
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
    if (!shipSame || !shipSame.checked) {
        return;
    }
    const shipToSelect = document.getElementById('invShipToSelect');
    if (shipToSelect) shipToSelect.value = '';
}

function getBillToData() {
    const customerSelect = document.getElementById('invCustomerSelect');
    const customerOption = customerSelect?.selectedOptions?.[0] || null;
    const selectedBillAddress = getSelectedAddressFromSelect('invBillToSelect');
    const fallback = {
        label: '',
        address: customerOption?.dataset?.address || '',
        state: customerOption?.dataset?.state || '',
        zip: customerOption?.dataset?.zip || '',
        village: customerOption?.dataset?.village || '',
        district: customerOption?.dataset?.district || '',
        mandal: customerOption?.dataset?.mandal || ''
    };
    return {
        billLabel: selectedBillAddress?.label || fallback.label || '',
        customerAddress: selectedBillAddress?.address || fallback.address || '',
        customerCity: customerOption?.dataset?.city || '',
        customerState: selectedBillAddress?.state || fallback.state || '',
        customerZip: selectedBillAddress?.zip || fallback.zip || '',
        customerVillage: selectedBillAddress?.village || fallback.village || '',
        customerDistrict: selectedBillAddress?.district || fallback.district || '',
        customerMandal: selectedBillAddress?.mandal || fallback.mandal || '',
        customerPhone: customerOption?.dataset?.phone || '',
        customerTaxId: customerOption?.dataset?.taxid || ''
    };
}

function getShipToData() {
    const shipSame = document.getElementById('invShipSame');
    const shipChecked = shipSame ? shipSame.checked : true;
    const customerSelect = document.getElementById('invCustomerSelect');
    const customerOption = customerSelect?.selectedOptions?.[0] || null;
    const selectedBillAddress = getSelectedAddressFromSelect('invBillToSelect');
    const selectedShipAddress = getSelectedAddressFromSelect('invShipToSelect');
    const effectiveAddress = shipChecked ? selectedBillAddress : selectedShipAddress;
    const fallbackAddress = shipChecked
        ? {
            label: '',
            address: customerOption?.dataset?.address || '',
            state: customerOption?.dataset?.state || '',
            zip: customerOption?.dataset?.zip || '',
            village: customerOption?.dataset?.village || '',
            district: customerOption?.dataset?.district || '',
            mandal: customerOption?.dataset?.mandal || ''
        }
        : {};
    return {
        shipSame: shipChecked,
        shipLabel: shipChecked
            ? (selectedBillAddress?.label || '')
            : (selectedShipAddress?.label || ''),
        shipName: (effectiveAddress?.label || customerOption?.value || ''),
        shipPhone: customerOption?.dataset?.phone || '',
        shipAddress: effectiveAddress?.address || fallbackAddress.address || '',
        shipCity: '',
        shipState: effectiveAddress?.state || fallbackAddress.state || '',
        shipZip: effectiveAddress?.zip || fallbackAddress.zip || '',
        shipVillage: effectiveAddress?.village || fallbackAddress.village || '',
        shipDistrict: effectiveAddress?.district || fallbackAddress.district || '',
        shipMandal: effectiveAddress?.mandal || fallbackAddress.mandal || '',
        shipTaxId: customerOption?.dataset?.taxid || ''
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
    if (villageEl) villageEl.value = data.village || villageEl.value;
    if (mandalEl) mandalEl.value = data.mandal || mandalEl.value;
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

function getInvoiceTemplateOptionsFromForm() {
    const showGstinEl = document.getElementById('invShowGstin');
    const customTermsEnabledEl = document.getElementById('invEnableCustomTerms');
    const customTermsTextEl = document.getElementById('invCustomTermsText');
    const sizeToken = (document.getElementById('invFontScale')?.value || 'medium').toLowerCase();
    const sizeMap = {
        xxlarge: 130,
        xlarge: 120,
        large: 110,
        medium: 100,
        xmedium: 95,
        small: 90,
        xsmall: 85
    };
    const fontScale = sizeMap[sizeToken] || 100;
    return {
        businessNameOverride: (document.getElementById('invBusinessNameOverride')?.value || '').trim(),
        businessAddressOverride: (document.getElementById('invBusinessAddressOverride')?.value || '').trim(),
        showGstin: showGstinEl ? Boolean(showGstinEl.checked) : true,
        customTermsEnabled: customTermsEnabledEl ? Boolean(customTermsEnabledEl.checked) : false,
        customTermsText: customTermsTextEl ? String(customTermsTextEl.value || '').trim() : '',
        fontFamily: document.getElementById('invFontFamily')?.value || 'Arial, Helvetica, sans-serif',
        fontScale
    };
}

function applyInvoiceCompanyOverrides(company = {}, options = {}) {
    const next = { ...(company || {}) };
    if (options.businessNameOverride) next.companyName = options.businessNameOverride;
    if (options.businessAddressOverride) next.address = options.businessAddressOverride;
    return next;
}

function getDocumentTypeFromForm() {
    const val = document.getElementById('invDocType')?.value || 'Invoice';
    return val === 'Quotation' ? 'Estimate' : val;
}

function getDocumentStatus(docType, balance, amountPaid) {
    if (docType === 'Estimate') return 'Estimated';
    return balance <= 0 ? 'Paid' : (amountPaid > 0 ? 'Partial' : 'Pending');
}

function buildInvoicePreviewData(company) {
    const customerSelect = document.getElementById('invCustomerSelect');
    const customer = customerSelect?.value || '';
    const billToData = getBillToData();
    const customerAddress = billToData.customerAddress;
    const customerCity = billToData.customerCity;
    const customerState = billToData.customerState;
    const customerZip = billToData.customerZip;
    const customerVillage = billToData.customerVillage;
    const customerDistrict = billToData.customerDistrict;
    const customerMandal = billToData.customerMandal;
    const customerPhone = billToData.customerPhone;
    const customerTaxId = billToData.customerTaxId;
    const dateVal = document.getElementById('invDate')?.value || '';
    const project = document.getElementById('invProjectSelect')?.value || '';
    const poNumber = document.getElementById('invPoNumber')?.value || '';
    const poDateVal = document.getElementById('invPoDate')?.value || '';
    const vehicle = document.getElementById('invVehicle')?.value || '';
    const driver = document.getElementById('invDriver')?.value || '';
    const transportCost = parseFloat(document.getElementById('invTransportCost')?.value || '0') || 0;
    const amountPaid = parseFloat(document.getElementById('invAmountPaid')?.value || '0') || 0;
    const copyLabel = getPrimaryInvoiceCopyLabel();
    const docType = getDocumentTypeFromForm();
    const templateOptions = getInvoiceTemplateOptionsFromForm();
    const companyForDoc = applyInvoiceCompanyOverrides(company, templateOptions);
    const shipTo = getShipToData();
    const placeOfSupply = customerState || shipTo.shipState || companyForDoc.state || companyForDoc.companyState || '';
    const taxMode = resolveTaxMode('', companyForDoc.state || companyForDoc.companyState || '', customerState);

    const items = [];
    document.querySelectorAll('#invItemsContainer tr').forEach(row => {
        const select = row.querySelector('.item-select');
        if (!select || !select.value) return;
        const option = select.selectedOptions[0];
        const qty = parseFloat(row.querySelector('.item-qty')?.value || '0') || 0;
        const price = parseFloat(row.querySelector('.item-price')?.value || '0') || 0;
        const gstRate = resolveGstRate(option?.dataset?.gst, businessSettings.gstRate);
        const hsn = option?.dataset?.hsn || '';
        const name = parseInvoiceItemNameFromOption(option);
        const category = option?.dataset?.category || '';
        const pipeType = option?.dataset?.pipetype || '';
        const loadClass = option?.dataset?.loadclass || '';
        items.push({ name, category, pipeType, loadClass, quantity: qty, price, gstRate, hsn });
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
        company: companyForDoc,
        customer,
        billLabel: billToData.billLabel,
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
        status: getDocumentStatus(docType, balance, amountPaid),
        balance,
        amountPaid,
        transportCost,
        vehicle,
        driver,
        poNumber,
        poDate: poDateStr,
        placeOfSupply,
        taxMode,
        docType,
        templateOptions
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
    if (!user) return;
    const businessId = user.businessId || user.uid;
    ensurePdfSpinStyles();

    const invoiceTbody = invoicesTable?.querySelector('tbody');
    const estimateTbody = estimatesTable?.querySelector('tbody');
    if (invoiceTbody) invoiceTbody.innerHTML = '<tr><td colspan="6" class="text-center">Loading...</td></tr>';
    if (estimateTbody) estimateTbody.innerHTML = '<tr><td colspan="5" class="text-center">Loading...</td></tr>';

    try {
        const [invoiceSnap, estimateSnap, quotationSnap] = await Promise.all([
            db.collection('users').doc(businessId).collection('transactions').where('type', '==', 'Invoice').orderBy('date', 'desc').get(),
            db.collection('users').doc(businessId).collection('transactions').where('type', '==', 'Estimate').orderBy('date', 'desc').get(),
            db.collection('users').doc(businessId).collection('transactions').where('type', '==', 'Quotation').orderBy('date', 'desc').get()
        ]);
        const snapshotDocs = [...invoiceSnap.docs, ...estimateSnap.docs, ...quotationSnap.docs]
            .sort((a, b) => {
                const ad = a.data().date?.toDate ? a.data().date.toDate() : new Date(a.data().date || 0);
                const bd = b.data().date?.toDate ? b.data().date.toDate() : new Date(b.data().date || 0);
                return bd - ad;
            });

        invoicesData = [];
        const invoiceRows = [];
        const estimateRows = [];

        snapshotDocs.forEach(doc => {
            const inv = doc.data();
            const displayAmount = getInvoiceAmount(inv);
            invoicesData.push({ id: doc.id, ...inv });
            const escape = (str) => (str || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;').replace(/\n/g, '\\n').replace(/\r/g, '');
            const canDelete = user.permissions ? user.permissions.canDelete : true;
            const displayNo = inv.invoiceNo || `#${doc.id.substr(0, 6).toUpperCase()}`;
            const rawDocType = inv.docType || inv.type || 'Invoice';
            const docType = rawDocType === 'Quotation' ? 'Estimate' : rawDocType;
            const statusClass = inv.status === 'Paid'
                ? 'success'
                : (inv.status === 'Quoted' || inv.status === 'Estimated' ? 'secondary' : 'warning');

            const baseLayoutSelect = `
                        <select class="form-select form-select-sm d-inline-block ms-1" id="invLayout_${doc.id}" style="width: 180px;">
                            <option value="original">Original</option>
                            <option value="corporate">Corporate</option>
                            <option value="accounting">Accounting</option>
                            <option value="manufacturing">Manufacturing</option>
                            <option value="clean-grid">Clean Grid</option>
                            <option value="print-optimized">Print Optimized</option>
                        </select>
            `;
            const invoiceCopySelect = `
                        <select class="form-select form-select-sm d-inline-block ms-1" id="invCopy_${doc.id}" style="width: 140px;">
                            <option value="All">All Copies</option>
                            <option value="Original">Original for Recipient</option>
                            <option value="Duplicate">Duplicate for Transporter</option>
                            <option value="Triplicate">Triplicate for Supplier</option>
                        </select>
            `;
            const estimateCopySelect = `
                        <select class="form-select form-select-sm d-inline-block ms-1" id="invCopy_${doc.id}" style="width: 140px;">
                            <option value="Original">Original for Recipient</option>
                        </select>
            `;

            if (docType === 'Estimate') {
                estimateRows.push(`
                <tr>
                    <td>${formatDate(inv.date)}</td>
                    <td>${displayNo}</td>
                    <td>${inv.customer}</td>
                    <td class="text-end">&#8377;${displayAmount.toLocaleString()}</td>
                    <td class="invoice-actions">
                        <div class="invoice-action-row d-flex flex-wrap align-items-center gap-1">
                        ${baseLayoutSelect}
                        ${estimateCopySelect}
                        <span class="small text-muted d-none invoice-row-status" id="invDownload_${doc.id}"></span>
                        <button class="btn btn-sm btn-outline-dark" onclick="window.printInvoiceFromList('${doc.id}', '${escape(inv.customer)}', ${displayAmount}, '${formatDate(inv.date)}')" title="Print"><i class="fas fa-print"></i></button>
                        <button class="btn btn-sm btn-outline-primary btn-download-pdf" onclick="window.downloadInvoicePdfFromList('${doc.id}', '${escape(inv.customer)}', ${displayAmount}, '${formatDate(inv.date)}', this)" title="Download PDF"><i class="fas fa-file-pdf text-danger"></i></button>
                        ${canDelete ? `<button class="btn btn-sm btn-outline-danger" onclick="window.deleteInvoice('${doc.id}')"><i class="fas fa-trash"></i></button>` : ''}
                        </div>
                    </td>
                </tr>`);
                return;
            }

            invoiceRows.push(`
                <tr>
                    <td>${formatDate(inv.date)}</td>
                    <td>${displayNo}</td>
                    <td>${inv.customer}</td>
                    <td>&#8377;${displayAmount.toLocaleString()}</td>
                    <td><span class="badge bg-${statusClass}">${inv.status}</span></td>
                    <td class="invoice-actions">
                        <div class="invoice-action-row d-flex flex-wrap align-items-center gap-1">
                        ${baseLayoutSelect}
                        ${invoiceCopySelect}
                        <span class="small text-muted d-none invoice-row-status" id="invDownload_${doc.id}"></span>
                        <button class="btn btn-sm btn-outline-info" onclick="window.openPaymentHistory('${doc.id}')" title="Record Payment"><i class="fas fa-money-bill-wave"></i></button>
                        <button class="btn btn-sm btn-outline-dark" onclick="window.printInvoiceFromList('${doc.id}', '${escape(inv.customer)}', ${displayAmount}, '${formatDate(inv.date)}')" title="Print"><i class="fas fa-print"></i></button>
                        <button class="btn btn-sm btn-outline-primary btn-download-pdf" onclick="window.downloadInvoicePdfFromList('${doc.id}', '${escape(inv.customer)}', ${displayAmount}, '${formatDate(inv.date)}', this)" title="Download PDF"><i class="fas fa-file-pdf text-danger"></i></button>
                        ${canDelete ? `<button class="btn btn-sm btn-outline-danger" onclick="window.deleteInvoice('${doc.id}')"><i class="fas fa-trash"></i></button>` : ''}
                        </div>
                    </td>
                </tr>`);
        });

        if (invoiceTbody) {
            invoiceTbody.innerHTML = invoiceRows.length
                ? invoiceRows.join('')
                : '<tr><td colspan="6" class="text-center text-muted">No invoices found</td></tr>';
        }
        if (estimateTbody) {
            estimateTbody.innerHTML = estimateRows.length
                ? estimateRows.join('')
                : '<tr><td colspan="5" class="text-center text-muted">No estimations found</td></tr>';
        }

        applyInvoiceFilters();
    } catch (error) {
        console.error('Error loading invoices:', error);
        if (invoiceTbody) invoiceTbody.innerHTML = '<tr><td colspan="6" class="text-center text-danger">Error loading data</td></tr>';
        if (estimateTbody) estimateTbody.innerHTML = '<tr><td colspan="5" class="text-center text-danger">Error loading data</td></tr>';
    }
}

function applyInvoiceFilters() {
    const invoiceRows = document.querySelectorAll('#invoicesTable tbody tr');
    const estimateRows = document.querySelectorAll('#estimatesTable tbody tr');
    const searchTerm = (invoiceSearch?.value || '').toLowerCase();
    const statusFilter = invoiceStatusFilter?.value || 'all';
    const fromVal = invoiceDateFrom?.value || '';
    const toVal = invoiceDateTo?.value || '';
    const fromDate = fromVal ? new Date(fromVal) : null;
    const toDate = toVal ? new Date(toVal) : null;

    const applyCommonFilters = (row) => {
        const cells = row.querySelectorAll('td');
        const rowText = row.textContent.toLowerCase();
        if (searchTerm && !rowText.includes(searchTerm)) {
            row.style.display = 'none';
            return false;
        }

        if (fromDate || toDate) {
            const dateText = cells[0]?.textContent?.trim() || '';
            const dateObj = dateText ? new Date(dateText) : null;
            if (fromDate && dateObj && dateObj < fromDate) {
                row.style.display = 'none';
                return false;
            }
            if (toDate && dateObj) {
                const end = new Date(toDate);
                end.setHours(23, 59, 59, 999);
                if (dateObj > end) {
                    row.style.display = 'none';
                    return false;
                }
            }
        }
        return true;
    };

    invoiceRows.forEach(row => {
        if (row.querySelector('td[colspan]')) return;
        if (!applyCommonFilters(row)) return;
        const cells = row.querySelectorAll('td');
        const statusText = cells[4]?.textContent?.trim() || '';
        if (statusFilter !== 'all' && statusText !== statusFilter) {
            row.style.display = 'none';
            return;
        }
        row.style.display = '';
    });

    estimateRows.forEach(row => {
        if (row.querySelector('td[colspan]')) return;
        if (!applyCommonFilters(row)) return;
        row.style.display = '';
    });
}

function getInvoicesExportRows() {
    return invoicesData.map(inv => ([
        formatDate(inv.date),
        inv.invoiceNo || `#${String(inv.id || '').substr(0, 6).toUpperCase()}`,
        ((inv.docType || inv.type || 'Invoice') === 'Quotation') ? 'Estimate' : (inv.docType || inv.type || 'Invoice'),
        inv.customer || '',
        getInvoiceAmount(inv),
        inv.status || ''
    ]));
}

function exportInvoicesCSV() {
    if (!invoicesData.length) {
        alert('No invoices to export.');
        return;
    }

    const headers = ['Date', 'Doc #', 'Type', 'Customer', 'Amount', 'Status'];
    const rows = getInvoicesExportRows();
    const filename = `invoices_${new Date().toISOString().split('T')[0]}.csv`;
    downloadCSV(filename, headers, rows);
}

function exportInvoicesPDF() {
    if (!invoicesData.length) {
        alert('No invoices to export.');
        return;
    }

    const headers = ['Date', 'Doc #', 'Type', 'Customer', 'Amount', 'Status'];
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
    const billToData = getBillToData();
    const customerAddress = billToData.customerAddress;
    const customerCity = billToData.customerCity;
    const customerState = billToData.customerState;
    const customerZip = billToData.customerZip;
    const customerVillage = billToData.customerVillage;
    const customerDistrict = billToData.customerDistrict;
    const custMandal = billToData.customerMandal;
    const customerPhone = billToData.customerPhone;
    const customerTaxId = billToData.customerTaxId;
    const poNumber = document.getElementById('invPoNumber').value;
    const poDateVal = document.getElementById('invPoDate').value;
    const docType = getDocumentTypeFromForm();
    const isCommercialInvoice = docType === 'Invoice';
    const templateOptions = getInvoiceTemplateOptionsFromForm();
    const shipTo = getShipToData();
    const company = await getCompanySettings();
    const companyForDoc = applyInvoiceCompanyOverrides(company, templateOptions);
    const placeOfSupply = customerState || shipTo.shipState || companyForDoc.state || companyForDoc.companyState || '';
    const taxMode = resolveTaxMode('', companyForDoc.state || companyForDoc.companyState || '', customerState);
    const balance = amount - amountPaid;
    const selectedCopyLabels = autoPrint
        ? (isCommercialInvoice ? ['Original', 'Duplicate', 'Triplicate'] : ['Original'])
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
            const gstRate = resolveGstRate(option?.dataset?.gst, businessSettings.gstRate);
            const hsn = option.dataset.hsn || '';
            const qty = parseFloat(row.querySelector('.item-qty').value);
            
            items.push({
                itemId: select.value,
                name: parseInvoiceItemNameFromOption(option),
                category: option?.dataset?.category || '',
                pipeType: option?.dataset?.pipetype || '',
                loadClass: option?.dataset?.loadclass || '',
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
        showAlert('warning', `Please add at least one item to the ${docType.toLowerCase()}.`);
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
            type: docType,
            docType,
            customer: customer,
            billLabel: billToData.billLabel || '',
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
            placeOfSupply,
            taxMode,
            amount: amount,
            totalAmount: amount,
            grandTotal: amount,
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
            status: getDocumentStatus(docType, balance, amountPaid),
            description: `${docType} for ${customer}`,
            templateOptions,
            date: new Date(dateVal),
            createdAt: new Date(),
            customerSignature: customerSignatureUrl
        };

        // For Invoice: verify stock and deduct inventory. For Estimate/Quotation: store document only.
        await db.runTransaction(async (transaction) => {
            const settingsRef = db.collection('users').doc(businessId).collection('settings').doc('business');
            const settingsSnap = await transaction.get(settingsRef);
            const settings = settingsSnap.exists ? settingsSnap.data() : {};
            const prefix = settings.invoicePrefix || businessSettings.invoicePrefix || '';
            const pad = Number(settings.invoicePad ?? businessSettings.invoicePad ?? 4);
            const nextNum = Number(settings.invoiceNextNumber ?? 1);
            const invoiceNo = `${prefix}${String(nextNum).padStart(pad, '0')}`;
            createdInvoiceNo = invoiceNo;
            if (isCommercialInvoice) {
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
            }

            transaction.set(invoiceRef, { ...invoiceData, invoiceNo });
            transaction.set(settingsRef, { invoiceNextNumber: nextNum + 1 }, { merge: true });
        });

        if (linkedOrderId && isCommercialInvoice) {
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
        
        if (!custSnapshot.empty && isCommercialInvoice) {
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
            const dateStr = formatDate(new Date(dateVal));
            const poDateStr = poDateVal ? formatDate(new Date(poDateVal)) : '';
            const logoHtml = companyForDoc.logoUrl
                ? `<img src="${companyForDoc.logoUrl}" style="max-height: 80px; max-width: 200px; margin-bottom: 10px;">`
                : `<div class="invoice-title">${docType.toUpperCase()}</div>`;
            const signatureHtml = companyForDoc.signatureUrl
                ? `<div style="text-align: right; margin-top: 30px;"><img src="${companyForDoc.signatureUrl}" style="max-height: 60px; max-width: 150px;"><br><small>Authorized Signature</small></div>`
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
                company: companyForDoc,
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
                status: getDocumentStatus(docType, balance, amountPaid),
                balance,
                amountPaid,
                transportCost,
                vehicle,
                driver,
                poNumber,
                poDate: poDateStr,
                placeOfSupply,
                taxMode,
                docType,
                templateOptions
            };
            const mergedTemplate = buildMultiCopyInvoiceHTML(layoutKey, printBaseData, selectedCopyLabels);
            await printInvoiceHtml(mergedTemplate);
        }

        showAlert('success', `${docType} created successfully`);
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

        const templateOptions = invoiceData.templateOptions || {};
        const docType = invoiceData.docType || invoiceData.type || 'Invoice';
        const companyForDoc = applyInvoiceCompanyOverrides(company, templateOptions);
        const logoHtml = companyForDoc.logoUrl
            ? `<img src="${companyForDoc.logoUrl}" style="max-height: 80px; max-width: 200px; margin-bottom: 10px;">`
            : `<div class="invoice-title">${docType.toUpperCase()}</div>`;
        const signatureHtml = companyForDoc.signatureUrl
            ? `<div style="text-align: right; margin-top: 30px;"><img src="${companyForDoc.signatureUrl}" style="max-height: 60px; max-width: 150px;"><br><small>Authorized Signature</small></div>`
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
            company: companyForDoc,
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
            poDate: poDateStr,
            docType,
            templateOptions
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
    const templateOptions = data.templateOptions || {};
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
    const showGstin = templateOptions.showGstin !== false;
    const customTermsEnabled = templateOptions.customTermsEnabled === true;
    const customTermsTextRaw = String(templateOptions.customTermsText || '').trim();
    const customTermsText = customTermsTextRaw
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    const fontFamily = (templateOptions.fontFamily || 'Arial, Helvetica, sans-serif').replace(/"/g, '&quot;');
    const fontScaleRaw = Number(templateOptions.fontScale || 100);
    const fontScale = Number.isFinite(fontScaleRaw) ? Math.max(80, Math.min(130, fontScaleRaw)) : 100;

    const transport = Number(transportCost || 0);
    const itemsRows = safeItems.map((i, idx) => {
        const qty = Number(i.quantity || 0);
        const price = Number(i.price || 0);
        const gstRate = Number(i.gstRate || 0);
        const gstAmount = (price * gstRate) / 100;
        const finalRate = price + gstAmount;
        const lineAmount = finalRate * qty;
        const itemMeta = buildInvoiceItemMetaLine(i);
        const transportCell = idx === 0
            ? `&#8377;${transport.toLocaleString()}`
            : '-';
        return `
            <tr>
                <td>${idx + 1}</td>
                <td>
                    <div class="item-name">${i.name}</div>
                    ${itemMeta ? `<div class="muted">${itemMeta}</div>` : ''}
                </td>
                <td>${i.hsn || '-'}</td>
                <td class="text-end">${qty}</td>
                <td class="text-end">&#8377;${price.toLocaleString()}</td>
                <td class="text-end">${transportCell}</td>
                <td class="text-end">&#8377;${gstAmount.toLocaleString()}<div class="muted">(${gstRate.toFixed(0)}%)</div></td>
                <td class="text-end">&#8377;${finalRate.toLocaleString()}</td>
                <td class="text-end">&#8377;${lineAmount.toLocaleString()}</td>
            </tr>
        `;
    }).join('');

    const itemsSubtotal = safeItems.reduce((sum, i) => sum + (Number(i.price || 0) * Number(i.quantity || 0)), 0);
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
    const pos = placeOfSupply || customerState || shipTo?.shipState || state;
    const docTitle = docType || 'Invoice';
    const isInvoiceDoc = docTitle.toLowerCase() === 'invoice';
    const taxModeValue = resolveTaxMode(taxMode, state, customerState || shipTo?.shipState || '');
    const eway = ewayBill || data.eWayBill || '';
    const copyText = getCopyLabelDisplay(copyLabel || '').toUpperCase();
    const layoutKey = type || 'corporate';

    const headerInvoiceMeta = (layoutKey === 'corporate' || layoutKey === 'print-optimized')
        ? `<div class="invoice-meta-box">
                <div class="info-title">${docTitle} Details</div>
                <div>${docTitle} No.: ${invoiceLabel}</div>
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
                ${showGstin ? `GSTIN: ${gstin}<br>` : ''}
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
            ${(showGstin && customerTaxId) ? `<div class="muted">GSTIN: ${safe(customerTaxId)}</div>` : ''}
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
            ${(showGstin && shipTaxId) ? `<div class="muted">GSTIN: ${safe(shipTaxId)}</div>` : ''}
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
            <div class="info-title">${docTitle} Details</div>
            <div>${docTitle} No.: ${invoiceLabel}</div>
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
                    <th class="text-end">Transport</th>
                    <th class="text-end">GST</th>
                    <th class="text-end">Final Rate</th>
                    <th class="text-end">Amount</th>
                </tr>
            </thead>
            <tbody>
                ${itemsRows}
            </tbody>
        </table>`;

    const summaryTableHtml = `
        <table class="summary-table">
            <tbody>
                <tr><td>Sub Total</td><td class="text-end">&#8377;${itemsSubtotal.toLocaleString()}</td></tr>
                ${taxModeValue === 'IGST'
                    ? `<tr><td>IGST (${igstRate.toFixed(0)}%)</td><td class="text-end">&#8377;${igstAmount.toLocaleString()}</td></tr>`
                    : `
                        <tr><td>CGST (${cgstRate.toFixed(0)}%)</td><td class="text-end">&#8377;${cgstAmount.toLocaleString()}</td></tr>
                        <tr><td>SGST (${sgstRate.toFixed(0)}%)</td><td class="text-end">&#8377;${sgstAmount.toLocaleString()}</td></tr>
                    `
                }
                <tr><td>Total</td><td class="text-end">&#8377;${grandTotal.toLocaleString()}</td></tr>
                ${isInvoiceDoc ? `<tr><td>Received</td><td class="text-end">&#8377;${received.toLocaleString()}</td></tr>` : ''}
                ${isInvoiceDoc ? `<tr><td>Balance</td><td class="text-end">&#8377;${balanceDue.toLocaleString()}</td></tr>` : ''}
            </tbody>
        </table>`;

    const amountWordsHtml = `<div class="amount-words"><strong>${docTitle} Amount In Words:</strong> ${amountWords}</div>`;
    const customTermsHtml = (customTermsEnabled && customTermsText)
        ? `<div class="terms-box"><div class="info-title">Terms &amp; Conditions</div><div class="terms-content">${customTermsText.replace(/\n/g, '<br>')}</div></div>`
        : '';

    const paymentHtml = isInvoiceDoc ? `
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
        </div>` : `
        <div class="sign-box" style="margin-left:auto;">
            For: ${companyName}<br>
            ${safeCompany.signatureUrl ? `<img src="${safeCompany.signatureUrl}" style="max-height:60px;"><br>` : ''}
            <span class="sign-line">Authorized Signatory</span>
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
                <div></div>
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
                <div></div>
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
                <div></div>
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
                ${summaryTableHtml}
            </div>`;
    }

    return `
<html>
<head>
    <title>${docTitle} #${invoiceLabel}</title>
    <style>
        @page { size: A4; margin: 12mm; }
        body { font-family: ${fontFamily}; color: #111; margin: 0; font-size: ${fontScale}%; }
        .page-border { border: 1px solid #1e6b8a; padding: 10px; }
        .copy-label { text-align: right; font-size: 12px; font-weight: 700; letter-spacing: 1px; color: #555; }
        .header { display: grid; grid-template-columns: 1fr 180px; gap: 20px; border-bottom: 1px solid #222; padding-bottom: 12px; }
        .company-name { font-size: 1.25em; font-weight: 700; text-transform: uppercase; }
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
        .info-box { border: none; padding: 0; min-height: auto; }
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
        .payment-box { border: none; border-radius: 0; padding: 4px 6px; }
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
        .terms-box { margin-top: 10px; border: 1px solid #ddd; padding: 8px; font-size: 12px; }
        .terms-content { white-space: normal; line-height: 1.45; color: #333; }
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
        ${customTermsHtml}
        ${paymentHtml}
        <div class="invoice-footer-note">Thank you for your business!</div>
    </div>
</body>
</html>
    `;
}
window.getInvoiceTemplate = getInvoiceTemplate;
