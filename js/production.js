import { db } from './firebase-config.js';
import { checkAuth, formatDate, downloadCSV, downloadPDF } from './dashboard.js';
import { showAlert } from './auth.js';

const productionTablePipes = document.getElementById('productionTablePipes');
const productionTableSeptic = document.getElementById('productionTableSeptic');
const productionSearch = document.getElementById('productionSearch');
const productionStageFilter = document.getElementById('productionStageFilter');
const productionDateFrom = document.getElementById('productionDateFrom');
const productionDateTo = document.getElementById('productionDateTo');
const resetProductionFilters = document.getElementById('resetProductionFilters');
const addProductionBtn = document.getElementById('addProductionBtn');
const productionModal = document.getElementById('productionModal');
const saveProductionBtn = document.getElementById('saveProductionBtn');
const labourCostInput = document.getElementById('labourCost');
const powerCostInput = document.getElementById('powerCost');
const dailyLabourPlanner = document.getElementById('dailyLabourPlanner');
const dailyLabourRows = document.getElementById('dailyLabourRows');
const dailyLabourTotal = document.getElementById('dailyLabourTotal');
const regenDailyLabourBtn = document.getElementById('regenDailyLabourBtn');
const addIngredientBtn = document.getElementById('addIngredientBtn');
const ingredientsContainer = document.getElementById('ingredientsContainer');
const estimatedCostElement = document.getElementById('estimatedCost');
const productDetailsDiv = document.getElementById('productDetails');
const stockStatusBadge = document.getElementById('stockStatusBadge');
const exportProductionPdfBtn = document.getElementById('exportProductionPdfBtn');
const exportProductionCsvBtn = document.getElementById('exportProductionCsvBtn');
const prodMoldSelect = document.getElementById('prodMoldNumber');
const prodCastingLocationSelect = document.getElementById('prodCastingLocation');
const prodProductMasterSelect = document.getElementById('prodProductMaster');
const septicAllocationModal = document.getElementById('septicAllocationModal');
const septicAllocationQtyInput = document.getElementById('septicAllocationQty');
const septicAllocationProductSelect = document.getElementById('septicAllocationProduct');
const septicAllocationLocationSelect = document.getElementById('septicAllocationLocation');
const saveSepticAllocationBtn = document.getElementById('saveSepticAllocationBtn');
const moveToCuringModal = document.getElementById('moveToCuringModal');
const curingCompleteModal = document.getElementById('curingCompleteModal');
const curingBatchIdInput = document.getElementById('curingBatchId');
const curingQtyInput = document.getElementById('curingQuantity');
const curingQtyHint = document.getElementById('curingQtyHint');
const curingProducedQty = document.getElementById('curingProducedQty');
const curingMovedQty = document.getElementById('curingMovedQty');
const curingWaitingQty = document.getElementById('curingWaitingQty');
const curingFromLocationInput = document.getElementById('curingFromLocation');
const curingToLocationSelect = document.getElementById('curingToLocation');
const curingStartDateInput = document.getElementById('curingStartDate');
const saveMoveToCuringBtn = document.getElementById('saveMoveToCuringBtn');
const completeBatchIdInput = document.getElementById('completeBatchId');
const completePassedQtyInput = document.getElementById('completePassedQty');
const completeDamagedQtyInput = document.getElementById('completeDamagedQty');
const completeReadyLocationSelect = document.getElementById('completeReadyLocation');
const completeDateInput = document.getElementById('completeDate');
const saveCuringCompleteBtn = document.getElementById('saveCuringCompleteBtn');
const dailyLabourModal = document.getElementById('dailyLabourModal');
const dailyLabourRunBatch = document.getElementById('dailyLabourRunBatch');
const dailyLabourDateInput = document.getElementById('dailyLabourDate');
const addDailyLabourWorkerBtn = document.getElementById('addDailyLabourWorkerBtn');
const dailyLabourWorkerRows = document.getElementById('dailyLabourWorkerRows');
const dailyLabourAmountInput = document.getElementById('dailyLabourAmount');
const dailyLabourNotesInput = document.getElementById('dailyLabourNotes');
const saveDailyLabourBtn = document.getElementById('saveDailyLabourBtn');
const labourPaymentsTable = document.getElementById('labourPaymentsTable');
const labourTotalRecorded = document.getElementById('labourTotalRecorded');
const labourPendingAmount = document.getElementById('labourPendingAmount');
const labourTotalEntries = document.getElementById('labourTotalEntries');
const labourUniqueWorkers = document.getElementById('labourUniqueWorkers');
const labourPayableSearch = document.getElementById('labourPayableSearch');
const labourPayableStatusFilter = document.getElementById('labourPayableStatusFilter');
const labourPayableWorkerFilter = document.getElementById('labourPayableWorkerFilter');
const labourPayableDateFrom = document.getElementById('labourPayableDateFrom');
const labourPayableDateTo = document.getElementById('labourPayableDateTo');
const resetLabourPayableFilters = document.getElementById('resetLabourPayableFilters');
const selectAllLabourPayables = document.getElementById('selectAllLabourPayables');
const approveSelectedLabourPayablesBtn = document.getElementById('approveSelectedLabourPayablesBtn');
const paySelectedLabourPayablesBtn = document.getElementById('paySelectedLabourPayablesBtn');
const labourLedgerModal = document.getElementById('labourLedgerModal');
const labourLedgerBatch = document.getElementById('labourLedgerBatch');
const labourLedgerProduct = document.getElementById('labourLedgerProduct');
const labourLedgerTable = document.getElementById('labourLedgerTable');
const labourLedgerTotal = document.getElementById('labourLedgerTotal');
const labourLedgerPaidTotal = document.getElementById('labourLedgerPaidTotal');
const labourLedgerPendingTotal = document.getElementById('labourLedgerPendingTotal');

// State
let inventoryItems = [];
let productionData = [];
let currentEditId = null;
let moldMasterItems = [];
let locationMasterItems = [];
let productMasterItems = [];
let currentSepticRunId = null;
let productionDataAll = [];
let currentCuringRunId = null;
let currentCompleteRunId = null;
let currentLabourRunId = null;
let currentLabourLedgerRunId = null;
let dailyLabourMode = false;
let labourPayablesAll = [];

function normalizeLocationType(type) {
    const raw = (type || '').trim();
    if (!raw) return '';
    const map = {
        'Production Area': 'Production Output',
        'Curing Yard': 'Curing House',
        'Septic Assembly Area': 'Septic Tank Area'
    };
    return map[raw] || raw;
}

// Expose function globally for onclick handlers
window.completeCuring = async (id) => {
    const run = productionData.find(r => r.id === id);
    if (!run) return;
    if (isSepticAssemblyRun(run)) {
        return showAlert('warning', 'Curing completion is not applicable for septic assembly runs.');
    }
    currentCompleteRunId = id;
    const flow = getRunFlowMetrics(run);
    if (flow.onCuringQty <= 0) {
        return showAlert('warning', 'No quantity is currently on curing to complete.');
    }
    if (completeBatchIdInput) completeBatchIdInput.value = run.batchId || '';
    if (completePassedQtyInput) {
        completePassedQtyInput.value = flow.onCuringQty;
        completePassedQtyInput.max = String(flow.onCuringQty);
    }
    if (completeDamagedQtyInput) completeDamagedQtyInput.value = 0;
    if (completeDateInput) completeDateInput.valueAsDate = new Date();
    if (completeReadyLocationSelect) {
        const readyValue = run.stockLocationId || run.stockLocation || '';
        completeReadyLocationSelect.value = readyValue;
        if (!completeReadyLocationSelect.value && run.stockLocation) {
            const match = Array.from(completeReadyLocationSelect.options).find(o => o.dataset.locationName === run.stockLocation);
            if (match) completeReadyLocationSelect.value = match.value;
        }
    }
    new bootstrap.Modal(curingCompleteModal).show();
};

window.startCuring = async (id) => {
    const run = productionData.find(r => r.id === id);
    if (!run) return;
    if (isSepticAssemblyRun(run)) {
        return showAlert('warning', 'Curing flow is not applicable for septic assembly runs.');
    }
    currentCuringRunId = id;
    if (curingBatchIdInput) curingBatchIdInput.value = run.batchId || '';
    const producedQty = Number(run.quantityProduced || 0);
    const movedQty = Number(run.curingQty || 0);
    const waitingQty = Math.max(0, producedQty - movedQty);
    if (waitingQty <= 0) {
        return showAlert('warning', 'No quantity is waiting for curing move.');
    }
    if (curingQtyInput) {
        curingQtyInput.value = waitingQty;
        curingQtyInput.max = String(waitingQty);
    }
    if (curingQtyHint) curingQtyHint.textContent = `You can move up to ${waitingQty.toLocaleString()} quantity in this step.`;
    if (curingProducedQty) curingProducedQty.textContent = producedQty.toLocaleString();
    if (curingMovedQty) curingMovedQty.textContent = movedQty.toLocaleString();
    if (curingWaitingQty) curingWaitingQty.textContent = waitingQty.toLocaleString();
    if (curingFromLocationInput) curingFromLocationInput.value = run.productionLocation || '';
    if (curingToLocationSelect) {
        if (!curingToLocationSelect.options.length || curingToLocationSelect.options.length <= 1) {
            populateLocationSelects();
        }
        curingToLocationSelect.value = '';
    }
    if (curingStartDateInput) curingStartDateInput.valueAsDate = new Date();
    new bootstrap.Modal(moveToCuringModal).show();
};

window.allocateSeptic = async (id) => {
    const run = productionData.find(r => r.id === id);
    if (!run) return;
    if (isSepticAssemblyRun(run)) {
        return showAlert('warning', 'Septic assembly runs do not use septic allocation workflow.');
    }
    const flow = getRunFlowMetrics(run);
    if (flow.completedGoodQty <= 0) {
        return showAlert('warning', 'Complete at least some curing before septic allocation.');
    }
    currentSepticRunId = id;
    if (septicAllocationQtyInput) septicAllocationQtyInput.value = run.internalUseQty || 0;
    if (septicAllocationProductSelect) septicAllocationProductSelect.value = run.septicProductMasterId || '';
    if (septicAllocationLocationSelect) {
        const septicValue = run.septicLocationId || run.septicLocation || '';
        septicAllocationLocationSelect.value = septicValue;
        if (!septicAllocationLocationSelect.value && run.septicLocation) {
            const match = Array.from(septicAllocationLocationSelect.options).find(o => o.dataset.locationName === run.septicLocation);
            if (match) septicAllocationLocationSelect.value = match.value;
        }
    }
    new bootstrap.Modal(septicAllocationModal).show();
};

window.recordDailyLabour = async (id) => {
    const run = productionData.find(r => r.id === id);
    if (!run || !dailyLabourModal) return;
    currentLabourRunId = id;
    if (dailyLabourRunBatch) dailyLabourRunBatch.textContent = run.batchId || '-';
    const today = formatDateInput(new Date());
    const entries = Array.isArray(run.dailyLabourEntries) ? run.dailyLabourEntries : [];
    const todayEntry = entries.find(e => normalizeLabourDate(e?.date) === today) || null;
    const sortedEntries = entries.length
        ? [...entries].sort((a, b) => normalizeLabourDate(a?.date).localeCompare(normalizeLabourDate(b?.date)))
        : [];
    const lastEntry = sortedEntries.length ? sortedEntries[sortedEntries.length - 1] : null;
    if (dailyLabourDateInput) dailyLabourDateInput.value = today;
    if (dailyLabourWorkerRows) dailyLabourWorkerRows.innerHTML = '';
    const defaultQty = parseFloat(run.quantityProduced || 0) || 0;
    const defaultRate = parseFloat(lastEntry?.rate || 0) || 0;
    const todayWorkers = Array.isArray(todayEntry?.labourers) ? todayEntry.labourers : [];
    if (todayWorkers.length) {
        todayWorkers.forEach(w => addDailyLabourWorkerRow(w));
    } else if (todayEntry && (todayEntry.quantity || todayEntry.rate || todayEntry.amount)) {
        addDailyLabourWorkerRow({
            name: '',
            quantity: parseFloat(todayEntry.quantity || 0) || 0,
            rate: parseFloat(todayEntry.rate || 0) || 0
        });
    } else {
        addDailyLabourWorkerRow({ name: '', quantity: defaultQty, rate: defaultRate });
    }
    if (dailyLabourNotesInput) dailyLabourNotesInput.value = todayEntry?.notes || '';
    recalcDailyLabourModalAmount();
    new bootstrap.Modal(dailyLabourModal).show();
};

window.viewLabourLedger = (id) => {
    const run = productionDataAll.find(r => r.id === id) || productionData.find(r => r.id === id);
    if (!run || !labourLedgerModal || !labourLedgerTable) return;
    const entries = getRunLabourEntries(run);
    const tbody = labourLedgerTable.querySelector('tbody');
    if (!tbody) return;

    if (labourLedgerBatch) labourLedgerBatch.textContent = run.batchId || '-';
    if (labourLedgerProduct) labourLedgerProduct.textContent = run.finishedGoodName || '-';

    let total = 0;
    let paidTotal = 0;
    let pendingTotal = 0;

    if (!entries.length) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">No date-wise labour entries recorded</td></tr>';
    } else {
        tbody.innerHTML = entries.map(entry => {
            const amount = parseFloat(entry.amount || 0) || 0;
            const paid = isLabourPaid(run, entry.date);
            const paidAmt = paid ? amount : 0;
            const pendingAmt = paid ? 0 : amount;
            total += amount;
            paidTotal += paidAmt;
            pendingTotal += pendingAmt;
            return `
                <tr>
                    <td>${entry.date}</td>
                    <td class="text-end">₹${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td class="text-end text-success">₹${paidAmt.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td class="text-end text-danger">₹${pendingAmt.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td>${paid ? '<span class="badge bg-success">Paid</span>' : '<span class="badge bg-warning text-dark">Pending</span>'}</td>
                </tr>
            `;
        }).join('');
    }

    if (labourLedgerTotal) labourLedgerTotal.textContent = `₹${total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    if (labourLedgerPaidTotal) labourLedgerPaidTotal.textContent = `₹${paidTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    if (labourLedgerPendingTotal) labourLedgerPendingTotal.textContent = `₹${pendingTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    new bootstrap.Modal(labourLedgerModal).show();
};

window.editProductionRun = async (id) => {
    const run = productionData.find(r => r.id === id);
    if (!run) return;
    currentEditId = id;
    await openProductionModal();
    document.getElementById('productionDate').valueAsDate = run.date?.toDate ? run.date.toDate() : new Date();
    document.getElementById('produceQuantity').value = run.quantityProduced || 0;
    if (prodProductMasterSelect) {
        prodProductMasterSelect.value = run.productMasterId || '';
        prodProductMasterSelect.disabled = true;
    }
    if (prodMoldSelect) {
        const moldValue = run.moldId || run.moldNumber || '';
        prodMoldSelect.value = moldValue;
        if (!prodMoldSelect.value && run.moldNumber) {
            const match = Array.from(prodMoldSelect.options).find(o => o.dataset.moldNumber === run.moldNumber);
            if (match) prodMoldSelect.value = match.value;
        }
        const opt = prodMoldSelect.querySelector(`option[value="${prodMoldSelect.value}"]`);
        if (opt && opt.disabled) opt.disabled = false;
        prodMoldSelect.disabled = true;
    }
    if (prodCastingLocationSelect) {
        const castingValue = run.productionLocationId || run.productionLocation || '';
        prodCastingLocationSelect.value = castingValue;
        if (!prodCastingLocationSelect.value && run.productionLocation) {
            const match = Array.from(prodCastingLocationSelect.options).find(o => o.dataset.locationName === run.productionLocation);
            if (match) prodCastingLocationSelect.value = match.value;
        }
    }
    document.getElementById('productionNotes').value = run.notes || '';
    document.getElementById('productionSupervisor').value = run.supervisor || '';
    if (labourCostInput) labourCostInput.value = parseFloat(run.labourCost || 0) || 0;
    if (powerCostInput) powerCostInput.value = parseFloat(run.powerCost || 0) || 0;
    loadDailyLabourEntriesFromRun(run);

    // Lock fields that would affect stock
    document.getElementById('produceQuantity').disabled = true;
    if (ingredientsContainer) {
        ingredientsContainer.querySelectorAll('input, select, button').forEach(el => el.disabled = true);
    }
};

document.addEventListener('DOMContentLoaded', async () => {
    await checkAuth();
    loadProductionHistory();
    
    window.addEventListener('sectionChanged', (e) => {
        if (e.detail === 'production') {
            loadProductionHistory();
        }
    });

    if (addProductionBtn) {
        addProductionBtn.addEventListener('click', openProductionModal);
    }

    if (addIngredientBtn) {
        addIngredientBtn.addEventListener('click', () => addIngredientRow());
    }

    if (saveProductionBtn) {
        saveProductionBtn.addEventListener('click', saveProductionRun);
    }

    if (document.getElementById('produceQuantity')) {
        document.getElementById('produceQuantity').addEventListener('input', calculateCost);
    }

    const productionDateInput = document.getElementById('productionDate');
    if (productionDateInput) {
        productionDateInput.addEventListener('change', () => {
            if (dailyLabourMode) {
                regenerateDailyLabourRows(true);
            }
        });
    }
    if (regenDailyLabourBtn) {
        regenDailyLabourBtn.addEventListener('click', () => regenerateDailyLabourRows(false));
    }
    if (dailyLabourRows) {
        dailyLabourRows.addEventListener('input', (e) => {
            if (!e.target.closest('.daily-labour-qty') && !e.target.closest('.daily-labour-rate')) return;
            recalculateDailyLabourTotals();
        });
    }
    if (addDailyLabourWorkerBtn) {
        addDailyLabourWorkerBtn.addEventListener('click', () => {
            addDailyLabourWorkerRow();
            recalcDailyLabourModalAmount();
        });
    }
    if (dailyLabourWorkerRows) {
        dailyLabourWorkerRows.addEventListener('input', (e) => {
            if (!e.target.closest('.daily-worker-qty') && !e.target.closest('.daily-worker-rate')) return;
            recalcDailyLabourModalAmount();
        });
        dailyLabourWorkerRows.addEventListener('click', (e) => {
            const btn = e.target.closest('.remove-daily-worker-btn');
            if (!btn) return;
            const row = btn.closest('tr');
            if (row) row.remove();
            if (!dailyLabourWorkerRows.querySelector('tr')) addDailyLabourWorkerRow();
            recalcDailyLabourModalAmount();
        });
    }
    if (saveDailyLabourBtn) saveDailyLabourBtn.addEventListener('click', saveDailyLabourEntry);
    if (labourPaymentsTable) {
        labourPaymentsTable.addEventListener('click', async (e) => {
            const editBtn = e.target.closest('.edit-labour-payable-btn');
            if (editBtn) {
                const payableId = editBtn.dataset.payableId || '';
                if (payableId) await editLabourPayable(payableId);
                return;
            }
            const deleteBtn = e.target.closest('.delete-labour-payable-btn');
            if (deleteBtn) {
                const payableId = deleteBtn.dataset.payableId || '';
                if (payableId) await deleteLabourPayable(payableId);
                return;
            }
            const approveBtn = e.target.closest('.approve-labour-payable-btn');
            if (approveBtn) {
                const payableId = approveBtn.dataset.payableId || '';
                if (payableId) await approveLabourPayable(payableId);
                return;
            }
            const fullPayBtn = e.target.closest('.mark-labour-paid-btn');
            if (fullPayBtn) {
                const payableId = fullPayBtn.dataset.payableId || '';
                if (payableId) await payLabourPayable(payableId);
                return;
            }
            const partialBtn = e.target.closest('.partial-labour-paid-btn');
            if (partialBtn) {
                const payableId = partialBtn.dataset.payableId || '';
                if (!payableId) return;
                const pending = parseFloat(partialBtn.dataset.pending || '0') || 0;
                if (pending <= 0) return;
                const val = window.prompt(`Enter payment amount (max Rs ${pending.toFixed(2)})`, pending.toFixed(2));
                if (val === null) return;
                const amount = parseFloat(val || '0') || 0;
                await payLabourPayable(payableId, amount);
                return;
            }
            const reverseBtn = e.target.closest('.reverse-labour-payable-btn');
            if (reverseBtn) {
                const payableId = reverseBtn.dataset.payableId || '';
                if (!payableId) return;
                const reason = window.prompt('Reason for reversal', 'Payment reversal') || 'Payment reversal';
                await reverseLabourPayable(payableId, reason);
            }
        });
        labourPaymentsTable.addEventListener('change', (e) => {
            if (!e.target.closest('.labour-payable-select')) return;
            syncSelectAllLabourPayables();
        });
    }
    if (labourLedgerTable) {
        labourLedgerTable.addEventListener('click', async (e) => {
            const editBtn = e.target.closest('.edit-labour-payable-btn');
            if (editBtn) {
                const payableId = editBtn.dataset.payableId || '';
                if (!payableId) return;
                const ok = await editLabourPayable(payableId);
                if (ok && currentLabourLedgerRunId) window.viewLabourLedger(currentLabourLedgerRunId, { showModal: false });
                return;
            }
            const deleteBtn = e.target.closest('.delete-labour-payable-btn');
            if (deleteBtn) {
                const payableId = deleteBtn.dataset.payableId || '';
                if (!payableId) return;
                const ok = await deleteLabourPayable(payableId);
                if (ok && currentLabourLedgerRunId) window.viewLabourLedger(currentLabourLedgerRunId, { showModal: false });
                return;
            }
            const approveBtn = e.target.closest('.approve-labour-payable-btn');
            if (approveBtn) {
                const payableId = approveBtn.dataset.payableId || '';
                if (!payableId) return;
                const ok = await approveLabourPayable(payableId);
                if (ok && currentLabourLedgerRunId) window.viewLabourLedger(currentLabourLedgerRunId, { showModal: false });
                return;
            }
            const fullPayBtn = e.target.closest('.mark-labour-paid-btn');
            if (fullPayBtn) {
                const payableId = fullPayBtn.dataset.payableId || '';
                if (!payableId) return;
                const ok = await payLabourPayable(payableId);
                if (ok && currentLabourLedgerRunId) window.viewLabourLedger(currentLabourLedgerRunId, { showModal: false });
                return;
            }
            const partialBtn = e.target.closest('.partial-labour-paid-btn');
            if (partialBtn) {
                const payableId = partialBtn.dataset.payableId || '';
                if (!payableId) return;
                const pending = parseFloat(partialBtn.dataset.pending || '0') || 0;
                if (pending <= 0) return;
                const val = window.prompt(`Enter payment amount (max Rs ${pending.toFixed(2)})`, pending.toFixed(2));
                if (val === null) return;
                const amount = parseFloat(val || '0') || 0;
                const ok = await payLabourPayable(payableId, amount);
                if (ok && currentLabourLedgerRunId) window.viewLabourLedger(currentLabourLedgerRunId, { showModal: false });
                return;
            }
            const reverseBtn = e.target.closest('.reverse-labour-payable-btn');
            if (reverseBtn) {
                const payableId = reverseBtn.dataset.payableId || '';
                if (!payableId) return;
                const reason = window.prompt('Reason for reversal', 'Payment reversal') || 'Payment reversal';
                const ok = await reverseLabourPayable(payableId, reason);
                if (ok && currentLabourLedgerRunId) window.viewLabourLedger(currentLabourLedgerRunId, { showModal: false });
            }
        });
    }
    if (selectAllLabourPayables) {
        selectAllLabourPayables.addEventListener('change', () => {
            const checked = Boolean(selectAllLabourPayables.checked);
            labourPaymentsTable?.querySelectorAll('.labour-payable-select:not(:disabled)').forEach(cb => {
                cb.checked = checked;
            });
        });
    }
    if (approveSelectedLabourPayablesBtn) {
        approveSelectedLabourPayablesBtn.addEventListener('click', approveSelectedLabourPayables);
    }
    if (paySelectedLabourPayablesBtn) {
        paySelectedLabourPayablesBtn.addEventListener('click', paySelectedLabourPayables);
    }
    if (labourPayableSearch) labourPayableSearch.addEventListener('input', () => renderLabourPaymentTracker(labourPayablesAll, productionData));
    if (labourPayableStatusFilter) labourPayableStatusFilter.addEventListener('change', () => renderLabourPaymentTracker(labourPayablesAll, productionData));
    if (labourPayableWorkerFilter) labourPayableWorkerFilter.addEventListener('input', () => renderLabourPaymentTracker(labourPayablesAll, productionData));
    if (labourPayableDateFrom) labourPayableDateFrom.addEventListener('change', () => renderLabourPaymentTracker(labourPayablesAll, productionData));
    if (labourPayableDateTo) labourPayableDateTo.addEventListener('change', () => renderLabourPaymentTracker(labourPayablesAll, productionData));
    if (resetLabourPayableFilters) {
        resetLabourPayableFilters.addEventListener('click', () => {
            if (labourPayableSearch) labourPayableSearch.value = '';
            if (labourPayableStatusFilter) labourPayableStatusFilter.value = 'all';
            if (labourPayableWorkerFilter) labourPayableWorkerFilter.value = '';
            if (labourPayableDateFrom) labourPayableDateFrom.value = '';
            if (labourPayableDateTo) labourPayableDateTo.value = '';
            renderLabourPaymentTracker(labourPayablesAll, productionData);
        });
    }

    if (saveSepticAllocationBtn) {
        saveSepticAllocationBtn.addEventListener('click', saveSepticAllocation);
    }
    if (saveMoveToCuringBtn) {
        saveMoveToCuringBtn.addEventListener('click', saveMoveToCuring);
    }
    if (saveCuringCompleteBtn) {
        saveCuringCompleteBtn.addEventListener('click', saveCuringComplete);
    }

    if (ingredientsContainer) {
        ingredientsContainer.addEventListener('input', calculateCost);
        ingredientsContainer.addEventListener('change', calculateCost);
        ingredientsContainer.addEventListener('click', (e) => {
            const btn = e.target.closest('.remove-ingredient-btn');
            if (btn) {
                const row = btn.closest('.ingredient-row');
                if (row) {
                    row.remove();
                    calculateCost();
                }
            }
        });
    }

    if (prodProductMasterSelect) {
        prodProductMasterSelect.addEventListener('change', applyProductMasterSelection);
    }

    if (exportProductionCsvBtn) {
        exportProductionCsvBtn.addEventListener('click', exportProductionCSV);
    }

    if (exportProductionPdfBtn) {
        exportProductionPdfBtn.addEventListener('click', exportProductionPDF);
    }

    if (productionSearch) {
        productionSearch.addEventListener('input', applyProductionFilters);
    }
    if (productionStageFilter) {
        productionStageFilter.addEventListener('change', applyProductionFilters);
    }
    if (productionDateFrom) {
        productionDateFrom.addEventListener('change', applyProductionFilters);
    }
    if (productionDateTo) {
        productionDateTo.addEventListener('change', applyProductionFilters);
    }
    if (resetProductionFilters) {
        resetProductionFilters.addEventListener('click', () => {
            if (productionSearch) productionSearch.value = '';
            if (productionStageFilter) productionStageFilter.value = 'all';
            if (productionDateFrom) productionDateFrom.value = '';
            if (productionDateTo) productionDateTo.value = '';
            applyProductionFilters();
        });
    }

});

function applyProductionFilters() {
    if (!productionDataAll.length) {
        renderLabourPaymentTracker([]);
        return;
    }
    const user = JSON.parse(localStorage.getItem('user'));
    if (!user) return;

    const searchTerm = (productionSearch?.value || '').toLowerCase();
    const stageFilter = productionStageFilter?.value || 'all';
    const fromVal = productionDateFrom?.value || '';
    const toVal = productionDateTo?.value || '';
    const fromDate = fromVal ? new Date(fromVal) : null;
    const toDate = toVal ? new Date(toVal) : null;

    const filtered = productionDataAll.filter(run => {
        const text = `${run.productName || ''} ${run.batchId || ''} ${run.productionLocation || ''} ${run.curingLocation || ''} ${run.stockLocation || ''} ${run.septicLocation || ''}`.toLowerCase();
        if (searchTerm && !text.includes(searchTerm)) return false;
        const stage = getDerivedRunStage(run);
        if (stageFilter !== 'all' && stage !== stageFilter) return false;
        if (fromDate || toDate) {
            const dateObj = run.date?.toDate ? run.date.toDate() : (run.date ? new Date(run.date) : null);
            if (fromDate && dateObj && dateObj < fromDate) return false;
            if (toDate && dateObj) {
                const end = new Date(toDate);
                end.setHours(23, 59, 59, 999);
                if (dateObj > end) return false;
            }
        }
        return true;
    });

    renderProductionRows(filtered, user);
    renderLabourPaymentTracker(labourPayablesAll, filtered);
}

function getRunFlowMetrics(run) {
    const isSepticAssembly = isSepticAssemblyRun(run);
    const producedQty = Number(run?.quantityProduced || 0);
    const statusRaw = (run?.status || '').toString();
    const rawMoved = Number(run?.curingQty || 0);
    const movedToCuringQty = isSepticAssembly
        ? 0
        : Math.max(0, Math.min(producedQty, rawMoved > 0 ? rawMoved : (statusRaw === 'Completed' ? producedQty : 0)));
    const damagedQty = Math.max(0, Number(run?.rejectedQuantity || run?.brokenQuantity || 0));
    const rawGood = Number(run?.goodQty);
    const completedGoodQty = Math.max(0, Number.isFinite(rawGood) && rawGood > 0 ? rawGood : (statusRaw === 'Completed' ? Math.max(0, producedQty - damagedQty) : 0));
    const completedProcessedQty = Math.min(movedToCuringQty, Math.max(completedGoodQty, completedGoodQty + damagedQty));
    const onCuringQty = isSepticAssembly ? 0 : Math.max(0, movedToCuringQty - completedProcessedQty);
    const waitingForCuringQty = isSepticAssembly ? 0 : Math.max(0, producedQty - movedToCuringQty);
    const internalUseQty = Math.max(0, Number(run?.internalUseQty || 0));
    const availableQty = Math.max(0, completedGoodQty - internalUseQty);
    return {
        producedQty,
        movedToCuringQty,
        completedGoodQty,
        damagedQty,
        completedProcessedQty,
        onCuringQty,
        waitingForCuringQty,
        internalUseQty,
        availableQty
    };
}

function getDerivedRunStage(run) {
    if (isSepticAssemblyRun(run)) return 'Completed';
    const flow = getRunFlowMetrics(run);
    if (flow.waitingForCuringQty <= 0 && flow.onCuringQty <= 0 && flow.producedQty > 0) return 'Completed';
    if (flow.onCuringQty > 0) return 'On Curing';
    return 'Started';
}

function isSepticAssemblyRun(run) {
    return (run?.productType || '').toLowerCase().includes('septic') || Boolean(run?.sourceRunId);
}

async function loadProductionHistory() {
    const user = JSON.parse(localStorage.getItem('user'));
    if (!user || !productionTablePipes || !productionTableSeptic) return;
    const businessId = user.businessId || user.uid;

    const pipesBody = productionTablePipes.querySelector('tbody');
    const septicBody = productionTableSeptic.querySelector('tbody');
    pipesBody.innerHTML = '<tr><td colspan="6" class="text-center">Loading...</td></tr>';
    septicBody.innerHTML = '<tr><td colspan="6" class="text-center">Loading...</td></tr>';

    try {
        await loadProductionMasters(businessId);
        const snapshot = await db.collection('users').doc(businessId)
            .collection('production_runs')
            .orderBy('date', 'desc')
            .limit(200)
            .get();

        pipesBody.innerHTML = '';
        septicBody.innerHTML = '';
        productionData = [];
        productionDataAll = [];

        if (snapshot.empty) {
            updateCuringStats([]);
            pipesBody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">No pipe production records found</td></tr>';
            septicBody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">No septic assembly records found</td></tr>';
            labourPayablesAll = [];
            renderLabourPaymentTracker([], []);
            return;
        }

        updateCuringStats(snapshot.docs);

        snapshot.forEach(doc => {
            const data = doc.data();
            productionDataAll.push({ id: doc.id, ...data });
        });

        await syncLabourPayablesForRuns(businessId, productionDataAll);
        await loadLabourPayables(businessId);
        renderProductionRows(productionDataAll, user);
        renderLabourPaymentTracker(labourPayablesAll, productionDataAll);
        applyProductionFilters();
    } catch (error) {
        console.error('Error loading production history:', error);
        pipesBody.innerHTML = '<tr><td colspan="6" class="text-center text-danger">Error loading data</td></tr>';
        septicBody.innerHTML = '<tr><td colspan="6" class="text-center text-danger">Error loading data</td></tr>';
        labourPayablesAll = [];
        renderLabourPaymentTracker([], []);
    }
}

function buildLabourWorkerCell(labourers = []) {
    if (!Array.isArray(labourers) || labourers.length === 0) {
        return '<span class="text-muted">Labour</span>';
    }
    if (labourers.length === 1) {
        const name = (labourers[0]?.name || 'Labour').toString().trim() || 'Labour';
        return `<span>${name}</span>`;
    }
    const options = labourers.map((w, idx) => {
        const name = (w?.name || `Labour ${idx + 1}`).toString().trim() || `Labour ${idx + 1}`;
        return `<option value="${idx}">${name}</option>`;
    }).join('');
    return `<select class="form-select form-select-sm labour-worker-select">${options}</select>`;
}

function getSelectedLabourAmount(labourers = [], selectedIndex = 0, fallbackAmount = 0) {
    if (!Array.isArray(labourers) || labourers.length === 0) return parseFloat(fallbackAmount || 0) || 0;
    const idx = Number.isFinite(Number(selectedIndex)) ? Number(selectedIndex) : 0;
    const worker = labourers[idx] || labourers[0] || {};
    return parseFloat(worker?.amount || ((parseFloat(worker?.quantity || 0) || 0) * (parseFloat(worker?.rate || 0) || 0))) || 0;
}

function getRunLabourEntries(run) {
    const entries = Array.isArray(run?.dailyLabourEntries) ? run.dailyLabourEntries : [];
    const mapped = entries.map(entry => {
        const date = normalizeLabourDate(entry?.date);
        return {
            date,
            amount: parseFloat(entry?.amount || 0) || 0,
            labourers: Array.isArray(entry?.labourers) ? entry.labourers : []
        };
    }).filter(e => e.date);
    mapped.sort((a, b) => a.date.localeCompare(b.date));
    return mapped;
}

function getDefaultLabourDateForRun(run, entries) {
    const today = formatDateInput(new Date());
    const isCompleted = (run.status || '').toLowerCase() === 'completed';
    if (isCompleted) {
        const completedDate = normalizeLabourDate(run.completedAt || run.date);
        return completedDate || today;
    }
    return today;
}

function getLabourDateOptionsForRun(run, entries, selectedDate) {
    const options = new Set((entries || []).map(e => e.date).filter(Boolean));
    if (selectedDate) options.add(selectedDate);
    return Array.from(options).sort((a, b) => b.localeCompare(a));
}

function getLabourEntryForDate(run, dateVal) {
    const entries = getRunLabourEntries(run);
    return entries.find(e => e.date === dateVal) || null;
}

function isLabourPaid(run, dateVal) {
    const paidEntries = Array.isArray(run?.labourPaidDates) ? run.labourPaidDates : [];
    return paidEntries.some(p => normalizeLabourDate(p?.date) === dateVal && Boolean(p?.paid));
}

function refreshLabourTrackerRow(row) {
    if (!row) return;
    const runId = row.dataset.runId;
    const run = productionDataAll.find(r => r.id === runId);
    if (!run) return;
    const dateSelect = row.querySelector('.labour-date-select');
    const dateVal = dateSelect?.value || '';
    const entry = getLabourEntryForDate(run, dateVal);
    const labourers = Array.isArray(entry?.labourers) ? entry.labourers : [];
    const entries = getRunLabourEntries(run);
    const batchPendingAmount = entries.reduce((sum, e) => {
        if (isLabourPaid(run, e.date)) return sum;
        return sum + (parseFloat(e.amount || 0) || 0);
    }, 0);
    const workerCell = row.querySelector('.labour-worker-cell');
    if (workerCell) workerCell.innerHTML = buildLabourWorkerCell(labourers);
    const workerSelect = row.querySelector('.labour-worker-select');
    const workerAmount = getSelectedLabourAmount(labourers, workerSelect?.value || 0, entry?.amount || 0);
    const paid = isLabourPaid(run, dateVal);
    const amountCell = row.querySelector('.labour-amount-cell');
    if (amountCell) amountCell.textContent = `₹${workerAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const totalCell = row.querySelector('.labour-total-cell');
    if (totalCell) totalCell.textContent = `₹${batchPendingAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const statusCell = row.querySelector('.labour-status-cell');
    if (statusCell) {
        statusCell.innerHTML = paid
            ? '<span class="badge bg-success">Paid</span>'
            : '<span class="badge bg-warning text-dark">Pending</span> <button type="button" class="btn btn-sm btn-outline-success ms-2 mark-labour-paid-btn">Mark Paid</button>';
    }
}

async function markLabourPaidForRun(runId, dateVal) {
    const user = JSON.parse(localStorage.getItem('user'));
    const businessId = user?.businessId || user?.uid;
    if (!businessId) return;
    labourTrackerSelectedDateByRun[runId] = dateVal;
    try {
        await db.runTransaction(async (transaction) => {
            const runRef = db.collection('users').doc(businessId).collection('production_runs').doc(runId);
            const runDoc = await transaction.get(runRef);
            if (!runDoc.exists) throw new Error('Production run not found');
            const runData = runDoc.data();
            const entries = getRunLabourEntries(runData);
            const entry = entries.find(e => e.date === dateVal);
            const amount = parseFloat(entry?.amount || 0) || 0;
            if (!entry) throw new Error('No labour entry for selected date');
            if (amount <= 0) throw new Error('Selected date has zero labour amount');
            const paidEntries = Array.isArray(runData.labourPaidDates) ? runData.labourPaidDates.map(p => ({
                date: normalizeLabourDate(p?.date),
                paid: Boolean(p?.paid),
                paidAt: p?.paidAt || null,
                amount: parseFloat(p?.amount || 0) || 0
            })) : [];
            const idx = paidEntries.findIndex(p => p.date === dateVal);
            const payload = { date: dateVal, paid: true, paidAt: new Date(), amount };
            if (idx >= 0) paidEntries[idx] = payload;
            else paidEntries.push(payload);
            paidEntries.sort((a, b) => a.date.localeCompare(b.date));

            // Link payment into Payments > Payment Out (transactions: SupplierPayment)
            const txId = `LABPAY_${runId}_${dateVal}`;
            const txRef = db.collection('users').doc(businessId).collection('transactions').doc(txId);
            const batchId = runData.batchId || '-';
            const product = runData.finishedGoodName || 'Production Labour';
            const labourers = Array.isArray(entry?.labourers) ? entry.labourers : [];
            const labourLabel = labourers.length
                ? labourers.map(l => (l?.name || '').toString().trim()).filter(Boolean).join(', ')
                : 'Labour';
            const paidAt = new Date();
            transaction.set(txRef, {
                type: 'SupplierPayment',
                supplier: 'Labour',
                mode: 'Cash',
                reference: `LAB-${String(batchId).replace(/\s+/g, '').slice(0, 12)}-${dateVal.replace(/-/g, '')}`,
                description: `Labour payment | Batch ${batchId} | ${product} | Labour: ${labourLabel || 'Labour'} | Work Date: ${dateVal}`,
                amount,
                date: paidAt,
                source: 'production_labour',
                runId,
                batchId,
                labourDate: dateVal,
                productName: product,
                updatedAt: paidAt,
                createdAt: paidAt
            }, { merge: true });

            transaction.update(runRef, { labourPaidDates: paidEntries, updatedAt: new Date() });
        });
        showAlert('success', 'Labour marked paid');
        loadProductionHistory();
    } catch (error) {
        console.error('Labour Paid Update Error', error);
        showAlert('danger', error.message || 'Failed to mark labour paid');
    }
}

function renderProductionRows(runs, user) {
    const pipesBody = productionTablePipes.querySelector('tbody');
    const septicBody = productionTableSeptic.querySelector('tbody');
    pipesBody.innerHTML = '';
    septicBody.innerHTML = '';
    productionData = [];
    const septicRuns = [];
    const pipeRuns = [];
    runs.forEach(run => {
        const isSeptic = (run.productType || '').toLowerCase().includes('septic') || Boolean(run.sourceRunId);
        if (isSeptic) septicRuns.push(run);
        else pipeRuns.push(run);
    });

    if (!pipeRuns.length) {
        pipesBody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">No pipe production records found</td></tr>';
    }
    if (!septicRuns.length) {
        septicBody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">No septic assembly records found</td></tr>';
    }

    const allRuns = [...pipeRuns, ...septicRuns];
    allRuns.forEach(data => {
        productionData.push(data);
        const canDelete = user.permissions ? user.permissions.canDelete : true;
        const stage = getDerivedRunStage(data);

        const flow = getRunFlowMetrics(data);
        const producedQty = flow.producedQty;
        const movedToCuringQty = flow.movedToCuringQty;
        const waitingForCuringQty = flow.waitingForCuringQty;
        const onCuringQty = flow.onCuringQty;
        const goodQty = flow.completedGoodQty;
        const internalUseQty = flow.internalUseQty;
        const availableQty = flow.availableQty;
        const castingLocation = data.productionLocation ? `<div><span class="text-muted">Casting:</span> ${data.productionLocation}</div>` : '';
        const curingLocation = data.curingLocation ? `<div><span class="text-muted">Curing:</span> ${data.curingLocation}</div>` : '';
        const stockLocation = data.stockLocation ? `<div><span class="text-muted">Ready:</span> ${data.stockLocation} (${availableQty})</div>` : '';
        const septicLocation = data.septicLocation ? `<div><span class="text-muted">Septic:</span> ${data.septicLocation} (${internalUseQty})</div>` : '';
        const locationText = [castingLocation, curingLocation, stockLocation, septicLocation].filter(Boolean).join('') || '<span class="text-muted">-</span>';

        const stageBadgeMap = {
            Started: 'bg-secondary',
            'On Curing': 'bg-warning text-dark',
            Completed: 'bg-success'
        };
        const stageBadge = `<span class="badge ${stageBadgeMap[stage] || 'bg-secondary'}">${stage}</span>`;

        const isSepticAssembly = isSepticAssemblyRun(data);
        const sourceText = isSepticAssembly && (data.sourceProductName || data.sourceBatchId)
            ? `<div class="small text-muted">From ${data.sourceProductName || 'Pipe'} ${data.sourceBatchId ? `(${data.sourceBatchId})` : ''}</div>`
            : '';
        const productMetaParts = [data.productType, data.pipeType, data.loadClass].filter(Boolean);
        const productMeta = productMetaParts.length ? `<div class="small text-muted">${productMetaParts.join(' | ')}</div>` : '';
        const dateCell = `
            <div class="fw-semibold">${formatDate(data.date)}</div>
            <div class="small text-muted">${data.batchId || '-'}</div>
        `;
        const qtyCell = isSepticAssembly
            ? `
                <div class="small"><span class="fw-semibold">Assembled:</span> ${producedQty}</div>
                <div class="small"><span class="fw-semibold text-success">Completed:</span> ${goodQty}</div>
                <div class="small"><span class="fw-semibold text-primary">Available:</span> ${availableQty}</div>
            `
            : `
                <div class="small"><span class="fw-semibold">Produced:</span> ${producedQty}</div>
                <div class="small"><span class="fw-semibold text-warning">On Curing:</span> ${onCuringQty}</div>
                <div class="small"><span class="fw-semibold text-success">Completed Curing:</span> ${goodQty}</div>
                ${waitingForCuringQty > 0 ? `<div class="small"><span class="fw-semibold text-danger">Waiting Curing:</span> ${waitingForCuringQty}</div>` : ''}
                <div class="small"><span class="fw-semibold text-primary">Available:</span> ${availableQty}</div>
                ${internalUseQty > 0 ? `<div class="small"><span class="fw-semibold text-info">Septic:</span> ${internalUseQty}</div>` : ''}
            `;
        const stageHint = isSepticAssembly
            ? '<div class="small text-muted mt-1">Septic assembly from cured RCC stock</div>'
            : '<div class="small text-muted mt-1">Workflow timeline shown below</div>';

        const primaryActionParts = [];
        if (waitingForCuringQty > 0) {
            primaryActionParts.push(`<button class="btn btn-sm btn-warning w-100 mb-1" onclick="window.startCuring('${data.id}')"><i class="fas fa-hourglass-start me-1"></i>${movedToCuringQty > 0 ? 'Move Remaining To Curing' : 'Move To Curing'}</button>`);
        }
        if (onCuringQty > 0) {
            primaryActionParts.push(`<button class="btn btn-sm btn-success w-100 mb-1" onclick="window.completeCuring('${data.id}')"><i class="fas fa-check-circle me-1"></i>Complete Curing</button>`);
        }
        if (!isSepticAssembly && goodQty > 0) {
            primaryActionParts.push(`<button class="btn btn-sm btn-outline-secondary w-100 mb-1" onclick="window.allocateSeptic('${data.id}')"><i class="fas fa-sitemap me-1"></i>Allocate Septic</button>`);
        }
        const primaryAction = primaryActionParts.length
            ? `<div class="production-primary-actions d-grid gap-1">${primaryActionParts.join('')}</div>`
            : '<span class="text-muted small">No pending action</span>';

        const secondaryActions = `
            <div class="production-secondary-actions d-grid gap-1">
                <button class="btn btn-sm btn-outline-dark" onclick="window.recordDailyLabour('${data.id}')"><i class="fas fa-money-bill-wave me-1"></i>Record Labour</button>
                <div class="production-inline-actions d-flex gap-1">
                    <button class="btn btn-sm btn-outline-primary flex-fill" onclick="window.editProductionRun('${data.id}')">Edit</button>
                    ${canDelete ? `<button class="btn btn-sm btn-outline-danger" onclick="window.deleteProductionRun('${data.id}')"><i class="fas fa-trash"></i></button>` : ''}
                </div>
            </div>
        `;

        const mainRow = `
            <tr>
                <td>${dateCell}</td>
                <td class="fw-bold text-primary">${data.finishedGoodName || '-'}${productMeta}${sourceText}</td>
                <td>${qtyCell}</td>
                <td>${stageBadge}${stageHint}</td>
                <td class="small">${locationText}</td>
                <td class="production-action-cell">
                    ${primaryAction}
                    ${secondaryActions}
                </td>
            </tr>
        `;
        const workflowRow = !isSepticAssembly ? renderWorkflowRow(data, flow, stage) : '';
        const row = `${mainRow}${workflowRow}`;
        if (isSepticAssembly) {
            septicBody.innerHTML += row;
        } else {
            pipesBody.innerHTML += row;
        }
    });
}

function toJsDate(value) {
    if (!value) return null;
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
    if (typeof value?.toDate === 'function') {
        const dt = value.toDate();
        return Number.isNaN(dt.getTime()) ? null : dt;
    }
    const dt = new Date(value);
    return Number.isNaN(dt.getTime()) ? null : dt;
}

function formatDateTimeShort(value) {
    const dt = toJsDate(value);
    if (!dt) return '-';
    const time = dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return `${formatDate(dt)} ${time}`;
}

function getWorkflowProgress(flow, stage) {
    const producedQty = Math.max(0, Number(flow?.producedQty || 0));
    const movedToCuringQty = Math.max(0, Number(flow?.movedToCuringQty || 0));
    const goodQty = Math.max(0, Number(flow?.completedGoodQty || 0));
    const waitingForCuringQty = Math.max(0, Number(flow?.waitingForCuringQty || 0));
    const onCuringQty = Math.max(0, Number(flow?.onCuringQty || 0));

    if (producedQty <= 0) return 0;

    const movedRatio = producedQty > 0 ? Math.min(1, movedToCuringQty / producedQty) : 0;
    const readyRatio = movedToCuringQty > 0 ? Math.min(1, goodQty / movedToCuringQty) : 0;
    let progress = 20 + (40 * movedRatio) + (40 * readyRatio);

    if (stage === 'Completed' && waitingForCuringQty <= 0 && onCuringQty <= 0 && movedToCuringQty > 0) {
        progress = 100;
    }
    return Math.max(0, Math.min(100, Math.round(progress)));
}

function renderWorkflowRow(run, flow, stage) {
    const progress = getWorkflowProgress(flow, stage);
    const producedQty = Math.max(0, Number(flow?.producedQty || 0));
    const movedToCuringQty = Math.max(0, Number(flow?.movedToCuringQty || 0));
    const onCuringQty = Math.max(0, Number(flow?.onCuringQty || 0));
    const goodQty = Math.max(0, Number(flow?.completedGoodQty || 0));
    const availableQty = Math.max(0, Number(flow?.availableQty || 0));

    const startedDone = producedQty > 0;
    const curingDone = movedToCuringQty > 0;
    const readyDone = stage === 'Completed' || (onCuringQty <= 0 && goodQty > 0 && movedToCuringQty > 0);
    const currentKey = readyDone ? 'ready' : (curingDone ? 'curing' : 'started');
    const stepClass = (key, done) => done ? 'is-done' : (currentKey === key ? 'is-current' : 'is-pending');

    const startedAt = formatDateTimeShort(run.date || run.createdAt);
    const curingAt = formatDateTimeShort(run.curingStart);
    const readyAt = formatDateTimeShort(run.completedAt);

    return `
        <tr class="production-workflow-row">
            <td colspan="6">
                <div class="run-workflow-wrap">
                    <div class="run-workflow-head">
                        <span class="run-workflow-title"><i class="fas fa-diagram-project me-1"></i>Workflow Progress</span>
                        <span class="run-workflow-percent">${progress}%</span>
                    </div>
                    <div class="run-workflow-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${progress}" aria-label="Production workflow progress">
                        <span class="run-workflow-fill" style="width:${progress}%"></span>
                    </div>
                    <div class="run-workflow-steps">
                        <div class="workflow-step ${stepClass('started', startedDone)}">
                            <div class="workflow-step-label">Started</div>
                            <div class="workflow-step-meta">Produced: ${producedQty.toLocaleString()}</div>
                        </div>
                        <div class="workflow-step ${stepClass('curing', curingDone)}">
                            <div class="workflow-step-label">On Curing</div>
                            <div class="workflow-step-meta">Moved: ${movedToCuringQty.toLocaleString()} | Active: ${onCuringQty.toLocaleString()}</div>
                        </div>
                        <div class="workflow-step ${stepClass('ready', readyDone)}">
                            <div class="workflow-step-label">Ready Stock</div>
                            <div class="workflow-step-meta">Completed: ${goodQty.toLocaleString()} | Available: ${availableQty.toLocaleString()}</div>
                        </div>
                    </div>
                    <div class="run-status-timeline">
                        <span class="timeline-chip ${startedDone ? 'is-done' : 'is-pending'}"><strong>Started:</strong> ${startedAt}</span>
                        <span class="timeline-chip ${curingDone ? 'is-done' : 'is-pending'}"><strong>On Curing:</strong> ${curingAt}</span>
                        <span class="timeline-chip ${readyDone ? 'is-done' : 'is-pending'}"><strong>Ready:</strong> ${readyAt}</span>
                    </div>
                </div>
            </td>
        </tr>
    `;
}

function getProductionExportRows() {
    return productionData.map(run => {
        const materialsList = (run.ingredients || []).map(i => `${i.name} (${i.quantity} ${i.unit || ''})`).join(', ');
        const producedQty = Number(run.quantityProduced || 0);
        const flow = getRunFlowMetrics(run);
        const goodQty = flow.completedGoodQty;
        const internalUseQty = flow.internalUseQty;
        const availableQty = flow.availableQty;
        return [
            formatDate(run.date),
            run.finishedGoodName || '',
            producedQty,
            getDerivedRunStage(run),
            goodQty,
            internalUseQty,
            availableQty,
            materialsList,
            run.mouldsUsed || ''
        ];
    });
}

function exportProductionCSV() {
    if (!productionData.length) {
        alert('No production data to export.');
        return;
    }

    const headers = ['Date', 'Finished Good', 'Qty Produced', 'Stage', 'Good Qty', 'Septic Allocation', 'Available Qty', 'Materials Used', 'Moulds Used'];
    const rows = getProductionExportRows();
    const filename = `production_${new Date().toISOString().split('T')[0]}.csv`;
    downloadCSV(filename, headers, rows);
}

function exportProductionPDF() {
    if (!productionData.length) {
        alert('No production data to export.');
        return;
    }

    const headers = ['Date', 'Finished Good', 'Qty Produced', 'Stage', 'Good Qty', 'Septic Allocation', 'Available Qty', 'Materials Used', 'Moulds Used'];
    const rows = getProductionExportRows();
    const filename = `production_${new Date().toISOString().split('T')[0]}.pdf`;
    downloadPDF(filename, 'Production Report', headers, rows);
}

function updateCuringStats(docs) {
    const container = document.getElementById('curingStatsContainer');
    if (!container) return;

    let inProduction = 0;
    let inCuring = 0;
    let completed = 0;
    let readyToFinish = 0;
    let septicAllocated = 0;
    let availableQty = 0;
    const today = new Date();

    docs.forEach(doc => {
        const data = doc.data();
        if (isSepticAssemblyRun(data)) {
            return;
        }
        const status = getDerivedRunStage(data);
        const flow = getRunFlowMetrics(data);
        if (status === 'Started') inProduction++;
        if (status === 'Completed') completed++;
        if (status === 'On Curing') {
            inCuring++;
        }
        septicAllocated += flow.internalUseQty;
        availableQty += flow.availableQty;
    });

    const setText = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.textContent = value.toLocaleString();
    };

    setText('prodInProductionCount', inProduction);
    setText('prodCuringCount', inCuring);
    setText('prodCompletedCount', completed);
    setText('prodSepticAllocated', septicAllocated);
    setText('prodAvailableQty', availableQty);
    setText('prodStartedCount', inProduction);
    setText('prodOnCuringCount', inCuring);
    setText('prodReadyCount', completed);
    setText('dashProdStarted', inProduction);
    setText('dashProdCuring', inCuring);
    setText('dashProdReady', completed);
    setText('dashProdAvailable', availableQty);

    container.innerHTML = `
        <div class="col-12">
            <div class="alert alert-light border shadow-sm d-flex justify-content-between align-items-center">
                <div>
                    <i class="fas fa-layer-group fa-lg me-2 text-primary"></i>
                    <strong>Green Stock (Curing):</strong> ${inCuring} batches in process.
                </div>
                ${readyToFinish > 0 ? `<span class="badge bg-success p-2 pulse-animation">Action Required: ${readyToFinish} Ready for Stock</span>` : '<span class="text-muted small">No batches ready yet</span>'}
            </div>
        </div>
    `;
}

async function loadProductionMasters(businessId) {
    try {
        const [moldSnap, locationSnap, productSnap] = await Promise.all([
            db.collection('users').doc(businessId).collection('mold_master').orderBy('moldId').get(),
            db.collection('users').doc(businessId).collection('location_master').orderBy('name').get(),
            db.collection('users').doc(businessId).collection('product_master').orderBy('name').get()
        ]);

        moldMasterItems = moldSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        locationMasterItems = locationSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        productMasterItems = productSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        populateMoldSelect();
        populateLocationSelects();
        populateProductMasterSelect();
        populateSepticAllocationLocations();
        populateSepticProductSelect();
    } catch (error) {
        console.error('Load Production Masters Error', error);
        showAlert('danger', 'Failed to load production masters');
    }
}

function populateMoldSelect() {
    if (!prodMoldSelect) return;
    if (moldMasterItems.length === 0) {
        prodMoldSelect.innerHTML = '<option value="">No molds added</option>';
        return;
    }
    prodMoldSelect.innerHTML = '<option value="">Select Mold...</option>';
    moldMasterItems.forEach(m => {
        const status = (m.status || 'Available').trim();
        const option = document.createElement('option');
        option.value = m.id;
        option.textContent = `${m.moldId || 'Mold'}${status ? ` (${status})` : ''}`;
        option.dataset.moldNumber = m.moldId || '';
        if (status.toLowerCase() !== 'available') {
            option.disabled = true;
        }
        prodMoldSelect.appendChild(option);
    });
}

function populateLocationSelects() {
    if (locationMasterItems.length === 0) {
        if (prodCastingLocationSelect) prodCastingLocationSelect.innerHTML = '<option value="">No locations added</option>';
        if (curingToLocationSelect) curingToLocationSelect.innerHTML = '<option value="">No locations added</option>';
        if (completeReadyLocationSelect) completeReadyLocationSelect.innerHTML = '<option value="">No locations added</option>';
        return;
    }
    const options = locationMasterItems.map(loc => {
        const option = document.createElement('option');
        option.value = loc.id;
        const locationType = normalizeLocationType(loc.type);
        option.textContent = `${loc.name || 'Location'}${locationType ? ` (${locationType})` : ''}`;
        option.dataset.locationName = loc.name || '';
        return option;
    });

    const applyOptions = (select) => {
        if (!select) return;
        select.innerHTML = '<option value="">Select Location...</option>';
        options.forEach(opt => select.appendChild(opt.cloneNode(true)));
    };

    applyOptions(prodCastingLocationSelect);
    applyOptions(curingToLocationSelect);
    applyOptions(completeReadyLocationSelect);
}

function populateProductMasterSelect() {
    if (!prodProductMasterSelect) return;
    if (productMasterItems.length === 0) {
        prodProductMasterSelect.innerHTML = '<option value="">No product masters added</option>';
        return;
    }
    prodProductMasterSelect.innerHTML = '<option value="">Select Product Master...</option>';
    productMasterItems.forEach(p => {
        const name = p.name || p.productName || 'Product';
        const category = p.category || p.productCategory || '';
        const option = document.createElement('option');
        option.value = p.id;
        option.textContent = category ? `${name} (${category})` : name;
        prodProductMasterSelect.appendChild(option);
    });
}

function populateSepticAllocationLocations() {
    if (!septicAllocationLocationSelect) return;
    if (locationMasterItems.length === 0) {
        septicAllocationLocationSelect.innerHTML = '<option value="">No locations added</option>';
        return;
    }
    septicAllocationLocationSelect.innerHTML = '<option value="">Select Location...</option>';
    locationMasterItems.forEach(loc => {
        const option = document.createElement('option');
        option.value = loc.id;
        const locationType = normalizeLocationType(loc.type);
        option.textContent = `${loc.name || 'Location'}${locationType ? ` (${locationType})` : ''}`;
        option.dataset.locationName = loc.name || '';
        septicAllocationLocationSelect.appendChild(option);
    });
}

function populateSepticProductSelect() {
    if (!septicAllocationProductSelect) return;
    const septicProducts = productMasterItems.filter(p => ((p.category || p.productCategory || '').toLowerCase().includes('septic')));
    if (septicProducts.length === 0) {
        septicAllocationProductSelect.innerHTML = '<option value="">No septic products added</option>';
        return;
    }
    septicAllocationProductSelect.innerHTML = '<option value="">Select Septic Product...</option>';
    septicProducts.forEach(p => {
        const option = document.createElement('option');
        option.value = p.id;
        option.textContent = p.name || 'Septic Product';
        septicAllocationProductSelect.appendChild(option);
    });
}

function applyProductMasterSelection() {
    if (!prodProductMasterSelect) return;
    const id = prodProductMasterSelect.value;
    if (!id) {
        if (productDetailsDiv) productDetailsDiv.textContent = '';
        dailyLabourMode = false;
        if (dailyLabourPlanner) dailyLabourPlanner.classList.add('d-none');
        if (regenDailyLabourBtn) regenDailyLabourBtn.classList.add('d-none');
        if (dailyLabourRows) dailyLabourRows.innerHTML = '';
        if (dailyLabourTotal) dailyLabourTotal.textContent = '₹0.00';
        if (labourCostInput) {
            labourCostInput.readOnly = false;
            labourCostInput.classList.remove('bg-light');
            labourCostInput.value = '0';
        }
        return;
    }
    const p = productMasterItems.find(item => item.id === id);
    if (!p) return;

    const name = p.name || p.productName || '';
    const category = p.category || p.productCategory || '';
    const pipeType = p.pipeType || '';
    const loadClass = p.loadClass || '';
    const detailParts = [category, pipeType, loadClass].filter(Boolean);

    if (name && productDetailsDiv) {
        productDetailsDiv.textContent = detailParts.length ? `Master: ${name} | ${detailParts.join(' | ')}` : `Master: ${name}`;
    }

    syncDailyLabourPlannerFromProduct(p);
}

function formatDateInput(dateObj) {
    const d = new Date(dateObj);
    d.setHours(0, 0, 0, 0);
    return d.toISOString().split('T')[0];
}

function getProductionBaseDate() {
    const dateVal = document.getElementById('productionDate')?.value;
    if (dateVal) return new Date(dateVal);
    return new Date();
}

function getDailyLabourEntries() {
    if (!dailyLabourRows) return [];
    const rows = Array.from(dailyLabourRows.querySelectorAll('tr'));
    return rows.map(row => {
        const date = row.querySelector('.daily-labour-date')?.value || '';
        const quantity = parseFloat(row.querySelector('.daily-labour-qty')?.value || '0') || 0;
        const rate = parseFloat(row.querySelector('.daily-labour-rate')?.value || '0') || 0;
        const amount = parseFloat(row.querySelector('.daily-labour-amount')?.value || '0') || 0;
        return { date, quantity, rate, amount };
    }).filter(entry => entry.date || entry.quantity || entry.rate || entry.amount);
}

function normalizeLabourDate(value) {
    if (!value) return '';
    if (typeof value === 'string') {
        const parsed = new Date(value);
        if (!Number.isNaN(parsed.getTime())) return formatDateInput(parsed);
        return value;
    }
    const dateObj = value?.toDate ? value.toDate() : new Date(value);
    if (Number.isNaN(dateObj.getTime())) return '';
    return formatDateInput(dateObj);
}

function addDailyLabourWorkerRow(prefill = {}) {
    if (!dailyLabourWorkerRows) return;
    const name = (prefill.name || '').toString().replace(/"/g, '&quot;');
    const qty = parseFloat(prefill.quantity || 0) || 0;
    const rate = parseFloat(prefill.rate || 0) || 0;
    dailyLabourWorkerRows.insertAdjacentHTML('beforeend', `
        <tr>
            <td><input type="text" class="form-control form-control-sm daily-worker-name" placeholder="Labour name" value="${name}"></td>
            <td><input type="number" class="form-control form-control-sm daily-worker-qty" min="0" step="0.01" value="${qty}"></td>
            <td><input type="number" class="form-control form-control-sm daily-worker-rate" min="0" step="0.01" value="${rate}"></td>
            <td><input type="number" class="form-control form-control-sm daily-worker-amount" readonly value="0.00"></td>
            <td class="text-center"><button type="button" class="btn btn-sm btn-outline-danger remove-daily-worker-btn"><i class="fas fa-times"></i></button></td>
        </tr>
    `);
}

function getDailyLabourWorkers() {
    if (!dailyLabourWorkerRows) return [];
    return Array.from(dailyLabourWorkerRows.querySelectorAll('tr')).map(row => {
        const name = (row.querySelector('.daily-worker-name')?.value || '').trim();
        const quantity = parseFloat(row.querySelector('.daily-worker-qty')?.value || '0') || 0;
        const rate = parseFloat(row.querySelector('.daily-worker-rate')?.value || '0') || 0;
        const amount = quantity * rate;
        return { name, quantity, rate, amount };
    }).filter(w => w.name || w.quantity || w.rate || w.amount);
}

function recalcDailyLabourModalAmount() {
    let total = 0;
    if (dailyLabourWorkerRows) {
        dailyLabourWorkerRows.querySelectorAll('tr').forEach(row => {
            const qty = parseFloat(row.querySelector('.daily-worker-qty')?.value || '0') || 0;
            const rate = parseFloat(row.querySelector('.daily-worker-rate')?.value || '0') || 0;
            const amount = qty * rate;
            const amountInput = row.querySelector('.daily-worker-amount');
            if (amountInput) amountInput.value = amount.toFixed(2);
            total += amount;
        });
    }
    if (dailyLabourAmountInput) dailyLabourAmountInput.value = total.toFixed(2);
}

async function saveDailyLabourEntry() {
    if (!currentLabourRunId) return;
    const dateVal = dailyLabourDateInput?.value || '';
    const workers = getDailyLabourWorkers();
    const amount = workers.reduce((sum, w) => sum + (parseFloat(w.amount || 0) || 0), 0);
    const notes = (dailyLabourNotesInput?.value || '').trim();

    if (!dateVal) {
        return showAlert('danger', 'Select labour date');
    }
    if (!workers.length) {
        return showAlert('danger', 'Add at least one labour entry');
    }

    const user = JSON.parse(localStorage.getItem('user'));
    const businessId = user?.businessId || user?.uid;
    if (!businessId) return;

    try {
        const payableSnap = await db.collection('users').doc(businessId)
            .collection('labour_payables')
            .where('runId', '==', currentLabourRunId)
            .get();
        const locked = payableSnap.docs.some(doc => {
            const status = (doc.data()?.status || '').toLowerCase();
            return status === 'paid' || status === 'partial';
        });
        if (locked) {
            return showAlert('danger', 'This run has paid labour entries. Reverse payments before editing daily labour.');
        }
    } catch (lockErr) {
        console.warn('Labour payable lock check failed', lockErr);
    }

    try {
        await db.runTransaction(async (transaction) => {
            const runRef = db.collection('users').doc(businessId).collection('production_runs').doc(currentLabourRunId);
            const runDoc = await transaction.get(runRef);
            if (!runDoc.exists) throw new Error('Production run not found');
            const runData = runDoc.data();
            const existingEntries = Array.isArray(runData.dailyLabourEntries) ? runData.dailyLabourEntries : [];
            const normalizedEntries = existingEntries.map(e => ({
                date: normalizeLabourDate(e?.date),
                labourers: Array.isArray(e?.labourers) ? e.labourers.map(w => ({
                    name: (w?.name || '').toString(),
                    quantity: parseFloat(w?.quantity || 0) || 0,
                    rate: parseFloat(w?.rate || 0) || 0,
                    amount: parseFloat(w?.amount || 0) || 0
                })) : [],
                quantity: parseFloat(e?.quantity || 0) || 0,
                rate: parseFloat(e?.rate || 0) || 0,
                amount: parseFloat(e?.amount || 0) || 0,
                notes: e?.notes || ''
            })).filter(e => e.date);

            const idx = normalizedEntries.findIndex(e => e.date === dateVal);
            const totalQty = workers.reduce((sum, w) => sum + (parseFloat(w.quantity || 0) || 0), 0);
            const weightedRate = totalQty > 0 ? amount / totalQty : 0;
            const newEntry = {
                date: dateVal,
                labourers: workers,
                quantity: totalQty,
                rate: weightedRate,
                amount,
                notes
            };
            if (idx >= 0) normalizedEntries[idx] = newEntry;
            else normalizedEntries.push(newEntry);

            normalizedEntries.sort((a, b) => a.date.localeCompare(b.date));
            const totalLabour = normalizedEntries.reduce((sum, e) => sum + (parseFloat(e.amount || 0) || 0), 0);

            transaction.update(runRef, {
                dailyLabourEntries: normalizedEntries,
                labourCost: totalLabour,
                labourCostMode: 'daily_7',
                updatedAt: new Date()
            });
        });

        if (dailyLabourModal) {
            const modal = bootstrap.Modal.getInstance(dailyLabourModal);
            if (modal) modal.hide();
        }
        currentLabourRunId = null;
        showAlert('success', 'Daily labour saved');
        loadProductionHistory();
    } catch (error) {
        console.error('Daily Labour Save Error', error);
        showAlert('danger', error.message || 'Failed to save daily labour');
    }
}

function recalculateDailyLabourTotals() {
    if (!dailyLabourRows) return;
    let total = 0;
    dailyLabourRows.querySelectorAll('tr').forEach(row => {
        const qty = parseFloat(row.querySelector('.daily-labour-qty')?.value || '0') || 0;
        const rate = parseFloat(row.querySelector('.daily-labour-rate')?.value || '0') || 0;
        const amount = qty * rate;
        const amountInput = row.querySelector('.daily-labour-amount');
        if (amountInput) amountInput.value = amount.toFixed(2);
        total += amount;
    });
    if (dailyLabourTotal) dailyLabourTotal.textContent = `₹${total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    if (labourCostInput) labourCostInput.value = total.toFixed(2);
    calculateCost();
}

function regenerateDailyLabourRows(keepValues) {
    if (!dailyLabourRows) return;
    const previous = keepValues ? getDailyLabourEntries() : [];
    const base = getProductionBaseDate();
    const days = 7;
    dailyLabourRows.innerHTML = '';
    for (let i = 0; i < days; i++) {
        const day = new Date(base);
        day.setDate(day.getDate() + i);
        const prev = previous[i] || {};
        const dateVal = prev.date || formatDateInput(day);
        const qtyVal = prev.quantity ?? '';
        const rateVal = prev.rate ?? '';
        dailyLabourRows.insertAdjacentHTML('beforeend', `
            <tr>
                <td><input type="date" class="form-control form-control-sm daily-labour-date" value="${dateVal}"></td>
                <td><input type="number" class="form-control form-control-sm daily-labour-qty" min="0" step="0.01" value="${qtyVal}"></td>
                <td><input type="number" class="form-control form-control-sm daily-labour-rate" min="0" step="0.01" value="${rateVal}"></td>
                <td><input type="number" class="form-control form-control-sm daily-labour-amount" readonly value="0.00"></td>
            </tr>
        `);
    }
    recalculateDailyLabourTotals();
}

function syncDailyLabourPlannerFromProduct(productMaster = null) {
    const selected = productMaster || productMasterItems.find(p => p.id === (prodProductMasterSelect?.value || ''));
    const curingDays = Number(selected?.standardCuringDays || 0);
    const enableDaily = curingDays === 7;
    dailyLabourMode = enableDaily;
    if (dailyLabourPlanner) dailyLabourPlanner.classList.toggle('d-none', !enableDaily);
    if (regenDailyLabourBtn) regenDailyLabourBtn.classList.toggle('d-none', !enableDaily);
    if (labourCostInput) {
        labourCostInput.readOnly = enableDaily;
        labourCostInput.classList.toggle('bg-light', enableDaily);
    }
    if (enableDaily) {
        regenerateDailyLabourRows(true);
    } else if (dailyLabourRows) {
        dailyLabourRows.innerHTML = '';
        if (dailyLabourTotal) dailyLabourTotal.textContent = '₹0.00';
    }
}

function loadDailyLabourEntriesFromRun(run) {
    const entries = Array.isArray(run?.dailyLabourEntries) ? run.dailyLabourEntries : [];
    const labourMode = run?.labourCostMode || (entries.length ? 'daily_7' : 'flat');
    if (labourMode !== 'daily_7') {
        dailyLabourMode = false;
        if (dailyLabourPlanner) dailyLabourPlanner.classList.add('d-none');
        if (regenDailyLabourBtn) regenDailyLabourBtn.classList.add('d-none');
        if (dailyLabourRows) dailyLabourRows.innerHTML = '';
        if (dailyLabourTotal) dailyLabourTotal.textContent = '₹0.00';
        if (labourCostInput) {
            labourCostInput.readOnly = false;
            labourCostInput.classList.remove('bg-light');
        }
        return;
    }
    if (!entries.length) {
        regenerateDailyLabourRows(false);
        return;
    }
    dailyLabourMode = true;
    if (dailyLabourPlanner) dailyLabourPlanner.classList.remove('d-none');
    if (regenDailyLabourBtn) regenDailyLabourBtn.classList.remove('d-none');
    if (labourCostInput) {
        labourCostInput.readOnly = true;
        labourCostInput.classList.add('bg-light');
    }
    if (dailyLabourRows) {
        dailyLabourRows.innerHTML = '';
        entries.forEach(entry => {
            const dateVal = entry?.date ? formatDateInput(entry.date?.toDate ? entry.date.toDate() : entry.date) : formatDateInput(new Date());
            const qtyVal = parseFloat(entry?.quantity || 0) || 0;
            const rateVal = parseFloat(entry?.rate || 0) || 0;
            dailyLabourRows.insertAdjacentHTML('beforeend', `
                <tr>
                    <td><input type="date" class="form-control form-control-sm daily-labour-date" value="${dateVal}"></td>
                    <td><input type="number" class="form-control form-control-sm daily-labour-qty" min="0" step="0.01" value="${qtyVal}"></td>
                    <td><input type="number" class="form-control form-control-sm daily-labour-rate" min="0" step="0.01" value="${rateVal}"></td>
                    <td><input type="number" class="form-control form-control-sm daily-labour-amount" readonly value="0.00"></td>
                </tr>
            `);
        });
    }
    recalculateDailyLabourTotals();
}

async function openProductionModal() {
    const user = JSON.parse(localStorage.getItem('user'));
    const businessId = user.businessId || user.uid;
    
    // Load Inventory for Dropdowns
    try {
        await loadProductionMasters(businessId);
        const snapshot = await db.collection('users').doc(businessId).collection('inventory').get();
        inventoryItems = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        // Reset Form
        document.getElementById('productionForm').reset();
        if (prodMoldSelect) prodMoldSelect.disabled = false;
        if (prodProductMasterSelect) prodProductMasterSelect.value = '';
        if (prodProductMasterSelect) prodProductMasterSelect.disabled = false;
        const brokenInput = document.getElementById('brokenQuantity');
        if (brokenInput) brokenInput.value = '0';
        const wastageInput = document.getElementById('wastageQuantity');
        if (wastageInput) wastageInput.value = '0';
        if (labourCostInput) {
            labourCostInput.readOnly = false;
            labourCostInput.classList.remove('bg-light');
            labourCostInput.value = '0';
        }
        if (powerCostInput) powerCostInput.value = '0';
        if (dailyLabourRows) dailyLabourRows.innerHTML = '';
        if (dailyLabourTotal) dailyLabourTotal.textContent = '₹0.00';
        dailyLabourMode = false;
        if (dailyLabourPlanner) dailyLabourPlanner.classList.add('d-none');
        if (regenDailyLabourBtn) regenDailyLabourBtn.classList.add('d-none');
        currentEditId = null;
        ingredientsContainer.innerHTML = '';
        if (estimatedCostElement) estimatedCostElement.textContent = '₹0.00';
        document.getElementById('productionDate').valueAsDate = new Date();
        if (productDetailsDiv) productDetailsDiv.textContent = '';
        if (stockStatusBadge) {
            stockStatusBadge.className = 'badge bg-secondary';
            stockStatusBadge.textContent = 'Status: Pending';
        }
        addIngredientRow(); // Add one empty row by default
        syncDailyLabourPlannerFromProduct();
        new bootstrap.Modal(productionModal).show();
    } catch (error) {
        console.error("Error fetching inventory", error);
        showAlert('danger', 'Failed to load inventory data');
    }
}

function addIngredientRow(preSelectedId = null, preQty = null) {
    const rowId = Date.now();
    // Filter for valid raw materials/ingredients
    const validCategories = ['Raw Materials', 'Cement', 'Sand', 'Dust', 'Aggregate', 'Steel', 'Fly Ash', 'Admixtures', 'Chemicals'];
    const rawMaterials = inventoryItems.filter(i => validCategories.includes(i.category));
    
    // Sort by category then name
    rawMaterials.sort((a, b) => {
        if (a.category !== b.category) return a.category.localeCompare(b.category);
        return a.name.localeCompare(b.name);
    });
    
    const options = rawMaterials.map(item => 
        `<option value="${item.id}" data-unit="${item.unit}">${item.name} [${item.category}] (Avail: ${item.quantity} ${item.unit})</option>`
    ).join('');

    const html = `
        <div class="row g-2 mb-2 align-items-end ingredient-row" id="row-${rowId}">
            <div class="col-md-6">
                <label class="form-label small">Raw Material</label>
                <select class="form-select form-select-sm ingredient-select" required>
                    <option value="">Select Material...</option>
                    ${options}
                </select>
            </div>
            <div class="col-md-4">
                <label class="form-label small">Quantity Used</label>
                <input type="number" class="form-control form-control-sm ingredient-qty" placeholder="Qty" min="0" step="0.01" required value="${preQty || ''}">
            </div>
            <div class="col-md-2">
                <button type="button" class="btn btn-outline-danger btn-sm w-100 remove-ingredient-btn">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        </div>
    `;
    
    ingredientsContainer.insertAdjacentHTML('beforeend', html);

    if (preSelectedId) {
        const newRow = document.getElementById(`row-${rowId}`);
        if (newRow) newRow.querySelector('.ingredient-select').value = preSelectedId;
    }
    calculateCost();
}

async function ensureFinishedGoodInventory(businessId, productMaster) {
    if (!productMaster || !productMaster.name) {
        throw new Error('Product Master is required.');
    }
    const rawCategory = (productMaster.category || productMaster.productCategory || '').toLowerCase();
    const invCategory = rawCategory.includes('septic')
        ? 'Septic Tank'
        : rawCategory.includes('water tank')
            ? 'Water Tank'
            : 'RCC Pipe';
    const userRef = db.collection('users').doc(businessId);
    const categoryAliases = {
        'RCC Pipe': ['RCC Pipe', 'RCC Pipes'],
        'Septic Tank': ['Septic Tank', 'Septic Tank Product', 'Septic Tank Products'],
        'Water Tank': ['Water Tank', 'Water Tank Products']
    };
    const allowedCategories = categoryAliases[invCategory] || [invCategory];
    const existingByNameSnap = await userRef.collection('inventory')
        .where('name', '==', productMaster.name)
        .limit(10)
        .get();
    const existingDoc = existingByNameSnap.docs.find(doc => {
        const cat = (doc.data().category || '').trim();
        return allowedCategories.includes(cat);
    });

    if (existingDoc) {
        const existingData = existingDoc.data();
        const imageUrl = productMaster.imageUrl || '';
        const hsn = productMaster.hsn || '';
        const gstRate = productMaster.gstRate ?? existingData.gstRate ?? 0;
        const updates = {};
        if (imageUrl && existingData.imageUrl !== imageUrl) updates.imageUrl = imageUrl;
        if (hsn && existingData.hsn !== hsn) updates.hsn = hsn;
        if (gstRate !== undefined && existingData.gstRate !== gstRate) updates.gstRate = gstRate;
        if ((existingData.category || '') !== invCategory) updates.category = invCategory;
        if (Object.keys(updates).length) {
            updates.updatedAt = new Date();
            await existingDoc.ref.update(updates);
        }
        return existingDoc.id;
    }

    const docRef = userRef.collection('inventory').doc();
    await docRef.set({
        name: productMaster.name,
        category: invCategory,
        unit: productMaster.unit || 'Nos',
        quantity: 0,
        reorderLevel: 0,
        costPrice: parseFloat(productMaster.costPrice || 0) || 0,
        sellingPrice: parseFloat(productMaster.sellingPrice || 0) || 0,
        hsn: productMaster.hsn || '',
        gstRate: productMaster.gstRate ?? 0,
        imageUrl: productMaster.imageUrl || '',
        source: 'product_master',
        createdAt: new Date()
    });
    return docRef.id;
}

async function saveSepticAllocation() {
    if (!currentSepticRunId) return;
    const qty = parseFloat(septicAllocationQtyInput?.value || '0');
    if (isNaN(qty) || qty < 0) {
        return showAlert('danger', 'Invalid quantity');
    }
    const septicProductId = septicAllocationProductSelect?.value || '';
    if (!septicProductId) {
        return showAlert('danger', 'Select a septic product');
    }
    const user = JSON.parse(localStorage.getItem('user'));
    const businessId = user.businessId || user.uid;
    const locId = septicAllocationLocationSelect?.value || null;
    const locName = septicAllocationLocationSelect?.selectedOptions?.[0]?.dataset.locationName || null;
    try {
        const septicProduct = productMasterItems.find(p => p.id === septicProductId);
        if (!septicProduct) {
            throw new Error('Septic product not found');
        }
        const septicFgId = await ensureFinishedGoodInventory(businessId, septicProduct);

        await db.runTransaction(async (transaction) => {
            const runRef = db.collection('users').doc(businessId).collection('production_runs').doc(currentSepticRunId);
            const runDoc = await transaction.get(runRef);
            if (!runDoc.exists) throw new Error('Production run not found');
            const data = runDoc.data();
            const goodQty = Number(data.goodQty || ((data.status || '') === 'Completed' ? Math.max(0, Number(data.quantityProduced || 0) - Number(data.rejectedQuantity || data.brokenQuantity || 0)) : 0));
            if (goodQty <= 0) throw new Error('No completed curing quantity available for allocation');
            if (qty > goodQty) {
                throw new Error('Allocation exceeds good quantity');
            }

            const previousQty = Number(data.internalUseQty || 0);
            const delta = qty - previousQty;

            const fgRef = db.collection('users').doc(businessId).collection('inventory').doc(data.finishedGoodId);
            const septicFgRef = db.collection('users').doc(businessId).collection('inventory').doc(septicFgId);

            let fgDoc = null;
            let septicFgDoc = null;
            if (delta !== 0) {
                fgDoc = await transaction.get(fgRef);
                if (!fgDoc.exists) throw new Error('Finished good not found');
            }
            if (delta > 0) {
                septicFgDoc = await transaction.get(septicFgRef);
            }

            if (delta !== 0) {
                const currentQty = Number(fgDoc.data().quantity || 0);
                if (delta > 0 && currentQty < delta) {
                    throw new Error('Not enough stock to allocate');
                }
                transaction.update(fgRef, { quantity: currentQty - delta });
            }

            if (delta > 0) {
                const septicCurrentQty = septicFgDoc && septicFgDoc.exists ? Number(septicFgDoc.data().quantity || 0) : 0;
                if (septicFgDoc && septicFgDoc.exists) {
                    transaction.update(septicFgRef, { quantity: septicCurrentQty + delta });
                } else {
                    transaction.set(septicFgRef, {
                        name: septicProduct.name,
                        category: 'Septic Tank',
                        unit: septicProduct.unit || 'Nos',
                        quantity: delta,
                        reorderLevel: 0,
                        costPrice: parseFloat(septicProduct.costPrice || 0) || 0,
                        sellingPrice: parseFloat(septicProduct.sellingPrice || 0) || 0,
                        source: 'product_master',
                        createdAt: new Date()
                    });
                }

                const septicRunRef = db.collection('users').doc(businessId).collection('production_runs').doc();
                const batchId = 'SEPTIC-' + Date.now().toString().substr(-6);
                const productionDate = new Date();
                transaction.set(septicRunRef, {
                    batchId,
                    date: productionDate,
                    finishedGoodId: septicFgId,
                    finishedGoodName: septicProduct.name,
                    productType: 'Septic Tank',
                    productMasterId: septicProduct.id,
                    productMasterName: septicProduct.name,
                    quantityProduced: delta,
                    brokenQuantity: 0,
                    internalUseQty: 0,
                    status: 'Completed',
                    goodQty: delta,
                    sellableQty: delta,
                    completedAt: new Date(),
                    notes: `Allocated from ${data.finishedGoodName || 'pipe'} batch ${data.batchId || ''}`.trim(),
                    sourceRunId: currentSepticRunId,
                    sourceProductId: data.finishedGoodId,
                    sourceProductName: data.finishedGoodName || null,
                    sourceBatchId: data.batchId || null,
                    septicLocationId: locId,
                    septicLocation: locName,
                    createdAt: new Date()
                });
            }

            const sellableQty = Math.max(0, goodQty - qty);
            transaction.update(runRef, {
                internalUseQty: qty,
                septicLocationId: locId,
                septicLocation: locName,
                septicProductMasterId: septicProductId,
                septicProductMasterName: septicProduct.name,
                sellableQty
            });
        });
        bootstrap.Modal.getInstance(septicAllocationModal).hide();
        currentSepticRunId = null;
        showAlert('success', 'Septic allocation updated');
        loadProductionHistory();
    } catch (error) {
        console.error('Allocation Error', error);
        showAlert('danger', error.message || 'Failed to update allocation');
    }
}

async function saveMoveToCuring() {
    if (!currentCuringRunId) return;
    const qty = parseFloat(curingQtyInput?.value || '0');
    if (isNaN(qty) || qty <= 0) {
        return showAlert('danger', 'Enter a valid quantity');
    }
    const toLocId = curingToLocationSelect?.value || null;
    const toLocName = curingToLocationSelect?.selectedOptions?.[0]?.dataset.locationName || null;
    if (!toLocId) {
        return showAlert('danger', 'Select a curing location');
    }
    const startDate = curingStartDateInput?.value ? new Date(curingStartDateInput.value) : new Date();
    const user = JSON.parse(localStorage.getItem('user'));
    const businessId = user.businessId || user.uid;
    try {
        await db.runTransaction(async (transaction) => {
            const runRef = db.collection('users').doc(businessId).collection('production_runs').doc(currentCuringRunId);
            const runDoc = await transaction.get(runRef);
            if (!runDoc.exists) throw new Error('Production run not found');
            const run = runDoc.data();
            if (isSepticAssemblyRun(run)) throw new Error('Curing flow is not applicable for septic assembly runs');
            const producedQty = Number(run.quantityProduced || 0);
            const alreadyMovedQty = Number(run.curingQty || 0);
            const waitingQty = Math.max(0, producedQty - alreadyMovedQty);
            if (waitingQty <= 0) throw new Error('All produced quantity is already moved to curing');
            if (qty > waitingQty) throw new Error(`Curing quantity exceeds waiting quantity (${waitingQty})`);
            const nextCuringQty = alreadyMovedQty + qty;

            transaction.update(runRef, {
                status: 'On Curing',
                curingStart: startDate,
                curingFromLocation: run.productionLocation || null,
                curingLocationId: toLocId,
                curingLocation: toLocName,
                curingQty: nextCuringQty
            });

            if (run.moldId) {
                const moldRef = db.collection('users').doc(businessId).collection('mold_master').doc(run.moldId);
                transaction.update(moldRef, { status: 'Available' });
            }
        });
        bootstrap.Modal.getInstance(moveToCuringModal).hide();
        currentCuringRunId = null;
        showAlert('success', 'Moved to curing');
        loadProductionHistory();
    } catch (error) {
        console.error('Move To Curing Error', error);
        showAlert('danger', error.message || 'Failed to move to curing');
    }
}

async function saveCuringComplete() {
    if (!currentCompleteRunId) return;
    const run = productionData.find(r => r.id === currentCompleteRunId) || productionDataAll.find(r => r.id === currentCompleteRunId);
    const flow = getRunFlowMetrics(run || {});
    const passedQty = parseFloat(completePassedQtyInput?.value || '0');
    const damagedQty = parseFloat(completeDamagedQtyInput?.value || '0');
    if (isNaN(passedQty) || passedQty < 0) {
        return showAlert('danger', 'Enter a valid passed quantity');
    }
    if (passedQty > flow.onCuringQty) {
        return showAlert('danger', `Passed quantity cannot exceed on-curing quantity (${flow.onCuringQty})`);
    }
    if (isNaN(damagedQty) || damagedQty < 0) {
        return showAlert('danger', 'Enter a valid damaged quantity');
    }
    if (damagedQty > passedQty) {
        return showAlert('danger', 'Damaged quantity cannot exceed passed quantity');
    }
    const readyLocId = completeReadyLocationSelect?.value || null;
    const readyLocName = completeReadyLocationSelect?.selectedOptions?.[0]?.dataset.locationName || null;
    if (!readyLocId) {
        return showAlert('danger', 'Select a ready stock location');
    }
    const completedDate = completeDateInput?.value ? new Date(completeDateInput.value) : new Date();
    await finishCuringProcess(currentCompleteRunId, passedQty, damagedQty, readyLocId, readyLocName, completedDate);
    bootstrap.Modal.getInstance(curingCompleteModal).hide();
    currentCompleteRunId = null;
}

async function saveProductionRun() {
    const user = JSON.parse(localStorage.getItem('user'));
    const businessId = user.businessId || user.uid;
    const produceQty = parseFloat(document.getElementById('produceQuantity').value);
    const notes = document.getElementById('productionNotes').value;
    const mouldsUsed = document.getElementById('mouldsUsed')?.value || '';
    const productMasterId = prodProductMasterSelect?.value || null;
    const selectedProductMaster = productMasterItems.find(p => p.id === productMasterId) || null;
    const productMasterName = selectedProductMaster?.name || null;
    const productType = selectedProductMaster?.category || '';
    const pipeType = selectedProductMaster?.pipeType || '';
    const loadClass = selectedProductMaster?.loadClass || '';
    const size = '';
    let moldId = prodMoldSelect?.value || '';
    let moldNumber = '';
    if (moldId) {
        const moldItem = moldMasterItems.find(m => m.id === moldId);
        moldNumber = moldItem?.moldId || '';
    } else if (prodMoldSelect?.selectedOptions?.[0]) {
        moldNumber = prodMoldSelect.selectedOptions[0].dataset.moldNumber || '';
    }
    const supervisor = document.getElementById('productionSupervisor').value;
    const labourCost = parseFloat(labourCostInput?.value || '0') || 0;
    const powerCost = parseFloat(powerCostInput?.value || '0') || 0;
    const dateVal = document.getElementById('productionDate').value;
    const brokenQty = parseFloat(document.getElementById('brokenQuantity')?.value || '0') || 0;
    const wastageQty = parseFloat(document.getElementById('wastageQuantity')?.value || '0') || 0;
    const stage = 'Started';
    const internalUseQty = 0;
    const dailyLabourEntries = dailyLabourMode ? getDailyLabourEntries() : [];

    if (!productMasterId || !selectedProductMaster) {
        alert("Please select a Product Master.");
        return;
    }

    if (!produceQty || produceQty <= 0) {
        alert("Please enter a valid quantity.");
        return;
    }

    // Gather Ingredients
    const ingredientRows = document.querySelectorAll('.ingredient-row');
    const ingredientsUsed = [];
    
    for (const row of ingredientRows) {
        const select = row.querySelector('.ingredient-select');
        const qtyInput = row.querySelector('.ingredient-qty');
        const id = select.value;
        const qty = parseFloat(qtyInput.value);
        
        if (id && qty > 0) {
            const item = inventoryItems.find(i => i.id === id);
            ingredientsUsed.push({
                id: id,
                name: item.name,
                quantity: qty,
                unit: item.unit
            });
        }
    }

    if (moldMasterItems.length > 0 && !moldId) {
        showAlert('danger', 'Select a mold before saving.');
        return;
    }
    if (!prodCastingLocationSelect?.value) {
        showAlert('danger', 'Select a production location.');
        return;
    }

    let fgId = null;
    try {
        fgId = await ensureFinishedGoodInventory(businessId, selectedProductMaster);
    } catch (error) {
        console.error('Inventory Ensure Error', error);
        showAlert('danger', 'Failed to prepare finished goods inventory.');
        return;
    }

    if (currentEditId) {
        await updateProductionRun(businessId, produceQty, null, {
            productType,
            pipeType,
            loadClass,
            size,
            productMasterId,
            productMasterName,
            moldId,
            moldNumber,
            productionLocationId: prodCastingLocationSelect?.value || null,
            productionLocation: prodCastingLocationSelect?.selectedOptions?.[0]?.dataset.locationName || null,
            supervisor,
            notes,
            dateVal,
            labourCost,
            powerCost,
            dailyLabourEntries,
            labourCostMode: dailyLabourMode ? 'daily_7' : 'flat'
        });
        return;
    }

    if (ingredientsUsed.length === 0) {
        window.showConfirm('No Materials', 'No raw materials selected. Record production without deducting materials?', () => {
            processProductionSave(businessId, fgId, produceQty, ingredientsUsed, mouldsUsed, 0, supervisor, labourCost, powerCost, notes, dateVal, brokenQty, wastageQty, stage, internalUseQty, { productType, pipeType, loadClass, size, productMasterId, productMasterName, moldId, moldNumber, productionLocationId: prodCastingLocationSelect?.value || null, productionLocation: prodCastingLocationSelect?.selectedOptions?.[0]?.dataset.locationName || null, septicLocationId: null, septicLocation: null, dailyLabourEntries, labourCostMode: dailyLabourMode ? 'daily_7' : 'flat' });
        });
    } else {
        processProductionSave(businessId, fgId, produceQty, ingredientsUsed, mouldsUsed, 0, supervisor, labourCost, powerCost, notes, dateVal, brokenQty, wastageQty, stage, internalUseQty, { productType, pipeType, loadClass, size, productMasterId, productMasterName, moldId, moldNumber, productionLocationId: prodCastingLocationSelect?.value || null, productionLocation: prodCastingLocationSelect?.selectedOptions?.[0]?.dataset.locationName || null, septicLocationId: null, septicLocation: null, dailyLabourEntries, labourCostMode: dailyLabourMode ? 'daily_7' : 'flat' });
    }
}

async function updateProductionRun(businessId, produceQty, stage, fields) {
    try {
        const runRef = db.collection('users').doc(businessId).collection('production_runs').doc(currentEditId);
        const updates = {
            productType: fields.productType || null,
            pipeType: fields.pipeType || null,
            loadClass: fields.loadClass || null,
            size: fields.size || null,
            productMasterId: fields.productMasterId || null,
            productMasterName: fields.productMasterName || null,
            moldId: fields.moldId || null,
            moldNumber: fields.moldNumber || null,
            productionLocationId: fields.productionLocationId || null,
            productionLocation: fields.productionLocation || null,
            septicLocationId: fields.septicLocationId || null,
            septicLocation: fields.septicLocation || null,
            supervisor: fields.supervisor || '',
            labourCost: Number(fields.labourCost || 0),
            powerCost: Number(fields.powerCost || 0),
            dailyLabourEntries: Array.isArray(fields.dailyLabourEntries) ? fields.dailyLabourEntries : [],
            labourCostMode: fields.labourCostMode || 'flat',
            notes: fields.notes || '',
            date: fields.dateVal ? new Date(fields.dateVal) : new Date()
        };
        if (stage) updates.status = stage;

        await runRef.update(updates);
        bootstrap.Modal.getInstance(productionModal).hide();
        showAlert('success', 'Production updated');
        currentEditId = null;
        loadProductionHistory();
    } catch (error) {
        console.error('Update Production Error', error);
        showAlert('danger', 'Failed to update production');
    } finally {
        const qtyInput = document.getElementById('produceQuantity');
        if (qtyInput) qtyInput.disabled = false;
        if (prodProductMasterSelect) prodProductMasterSelect.disabled = false;
        if (prodMoldSelect) prodMoldSelect.disabled = false;
        if (ingredientsContainer) {
            ingredientsContainer.querySelectorAll('input, select, button').forEach(el => el.disabled = false);
        }
    }
}

async function createPlannedRun(businessId, fgId, produceQty, ingredientsUsed, mouldsUsed, supervisor, notes, dateVal, internalUseQty) {
    const saveBtn = document.getElementById('saveProductionBtn');
    const originalText = saveBtn.innerHTML;
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Saving...';

    try {
        const userRef = db.collection('users').doc(businessId);
        const fgDoc = await userRef.collection('inventory').doc(fgId).get();
        if (!fgDoc.exists) throw new Error("Finished good not found!");

        const productionDate = dateVal ? new Date(dateVal) : new Date();
        const batchId = 'PLAN-' + Date.now().toString().substr(-6);

        await userRef.collection('production_runs').add({
            batchId: batchId,
            date: productionDate,
            finishedGoodId: fgId,
            finishedGoodName: fgDoc.data().name,
            quantityProduced: produceQty,
            internalUseQty: internalUseQty,
            ingredients: ingredientsUsed,
            mouldsUsed: mouldsUsed,
            supervisor: supervisor,
            notes: notes,
            status: 'Planned',
            createdAt: new Date()
        });

        bootstrap.Modal.getInstance(productionModal).hide();
        showAlert('success', 'Pre-production plan saved!');
        loadProductionHistory();
    } catch (error) {
        console.error("Plan Save Error:", error);
        showAlert('danger', error.message || "Failed to save plan");
    } finally {
        saveBtn.disabled = false;
        saveBtn.innerHTML = originalText;
    }
}

async function processProductionSave(businessId, fgId, produceQty, ingredientsUsed, mouldsUsed, curingDays, supervisor, labourCost, powerCost, notes, dateVal, brokenQty, wastageQty, stage, internalUseQty, extraFields = {}) {
    const saveBtn = document.getElementById('saveProductionBtn');
    const originalText = saveBtn.innerHTML;
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Processing...';

    try {
        const batch = db.batch();
        const userRef = db.collection('users').doc(businessId);
        
        // 1. Run Transaction to check stock and update
        await db.runTransaction(async (transaction) => {
            // Get Finished Good Doc
            const fgRef = userRef.collection('inventory').doc(fgId);
            const fgDoc = await transaction.get(fgRef);
            if (!fgDoc.exists) throw "Finished good not found!";

            // Check Mold Availability
            let moldRef = null;
            if (extraFields.moldId) {
                moldRef = userRef.collection('mold_master').doc(extraFields.moldId);
                const moldDoc = await transaction.get(moldRef);
                if (!moldDoc.exists) throw "Mold not found!";
                const moldStatus = (moldDoc.data().status || 'Available').toLowerCase();
                if (moldStatus !== 'available') {
                    throw new Error(`Mold is not available (status: ${moldDoc.data().status || 'Unknown'})`);
                }
            }

            // Get Ingredient Docs
            const ingredientUpdates = [];
            for (const ing of ingredientsUsed) {
                const ref = userRef.collection('inventory').doc(ing.id);
                const doc = await transaction.get(ref);
                if (!doc.exists) throw `Material ${ing.name} not found!`;
                
                const currentQty = doc.data().quantity || 0;
                if (currentQty < ing.quantity) {
                    throw `Insufficient stock for ${ing.name}. Available: ${currentQty}, Required: ${ing.quantity}`;
                }
                
                ingredientUpdates.push({ ref, newQty: currentQty - ing.quantity });
            }

            const productionDate = dateVal ? new Date(dateVal) : new Date();

            // Determine Status
            let status = 'Started';
            if (stage === 'On Curing') status = 'On Curing';
            
            // Calculate Real Cost (Weighted Average)
            let totalIngredientsCost = 0;
            ingredientsUsed.forEach(ing => {
                const item = inventoryItems.find(i => i.id === ing.id);
                if (item) {
                    totalIngredientsCost += (parseFloat(item.costPrice) || 0) * ing.quantity;
                }
            });
            
            const totalBatchCost = totalIngredientsCost + labourCost + powerCost;
            const currentFgQty = fgDoc.data().quantity || 0;
            const currentFgCost = fgDoc.data().costPrice || 0;
            
            // Weighted Average Cost = (CurrentValue + NewBatchValue) / TotalUnits
            const safeQty = Math.max(0, currentFgQty);
            const newTotalValue = (safeQty * currentFgCost) + totalBatchCost;
            const totalUnits = safeQty + produceQty;
            const newAverageCost = totalUnits > 0 ? newTotalValue / totalUnits : 0;

            const fgUpdateData = { costPrice: newAverageCost };
            const goodQty = Math.max(0, produceQty - brokenQty);
            if (internalUseQty > goodQty) {
                throw new Error("Septic allocation exceeds good quantity.");
            }

            if (status === 'Completed') {
                const sellableQty = Math.max(0, goodQty - internalUseQty);
                fgUpdateData.quantity = currentFgQty + sellableQty;
            }
            
            transaction.update(fgRef, fgUpdateData);

            // Update Ingredients
            ingredientUpdates.forEach(update => {
                transaction.update(update.ref, { quantity: update.newQty });
            });

            if (moldRef) {
                const moldStatus = status === 'On Curing' ? 'Available' : 'In Production';
                transaction.update(moldRef, { status: moldStatus, lastUsedDate: productionDate });
            }

            // Create Production Record
            const productionRef = userRef.collection('production_runs').doc();
            const batchId = 'BATCH-' + Date.now().toString().substr(-6);
            const curingStartDate = status === 'On Curing' ? productionDate : null;
            transaction.set(productionRef, {
                batchId: batchId,
                date: productionDate,
                finishedGoodId: fgId,
                finishedGoodName: fgDoc.data().name,
                productType: extraFields.productType || null,
                pipeType: extraFields.pipeType || null,
                loadClass: extraFields.loadClass || null,
                size: extraFields.size || null,
                productMasterId: extraFields.productMasterId || null,
                productMasterName: extraFields.productMasterName || null,
                moldId: extraFields.moldId || null,
                moldNumber: extraFields.moldNumber || null,
                productionLocationId: extraFields.productionLocationId || null,
                productionLocation: extraFields.productionLocation || null,
                septicLocationId: extraFields.septicLocationId || null,
                septicLocation: extraFields.septicLocation || null,
                quantityProduced: produceQty,
                brokenQuantity: brokenQty,
                wastageQuantity: wastageQty,
                internalUseQty: internalUseQty,
                ingredients: ingredientsUsed,
                mouldsUsed: mouldsUsed,
                supervisor: supervisor,
                labourCost: labourCost,
                powerCost: powerCost,
                dailyLabourEntries: Array.isArray(extraFields.dailyLabourEntries) ? extraFields.dailyLabourEntries : [],
                labourCostMode: extraFields.labourCostMode || 'flat',
                curingDays: 0,
                curingStart: curingStartDate,
                curingEnds: null,
                notes: notes,
                status: status,
                goodQty: null,
                sellableQty: null,
                createdAt: new Date()
            });
        });

        bootstrap.Modal.getInstance(productionModal).hide();
        showAlert('success', 'Production run recorded successfully!');
        loadProductionHistory();
        
    } catch (error) {
        console.error("Production Error:", error);
        showAlert('danger', error.message || "Failed to record production");
    }
    finally {
        saveBtn.disabled = false;
        saveBtn.innerHTML = originalText;
    }
}

async function finishCuringProcess(runId, passedQty, rejectedQty, readyLocId, readyLocName, completedDate) {
    const user = JSON.parse(localStorage.getItem('user'));
    const businessId = user.businessId || user.uid;
    try {
        await db.runTransaction(async (transaction) => {
            const runRef = db.collection('users').doc(businessId).collection('production_runs').doc(runId);
            const runDoc = await transaction.get(runRef);
            
            if (!runDoc.exists) throw "Production run not found";
            const data = runDoc.data();
            const producedQty = Number(data.quantityProduced || 0);
            const movedToCuringQty = Math.max(0, Math.min(producedQty, Number(data.curingQty || 0)));
            const prevGoodQty = Math.max(0, Number(data.goodQty || 0));
            const prevRejectedQty = Math.max(0, Number(data.rejectedQuantity || data.brokenQuantity || 0));
            const prevCompletedProcessed = Math.min(movedToCuringQty, Math.max(prevGoodQty, prevGoodQty + prevRejectedQty));
            const pendingOnCuringQty = Math.max(0, movedToCuringQty - prevCompletedProcessed);

            const processedQty = Number(passedQty || 0);
            if (processedQty <= 0) throw "Passed quantity must be greater than zero";
            if (processedQty > pendingOnCuringQty) throw "Passed quantity cannot exceed on-curing quantity";

            const damagedInThisStep = Number(rejectedQty || 0);
            if (damagedInThisStep < 0) throw "Damaged quantity cannot be negative";
            if (damagedInThisStep > processedQty) throw "Damaged quantity cannot exceed passed quantity";

            const goodAddQty = Math.max(0, processedQty - damagedInThisStep);
            const nextGoodQty = prevGoodQty + goodAddQty;
            const nextRejectedQty = prevRejectedQty + damagedInThisStep;
            const internalUseQty = Number(data.internalUseQty || 0);
            if (internalUseQty > nextGoodQty) throw "Septic allocation exceeds completed curing quantity";
            const sellableQty = Math.max(0, nextGoodQty - internalUseQty);

            const waitingForCuringQty = Math.max(0, producedQty - movedToCuringQty);
            const nextCompletedProcessed = prevCompletedProcessed + processedQty;
            const nextOnCuringQty = Math.max(0, movedToCuringQty - nextCompletedProcessed);
            const nextStatus = (waitingForCuringQty <= 0 && nextOnCuringQty <= 0) ? 'Completed' : (nextOnCuringQty > 0 ? 'On Curing' : 'Started');

            // Update Inventory
            const fgRef = db.collection('users').doc(businessId).collection('inventory').doc(data.finishedGoodId);
            const fgDoc = await transaction.get(fgRef);
            
            if (fgDoc.exists) {
                const currentQty = fgDoc.data().quantity || 0;
                transaction.update(fgRef, { quantity: currentQty + goodAddQty });
            }

            // Update Run Status
            transaction.update(runRef, { 
                status: nextStatus,
                rejectedQuantity: nextRejectedQty,
                goodQty: nextGoodQty,
                sellableQty: sellableQty,
                stockLocationId: readyLocId || null,
                stockLocation: readyLocName || null,
                completedAt: completedDate || new Date() 
            });
        });

        showAlert('success', 'Curing update saved. Ready stock updated.');
        loadProductionHistory();
    } catch (error) {
        console.error("Curing Update Error", error);
        showAlert('danger', 'Failed to update curing status');
    }
}


window.deleteProductionRun = async (id) => {
    window.showConfirm('Delete Production Record', 'Delete this production record? Inventory will NOT be reverted automatically.', async () => {
        const user = JSON.parse(localStorage.getItem('user'));
        if (user.permissions && user.permissions.canDelete === false) {
            return showAlert('danger', 'You do not have permission to delete items.');
        }

        const businessId = user.businessId || user.uid;
        try {
            const payablesSnap = await db.collection('users').doc(businessId)
                .collection('labour_payables')
                .where('runId', '==', id)
                .get();
            const payableDocs = payablesSnap.docs.map(doc => ({ id: doc.id, ...doc.data(), _ref: doc.ref }));
            const payableIds = payableDocs.map(p => p.id);
            await deleteLinkedLabourTransactions(businessId, payableIds, id);
            await deleteDocsInBatches(payableDocs.map(p => p._ref));
            await db.collection('users').doc(businessId).collection('production_runs').doc(id).delete();
            window.dispatchEvent(new CustomEvent('paymentsUpdated'));
            loadProductionHistory();
            showAlert('success', 'Production record deleted');
        } catch(e) {
            console.error(e);
            showAlert('danger', e.message || 'Failed to delete production record');
        }
    });
};

// Calculate Estimated Cost
function calculateCost() {
    if (!estimatedCostElement) return;
    
    let totalCost = 0;
    const rows = document.querySelectorAll('.ingredient-row');
    const produceQty = parseFloat(document.getElementById('produceQuantity').value) || 1;
    
    rows.forEach(row => {
        const select = row.querySelector('.ingredient-select');
        const qtyInput = row.querySelector('.ingredient-qty');
        
        const id = select.value;
        const qty = parseFloat(qtyInput.value) || 0;
        
        if (id && qty > 0) {
            const item = inventoryItems.find(i => i.id === id);
            if (item) {
                const cost = parseFloat(item.costPrice) || 0;
                totalCost += cost * qty;
            }
        }
    });
    
    estimatedCostElement.textContent = `₹${totalCost.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
    checkStockAvailability();
}

function checkStockAvailability() {
    if (!stockStatusBadge) return;
    
    const rows = document.querySelectorAll('.ingredient-row');
    let allAvailable = true;
    let hasIngredients = false;

    rows.forEach(row => {
        const select = row.querySelector('.ingredient-select');
        const qtyInput = row.querySelector('.ingredient-qty');
        const id = select.value;
        const qty = parseFloat(qtyInput.value) || 0;

        if (id && qty > 0) {
            hasIngredients = true;
            const item = inventoryItems.find(i => i.id === id);
            if (item) {
                if (item.quantity < qty) {
                    allAvailable = false;
                    row.classList.add('bg-danger', 'bg-opacity-10');
                } else {
                    row.classList.remove('bg-danger', 'bg-opacity-10');
                }
            }
        }
    });

    if (!hasIngredients) {
        stockStatusBadge.className = 'badge bg-secondary';
        stockStatusBadge.textContent = 'Status: No Materials';
    } else if (allAvailable) {
        stockStatusBadge.className = 'badge bg-success';
        stockStatusBadge.textContent = 'Status: Available';
    } else {
        stockStatusBadge.className = 'badge bg-danger';
        stockStatusBadge.textContent = 'Status: Shortage';
    }
}

function roundMoney(value) {
    return Math.round((parseFloat(value || 0) || 0) * 100) / 100;
}

function formatMoney(value) {
    return `₹${roundMoney(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function safeToken(value) {
    const raw = (value || '').toString().toLowerCase().trim();
    const token = raw.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    return token || 'na';
}

function shortPaymentRef(ref) {
    const raw = (ref || '').toString().trim();
    if (!raw) return '';
    if (raw.length <= 14) return raw;
    return `${raw.slice(0, 6)}...${raw.slice(-4)}`;
}

function formatPaymentRefs(refs) {
    const list = Array.isArray(refs) ? refs.filter(Boolean).map(v => String(v)) : [];
    if (!list.length) return { text: '-', title: '' };
    const short = list.map(shortPaymentRef);
    const head = short.slice(0, 2).join(', ');
    const text = short.length > 2 ? `${head} +${short.length - 2}` : head;
    const title = list.join(', ');
    return { text, title };
}

function makeLabourPayableId(runId, workDate, workerKey) {
    return `LABP_${safeToken(runId)}_${safeToken(workDate)}_${safeToken(workerKey)}`.slice(0, 120);
}

function getCurrentUserContext() {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    const businessId = user?.businessId || user?.uid || '';
    return { user, businessId };
}

function getActorName(user) {
    return user?.name || user?.displayName || user?.email || user?.uid || 'system';
}

function computePayableState(payable) {
    if (payable?.isDeleted) {
        const amountDueDeleted = roundMoney(payable.amountDue || 0);
        const amountPaidDeleted = roundMoney(Math.max(parseFloat(payable.amountPaid || 0) || 0, 0));
        return {
            amountDue: amountDueDeleted,
            amountPaid: amountPaidDeleted,
            amountPending: roundMoney(Math.max(amountDueDeleted - amountPaidDeleted, 0)),
            status: 'deleted'
        };
    }
    const amountDue = roundMoney(payable.amountDue || 0);
    const amountPaid = roundMoney(Math.max(parseFloat(payable.amountPaid || 0) || 0, 0));
    const amountPending = roundMoney(Math.max(amountDue - amountPaid, 0));
    const rawStatus = (payable.status || '').toLowerCase();
    let status = rawStatus || 'pending';
    if (rawStatus !== 'reversed') {
        if (amountPaid <= 0) {
            status = payable.approvedAt || rawStatus === 'approved' ? 'approved' : 'pending';
        } else if (amountPending <= 0) {
            status = 'paid';
        } else {
            status = 'partial';
        }
    } else {
        status = 'reversed';
    }
    return { amountDue, amountPaid, amountPending, status };
}

function getLabourStatusBadge(status) {
    const val = (status || 'pending').toLowerCase();
    if (val === 'deleted') return '<span class="badge bg-dark">Deleted</span>';
    if (val === 'paid') return '<span class="badge bg-success">Paid</span>';
    if (val === 'partial') return '<span class="badge bg-info text-dark">Partial</span>';
    if (val === 'approved') return '<span class="badge bg-primary">Approved</span>';
    if (val === 'reversed') return '<span class="badge bg-secondary">Reversed</span>';
    return '<span class="badge bg-warning text-dark">Pending</span>';
}

function getRunLabourPayables(run) {
    const fromStore = labourPayablesAll
        .filter(p => p.runId === run.id && !p.isDeleted)
        .map(p => {
            const state = computePayableState(p);
            return { ...p, ...state };
        });
    if (fromStore.length) {
        return fromStore.sort((a, b) => `${a.workDate}_${a.workerName}`.localeCompare(`${b.workDate}_${b.workerName}`));
    }
    return buildExpectedLabourPayablesForRun(run).map((p) => {
        const paid = p.legacyPaid ? p.amountDue : 0;
        return {
            ...p,
            amountPaid: paid,
            amountPending: roundMoney(p.amountDue - paid),
            status: p.legacyPaid ? 'paid' : 'pending',
            txIds: []
        };
    }).sort((a, b) => `${a.workDate}_${a.workerName}`.localeCompare(`${b.workDate}_${b.workerName}`));
}

function getLabourWorkerRowsForEntry(entry) {
    const workers = Array.isArray(entry.labourers) ? entry.labourers : [];
    if (!workers.length) {
        const fallbackAmount = roundMoney(entry.amount || 0);
        return [{
            workerName: 'Labour',
            workerKey: 'labour_1',
            amountDue: fallbackAmount
        }];
    }
    const rows = workers.map((worker, index) => {
        const name = (worker?.name || '').toString().trim() || `Labour ${index + 1}`;
        const rawAmount = parseFloat(worker?.amount || 0);
        const byRate = (parseFloat(worker?.quantity || 0) || 0) * (parseFloat(worker?.rate || 0) || 0);
        const amountDue = roundMoney(rawAmount > 0 ? rawAmount : byRate);
        return {
            workerName: name,
            workerKey: `${safeToken(name)}_${index + 1}`,
            amountDue
        };
    });
    let total = rows.reduce((sum, row) => sum + row.amountDue, 0);
    const entryAmount = roundMoney(entry.amount || 0);
    if (total <= 0 && entryAmount > 0) {
        return [{
            workerName: 'Labour',
            workerKey: 'labour_1',
            amountDue: entryAmount
        }];
    }
    if (total > 0 && entryAmount > 0 && Math.abs(total - entryAmount) > 0.01) {
        const factor = entryAmount / total;
        rows.forEach(row => { row.amountDue = roundMoney(row.amountDue * factor); });
        total = rows.reduce((sum, row) => sum + row.amountDue, 0);
        const diff = roundMoney(entryAmount - total);
        if (Math.abs(diff) > 0 && rows.length) rows[0].amountDue = roundMoney(rows[0].amountDue + diff);
    }
    return rows;
}

function buildExpectedLabourPayablesForRun(run) {
    const payables = [];
    const entries = getRunLabourEntries(run);
    const paidDates = new Set(
        (Array.isArray(run.labourPaidDates) ? run.labourPaidDates : [])
            .filter(p => Boolean(p?.paid))
            .map(p => normalizeLabourDate(p?.date))
            .filter(Boolean)
    );
    entries.forEach(entry => {
        const workDate = normalizeLabourDate(entry.date);
        if (!workDate) return;
        const workers = getLabourWorkerRowsForEntry(entry);
        workers.forEach(worker => {
            const id = makeLabourPayableId(run.id, workDate, worker.workerKey);
            payables.push({
                id,
                runId: run.id,
                batchId: run.batchId || '-',
                productName: run.finishedGoodName || 'Production Labour',
                workDate,
                workerId: worker.workerKey,
                workerName: worker.workerName || 'Labour',
                amountDue: roundMoney(worker.amountDue),
                amountPaid: 0,
                amountPending: roundMoney(worker.amountDue),
                status: 'pending',
                source: 'production_labour',
                txIds: [],
                legacyPaid: paidDates.has(workDate)
            });
        });
    });
    return payables;
}

function payableNeedsUpdate(existing, merged) {
    if (!existing) return true;
    const keys = [
        'runId', 'batchId', 'productName', 'workDate', 'workerId', 'workerName',
        'amountDue', 'amountPaid', 'amountPending', 'status', 'source'
    ];
    const changed = keys.some(key => {
        if (typeof merged[key] === 'number' || typeof existing[key] === 'number') {
            return roundMoney(merged[key]) !== roundMoney(existing[key]);
        }
        return (merged[key] || '') !== (existing[key] || '');
    });
    if (changed) return true;
    const oldTx = Array.isArray(existing.txIds) ? existing.txIds.join('|') : '';
    const newTx = Array.isArray(merged.txIds) ? merged.txIds.join('|') : '';
    if (oldTx !== newTx) return true;
    return false;
}

function mergePayable(existing, expected, actor) {
    const now = new Date();
    const base = existing || {};
    if (base.isDeleted) {
        return {
            ...base,
            status: 'deleted',
            updatedBy: actor,
            updatedAt: now
        };
    }
    const amountDue = roundMoney(base.overrideAmountDue ?? expected.amountDue);
    let amountPaid = roundMoney(base.amountPaid || 0);
    const txIds = Array.isArray(base.txIds) ? base.txIds.filter(Boolean) : [];
    if (!existing && expected.legacyPaid) amountPaid = amountDue;
    if (existing && expected.legacyPaid && amountPaid <= 0 && !txIds.length) amountPaid = amountDue;
    const amountPending = roundMoney(Math.max(amountDue - amountPaid, 0));
    const status = (() => {
        const raw = (base.status || '').toLowerCase();
        if (raw === 'reversed') return 'reversed';
        if (amountPaid <= 0) return base.approvedAt || raw === 'approved' ? 'approved' : 'pending';
        if (amountPending <= 0) return 'paid';
        return 'partial';
    })();
    return {
        runId: expected.runId,
        batchId: expected.batchId,
        productName: expected.productName,
        workDate: expected.workDate,
        workerId: expected.workerId,
        workerName: base.overrideWorkerName || expected.workerName,
        amountDue,
        amountPaid,
        amountPending,
        status,
        source: 'production_labour',
        txIds,
        approvedBy: base.approvedBy || null,
        approvedAt: base.approvedAt || null,
        paidAt: base.paidAt || null,
        reversedAt: base.reversedAt || null,
        reversedReason: base.reversedReason || null,
        overrideAmountDue: base.overrideAmountDue ?? null,
        overrideWorkerName: base.overrideWorkerName || null,
        isDeleted: false,
        updatedBy: actor,
        updatedAt: now,
        createdAt: base.createdAt || now
    };
}

async function syncLabourPayablesForRuns(businessId, runs) {
    if (!businessId) return;
    const colRef = db.collection('users').doc(businessId).collection('labour_payables');
    const actor = getActorName(getCurrentUserContext().user);
    const existingSnap = await colRef.get();
    const existingMap = new Map();
    existingSnap.forEach(doc => existingMap.set(doc.id, { id: doc.id, ...doc.data() }));

    const expectedMap = new Map();
    (runs || []).forEach(run => {
        buildExpectedLabourPayablesForRun(run).forEach(payable => expectedMap.set(payable.id, payable));
    });

    let batch = db.batch();
    let ops = 0;
    for (const [payableId, expected] of expectedMap) {
        const existing = existingMap.get(payableId) || null;
        const merged = mergePayable(existing, expected, actor);
        if (!payableNeedsUpdate(existing, merged)) continue;
        const docRef = colRef.doc(payableId);
        batch.set(docRef, merged, { merge: true });
        ops += 1;
        if (ops >= 400) {
            await batch.commit();
            batch = db.batch();
            ops = 0;
        }
    }
    if (ops > 0) await batch.commit();
}

async function loadLabourPayables(businessId) {
    if (!businessId) {
        labourPayablesAll = [];
        return;
    }
    const snap = await db.collection('users').doc(businessId).collection('labour_payables').get();
    labourPayablesAll = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    labourPayablesAll.sort((a, b) => {
        const da = `${a.workDate || ''}_${a.workerName || ''}`;
        const dbv = `${b.workDate || ''}_${b.workerName || ''}`;
        return dbv.localeCompare(da);
    });
}

function parseDateFromYMD(value) {
    if (!value) return null;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    return d;
}

function renderLabourPaymentTracker(payables = [], scopedRuns = []) {
    if (!labourPaymentsTable) return;
    const tbody = labourPaymentsTable.querySelector('tbody');
    if (!tbody) return;
    const runIdSet = new Set((scopedRuns || []).map(run => run.id));
    const scoped = (payables || []).filter(p => !runIdSet.size || runIdSet.has(p.runId));

    const searchTerm = (labourPayableSearch?.value || '').toLowerCase().trim();
    const statusFilter = (labourPayableStatusFilter?.value || 'all').toLowerCase();
    const workerFilter = (labourPayableWorkerFilter?.value || '').toLowerCase().trim();
    const fromDate = labourPayableDateFrom?.value || '';
    const toDate = labourPayableDateTo?.value || '';

    const filtered = scoped
        .filter(p => !p.isDeleted)
        .map(p => ({ ...p, ...computePayableState(p) }))
        .filter(p => {
            const text = `${p.batchId || ''} ${p.productName || ''} ${p.workerName || ''} ${p.workDate || ''}`.toLowerCase();
            if (searchTerm && !text.includes(searchTerm)) return false;
            if (statusFilter !== 'all' && (p.status || 'pending') !== statusFilter) return false;
            if (workerFilter && !(p.workerName || '').toLowerCase().includes(workerFilter)) return false;
            if (fromDate && (p.workDate || '') < fromDate) return false;
            if (toDate && (p.workDate || '') > toDate) return false;
            return true;
        });

    const groupedMap = new Map();
    filtered.forEach((payable) => {
        const key = payable.runId || payable.batchId || payable.id;
        const existing = groupedMap.get(key);
        if (!existing) {
            groupedMap.set(key, {
                key,
                runId: payable.runId || '',
                batchId: payable.batchId || '-',
                productName: payable.productName || '-',
                firstDate: payable.workDate || '',
                lastDate: payable.workDate || '',
                amountDue: roundMoney(payable.amountDue || 0),
                amountPaid: roundMoney(payable.amountPaid || 0),
                amountPending: roundMoney(payable.amountPending || 0),
                workerSet: new Set([(payable.workerName || 'Labour').toLowerCase()]),
                hasPending: (payable.status || 'pending') === 'pending',
                hasApproved: (payable.status || 'pending') === 'approved',
                hasReversed: (payable.status || 'pending') === 'reversed'
            });
            return;
        }
        const d = payable.workDate || '';
        if (d && (!existing.firstDate || d < existing.firstDate)) existing.firstDate = d;
        if (d && (!existing.lastDate || d > existing.lastDate)) existing.lastDate = d;
        existing.amountDue = roundMoney(existing.amountDue + roundMoney(payable.amountDue || 0));
        existing.amountPaid = roundMoney(existing.amountPaid + roundMoney(payable.amountPaid || 0));
        existing.amountPending = roundMoney(existing.amountPending + roundMoney(payable.amountPending || 0));
        existing.workerSet.add((payable.workerName || 'Labour').toLowerCase());
        const status = payable.status || 'pending';
        if (status === 'pending') existing.hasPending = true;
        if (status === 'approved') existing.hasApproved = true;
        if (status === 'reversed') existing.hasReversed = true;
    });

    const grouped = Array.from(groupedMap.values())
        .map((group) => {
            let status = 'pending';
            if (group.amountPaid > 0 && group.amountPending <= 0) status = 'paid';
            else if (group.amountPaid > 0 && group.amountPending > 0) status = 'partial';
            else if (group.hasApproved) status = 'approved';
            else if (group.hasReversed && !group.hasPending && !group.hasApproved) status = 'reversed';
            return { ...group, status };
        })
        .sort((a, b) => `${b.lastDate || ''}_${b.batchId || ''}`.localeCompare(`${a.lastDate || ''}_${a.batchId || ''}`));

    const totalAmount = filtered.reduce((sum, p) => sum + roundMoney(p.amountDue), 0);
    const pendingAmount = filtered.reduce((sum, p) => sum + roundMoney(p.amountPending), 0);
    const totalEntries = grouped.length;
    const uniqueWorkers = new Set(filtered.map(p => (p.workerName || 'Labour').toLowerCase()));

    if (!grouped.length) {
        tbody.innerHTML = '<tr><td colspan="9" class="text-center text-muted">No labour payables found</td></tr>';
    } else {
        tbody.innerHTML = grouped.map(group => {
            const dateRange = group.firstDate && group.lastDate && group.firstDate !== group.lastDate
                ? `${group.firstDate} to ${group.lastDate}`
                : (group.lastDate || group.firstDate || '-');
            return `
                <tr>
                    <td>${group.batchId}</td>
                    <td>${dateRange}</td>
                    <td>${group.productName || '-'}</td>
                    <td>${group.workerSet.size}</td>
                    <td class="text-end fw-semibold">${formatMoney(group.amountDue)}</td>
                    <td class="text-end text-success fw-semibold">${formatMoney(group.amountPaid)}</td>
                    <td class="text-end text-danger fw-semibold">${formatMoney(group.amountPending)}</td>
                    <td>${getLabourStatusBadge(group.status)}</td>
                    <td>
                        <button type="button" class="btn btn-sm btn-outline-secondary" ${group.runId ? `onclick="window.viewLabourLedger('${group.runId}')"` : 'disabled'}>View</button>
                    </td>
                </tr>
            `;
        }).join('');
    }

    if (labourTotalRecorded) labourTotalRecorded.textContent = formatMoney(totalAmount);
    if (labourPendingAmount) labourPendingAmount.textContent = formatMoney(pendingAmount);
    if (labourTotalEntries) labourTotalEntries.textContent = totalEntries.toLocaleString();
    if (labourUniqueWorkers) labourUniqueWorkers.textContent = uniqueWorkers.size.toLocaleString();

    syncSelectAllLabourPayables();
}

function syncSelectAllLabourPayables() {
    if (!selectAllLabourPayables || !labourPaymentsTable) return;
    const enabled = Array.from(labourPaymentsTable.querySelectorAll('.labour-payable-select:not(:disabled)'));
    const checked = enabled.filter(cb => cb.checked);
    selectAllLabourPayables.checked = enabled.length > 0 && checked.length === enabled.length;
    selectAllLabourPayables.indeterminate = checked.length > 0 && checked.length < enabled.length;
}

function getSelectedLabourPayableIds() {
    if (!labourPaymentsTable) return [];
    return Array.from(labourPaymentsTable.querySelectorAll('.labour-payable-select:checked'))
        .map(cb => cb.value)
        .filter(Boolean);
}

async function deleteDocsInBatches(docRefs = []) {
    const refs = (docRefs || []).filter(Boolean);
    if (!refs.length) return;
    const chunkSize = 400;
    for (let i = 0; i < refs.length; i += chunkSize) {
        const chunk = refs.slice(i, i + chunkSize);
        const batch = db.batch();
        chunk.forEach(ref => batch.delete(ref));
        // eslint-disable-next-line no-await-in-loop
        await batch.commit();
    }
}

async function deleteLinkedLabourTransactions(businessId, payableIds = [], runId = null) {
    if (!businessId) return;
    const txMap = new Map();
    const txCol = db.collection('users').doc(businessId).collection('transactions');

    if (runId) {
        const runSnap = await txCol.where('runId', '==', runId).get();
        runSnap.forEach(doc => {
            const source = (doc.data()?.source || '').toString().toLowerCase();
            if (source.startsWith('production_labour')) txMap.set(doc.id, doc.ref);
        });
    }

    for (const payableId of (payableIds || [])) {
        // eslint-disable-next-line no-await-in-loop
        const payableSnap = await txCol.where('payableId', '==', payableId).get();
        payableSnap.forEach(doc => {
            const source = (doc.data()?.source || '').toString().toLowerCase();
            if (source.startsWith('production_labour')) txMap.set(doc.id, doc.ref);
        });
    }

    await deleteDocsInBatches(Array.from(txMap.values()));
}

function appendAuditEvent(existingEvents, event) {
    const list = Array.isArray(existingEvents) ? [...existingEvents] : [];
    list.push(event);
    return list.slice(-40);
}

async function approveLabourPayable(payableId, options = {}) {
    const { businessId, user } = getCurrentUserContext();
    if (!businessId || !payableId) return false;
    const actor = getActorName(user);
    try {
        await db.runTransaction(async (transaction) => {
            const ref = db.collection('users').doc(businessId).collection('labour_payables').doc(payableId);
            const doc = await transaction.get(ref);
            if (!doc.exists) throw new Error('Payable not found');
            const data = { id: doc.id, ...doc.data() };
            const state = computePayableState(data);
            if (state.status === 'reversed') throw new Error('Reversed payable cannot be approved');
            if (state.status === 'approved' || state.status === 'partial' || state.status === 'paid') return;
            const now = new Date();
            transaction.update(ref, {
                status: 'approved',
                approvedBy: actor,
                approvedAt: now,
                updatedBy: actor,
                updatedAt: now,
                auditTrail: appendAuditEvent(data.auditTrail, { at: now, by: actor, action: 'approve' })
            });
        });
        if (!options.silent) showAlert('success', 'Labour payable approved');
        await loadLabourPayables(businessId);
        renderLabourPaymentTracker(labourPayablesAll, productionData);
        return true;
    } catch (error) {
        console.error('Approve labour payable failed', error);
        if (!options.silent) showAlert('danger', error.message || 'Failed to approve payable');
        return false;
    }
}

async function payLabourPayable(payableId, requestedAmount = null, options = {}) {
    const { businessId, user } = getCurrentUserContext();
    if (!businessId || !payableId) return false;
    const actor = getActorName(user);
    try {
        await db.runTransaction(async (transaction) => {
            const payableRef = db.collection('users').doc(businessId).collection('labour_payables').doc(payableId);
            const payableDoc = await transaction.get(payableRef);
            if (!payableDoc.exists) throw new Error('Payable not found');
            const payable = { id: payableDoc.id, ...payableDoc.data() };
            const state = computePayableState(payable);
            if (state.status === 'reversed') throw new Error('Reversed payable cannot be paid');
            if (state.amountPending <= 0) throw new Error('No pending amount');

            const paymentAmount = requestedAmount == null ? state.amountPending : roundMoney(requestedAmount);
            if (paymentAmount <= 0) throw new Error('Enter a valid amount');
            if (paymentAmount > state.amountPending) throw new Error('Payment exceeds pending amount');

            const nextPaid = roundMoney(state.amountPaid + paymentAmount);
            const nextPending = roundMoney(Math.max(state.amountDue - nextPaid, 0));
            const nextStatus = nextPending <= 0 ? 'paid' : 'partial';
            const now = new Date();

            const txId = `LABPAY_${safeToken(payableId)}_${Math.round(nextPaid * 100)}`;
            const txRef = db.collection('users').doc(businessId).collection('transactions').doc(txId);
            const txDoc = await transaction.get(txRef);
            if (!txDoc.exists) {
                transaction.set(txRef, {
                    type: 'SupplierPayment',
                    supplier: 'Labour',
                    mode: 'Cash',
                    reference: `LAB-${safeToken(payable.batchId).toUpperCase().slice(0, 12)}-${(payable.workDate || '').replace(/-/g, '')}`,
                    description: `Labour payment | Batch ${payable.batchId || '-'} | ${payable.productName || 'Production Labour'} | Worker: ${payable.workerName || 'Labour'} | Work Date: ${payable.workDate || '-'}`,
                    amount: paymentAmount,
                    date: now,
                    source: 'production_labour',
                    payableId,
                    runId: payable.runId || null,
                    batchId: payable.batchId || null,
                    labourDate: payable.workDate || null,
                    workerName: payable.workerName || null,
                    updatedAt: now,
                    createdAt: now
                }, { merge: true });
            }

            const txIds = Array.isArray(payable.txIds) ? payable.txIds.filter(Boolean) : [];
            if (!txIds.includes(txId)) txIds.push(txId);
            transaction.update(payableRef, {
                amountPaid: nextPaid,
                amountPending: nextPending,
                status: nextStatus,
                approvedBy: payable.approvedBy || actor,
                approvedAt: payable.approvedAt || now,
                paidAt: now,
                txIds,
                updatedBy: actor,
                updatedAt: now,
                auditTrail: appendAuditEvent(payable.auditTrail, { at: now, by: actor, action: 'pay', amount: paymentAmount, txId })
            });
        });
        if (!options.silent) showAlert('success', 'Labour payment recorded');
        await loadLabourPayables(businessId);
        renderLabourPaymentTracker(labourPayablesAll, productionData);
        return true;
    } catch (error) {
        console.error('Pay labour payable failed', error);
        if (!options.silent) showAlert('danger', error.message || 'Failed to record payment');
        return false;
    }
}

async function reverseLabourPayable(payableId, reason = 'Payment reversal', options = {}) {
    const { businessId, user } = getCurrentUserContext();
    if (!businessId || !payableId) return false;
    const actor = getActorName(user);
    try {
        await db.runTransaction(async (transaction) => {
            const payableRef = db.collection('users').doc(businessId).collection('labour_payables').doc(payableId);
            const payableDoc = await transaction.get(payableRef);
            if (!payableDoc.exists) throw new Error('Payable not found');
            const payable = { id: payableDoc.id, ...payableDoc.data() };
            const state = computePayableState(payable);
            if (state.amountPaid <= 0) throw new Error('No paid amount to reverse');
            const now = new Date();
            const reverseAmount = roundMoney(state.amountPaid);
            const txId = `LABREV_${safeToken(payableId)}_${Math.round(reverseAmount * 100)}`;
            const txRef = db.collection('users').doc(businessId).collection('transactions').doc(txId);
            const txDoc = await transaction.get(txRef);
            if (!txDoc.exists) {
                transaction.set(txRef, {
                    type: 'SupplierPayment',
                    supplier: 'Labour',
                    mode: 'Adjustment',
                    reference: `LAB-REV-${safeToken(payable.batchId).toUpperCase().slice(0, 8)}`,
                    description: `Labour payment reversal | Batch ${payable.batchId || '-'} | Worker: ${payable.workerName || 'Labour'} | Reason: ${reason || 'Payment reversal'}`,
                    amount: -reverseAmount,
                    date: now,
                    source: 'production_labour_reversal',
                    payableId,
                    runId: payable.runId || null,
                    batchId: payable.batchId || null,
                    labourDate: payable.workDate || null,
                    workerName: payable.workerName || null,
                    updatedAt: now,
                    createdAt: now
                }, { merge: true });
            }

            const txIds = Array.isArray(payable.txIds) ? payable.txIds.filter(Boolean) : [];
            if (!txIds.includes(txId)) txIds.push(txId);
            transaction.update(payableRef, {
                amountPaid: 0,
                amountPending: state.amountDue,
                status: 'reversed',
                reversedAt: now,
                reversedReason: reason || 'Payment reversal',
                txIds,
                updatedBy: actor,
                updatedAt: now,
                auditTrail: appendAuditEvent(payable.auditTrail, { at: now, by: actor, action: 'reverse', amount: reverseAmount, txId, reason })
            });
        });
        if (!options.silent) showAlert('success', 'Labour payment reversed');
        await loadLabourPayables(businessId);
        renderLabourPaymentTracker(labourPayablesAll, productionData);
        return true;
    } catch (error) {
        console.error('Reverse labour payable failed', error);
        if (!options.silent) showAlert('danger', error.message || 'Failed to reverse payment');
        return false;
    }
}

async function editLabourPayable(payableId, options = {}) {
    const { businessId, user } = getCurrentUserContext();
    if (!businessId || !payableId) return false;
    const actor = getActorName(user);
    try {
        await db.runTransaction(async (transaction) => {
            const payableRef = db.collection('users').doc(businessId).collection('labour_payables').doc(payableId);
            const payableDoc = await transaction.get(payableRef);
            if (!payableDoc.exists) throw new Error('Payable not found');
            const payable = { id: payableDoc.id, ...payableDoc.data() };
            const state = computePayableState(payable);
            if (state.status === 'deleted') throw new Error('Deleted payable cannot be edited');
            if (state.amountPaid > 0) throw new Error('Paid/partial payable cannot be edited');

            const currentWorker = (payable.workerName || 'Labour').trim();
            const workerName = (window.prompt('Edit worker name', currentWorker) || '').trim();
            if (!workerName) throw new Error('Worker name is required');

            const currentAmount = roundMoney(payable.overrideAmountDue ?? payable.amountDue ?? 0);
            const amountStr = window.prompt('Edit due amount', currentAmount.toFixed(2));
            if (amountStr === null) throw new Error('Edit cancelled');
            const amountDue = roundMoney(amountStr);
            if (amountDue <= 0) throw new Error('Amount must be greater than 0');

            const now = new Date();
            const nextStatus = state.status === 'approved' ? 'approved' : (state.status === 'reversed' ? 'reversed' : 'pending');
            transaction.update(payableRef, {
                workerName,
                amountDue,
                amountPending: amountDue,
                overrideWorkerName: workerName,
                overrideAmountDue: amountDue,
                status: nextStatus,
                updatedBy: actor,
                updatedAt: now,
                auditTrail: appendAuditEvent(payable.auditTrail, { at: now, by: actor, action: 'edit', workerName, amountDue })
            });
        });
        if (!options.silent) showAlert('success', 'Labour payable updated');
        await loadLabourPayables(businessId);
        renderLabourPaymentTracker(labourPayablesAll, productionData);
        return true;
    } catch (error) {
        if (!options.silent && error.message !== 'Edit cancelled') {
            showAlert('danger', error.message || 'Failed to edit payable');
        }
        return false;
    }
}

async function deleteLabourPayable(payableId, options = {}) {
    const { businessId, user } = getCurrentUserContext();
    if (!businessId || !payableId) return false;
    const actor = getActorName(user);
    try {
        const payableRef = db.collection('users').doc(businessId).collection('labour_payables').doc(payableId);
        const payableDoc = await payableRef.get();
        if (!payableDoc.exists) throw new Error('Payable not found');
        const payable = { id: payableDoc.id, ...payableDoc.data() };
        const state = computePayableState(payable);
        if (state.status === 'deleted') return true;
        if (!window.confirm(`Delete labour payable for ${payable.workerName || 'Labour'} on ${payable.workDate || '-'}?\nLinked labour payments will also be removed from Payment Out.`)) {
            throw new Error('Delete cancelled');
        }

        await deleteLinkedLabourTransactions(businessId, [payableId], null);
        const now = new Date();
        await payableRef.update({
            isDeleted: true,
            status: 'deleted',
            amountPaid: 0,
            amountPending: 0,
            txIds: [],
            updatedBy: actor,
            updatedAt: now,
            deletedAt: now,
            deletedBy: actor,
            auditTrail: appendAuditEvent(payable.auditTrail, { at: now, by: actor, action: 'delete' })
        });
        if (!options.silent) showAlert('success', 'Labour payable deleted');
        window.dispatchEvent(new CustomEvent('paymentsUpdated'));
        await loadLabourPayables(businessId);
        renderLabourPaymentTracker(labourPayablesAll, productionData);
        return true;
    } catch (error) {
        if (!options.silent && error.message !== 'Delete cancelled') {
            showAlert('danger', error.message || 'Failed to delete payable');
        }
        return false;
    }
}

async function approveSelectedLabourPayables() {
    const ids = getSelectedLabourPayableIds();
    if (!ids.length) return showAlert('warning', 'Select payable rows first');
    let success = 0;
    for (const payableId of ids) {
        // eslint-disable-next-line no-await-in-loop
        if (await approveLabourPayable(payableId, { silent: true })) success += 1;
    }
    showAlert('success', `Approved ${success} of ${ids.length} selected payables`);
}

async function paySelectedLabourPayables() {
    const ids = getSelectedLabourPayableIds();
    if (!ids.length) return showAlert('warning', 'Select payable rows first');
    let success = 0;
    for (const payableId of ids) {
        // eslint-disable-next-line no-await-in-loop
        if (await payLabourPayable(payableId, null, { silent: true })) success += 1;
    }
    showAlert('success', `Paid ${success} of ${ids.length} selected payables`);
}

window.viewLabourLedger = (id, options = {}) => {
    const run = productionDataAll.find(r => r.id === id) || productionData.find(r => r.id === id);
    if (!run || !labourLedgerModal || !labourLedgerTable) return;
    currentLabourLedgerRunId = run.id;
    const showModal = options.showModal !== false;
    const entries = getRunLabourPayables(run);
    const tbody = labourLedgerTable.querySelector('tbody');
    if (!tbody) return;

    if (labourLedgerBatch) labourLedgerBatch.textContent = run.batchId || '-';
    if (labourLedgerProduct) labourLedgerProduct.textContent = run.finishedGoodName || '-';

    let total = 0;
    let paidTotal = 0;
    let pendingTotal = 0;

    if (!entries.length) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted">No date-wise labour entries recorded</td></tr>';
    } else {
        tbody.innerHTML = entries.map(entry => {
            const amount = roundMoney(entry.amountDue || 0);
            const paidAmt = roundMoney(entry.amountPaid || 0);
            const pendingAmt = roundMoney(entry.amountPending || 0);
            const refsMeta = formatPaymentRefs(entry.txIds);
            const status = entry.status || 'pending';
            const canApprove = status === 'pending';
            const canPay = (status === 'pending' || status === 'approved' || status === 'partial') && pendingAmt > 0;
            const canReverse = (status === 'paid' || status === 'partial') && paidAmt > 0;
            const canEdit = paidAmt <= 0 && (status === 'pending' || status === 'approved' || status === 'reversed');
            const canDelete = status !== 'deleted';
            total += amount;
            paidTotal += paidAmt;
            pendingTotal += pendingAmt;
            return `
                <tr>
                    <td>${entry.workDate || '-'}</td>
                    <td>${entry.workerName || 'Labour'}</td>
                    <td class="text-end">${formatMoney(amount)}</td>
                    <td class="text-end text-success">${formatMoney(paidAmt)}</td>
                    <td class="text-end text-danger">${formatMoney(pendingAmt)}</td>
                    <td>${getLabourStatusBadge(status)}</td>
                    <td class="small" title="${refsMeta.title.replace(/"/g, '&quot;')}">${refsMeta.text}</td>
                    <td class="d-flex flex-wrap gap-1">
                        ${canEdit ? `<button type="button" class="btn btn-sm btn-outline-secondary edit-labour-payable-btn" data-payable-id="${entry.id}">Edit</button>` : ''}
                        ${canDelete ? `<button type="button" class="btn btn-sm btn-outline-danger delete-labour-payable-btn" data-payable-id="${entry.id}">Delete</button>` : ''}
                        ${canApprove ? `<button type="button" class="btn btn-sm btn-outline-primary approve-labour-payable-btn" data-payable-id="${entry.id}">Approve</button>` : ''}
                        ${canPay ? `<button type="button" class="btn btn-sm btn-outline-success mark-labour-paid-btn" data-payable-id="${entry.id}">Pay Full</button>` : ''}
                        ${canPay ? `<button type="button" class="btn btn-sm btn-outline-success partial-labour-paid-btn" data-payable-id="${entry.id}" data-pending="${pendingAmt}">Partial</button>` : ''}
                        ${canReverse ? `<button type="button" class="btn btn-sm btn-outline-danger reverse-labour-payable-btn" data-payable-id="${entry.id}">Reverse</button>` : ''}
                    </td>
                </tr>
            `;
        }).join('');
    }

    if (labourLedgerTotal) labourLedgerTotal.textContent = formatMoney(total);
    if (labourLedgerPaidTotal) labourLedgerPaidTotal.textContent = formatMoney(paidTotal);
    if (labourLedgerPendingTotal) labourLedgerPendingTotal.textContent = formatMoney(pendingTotal);

    if (showModal) new bootstrap.Modal(labourLedgerModal).show();
};
