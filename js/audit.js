import { checkAuth, formatDate } from './dashboard.js';
import { db } from './firebase-config.js';

const auditFySelect = document.getElementById('auditFySelect');
const refreshAuditBtn = document.getElementById('refreshAuditBtn');
const auditExportPdfBtn = document.getElementById('auditExportPdfBtn');
const auditExportCsvBtn = document.getElementById('auditExportCsvBtn');
const auditReportNote = document.getElementById('auditReportNote');
const auditComplianceNote = document.getElementById('auditComplianceNote');
const auditLedgerCount = document.getElementById('auditLedgerCount');
const auditLedgerTable = document.getElementById('auditLedgerTable');
const auditMonthlyChartCanvas = document.getElementById('auditMonthlyChart');

const elGrossRevenue = document.getElementById('auditGrossRevenue');
const elCollectedReceipts = document.getElementById('auditCollectedReceipts');
const elOperatingExpense = document.getElementById('auditOperatingExpense');
const elNetProfit = document.getElementById('auditNetProfit');
const elReceivables = document.getElementById('auditReceivables');
const elPayables = document.getElementById('auditPayables');
const elGstDocs = document.getElementById('auditGstDocs');
const elTaxableTurnover = document.getElementById('auditTaxableTurnover');
const elEstimatedGst = document.getElementById('auditEstimatedGst');
const elGstInvoiceValue = document.getElementById('auditGstInvoiceValue');

let auditChart = null;
let lastAuditReport = null;
let businessProfileCache = null;

document.addEventListener('DOMContentLoaded', async () => {
    await checkAuth();
    initializeFyOptions();
    bindEvents();

    if (window.location.hash === '#audit') {
        await loadAuditReport();
    }

    window.addEventListener('sectionChanged', async (e) => {
        if (e.detail === 'audit') {
            await loadAuditReport();
        }
    });
});

function bindEvents() {
    if (auditFySelect) {
        auditFySelect.addEventListener('change', loadAuditReport);
    }
    if (refreshAuditBtn) {
        refreshAuditBtn.addEventListener('click', loadAuditReport);
    }
    if (auditExportCsvBtn) {
        auditExportCsvBtn.addEventListener('click', exportAuditCSV);
    }
    if (auditExportPdfBtn) {
        auditExportPdfBtn.addEventListener('click', exportAuditPDF);
    }
}

function getCurrentFyStartYear(now = new Date()) {
    const y = now.getFullYear();
    return now.getMonth() >= 3 ? y : y - 1;
}

function initializeFyOptions() {
    if (!auditFySelect) return;
    const currentStartYear = getCurrentFyStartYear();
    const years = [];
    for (let y = currentStartYear - 4; y <= currentStartYear + 1; y++) {
        years.push(y);
    }

    auditFySelect.innerHTML = years
        .map((y) => `<option value="${y}">FY ${y}-${String(y + 1).slice(-2)}</option>`)
        .join('');

    auditFySelect.value = String(currentStartYear);
}

function getSelectedFyRange() {
    const startYear = Number(auditFySelect?.value || getCurrentFyStartYear());
    const start = new Date(startYear, 3, 1, 0, 0, 0, 0);
    const end = new Date(startYear + 1, 2, 31, 23, 59, 59, 999);
    const label = `FY ${startYear}-${String(startYear + 1).slice(-2)}`;
    return { startYear, start, end, label };
}

function normalizeDate(value) {
    if (!value) return null;
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
    if (typeof value?.toDate === 'function') {
        const d = value.toDate();
        return Number.isNaN(d.getTime()) ? null : d;
    }
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
}

function amount(value) {
    const n = Number(value || 0);
    return Number.isFinite(n) ? n : 0;
}

function money(value) {
    return `Rs ${amount(value).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function monthIndexWithinFy(date, fyStartYear) {
    const d = normalizeDate(date);
    if (!d) return -1;
    const start = new Date(fyStartYear, 3, 1);
    const diff = (d.getFullYear() - start.getFullYear()) * 12 + (d.getMonth() - start.getMonth());
    return diff >= 0 && diff < 12 ? diff : -1;
}

function setText(el, value) {
    if (el) el.textContent = value;
}

function setLoadingState() {
    setText(elGrossRevenue, 'Loading...');
    setText(elCollectedReceipts, 'Loading...');
    setText(elOperatingExpense, 'Loading...');
    setText(elNetProfit, 'Loading...');
    setText(elReceivables, 'Loading...');
    setText(elPayables, 'Loading...');
    setText(elGstDocs, '...');
    setText(elTaxableTurnover, 'Loading...');
    setText(elEstimatedGst, 'Loading...');
    setText(elGstInvoiceValue, 'Loading...');
    if (auditLedgerTable) {
        const tbody = auditLedgerTable.querySelector('tbody');
        if (tbody) tbody.innerHTML = '<tr><td colspan="7" class="text-center">Loading audit ledger...</td></tr>';
    }
}

function getCurrentUser() {
    return JSON.parse(localStorage.getItem('user') || '{}');
}

async function getBusinessProfile() {
    if (businessProfileCache) return businessProfileCache;
    const user = getCurrentUser();
    const businessId = user?.businessId || user?.uid;
    const fallback = {
        companyName: user?.businessName || user?.displayName || 'Business',
        email: user?.email || '',
        phone: '',
        address: '',
        city: '',
        state: '',
        zip: '',
        taxId: '',
        logoUrl: ''
    };
    if (!businessId || !db) {
        businessProfileCache = fallback;
        return fallback;
    }
    try {
        const doc = await db.collection('users').doc(businessId).collection('settings').doc('business').get();
        if (!doc.exists) {
            businessProfileCache = fallback;
            return fallback;
        }
        const data = doc.data() || {};
        businessProfileCache = {
            companyName: data.companyName || fallback.companyName,
            email: data.email || fallback.email,
            phone: data.companyPhone || data.phone || '',
            address: data.address || '',
            city: data.city || '',
            state: data.state || '',
            zip: data.zip || '',
            taxId: data.taxId || data.gstin || '',
            logoUrl: data.logoUrl || ''
        };
        return businessProfileCache;
    } catch (e) {
        console.error('Failed to load business profile for audit export', e);
        businessProfileCache = fallback;
        return fallback;
    }
}

async function loadAuditReport() {
    const user = getCurrentUser();
    const businessId = user?.businessId || user?.uid;
    if (!businessId || !db) return;

    const fy = getSelectedFyRange();
    setLoadingState();
    if (auditReportNote) {
        auditReportNote.textContent = `Preparing audit statements for ${fy.label} (${formatDate(fy.start)} to ${formatDate(fy.end)}).`;
    }

    try {
        const root = db.collection('users').doc(businessId);
        const [txSnap, purchaseSnap, vehicleSnap, supplierSnap, gstSnap] = await Promise.all([
            root.collection('transactions').where('date', '>=', fy.start).where('date', '<=', fy.end).get(),
            root.collection('purchases').where('date', '>=', fy.start).where('date', '<=', fy.end).get(),
            root.collection('vehicle_expenses').where('date', '>=', fy.start).where('date', '<=', fy.end).get(),
            root.collection('suppliers').get(),
            root.collection('gstDocuments').where('date', '>=', fy.start).where('date', '<=', fy.end).get()
        ]);

        const tx = txSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        const purchases = purchaseSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        const vehicles = vehicleSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        const suppliers = supplierSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        const gstDocs = gstSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

        const invoices = tx.filter((t) => (t.type || '') === 'Invoice');
        const payments = tx.filter((t) => (t.type || '') === 'Payment');
        const supplierPayments = tx.filter((t) => (t.type || '') === 'SupplierPayment');
        const miscExpenses = tx.filter((t) => {
            const type = (t.type || '').toLowerCase();
            if (!type) return false;
            if (type === 'invoice' || type === 'payment' || type === 'supplierpayment') return false;
            return type.includes('expense') || type.includes('salary') || type.includes('wage');
        });

        const invoicePaymentMap = {};
        payments.forEach((p) => {
            if (!p.invoiceId) return;
            invoicePaymentMap[p.invoiceId] = (invoicePaymentMap[p.invoiceId] || 0) + amount(p.amount);
        });

        let legacyReceiptFromInvoices = 0;
        invoices.forEach((inv) => {
            const paid = amount(inv.amountPaid);
            const recorded = amount(invoicePaymentMap[inv.id]);
            if (paid > recorded) legacyReceiptFromInvoices += (paid - recorded);
        });

        const grossRevenue = invoices.reduce((sum, i) => sum + amount(i.amount), 0);
        const collectedReceipts = payments.reduce((sum, p) => sum + amount(p.amount), 0) + legacyReceiptFromInvoices;
        const purchasesValue = purchases.reduce((sum, p) => {
            const direct = amount(p.amount || p.totalAmount || p.total || p.grandTotal || p.netAmount);
            if (direct > 0) return sum + direct;
            return sum + (amount(p.quantity) * amount(p.unitCost));
        }, 0);
        const vehicleExpense = vehicles.reduce((sum, v) => sum + amount(v.amount || v.cost || v.total), 0);
        const supplierPaymentTotal = supplierPayments.reduce((sum, p) => sum + amount(p.amount), 0);
        const miscExpenseTotal = miscExpenses.reduce((sum, m) => sum + amount(m.amount), 0);
        const operatingExpense = purchasesValue + vehicleExpense + supplierPaymentTotal + miscExpenseTotal;

        const receivables = invoices.reduce((sum, inv) => {
            const total = amount(inv.amount);
            const paid = amount(inv.amountPaid);
            return sum + Math.max(0, total - paid);
        }, 0);
        const payables = suppliers.reduce((sum, s) => sum + Math.max(0, amount(s.balance)), 0);
        const netProfit = collectedReceipts - operatingExpense;

        const monthlyReceipts = new Array(12).fill(0);
        const monthlyExpenses = new Array(12).fill(0);
        const monthLabels = Array.from({ length: 12 }, (_, i) => {
            const d = new Date(fy.startYear, 3 + i, 1);
            return d.toLocaleString('en-US', { month: 'short' });
        });

        payments.forEach((p) => {
            const idx = monthIndexWithinFy(p.date, fy.startYear);
            if (idx >= 0) monthlyReceipts[idx] += amount(p.amount);
        });

        invoices.forEach((inv) => {
            if (amount(inv.amountPaid) <= 0) return;
            const recorded = amount(invoicePaymentMap[inv.id]);
            const legacy = Math.max(0, amount(inv.amountPaid) - recorded);
            const idx = monthIndexWithinFy(inv.date, fy.startYear);
            if (idx >= 0) monthlyReceipts[idx] += legacy;
        });

        supplierPayments.forEach((p) => {
            const idx = monthIndexWithinFy(p.date, fy.startYear);
            if (idx >= 0) monthlyExpenses[idx] += amount(p.amount);
        });
        purchases.forEach((p) => {
            const idx = monthIndexWithinFy(p.date, fy.startYear);
            if (idx < 0) return;
            const direct = amount(p.amount || p.totalAmount || p.total || p.grandTotal || p.netAmount);
            monthlyExpenses[idx] += direct > 0 ? direct : amount(p.quantity) * amount(p.unitCost);
        });
        vehicles.forEach((v) => {
            const idx = monthIndexWithinFy(v.date, fy.startYear);
            if (idx >= 0) monthlyExpenses[idx] += amount(v.amount || v.cost || v.total);
        });
        miscExpenses.forEach((m) => {
            const idx = monthIndexWithinFy(m.date, fy.startYear);
            if (idx >= 0) monthlyExpenses[idx] += amount(m.amount);
        });

        const gstSummary = gstDocs.reduce((acc, doc) => {
            const items = Array.isArray(doc.items) ? doc.items : [];
            let taxable = 0;
            let gst = 0;
            items.forEach((it) => {
                const base = amount(it.price) * amount(it.quantity);
                const rate = amount(it.gstRate);
                taxable += base;
                gst += (base * rate / 100);
            });
            acc.taxable += taxable;
            acc.gst += gst;
            acc.invoiceValue += amount(doc.amount);
            return acc;
        }, { taxable: 0, gst: 0, invoiceValue: 0 });

        const ledgerEntries = buildLedgerEntries({
            invoices,
            payments,
            supplierPayments,
            purchases,
            vehicles,
            miscExpenses
        });
        const dedupedLedgerEntries = dedupeLedgerEntries(ledgerEntries);

        renderSummary({
            grossRevenue,
            collectedReceipts,
            operatingExpense,
            netProfit,
            receivables,
            payables,
            gstDocsCount: gstDocs.length,
            taxableTurnover: gstSummary.taxable,
            estimatedGst: gstSummary.gst,
            gstInvoiceValue: gstSummary.invoiceValue
        });

        renderAuditChart(monthLabels, monthlyReceipts, monthlyExpenses);
        renderLedger(dedupedLedgerEntries);
        renderComplianceNote({ receivables, payables, gstDocsCount: gstDocs.length, estimatedGst: gstSummary.gst });

        lastAuditReport = {
            fyLabel: fy.label,
            start: fy.start,
            end: fy.end,
            summary: {
                grossRevenue,
                collectedReceipts,
                operatingExpense,
                netProfit,
                receivables,
                payables,
                gstDocsCount: gstDocs.length,
                taxableTurnover: gstSummary.taxable,
                estimatedGst: gstSummary.gst,
                gstInvoiceValue: gstSummary.invoiceValue
            },
            ledgerEntries: dedupedLedgerEntries
        };
    } catch (error) {
        console.error('Audit report load failed', error);
        if (auditReportNote) {
            auditReportNote.textContent = 'Failed to load audit report. Check permissions and indexes.';
        }
        if (auditLedgerTable) {
            const tbody = auditLedgerTable.querySelector('tbody');
            if (tbody) tbody.innerHTML = '<tr><td colspan="7" class="text-danger text-center">Failed to load audit ledger.</td></tr>';
        }
    }
}

function renderSummary(summary) {
    setText(elGrossRevenue, money(summary.grossRevenue));
    setText(elCollectedReceipts, money(summary.collectedReceipts));
    setText(elOperatingExpense, money(summary.operatingExpense));
    setText(elNetProfit, money(summary.netProfit));
    setText(elReceivables, money(summary.receivables));
    setText(elPayables, money(summary.payables));
    setText(elGstDocs, String(summary.gstDocsCount || 0));
    setText(elTaxableTurnover, money(summary.taxableTurnover));
    setText(elEstimatedGst, money(summary.estimatedGst));
    setText(elGstInvoiceValue, money(summary.gstInvoiceValue));
}

function renderComplianceNote({ receivables, payables, gstDocsCount, estimatedGst }) {
    if (!auditComplianceNote) return;
    const observations = [];
    if (receivables > 0) observations.push(`Receivables pending: ${money(receivables)}`);
    if (payables > 0) observations.push(`Payables outstanding: ${money(payables)}`);
    if (gstDocsCount === 0) observations.push('No GST invoices issued in this FY.');
    if (estimatedGst > 0) observations.push(`Estimated GST liability from items: ${money(estimatedGst)}`);
    if (!observations.length) observations.push('No material compliance exception identified from available records.');
    auditComplianceNote.textContent = observations.join(' | ');
}

function buildLedgerEntries({ invoices, payments, supplierPayments, purchases, vehicles, miscExpenses }) {
    const rows = [];
    invoices.forEach((inv) => {
        rows.push({
            source: 'transactions',
            sourceId: inv.id || '',
            date: normalizeDate(inv.date),
            particulars: inv.description || `Sales Invoice - ${inv.customer || 'Customer'}`,
            voucher: inv.reference || `INV-${String(inv.id).slice(0, 6).toUpperCase()}`,
            category: 'Sales Invoice',
            debit: 0,
            credit: amount(inv.amount)
        });
    });
    payments.forEach((p) => {
        rows.push({
            source: 'transactions',
            sourceId: p.id || '',
            date: normalizeDate(p.date),
            particulars: p.description || `Receipt - ${p.customer || 'Customer'}`,
            voucher: p.reference || p.mode || '-',
            category: 'Receipt',
            debit: 0,
            credit: amount(p.amount)
        });
    });
    supplierPayments.forEach((p) => {
        rows.push({
            source: 'transactions',
            sourceId: p.id || '',
            date: normalizeDate(p.date),
            particulars: p.description || `Supplier Payment - ${p.supplier || 'Supplier'}`,
            voucher: p.reference || p.mode || '-',
            category: 'Supplier Payment',
            debit: amount(p.amount),
            credit: 0
        });
    });
    purchases.forEach((p) => {
        const direct = amount(p.amount || p.totalAmount || p.total || p.grandTotal || p.netAmount);
        const val = direct > 0 ? direct : amount(p.quantity) * amount(p.unitCost);
        rows.push({
            source: 'purchases',
            sourceId: p.id || '',
            date: normalizeDate(p.date),
            particulars: `${p.type || 'Purchase'}${p.itemName ? ` - ${p.itemName}` : ''}`,
            voucher: p.invoiceNo || p.supplier || '-',
            category: 'Purchase',
            debit: val,
            credit: 0
        });
    });
    vehicles.forEach((v) => {
        rows.push({
            source: 'vehicle_expenses',
            sourceId: v.id || '',
            date: normalizeDate(v.date),
            particulars: v.description || v.type || 'Vehicle Expense',
            voucher: v.reference || v.vehicleNumber || '-',
            category: 'Vehicle Expense',
            debit: amount(v.amount || v.total || v.cost),
            credit: 0
        });
    });
    miscExpenses.forEach((m) => {
        rows.push({
            source: 'transactions',
            sourceId: m.id || '',
            date: normalizeDate(m.date),
            particulars: m.description || m.type || 'Expense',
            voucher: m.reference || m.mode || '-',
            category: m.type || 'Expense',
            debit: amount(m.amount),
            credit: 0
        });
    });

    rows.sort((a, b) => {
        const ad = a.date ? a.date.getTime() : 0;
        const bd = b.date ? b.date.getTime() : 0;
        return ad - bd;
    });

    let balance = 0;
    return rows.map((r) => {
        balance += amount(r.credit) - amount(r.debit);
        return { ...r, runningBalance: balance };
    });
}

function dedupeLedgerEntries(rows = []) {
    const seen = new Set();
    const deduped = [];

    rows.forEach((row) => {
        const fallbackKey = [
            row.source || '',
            row.sourceId || '',
            row.category || '',
            row.voucher || '',
            row.date ? row.date.getTime() : '',
            amount(row.debit),
            amount(row.credit)
        ].join('|');
        const key = (row.source && row.sourceId)
            ? `${row.source}:${row.sourceId}`
            : fallbackKey;
        if (seen.has(key)) return;
        seen.add(key);
        deduped.push(row);
    });

    // Collapse semantic duplicates for supplier payment rows
    // (same payment captured multiple times with different document ids).
    const semanticSeen = new Set();
    const semanticallyDeduped = [];
    deduped.forEach((row) => {
        if ((row.category || '').toLowerCase() !== 'supplier payment') {
            semanticallyDeduped.push(row);
            return;
        }
        const dt = row.date ? new Date(row.date) : null;
        const dayKey = dt ? dt.toISOString().slice(0, 10) : '';
        const sig = [
            'supplier_payment',
            dayKey,
            String(row.voucher || '').trim().toLowerCase(),
            String(row.particulars || '').trim().toLowerCase(),
            amount(row.debit).toFixed(2)
        ].join('|');
        if (semanticSeen.has(sig)) return;
        semanticSeen.add(sig);
        semanticallyDeduped.push(row);
    });

    semanticallyDeduped.sort((a, b) => {
        const ad = a.date ? a.date.getTime() : 0;
        const bd = b.date ? b.date.getTime() : 0;
        return ad - bd;
    });

    let balance = 0;
    return semanticallyDeduped.map((row) => {
        balance += amount(row.credit) - amount(row.debit);
        return { ...row, runningBalance: balance };
    });
}

function renderLedger(rows) {
    if (!auditLedgerTable) return;
    const tbody = auditLedgerTable.querySelector('tbody');
    if (!tbody) return;

    if (!rows.length) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted">No ledger entries found for selected FY.</td></tr>';
        setText(auditLedgerCount, '0 entries');
        return;
    }

    tbody.innerHTML = rows.map((r) => `
        <tr>
            <td>${r.date ? formatDate(r.date) : '-'}</td>
            <td>${r.particulars || '-'}</td>
            <td>${r.voucher || '-'}</td>
            <td>${r.category || '-'}</td>
            <td class="text-end text-danger">${r.debit > 0 ? money(r.debit) : '-'}</td>
            <td class="text-end text-success">${r.credit > 0 ? money(r.credit) : '-'}</td>
            <td class="text-end fw-semibold ${r.runningBalance < 0 ? 'text-danger' : 'text-primary'}">${money(r.runningBalance)}</td>
        </tr>
    `).join('');

    setText(auditLedgerCount, `${rows.length.toLocaleString()} entries`);
}

function renderAuditChart(labels, receipts, expenses) {
    if (!auditMonthlyChartCanvas || typeof Chart === 'undefined') return;

    if (auditChart) {
        auditChart.destroy();
    }

    auditChart = new Chart(auditMonthlyChartCanvas.getContext('2d'), {
        type: 'bar',
        data: {
            labels,
            datasets: [
                {
                    label: 'Receipts',
                    data: receipts,
                    backgroundColor: 'rgba(34, 197, 94, 0.65)',
                    borderColor: 'rgba(22, 163, 74, 1)',
                    borderWidth: 1,
                    borderRadius: 8
                },
                {
                    label: 'Expenses',
                    data: expenses,
                    backgroundColor: 'rgba(239, 68, 68, 0.6)',
                    borderColor: 'rgba(220, 38, 38, 1)',
                    borderWidth: 1,
                    borderRadius: 8
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'top' }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: (v) => `Rs ${Number(v).toLocaleString()}`
                    }
                }
            }
        }
    });
}

function csvEscape(value) {
    if (value === null || value === undefined) return '';
    const str = String(value).replace(/\r?\n/g, ' ').trim();
    if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
    return str;
}

function downloadRawCSV(filename, rows) {
    const content = rows.map((row) => row.map(csvEscape).join(',')).join('\n');
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

async function exportAuditCSV() {
    if (!lastAuditReport) return;
    const profile = await getBusinessProfile();
    const generatedAt = new Date();
    const summary = lastAuditReport.summary;
    const rows = [];

    rows.push(['AUDIT REPORT']);
    rows.push(['Business Name', profile.companyName || '-']);
    rows.push(['Address', [profile.address, profile.city, profile.state, profile.zip].filter(Boolean).join(', ') || '-']);
    rows.push(['Email', profile.email || '-']);
    rows.push(['Phone', profile.phone || '-']);
    rows.push(['Tax ID / GSTIN', profile.taxId || '-']);
    rows.push(['Financial Year', lastAuditReport.fyLabel]);
    rows.push(['Period Start', formatDate(lastAuditReport.start)]);
    rows.push(['Period End', formatDate(lastAuditReport.end)]);
    rows.push(['Generated At', generatedAt.toLocaleString()]);
    rows.push([]);

    rows.push(['AUDIT SUMMARY']);
    rows.push(['Metric', 'Value']);
    rows.push(['Gross Revenue (Accrual)', amount(summary.grossRevenue)]);
    rows.push(['Receipts Realized', amount(summary.collectedReceipts)]);
    rows.push(['Operating Expenses', amount(summary.operatingExpense)]);
    rows.push(['Net Profit (Cash View)', amount(summary.netProfit)]);
    rows.push(['Outstanding Receivables', amount(summary.receivables)]);
    rows.push(['Outstanding Payables', amount(summary.payables)]);
    rows.push(['GST Docs Issued', amount(summary.gstDocsCount)]);
    rows.push(['Taxable Turnover', amount(summary.taxableTurnover)]);
    rows.push(['Estimated GST', amount(summary.estimatedGst)]);
    rows.push(['GST Invoice Value', amount(summary.gstInvoiceValue)]);
    rows.push([]);

    rows.push(['AUDIT LEDGER EXTRACT']);
    rows.push(['Date', 'Particulars', 'Voucher/Ref', 'Category', 'Debit', 'Credit', 'Running Balance']);
    lastAuditReport.ledgerEntries.forEach((entry) => {
        rows.push([
            entry.date ? formatDate(entry.date) : '-',
            entry.particulars || '-',
            entry.voucher || '-',
            entry.category || '-',
            amount(entry.debit),
            amount(entry.credit),
            amount(entry.runningBalance)
        ]);
    });

    downloadRawCSV(`audit_report_${lastAuditReport.fyLabel.replace(/\s+/g, '_')}.csv`, rows);
}

async function loadImageAsDataUrl(url) {
    if (!url) return null;
    try {
        const response = await fetch(url, { mode: 'cors' });
        if (!response.ok) return null;
        const blob = await response.blob();
        return await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    } catch (_) {
        return null;
    }
}

function inferImageFormat(dataUrl = '') {
    if (dataUrl.startsWith('data:image/png')) return 'PNG';
    if (dataUrl.startsWith('data:image/webp')) return 'WEBP';
    return 'JPEG';
}

async function exportAuditPDF() {
    if (!lastAuditReport) return;
    const jspdf = window.jspdf;
    if (!jspdf || !jspdf.jsPDF || typeof window.jspdf?.jsPDF !== 'function') return;

    const profile = await getBusinessProfile();
    const summary = lastAuditReport.summary;
    const generatedAt = new Date();
    const user = getCurrentUser();

    const doc = new jspdf.jsPDF({
        orientation: 'portrait',
        unit: 'pt',
        format: 'a4'
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const marginX = 40;
    let y = 40;

    const logoDataUrl = await loadImageAsDataUrl(profile.logoUrl || '');
    if (logoDataUrl) {
        try {
            doc.addImage(logoDataUrl, inferImageFormat(logoDataUrl), marginX, y - 4, 44, 44);
        } catch (_) {
            // no-op
        }
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text(profile.companyName || 'Business', marginX + (logoDataUrl ? 56 : 0), y + 10);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    const addressLine = [profile.address, profile.city, profile.state, profile.zip].filter(Boolean).join(', ');
    const contactLine = [profile.phone, profile.email].filter(Boolean).join(' | ');
    const taxLine = profile.taxId ? `Tax ID / GSTIN: ${profile.taxId}` : '';
    const metaLines = [addressLine, contactLine, taxLine].filter(Boolean);
    metaLines.forEach((line, idx) => doc.text(line, marginX + (logoDataUrl ? 56 : 0), y + 24 + (idx * 12)));

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text('Audit Report Statement', pageWidth - marginX, y + 10, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(`Financial Year: ${lastAuditReport.fyLabel}`, pageWidth - marginX, y + 26, { align: 'right' });
    doc.text(`Period: ${formatDate(lastAuditReport.start)} to ${formatDate(lastAuditReport.end)}`, pageWidth - marginX, y + 38, { align: 'right' });
    doc.text(`Generated: ${generatedAt.toLocaleString()}`, pageWidth - marginX, y + 50, { align: 'right' });
    doc.text(`Prepared By: ${user.displayName || user.email || 'System'}`, pageWidth - marginX, y + 62, { align: 'right' });

    y += 74;
    doc.setDrawColor(148, 163, 184);
    doc.line(marginX, y, pageWidth - marginX, y);
    y += 14;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('Audit Summary', marginX, y);
    y += 8;

    doc.autoTable({
        startY: y,
        theme: 'grid',
        head: [['Metric', 'Value']],
        body: [
            ['Gross Revenue (Accrual)', money(summary.grossRevenue)],
            ['Receipts Realized', money(summary.collectedReceipts)],
            ['Operating Expenses', money(summary.operatingExpense)],
            ['Net Profit (Cash View)', money(summary.netProfit)],
            ['Outstanding Receivables', money(summary.receivables)],
            ['Outstanding Payables', money(summary.payables)],
            ['GST Docs Issued', String(summary.gstDocsCount || 0)],
            ['Taxable Turnover', money(summary.taxableTurnover)],
            ['Estimated GST', money(summary.estimatedGst)],
            ['GST Invoice Value', money(summary.gstInvoiceValue)]
        ],
        styles: { fontSize: 9, cellPadding: 5 },
        headStyles: { fillColor: [15, 118, 110], textColor: 255 },
        columnStyles: {
            0: { cellWidth: 270 },
            1: { halign: 'right', cellWidth: 230 }
        },
        margin: { left: marginX, right: marginX }
    });

    const ledgerRows = (lastAuditReport.ledgerEntries || []).map((entry) => ([
        entry.date ? formatDate(entry.date) : '-',
        entry.particulars || '-',
        entry.voucher || '-',
        entry.category || '-',
        entry.debit > 0 ? money(entry.debit) : '-',
        entry.credit > 0 ? money(entry.credit) : '-',
        money(entry.runningBalance)
    ]));

    doc.autoTable({
        startY: (doc.lastAutoTable?.finalY || y + 20) + 16,
        theme: 'striped',
        head: [['Date', 'Particulars', 'Voucher/Ref', 'Category', 'Debit', 'Credit', 'Balance']],
        body: ledgerRows.length ? ledgerRows : [['-', 'No ledger entries for selected FY.', '-', '-', '-', '-', '-']],
        styles: { fontSize: 7.5, cellPadding: 3.5, overflow: 'linebreak' },
        headStyles: { fillColor: [2, 132, 199], textColor: 255 },
        margin: { left: marginX, right: marginX },
        tableWidth: 'auto',
        rowPageBreak: 'auto',
        pageBreak: 'auto',
        columnStyles: {
            0: { cellWidth: 46 },
            1: { cellWidth: 146 },
            2: { cellWidth: 66 },
            3: { cellWidth: 64 },
            4: { halign: 'right', cellWidth: 52 },
            5: { halign: 'right', cellWidth: 52 },
            6: { halign: 'right', cellWidth: 69 }
        }
    });

    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(100);
        doc.text(
            `Audit Report - ${lastAuditReport.fyLabel} | ${profile.companyName || 'Business'} | Page ${i} of ${pageCount}`,
            pageWidth / 2,
            pageHeight - 16,
            { align: 'center' }
        );
    }

    doc.save(`audit_report_${lastAuditReport.fyLabel.replace(/\s+/g, '_')}.pdf`);
}
