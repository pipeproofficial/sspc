import { db } from './firebase-config.js';
import { checkAuth, formatDate, downloadCSV, downloadPDF } from './dashboard.js';
import { showAlert } from './auth.js';

const productionTablePipes = document.getElementById('productionTablePipes');
const productionTableSeptic = document.getElementById('productionTableSeptic');
const productionPipesSelectAll = document.getElementById('productionPipesSelectAll');
const productionSepticSelectAll = document.getElementById('productionSepticSelectAll');
const deleteSelectedPipesBtn = document.getElementById('deleteSelectedPipesBtn');
const deleteSelectedSepticBtn = document.getElementById('deleteSelectedSepticBtn');
const productionSearch = document.getElementById('productionSearch');
const productionStageFilter = document.getElementById('productionStageFilter');
const productionDateFrom = document.getElementById('productionDateFrom');
const productionDateTo = document.getElementById('productionDateTo');
const resetProductionFilters = document.getElementById('resetProductionFilters');
const addProductionBtn = document.getElementById('addProductionBtn');
const toggleCompletedRunsBtn = document.getElementById('toggleCompletedRunsBtn');
const productionModal = document.getElementById('productionModal');
const saveProductionBtn = document.getElementById('saveProductionBtn');
const labourCostInput = document.getElementById('labourCost');
const labourQtyInput = document.getElementById('labourQty');
const labourRatePerProductInput = document.getElementById('labourRatePerProduct');
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
const addProductionLineBtn = document.getElementById('addProductionLineBtn');
const productionMultiLines = document.getElementById('productionMultiLines');
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
const paySelectedLabourBtn = document.getElementById('paySelectedLabourBtn');
const downloadSelectedLabourPdfBtn = document.getElementById('downloadSelectedLabourPdfBtn');
const labourSelectAll = document.getElementById('labourSelectAll');
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
let currentLabourLedgerRunId = null;
let labourPayablesAll = [];
let showCompletedRunsOnly = false;
let appDefaultGstRate = 0;

function resolveGstRate(value, fallback = appDefaultGstRate) {
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

function inferHsnForFinishedGood(name = '', category = '') {
    const text = `${name || ''} ${category || ''}`.toLowerCase();
    if (!text.trim()) return '';
    if (/(rcc|pipe|septic|tank|manhole|concrete|cement)/.test(text)) return '6810';
    if (/(steel|tmt|bar|rod)/.test(text)) return '7214';
    return '';
}

async function loadBusinessDefaults(businessId) {
    if (!businessId) {
        appDefaultGstRate = 0;
        return;
    }
    try {
        const doc = await db.collection('users').doc(businessId).collection('settings').doc('business').get();
        const data = doc.exists ? (doc.data() || {}) : {};
        appDefaultGstRate = Number(data.gstRate ?? 0) || 0;
    } catch (error) {
        console.warn('Failed to load production business defaults', error);
        appDefaultGstRate = 0;
    }
}

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
    if (completeBatchIdInput) completeBatchIdInput.value = run.batchId || getRunBatchLabel(run);
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
    if (curingBatchIdInput) curingBatchIdInput.value = run.batchId || getRunBatchLabel(run);
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

window.editProductionRun = async (id) => {
    const run = productionData.find(r => r.id === id);
    if (!run) return;
    currentEditId = id;
    await openProductionModal();
    if (productionMultiLines) productionMultiLines.innerHTML = '';
    if (addProductionLineBtn) addProductionLineBtn.disabled = true;
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
    if (labourQtyInput) labourQtyInput.value = parseFloat(run.labourQty || run.quantityProduced || 0) || 0;
    if (labourRatePerProductInput) labourRatePerProductInput.value = parseFloat(run.labourRatePerProduct || 0) || 0;
    if (labourCostInput) labourCostInput.value = parseFloat(run.labourCost || 0) || 0;
    syncProductionLabourAmount();

    // Lock fields that would affect stock
    document.getElementById('produceQuantity').disabled = true;
    if (ingredientsContainer) {
        ingredientsContainer.querySelectorAll('input, select, button').forEach(el => el.disabled = true);
    }
};

document.addEventListener('DOMContentLoaded', async () => {
    await checkAuth();
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    await loadBusinessDefaults(user.businessId || user.uid);
    loadProductionHistory();

    window.addEventListener('sectionChanged', (e) => {
        if (e.detail === 'production') {
            loadProductionHistory();
        }
    });

    if (addProductionBtn) {
        addProductionBtn.addEventListener('click', openProductionModal);
    }
    if (toggleCompletedRunsBtn) {
        updateCompletedToggleButton();
        toggleCompletedRunsBtn.addEventListener('click', () => {
            showCompletedRunsOnly = !showCompletedRunsOnly;
            updateCompletedToggleButton();
            renderProductionRows(productionDataAll, JSON.parse(localStorage.getItem('user')) || {});
            renderLabourPaymentTracker(labourPayablesAll, productionData);
            applyProductionFilters();
        });
    }
    if (productionPipesSelectAll) {
        productionPipesSelectAll.addEventListener('change', () => {
            const cbs = productionTablePipes?.querySelectorAll('.prod-run-cb') || [];
            cbs.forEach(cb => { cb.checked = productionPipesSelectAll.checked; });
            updateProductionSelectionButtons();
        });
    }
    if (productionSepticSelectAll) {
        productionSepticSelectAll.addEventListener('change', () => {
            const cbs = productionTableSeptic?.querySelectorAll('.prod-run-cb') || [];
            cbs.forEach(cb => { cb.checked = productionSepticSelectAll.checked; });
            updateProductionSelectionButtons();
        });
    }
    if (deleteSelectedPipesBtn) {
        deleteSelectedPipesBtn.addEventListener('click', () => deleteSelectedProductionRuns('pipes'));
    }
    if (deleteSelectedSepticBtn) {
        deleteSelectedSepticBtn.addEventListener('click', () => deleteSelectedProductionRuns('septic'));
    }
    if (productionTablePipes) {
        productionTablePipes.addEventListener('change', (e) => {
            if (e.target.classList.contains('prod-run-cb')) updateProductionSelectionButtons();
        });
    }
    if (productionTableSeptic) {
        productionTableSeptic.addEventListener('change', (e) => {
            if (e.target.classList.contains('prod-run-cb')) updateProductionSelectionButtons();
        });
    }

    if (addIngredientBtn) {
        addIngredientBtn.addEventListener('click', () => addIngredientRow());
    }

    if (saveProductionBtn) {
        saveProductionBtn.addEventListener('click', saveProductionRun);
    }

    if (document.getElementById('produceQuantity')) {
        document.getElementById('produceQuantity').addEventListener('input', (e) => {
            if (labourQtyInput) labourQtyInput.value = e.target.value || '0';
            rescaleRecipeRowsForSingleRun();
            syncProductionLabourAmount();
            calculateCost();
        });
    }
    if (labourQtyInput) labourQtyInput.addEventListener('input', syncProductionLabourAmount);
    if (labourRatePerProductInput) labourRatePerProductInput.addEventListener('input', syncProductionLabourAmount);

    if (labourSelectAll) {
        labourSelectAll.addEventListener('change', function () {
            const cbs = labourPaymentsTable.querySelectorAll('.labour-row-cb');
            cbs.forEach(cb => { cb.checked = labourSelectAll.checked; });
            updateLabourSelectionButtons();
        });
    }
    if (paySelectedLabourBtn) {
        paySelectedLabourBtn.addEventListener('click', paySelectedLabourPayables);
    }
    if (downloadSelectedLabourPdfBtn) {
        downloadSelectedLabourPdfBtn.addEventListener('click', downloadSelectedLabourPdf);
    }
    if (labourPaymentsTable) {
        labourPaymentsTable.addEventListener('change', function (e) {
            if (e.target.classList.contains('labour-row-cb')) updateLabourSelectionButtons();
        });
    }
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
    if (addProductionLineBtn) {
        addProductionLineBtn.addEventListener('click', () => addProductionLineRow());
    }
    if (productionMultiLines) {
        productionMultiLines.addEventListener('click', (e) => {
            const btn = e.target.closest('.production-line-remove-btn');
            if (!btn) return;
            const row = btn.closest('.production-line-row');
            if (row) row.remove();
        });
        productionMultiLines.addEventListener('change', (e) => {
            const select = e.target.closest('.production-line-product');
            if (!select) return;
            const row = select.closest('.production-line-row');
            if (!row) return;
            const labourRateInput = row.querySelector('.production-line-labour-rate');
            if (!labourRateInput) return;
            labourRateInput.value = getProductDefaultLabourRate(select.value);
        });
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
        const text = `${run.productName || ''} ${run.batchId || ''} ${getRunDayLabel(run)} ${run.productionLocation || ''} ${run.curingLocation || ''} ${run.stockLocation || ''} ${run.septicLocation || ''}`.toLowerCase();
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
    await loadBusinessDefaults(businessId);

    const pipesBody = productionTablePipes.querySelector('tbody');
    const septicBody = productionTableSeptic.querySelector('tbody');
    pipesBody.innerHTML = '<tr><td colspan="7" class="text-center">Loading...</td></tr>';
    septicBody.innerHTML = '<tr><td colspan="7" class="text-center">Loading...</td></tr>';

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
            pipesBody.innerHTML = '<tr><td colspan="7" class="text-center text-muted">No pipe production records found</td></tr>';
            septicBody.innerHTML = '<tr><td colspan="7" class="text-center text-muted">No septic assembly records found</td></tr>';
            labourPayablesAll = [];
            renderLabourPaymentTracker([], []);
            updateProductionSelectionButtons();
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
        pipesBody.innerHTML = '<tr><td colspan="7" class="text-center text-danger">Error loading data</td></tr>';
        septicBody.innerHTML = '<tr><td colspan="7" class="text-center text-danger">Error loading data</td></tr>';
        labourPayablesAll = [];
        renderLabourPaymentTracker([], []);
        updateProductionSelectionButtons();
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

function renderProductionRows(runs, user) {
    const pipesBody = productionTablePipes.querySelector('tbody');
    const septicBody = productionTableSeptic.querySelector('tbody');
    pipesBody.innerHTML = '';
    septicBody.innerHTML = '';
    productionData = [];
    const visibleRuns = (runs || []).filter((run) => {
        const stage = getDerivedRunStage(run);
        return showCompletedRunsOnly ? stage === 'Completed' : stage !== 'Completed';
    });

    const septicRuns = [];
    const pipeRuns = [];
    visibleRuns.forEach(run => {
        const isSeptic = (run.productType || '').toLowerCase().includes('septic') || Boolean(run.sourceRunId);
        if (isSeptic) septicRuns.push(run);
        else pipeRuns.push(run);
    });

    if (!pipeRuns.length) {
        pipesBody.innerHTML = `<tr><td colspan="7" class="text-center text-muted">${showCompletedRunsOnly ? 'No completed pipe production records found' : 'No running pipe production records found'}</td></tr>`;
    }
    if (!septicRuns.length) {
        septicBody.innerHTML = `<tr><td colspan="7" class="text-center text-muted">${showCompletedRunsOnly ? 'No completed septic assembly records found' : 'No running septic assembly records found'}</td></tr>`;
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
            <div class="small text-muted">${getRunDayLabel(data)}</div>
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
            : '<div class="small text-muted mt-1">Workflow: Start -> On Curing -> Completed</div>';

        const primaryActionParts = [];
        if (waitingForCuringQty > 0) {
            primaryActionParts.push(`<button class="btn btn-sm btn-warning" title="${movedToCuringQty > 0 ? 'Move Remaining To Curing' : 'Move To Curing'}" onclick="window.startCuring('${data.id}')"><i class="fas fa-hourglass-start"></i></button>`);
        }
        if (onCuringQty > 0) {
            primaryActionParts.push(`<button class="btn btn-sm btn-success" title="Complete Curing" onclick="window.completeCuring('${data.id}')"><i class="fas fa-check-circle"></i></button>`);
        }
        if (!isSepticAssembly && goodQty > 0) {
            primaryActionParts.push(`<button class="btn btn-sm btn-outline-secondary" title="Allocate Septic" onclick="window.allocateSeptic('${data.id}')"><i class="fas fa-sitemap"></i></button>`);
        }
        const actionsRow = `
            <div class="production-actions-row">
                ${primaryActionParts.join('')}
                <button class="btn btn-sm btn-outline-primary" title="Edit" onclick="window.editProductionRun('${data.id}')"><i class="fas fa-pen"></i></button>
                ${canDelete ? `<button class="btn btn-sm btn-outline-danger" title="Delete" onclick="window.deleteProductionRun('${data.id}')"><i class="fas fa-trash"></i></button>` : ''}
            </div>
        `;

        const mainRow = `
            <tr>
                <td><input type="checkbox" class="form-check-input prod-run-cb" data-id="${data.id}" ${canDelete ? '' : 'disabled'}></td>
                <td>${dateCell}</td>
                <td class="fw-bold text-primary">${data.finishedGoodName || '-'}${productMeta}${sourceText}</td>
                <td>${qtyCell}</td>
                <td>${stageBadge}${stageHint}</td>
                <td class="small">${locationText}</td>
                <td class="production-action-cell">
                    ${actionsRow}
                </td>
            </tr>
        `;
        const workflowRow = '';
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

function getRunDayLabel(runOrDate) {
    const dt = runOrDate?.date ? toJsDate(runOrDate.date) : toJsDate(runOrDate);
    if (!dt) return '-';
    return dt.toLocaleDateString(undefined, { weekday: 'long' });
}

function getWeekOfMonth(runOrDate) {
    const dt = runOrDate?.date ? toJsDate(runOrDate.date) : toJsDate(runOrDate);
    if (!dt) return null;
    return Math.floor((dt.getDate() - 1) / 7) + 1;
}

function getRunBatchLabel(runOrDate) {
    const day = getRunDayLabel(runOrDate);
    const week = getWeekOfMonth(runOrDate);
    if (day === '-') return '-';
    return week ? `${day} W${week}` : day;
}

function syncProductionLabourAmount() {
    if (!labourCostInput) return;
    const qty = parseFloat(labourQtyInput?.value || '0') || 0;
    const rate = parseFloat(labourRatePerProductInput?.value || '0') || 0;
    labourCostInput.value = (qty * rate).toFixed(2);
}

function updateCompletedToggleButton() {
    if (!toggleCompletedRunsBtn) return;
    if (showCompletedRunsOnly) {
        toggleCompletedRunsBtn.innerHTML = '<i class="fas fa-list me-1"></i> Running';
        toggleCompletedRunsBtn.classList.remove('btn-outline-dark');
        toggleCompletedRunsBtn.classList.add('btn-dark');
    } else {
        toggleCompletedRunsBtn.innerHTML = '<i class="fas fa-eye me-1"></i> Completed';
        toggleCompletedRunsBtn.classList.remove('btn-dark');
        toggleCompletedRunsBtn.classList.add('btn-outline-dark');
    }
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
            <td colspan="7">
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
        productMasterItems = productSnap.docs.map(doc => {
            const data = doc.data() || {};
            return { id: doc.id, ...data, gstRate: resolveGstRate(data.gstRate) };
        });

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
    refreshProductionLineOptions();
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


function normalizeLabourDate(value) {
    const dt = toJsDate(value);
    if (!dt) return '';
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, '0');
    const d = String(dt.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function roundMoney(value) {
    return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function formatMoney(value) {
    return `Rs ${roundMoney(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function applyProductMasterSelection() {
    if (!prodProductMasterSelect) return;
    const id = prodProductMasterSelect.value;
    const p = productMasterItems.find(item => item.id === id);
    if (!p) {
        if (productDetailsDiv) productDetailsDiv.textContent = '';
        applyProductRawMaterialsToRun(null);
        if (labourRatePerProductInput) labourRatePerProductInput.value = '0';
        syncProductionLabourAmount();
        calculateCost();
        return;
    }
    const name = p.name || p.productName || '';
    const category = p.category || p.productCategory || '';
    const pipeType = p.pipeType || '';
    const loadClass = p.loadClass || '';
    const details = [category, pipeType, loadClass].filter(Boolean).join(' | ');
    applyProductRawMaterialsToRun(p);
    const labourRate = parseFloat(p.labourCostPerProduct ?? p.labourRatePerProduct ?? 0) || 0;
    if (labourRatePerProductInput) labourRatePerProductInput.value = labourRate;
    syncProductionLabourAmount();
    calculateCost();
    if (productDetailsDiv) productDetailsDiv.textContent = details ? `Master: ${name} | ${details}` : `Master: ${name}`;
}

function buildProductionLineOptions(selectedId = '') {
    const base = '<option value="">Select Product...</option>';
    const options = (productMasterItems || []).map((p) => {
        const name = p.name || p.productName || 'Product';
        const category = p.category || p.productCategory || '';
        const selected = String(selectedId) === String(p.id) ? 'selected' : '';
        return `<option value="${p.id}" ${selected}>${category ? `${name} (${category})` : name}</option>`;
    }).join('');
    return `${base}${options}`;
}

function getProductDefaultLabourRate(productMasterId = '') {
    const pm = (productMasterItems || []).find(p => String(p.id) === String(productMasterId));
    return parseFloat(pm?.labourCostPerProduct ?? pm?.labourRatePerProduct ?? 0) || 0;
}

function addProductionLineRow(preSelectedId = '', preQty = '', preLabourRate = '') {
    if (!productionMultiLines) return;
    const rowId = `prod-line-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const defaultRate = preLabourRate !== '' ? preLabourRate : (preSelectedId ? getProductDefaultLabourRate(preSelectedId) : '');
    const html = `
        <div class="row g-2 mb-2 align-items-end production-line-row" id="${rowId}">
            <div class="col-md-5">
                <label class="form-label small">Product Master</label>
                <select class="form-select form-select-sm production-line-product">
                    ${buildProductionLineOptions(preSelectedId)}
                </select>
            </div>
            <div class="col-md-3">
                <label class="form-label small">Quantity</label>
                <input type="number" class="form-control form-control-sm production-line-qty" min="1" step="1" value="${preQty || ''}">
            </div>
            <div class="col-md-3">
                <label class="form-label small">Labour Rate / Product</label>
                <input type="number" class="form-control form-control-sm production-line-labour-rate" min="0" step="0.01" value="${defaultRate}">
            </div>
            <div class="col-md-1 d-grid">
                <button type="button" class="btn btn-outline-danger btn-sm production-line-remove-btn">x</button>
            </div>
        </div>
    `;
    productionMultiLines.insertAdjacentHTML('beforeend', html);
}

function refreshProductionLineOptions() {
    if (!productionMultiLines) return;
    productionMultiLines.querySelectorAll('.production-line-product').forEach((select) => {
        const selected = select.value || '';
        select.innerHTML = buildProductionLineOptions(selected);
    });

    updateProductionSelectionButtons();
}

function getProductionLineItems() {
    if (!productionMultiLines) return [];
    const rows = [];
    productionMultiLines.querySelectorAll('.production-line-row').forEach((row) => {
        const productMasterId = row.querySelector('.production-line-product')?.value || '';
        const quantity = parseFloat(row.querySelector('.production-line-qty')?.value || '0') || 0;
        const labourRatePerProduct = parseFloat(row.querySelector('.production-line-labour-rate')?.value || '0') || 0;
        if (!productMasterId || quantity <= 0) return;
        rows.push({ productMasterId, quantity, labourRatePerProduct });
    });
    return rows;
}

function isRawMaterialInventoryItem(item = {}) {
    const category = (item.category || '').toString().trim().toLowerCase();
    const name = (item.name || '').toString().trim().toLowerCase();
    const source = (item.source || '').toString().trim().toLowerCase();

    const blockedCategoryTokens = [
        'finished',
        'rcc pipe',
        'rcc pipes',
        'septic',
        'water tank',
        'product',
        'fg'
    ];
    if (blockedCategoryTokens.some(token => category.includes(token))) return false;
    if (source === 'product_master') return false;

    const rawCategoryTokens = [
        'raw',
        'cement',
        'sand',
        'dust',
        'aggregate',
        'steel',
        'fly ash',
        'admixture',
        'chemical'
    ];
    if (rawCategoryTokens.some(token => category.includes(token))) return true;

    const rawNameTokens = ['cement', 'sand', 'dust', 'aggregate', 'steel', 'fly ash', 'admixture', 'chemical'];
    return rawNameTokens.some(token => name.includes(token));
}

function addIngredientRow(preSelectedId = null, preQty = null) {
    if (!ingredientsContainer) return;
    const rowId = Date.now();
    const rawMaterialItems = (inventoryItems || []).filter(isRawMaterialInventoryItem);
    const options = rawMaterialItems.map(item =>
        `<option value="${item.id}" ${preSelectedId === item.id ? 'selected' : ''}>${item.name || item.id}${item.category ? ` [${item.category}]` : ''}</option>`
    ).join('');
    const html = `
        <div class="row g-2 mb-2 align-items-end ingredient-row" id="row-${rowId}">
            <div class="col-md-7">
                <label class="form-label small">Raw Material</label>
                <select class="form-select form-select-sm ingredient-select">
                    <option value="">${rawMaterialItems.length ? 'Select Material...' : 'No raw materials found'}</option>
                    ${options}
                </select>
            </div>
            <div class="col-md-4">
                <label class="form-label small">Quantity Used</label>
                <input type="number" class="form-control form-control-sm ingredient-qty" min="0" step="0.01" value="${preQty || ''}">
            </div>
            <div class="col-md-1 d-grid">
                <button type="button" class="btn btn-outline-danger btn-sm remove-ingredient-btn">x</button>
            </div>
        </div>`;
    ingredientsContainer.insertAdjacentHTML('beforeend', html);
}

function resolveRecipeMaterialId(row = {}) {
    const directId = String(
        row.id ?? row.materialId ?? row.itemId ?? row.inventoryId ?? row.rawMaterialId ?? ''
    ).trim();
    if (directId) return directId;

    const nameRaw = String(
        row.name ?? row.materialName ?? row.itemName ?? row.rawMaterialName ?? ''
    ).trim().toLowerCase();
    if (!nameRaw) return '';

    const match = (inventoryItems || []).find((item) => String(item?.name || '').trim().toLowerCase() === nameRaw);
    return match?.id || '';
}

function resolveRecipeBaseQty(row = {}) {
    const candidates = [
        row.quantity,
        row.qty,
        row.quantityPerUnit,
        row.perUnitQty,
        row.baseQty,
        row.requiredQty
    ];
    for (const value of candidates) {
        const n = parseFloat(value);
        if (Number.isFinite(n) && n > 0) return n;
    }
    return 0;
}

function applyProductRawMaterialsToRun(productMaster = null) {
    if (!ingredientsContainer) return;
    ingredientsContainer.innerHTML = '';
    const rawMaterials = Array.isArray(productMaster?.rawMaterials)
        ? productMaster.rawMaterials
        : (Array.isArray(productMaster?.ingredients) ? productMaster.ingredients : []);
    const produceQty = Math.max(1, parseFloat(document.getElementById('produceQuantity')?.value || '1') || 1);
    const validRows = rawMaterials.filter((row) => {
        const id = resolveRecipeMaterialId(row);
        const qty = resolveRecipeBaseQty(row);
        return id && qty > 0;
    });
    if (!validRows.length) {
        addIngredientRow();
        return;
    }
    validRows.forEach((row) => {
        const id = resolveRecipeMaterialId(row);
        const baseQty = resolveRecipeBaseQty(row);
        const scaledQty = roundMoney(baseQty * produceQty);
        addIngredientRow(id, scaledQty);
        const latestRow = ingredientsContainer.querySelector('.ingredient-row:last-child');
        const qtyInput = latestRow?.querySelector('.ingredient-qty');
        if (qtyInput) qtyInput.dataset.baseQty = String(baseQty);
    });
}

function rescaleRecipeRowsForSingleRun() {
    if (!ingredientsContainer) return;
    const produceQty = Math.max(1, parseFloat(document.getElementById('produceQuantity')?.value || '1') || 1);
    ingredientsContainer.querySelectorAll('.ingredient-row .ingredient-qty').forEach((input) => {
        const baseQty = parseFloat(input.dataset.baseQty || '');
        if (!Number.isFinite(baseQty)) return;
        input.value = String(roundMoney(baseQty * produceQty));
    });
}

function calculateCost() {
    if (!estimatedCostElement) return;
    let total = 0;
    document.querySelectorAll('.ingredient-row').forEach(row => {
        const id = row.querySelector('.ingredient-select')?.value;
        const qty = parseFloat(row.querySelector('.ingredient-qty')?.value || '0') || 0;
        const item = (inventoryItems || []).find(i => i.id === id);
        const cost = parseFloat(item?.costPrice || 0) || 0;
        total += qty * cost;
    });
    const labour = parseFloat(labourCostInput?.value || '0') || 0;
    estimatedCostElement.textContent = formatMoney(total + labour);
}

async function openProductionModal() {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    const businessId = user.businessId || user.uid;
    if (!businessId) return;
    try {
        await loadProductionMasters(businessId);
        const snapshot = await db.collection('users').doc(businessId).collection('inventory').get();
        inventoryItems = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        const form = document.getElementById('productionForm');
        if (form) form.reset();
        if (productionMultiLines) productionMultiLines.innerHTML = '';
        if (addProductionLineBtn) addProductionLineBtn.disabled = false;
        applyProductRawMaterialsToRun(null);
        if (labourQtyInput) labourQtyInput.value = '0';
        if (labourRatePerProductInput) labourRatePerProductInput.value = '0';
        if (labourCostInput) labourCostInput.value = '0';
        const dateInput = document.getElementById('productionDate');
        if (dateInput) dateInput.valueAsDate = new Date();
        if (productDetailsDiv) productDetailsDiv.textContent = '';
        if (stockStatusBadge) stockStatusBadge.textContent = 'Status: Pending';
        currentEditId = null;
        calculateCost();
        if (productionModal) new bootstrap.Modal(productionModal).show();
    } catch (error) {
        console.error('openProductionModal failed', error);
        showAlert('danger', 'Failed to open production form');
    }
}

async function saveProductionRun() {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    const businessId = user.businessId || user.uid;
    if (!businessId) return;

    const productionDateVal = document.getElementById('productionDate')?.value || '';
    const brokenQty = parseFloat(document.getElementById('brokenQuantity')?.value || '0') || 0;
    const wastageQty = parseFloat(document.getElementById('wastageQuantity')?.value || '0') || 0;
    if (!prodCastingLocationSelect?.value) return showAlert('danger', 'Please select production location.');

    // For edit, keep legacy single-run behavior.
    if (currentEditId) {
        const produceQty = parseFloat(document.getElementById('produceQuantity')?.value || '0') || 0;
        const productMasterId = prodProductMasterSelect?.value || '';
        const selectedProductMaster = productMasterItems.find(p => p.id === productMasterId);
        const labourQty = parseFloat(labourQtyInput?.value || produceQty || '0') || 0;
        const labourRatePerProduct = parseFloat(labourRatePerProductInput?.value || '0') || 0;
        const labourCost = roundMoney(labourQty * labourRatePerProduct);
        if (!selectedProductMaster) return showAlert('danger', 'Please select Product Master.');
        if (!produceQty || produceQty <= 0) return showAlert('danger', 'Please enter a valid quantity.');

        const ingredientsUsedSingle = [];
        document.querySelectorAll('.ingredient-row').forEach(row => {
            const select = row.querySelector('.ingredient-select');
            const qtyInput = row.querySelector('.ingredient-qty');
            const id = select?.value || '';
            const qty = parseFloat(qtyInput?.value || '0') || 0;
            if (!id || qty <= 0) return;
            const item = inventoryItems.find(i => i.id === id);
            ingredientsUsedSingle.push({ id, name: item?.name || 'Material', quantity: qty, unit: item?.unit || '' });
        });

        const saveBtn = saveProductionBtn;
        const originalText = saveBtn?.innerHTML || '';
        if (saveBtn) {
            saveBtn.disabled = true;
            saveBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Saving...';
        }
        try {
            const userRef = db.collection('users').doc(businessId);
            const productionDate = productionDateVal ? new Date(productionDateVal) : new Date();
            const fgName = selectedProductMaster.name || selectedProductMaster.productName || 'Product';
            await userRef.collection('production_runs').doc(currentEditId).update({
                date: productionDate,
                quantityProduced: produceQty,
                ingredients: ingredientsUsedSingle,
                productMasterId: selectedProductMaster.id,
                productMasterName: fgName,
                productType: selectedProductMaster.category || '',
                pipeType: selectedProductMaster.pipeType || '',
                loadClass: selectedProductMaster.loadClass || '',
                productionLocationId: prodCastingLocationSelect?.value || null,
                productionLocation: prodCastingLocationSelect?.selectedOptions?.[0]?.dataset.locationName || null,
                labourQty,
                labourRatePerProduct,
                labourCost,
                brokenQuantity: brokenQty,
                wastageQuantity: wastageQty,
                updatedAt: new Date()
            });
            bootstrap.Modal.getInstance(productionModal)?.hide();
            showAlert('success', 'Production updated.');
            currentEditId = null;
            await loadProductionHistory();
        } catch (error) {
            console.error('saveProductionRun failed', error);
            showAlert('danger', error.message || 'Failed to save production.');
        } finally {
            if (saveBtn) {
                saveBtn.disabled = false;
                saveBtn.innerHTML = originalText || 'Start Production';
            }
        }
        return;
    }

    // New-run flow: treat main run + multiple lines as a single list of runs.
    const runInputs = [];
    const mainProductMasterId = prodProductMasterSelect?.value || '';
    const mainQty = parseFloat(document.getElementById('produceQuantity')?.value || '0') || 0;
    if (mainProductMasterId || mainQty > 0) {
        if (!mainProductMasterId || mainQty <= 0) {
            return showAlert('danger', 'For main run, select product and enter valid quantity.');
        }
        runInputs.push({
            productMasterId: mainProductMasterId,
            quantity: mainQty,
            labourRatePerProduct: parseFloat(labourRatePerProductInput?.value || '0') || 0,
            source: 'main'
        });
    }
    const multiLineItems = getProductionLineItems();
    multiLineItems.forEach((line) => {
        runInputs.push({
            productMasterId: line.productMasterId,
            quantity: parseFloat(line.quantity || '0') || 0,
            labourRatePerProduct: parseFloat(line.labourRatePerProduct || '0') || 0,
            source: 'line'
        });
    });
    if (!runInputs.length) return showAlert('danger', 'Add at least one run (main or product lines).');

    const runsToCreate = runInputs.map((line) => {
        const pm = productMasterItems.find(p => p.id === line.productMasterId);
        return { line, pm };
    });
    const missing = runsToCreate.find(item => !item.pm);
    if (missing) return showAlert('danger', 'One or more selected product masters are invalid.');

    const saveBtn = saveProductionBtn;
    const originalText = saveBtn?.innerHTML || '';
    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Saving...';
    }

    try {
        const userRef = db.collection('users').doc(businessId);
        const productionDate = productionDateVal ? new Date(productionDateVal) : new Date();
        const batchId = getRunBatchLabel(productionDate);
        const productToFgId = {};
        const productToHsn = {};

        for (const item of runsToCreate) {
            const pm = item.pm;
            const fgName = pm.name || pm.productName || 'Product';
            if (productToFgId[pm.id]) continue;
            const fgSnap = await userRef.collection('inventory').where('name', '==', fgName).limit(1).get();
            const existingFg = fgSnap.empty ? null : (fgSnap.docs[0].data() || {});
            const resolvedHsn = resolveHsn(
                pm.hsn,
                existingFg?.hsn,
                inferHsnForFinishedGood(fgName, pm.category || pm.productCategory || '')
            );
            if (fgSnap.empty) {
                const fgRef = await userRef.collection('inventory').add({
                    name: fgName,
                    category: 'Finished Goods',
                    unit: pm.unit || 'Nos',
                    quantity: 0,
                    costPrice: Number(pm.costPrice || 0),
                    sellingPrice: Number(pm.sellingPrice || 0),
                    hsn: resolvedHsn,
                    gstRate: resolveGstRate(pm.gstRate),
                    createdAt: new Date(),
                    updatedAt: new Date()
                });
                productToFgId[pm.id] = fgRef.id;
                productToHsn[pm.id] = resolvedHsn;
            } else {
                productToFgId[pm.id] = fgSnap.docs[0].id;
                productToHsn[pm.id] = resolvedHsn;
                await userRef.collection('inventory').doc(productToFgId[pm.id]).set({
                    category: 'Finished Goods',
                    unit: pm.unit || 'Nos',
                    costPrice: Number(pm.costPrice || 0),
                    sellingPrice: Number(pm.sellingPrice || 0),
                    hsn: resolvedHsn,
                    gstRate: resolveGstRate(pm.gstRate),
                    updatedAt: new Date()
                }, { merge: true });
            }
        }

        await db.runTransaction(async (tx) => {
            const requiredByIngredient = new Map();
            const preparedRuns = runsToCreate.map(({ line, pm }) => {
                const produceQty = parseFloat(line.quantity || '0') || 0;
                const defaultRate = parseFloat(pm.labourCostPerProduct ?? pm.labourRatePerProduct ?? 0) || 0;
                const labourRatePerProduct = Number.isFinite(Number(line.labourRatePerProduct)) ? Number(line.labourRatePerProduct) : defaultRate;
                const labourQty = produceQty;
                const labourCost = roundMoney(labourQty * labourRatePerProduct);
                const masterIngredients = Array.isArray(pm.rawMaterials) ? pm.rawMaterials : (Array.isArray(pm.ingredients) ? pm.ingredients : []);

                // If main run has no recipe in Product Master, allow manual ingredient rows as fallback.
                let ingredients = [];
                if (masterIngredients.length > 0) {
                    ingredients = masterIngredients.map((row) => {
                        const id = resolveRecipeMaterialId(row);
                        const baseQty = resolveRecipeBaseQty(row);
                        const qty = roundMoney(baseQty * produceQty);
                        if (!id || qty <= 0) return null;
                        const inv = inventoryItems.find(i => i.id === id);
                        return {
                            id,
                            name: inv?.name || row?.name || row?.materialName || 'Material',
                            quantity: qty,
                            unit: inv?.unit || row?.unit || ''
                        };
                    }).filter(Boolean);
                } else if (line.source === 'main') {
                    document.querySelectorAll('.ingredient-row').forEach((row) => {
                        const id = row.querySelector('.ingredient-select')?.value || '';
                        const qty = parseFloat(row.querySelector('.ingredient-qty')?.value || '0') || 0;
                        if (!id || qty <= 0) return;
                        const inv = inventoryItems.find(i => i.id === id);
                        ingredients.push({ id, name: inv?.name || 'Material', quantity: qty, unit: inv?.unit || '' });
                    });
                }

                ingredients.forEach((ing) => {
                    const prev = requiredByIngredient.get(ing.id) || { qty: 0, name: ing.name };
                    requiredByIngredient.set(ing.id, { qty: roundMoney(prev.qty + ing.quantity), name: ing.name || prev.name });
                });

                return {
                    pm,
                    produceQty,
                    labourQty,
                    labourRatePerProduct,
                    labourCost,
                    ingredients,
                    fgId: productToFgId[pm.id],
                    fgName: pm.name || pm.productName || 'Product'
                };
            });

            const ingredientReadResults = [];
            for (const [ingId, req] of requiredByIngredient.entries()) {
                const ingRef = userRef.collection('inventory').doc(ingId);
                const ingDoc = await tx.get(ingRef);
                if (!ingDoc.exists) throw new Error(`Material not found: ${req.name}`);
                const currentQty = Number(ingDoc.data().quantity || 0);
                if (currentQty < req.qty) throw new Error(`Insufficient stock for ${req.name}. Available: ${currentQty}`);
                ingredientReadResults.push({ ingRef, nextQty: roundMoney(currentQty - req.qty) });
            }

            ingredientReadResults.forEach(({ ingRef, nextQty }) => {
                tx.update(ingRef, { quantity: nextQty, updatedAt: new Date() });
            });

            preparedRuns.forEach((run) => {
                const runRef = userRef.collection('production_runs').doc();
                tx.set(runRef, {
                    batchId,
                    date: productionDate,
                    finishedGoodId: run.fgId,
                    finishedGoodName: run.fgName,
                    productMasterId: run.pm.id,
                    productMasterName: run.fgName,
                    productType: run.pm.category || '',
                    pipeType: run.pm.pipeType || '',
                    loadClass: run.pm.loadClass || '',
                    hsn: resolveHsn(
                        productToHsn[run.pm.id],
                        run.pm.hsn,
                        inferHsnForFinishedGood(run.fgName, run.pm.category || run.pm.productCategory || '')
                    ),
                    gstRate: resolveGstRate(run.pm.gstRate),
                    costPrice: Number(run.pm.costPrice || 0),
                    sellingPrice: Number(run.pm.sellingPrice || 0),
                    unit: run.pm.unit || 'Nos',
                    productionLocationId: prodCastingLocationSelect?.value || null,
                    productionLocation: prodCastingLocationSelect?.selectedOptions?.[0]?.dataset.locationName || null,
                    septicLocationId: null,
                    septicLocation: null,
                    quantityProduced: run.produceQty,
                    brokenQuantity: brokenQty,
                    wastageQuantity: wastageQty,
                    ingredients: run.ingredients,
                    labourCost: run.labourCost,
                    labourQty: run.labourQty,
                    labourRatePerProduct: run.labourRatePerProduct,
                    powerCost: 0,
                    labourCostMode: 'per_product',
                    status: 'Started',
                    curingQty: 0,
                    goodQty: 0,
                    rejectedQuantity: 0,
                    internalUseQty: 0,
                    createdAt: new Date(),
                    updatedAt: new Date()
                });
            });
        });

        bootstrap.Modal.getInstance(productionModal)?.hide();
        showAlert('success', `${runsToCreate.length} production run(s) saved.`);
        await loadProductionHistory();
    } catch (error) {
        console.error('saveProductionRun failed', error);
        showAlert('danger', error.message || 'Failed to save production.');
    } finally {
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.innerHTML = originalText || 'Start Production';
        }
    }
}

async function saveMoveToCuring() {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    const businessId = user.businessId || user.uid;
    if (!businessId || !currentCuringRunId) return;
    const qty = parseFloat(curingQtyInput?.value || '0') || 0;
    const locId = curingToLocationSelect?.value || '';
    const locName = curingToLocationSelect?.selectedOptions?.[0]?.dataset.locationName || '';
    if (qty <= 0) return showAlert('danger', 'Enter valid quantity.');
    if (!locId) return showAlert('danger', 'Select curing location.');
    const run = productionData.find(r => r.id === currentCuringRunId);
    if (!run) return;
    const flow = getRunFlowMetrics(run);
    if (qty > flow.waitingForCuringQty) return showAlert('danger', `Max allowed is ${flow.waitingForCuringQty}`);
    try {
        await db.collection('users').doc(businessId).collection('production_runs').doc(currentCuringRunId).update({
            curingQty: roundMoney(Number(run.curingQty || 0) + qty),
            curingLocationId: locId,
            curingLocation: locName || null,
            curingStart: run.curingStart || new Date(),
            status: 'On Curing',
            updatedAt: new Date()
        });
        bootstrap.Modal.getInstance(moveToCuringModal)?.hide();
        currentCuringRunId = null;
        showAlert('success', 'Moved to curing.');
        await loadProductionHistory();
    } catch (error) {
        console.error('saveMoveToCuring failed', error);
        showAlert('danger', 'Failed to save curing move.');
    }
}

async function saveCuringComplete() {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    const businessId = user.businessId || user.uid;
    if (!businessId || !currentCompleteRunId) return;
    const passedQty = parseFloat(completePassedQtyInput?.value || '0') || 0;
    const damagedQty = parseFloat(completeDamagedQtyInput?.value || '0') || 0;
    const locId = completeReadyLocationSelect?.value || '';
    const locName = completeReadyLocationSelect?.selectedOptions?.[0]?.dataset.locationName || '';
    const completedDate = completeDateInput?.value ? new Date(completeDateInput.value) : new Date();
    if (passedQty <= 0) return showAlert('danger', 'Enter passed quantity.');
    if (damagedQty < 0 || damagedQty > passedQty) return showAlert('danger', 'Damaged qty should be between 0 and passed qty.');
    if (!locId) return showAlert('danger', 'Select ready stock location.');
    const run = productionData.find(r => r.id === currentCompleteRunId);
    if (!run) return;
    const flow = getRunFlowMetrics(run);
    if (passedQty > flow.onCuringQty) return showAlert('danger', `Max on-curing qty is ${flow.onCuringQty}`);

    const goodIncrement = Math.max(0, passedQty - damagedQty);
    const newGood = roundMoney(Number(run.goodQty || 0) + goodIncrement);
    const newRejected = roundMoney(Number(run.rejectedQuantity || 0) + damagedQty);
    const produced = Number(run.quantityProduced || 0);
    const moved = Number(run.curingQty || 0);
    const processed = newGood + newRejected;
    const status = (produced > 0 && moved >= produced && processed >= moved) ? 'Completed' : 'On Curing';

    try {
        await db.runTransaction(async (tx) => {
            const userRef = db.collection('users').doc(businessId);
            const runRef = userRef.collection('production_runs').doc(currentCompleteRunId);
            const runDoc = await tx.get(runRef);
            if (!runDoc.exists) {
                throw new Error('Production run not found. It may have been deleted.');
            }
            let fgRef = null;
            let fgExists = false;
            let fgCurrentQty = 0;
            let fgExistingHsn = '';
            if (goodIncrement > 0 && run.finishedGoodId) {
                fgRef = userRef.collection('inventory').doc(run.finishedGoodId);
                const fgDoc = await tx.get(fgRef);
                if (fgDoc.exists) {
                    fgExists = true;
                    fgCurrentQty = Number(fgDoc.data().quantity || 0);
                    fgExistingHsn = String(fgDoc.data().hsn || '').trim();
                }
            }

            tx.update(runRef, {
                goodQty: newGood,
                rejectedQuantity: newRejected,
                stockLocationId: locId,
                stockLocation: locName || null,
                completedAt: completedDate,
                status,
                updatedAt: new Date()
            });

            if (fgRef) {
                const fallbackHsn = resolveHsn(
                    run.hsn,
                    fgExistingHsn,
                    inferHsnForFinishedGood(run.finishedGoodName, run.productType || '')
                );
                if (fgExists) {
                    tx.update(fgRef, {
                        quantity: roundMoney(fgCurrentQty + goodIncrement),
                        category: 'Finished Goods',
                        unit: run.unit || 'Nos',
                        costPrice: Number(run.costPrice || 0),
                        sellingPrice: Number(run.sellingPrice || 0),
                        hsn: fallbackHsn,
                        gstRate: resolveGstRate(run.gstRate),
                        updatedAt: new Date()
                    });
                } else {
                    tx.set(fgRef, {
                        name: run.finishedGoodName || 'Finished Good',
                        category: 'Finished Goods',
                        unit: run.unit || 'Nos',
                        quantity: roundMoney(goodIncrement),
                        costPrice: Number(run.costPrice || 0),
                        sellingPrice: Number(run.sellingPrice || 0),
                        hsn: fallbackHsn,
                        gstRate: resolveGstRate(run.gstRate),
                        createdAt: new Date(),
                        updatedAt: new Date()
                    }, { merge: true });
                }
            }
        });
        bootstrap.Modal.getInstance(curingCompleteModal)?.hide();
        currentCompleteRunId = null;
        showAlert('success', 'Curing completion saved.');
        await loadProductionHistory();
    } catch (error) {
        console.error('saveCuringComplete failed', error);
        showAlert('danger', 'Failed to complete curing.');
    }
}

async function saveSepticAllocation() {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    const businessId = user.businessId || user.uid;
    if (!businessId || !currentSepticRunId) return;
    const qty = parseFloat(septicAllocationQtyInput?.value || '0') || 0;
    const locId = septicAllocationLocationSelect?.value || '';
    const locName = septicAllocationLocationSelect?.selectedOptions?.[0]?.dataset.locationName || '';
    const septicProductId = septicAllocationProductSelect?.value || '';
    const septicProduct = productMasterItems.find(p => p.id === septicProductId);
    if (qty <= 0) return showAlert('danger', 'Enter valid quantity.');
    if (!locId) return showAlert('danger', 'Select septic location.');
    if (!septicProduct) return showAlert('danger', 'Select septic product.');
    const sourceRun = productionData.find(r => r.id === currentSepticRunId);
    if (!sourceRun) return;
    const flow = getRunFlowMetrics(sourceRun);
    if (qty > flow.availableQty) return showAlert('danger', `Max available qty is ${flow.availableQty}`);

    try {
        const userRef = db.collection('users').doc(businessId);
        const fgName = septicProduct.name || septicProduct.productName || 'Septic Assembly';

        // Find or create Finished Good
        const fgSnap = await userRef.collection('inventory').where('name', '==', fgName).limit(1).get();
        let fgId = '';
        const existingFg = fgSnap.empty ? null : (fgSnap.docs[0].data() || {});
        const resolvedHsn = resolveHsn(
            septicProduct.hsn,
            existingFg?.hsn,
            inferHsnForFinishedGood(fgName, septicProduct.category || septicProduct.productCategory || '')
        );
        if (fgSnap.empty) {
            const fgRef = await userRef.collection('inventory').add({
                name: fgName,
                category: 'Finished Goods',
                unit: septicProduct.unit || 'Nos',
                quantity: 0,
                costPrice: Number(septicProduct.costPrice || 0),
                sellingPrice: Number(septicProduct.sellingPrice || 0),
                hsn: resolvedHsn,
                gstRate: resolveGstRate(septicProduct.gstRate),
                createdAt: new Date(),
                updatedAt: new Date()
            });
            fgId = fgRef.id;
        } else {
            fgId = fgSnap.docs[0].id;
            await userRef.collection('inventory').doc(fgId).set({
                category: 'Finished Goods',
                unit: septicProduct.unit || 'Nos',
                costPrice: Number(septicProduct.costPrice || 0),
                sellingPrice: Number(septicProduct.sellingPrice || 0),
                hsn: resolvedHsn,
                gstRate: resolveGstRate(septicProduct.gstRate),
                updatedAt: new Date()
            }, { merge: true });
        }

        await db.runTransaction(async (tx) => {
            const srcRef = userRef.collection('production_runs').doc(currentSepticRunId);
            const srcDoc = await tx.get(srcRef);
            if (!srcDoc.exists) throw new Error('Source run not found');
            const src = srcDoc.data();

            const fgRef = userRef.collection('inventory').doc(fgId);
            const fgDoc = await tx.get(fgRef);
            const currentFgQty = fgDoc.exists ? Number(fgDoc.data().quantity || 0) : 0;

            tx.update(srcRef, {
                internalUseQty: roundMoney(Number(src.internalUseQty || 0) + qty),
                septicLocationId: locId,
                septicLocation: locName || null,
                septicProductMasterId: septicProductId,
                updatedAt: new Date()
            });

            tx.update(fgRef, {
                quantity: roundMoney(currentFgQty + qty),
                updatedAt: new Date()
            });

            const newRunRef = userRef.collection('production_runs').doc();
            tx.set(newRunRef, {
                batchId: normalizeLabourDate(new Date()),
                date: new Date(),
                finishedGoodId: fgId,
                finishedGoodName: fgName,
                productType: septicProduct.category || 'Septic Tank',
                pipeType: septicProduct.pipeType || '',
                loadClass: septicProduct.loadClass || '',
                sourceRunId: currentSepticRunId,
                sourceBatchId: src.batchId || null,
                sourceProductName: src.finishedGoodName || null,
                quantityProduced: qty,
                goodQty: qty,
                rejectedQuantity: 0,
                internalUseQty: 0,
                productionLocationId: locId,
                productionLocation: locName || null,
                stockLocationId: locId,
                stockLocation: locName || null,
                labourCost: 0,
                labourQty: 0,
                labourRatePerProduct: 0,
                labourCostMode: 'per_product',
                status: 'Completed',
                createdAt: new Date(),
                updatedAt: new Date()
            });
        });
        bootstrap.Modal.getInstance(septicAllocationModal)?.hide();
        currentSepticRunId = null;
        showAlert('success', 'Septic allocation saved and inventory updated.');
        await loadProductionHistory();
    } catch (error) {
        console.error('saveSepticAllocation failed', error);
        showAlert('danger', error.message || 'Failed septic allocation.');
    }
}

function getSelectedProductionRunIds(scope = 'all') {
    const selected = new Set();
    let selector = '.prod-run-cb:checked';
    if (scope === 'pipes') selector = '#productionTablePipes .prod-run-cb:checked';
    if (scope === 'septic') selector = '#productionTableSeptic .prod-run-cb:checked';
    document.querySelectorAll(selector).forEach((cb) => {
        const id = cb.dataset.id || '';
        if (id) selected.add(id);
    });
    return Array.from(selected);
}

function updateProductionSelectionButtons() {
    const pipesCount = getSelectedProductionRunIds('pipes').length;
    const septicCount = getSelectedProductionRunIds('septic').length;
    if (deleteSelectedPipesBtn) {
        deleteSelectedPipesBtn.disabled = pipesCount === 0;
    }
    if (deleteSelectedSepticBtn) {
        deleteSelectedSepticBtn.disabled = septicCount === 0;
    }
    if (productionPipesSelectAll) {
        const cbs = productionTablePipes?.querySelectorAll('.prod-run-cb') || [];
        productionPipesSelectAll.checked = !!cbs.length && Array.from(cbs).every(cb => cb.checked);
    }
    if (productionSepticSelectAll) {
        const cbs = productionTableSeptic?.querySelectorAll('.prod-run-cb') || [];
        productionSepticSelectAll.checked = !!cbs.length && Array.from(cbs).every(cb => cb.checked);
    }
}

async function deleteProductionRuns(ids = [], options = {}) {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    const businessId = user.businessId || user.uid;
    const runIds = Array.from(new Set((ids || []).filter(Boolean)));
    if (!businessId || !runIds.length) return false;
    if (options.confirm !== false) {
        const label = runIds.length > 1 ? `${runIds.length} production runs` : 'this production run';
        if (!window.confirm(`Delete ${label}?`)) return false;
    }
    try {
        const userRef = db.collection('users').doc(businessId);
        for (const id of runIds) {
            const payablesSnap = await userRef.collection('labour_payables').where('runId', '==', id).get();
            const batch = db.batch();
            payablesSnap.forEach(doc => batch.delete(doc.ref));
            batch.delete(userRef.collection('production_runs').doc(id));
            await batch.commit();
        }
        showAlert('success', runIds.length > 1 ? `${runIds.length} production runs deleted.` : 'Production run deleted.');
        await loadProductionHistory();
        return true;
    } catch (error) {
        console.error('deleteProductionRuns failed', error);
        showAlert('danger', 'Failed to delete production run(s).');
        return false;
    }
}
async function deleteProductionRun(id) {
    return deleteProductionRuns([id], { confirm: true });
}
async function deleteSelectedProductionRuns(scope = 'all') {
    const ids = getSelectedProductionRunIds(scope);
    if (!ids.length) return;
    await deleteProductionRuns(ids, { confirm: true });
}
window.deleteProductionRun = deleteProductionRun;

async function syncLabourPayablesForRuns(businessId, runs = []) {
    if (!businessId) return;
    const colRef = db.collection('users').doc(businessId).collection('labour_payables');
    const snap = await colRef.get();
    const existing = new Map();
    snap.forEach(doc => existing.set(doc.id, { id: doc.id, ...doc.data() }));

    const batch = db.batch();
    let ops = 0;
    for (const run of (runs || [])) {
        const workDate = normalizeLabourDate(run?.date?.toDate ? run.date.toDate() : run?.date);
        const amountDue = roundMoney(run.labourCost || 0);
        if (!run?.id || !workDate || amountDue <= 0) continue;
        const id = `${run.id}_labour`;
        const old = existing.get(id);
        const amountPaid = roundMoney(old?.amountPaid || 0);
        const amountPending = roundMoney(Math.max(amountDue - amountPaid, 0));
        const status = amountPaid <= 0 ? (old?.status === 'approved' ? 'approved' : 'pending') : (amountPending <= 0 ? 'paid' : 'partial');
        batch.set(colRef.doc(id), {
            runId: run.id,
            batchId: run.batchId || getRunBatchLabel(run),
            productName: run.finishedGoodName || 'Production Labour',
            producedDate: workDate,
            workDate,
            workerName: old?.workerName || 'Labour Team',
            amountDue,
            amountPaid,
            amountPending,
            status,
            txIds: Array.isArray(old?.txIds) ? old.txIds : [],
            source: 'production_labour',
            updatedAt: new Date(),
            createdAt: old?.createdAt || new Date(),
            isDeleted: false
        }, { merge: true });
        ops += 1;
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
}

function renderLabourPaymentTracker(payables = [], scopedRuns = []) {
    if (!labourPaymentsTable) return;
    const tbody = labourPaymentsTable.querySelector('tbody');
    if (!tbody) return;
    const runIds = new Set((scopedRuns || []).map(r => r.id));
    const runById = new Map([...(productionDataAll || []), ...(scopedRuns || [])].map(run => [run.id, run]));
    const searchTerm = (labourPayableSearch?.value || '').toLowerCase().trim();
    const statusFilter = (labourPayableStatusFilter?.value || 'all').toLowerCase();
    const workerFilter = (labourPayableWorkerFilter?.value || '').toLowerCase().trim();
    const fromDate = labourPayableDateFrom?.value || '';
    const toDate = labourPayableDateTo?.value || '';

    const rows = (payables || [])
        .filter(p => !p.isDeleted)
        .filter(p => !runIds.size || runIds.has(p.runId))
        .map(p => {
            const due = roundMoney(p.amountDue || 0);
            const paid = roundMoney(p.amountPaid || 0);
            const pending = roundMoney(Math.max(due - paid, 0));
            let status = (p.status || 'pending').toLowerCase();
            if (status !== 'reversed') status = paid <= 0 ? (status === 'approved' ? 'approved' : 'pending') : (pending <= 0 ? 'paid' : 'partial');
            return { ...p, due, paid, pending, status, producedDate: p.producedDate || p.workDate || '' };
        })
        .filter(p => {
            const run = runById.get(p.runId);
            const text = `${p.productName || ''} ${p.workerName || ''} ${p.producedDate} ${run?.productType || ''} ${run?.pipeType || ''} ${run?.loadClass || ''}`.toLowerCase();
            if (searchTerm && !text.includes(searchTerm)) return false;
            if (statusFilter !== 'all' && p.status !== statusFilter) return false;
            if (statusFilter === 'all' && !showCompletedRunsOnly && p.status === 'paid') return false;
            if (workerFilter && !(p.workerName || '').toLowerCase().includes(workerFilter)) return false;
            if (fromDate && p.producedDate < fromDate) return false;
            if (toDate && p.producedDate > toDate) return false;
            return true;
        })
        .sort((a, b) => `${b.producedDate}`.localeCompare(`${a.producedDate}`));
    if (!rows.length) {
        tbody.innerHTML = '<tr><td colspan="10" class="text-center text-muted">No labour payables found</td></tr>';
    } else {
        tbody.innerHTML = rows.slice(0, 200).map(p => {
            const run = runById.get(p.runId) || {};
            const workDate = p.producedDate || '-';
            const day = workDate !== '-' ? getRunDayLabel(workDate) : '';
            const badge = p.status === 'paid'
                ? '<span class="badge bg-success">Paid</span>'
                : p.status === 'partial'
                    ? '<span class="badge bg-info">Partial</span>'
                    : p.status === 'approved'
                        ? '<span class="badge bg-primary">Approved</span>'
                        : p.status === 'reversed'
                            ? '<span class="badge bg-danger">Reversed</span>'
                            : '<span class="badge bg-warning text-dark">Pending</span>';
            const productMeta = [
                run.productType || '',
                run.pipeType || '',
                run.loadClass || ''
            ].filter(Boolean).join(' | ');
            const qtyProduced = Number(run.quantityProduced || 0);
            const ratePerProduct = roundMoney(run.labourRatePerProduct || 0);
            return `
                <tr>
                    <td><input type="checkbox" class="form-check-input labour-row-cb" data-id="${p.id}" data-pending="${p.pending}"></td>
                    <td>${workDate}${day ? `<div class="small text-muted">${day}</div>` : ''}</td>
                    <td>
                        <div class="fw-semibold">${p.productName || '-'}</div>
                        ${productMeta ? `<div class="small text-muted">${productMeta}</div>` : ''}
                    </td>
                    <td class="text-end">${qtyProduced.toLocaleString()}</td>
                    <td class="text-end">${formatMoney(ratePerProduct)}</td>
                    <td class="text-end">${formatMoney(p.due)}</td>
                    <td class="text-end text-success">${formatMoney(p.paid)}</td>
                    <td class="text-end text-danger">${formatMoney(p.pending)}</td>
                    <td>${badge}</td>
                    <td>
                        <div class="d-flex align-items-center gap-1">
                            <button type="button" class="btn btn-sm btn-outline-secondary" title="View History" ${p.runId ? `onclick="window.viewLabourLedger('${p.runId}')"` : 'disabled'}>
                                <i class="fas fa-clock-rotate-left"></i>
                            </button>
                            <button type="button" class="btn btn-sm btn-outline-danger" title="Download PDF" ${(p.paid > 0) ? `onclick="window.downloadPaidLabourPdf('${p.id}')"` : 'disabled'}>
                                <i class="fas fa-file-pdf"></i>
                            </button>
                            <button type="button" class="btn btn-sm btn-outline-danger delete-labour-payable-btn" title="Delete" data-payable-id="${p.id}">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </td>
                </tr>`;
        }).join('');
    }
    if (labourTotalRecorded) labourTotalRecorded.textContent = formatMoney(rows.reduce((s, p) => s + p.due, 0));
    if (labourPendingAmount) labourPendingAmount.textContent = formatMoney(rows.reduce((s, p) => s + p.pending, 0));
    if (labourTotalEntries) labourTotalEntries.textContent = rows.length.toLocaleString();
    if (labourUniqueWorkers) labourUniqueWorkers.textContent = new Set(rows.map(p => (p.workerName || 'Labour').toLowerCase())).size.toLocaleString();
    if (labourSelectAll) labourSelectAll.checked = false;
    updateLabourSelectionButtons();
}

function updateLabourSelectionButtons() {
    const checked = labourPaymentsTable ? labourPaymentsTable.querySelectorAll('.labour-row-cb:checked') : [];
    const count = checked.length;
    if (paySelectedLabourBtn) paySelectedLabourBtn.disabled = count === 0;
    if (downloadSelectedLabourPdfBtn) downloadSelectedLabourPdfBtn.disabled = count === 0;
    if (paySelectedLabourBtn) paySelectedLabourBtn.innerHTML = `<i class="fas fa-wallet me-1"></i> Pay Selected${count ? ` (${count})` : ''}`;
    if (downloadSelectedLabourPdfBtn) downloadSelectedLabourPdfBtn.innerHTML = `<i class="fas fa-file-pdf me-1"></i> Download PDF${count ? ` (${count})` : ''}`;
}

function getSelectedLabourIds() {
    if (!labourPaymentsTable) return [];
    const cbs = labourPaymentsTable.querySelectorAll('.labour-row-cb:checked');
    return Array.from(cbs).map(cb => cb.dataset.id);
}

async function downloadSelectedLabourPdf() {
    const selectedIds = getSelectedLabourIds();
    if (!selectedIds.length) return showAlert('warning', 'Select at least one entry.');
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    const businessId = user.businessId || user.uid;
    if (!businessId) return;
    const companyProfile = await loadBusinessProfileForPdf(businessId, user);
    const selected = (labourPayablesAll || []).filter(p => selectedIds.includes(p.id));
    if (!selected.length) return showAlert('warning', 'No matching entries found.');
    const paidRows = selected.map(p => {
        const run = (productionDataAll || []).find(r => r.id === p.runId) || {};
        const due = roundMoney(p.amountDue || 0);
        const paid = roundMoney(p.amountPaid || 0);
        return {
            workDate: p.producedDate || p.workDate || '',
            day: getRunDayLabel(p.producedDate || p.workDate || ''),
            product: p.productName || 'Production Labour',
            category: run.productType || '',
            pipeType: run.pipeType || '',
            loadClass: run.loadClass || '',
            qtyProduced: Number(run.quantityProduced || 0),
            ratePerProduct: roundMoney(run.labourRatePerProduct || 0),
            worker: p.workerName || 'Labour Team',
            amount: paid > 0 ? paid : due
        };
    });
    const dates = paidRows.map(r => r.workDate).filter(Boolean).sort();
    const fromDate = dates[0] || '';
    const toDate = dates[dates.length - 1] || '';
    await generateLabourInvoicePdf(paidRows, fromDate, toDate, companyProfile);
}

async function paySelectedLabourPayables() {
    const selectedIds = getSelectedLabourIds();
    if (!selectedIds.length) return showAlert('warning', 'Select at least one entry.');
    const pendingRows = (labourPayablesAll || []).filter(p => {
        if (!selectedIds.includes(p.id)) return false;
        const due = roundMoney(p.amountDue || 0);
        const paid = roundMoney(p.amountPaid || 0);
        return roundMoney(due - paid) > 0;
    });
    if (!pendingRows.length) return showAlert('info', 'All selected entries are already paid.');
    const totalPending = pendingRows.reduce((sum, p) => sum + roundMoney(Math.max((p.amountDue || 0) - (p.amountPaid || 0), 0)), 0);
    if (!confirm(`Pay ${pendingRows.length} selected entries totalling ${formatMoney(totalPending)}?`)) return;
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    const businessId = user.businessId || user.uid;
    if (!businessId) return;
    const companyProfile = await loadBusinessProfileForPdf(businessId, user);
    let success = 0;
    const paidRows = [];
    for (const row of pendingRows) {
        const due = roundMoney(row.amountDue || 0);
        const paid = roundMoney(row.amountPaid || 0);
        const pending = roundMoney(Math.max(due - paid, 0));
        const ok = await payLabourPayable(row.id, pending, { silent: true });
        if (ok) {
            success += 1;
            const run = (productionDataAll || []).find(r => r.id === row.runId) || {};
            const qtyProduced = Number(run.quantityProduced || 0);
            const fallbackRate = qtyProduced > 0 ? roundMoney(pending / qtyProduced) : 0;
            paidRows.push({
                workDate: row.producedDate || row.workDate || '',
                day: getRunDayLabel(row.producedDate || row.workDate || ''),
                product: row.productName || 'Production Labour',
                category: run.productType || '',
                pipeType: run.pipeType || '',
                loadClass: run.loadClass || '',
                qtyProduced,
                ratePerProduct: roundMoney(run.labourRatePerProduct || fallbackRate),
                worker: row.workerName || 'Labour Team',
                amount: pending
            });
        }
    }
    await loadLabourPayables(businessId);
    renderLabourPaymentTracker(labourPayablesAll, productionData);
    if (paidRows.length) {
        const dates = paidRows.map(r => r.workDate).filter(Boolean).sort();
        const fromDate = dates[0] || '';
        const toDate = dates[dates.length - 1] || '';
        await generateLabourInvoicePdf(paidRows, fromDate, toDate, companyProfile);
    }
    showAlert('success', `Payment completed for ${success} entries.`);
}

async function editLabourPayable(payableId) {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    const businessId = user.businessId || user.uid;
    if (!businessId || !payableId) return false;
    try {
        const ref = db.collection('users').doc(businessId).collection('labour_payables').doc(payableId);
        const doc = await ref.get();
        if (!doc.exists) return false;
        const data = doc.data();
        const amountPaid = roundMoney(data.amountPaid || 0);
        if (amountPaid > 0) return showAlert('warning', 'Cannot edit after payment.');
        const val = window.prompt('Enter new amount due', String(data.amountDue || 0));
        if (val === null) return false;
        const due = roundMoney(parseFloat(val || '0') || 0);
        if (due <= 0) return showAlert('warning', 'Amount must be greater than zero.');
        await ref.update({ amountDue: due, amountPending: due, updatedAt: new Date() });
        await loadLabourPayables(businessId);
        renderLabourPaymentTracker(labourPayablesAll, productionData);
        return true;
    } catch (error) {
        console.error('editLabourPayable failed', error);
        showAlert('danger', 'Failed to edit payable.');
        return false;
    }
}

async function deleteLabourPayable(payableId) {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    const businessId = user.businessId || user.uid;
    if (!businessId || !payableId) return false;
    try {
        await db.collection('users').doc(businessId).collection('labour_payables').doc(payableId).update({ isDeleted: true, status: 'deleted', updatedAt: new Date() });
        await loadLabourPayables(businessId);
        renderLabourPaymentTracker(labourPayablesAll, productionData);
        return true;
    } catch (error) {
        console.error('deleteLabourPayable failed', error);
        showAlert('danger', 'Failed to delete payable.');
        return false;
    }
}

async function approveLabourPayable(payableId) {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    const businessId = user.businessId || user.uid;
    if (!businessId || !payableId) return false;
    try {
        await db.collection('users').doc(businessId).collection('labour_payables').doc(payableId).update({ status: 'approved', approvedAt: new Date(), updatedAt: new Date() });
        await loadLabourPayables(businessId);
        renderLabourPaymentTracker(labourPayablesAll, productionData);
        return true;
    } catch (error) {
        console.error('approveLabourPayable failed', error);
        showAlert('danger', 'Failed to approve payable.');
        return false;
    }
}

async function payLabourPayable(payableId, paymentAmount = null, options = {}) {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    const businessId = user.businessId || user.uid;
    if (!businessId || !payableId) return false;
    try {
        const ref = db.collection('users').doc(businessId).collection('labour_payables').doc(payableId);
        const doc = await ref.get();
        if (!doc.exists) return false;
        const data = doc.data();
        const due = roundMoney(data.amountDue || 0);
        const paid = roundMoney(data.amountPaid || 0);
        const pending = roundMoney(Math.max(due - paid, 0));
        if (pending <= 0) return true;
        const payAmt = roundMoney(paymentAmount == null ? pending : paymentAmount);
        if (payAmt <= 0 || payAmt > pending) throw new Error(`Payment should be between 0 and ${pending}`);
        const newPaid = roundMoney(paid + payAmt);
        const newPending = roundMoney(Math.max(due - newPaid, 0));
        const status = newPending <= 0 ? 'paid' : 'partial';
        const txRef = db.collection('users').doc(businessId).collection('transactions').doc();
        await db.runTransaction(async (tx) => {
            tx.set(txRef, {
                type: 'SupplierPayment',
                supplier: 'Labour',
                mode: 'Cash',
                reference: `LAB-${payableId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 10)}-${Date.now()}`,
                description: `Labour payment | ${data.productName || 'Production Labour'} | Date: ${data.producedDate || data.workDate || '-'}`,
                amount: payAmt,
                date: new Date(),
                source: 'production_labour',
                payableId,
                runId: data.runId || null,
                createdAt: new Date(),
                updatedAt: new Date()
            });
            tx.update(ref, {
                amountPaid: newPaid,
                amountPending: newPending,
                status,
                paidAt: newPending <= 0 ? new Date() : (data.paidAt || null),
                txIds: [...(Array.isArray(data.txIds) ? data.txIds : []), txRef.id],
                updatedAt: new Date()
            });
        });
        await loadLabourPayables(businessId);
        renderLabourPaymentTracker(labourPayablesAll, productionData);
        if (!options.silent) showAlert('success', 'Payment saved.');
        return true;
    } catch (error) {
        console.error('payLabourPayable failed', error);
        if (!options.silent) showAlert('danger', error.message || 'Failed to save payment.');
        return false;
    }
}

async function reverseLabourPayable(payableId, reason = 'Payment reversal') {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    const businessId = user.businessId || user.uid;
    if (!businessId || !payableId) return false;
    try {
        const ref = db.collection('users').doc(businessId).collection('labour_payables').doc(payableId);
        const doc = await ref.get();
        if (!doc.exists) return false;
        const data = doc.data();
        const paid = roundMoney(data.amountPaid || 0);
        if (paid <= 0) return showAlert('warning', 'No payment to reverse.');
        await ref.update({
            amountPaid: 0,
            amountPending: roundMoney(data.amountDue || 0),
            status: 'reversed',
            reversedReason: reason,
            reversedAt: new Date(),
            updatedAt: new Date()
        });
        await loadLabourPayables(businessId);
        renderLabourPaymentTracker(labourPayablesAll, productionData);
        return true;
    } catch (error) {
        console.error('reverseLabourPayable failed', error);
        showAlert('danger', 'Failed to reverse payment.');
        return false;
    }
}

window.downloadPaidLabourPdf = async (payableId) => {
    try {
        const user = JSON.parse(localStorage.getItem('user') || '{}');
        const businessId = user.businessId || user.uid;
        if (!businessId || !payableId) return;

        const payable = (labourPayablesAll || []).find(p => p.id === payableId && !p.isDeleted);
        if (!payable) return showAlert('warning', 'Labour payable not found.');

        const paidAmount = roundMoney(payable.amountPaid || 0);
        if (paidAmount <= 0) return showAlert('warning', 'No paid amount available for this entry.');

        const run = productionDataAll.find(r => r.id === payable.runId) || productionData.find(r => r.id === payable.runId) || {};
        const qtyProduced = Number(run.quantityProduced || 0);
        const fallbackRate = qtyProduced > 0 ? roundMoney(paidAmount / qtyProduced) : 0;
        const workDate = payable.producedDate || payable.workDate || formatDateInput(new Date());
        const companyProfile = await loadBusinessProfileForPdf(businessId, user);

        const pdfRows = [{
            workDate,
            day: getRunDayLabel(workDate),
            product: payable.productName || run.finishedGoodName || 'Production Labour',
            category: run.productType || '',
            pipeType: run.pipeType || '',
            loadClass: run.loadClass || '',
            qtyProduced,
            ratePerProduct: roundMoney(run.labourRatePerProduct || fallbackRate),
            worker: payable.workerName || 'Labour Team',
            amount: paidAmount
        }];

        await generateLabourInvoicePdf(pdfRows, workDate, workDate, companyProfile);
    } catch (error) {
        console.error('downloadPaidLabourPdf failed', error);
        showAlert('danger', 'Failed to generate paid labour PDF.');
    }
};

async function loadBusinessProfileForPdf(businessId, user = {}) {
    const fallback = {
        companyName: user.businessName || 'PipePro',
        address: '',
        city: '',
        state: '',
        zip: '',
        phone: user.phone || '',
        email: user.email || '',
        gstin: '',
        logoUrl: '',
        signatureUrl: '',
        bankName: '',
        bankAccountName: '',
        bankAccountNo: '',
        bankIfsc: '',
        bankBranch: '',
        upiId: ''
    };
    if (!businessId) return fallback;
    try {
        const doc = await db.collection('users').doc(businessId).collection('settings').doc('business').get();
        if (!doc.exists) return fallback;
        const data = doc.data() || {};
        return {
            companyName: data.companyName || fallback.companyName,
            address: data.address || data.companyAddress || fallback.address,
            city: data.city || data.companyCity || fallback.city,
            state: data.state || data.companyState || fallback.state,
            zip: data.zip || data.companyZip || fallback.zip,
            phone: data.phone || data.companyPhone || fallback.phone,
            email: data.email || data.companyEmail || fallback.email,
            gstin: data.taxId || data.gstin || '',
            logoUrl: data.logoUrl || '',
            signatureUrl: data.signatureUrl || '',
            bankName: data.bankName || '',
            bankAccountName: data.bankAccountName || '',
            bankAccountNo: data.bankAccountNo || '',
            bankIfsc: data.bankIfsc || '',
            bankBranch: data.bankBranch || '',
            upiId: data.upiId || ''
        };
    } catch (error) {
        console.warn('Business profile load failed for labour PDF', error);
        return fallback;
    }
}

function loadImageAsDataUrl(url) {
    return new Promise((resolve) => {
        if (!url) return resolve(null);
        try {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => {
                try {
                    const canvas = document.createElement('canvas');
                    canvas.width = img.naturalWidth || img.width;
                    canvas.height = img.naturalHeight || img.height;
                    const ctx = canvas.getContext('2d');
                    if (!ctx) return resolve(null);
                    ctx.drawImage(img, 0, 0);
                    resolve(canvas.toDataURL('image/png'));
                } catch (e) {
                    resolve(null);
                }
            };
            img.onerror = () => resolve(null);
            img.src = url;
        } catch (error) {
            resolve(null);
        }
    });
}

function formatYmdLabel(ymd) {
    if (!ymd) return '-';
    const d = new Date(ymd);
    if (Number.isNaN(d.getTime())) return ymd;
    return formatDate(d);
}

function buildLabourProductCellHtml(row) {
    const lines = [];
    lines.push(`<div class="item-name">${row.product || 'Production Labour'}</div>`);
    if (row.category) lines.push(`<div class="muted">Category: ${row.category}</div>`);
    if (row.pipeType) lines.push(`<div class="muted">Pipe Type: ${row.pipeType}</div>`);
    if (row.loadClass) lines.push(`<div class="muted">Load Class: ${row.loadClass}</div>`);
    lines.push(`<div class="muted">Qty Produced: ${Number(row.qtyProduced || 0).toLocaleString()}</div>`);
    lines.push(`<div class="muted">Rate / Product: &#8377;${roundMoney(row.ratePerProduct || 0).toFixed(2)}</div>`);
    return lines.join('');
}

function buildLabourProductCell(row) {
    const lines = [];
    lines.push(`${row.product || 'Production Labour'}`);
    if (row.category) lines.push(`Category: ${row.category}`);
    if (row.pipeType) lines.push(`Pipe Type: ${row.pipeType}`);
    if (row.loadClass) lines.push(`Load Class: ${row.loadClass}`);
    lines.push(`Qty Produced: ${Number(row.qtyProduced || 0).toLocaleString()}`);
    lines.push(`Rate / Product: Rs ${roundMoney(row.ratePerProduct || 0).toFixed(2)}`);
    return lines.join('\n');
}

function labourAmountToWords(num) {
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
}

function sortLabourInvoiceRows(rows = []) {
    return [...rows].sort((a, b) => {
        const dateA = String(a.workDate || '');
        const dateB = String(b.workDate || '');
        if (dateA !== dateB) return dateA.localeCompare(dateB);

        const productA = String(a.product || '').toLowerCase();
        const productB = String(b.product || '').toLowerCase();
        if (productA !== productB) return productA.localeCompare(productB);

        const typeA = String(a.pipeType || '').toLowerCase();
        const typeB = String(b.pipeType || '').toLowerCase();
        if (typeA !== typeB) return typeA.localeCompare(typeB);

        const classA = String(a.loadClass || '').toLowerCase();
        const classB = String(b.loadClass || '').toLowerCase();
        return classA.localeCompare(classB);
    });
}

async function generateLabourInvoicePdf(rows, fromDate, toDate, company = {}) {
    if (!Array.isArray(rows) || !rows.length) return;
    const sortedRows = sortLabourInvoiceRows(rows);

    const safe = (val) => (val === null || val === undefined || val === '') ? '-' : val;
    const companyName = company.companyName || 'PipePro';
    const gstin = company.gstin || '-';
    const state = company.state || '-';
    const phone = company.phone || '';
    const email = company.email || '';
    const address = company.address || '';
    const city = company.city || '';
    const zip = company.zip || '';

    const invoiceNo = `LAB-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`;
    const invoiceDate = formatDate(new Date());
    const total = sortedRows.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
    const dateRange = sortedRows.map(r => String(r.workDate || '')).filter(Boolean).sort();
    const resolvedFromDate = fromDate || dateRange[0] || '';
    const resolvedToDate = toDate || dateRange[dateRange.length - 1] || '';
    const rangeLabel = `${formatYmdLabel(resolvedFromDate)} to ${formatYmdLabel(resolvedToDate)}`;
    const amountWords = `${labourAmountToWords(Math.round(total))} Rupees Only`;

    const workers = [...new Set(sortedRows.map(r => r.worker || 'Labour Team'))];
    const workerLabel = workers.length <= 3 ? workers.join(', ') : `${workers.slice(0, 3).join(', ')} (+${workers.length - 3} more)`;

    const itemsRows = sortedRows.map((r, idx) => {
        const productLines = [];
        productLines.push(`<div class="item-name">${r.product || 'Production Labour'}</div>`);
        const meta = [r.category, r.pipeType, r.loadClass].filter(Boolean).join(' | ');
        if (meta) productLines.push(`<div class="muted">${meta}</div>`);
        return `
        <tr>
            <td>${idx + 1}</td>
            <td>${formatYmdLabel(r.workDate)}<div class="muted">${r.day || '-'}</div></td>
            <td>${productLines.join('')}</td>
            <td class="text-end">${Number(r.qtyProduced || 0).toLocaleString()}</td>
            <td class="text-end">&#8377;${roundMoney(r.ratePerProduct || 0).toFixed(2)}</td>
            <td class="text-end">&#8377;${roundMoney(r.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        </tr>`;
    }).join('');

    const logoImg = company.logoUrl ? `<img src="${company.logoUrl}" alt="Logo" crossorigin="anonymous">` : '';
    const signImg = company.signatureUrl ? `<img src="${company.signatureUrl}" class="sign-img" crossorigin="anonymous">` : '';

    const html = `
<html>
<head>
    <title>Labour Invoice #${invoiceNo}</title>
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
        .info-grid.three-col { grid-template-columns: 1fr 1fr 1fr; }
        .info-box { border: 1px solid #ddd; padding: 8px; min-height: 90px; }
        .info-title { font-weight: 700; margin-bottom: 4px; }
        .muted { color: #6c757d; font-size: 11px; }
        table { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 10px; }
        thead th { background: #1e6b8a; color: #fff; padding: 6px; border: 1px solid #1e6b8a; font-size: 11px; }
        tbody td { border: 1px solid #ddd; padding: 6px; vertical-align: top; }
        .text-end { text-align: right; }
        .item-name { font-weight: 600; }
        .summary-table { width: auto; min-width: 280px; margin-left: auto; margin-top: 10px; }
        .summary-table td { padding: 6px; border-bottom: 1px solid #ddd; }
        .summary-table tr:last-child td { border-bottom: none; font-weight: 700; }
        .amount-words { margin-top: 8px; font-size: 12px; }
        .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 24px; align-items: end; }
        .sign-box { text-align: right; font-size: 12px; }
        .sign-img { max-height: 60px; display: block; margin-left: auto; margin-bottom: 4px; }
        .sign-line { margin-top: 8px; border-top: 1px solid #111; display: inline-block; padding-top: 4px; }
        .worker-sign-box { text-align: left; font-size: 12px; }
        .worker-sign-line { margin-top: 40px; border-top: 1px solid #111; display: inline-block; padding-top: 4px; min-width: 180px; }
        .invoice-footer-note { margin-top: 12px; text-align: center; font-size: 11px; color: #666; border-top: 1px solid #eee; padding-top: 6px; }
        @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
    </style>
</head>
<body>
    <div class="page-border">
        <div class="copy-label">ORIGINAL</div>
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
                ${logoImg}
                <div class="invoice-meta-box">
                    <div class="info-title">Invoice Details</div>
                    <div>Invoice No.: ${invoiceNo}</div>
                    <div>Date: ${invoiceDate}</div>
                    <div>Work Period: ${rangeLabel}</div>
                </div>
            </div>
        </div>

        <div class="title">Labour Payment Invoice</div>

        <div class="info-grid three-col">
            <div class="info-box">
                <div class="info-title">Worker Details</div>
                <div>${workerLabel}</div>
                <div class="muted">Total Entries: ${sortedRows.length}</div>
                <div class="muted">Work Period: ${rangeLabel}</div>
            </div>
            <div class="info-box">
                <div class="info-title">Invoice Details</div>
                <div>Invoice No.: ${invoiceNo}</div>
                <div>Date: ${invoiceDate}</div>
                <div class="muted">Work Period: ${rangeLabel}</div>
            </div>
            <div class="info-box">
                <div class="info-title">Payment Summary</div>
                <div><strong>Total Amount:</strong> &#8377;${total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                <div class="muted">Entries: ${sortedRows.length}</div>
                <div class="muted">Workers: ${workers.length}</div>
            </div>
        </div>

        <table>
            <thead>
                <tr>
                    <th>#</th>
                    <th>Produced Date</th>
                    <th>Product Details</th>
                    <th class="text-end">Qty Produced</th>
                    <th class="text-end">Rate/Product</th>
                    <th class="text-end">Amount</th>
                </tr>
            </thead>
            <tbody>
                ${itemsRows}
            </tbody>
        </table>

        <table class="summary-table">
            <tbody>
                <tr><td>Sub Total</td><td class="text-end">&#8377;${total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td></tr>
                <tr><td>Grand Total</td><td class="text-end">&#8377;${total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td></tr>
            </tbody>
        </table>

        <div class="amount-words"><strong>Amount In Words:</strong> ${amountWords}</div>

        <div class="signatures">
            <div class="worker-sign-box">
                <span class="worker-sign-line">Worker's Signature</span>
            </div>
            <div class="sign-box">
                For: ${companyName}<br>
                ${signImg}
                <span class="sign-line">Authorized Signatory</span>
            </div>
        </div>
        <div class="invoice-footer-note">This is a computer generated labour payment receipt.</div>
    </div>
    <script>
        function doPrint() {
            var imgs = document.querySelectorAll('img');
            if (!imgs.length) { window.print(); return; }
            var loaded = 0;
            var total = imgs.length;
            function check() { loaded++; if (loaded >= total) setTimeout(function(){ window.print(); }, 200); }
            imgs.forEach(function(img) {
                if (img.complete && img.naturalWidth > 0) { check(); }
                else { img.onload = check; img.onerror = check; }
            });
        }
        if (document.readyState === 'complete') doPrint();
        else window.addEventListener('load', doPrint);
    </script>
</body>
</html>`;

    const printWindow = window.open('', '_blank');
    if (printWindow) {
        printWindow.document.write(html);
        printWindow.document.close();
    } else {
        showAlert('warning', 'Pop-up blocked. Please allow pop-ups to print the invoice.');
    }
}



async function bulkPayLabourByRangeWithInvoice() {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    const businessId = user.businessId || user.uid;
    if (!businessId) return;
    const companyProfile = await loadBusinessProfileForPdf(businessId, user);
    const fromDate = labourPayableDateFrom?.value || '';
    const toDate = labourPayableDateTo?.value || '';
    if (!fromDate || !toDate) return showAlert('warning', 'Select From and To dates first.');
    if (fromDate > toDate) return showAlert('warning', 'From date cannot be after To date.');
    const rows = labourPayablesAll
        .filter(p => !p.isDeleted)
        .map(p => ({ ...p, producedDate: p.producedDate || p.workDate || '' }))
        .filter(p => p.producedDate >= fromDate && p.producedDate <= toDate)
        .filter(p => {
            const due = roundMoney(p.amountDue || 0);
            const paid = roundMoney(p.amountPaid || 0);
            return roundMoney(due - paid) > 0;
        });
    if (!rows.length) return showAlert('warning', 'No pending labour in selected range.');

    let success = 0;
    const paidRows = [];
    for (const row of rows) {
        const due = roundMoney(row.amountDue || 0);
        const paid = roundMoney(row.amountPaid || 0);
        const pending = roundMoney(Math.max(due - paid, 0));
        // eslint-disable-next-line no-await-in-loop
        const ok = await payLabourPayable(row.id, pending, { silent: true });
        if (ok) {
            success += 1;
            const run = productionDataAll.find(r => r.id === row.runId) || productionData.find(r => r.id === row.runId) || {};
            const qtyProduced = Number(run.quantityProduced || 0);
            const fallbackRate = qtyProduced > 0 ? roundMoney(pending / qtyProduced) : 0;
            paidRows.push({
                workDate: row.producedDate,
                day: getRunDayLabel(row.producedDate),
                product: row.productName || 'Production Labour',
                category: run.productType || '',
                pipeType: run.pipeType || '',
                loadClass: run.loadClass || '',
                qtyProduced,
                ratePerProduct: roundMoney(run.labourRatePerProduct || fallbackRate),
                worker: row.workerName || 'Labour Team',
                amount: pending
            });
        }
    }
    await loadLabourPayables(businessId);
    renderLabourPaymentTracker(labourPayablesAll, productionData);
    if (paidRows.length) await generateLabourInvoicePdf(paidRows, fromDate, toDate, companyProfile);
    showAlert('success', `Bulk payment completed for ${success} entries.`);
}

window.viewLabourLedger = (id, options = {}) => {
    const entries = (labourPayablesAll || [])
        .filter(p => !p.isDeleted && p.runId === id)
        .map(p => {
            const due = roundMoney(p.amountDue || 0);
            const paid = roundMoney(p.amountPaid || 0);
            const pending = roundMoney(Math.max(due - paid, 0));
            let status = (p.status || 'pending').toLowerCase();
            if (status !== 'reversed') status = paid <= 0 ? (status === 'approved' ? 'approved' : 'pending') : (pending <= 0 ? 'paid' : 'partial');
            return { ...p, due, paid, pending, status };
        });

    const run = productionDataAll.find(r => r.id === id) || productionData.find(r => r.id === id);
    if (!run || !labourLedgerModal || !labourLedgerTable) return;
    const productMeta = [run.productType || '', run.pipeType || '', run.loadClass || ''].filter(Boolean).join(' | ');
    const qtyProduced = Number(run.quantityProduced || 0);
    const ratePerProduct = roundMoney(run.labourRatePerProduct || 0);
    const productLabel = `
        <div class="fw-semibold">${run.finishedGoodName || '-'}</div>
        ${productMeta ? `<div class="small text-muted">${productMeta}</div>` : ''}
    `;
    currentLabourLedgerRunId = run.id;
    const tbody = labourLedgerTable.querySelector('tbody');
    if (tbody) {
        if (!entries.length) {
            tbody.innerHTML = '<tr><td colspan="10" class="text-center text-muted">No labour entries found</td></tr>';
        } else {
            tbody.innerHTML = entries.map(entry => {
                const refs = (entry.txIds || []).length ? (entry.txIds || []).slice(-2).join(', ') : '-';
                const badge = entry.status === 'paid'
                    ? '<span class="badge bg-success">Paid</span>'
                    : entry.status === 'partial'
                        ? '<span class="badge bg-info">Partial</span>'
                        : entry.status === 'approved'
                            ? '<span class="badge bg-primary">Approved</span>'
                            : entry.status === 'reversed'
                                ? '<span class="badge bg-danger">Reversed</span>'
                                : '<span class="badge bg-warning text-dark">Pending</span>';
                const canApprove = entry.status === 'pending';
                const canPay = (entry.status === 'pending' || entry.status === 'approved' || entry.status === 'partial') && entry.pending > 0;
                const canReverse = (entry.status === 'paid' || entry.status === 'partial') && entry.paid > 0;
                const canEdit = entry.paid <= 0;
                return `
                    <tr>
                        <td>${entry.producedDate || entry.workDate || '-'}</td>
                        <td>${productLabel}</td>
                        <td class="text-end">${qtyProduced.toLocaleString()}</td>
                        <td class="text-end">${formatMoney(ratePerProduct)}</td>
                        <td class="text-end">${formatMoney(entry.due)}</td>
                        <td class="text-end text-success">${formatMoney(entry.paid)}</td>
                        <td class="text-end text-danger">${formatMoney(entry.pending)}</td>
                        <td>${badge}</td>
                        <td class="small">${refs}</td>
                        <td>
                            <div class="d-flex flex-wrap gap-1">
                                <button type="button" class="btn btn-sm btn-outline-danger" title="Download PDF" ${(entry.paid > 0) ? `onclick="window.downloadPaidLabourPdf('${entry.id}')"` : 'disabled'}><i class="fas fa-file-pdf"></i></button>
                                ${canEdit ? `<button type="button" class="btn btn-sm btn-outline-secondary edit-labour-payable-btn" title="Edit" data-payable-id="${entry.id}"><i class="fas fa-pen"></i></button>` : ''}
                                <button type="button" class="btn btn-sm btn-outline-danger delete-labour-payable-btn" title="Delete" data-payable-id="${entry.id}"><i class="fas fa-trash"></i></button>
                                ${canApprove ? `<button type="button" class="btn btn-sm btn-outline-primary approve-labour-payable-btn" title="Approve" data-payable-id="${entry.id}"><i class="fas fa-check"></i></button>` : ''}
                                ${canPay ? `<button type="button" class="btn btn-sm btn-outline-success mark-labour-paid-btn" title="Pay Full" data-payable-id="${entry.id}"><i class="fas fa-wallet"></i></button>` : ''}
                                ${canPay ? `<button type="button" class="btn btn-sm btn-outline-success partial-labour-paid-btn" title="Partial Pay" data-payable-id="${entry.id}" data-pending="${entry.pending}"><i class="fas fa-hand-holding-dollar"></i></button>` : ''}
                                ${canReverse ? `<button type="button" class="btn btn-sm btn-outline-danger reverse-labour-payable-btn" title="Reverse" data-payable-id="${entry.id}"><i class="fas fa-rotate-left"></i></button>` : ''}
                            </div>
                        </td>
                    </tr>
                `;
            }).join('');
        }
    }
    if (labourLedgerBatch) labourLedgerBatch.textContent = run.batchId || getRunBatchLabel(run);
    if (labourLedgerProduct) labourLedgerProduct.textContent = run.finishedGoodName || '-';
    if (labourLedgerTotal) labourLedgerTotal.textContent = formatMoney(entries.reduce((sum, e) => sum + e.due, 0));
    if (labourLedgerPaidTotal) labourLedgerPaidTotal.textContent = formatMoney(entries.reduce((sum, e) => sum + e.paid, 0));
    if (labourLedgerPendingTotal) labourLedgerPendingTotal.textContent = formatMoney(entries.reduce((sum, e) => sum + e.pending, 0));
    if (options.showModal !== false) new bootstrap.Modal(labourLedgerModal).show();
};
