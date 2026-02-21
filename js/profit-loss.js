import { db } from './firebase-config.js';
import { checkAuth, formatDate, downloadCSV, downloadPDF } from './dashboard.js';
import { showAlert } from './auth.js';

const profitLossTable = document.getElementById('profitLossTable');
const plStartDate = document.getElementById('plStartDate');
const plEndDate = document.getElementById('plEndDate');
const plTypeFilter = document.getElementById('plTypeFilter');
const plSearchInput = document.getElementById('plSearchInput');
const refreshProfitLossBtn = document.getElementById('refreshProfitLossBtn');
const exportProfitLossPdfBtn = document.getElementById('exportProfitLossPdfBtn');
const exportProfitLossCsvBtn = document.getElementById('exportProfitLossCsvBtn');

const plTotalIncome = document.getElementById('plTotalIncome');
const plTotalExpenses = document.getElementById('plTotalExpenses');
const plNetProfit = document.getElementById('plNetProfit');
const plProfitMargin = document.getElementById('plProfitMargin');

let plTransactions = [];
let plFiltered = [];
let plUnsubscribers = [];

document.addEventListener('DOMContentLoaded', async () => {
    await checkAuth();
    setDefaultDates();
    startProfitLossListeners();
    setupListeners();

    window.addEventListener('sectionChanged', (e) => {
        if (e.detail === 'profit-loss') {
            startProfitLossListeners();
        }
    });
});

function setupListeners() {
    if (plStartDate) plStartDate.addEventListener('change', startProfitLossListeners);
    if (plEndDate) plEndDate.addEventListener('change', startProfitLossListeners);
    if (plTypeFilter) plTypeFilter.addEventListener('change', applyFilters);
    if (plSearchInput) plSearchInput.addEventListener('input', applyFilters);

    if (refreshProfitLossBtn) {
        refreshProfitLossBtn.addEventListener('click', () => {
            setDefaultDates();
            if (plTypeFilter) plTypeFilter.value = 'all';
            if (plSearchInput) plSearchInput.value = '';
            startProfitLossListeners();
        });
    }

    if (exportProfitLossCsvBtn) {
        exportProfitLossCsvBtn.addEventListener('click', exportProfitLossCSV);
    }

    if (exportProfitLossPdfBtn) {
        exportProfitLossPdfBtn.addEventListener('click', exportProfitLossPDF);
    }
}

function setDefaultDates() {
    if (!plStartDate || !plEndDate) return;
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    const toISODate = (d) => {
        const offset = d.getTimezoneOffset() * 60000;
        return new Date(d.getTime() - offset).toISOString().split('T')[0];
    };

    plStartDate.value = toISODate(firstDay);
    plEndDate.value = toISODate(lastDay);
}

function normalizeDate(val) {
    if (!val) return null;
    if (val.toDate) return val.toDate();
    if (val instanceof Date) return val;
    return new Date(val);
}

function getTransactionDirection(type = '') {
    const normalized = String(type || '').trim().toLowerCase();
    if (normalized === 'payment') return 'income';
    if (normalized === 'supplierpayment' || normalized === 'salary payment') return 'expense';
    if (normalized.includes('expense') || normalized.includes('purchase')) return 'expense';
    return 'neutral';
}

function getDateRange() {
    if (!plStartDate || !plEndDate) return { start: null, end: null };
    const start = new Date(plStartDate.value);
    const end = new Date(plEndDate.value);
    end.setHours(23, 59, 59, 999);
    return { start, end };
}

function clearProfitLossListeners() {
    plUnsubscribers.forEach(unsub => {
        try { unsub(); } catch (_) {}
    });
    plUnsubscribers = [];
}

function startProfitLossListeners() {
    const user = JSON.parse(localStorage.getItem('user'));
    if (!user || !profitLossTable) return;

    const businessId = user.businessId || user.uid;
    const tbody = profitLossTable.querySelector('tbody');
    tbody.innerHTML = '<tr><td colspan="7" class="text-center">Loading...</td></tr>';

    clearProfitLossListeners();
    const { start, end } = getDateRange();
    const basePath = db.collection('users').doc(businessId);
    const txnQuery = start && end
        ? basePath.collection('transactions').where('date', '>=', start).where('date', '<=', end)
        : basePath.collection('transactions');
    let txnData = [];

    const rebuild = () => {
        const combined = [...txnData]
            .sort((a, b) => (b.date || 0) - (a.date || 0));
        plTransactions = combined;
        applyFilters();
    };

    const txnUnsub = txnQuery.onSnapshot(
        (snap) => {
            txnData = [];
            const invoices = [];
            const payments = [];

            snap.forEach(doc => {
                const t = doc.data();
                const type = t.type || 'Transaction';
                const date = normalizeDate(t.date);

                if (type === 'Invoice') {
                    invoices.push({
                        id: doc.id,
                        type,
                        date,
                        description: t.description || 'Invoice',
                        party: t.customer || '-',
                        ref: `#${String(doc.id).substr(0, 6).toUpperCase()}`,
                        amount: t.amount ?? 0,
                        amountPaid: t.amountPaid ?? 0,
                        status: t.status || 'Pending'
                    });
                    return;
                }

                if (type === 'Payment') {
                    payments.push({
                        id: doc.id,
                        type,
                        date,
                        description: t.description || 'Payment',
                        party: t.customer || '-',
                        ref: t.reference || t.mode || '-',
                        amount: t.amount ?? 0,
                        invoiceId: t.invoiceId || null
                    });
                    return;
                }

                const direction = getTransactionDirection(type);
                const amount = t.amount ?? 0;
                txnData.push({
                    id: doc.id,
                    source: 'transaction',
                    type,
                    date,
                    description: t.description || type,
                    party: t.customer || t.supplier || '-',
                    ref: t.reference || t.mode || '-',
                    amount,
                    direction
                });
            });

            // Add invoices as neutral rows (for visibility)
            invoices.forEach(inv => {
                txnData.push({
                    id: inv.id,
                    source: 'transaction',
                    type: 'Invoice',
                    date: inv.date,
                    description: inv.description,
                    party: inv.party,
                    ref: inv.ref,
                    amount: inv.amount ?? 0,
                    direction: 'neutral'
                });
            });

            // Payments are the income entries
            payments.forEach(p => {
                txnData.push({
                    id: p.id,
                    source: 'transaction',
                    type: 'Payment',
                    date: p.date,
                    description: p.description,
                    party: p.party,
                    ref: p.ref,
                    amount: p.amount ?? 0,
                    direction: 'income',
                    invoiceId: p.invoiceId || null
                });
            });

            // Capture any initial/legacy paid amounts not recorded as Payment transactions
            const paymentTotals = payments.reduce((acc, p) => {
                if (!p.invoiceId) return acc;
                acc[p.invoiceId] = (acc[p.invoiceId] || 0) + (p.amount || 0);
                return acc;
            }, {});

            invoices.forEach(inv => {
                const paid = Number(inv.amountPaid || 0);
                if (paid <= 0) return;
                const recorded = Number(paymentTotals[inv.id] || 0);
                const diff = paid - recorded;
                if (diff > 0.01) {
                    txnData.push({
                        id: `${inv.id}_initial`,
                        source: 'transaction',
                        type: 'Payment',
                        date: inv.date,
                        description: `Initial payment for ${inv.ref}`,
                        party: inv.party,
                        ref: 'Initial',
                        amount: diff,
                        direction: 'income',
                        invoiceId: inv.id
                    });
                }
            });

            rebuild();
        },
        (error) => {
            console.error('Error loading profit & loss data:', error);
            tbody.innerHTML = '<tr><td colspan="7" class="text-center text-danger">Error loading data</td></tr>';
            showAlert('danger', 'Failed to load profit & loss data.');
        }
    );

    plUnsubscribers = [txnUnsub];
}

function applyFilters() {
    const typeFilter = plTypeFilter ? plTypeFilter.value : 'all';
    const searchTerm = (plSearchInput ? plSearchInput.value : '').toLowerCase();

    plFiltered = plTransactions.filter(t => {
        if (typeFilter === 'income' && t.direction !== 'income') return false;
        if (typeFilter === 'expense' && t.direction !== 'expense') return false;
        if (typeFilter === 'invoice' && t.type !== 'Invoice') return false;
        if (typeFilter === 'payment' && t.type !== 'Payment') return false;
        if (typeFilter === 'supplier' && t.type !== 'SupplierPayment') return false;
        if (typeFilter === 'purchase' && !(t.source === 'purchase' || String(t.type || '').toLowerCase().includes('purchase'))) return false;
        if (typeFilter === 'vehicle' && !(t.source === 'vehicle' || String(t.type || '').toLowerCase().includes('vehicle'))) return false;

        if (!searchTerm) return true;
        const haystack = `${t.type} ${t.description} ${t.party} ${t.ref}`.toLowerCase();
        return haystack.includes(searchTerm);
    });

    renderProfitLossTable();
    updateSummary();
}

function renderProfitLossTable() {
    const tbody = profitLossTable.querySelector('tbody');
    tbody.innerHTML = '';

    if (!plFiltered.length) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted">No transactions found</td></tr>';
        return;
    }

    plFiltered.forEach(t => {
        const badgeClass = t.direction === 'income' ? 'pl-pill pl-pill-income' :
            (t.direction === 'expense' ? 'pl-pill pl-pill-expense' : 'pl-pill pl-pill-neutral');
        const directionLabel = t.direction === 'income' ? 'Income' :
            (t.direction === 'expense' ? 'Expense' : 'Other');

        tbody.innerHTML += `
            <tr>
                <td>${t.date ? formatDate(t.date) : '-'}</td>
                <td>${t.type}</td>
                <td>${t.description || '-'}</td>
                <td>${t.party || '-'}</td>
                <td>${t.ref || '-'}</td>
                <td class="text-end ${t.direction === 'expense' ? 'text-danger' : 'text-success'}">₹${Number(t.amount || 0).toLocaleString()}</td>
                <td><span class="${badgeClass}">${directionLabel}</span></td>
            </tr>
        `;
    });
}

function updateSummary() {
    const totals = plFiltered.reduce((acc, t) => {
        if (t.direction === 'income') acc.income += t.amount || 0;
        if (t.direction === 'expense') acc.expense += t.amount || 0;
        return acc;
    }, { income: 0, expense: 0 });

    const net = totals.income - totals.expense;
    const margin = totals.income > 0 ? (net / totals.income) * 100 : 0;

    if (plTotalIncome) plTotalIncome.textContent = `₹${totals.income.toLocaleString()}`;
    if (plTotalExpenses) plTotalExpenses.textContent = `₹${totals.expense.toLocaleString()}`;
    if (plNetProfit) plNetProfit.textContent = `₹${net.toLocaleString()}`;
    if (plProfitMargin) plProfitMargin.textContent = `${margin.toFixed(1)}%`;
}

function getProfitLossExportRows() {
    return plFiltered.map(t => ([
        t.date ? formatDate(t.date) : '',
        t.type || '',
        t.description || '',
        t.party || '',
        t.ref || '',
        t.amount ?? 0,
        t.direction === 'income' ? 'Income' : (t.direction === 'expense' ? 'Expense' : 'Other')
    ]));
}

function exportProfitLossCSV() {
    if (!plFiltered.length) {
        alert('No transactions to export.');
        return;
    }

    const headers = ['Date', 'Type', 'Description', 'Party', 'Reference', 'Amount', 'Direction'];
    const rows = getProfitLossExportRows();
    const filename = `profit_loss_${new Date().toISOString().split('T')[0]}.csv`;
    downloadCSV(filename, headers, rows);
}

function exportProfitLossPDF() {
    if (!plFiltered.length) {
        alert('No transactions to export.');
        return;
    }

    const headers = ['Date', 'Type', 'Description', 'Party', 'Reference', 'Amount', 'Direction'];
    const rows = getProfitLossExportRows();
    const filename = `profit_loss_${new Date().toISOString().split('T')[0]}.pdf`;
    downloadPDF(filename, 'Profit & Loss Report', headers, rows);
}
