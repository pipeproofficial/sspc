import { db } from './firebase-config.js';
import { checkAuth, formatDate, downloadCSV, downloadPDF } from './dashboard.js';
import { showAlert } from './auth.js';
import { initializeStateSelect } from './location-data.js';

const gstTable = document.getElementById('gstTable');
const gstSearch = document.getElementById('gstSearch');
const gstTypeFilter = document.getElementById('gstTypeFilter');
const gstDateFrom = document.getElementById('gstDateFrom');
const gstDateTo = document.getElementById('gstDateTo');
const resetGstFilters = document.getElementById('resetGstFilters');
const exportGstCsvBtn = document.getElementById('exportGstCsvBtn');
const exportGstPdfBtn = document.getElementById('exportGstPdfBtn');

const gstDocType = document.getElementById('gstDocType');
const gstTaxMode = document.getElementById('gstTaxMode');
const gstCustomer = document.getElementById('gstCustomer');
const gstDate = document.getElementById('gstDate');
const gstPlaceOfSupply = document.getElementById('gstPlaceOfSupply');
const gstReverseCharge = document.getElementById('gstReverseCharge');
const gstEwayBill = document.getElementById('gstEwayBill');
const gstTransporter = document.getElementById('gstTransporter');
const gstVehicle = document.getElementById('gstVehicle');
const gstItemsContainer = document.getElementById('gstItemsContainer');
const gstAddItemBtn = document.getElementById('gstAddItemBtn');
const gstTransportCost = document.getElementById('gstTransportCost');
const gstAmountPaid = document.getElementById('gstAmountPaid');
const gstGrandTotal = document.getElementById('gstGrandTotal');
const saveGstBtn = document.getElementById('saveGstBtn');
const gstPreviewFrame = document.getElementById('gstPreviewFrame');
const printGstPreviewBtn = document.getElementById('printGstPreviewBtn');

let gstDocs = [];
let inventoryCache = [];
let customerCache = [];
let businessSettings = { gstRate: 0, gstInvoicePrefix: '', gstInvoicePad: 4, gstInvoiceNextNumber: 1 };
let companyCache = null;

document.addEventListener('DOMContentLoaded', async () => {
    await checkAuth();
    if (!gstTable) return;

    await loadBusinessSettings();
    await loadCustomers();
    await loadInventory();
    await loadGstDocs();

    setupGstListeners();
    await initializeGstForm();
    updateGstPreview();

    window.addEventListener('sectionChanged', (e) => {
        if (e.detail === 'gst') {
            loadGstDocs();
        }
    });
});

function setupGstListeners() {
    if (gstAddItemBtn) {
        gstAddItemBtn.addEventListener('click', () => addGstItemRow());
    }
    if (gstItemsContainer) {
        gstItemsContainer.addEventListener('change', handleItemsChange);
        gstItemsContainer.addEventListener('input', handleItemsChange);
        gstItemsContainer.addEventListener('click', (e) => {
            if (e.target.closest('.remove-row')) {
                e.target.closest('tr').remove();
                calculateGstTotal();
                updateGstPreview();
            }
        });
    }
    if (gstTransportCost) gstTransportCost.addEventListener('input', calculateGstTotal);
    if (gstAmountPaid) gstAmountPaid.addEventListener('input', calculateGstTotal);

    if (gstCustomer) {
        gstCustomer.addEventListener('change', () => {
            const option = gstCustomer.selectedOptions[0];
            if (gstPlaceOfSupply && option?.dataset?.state && !gstPlaceOfSupply.value) {
                setGstPlaceOfSupplyValue(option.dataset.state);
            }
            updateGstPreview();
        });
    }

    if (gstDocType) gstDocType.addEventListener('change', updateGstPreview);
    if (gstTaxMode) gstTaxMode.addEventListener('change', updateGstPreview);
    if (gstDate) gstDate.addEventListener('change', updateGstPreview);
    if (gstPlaceOfSupply) gstPlaceOfSupply.addEventListener('change', updateGstPreview);
    if (gstReverseCharge) gstReverseCharge.addEventListener('change', updateGstPreview);
    if (gstEwayBill) gstEwayBill.addEventListener('input', updateGstPreview);
    if (gstTransporter) gstTransporter.addEventListener('input', updateGstPreview);
    if (gstVehicle) gstVehicle.addEventListener('input', updateGstPreview);

    if (saveGstBtn) saveGstBtn.addEventListener('click', saveGstDocument);
    if (printGstPreviewBtn) printGstPreviewBtn.addEventListener('click', (e) => {
        e.preventDefault();
        printGstPreview();
    });

    if (gstSearch) gstSearch.addEventListener('input', applyGstFilters);
    if (gstTypeFilter) gstTypeFilter.addEventListener('change', applyGstFilters);
    if (gstDateFrom) gstDateFrom.addEventListener('change', applyGstFilters);
    if (gstDateTo) gstDateTo.addEventListener('change', applyGstFilters);
    if (resetGstFilters) {
        resetGstFilters.addEventListener('click', () => {
            if (gstSearch) gstSearch.value = '';
            if (gstTypeFilter) gstTypeFilter.value = 'all';
            if (gstDateFrom) gstDateFrom.value = '';
            if (gstDateTo) gstDateTo.value = '';
            applyGstFilters();
        });
    }
    if (exportGstCsvBtn) exportGstCsvBtn.addEventListener('click', exportGstCSV);
    if (exportGstPdfBtn) exportGstPdfBtn.addEventListener('click', exportGstPDF);
}

async function initializeGstForm() {
    if (gstDate && !gstDate.value) {
        gstDate.valueAsDate = new Date();
    }
    
    if (gstDocType) {
        gstDocType.innerHTML = `
            <option value="Tax Invoice">Tax Invoice</option>
            <option value="Credit Note">Credit Note</option>
            <option value="Debit Note">Debit Note</option>
            <option value="Delivery Challan">Delivery Challan</option>
            <option value="Bill of Supply">Bill of Supply</option>
            <option value="Quotation">Quotation</option>
        `;
    }
    await initializeStateSelect(gstPlaceOfSupply, { placeholder: 'Select State' });
    if (gstItemsContainer && !gstItemsContainer.children.length) {
        addGstItemRow();
    }
    calculateGstTotal();
}

function setGstPlaceOfSupplyValue(value) {
    if (!gstPlaceOfSupply) return;
    const normalized = (value || '').trim();
    if (!normalized) {
        gstPlaceOfSupply.value = '';
        return;
    }
    if (gstPlaceOfSupply.tagName !== 'SELECT') {
        gstPlaceOfSupply.value = normalized;
        return;
    }
    const exists = Array.from(gstPlaceOfSupply.options).some((opt) => opt.value === normalized);
    if (!exists) {
        const option = document.createElement('option');
        option.value = normalized;
        option.textContent = normalized;
        gstPlaceOfSupply.appendChild(option);
    }
    gstPlaceOfSupply.value = normalized;
}

async function loadBusinessSettings() {
    const user = JSON.parse(localStorage.getItem('user'));
    if (!user) return;
    const businessId = user.businessId || user.uid;

    const doc = await db.collection('users').doc(businessId).collection('settings').doc('business').get();
    if (!doc.exists) return;
    const data = doc.data();
    businessSettings = {
        gstRate: Number(data.gstRate || 0),
        gstInvoicePrefix: data.gstInvoicePrefix || '',
        gstInvoicePad: data.gstInvoicePad ?? 4,
        gstInvoiceNextNumber: data.gstInvoiceNextNumber ?? 1
    };
    companyCache = {
        companyName: data.companyName || '',
        taxId: data.taxId || '',
        email: data.email || '',
        phone: data.phone || '',
        address: data.address || '',
        city: data.city || '',
        state: data.state || '',
        zip: data.zip || '',
        upiId: data.upiId || '',
        bankName: data.bankName || '',
        bankAccountName: data.bankAccountName || '',
        bankAccountNo: data.bankAccountNo || '',
        bankIfsc: data.bankIfsc || '',
        bankBranch: data.bankBranch || '',
        logoUrl: data.logoUrl || '',
        signatureUrl: data.signatureUrl || ''
    };
}

async function loadCustomers() {
    const user = JSON.parse(localStorage.getItem('user'));
    if (!user || !gstCustomer) return;
    const businessId = user.businessId || user.uid;

    const snapshot = await db.collection('users').doc(businessId).collection('customers').orderBy('name').get();
    customerCache = [];
    gstCustomer.innerHTML = `<option value="">Select customer</option>`;
    snapshot.forEach(doc => {
        const c = { id: doc.id, ...doc.data() };
        customerCache.push(c);
        const option = document.createElement('option');
        option.value = doc.id;
        option.textContent = c.name || 'Customer';
        option.dataset.address = c.address || '';
        option.dataset.city = c.city || '';
        option.dataset.state = c.state || '';
        option.dataset.zip = c.zip || '';
        option.dataset.phone = c.phone || '';
        option.dataset.taxid = c.taxId || c.gstin || '';
        gstCustomer.appendChild(option);
    });
}

async function loadInventory() {
    const user = JSON.parse(localStorage.getItem('user'));
    if (!user) return;
    const businessId = user.businessId || user.uid;

    const snapshot = await db.collection('users').doc(businessId).collection('inventory').orderBy('name').get();
    inventoryCache = [];
    snapshot.forEach(doc => {
        inventoryCache.push({ id: doc.id, ...doc.data() });
    });
}

async function loadGstDocs() {
    const user = JSON.parse(localStorage.getItem('user'));
    if (!user || !gstTable) return;
    const businessId = user.businessId || user.uid;

    const tbody = gstTable.querySelector('tbody');
    if(tbody) tbody.innerHTML = '<tr><td colspan="7" class="text-center">Loading...</td></tr>';

    const gstSnap = await db.collection('users').doc(businessId).collection('gstDocuments').orderBy('createdAt', 'desc').get();

    gstDocs = [];
    gstSnap.forEach(doc => gstDocs.push({ id: doc.id, ...doc.data(), source: 'gst' }));

    gstDocs.sort((a, b) => {
        const dateA = a.date && a.date.toDate ? a.date.toDate() : new Date(a.date || 0);
        const dateB = b.date && b.date.toDate ? b.date.toDate() : new Date(b.date || 0);
        return dateB - dateA;
    });

    renderGstTable(gstDocs);
}

function renderGstTable(data) {
    const tbody = gstTable.querySelector('tbody');
    if (!tbody) return;
    if (!data.length) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted">No GST documents found</td></tr>`;
        return;
    }
    tbody.innerHTML = data.map(doc => {
        const dateStr = doc.date ? formatDate(doc.date) : '';
        const amount = Number(doc.amount || 0);
        return `
            <tr>
                <td>${dateStr}</td>
                <td>${doc.docNo || doc.id.substr(0,6).toUpperCase()}</td>
                <td><span class="badge bg-light text-dark border">${doc.docType || 'Tax Invoice'}</span></td>
                <td>${doc.customerName || '-'}</td>
                <td class="text-end">₹${amount.toLocaleString()}</td>
                <td>${doc.status || 'Saved'}</td>
                <td class="text-nowrap">
                    <button class="btn btn-sm btn-outline-primary me-1" data-action="print" data-id="${doc.id}" title="Print"><i class="fas fa-print"></i></button>
                    <button class="btn btn-sm btn-outline-danger" data-action="delete" data-id="${doc.id}" title="Delete"><i class="fas fa-trash"></i></button>
                </td>
            </tr>
        `;
    }).join('');

    tbody.querySelectorAll('button[data-action="print"]').forEach(btn => {
        btn.addEventListener('click', () => {
            const doc = gstDocs.find(d => d.id === btn.dataset.id);
            if (doc) {
                printGstDocument(doc);
            }
        });
    });
    tbody.querySelectorAll('button[data-action="delete"]').forEach(btn => {
        btn.addEventListener('click', () => deleteGstDocument(btn.dataset.id));
    });
}

function applyGstFilters() {
    let filtered = [...gstDocs];
    const search = (gstSearch?.value || '').toLowerCase();
    const type = gstTypeFilter?.value || 'all';
    const from = gstDateFrom?.value ? new Date(gstDateFrom.value) : null;
    const to = gstDateTo?.value ? new Date(gstDateTo.value) : null;

    if (search) {
        filtered = filtered.filter(d =>
            (d.docNo || '').toLowerCase().includes(search) ||
            (d.customerName || '').toLowerCase().includes(search) ||
            (d.docType || '').toLowerCase().includes(search)
        );
    }
    if (type !== 'all') {
        filtered = filtered.filter(d => d.docType === type);
    }
    if (from) {
        filtered = filtered.filter(d => d.date && d.date.toDate ? d.date.toDate() >= from : new Date(d.date) >= from);
    }
    if (to) {
        filtered = filtered.filter(d => d.date && d.date.toDate ? d.date.toDate() <= to : new Date(d.date) <= to);
    }
    renderGstTable(filtered);
}

function addGstItemRow(item = {}) {
    if (!gstItemsContainer) return;
    const row = document.createElement('tr');
    row.innerHTML = `
        <td>
            <select class="form-select form-select-sm gst-item-select">
                <option value="">Select item</option>
                ${inventoryCache.map(i => {
                    const hsn = i.hsn || '';
                    const gst = i.gstRate ?? businessSettings.gstRate ?? 0;
                    return `<option value="${i.id}" data-price="${i.sellingPrice || 0}" data-hsn="${hsn}" data-gst="${gst}">${i.name}</option>`;
                }).join('')}
            </select>
        </td>
        <td class="gst-hsn text-muted small">-</td>
        <td class="gst-rate text-end">0%</td>
        <td><input type="number" class="form-control form-control-sm text-end gst-qty" value="${item.quantity || 1}"></td>
        <td><input type="number" class="form-control form-control-sm text-end gst-price" value="${item.price || 0}"></td>
        <td class="text-end gst-line-total">₹0.00</td>
        <td><button type="button" class="btn btn-sm btn-outline-danger remove-row"><i class="fas fa-times"></i></button></td>
    `;
    gstItemsContainer.appendChild(row);
    const select = row.querySelector('.gst-item-select');
    if (item.id) select.value = item.id;
    updateGstRow(row);
    calculateGstTotal();
}

function handleItemsChange(e) {
    const row = e.target.closest('tr');
    if (!row) return;
    updateGstRow(row);
    calculateGstTotal();
    updateGstPreview();
}

function updateGstRow(row) {
    const select = row.querySelector('.gst-item-select');
    const hsnCell = row.querySelector('.gst-hsn');
    const gstCell = row.querySelector('.gst-rate');
    const qtyInput = row.querySelector('.gst-qty');
    const priceInput = row.querySelector('.gst-price');
    const totalCell = row.querySelector('.gst-line-total');
    if (!select) return;

    const option = select.selectedOptions[0];
    const hsn = option?.dataset?.hsn || '-';
    const gstRate = parseFloat(option?.dataset?.gst || businessSettings.gstRate || 0) || 0;
    const price = priceInput ? parseFloat(priceInput.value || 0) || 0 : 0;
    const qty = qtyInput ? parseFloat(qtyInput.value || 0) || 0 : 0;

    if (option && priceInput && select.value !== priceInput.dataset.itemId) {
        priceInput.value = option.dataset.price || priceInput.value;
        priceInput.dataset.itemId = select.value;
    }

    if (hsnCell) hsnCell.textContent = hsn || '-';
    if (gstCell) gstCell.textContent = `${gstRate.toFixed(0)}%`;

    const lineBase = price * qty;
    const lineTax = lineBase * (gstRate / 100);
    const lineTotal = lineBase + lineTax;
    if (totalCell) totalCell.textContent = `₹${lineTotal.toLocaleString()}`;
}

function calculateGstTotal() {
    const items = collectGstItems();
    const transport = parseFloat(gstTransportCost?.value || 0) || 0;
    const total = items.reduce((sum, i) => sum + (i.price * i.quantity) + (i.price * i.quantity * i.gstRate / 100), 0);
    const grand = total + transport;
    if (gstGrandTotal) gstGrandTotal.textContent = `₹${grand.toLocaleString()}`;
    return grand;
}

function collectGstItems() {
    const items = [];
    document.querySelectorAll('#gstItemsContainer tr').forEach(row => {
        const select = row.querySelector('.gst-item-select');
        if (!select || !select.value) return;
        const option = select.selectedOptions[0];
        const qty = parseFloat(row.querySelector('.gst-qty')?.value || 0) || 0;
        const price = parseFloat(row.querySelector('.gst-price')?.value || 0) || 0;
        const gstRate = parseFloat(option?.dataset?.gst || businessSettings.gstRate || 0) || 0;
        const hsn = option?.dataset?.hsn || '';
        items.push({
            id: select.value,
            name: option.textContent || '',
            quantity: qty,
            price,
            gstRate,
            hsn
        });
    });
    return items;
}

function getGstDocNumber(nextNumber = businessSettings.gstInvoiceNextNumber) {
    const prefix = businessSettings.gstInvoicePrefix || '';
    const pad = parseInt(businessSettings.gstInvoicePad || 4, 10);
    const num = String(nextNumber).padStart(pad, '0');
    return `${prefix}${num}`;
}

function buildPreviewData(docNoOverride) {
    const items = collectGstItems();
    const total = calculateGstTotal();
    const paid = parseFloat(gstAmountPaid?.value || 0) || 0;
    const dateVal = gstDate?.value ? new Date(gstDate.value) : new Date();
    const option = gstCustomer?.selectedOptions?.[0];
    const customerName = option?.textContent || '';
    const docNo = docNoOverride || getGstDocNumber();

    return {
        id: docNo,
        invoiceNo: docNo,
        copyLabel: 'ORIGINAL',
        dateStr: dateVal.toLocaleDateString('en-GB'),
        company: companyCache || {},
        customer: customerName,
        customerAddress: option?.dataset?.address || '',
        customerCity: option?.dataset?.city || '',
        customerState: option?.dataset?.state || '',
        customerZip: option?.dataset?.zip || '',
        customerPhone: option?.dataset?.phone || '',
        customerTaxId: option?.dataset?.taxid || '',
        items,
        amount: total,
        amountPaid: paid,
        balance: total - paid,
        transportCost: parseFloat(gstTransportCost?.value || 0) || 0,
        vehicle: gstVehicle?.value || '',
        transporter: gstTransporter?.value || '',
        ewayBill: gstEwayBill?.value || '',
        placeOfSupply: gstPlaceOfSupply?.value || '',
        reverseCharge: gstReverseCharge?.value || '',
        taxMode: gstTaxMode?.value || 'CGST_SGST',
        docType: gstDocType?.value || 'Tax Invoice'
    };
}

function updateGstPreview() {
    if (!gstPreviewFrame || !window.getInvoiceTemplate) return;
    const data = buildPreviewData();
    const html = window.getInvoiceTemplate('original', data);
    const doc = gstPreviewFrame.contentDocument || gstPreviewFrame.contentWindow.document;
    doc.open();
    doc.write(html);
    doc.close();
}

function printGstPreview() {
    const data = buildPreviewData();
    printGstDocument(data);
}

function printGstDocument(docData) {
    const docDate = docData?.date?.toDate ? docData.date.toDate() : new Date(docData?.date || Date.now());
    const payload = {
        ...docData,
        id: docData?.id || docData?.docNo || 'GST',
        invoiceNo: docData?.invoiceNo || docData?.docNo || docData?.id || '',
        dateStr: docData?.dateStr || formatDate(docDate),
        customer: docData?.customer || docData?.customerName || '',
        company: { ...(companyCache || {}), ...(docData?.company || {}) },
        copyLabel: docData?.copyLabel || 'ORIGINAL'
    };
    const html = window.getInvoiceTemplate('original', payload);
    const printFrame = document.createElement('iframe');
    printFrame.style.position = 'fixed';
    printFrame.style.right = '0';
    printFrame.style.bottom = '0';
    printFrame.style.width = '0';
    printFrame.style.height = '0';
    printFrame.style.border = '0';
    document.body.appendChild(printFrame);
    const frameDoc = printFrame.contentWindow.document;
    frameDoc.open();
    frameDoc.write(html);
    frameDoc.close();
    printFrame.onload = () => {
        printFrame.contentWindow.focus();
        printFrame.contentWindow.print();
        setTimeout(() => printFrame.remove(), 500);
    };
}

async function saveGstDocument() {
    const user = JSON.parse(localStorage.getItem('user'));
    if (!user) return;
    const businessId = user.businessId || user.uid;
    const items = collectGstItems();
    const customerOption = gstCustomer?.selectedOptions?.[0];
    if (!customerOption || !items.length) {
        showAlert('warning', 'Please select a customer and add items.');
        return;
    }

    const settingsRef = db.collection('users').doc(businessId).collection('settings').doc('business');
    const gstRef = db.collection('users').doc(businessId).collection('gstDocuments').doc();
    const dateVal = gstDate?.value ? new Date(gstDate.value) : new Date();

    try {
        await db.runTransaction(async (t) => {
            const settingsSnap = await t.get(settingsRef);
            const settings = settingsSnap.exists ? settingsSnap.data() : {};
            const next = settings.gstInvoiceNextNumber ?? businessSettings.gstInvoiceNextNumber ?? 1;
            const prefix = settings.gstInvoicePrefix ?? businessSettings.gstInvoicePrefix ?? '';
            const pad = settings.gstInvoicePad ?? businessSettings.gstInvoicePad ?? 4;
            const docNo = `${prefix}${String(next).padStart(pad, '0')}`;
            const total = calculateGstTotal();
            const paid = parseFloat(gstAmountPaid?.value || 0) || 0;

            const docData = {
                docNo,
                docType: gstDocType?.value || 'Tax Invoice',
                taxMode: gstTaxMode?.value || 'CGST_SGST',
                customerId: gstCustomer.value,
                customerName: customerOption.textContent || '',
                customerAddress: customerOption.dataset.address || '',
                customerCity: customerOption.dataset.city || '',
                customerState: customerOption.dataset.state || '',
                customerZip: customerOption.dataset.zip || '',
                customerPhone: customerOption.dataset.phone || '',
                customerTaxId: customerOption.dataset.taxid || '',
                placeOfSupply: gstPlaceOfSupply?.value || '',
                reverseCharge: gstReverseCharge?.value || 'No',
                ewayBill: gstEwayBill?.value || '',
                transporter: gstTransporter?.value || '',
                vehicle: gstVehicle?.value || '',
                transportCost: parseFloat(gstTransportCost?.value || 0) || 0,
                amountPaid: paid,
                amount: total,
                items,
                date: dateVal,
                createdAt: new Date()
            };

            t.set(gstRef, docData);
            t.set(settingsRef, { gstInvoiceNextNumber: next + 1 }, { merge: true });
        });

        showAlert('success', 'GST document saved');
        await loadGstDocs();
        updateGstPreview();
    } catch (e) {
        console.error('Error saving GST document:', e);
        showAlert('danger', 'Failed to save GST document');
    }
}

async function deleteGstDocument(id) {
    const user = JSON.parse(localStorage.getItem('user'));
    if (!user) return;
    const businessId = user.businessId || user.uid;
    if (!confirm('Delete this GST document?')) return;
    try {
        await db.collection('users').doc(businessId).collection('gstDocuments').doc(id).delete();
        gstDocs = gstDocs.filter(d => d.id !== id);
        renderGstTable(gstDocs);
        showAlert('success', 'GST document deleted');
    } catch (e) {
        console.error('Error deleting GST document:', e);
        showAlert('danger', 'Delete failed');
    }
}

function exportGstCSV() {
    if (!gstDocs.length) {
        alert('No GST documents to export.');
        return;
    }
    const headers = ['Date', 'Doc #', 'Type', 'Customer', 'Amount', 'Tax Mode', 'Place of Supply'];
    const rows = gstDocs.map(d => ([
        d.date ? formatDate(d.date) : '',
        d.docNo || '',
        d.docType || '',
        d.customerName || '',
        d.amount || 0,
        d.taxMode || '',
        d.placeOfSupply || ''
    ]));
    downloadCSV(`gst_documents_${new Date().toISOString().split('T')[0]}.csv`, headers, rows);
}

function exportGstPDF() {
    if (!gstDocs.length) {
        alert('No GST documents to export.');
        return;
    }
    const headers = ['Date', 'Doc #', 'Type', 'Customer', 'Amount'];
    const rows = gstDocs.map(d => ([
        d.date ? formatDate(d.date) : '',
        d.docNo || '',
        d.docType || '',
        d.customerName || '',
        `₹${Number(d.amount || 0).toLocaleString()}`
    ]));
    downloadPDF(`gst_documents_${new Date().toISOString().split('T')[0]}.pdf`, 'GST Documents', headers, rows);
}
