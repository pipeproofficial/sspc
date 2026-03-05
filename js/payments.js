import { db } from './firebase-config.js';
import { checkAuth, formatDate, downloadCSV } from './dashboard.js';

const paymentInTable = document.getElementById('paymentInTable');
const paymentOutTable = document.getElementById('paymentOutTable');
const paymentInSearch = document.getElementById('paymentInSearch');
const paymentOutSearch = document.getElementById('paymentOutSearch');
const paymentInMode = document.getElementById('paymentInMode');
const paymentOutMode = document.getElementById('paymentOutMode');
const paymentInFrom = document.getElementById('paymentInFrom');
const paymentInTo = document.getElementById('paymentInTo');
const paymentOutFrom = document.getElementById('paymentOutFrom');
const paymentOutTo = document.getElementById('paymentOutTo');
const resetPaymentInFilters = document.getElementById('resetPaymentInFilters');
const resetPaymentOutFilters = document.getElementById('resetPaymentOutFilters');
const paymentInTotal = document.getElementById('paymentInTotal');
const paymentOutTotal = document.getElementById('paymentOutTotal');
const exportPaymentInCsvBtn = document.getElementById('exportPaymentInCsvBtn');
const exportPaymentOutCsvBtn = document.getElementById('exportPaymentOutCsvBtn');
const paymentsViewBtn = document.getElementById('paymentsViewBtn');
const addPaymentInBtn = document.getElementById('addPaymentInBtn');
const addPaymentOutBtn = document.getElementById('addPaymentOutBtn');
const paymentInSelectModal = document.getElementById('paymentInSelectModal');
const paymentOutSelectModal = document.getElementById('paymentOutSelectModal');
const paymentInInvoiceSelect = document.getElementById('paymentInInvoiceSelect');
const paymentOutSupplierSelect = document.getElementById('paymentOutSupplierSelect');
const confirmPaymentInSelect = document.getElementById('confirmPaymentInSelect');
const confirmPaymentOutSelect = document.getElementById('confirmPaymentOutSelect');
const paymentInToggle = document.getElementById('paymentInToggle');
const paymentOutToggle = document.getElementById('paymentOutToggle');
const paymentInPane = document.getElementById('paymentInPane');
const paymentOutPane = document.getElementById('paymentOutPane');
const paymentsViewWrap = paymentsViewBtn ? paymentsViewBtn.closest('.dropdown') : null;

let paymentInData = [];
let paymentOutData = [];
let pendingPurchaseOrderPrefill = null;

function escapeHtml(value) {
    return String(value || '').replace(/[&<>"']/g, (ch) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    })[ch]);
}

function encodeSelectorPayload(payload = {}) {
    try {
        return encodeURIComponent(JSON.stringify(payload));
    } catch (error) {
        return '';
    }
}

function decodeSelectorPayload(value = '') {
    const raw = String(value || '').trim();
    if (!raw) return null;
    try {
        return JSON.parse(decodeURIComponent(raw));
    } catch (error) {
        const [kind, id, name] = raw.split('|');
        if (!kind || !id) return null;
        return { kind, id, name: name || '' };
    }
}

function readPurchaseOrderPrefill() {
    const raw = sessionStorage.getItem('prefill_purchase_order_data');
    if (!raw) return null;
    try {
        const po = JSON.parse(raw);
        if (!po || typeof po !== 'object') return null;
        return po;
    } catch (error) {
        console.error('Invalid purchase-order prefill payload', error);
        return null;
    }
}

function clearPurchaseOrderPrefill() {
    sessionStorage.removeItem('prefill_purchase_order_id');
    sessionStorage.removeItem('prefill_purchase_order_data');
}

function buildSupplierPaymentPrefillFromPo(po = {}) {
    const total = Number(po.total || 0);
    const advance = Number(po.advanceAmount || 0);
    const payable = Math.max(0, total - advance);
    const poNo = String(po.poNo || '').trim();
    const poItems = Array.isArray(po.items) ? po.items : [];
    return {
        amount: payable > 0 ? payable : 0,
        reference: poNo,
        notes: poNo ? `Purchase Bill against PO ${poNo}` : 'Purchase Bill',
        poId: po.id || '',
        poNo,
        poItems
    };
}

function maybeLaunchPurchaseOrderPrefill() {
    if (window.location.hash !== '#purchase-bills') return;
    if (!pendingPurchaseOrderPrefill) {
        pendingPurchaseOrderPrefill = readPurchaseOrderPrefill();
    }
    const po = pendingPurchaseOrderPrefill;
    if (!po) return;
    const supplierId = String(po.supplierId || '').trim();
    const supplierName = String(po.supplierName || '').trim();
    if (!supplierId || !supplierName || typeof window.recordSupplierPayment !== 'function') return;
    window.recordSupplierPayment(supplierId, supplierName, buildSupplierPaymentPrefillFromPo(po));
    pendingPurchaseOrderPrefill = null;
    clearPurchaseOrderPrefill();
}

document.addEventListener('DOMContentLoaded', async () => {
    await checkAuth();
    setupListeners();

    if (window.location.hash === '#payments' || window.location.hash === '#payment-in' || window.location.hash === '#payment-out' || window.location.hash === '#purchase-bills') {
        loadPayments();
        applyHashDrivenPaymentsView();
        maybeLaunchPurchaseOrderPrefill();
    }

    window.addEventListener('sectionChanged', (e) => {
        if (e.detail === 'payments') {
            loadPayments();
            applyHashDrivenPaymentsView();
            maybeLaunchPurchaseOrderPrefill();
        }
    });

    window.addEventListener('hashchange', () => {
        if (window.location.hash === '#payments' || window.location.hash === '#payment-in' || window.location.hash === '#payment-out' || window.location.hash === '#purchase-bills') {
            applyHashDrivenPaymentsView();
            maybeLaunchPurchaseOrderPrefill();
        }
    });

    window.addEventListener('paymentsUpdated', () => {
        loadPayments();
    });
});

function setupListeners() {
    if (paymentInSearch) paymentInSearch.addEventListener('input', renderPaymentIn);
    if (paymentOutSearch) paymentOutSearch.addEventListener('input', renderPaymentOut);
    if (paymentInMode) paymentInMode.addEventListener('change', renderPaymentIn);
    if (paymentOutMode) paymentOutMode.addEventListener('change', renderPaymentOut);
    if (paymentInFrom) paymentInFrom.addEventListener('change', renderPaymentIn);
    if (paymentInTo) paymentInTo.addEventListener('change', renderPaymentIn);
    if (paymentOutFrom) paymentOutFrom.addEventListener('change', renderPaymentOut);
    if (paymentOutTo) paymentOutTo.addEventListener('change', renderPaymentOut);

    if (resetPaymentInFilters) {
        resetPaymentInFilters.addEventListener('click', () => {
            if (paymentInSearch) paymentInSearch.value = '';
            if (paymentInMode) paymentInMode.value = 'all';
            if (paymentInFrom) paymentInFrom.value = '';
            if (paymentInTo) paymentInTo.value = '';
            renderPaymentIn();
        });
    }

    if (resetPaymentOutFilters) {
        resetPaymentOutFilters.addEventListener('click', () => {
            if (paymentOutSearch) paymentOutSearch.value = '';
            if (paymentOutMode) paymentOutMode.value = 'all';
            if (paymentOutFrom) paymentOutFrom.value = '';
            if (paymentOutTo) paymentOutTo.value = '';
            renderPaymentOut();
        });
    }

    if (exportPaymentInCsvBtn) {
        exportPaymentInCsvBtn.addEventListener('click', exportPaymentInCSV);
    }
    if (exportPaymentOutCsvBtn) {
        exportPaymentOutCsvBtn.addEventListener('click', exportPaymentOutCSV);
    }

    if (paymentInToggle) {
        paymentInToggle.addEventListener('click', () => setPaymentsView('in'));
    }
    if (paymentOutToggle) {
        paymentOutToggle.addEventListener('click', () => setPaymentsView('out'));
    }

    if (addPaymentInBtn) {
        addPaymentInBtn.addEventListener('click', openPaymentInSelector);
    }
    if (addPaymentOutBtn) {
        addPaymentOutBtn.addEventListener('click', openPaymentOutSelector);
    }
    if (confirmPaymentInSelect) {
        confirmPaymentInSelect.addEventListener('click', () => {
            const id = paymentInInvoiceSelect?.value || '';
            if (!id) return;
            const modal = bootstrap.Modal.getInstance(paymentInSelectModal);
            if (modal) modal.hide();
            if (window.openPaymentHistory) {
                window.openPaymentHistory(id);
            }
        });
    }
    if (confirmPaymentOutSelect) {
        confirmPaymentOutSelect.addEventListener('click', () => {
            const val = paymentOutSupplierSelect?.value || '';
            if (!val) return;
            const payload = decodeSelectorPayload(val);
            if (!payload?.kind || !payload?.id) return;
            const kind = payload.kind;
            const id = payload.id;
            const name = payload.name || '';
            const modal = bootstrap.Modal.getInstance(paymentOutSelectModal);
            if (modal) modal.hide();
            if (kind === 'labour' && window.recordLabourPayment) {
                window.recordLabourPayment(id);
            } else if (window.recordSupplierPayment) {
                const poPrefill = pendingPurchaseOrderPrefill;
                const poSupplierId = String(poPrefill?.supplierId || '').trim();
                const poSupplierName = String(poPrefill?.supplierName || '').trim().toLowerCase();
                const selectedName = String(name || '').trim().toLowerCase();
                const shouldUsePoPrefill = Boolean(poPrefill) && (poSupplierId === id || (poSupplierName && poSupplierName === selectedName));
                const prefill = shouldUsePoPrefill ? buildSupplierPaymentPrefillFromPo(poPrefill) : {};
                window.recordSupplierPayment(id, name, prefill);
                if (shouldUsePoPrefill) {
                    pendingPurchaseOrderPrefill = null;
                    clearPurchaseOrderPrefill();
                }
            }
        });
    }

    if (paymentInTable) {
        paymentInTable.addEventListener('click', async (e) => {
            const btn = e.target.closest('.delete-payment-btn');
            if (!btn) return;
            const id = btn.dataset.id || '';
            if (!id) return;
            await deletePaymentTransaction(id, 'in');
        });
    }
    if (paymentOutTable) {
        paymentOutTable.addEventListener('click', async (e) => {
            const editBtn = e.target.closest('.edit-payment-btn');
            if (editBtn) {
                const id = editBtn.dataset.id || '';
                if (id && typeof window.editPurchaseBill === 'function') {
                    await window.editPurchaseBill(id);
                }
                return;
            }
            const pdfBtn = e.target.closest('.pdf-purchase-bill-btn');
            if (pdfBtn) {
                const id = pdfBtn.dataset.id || '';
                if (!id) return;
                try {
                    await downloadPurchaseBillPdf(id);
                } catch (error) {
                    console.error('Failed to generate purchase bill PDF', error);
                    alert(error.message || 'Failed to generate purchase bill PDF');
                }
                return;
            }
            const btn = e.target.closest('.delete-payment-btn');
            if (!btn) return;
            const id = btn.dataset.id || '';
            if (!id) return;
            await deletePaymentTransaction(id, 'out');
        });
    }

    // handled by setPaymentsView
}

async function loadPayments() {
    const user = JSON.parse(localStorage.getItem('user'));
    if (!user) return;
    const businessId = user.businessId || user.uid;

    if (paymentInTable) {
        paymentInTable.querySelector('tbody').innerHTML = '<tr><td colspan="7" class="text-center">Loading...</td></tr>';
    }
    if (paymentOutTable) {
        paymentOutTable.querySelector('tbody').innerHTML = '<tr><td colspan="7" class="text-center">Loading...</td></tr>';
    }

    try {
        const [paymentInSnap, paymentOutSnap, invoiceSnap] = await Promise.all([
            db.collection('users').doc(businessId).collection('transactions')
                .where('type', '==', 'Payment')
                .orderBy('date', 'desc')
                .get(),
            db.collection('users').doc(businessId).collection('transactions')
                .where('type', '==', 'SupplierPayment')
                .orderBy('date', 'desc')
                .get(),
            db.collection('users').doc(businessId).collection('transactions')
                .where('type', '==', 'Invoice')
                .orderBy('date', 'desc')
                .limit(200)
                .get()
        ]);

        paymentInData = [];
        const paymentTotals = {};
        paymentInSnap.forEach(doc => {
            const p = doc.data();
            if (p.invoiceId) {
                paymentTotals[p.invoiceId] = (paymentTotals[p.invoiceId] || 0) + (p.amount || 0);
            }
            paymentInData.push({
                id: doc.id,
                date: p.date,
                customer: p.customer || '-',
                mode: p.mode || '-',
                reference: p.reference || '-',
                description: p.description || 'Payment In',
                amount: p.amount ?? 0,
                invoiceId: p.invoiceId || null,
                paymentId: p.paymentId || null,
                source: p.source || null,
                canDelete: true
            });
        });

        invoiceSnap.forEach(doc => {
            const inv = doc.data();
            const paid = Number(inv.amountPaid || 0);
            if (paid <= 0) return;
            const recorded = Number(paymentTotals[doc.id] || 0);
            const diff = paid - recorded;
            if (diff > 0.01) {
                paymentInData.push({
                    id: `${doc.id}_initial`,
                    date: inv.date,
                    customer: inv.customer || '-',
                    mode: 'Initial',
                    reference: `#${doc.id.substr(0,6).toUpperCase()}`,
                    description: 'Initial payment (legacy)',
                    amount: diff,
                    invoiceId: doc.id,
                    paymentId: null,
                    source: 'legacy_initial',
                    canDelete: false
                });
            }
        });
        paymentInData.sort((a, b) => {
            const ad = a.date?.toDate ? a.date.toDate() : (a.date ? new Date(a.date) : new Date(0));
            const bd = b.date?.toDate ? b.date.toDate() : (b.date ? new Date(b.date) : new Date(0));
            return bd - ad;
        });

        const paymentOutMap = new Map();
        paymentOutSnap.forEach(doc => {
            const p = doc.data();
            const key = p.clientTxId || doc.id;
            if (paymentOutMap.has(key)) return;
            paymentOutMap.set(key, {
                id: doc.id,
                date: p.date,
                supplier: p.supplier || '-',
                mode: p.mode || '-',
                reference: p.reference || '-',
                description: p.description || 'Payment Out',
                amount: p.amount ?? 0,
                supplierId: p.supplierId || null,
                payableId: p.payableId || null,
                source: p.source || null,
                canDelete: true
            });
        });
        paymentOutData = Array.from(paymentOutMap.values());
        paymentOutData.sort((a, b) => {
            const ad = a.date?.toDate ? a.date.toDate() : (a.date ? new Date(a.date) : new Date(0));
            const bd = b.date?.toDate ? b.date.toDate() : (b.date ? new Date(b.date) : new Date(0));
            return bd - ad;
        });

        renderPaymentIn();
        renderPaymentOut();
    } catch (e) {
        console.error('Error loading payments', e);
        if (paymentInTable) {
            paymentInTable.querySelector('tbody').innerHTML = '<tr><td colspan="7" class="text-center text-danger">Error loading data</td></tr>';
        }
        if (paymentOutTable) {
            paymentOutTable.querySelector('tbody').innerHTML = '<tr><td colspan="7" class="text-center text-danger">Error loading data</td></tr>';
        }
    }
}

async function openPaymentInSelector() {
    if (!paymentInSelectModal || !paymentInInvoiceSelect) return;
    paymentInInvoiceSelect.innerHTML = '<option value="">Loading...</option>';

    const user = JSON.parse(localStorage.getItem('user'));
    if (!user) return;
    const businessId = user.businessId || user.uid;

    try {
        const snap = await db.collection('users').doc(businessId)
            .collection('transactions')
            .where('type', '==', 'Invoice')
            .orderBy('date', 'desc')
            .limit(200)
            .get();

        const options = [];
        snap.forEach(doc => {
            const inv = doc.data();
            const balance = Number(inv.balance || 0);
            if (balance <= 0) return;
            const invNo = inv.invoiceNo || `#${doc.id.substr(0,6).toUpperCase()}`;
            const label = `${invNo} - ${inv.customer || 'Customer'} (Bal: ₹${balance.toLocaleString()})`;
            options.push(`<option value="${doc.id}">${label}</option>`);
        });

        if (!options.length) {
            paymentInInvoiceSelect.innerHTML = '<option value="">No unpaid invoices</option>';
        } else {
            paymentInInvoiceSelect.innerHTML = '<option value="">Select Invoice...</option>' + options.join('');
        }
    } catch (e) {
        console.error('Failed to load invoices', e);
        paymentInInvoiceSelect.innerHTML = '<option value="">Error loading invoices</option>';
    }

    new bootstrap.Modal(paymentInSelectModal).show();
}

async function openPaymentOutSelector() {
    if (!paymentOutSelectModal || !paymentOutSupplierSelect) return;
    paymentOutSupplierSelect.innerHTML = '<option value="">Loading...</option>';

    const user = JSON.parse(localStorage.getItem('user'));
    if (!user) return;
    const businessId = user.businessId || user.uid;

    try {
        const [supplierSnap, labourPayablesSnap] = await Promise.all([
            db.collection('users').doc(businessId)
                .collection('suppliers')
                .orderBy('name')
                .get(),
            db.collection('users').doc(businessId)
                .collection('labour_payables')
                .get()
        ]);

        const supplierOptions = [];
        supplierSnap.forEach(doc => {
            const s = doc.data();
            const name = s.name || 'Supplier';
            const payload = encodeSelectorPayload({ kind: 'supplier', id: doc.id, name });
            supplierOptions.push(`<option value="${payload}">${escapeHtml(name)}</option>`);
        });

        const labourRows = [];
        labourPayablesSnap.forEach(doc => {
            const p = doc.data() || {};
            if (p.isDeleted) return;
            const amountDue = Number(p.amountDue || 0);
            const amountPaid = Math.max(Number(p.amountPaid || 0), 0);
            const pending = Math.max(Number(p.amountPending ?? (amountDue - amountPaid)), 0);
            const status = (p.status || '').toLowerCase();
            if (pending <= 0) return;
            if (status === 'paid' || status === 'deleted') return;
            labourRows.push({
                id: doc.id,
                worker: (p.workerName || 'Labour').toString().trim() || 'Labour',
                batch: p.batchId || '-',
                date: p.workDate || '-',
                pending
            });
        });
        labourRows.sort((a, b) => `${b.date}_${b.batch}`.localeCompare(`${a.date}_${a.batch}`));
        const labourOptions = labourRows.map(row => {
            const label = `${row.worker} | Batch ${row.batch} | ${row.date} | Due: ₹${row.pending.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
            const payload = encodeSelectorPayload({ kind: 'labour', id: row.id, name: row.worker });
            return `<option value="${payload}">${escapeHtml(label)}</option>`;
        });

        const groups = [];
        if (labourOptions.length) groups.push(`<optgroup label="Labour Dues">${labourOptions.join('')}</optgroup>`);
        if (supplierOptions.length) groups.push(`<optgroup label="Suppliers">${supplierOptions.join('')}</optgroup>`);
        if (!groups.length) {
            paymentOutSupplierSelect.innerHTML = '<option value="">No suppliers or labour dues found</option>';
        } else {
            paymentOutSupplierSelect.innerHTML = '<option value="">Select Supplier / Labour Due...</option>' + groups.join('');
            const po = pendingPurchaseOrderPrefill || readPurchaseOrderPrefill();
            if (po) {
                pendingPurchaseOrderPrefill = po;
                const poSupplierId = String(po.supplierId || '').trim();
                const poSupplierName = String(po.supplierName || '').trim().toLowerCase();
                const options = Array.from(paymentOutSupplierSelect.querySelectorAll('option'));
                const matched = options.find((opt) => {
                    const payload = decodeSelectorPayload(opt.value);
                    if (!payload || payload.kind !== 'supplier') return false;
                    const byId = poSupplierId && payload.id === poSupplierId;
                    const byName = poSupplierName && String(payload.name || '').trim().toLowerCase() === poSupplierName;
                    return byId || byName;
                });
                if (matched) paymentOutSupplierSelect.value = matched.value;
            }
        }
    } catch (e) {
        console.error('Failed to load suppliers/labour dues', e);
        paymentOutSupplierSelect.innerHTML = '<option value="">Error loading suppliers/labour dues</option>';
    }

    new bootstrap.Modal(paymentOutSelectModal).show();
}
window.openPaymentOutSelector = openPaymentOutSelector;

function withinDateRange(dateValue, fromVal, toVal) {
    if (!dateValue) return true;
    const dateObj = dateValue.toDate ? dateValue.toDate() : new Date(dateValue);
    if (Number.isNaN(dateObj.getTime())) return true;
    if (fromVal) {
        const fromDate = new Date(fromVal);
        if (dateObj < fromDate) return false;
    }
    if (toVal) {
        const toDate = new Date(toVal);
        toDate.setHours(23, 59, 59, 999);
        if (dateObj > toDate) return false;
    }
    return true;
}

async function generatePdfFromTemplateHtml(templateHTML, filename) {
    const jsPDFRef = window.jspdf && window.jspdf.jsPDF ? window.jspdf.jsPDF : null;
    if (!jsPDFRef || !window.html2canvas) {
        throw new Error('PDF library not loaded. Please refresh and try again.');
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

        await new Promise((resolve) => {
            iframe.onload = () => setTimeout(resolve, 300);
        });

        const images = Array.from(iframe.contentDocument.images || []);
        await Promise.all(images.map((img) => new Promise((res) => {
            if (img.complete) return res();
            img.onload = () => res();
            img.onerror = () => res();
        })));

        const pdf = new jsPDFRef('p', 'pt', 'a4');
        const pageWidth = pdf.internal.pageSize.getWidth();
        const pageHeight = pdf.internal.pageSize.getHeight();
        const targets = [iframe.contentDocument.body];

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
            if (i > 0) pdf.addPage();
            pdf.addImage(imgData, 'PNG', 0, 0, drawWidth, drawHeight);
        }

        pdf.save(filename);
    } finally {
        iframe.remove();
    }
}

async function downloadPurchaseBillPdf(transactionId) {
    if (!transactionId) return;
    if (typeof window.getInvoiceTemplate !== 'function') {
        throw new Error('Invoice layout engine is not available.');
    }
    const user = JSON.parse(localStorage.getItem('user'));
    if (!user) return;
    const businessId = user.businessId || user.uid;

    const txRef = db.collection('users').doc(businessId).collection('transactions').doc(transactionId);
    const txDoc = await txRef.get();
    if (!txDoc.exists) throw new Error('Purchase bill transaction not found.');
    const tx = txDoc.data() || {};
    if (String(tx.source || '').toLowerCase() !== 'purchase_bill') {
        throw new Error('Selected transaction is not a purchase bill.');
    }

    const billId = String(tx.billId || tx.clientTxId || txRef.id).trim() || txRef.id;
    const billDoc = await db.collection('users').doc(businessId).collection('purchase_bills').doc(billId).get();
    const bill = billDoc.exists ? (billDoc.data() || {}) : {};
    const items = Array.isArray(bill.items) ? bill.items : [];
    const mappedItems = items.map((item) => ({
        name: item.materialName || item.materialId || 'Raw Material',
        quantity: Number(item.qty || 0),
        price: Number(item.rate || 0),
        gstRate: Number(item.gstRate || 0),
        hsn: item.hsn || item.hsnSac || ''
    }));

    const settingsDoc = await db.collection('users').doc(businessId).collection('settings').doc('business').get();
    const settings = settingsDoc.exists ? (settingsDoc.data() || {}) : {};
    const supplierName = bill.supplierName || tx.supplier || '-';
    const billDate = bill.date || tx.date || new Date();
    const dateStr = billDate?.toDate ? formatDate(billDate.toDate()) : formatDate(new Date(billDate));
    const referenceNo = String(bill.reference || tx.reference || '').trim();
    const poNo = String(bill.poId || tx.poId || '').trim();
    const mode = String(bill.mode || tx.mode || '').trim();
    const computedTotal = mappedItems.reduce((sum, item) => sum + (Number(item.quantity || 0) * Number(item.price || 0)), 0);
    const totalAmount = Number(bill.totalAmount ?? tx.amount ?? computedTotal) || 0;

    const company = {
        ...settings,
        companyName: settings.companyName || user.businessName || 'PipePRO',
        taxId: settings.taxId || settings.gstin || ''
    };

    const templateData = {
        id: billId,
        invoiceNo: referenceNo || `PB-${billId.slice(0, 6).toUpperCase()}`,
        copyLabel: 'Original',
        dateStr,
        company,
        customer: supplierName,
        customerAddress: '',
        customerCity: '',
        customerState: '',
        customerZip: '',
        customerVillage: '',
        customerDistrict: '',
        customerMandal: '',
        customerPhone: '',
        customerTaxId: '',
        shipTo: null,
        items: mappedItems.length ? mappedItems : [{ name: 'Raw Material', quantity: 1, price: totalAmount, gstRate: 0, hsn: '' }],
        amount: totalAmount,
        status: 'Paid',
        balance: 0,
        amountPaid: totalAmount,
        transportCost: 0,
        vehicle: '',
        driver: '',
        poNumber: poNo || '-',
        poDate: '',
        paymentMode: mode || '-',
        docType: 'Purchase Bill',
        templateOptions: {}
    };

    const templateHTML = window.getInvoiceTemplate('original', templateData);
    const safeName = (templateData.invoiceNo || billId).replace(/[^a-z0-9_-]/gi, '_').slice(0, 40) || 'purchase_bill';
    await generatePdfFromTemplateHtml(templateHTML, `purchase_bill_${safeName}.pdf`);
}

function renderPaymentIn() {
    if (!paymentInTable) return;
    const tbody = paymentInTable.querySelector('tbody');
    const searchTerm = (paymentInSearch?.value || '').toLowerCase();
    const modeFilter = paymentInMode?.value || 'all';
    const fromVal = paymentInFrom?.value || '';
    const toVal = paymentInTo?.value || '';

    const filtered = paymentInData.filter(p => {
        const text = `${p.customer} ${p.reference} ${p.description}`.toLowerCase();
        if (searchTerm && !text.includes(searchTerm)) return false;
        if (modeFilter !== 'all' && (p.mode || '-') !== modeFilter) return false;
        if (!withinDateRange(p.date, fromVal, toVal)) return false;
        return true;
    });

    if (!filtered.length) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted">No payments found</td></tr>';
    } else {
        tbody.innerHTML = filtered.map(p => `
            <tr>
                <td>${p.date ? formatDate(p.date) : '-'}</td>
                <td>${p.customer}</td>
                <td>${p.mode}</td>
                <td>${p.reference}</td>
                <td>${p.description}</td>
                <td class="text-end text-success fw-bold">&#8377;${Number(p.amount || 0).toLocaleString()}</td>
                <td class="table-actions-cell text-end">
                    ${p.canDelete
                        ? `<div class="dropdown">
                            <button class="btn btn-sm btn-outline-secondary table-actions-toggle" type="button" data-bs-toggle="dropdown" data-bs-boundary="window" aria-expanded="false" aria-label="Payment actions">
                                <i class="fas fa-ellipsis-v"></i>
                            </button>
                            <ul class="dropdown-menu dropdown-menu-end shadow-sm">
                                <li><button type="button" class="dropdown-item text-danger delete-payment-btn" data-id="${p.id}"><i class="fas fa-trash fa-fw me-2"></i>Delete</button></li>
                            </ul>
                        </div>`
                        : '<span class="text-muted small">Locked</span>'}
                </td>
            </tr>
        `).join('');
    }

    const total = filtered.reduce((sum, p) => sum + (p.amount || 0), 0);
    if (paymentInTotal) paymentInTotal.innerHTML = `&#8377;${total.toLocaleString()}`;
}

function renderPaymentOut() {
    if (!paymentOutTable) return;
    const tbody = paymentOutTable.querySelector('tbody');
    const searchTerm = (paymentOutSearch?.value || '').toLowerCase();
    const modeFilter = paymentOutMode?.value || 'all';
    const fromVal = paymentOutFrom?.value || '';
    const toVal = paymentOutTo?.value || '';
    const isPurchaseBillsView = window.location.hash === '#purchase-bills';

    const baseData = isPurchaseBillsView
        ? paymentOutData.filter((p) => String(p.source || '').toLowerCase() === 'purchase_bill' && String(p.supplierId || '').toUpperCase() !== 'LABOUR')
        : paymentOutData;

    const filtered = baseData.filter(p => {
        const text = `${p.supplier} ${p.reference} ${p.description}`.toLowerCase();
        if (searchTerm && !text.includes(searchTerm)) return false;
        if (modeFilter !== 'all' && (p.mode || '-') !== modeFilter) return false;
        if (!withinDateRange(p.date, fromVal, toVal)) return false;
        return true;
    });

    if (!filtered.length) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted">${isPurchaseBillsView ? 'No purchase bills found' : 'No payments found'}</td></tr>`;
    } else {
        tbody.innerHTML = filtered.map(p => `
            <tr>
                <td>${p.date ? formatDate(p.date) : '-'}</td>
                <td>${p.supplier}</td>
                <td>${p.mode}</td>
                <td>${p.reference}</td>
                <td>${p.description}</td>
                <td class="text-end text-danger fw-bold">&#8377;${Number(p.amount || 0).toLocaleString()}</td>
                <td class="table-actions-cell text-end">
                    <div class="dropdown">
                        <button class="btn btn-sm btn-outline-secondary table-actions-toggle" type="button" data-bs-toggle="dropdown" data-bs-boundary="window" aria-expanded="false" aria-label="Payment actions">
                            <i class="fas fa-ellipsis-v"></i>
                        </button>
                        <ul class="dropdown-menu dropdown-menu-end shadow-sm">
                            ${p.source === 'purchase_bill'
                                ? `<li><button type="button" class="dropdown-item edit-payment-btn" data-id="${p.id}"><i class="fas fa-edit fa-fw me-2"></i>Edit Bill</button></li>`
                                : ''}
                            ${p.source === 'purchase_bill'
                                ? `<li><button type="button" class="dropdown-item pdf-purchase-bill-btn" data-id="${p.id}"><i class="fas fa-file-pdf fa-fw me-2"></i>Generate PDF</button></li>`
                                : ''}
                            ${p.source === 'purchase_bill' ? '<li><hr class="dropdown-divider"></li>' : ''}
                            <li><button type="button" class="dropdown-item text-danger delete-payment-btn" data-id="${p.id}"><i class="fas fa-trash fa-fw me-2"></i>Delete</button></li>
                        </ul>
                    </div>
                </td>
            </tr>
        `).join('');
    }

    const total = filtered.reduce((sum, p) => sum + (p.amount || 0), 0);
    if (paymentOutTotal) paymentOutTotal.innerHTML = `&#8377;${total.toLocaleString()}`;
}

async function deletePaymentTransaction(transactionId, direction) {
    if (!transactionId) return;
    if (String(transactionId).endsWith('_initial')) {
        alert('Legacy initial entries cannot be deleted here.');
        return;
    }
    const user = JSON.parse(localStorage.getItem('user'));
    if (!user) return;
    if (user.permissions && user.permissions.canDelete === false) {
        alert('You do not have permission to delete transactions.');
        return;
    }
    const businessId = user.businessId || user.uid;
    const confirmed = await window.showConfirmAsync('Delete Transaction', 'Delete this transaction? Linked balances will be adjusted automatically.', {
        confirmText: 'Delete',
        cancelText: 'Cancel'
    });
    if (!confirmed) return;

    try {
        const txRef = db.collection('users').doc(businessId).collection('transactions').doc(transactionId);
        const txDoc = await txRef.get();
        if (!txDoc.exists) throw new Error('Transaction not found');
        const tx = txDoc.data() || {};
        const amount = Number(tx.amount || 0);
        const type = tx.type || '';

        if (type === 'Payment') {
            const invoiceId = tx.invoiceId || null;
            await db.runTransaction(async (t) => {
                if (invoiceId) {
                    const invRef = db.collection('users').doc(businessId).collection('transactions').doc(invoiceId);
                    const invDoc = await t.get(invRef);
                    if (invDoc.exists) {
                        const inv = invDoc.data() || {};
                        const oldPayments = Array.isArray(inv.payments) ? inv.payments : [];
                        const filteredPayments = oldPayments.filter(p => {
                            const pid = p?.id || '';
                            const ppid = p?.paymentId || '';
                            return pid !== transactionId && ppid !== transactionId;
                        });
                        const nextAmountPaid = filteredPayments.reduce((sum, p) => sum + (Number(p?.amount || 0) || 0), 0);
                        const invAmount = Number(inv.amount || 0);
                        const nextBalance = invAmount - nextAmountPaid;
                        const nextStatus = nextBalance <= 0 ? 'Paid' : (nextAmountPaid > 0 ? 'Partial' : 'Pending');
                        t.update(invRef, {
                            payments: filteredPayments,
                            amountPaid: nextAmountPaid,
                            balance: nextBalance,
                            status: nextStatus
                        });
                    }
                }
                t.delete(txRef);
            });

            if (tx.customer) {
                const custSnap = await db.collection('users').doc(businessId).collection('customers')
                    .where('name', '==', tx.customer)
                    .limit(1)
                    .get();
                if (!custSnap.empty) {
                    const custRef = custSnap.docs[0].ref;
                    await db.runTransaction(async (t) => {
                        const cdoc = await t.get(custRef);
                        if (!cdoc.exists) return;
                        const currentBal = Number(cdoc.data()?.outstandingBalance || 0);
                        t.update(custRef, { outstandingBalance: currentBal + amount, lastContact: new Date() });
                    });
                }
            }
        } else if (type === 'SupplierPayment') {
            const payableId = tx.payableId || null;
            const isLabour = (String(tx.source || '').toLowerCase().startsWith('production_labour')) || tx.supplierId === 'LABOUR' || tx.supplier === 'Labour';
            const isPurchaseBill = String(tx.source || '').toLowerCase() === 'purchase_bill';

            await db.runTransaction(async (t) => {
                if (isPurchaseBill) {
                    const billId = tx.billId || transactionId;
                    const billRef = db.collection('users').doc(businessId).collection('purchase_bills').doc(billId);
                    const billDoc = await t.get(billRef);
                    const bill = billDoc.exists ? (billDoc.data() || {}) : {};
                    const billItems = Array.isArray(bill.items) ? bill.items : [];
                    const inventoryUpdates = [];

                    for (const item of billItems) {
                        const materialId = String(item.materialId || '').trim();
                        const qty = Number(item.qty || 0);
                        if (!materialId || qty <= 0) continue;
                        const invRef = db.collection('users').doc(businessId).collection('inventory').doc(materialId);
                        const invDoc = await t.get(invRef);
                        if (!invDoc.exists) throw new Error(`Material not found for reversal: ${item.materialName || materialId}`);
                        const currentQty = Number(invDoc.data()?.quantity || 0);
                        if (currentQty < qty) {
                            throw new Error(`Cannot delete bill. Insufficient stock to reverse ${item.materialName || 'material'}.`);
                        }
                        inventoryUpdates.push({
                            ref: invRef,
                            quantity: Math.round((currentQty - qty) * 1000) / 1000
                        });
                    }

                    let supplierRef = null;
                    let nextSupplierBal = null;
                    let nextSupplierTotalPurchase = null;
                    if (tx.supplierId && tx.supplierId !== 'LABOUR') {
                        supplierRef = db.collection('users').doc(businessId).collection('suppliers').doc(tx.supplierId);
                        const supplierDoc = await t.get(supplierRef);
                        if (supplierDoc.exists) {
                            const currentBal = Number(supplierDoc.data()?.balance || 0);
                            const currentTotalPurchase = Number(supplierDoc.data()?.totalPurchase || 0);
                            nextSupplierBal = currentBal - amount;
                            nextSupplierTotalPurchase = Math.max(0, currentTotalPurchase - amount);
                        }
                    }

                    let poRef = null;
                    let poStatus = null;
                    const poId = String(bill.poId || tx.poId || '').trim();
                    if (poId) {
                        const poRefPrimary = db.collection('users').doc(businessId).collection('purchase_orders').doc(poId);
                        const poPrimary = await t.get(poRefPrimary);
                        poRef = poPrimary.exists
                            ? poRefPrimary
                            : db.collection('users').doc(businessId).collection('orders').doc(poId);
                        const poDoc = poPrimary.exists ? poPrimary : await t.get(poRef);
                        if (poDoc.exists) {
                            const po = poDoc.data() || {};
                            const poItems = Array.isArray(po.items) ? po.items : [];
                            const billSnap = await db.collection('users').doc(businessId).collection('purchase_bills').where('poId', '==', poId).get();
                            const billedByMaterial = new Map();
                            billSnap.forEach((doc) => {
                                if (doc.id === billId) return;
                                const b = doc.data() || {};
                                const items = Array.isArray(b.items) ? b.items : [];
                                items.forEach((it) => {
                                    const mid = String(it.materialId || '').trim();
                                    const q = Number(it.qty || 0);
                                    if (!mid || q <= 0) return;
                                    billedByMaterial.set(mid, (billedByMaterial.get(mid) || 0) + q);
                                });
                            });
                            let totalOrdered = 0;
                            let totalBilled = 0;
                            poItems.forEach((it) => {
                                const ordered = Number(it.qty || 0);
                                const mid = String(it.materialId || '').trim();
                                totalOrdered += ordered > 0 ? ordered : 0;
                                totalBilled += mid ? (billedByMaterial.get(mid) || 0) : 0;
                            });
                            poStatus = totalBilled <= 0
                                ? 'Pending'
                                : (totalBilled + 1e-9 >= totalOrdered ? 'Completed' : 'Partially Received');
                        }
                    }

                    inventoryUpdates.forEach((entry) => {
                        t.update(entry.ref, { quantity: entry.quantity, updatedAt: new Date() });
                    });
                    if (supplierRef && Number.isFinite(nextSupplierBal)) {
                        const supplierPayload = { balance: nextSupplierBal, updatedAt: new Date() };
                        if (Number.isFinite(nextSupplierTotalPurchase)) {
                            supplierPayload.totalPurchase = nextSupplierTotalPurchase;
                        }
                        t.update(supplierRef, supplierPayload);
                    }
                    if (billDoc.exists) t.delete(billRef);
                    if (poRef && poStatus) {
                        t.set(poRef, { status: poStatus, updatedAt: new Date() }, { merge: true });
                    }
                } else if (isLabour && payableId) {
                    const payableRef = db.collection('users').doc(businessId).collection('labour_payables').doc(payableId);
                    const payableDoc = await t.get(payableRef);
                    if (payableDoc.exists) {
                        const p = payableDoc.data() || {};
                        const due = Number(p.amountDue || 0);
                        const paid = Math.max(Number(p.amountPaid || 0), 0);
                        const nextPaid = Math.max(Math.round((paid - amount) * 100) / 100, 0);
                        const nextPending = Math.max(Math.round((due - nextPaid) * 100) / 100, 0);
                        const nextStatus = nextPaid <= 0 ? (p.approvedAt ? 'approved' : 'pending') : (nextPending <= 0 ? 'paid' : 'partial');
                        const txIds = Array.isArray(p.txIds) ? p.txIds.filter(id => id !== transactionId) : [];
                        t.update(payableRef, {
                            amountPaid: nextPaid,
                            amountPending: nextPending,
                            status: nextStatus,
                            txIds,
                            updatedAt: new Date()
                        });
                    }
                } else if (tx.supplierId && tx.supplierId !== 'LABOUR') {
                    const supplierRef = db.collection('users').doc(businessId).collection('suppliers').doc(tx.supplierId);
                    const supplierDoc = await t.get(supplierRef);
                    if (supplierDoc.exists) {
                        const currentBal = Number(supplierDoc.data()?.balance || 0);
                        t.update(supplierRef, { balance: currentBal + amount, updatedAt: new Date() });
                    }
                }
                t.delete(txRef);
            });
        } else {
            await txRef.delete();
        }

        await loadPayments();
        if (direction === 'out') {
            window.dispatchEvent(new CustomEvent('paymentsUpdated'));
        }
        alert('Transaction deleted');
    } catch (error) {
        console.error('Delete payment transaction failed', error);
        alert(error.message || 'Failed to delete transaction');
    }
}

function setPaymentsView(mode) {
    const inPane = paymentInPane;
    const outPane = paymentOutPane;
    if (!inPane || !outPane) return;

    if (mode === 'out') {
        inPane.classList.remove('show', 'active');
        outPane.classList.add('show', 'active');
        if (paymentInToggle) paymentInToggle.classList.remove('active');
        if (paymentOutToggle) paymentOutToggle.classList.add('active');
        if (paymentsViewBtn) paymentsViewBtn.innerHTML = '<i class="fas fa-exchange-alt me-1"></i> View: Payment Out';
    } else {
        outPane.classList.remove('show', 'active');
        inPane.classList.add('show', 'active');
        if (paymentOutToggle) paymentOutToggle.classList.remove('active');
        if (paymentInToggle) paymentInToggle.classList.add('active');
        if (paymentsViewBtn) paymentsViewBtn.innerHTML = '<i class="fas fa-exchange-alt me-1"></i> View: Payment In';
    }
}

function applyHashDrivenPaymentsView() {
    const hash = window.location.hash;
    const isPurchaseBills = hash === '#purchase-bills';
    const isPaymentIn = hash === '#payment-in';
    const isPaymentOut = hash === '#payment-out';
    const forceOutOnly = isPurchaseBills || isPaymentOut;
    const forceInOnly = isPaymentIn;

    setPaymentsView(forceOutOnly ? 'out' : 'in');

    if (paymentInPane) paymentInPane.classList.toggle('d-none', forceOutOnly);
    if (paymentOutPane) paymentOutPane.classList.toggle('d-none', forceInOnly);
    if (addPaymentInBtn) addPaymentInBtn.classList.toggle('d-none', forceOutOnly);
    if (addPaymentOutBtn) addPaymentOutBtn.classList.toggle('d-none', forceInOnly);
    if (paymentsViewWrap) paymentsViewWrap.classList.toggle('d-none', forceOutOnly || forceInOnly);
    const heading = document.querySelector('#section-payments .section-header h1.h2');
    const subtitle = document.querySelector('#section-payments .section-header .text-muted.small');
    if (heading) heading.textContent = isPurchaseBills ? 'Purchase Bills' : 'Payments';
    if (subtitle) subtitle.textContent = isPurchaseBills ? 'Track supplier bill payments.' : 'Track payment in and payment out.';
    if (addPaymentOutBtn && isPurchaseBills) {
        addPaymentOutBtn.innerHTML = '<i class="fas fa-plus me-1"></i> New Purchase Bill Payment';
    } else if (addPaymentOutBtn) {
        addPaymentOutBtn.innerHTML = '<i class="fas fa-arrow-up me-1"></i> Payment Out';
    }

}

function getPaymentInExportRows() {
    return paymentInData.map(p => ([
        p.date ? formatDate(p.date) : '',
        p.customer || '',
        p.mode || '',
        p.reference || '',
        p.description || '',
        p.amount ?? 0
    ]));
}

function getPaymentOutExportRows() {
    return paymentOutData.map(p => ([
        p.date ? formatDate(p.date) : '',
        p.supplier || '',
        p.mode || '',
        p.reference || '',
        p.description || '',
        p.amount ?? 0
    ]));
}

function exportPaymentInCSV() {
    if (!paymentInData.length) {
        alert('No payment in data to export.');
        return;
    }
    const headers = ['Date', 'Customer', 'Mode', 'Reference', 'Description', 'Amount'];
    const rows = getPaymentInExportRows();
    const filename = `payment_in_${new Date().toISOString().split('T')[0]}.csv`;
    downloadCSV(filename, headers, rows);
}

function exportPaymentOutCSV() {
    if (!paymentOutData.length) {
        alert('No payment out data to export.');
        return;
    }
    const headers = ['Date', 'Supplier', 'Mode', 'Reference', 'Description', 'Amount'];
    const rows = getPaymentOutExportRows();
    const filename = `payment_out_${new Date().toISOString().split('T')[0]}.csv`;
    downloadCSV(filename, headers, rows);
}
