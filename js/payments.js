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

let paymentInData = [];
let paymentOutData = [];

document.addEventListener('DOMContentLoaded', async () => {
    await checkAuth();
    setupListeners();

    if (window.location.hash === '#payments') {
        loadPayments();
        setPaymentsView('in');
    }

    window.addEventListener('sectionChanged', (e) => {
        if (e.detail === 'payments') {
            loadPayments();
            setPaymentsView('in');
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
            const [kind, id, name] = val.split('|');
            const modal = bootstrap.Modal.getInstance(paymentOutSelectModal);
            if (modal) modal.hide();
            if (kind === 'labour' && window.recordLabourPayment) {
                window.recordLabourPayment(id);
            } else if (window.recordSupplierPayment) {
                window.recordSupplierPayment(id, name);
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
            supplierOptions.push(`<option value="supplier|${doc.id}|${name}">${name}</option>`);
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
            const workerSafe = row.worker.replace(/\|/g, '/');
            return `<option value="labour|${row.id}|${workerSafe}">${label}</option>`;
        });

        const groups = [];
        if (labourOptions.length) groups.push(`<optgroup label="Labour Dues">${labourOptions.join('')}</optgroup>`);
        if (supplierOptions.length) groups.push(`<optgroup label="Suppliers">${supplierOptions.join('')}</optgroup>`);
        if (!groups.length) {
            paymentOutSupplierSelect.innerHTML = '<option value="">No suppliers or labour dues found</option>';
        } else {
            paymentOutSupplierSelect.innerHTML = '<option value="">Select Supplier / Labour Due...</option>' + groups.join('');
        }
    } catch (e) {
        console.error('Failed to load suppliers/labour dues', e);
        paymentOutSupplierSelect.innerHTML = '<option value="">Error loading suppliers/labour dues</option>';
    }

    new bootstrap.Modal(paymentOutSelectModal).show();
}

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
                <td>
                    ${p.canDelete
                        ? `<button type="button" class="btn btn-sm btn-outline-danger delete-payment-btn" data-id="${p.id}" title="Delete"><i class="fas fa-trash"></i></button>`
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

    const filtered = paymentOutData.filter(p => {
        const text = `${p.supplier} ${p.reference} ${p.description}`.toLowerCase();
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
                <td>${p.supplier}</td>
                <td>${p.mode}</td>
                <td>${p.reference}</td>
                <td>${p.description}</td>
                <td class="text-end text-danger fw-bold">&#8377;${Number(p.amount || 0).toLocaleString()}</td>
                <td><button type="button" class="btn btn-sm btn-outline-danger delete-payment-btn" data-id="${p.id}" title="Delete"><i class="fas fa-trash"></i></button></td>
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
    const confirmed = window.confirm('Delete this transaction? Linked balances will be adjusted automatically.');
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

            await db.runTransaction(async (t) => {
                if (isLabour && payableId) {
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
    const inPane = document.getElementById('paymentInPane');
    const outPane = document.getElementById('paymentOutPane');
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
