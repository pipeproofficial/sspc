import { db } from './firebase-config.js';
import { checkAuth, formatDate, downloadCSV, downloadPDF } from './dashboard.js';
import { showAlert } from './auth.js';

const staffTable = document.getElementById('staffTable');
const attendanceTable = document.getElementById('attendanceTable');
const addStaffBtn = document.getElementById('addStaffBtn');
const saveStaffBtn = document.getElementById('saveStaffBtn');
const attendanceSettingsBtn = document.getElementById('attendanceSettingsBtn');
const generateQrBtn = document.getElementById('generateQrBtn');
const attendanceDateFilter = document.getElementById('attendanceDateFilter');
const manualAttendanceBtn = document.getElementById('manualAttendanceBtn');
const saveManualAttendanceBtn = document.getElementById('saveManualAttendanceBtn');
const payrollMonthFilter = document.getElementById('payrollMonthFilter');
const payrollTable = document.getElementById('payrollTable');
const salaryPaymentModal = document.getElementById('salaryPaymentModal');
const saveSalaryPaymentBtn = document.getElementById('saveSalaryPaymentBtn');
const salaryPaymentForm = document.getElementById('salaryPaymentForm');
const salaryStaffSelect = document.getElementById('salaryStaffSelect');
const salaryMonth = document.getElementById('salaryMonth');
const salaryPayable = document.getElementById('salaryPayable');
const salaryAmount = document.getElementById('salaryAmount');
const salaryDate = document.getElementById('salaryDate');
const salaryMode = document.getElementById('salaryMode');
const salaryReference = document.getElementById('salaryReference');
const salaryNotes = document.getElementById('salaryNotes');
const exportPayrollCsvBtn = document.getElementById('exportPayrollCsvBtn');
const exportPayrollPdfBtn = document.getElementById('exportPayrollPdfBtn');
const exportStaffCsvBtn = document.getElementById('exportStaffCsvBtn');
const exportStaffPdfBtn = document.getElementById('exportStaffPdfBtn');
const searchStaff = document.getElementById('searchStaff');
const filterStaffRole = document.getElementById('filterStaffRole');
const filterStaffStatus = document.getElementById('filterStaffStatus');
const searchAttendance = document.getElementById('searchAttendance');
const filterAttendanceStatus = document.getElementById('filterAttendanceStatus');
const searchPayroll = document.getElementById('searchPayroll');
const filterPayrollRole = document.getElementById('filterPayrollRole');

let currentStaffId = null;
let staffListCache = [];
let currentPayrollData = [];
let currentPayrollMonth = '';
let currentPayrollPayments = {};

function normalizeMobile(value) {
    return (value || '').replace(/\D/g, '');
}

document.addEventListener('DOMContentLoaded', async () => {
    await checkAuth();
    loadStaff();
    
    // Set today's date for filter
    if (attendanceDateFilter) {
        attendanceDateFilter.valueAsDate = new Date();
        attendanceDateFilter.addEventListener('change', loadAttendance);
    }
    
    if (payrollMonthFilter) {
        const now = new Date();
        payrollMonthFilter.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        payrollMonthFilter.addEventListener('change', loadPayroll);
    }

    loadAttendance();

    window.addEventListener('sectionChanged', (e) => {
        if (e.detail === 'staff') {
            loadStaff();
            loadAttendance();
            loadPayroll();
        }
    });

    if (addStaffBtn) {
        addStaffBtn.addEventListener('click', () => {
            currentStaffId = null;
            document.getElementById('staffForm').reset();
            document.querySelector('#staffModal .modal-title').textContent = 'Add Staff Member';
            new bootstrap.Modal(document.getElementById('staffModal')).show();
        });
    }

    if (saveStaffBtn) {
        saveStaffBtn.addEventListener('click', saveStaff);
    }

    if (attendanceSettingsBtn) {
        attendanceSettingsBtn.addEventListener('click', openSettingsModal);
    }

    if (generateQrBtn) {
        generateQrBtn.addEventListener('click', openSettingsModal);
    }
    
    const settingsForm = document.getElementById('attendanceSettingsForm');
    if (settingsForm) {
        settingsForm.addEventListener('submit', saveSettings);
    }

    if (manualAttendanceBtn) {
        manualAttendanceBtn.addEventListener('click', openManualAttendanceModal);
    }

    if (saveManualAttendanceBtn) {
        saveManualAttendanceBtn.addEventListener('click', saveManualAttendance);
    }

    if (saveSalaryPaymentBtn) {
        saveSalaryPaymentBtn.addEventListener('click', saveSalaryPayment);
    }

    if (salaryStaffSelect) {
        salaryStaffSelect.addEventListener('change', updateSalaryPaymentFields);
    }

    if (exportPayrollCsvBtn) {
        exportPayrollCsvBtn.addEventListener('click', exportPayrollCSV);
    }

    if (exportPayrollPdfBtn) {
        exportPayrollPdfBtn.addEventListener('click', exportPayrollPDF);
    }

    if (exportStaffCsvBtn) {
        exportStaffCsvBtn.addEventListener('click', exportStaffCSV);
    }

    if (exportStaffPdfBtn) {
        exportStaffPdfBtn.addEventListener('click', exportStaffPDF);
    }

    if (searchStaff) {
        searchStaff.addEventListener('input', applyStaffFilters);
    }
    if (filterStaffRole) {
        filterStaffRole.addEventListener('change', applyStaffFilters);
    }
    if (filterStaffStatus) {
        filterStaffStatus.addEventListener('change', applyStaffFilters);
    }
    if (searchAttendance) {
        searchAttendance.addEventListener('input', applyAttendanceFilters);
    }
    if (filterAttendanceStatus) {
        filterAttendanceStatus.addEventListener('change', applyAttendanceFilters);
    }
    if (searchPayroll) {
        searchPayroll.addEventListener('input', applyPayrollFilters);
    }
    if (filterPayrollRole) {
        filterPayrollRole.addEventListener('change', applyPayrollFilters);
    }
});

async function loadStaff() {
    const user = JSON.parse(localStorage.getItem('user'));
    if (!user || !staffTable) return;
    const businessId = user.businessId || user.uid;

    const tbody = staffTable.querySelector('tbody');
    tbody.innerHTML = '<tr><td colspan="6" class="text-center">Loading...</td></tr>';

    try {
        const snapshot = await db.collection('users').doc(businessId).collection('staff').orderBy('name').get();
        tbody.innerHTML = '';

        if (snapshot.empty) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center">No staff found</td></tr>';
            return;
        }

        staffListCache = [];
        snapshot.forEach(doc => {
            const s = doc.data();
            const canDelete = user.permissions ? user.permissions.canDelete : true;
            const escape = (str) => (str || '').replace(/'/g, "\\'");
            const wageDisplay = s.wageType === 'Monthly' ? `\u20B9${(s.amount || s.dailyWage).toLocaleString()}<small class="text-muted">/mo</small>` : `\u20B9${(s.amount || s.dailyWage)}<small class="text-muted">/day</small>`;
            
            tbody.innerHTML += `
                <tr>
                    <td>${s.name}</td>
                    <td>${s.mobile}</td>
                    <td><span class="badge bg-info">${s.role}</span></td>
                    <td>${wageDisplay}</td>
                    <td><span class="badge bg-${s.active !== false ? 'success' : 'secondary'}">${s.active !== false ? 'Active' : 'Inactive'}</span></td>
                    <td>
                        <button class="btn btn-sm btn-outline-primary" onclick="window.editStaff('${doc.id}', '${escape(s.name)}', '${s.mobile}', '${s.role}', ${s.amount || s.dailyWage}, '${s.wageType || 'Daily'}')"><i class="fas fa-edit"></i></button>
                        <button class="btn btn-sm btn-outline-secondary" onclick="window.toggleStaffStatus('${doc.id}', ${s.active !== false})" title="${s.active !== false ? 'Deactivate' : 'Activate'}">
                            <i class="fas fa-user-slash"></i>
                        </button>
                        ${canDelete ? `<button class="btn btn-sm btn-outline-danger" onclick="window.deleteStaff('${doc.id}')"><i class="fas fa-trash"></i></button>` : ''}
                    </td>
                </tr>
            `;
            staffListCache.push({ id: doc.id, ...s });
        });
        populateStaffRoleFilter();
        applyStaffFilters();
    } catch (error) {
        console.error("Error loading staff", error);
    }
}

function populateStaffRoleFilter() {
    if (!filterStaffRole) return;
    const roles = Array.from(new Set(staffListCache.map(s => s.role).filter(Boolean))).sort();
    filterStaffRole.innerHTML = '<option value="all">All Roles</option>';
    roles.forEach(role => {
        filterStaffRole.innerHTML += `<option value="${role}">${role}</option>`;
    });
    if (filterPayrollRole) {
        filterPayrollRole.innerHTML = '<option value="all">All Roles</option>';
        roles.forEach(role => {
            filterPayrollRole.innerHTML += `<option value="${role}">${role}</option>`;
        });
    }
}

function applyStaffFilters() {
    if (!staffTable) return;
    const rows = staffTable.querySelectorAll('tbody tr');
    const searchTerm = (searchStaff?.value || '').toLowerCase();
    const roleFilter = filterStaffRole?.value || 'all';
    const statusFilter = filterStaffStatus?.value || 'all';

    rows.forEach(row => {
        if (row.querySelector('td[colspan]')) return;
        const cells = row.querySelectorAll('td');
        const rowText = row.textContent.toLowerCase();
        if (searchTerm && !rowText.includes(searchTerm)) {
            row.style.display = 'none';
            return;
        }
        const roleText = cells[2]?.textContent?.trim() || '';
        if (roleFilter !== 'all' && roleText !== roleFilter) {
            row.style.display = 'none';
            return;
        }
        const statusText = cells[4]?.textContent?.trim() || '';
        if (statusFilter !== 'all' && statusText !== statusFilter) {
            row.style.display = 'none';
            return;
        }
        row.style.display = '';
    });
}

function applyAttendanceFilters() {
    if (!attendanceTable) return;
    const rows = attendanceTable.querySelectorAll('tbody tr');
    const searchTerm = (searchAttendance?.value || '').toLowerCase();
    const statusFilter = filterAttendanceStatus?.value || 'all';

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
        row.style.display = '';
    });
}

function applyPayrollFilters() {
    if (!payrollTable) return;
    const rows = payrollTable.querySelectorAll('tbody tr');
    const searchTerm = (searchPayroll?.value || '').toLowerCase();
    const roleFilter = filterPayrollRole?.value || 'all';

    rows.forEach(row => {
        if (row.querySelector('td[colspan]')) return;
        const cells = row.querySelectorAll('td');
        const rowText = row.textContent.toLowerCase();
        if (searchTerm && !rowText.includes(searchTerm)) {
            row.style.display = 'none';
            return;
        }
        const roleText = cells[1]?.textContent?.trim() || '';
        if (roleFilter !== 'all' && roleText !== roleFilter) {
            row.style.display = 'none';
            return;
        }
        row.style.display = '';
    });
}

async function saveStaff() {
    const user = JSON.parse(localStorage.getItem('user'));
    const name = document.getElementById('staffName').value;
    const businessId = user.businessId || user.uid;
    const mobileInput = document.getElementById('staffMobile');
    const mobile = normalizeMobile(mobileInput.value);
    const role = document.getElementById('staffRole').value;
    const wage = parseFloat(document.getElementById('staffWage').value);
    const wageType = document.getElementById('staffSalaryType').value;

    if (!name || !mobile || !wage) return alert("Please fill all fields");

    mobileInput.value = mobile;

    try {
        const data = { name, mobile, role, amount: wage, wageType, dailyWage: wage, active: true, updatedAt: new Date() };
        
        if (currentStaffId) {
            await db.collection('users').doc(businessId).collection('staff').doc(currentStaffId).update(data);
        } else {
            data.createdAt = new Date();
            await db.collection('users').doc(businessId).collection('staff').add(data);
        }

        bootstrap.Modal.getInstance(document.getElementById('staffModal')).hide();
        showAlert('success', 'Staff saved successfully');
        loadStaff();
    } catch (error) {
        console.error("Error saving staff", error);
    }
}

async function loadAttendance() {
    const user = JSON.parse(localStorage.getItem('user'));
    if (!user || !attendanceTable) return;
    const businessId = user.businessId || user.uid;

    const dateVal = attendanceDateFilter.value;
    if (!dateVal) return;

    const tbody = attendanceTable.querySelector('tbody');
    tbody.innerHTML = '<tr><td colspan="6" class="text-center">Loading...</td></tr>';

    try {
        // Simple query for date string YYYY-MM-DD stored in doc
        const snapshot = await db.collection('users').doc(businessId)
            .collection('attendance')
            .where('dateString', '==', dateVal)
            .get();

        tbody.innerHTML = '';
        if (snapshot.empty) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">No attendance records for this date</td></tr>';
            return;
        }

        snapshot.forEach(doc => {
            const a = doc.data();
            const time = a.timestamp ? new Date(a.timestamp.toDate()).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '-';
            const canDelete = user.permissions ? user.permissions.canDelete : true;
            tbody.innerHTML += `
                <tr>
                    <td>${time}</td>
                    <td class="fw-bold">${a.staffName}</td>
                    <td>${a.role}</td>
                    <td class="text-success">\u20B9${a.wageEarned}</td>
                    <td><span class="badge bg-success">Present</span></td>
                    <td>
                        ${canDelete ? `<button class="btn btn-sm btn-outline-danger" onclick="window.deleteAttendance('${doc.id}')"><i class="fas fa-trash"></i></button>` : ''}
                    </td>
                </tr>
            `;
        });
        applyAttendanceFilters();
    } catch (error) {
        console.error("Error loading attendance", error);
    }
}

async function openSettingsModal() {
    const user = JSON.parse(localStorage.getItem('user'));
    const businessId = user.businessId || user.uid;
    
    // Load settings
    try {
        const doc = await db.collection('users').doc(businessId).collection('settings').doc('attendance').get();
        if (doc.exists) {
            const s = doc.data();
            document.getElementById('attStartTime').value = s.startTime || '';
            document.getElementById('attEndTime').value = s.endTime || '';
        }
    } catch(e) {}

    // Generate QR
    const qrContainer = document.getElementById('qrcode');
    qrContainer.innerHTML = '';
    
    // The URL points to the public attendance page with the owner's UID
    const attendanceUrl = new URL('attendance.html', window.location.href);
    attendanceUrl.searchParams.set('uid', businessId);
    
    new QRCode(qrContainer, {
        text: attendanceUrl.toString(),
        width: 150,
        height: 150
    });

    new bootstrap.Modal(document.getElementById('attendanceSettingsModal')).show();
}

async function saveSettings(e) {
    e.preventDefault();
    const user = JSON.parse(localStorage.getItem('user'));
    const businessId = user.businessId || user.uid;
    const startTime = document.getElementById('attStartTime').value;
    const endTime = document.getElementById('attEndTime').value;

    try {
        await db.collection('users').doc(businessId).collection('settings').doc('attendance').set({
            startTime, endTime,
            allowedLat: null,
            allowedLng: null,
            allowedRadius: null
        }, { merge: true });
        await clearLegacyAttendanceLocations(businessId);
        showAlert('success', 'Settings saved');
        bootstrap.Modal.getInstance(document.getElementById('attendanceSettingsModal')).hide();
    } catch(e) { console.error(e); }
}

async function clearLegacyAttendanceLocations(businessId) {
    if (!businessId) return;
    const snap = await db.collection('users').doc(businessId).collection('attendance').get();
    if (snap.empty) return;

    const canHardDelete = typeof firebase !== 'undefined'
        && firebase?.firestore?.FieldValue?.delete;
    const deleteToken = canHardDelete ? firebase.firestore.FieldValue.delete() : null;

    let batch = db.batch();
    let ops = 0;

    for (const doc of snap.docs) {
        const data = doc.data() || {};
        if (!Object.prototype.hasOwnProperty.call(data, 'location')) continue;

        if (canHardDelete) {
            batch.update(doc.ref, { location: deleteToken });
        } else {
            batch.update(doc.ref, { location: null });
        }
        ops += 1;

        if (ops >= 400) {
            // eslint-disable-next-line no-await-in-loop
            await batch.commit();
            batch = db.batch();
            ops = 0;
        }
    }

    if (ops > 0) await batch.commit();
}

async function loadPayroll() {
    const user = JSON.parse(localStorage.getItem('user'));
    if (!user || !payrollTable) return;
    const businessId = user.businessId || user.uid;

    const monthVal = payrollMonthFilter.value; // YYYY-MM
    if (!monthVal) return;
    currentPayrollMonth = monthVal;

    const [year, month] = monthVal.split('-');
    const startDate = `${year}-${month}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const endDate = `${year}-${month}-${lastDay}`;

    const tbody = payrollTable.querySelector('tbody');
    tbody.innerHTML = '<tr><td colspan="8" class="text-center">Calculating...</td></tr>';

    try {
        const snapshot = await db.collection('users').doc(businessId).collection('attendance')
            .where('dateString', '>=', startDate)
            .where('dateString', '<=', endDate)
            .get();

        const payrollData = {};

        snapshot.forEach(doc => {
            const data = doc.data();
            if (!payrollData[data.staffId]) {
                payrollData[data.staffId] = {
                    staffId: data.staffId,
                    name: data.staffName,
                    role: data.role,
                    days: 0,
                    wages: 0
                };
            }
            payrollData[data.staffId].days++;
            payrollData[data.staffId].wages += (parseFloat(data.wageEarned) || 0);
        });

        currentPayrollPayments = {};
        try {
            const paymentSnap = await db.collection('users').doc(businessId)
                .collection('salaryPayments')
                .where('month', '==', monthVal)
                .get();
            paymentSnap.forEach(doc => {
                const p = doc.data();
                if (!p.staffId) return;
                currentPayrollPayments[p.staffId] = (currentPayrollPayments[p.staffId] || 0) + (Number(p.amount || 0));
            });
        } catch (e) {
            console.warn('Salary payments not доступ allowed by rules', e);
            // Continue without payment data when permissions are restricted.
            currentPayrollPayments = {};
        }

        tbody.innerHTML = '';
        let totalWages = 0;
        let totalPaid = 0;
        let totalBalance = 0;
        currentPayrollData = [];

        if (Object.keys(payrollData).length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted">No attendance data for this month</td></tr>';
        } else {
            Object.values(payrollData).forEach(p => {
                currentPayrollData.push(p);
                totalWages += p.wages;
                const escape = (str) => (str || '').replace(/'/g, "\\'");
                                const paid = currentPayrollPayments[p.staffId] || 0;
                const balance = Math.max(0, p.wages - paid);
                totalPaid += paid;
                totalBalance += balance;
                const status = paid >= p.wages && p.wages > 0
                    ? '<span class="badge bg-success">Paid</span>'
                    : paid > 0
                        ? '<span class="badge bg-warning text-dark">Partial</span>'
                        : '<span class="badge bg-secondary">Unpaid</span>';
                tbody.innerHTML += `<tr>
                    <td>${p.name}</td>
                    <td>${p.role}</td>
                    <td>${p.days}</td>
                    <td class="fw-bold">\u20B9${p.wages.toLocaleString()}</td>
                    <td>\u20B9${paid.toLocaleString()}</td>
                    <td>\u20B9${balance.toLocaleString()}</td>
                    <td>${status}</td>
                    <td>
                        <button class="btn btn-sm btn-outline-success me-1" onclick="window.openSalaryPaymentModal('${p.staffId}', '${escape(p.name)}', '${escape(p.role)}', ${p.wages})">
                            <i class="fas fa-hand-holding-usd"></i> Pay
                        </button>
                        <button class="btn btn-sm btn-outline-primary" onclick="window.generatePayslip('${p.staffId}', '${escape(p.name)}', '${p.role}', ${p.days}, ${p.wages})">
                            <i class="fas fa-file-invoice"></i> Payslip
                        </button>
                    </td>
                </tr>`;
            });
        }
        
        document.getElementById('payrollTotalWages').textContent = `\u20B9${totalWages.toLocaleString()}`;
        const paidEl = document.getElementById('payrollTotalPaid');
        const balEl = document.getElementById('payrollTotalBalance');
        if (paidEl) paidEl.textContent = `\u20B9${totalPaid.toLocaleString()}`;
        if (balEl) balEl.textContent = `\u20B9${totalBalance.toLocaleString()}`;

    } catch (error) {
        console.error("Error loading payroll", error);
        tbody.innerHTML = '<tr><td colspan="8" class="text-center text-danger">Error loading payroll</td></tr>';
    }
    applyPayrollFilters();
}

function populateSalaryStaffOptions(preselectId = '') {
    if (!salaryStaffSelect) return;
    salaryStaffSelect.innerHTML = '<option value="">Select Staff</option>';

    const source = currentPayrollData.length ? currentPayrollData : staffListCache;
    source.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s.staffId || s.id || '';
        opt.textContent = s.name || 'Staff';
        opt.dataset.name = s.name || '';
        opt.dataset.role = s.role || '';
        opt.dataset.wages = Number(s.wages || s.amount || s.dailyWage || 0);
        if (opt.value) salaryStaffSelect.appendChild(opt);
    });

    if (preselectId) {
        salaryStaffSelect.value = preselectId;
    }
}

function updateSalaryPaymentFields() {
    if (!salaryStaffSelect) return;
    const staffId = salaryStaffSelect.value;
    if (!staffId) return;
    const entry = currentPayrollData.find(p => p.staffId === staffId);
    const wages = entry ? Number(entry.wages || 0) : Number(salaryStaffSelect.selectedOptions[0]?.dataset?.wages || 0);
    const paid = currentPayrollPayments[staffId] || 0;
    const balance = Math.max(0, wages - paid);
    if (salaryPayable) salaryPayable.value = balance ? balance : wages;
    if (salaryAmount) {
        const currentVal = Number(salaryAmount.value || 0);
        if (!currentVal || currentVal > balance) {
            salaryAmount.value = balance ? balance : wages;
        }
    }
}

window.openSalaryPaymentModal = (staffId = '', staffName = '', role = '', wages = 0) => {
    if (!salaryPaymentModal) return;
    populateSalaryStaffOptions(staffId);

    if (salaryMonth) {
        salaryMonth.value = currentPayrollMonth || payrollMonthFilter?.value || '';
    }
    if (salaryDate) {
        salaryDate.valueAsDate = new Date();
    }
    if (salaryStaffSelect && staffId) {
        salaryStaffSelect.value = staffId;
    }
    if (salaryPayable) {
        const paid = currentPayrollPayments[staffId] || 0;
        const balance = Math.max(0, Number(wages || 0) - paid);
        salaryPayable.value = balance ? balance : Number(wages || 0);
    }
    if (salaryAmount) {
        salaryAmount.value = salaryPayable?.value || Number(wages || 0);
    }
    updateSalaryPaymentFields();

    const modal = bootstrap.Modal.getOrCreateInstance(salaryPaymentModal);
    modal.show();
};

async function saveSalaryPayment() {
    const user = JSON.parse(localStorage.getItem('user'));
    if (!user) return;
    const businessId = user.businessId || user.uid;

    const staffId = salaryStaffSelect?.value || '';
    const staffOpt = salaryStaffSelect?.selectedOptions?.[0];
    const staffName = staffOpt?.dataset?.name || staffOpt?.textContent || '';
    const role = staffOpt?.dataset?.role || '';
    const monthVal = salaryMonth?.value || currentPayrollMonth || '';
    const amount = parseFloat(salaryAmount?.value || '0') || 0;
    const payable = parseFloat(salaryPayable?.value || '0') || 0;
    const dateVal = salaryDate?.value || '';
    const mode = salaryMode?.value || 'Cash';
    const reference = salaryReference?.value || '';
    const notes = salaryNotes?.value || '';

    if (!staffId || !monthVal || !dateVal || amount <= 0) {
        return showAlert('warning', 'Please fill all required fields.');
    }
    if (payable && amount > payable) {
        return showAlert('warning', 'Payment amount exceeds balance.');
    }

    const paymentData = {
        staffId,
        staffName,
        role,
        month: monthVal,
        amount,
        date: new Date(dateVal),
        mode,
        reference,
        notes,
        createdAt: new Date()
    };

    try {
        await db.collection('users').doc(businessId).collection('salaryPayments').add(paymentData);
        await db.collection('users').doc(businessId).collection('transactions').add({
            type: 'Salary Payment',
            description: `Salary payment for ${staffName} (${monthVal})`,
            staffId,
            staffName,
            role,
            amount,
            date: new Date(dateVal),
            mode,
            reference,
            month: monthVal,
            status: 'Paid',
            createdAt: new Date()
        });

        if (salaryPaymentForm) salaryPaymentForm.reset();
        bootstrap.Modal.getOrCreateInstance(salaryPaymentModal).hide();
        showAlert('success', 'Salary payment recorded.');
        loadPayroll();
    } catch (e) {
        console.error('Salary payment failed', e);
        showAlert('danger', 'Failed to record salary payment.');
    }
}

function openManualAttendanceModal() {
    const select = document.getElementById('manualStaffSelect');
    const statusSelect = document.getElementById('manualStatus');
    const wageInput = document.getElementById('manualWage');
    select.innerHTML = '<option value="">Select Staff</option>';
    
    staffListCache.forEach(s => {
        if (s.active !== false) {
            const opt = document.createElement('option');
            opt.value = s.id;
            opt.textContent = s.name;
            opt.dataset.wage = s.amount || s.dailyWage;
            opt.dataset.wageType = s.wageType || 'Daily';
            opt.dataset.role = s.role;
            opt.dataset.name = s.name;
            select.appendChild(opt);
        }
    });

    const updateWage = () => {
        const opt = select.selectedOptions[0];
        if (!opt || !opt.dataset.wage) {
            wageInput.value = '';
            return;
        }
        let wage = parseFloat(opt.dataset.wage);
        if (opt.dataset.wageType === 'Monthly') {
            wage = Math.round(wage / 30); // Calculate daily rate for monthly salary
        }
        if (statusSelect.value === 'Half-Day') {
            wage = wage / 2;
        }
        wageInput.value = wage;
    };

    select.onchange = updateWage;
    statusSelect.onchange = updateWage;
    statusSelect.value = 'Present'; // Reset to default

    document.getElementById('manualDate').valueAsDate = new Date();
    new bootstrap.Modal(document.getElementById('manualAttendanceModal')).show();
}

async function saveManualAttendance() {
    const user = JSON.parse(localStorage.getItem('user'));
    const businessId = user.businessId || user.uid;
    const select = document.getElementById('manualStaffSelect');
    const staffId = select.value;
    const dateVal = document.getElementById('manualDate').value;
    const timeVal = document.getElementById('manualTime').value;
    const wage = parseFloat(document.getElementById('manualWage').value);
    const statusSelect = document.getElementById('manualStatus');

    if (!staffId || !dateVal || !wage) return alert("Please fill all fields");

    const opt = select.selectedOptions[0];
    const staffName = opt.dataset.name;
    const role = opt.dataset.role;
    const statusVal = statusSelect.value === 'Half-Day' ? 'Half-Day (Manual)' : 'Present (Manual)';

    // Create timestamp from date and time
    const dateTime = new Date(`${dateVal}T${timeVal}`);

    try {
        // Check for duplicate
        const existing = await db.collection('users').doc(businessId).collection('attendance')
            .where('staffId', '==', staffId)
            .where('dateString', '==', dateVal)
            .get();

        if (!existing.empty) {
            window.showConfirm('Duplicate Attendance', "Attendance already exists for this staff on this date. Add anyway?", async () => {
                await processManualAttendance(businessId, staffId, staffName, role, wage, dateTime, dateVal, statusVal);
            });
        } else {
            await processManualAttendance(businessId, staffId, staffName, role, wage, dateTime, dateVal, statusVal);
        }
    } catch (error) {
        console.error("Error saving manual attendance", error);
        showAlert('danger', 'Failed to save record');
    }
}

async function processManualAttendance(businessId, staffId, staffName, role, wage, dateTime, dateVal, statusVal) {
    await db.collection('users').doc(businessId).collection('attendance').add({
        staffId,
        staffName,
        role,
        wageEarned: wage,
        timestamp: dateTime,
        dateString: dateVal,
        status: statusVal,
        createdAt: new Date()
    });

    bootstrap.Modal.getInstance(document.getElementById('manualAttendanceModal')).hide();
    showAlert('success', 'Attendance recorded');
    loadAttendance();
    loadPayroll();
}

async function exportPayrollCSV() {
    if (!currentPayrollData.length) {
        return alert("No payroll data to export.");
    }

    const headers = ['Staff Name', 'Role', 'Days Present', 'Total Wages'];
    const csvRows = [headers.join(',')];

    currentPayrollData.forEach(p => {
        const row = [
            `"${p.name}"`,
            `"${p.role}"`,
            p.days,
            p.wages
        ];
        csvRows.push(row.join(','));
    });

    const csvContent = "data:text/csv;charset=utf-8," + csvRows.join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `payroll_report_${currentPayrollMonth}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

async function exportPayrollPDF() {
    if (!currentPayrollData.length) {
        return alert("No payroll data to export.");
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const user = JSON.parse(localStorage.getItem('user'));
    const businessId = user.businessId || user.uid;

    // Fetch Company Details
    let company = { companyName: 'My Company', address: '', phone: '', email: '' };
    try {
        const settingsDoc = await db.collection('users').doc(businessId).collection('settings').doc('business').get();
        if (settingsDoc.exists) company = settingsDoc.data();
    } catch(e) { console.error(e); }

    // Header
    doc.setFontSize(22);
    doc.setTextColor(40, 40, 40);
    doc.text(company.companyName || 'Company Name', 14, 20);

    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    doc.text(company.address || '', 14, 26);
    doc.text(`Phone: ${company.phone || '-'} | Email: ${company.email || '-'}`, 14, 31);

    doc.setLineWidth(0.5);
    doc.setDrawColor(200, 200, 200);
    doc.line(14, 35, 196, 35);

    // Title
    doc.setFontSize(16);
    doc.setTextColor(0, 0, 0);
    const [year, month] = currentPayrollMonth.split('-');
    const dateObj = new Date(year, month - 1);
    const monthName = dateObj.toLocaleString('default', { month: 'long', year: 'numeric' });
    doc.text(`Payroll Report - ${monthName}`, 14, 45);

    // Table
    const tableColumn = ["Staff Name", "Role", "Days Present", "Total Wages (INR)"];
    const tableRows = [];
    let totalPayout = 0;

    currentPayrollData.forEach(p => {
        totalPayout += p.wages;
        tableRows.push([p.name, p.role, p.days, p.wages.toLocaleString()]);
    });

    // Add Total Row
    tableRows.push(['', '', 'Total Payout:', `Rs. ${totalPayout.toLocaleString()}`]);

    doc.autoTable({
        head: [tableColumn],
        body: tableRows,
        startY: 50,
        theme: 'grid',
        headStyles: { fillColor: [67, 97, 238] }, // Primary color
        footStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0], fontStyle: 'bold' }
    });

    doc.save(`payroll_report_${currentPayrollMonth}.pdf`);
}

window.generatePayslip = async (staffId, staffName, role, daysPresent, totalWages) => {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const user = JSON.parse(localStorage.getItem('user'));
    const businessId = user.businessId || user.uid;
    const brand = {
        primary: [30, 107, 138],   // #1e6b8a (invoice palette)
        light: [242, 248, 250],
        border: [220, 228, 232],
        text: [17, 17, 17],
        muted: [90, 90, 90]
    };

    // Fetch Company Details
    let company = { companyName: 'My Company', address: '', phone: '', email: '' };
    try {
        const settingsDoc = await db.collection('users').doc(businessId).collection('settings').doc('business').get();
        if (settingsDoc.exists) company = settingsDoc.data();
    } catch(e) { console.error(e); }

    const monthVal = document.getElementById('payrollMonthFilter').value;
    const [year, month] = monthVal.split('-');
    const dateObj = new Date(year, month - 1);
    const monthName = dateObj.toLocaleString('default', { month: 'long', year: 'numeric' });

    // Header Band
    doc.setFillColor(...brand.primary);
    doc.rect(10, 10, 190, 24, 'F');
    doc.setFontSize(18);
    doc.setTextColor(255, 255, 255);
    doc.text(company.companyName || 'Company Name', 15, 25);
    doc.setFontSize(10);
    doc.text('PAYSLIP', 185, 25, { align: 'right' });

    // Company Logo
    if (company.logoUrl) {
        try {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.src = company.logoUrl;
            await new Promise((resolve) => {
                img.onload = resolve;
                img.onerror = resolve;
            });
            if (img.width && img.height) {
                const maxW = 26;
                const maxH = 18;
                const ratio = Math.min(maxW / img.width, maxH / img.height);
                const w = img.width * ratio;
                const h = img.height * ratio;
                doc.addImage(img, 'PNG', 168, 13, w, h);
            }
        } catch (e) {
            console.warn('Logo load failed', e);
        }
    }

    // Company Details
    doc.setFontSize(9);
    doc.setTextColor(...brand.muted);
    const addrLine = company.address ? company.address : '';
    const contactLine = `Phone: ${company.phone || '-'} | Email: ${company.email || '-'}`;
    doc.text(addrLine, 15, 40);
    doc.text(contactLine, 15, 45);

    // Period Badge
    doc.setFillColor(...brand.light);
    doc.setDrawColor(...brand.border);
    doc.rect(10, 50, 190, 12, 'FD');
    doc.setFontSize(10);
    doc.setTextColor(...brand.text);
    doc.text(`Period: ${monthName}`, 15, 58);
    doc.text(`Generated: ${new Date().toLocaleDateString()}`, 185, 58, { align: 'right' });

    // Employee Details Box
    doc.setFillColor(...brand.light);
    doc.setDrawColor(...brand.border);
    doc.rect(10, 66, 190, 26, 'FD');
    
    doc.setFontSize(10);
    doc.setTextColor(...brand.muted);
    doc.text("Employee Name:", 15, 77);
    doc.setTextColor(...brand.text);
    doc.text(staffName, 55, 77);

    doc.setTextColor(...brand.muted);
    doc.text("Role:", 15, 85);
    doc.setTextColor(...brand.text);
    doc.text(role, 55, 85);

    // Staff ID removed

    // Earnings Table
    doc.autoTable({
        startY: 98,
        head: [['Description', 'Details', 'Amount (INR)']],
        body: [
            ['Basic Wages', 'Calculated based on attendance', totalWages.toLocaleString()],
            ['Days Worked', `${daysPresent} Days`, '-'],
        ],
        theme: 'grid',
        styles: { lineColor: brand.border, textColor: brand.text },
        headStyles: { fillColor: brand.primary, textColor: 255 },
        columnStyles: { 
            0: { cellWidth: 80 },
            2: { halign: 'right', fontStyle: 'bold' }
        },
        foot: [['Net Payable', '', `Rs. ${totalWages.toLocaleString()}`]],
        footStyles: { fillColor: brand.light, textColor: brand.text, fontStyle: 'bold', halign: 'right' }
    });

    // Footer Note
    const finalY = doc.lastAutoTable.finalY + 18;
    doc.setFontSize(8);
    doc.setTextColor(...brand.muted);
    doc.text("This is a computer generated payslip.", 105, finalY, { align: 'center' });

    doc.save(`Payslip_${staffName.replace(/\s+/g, '_')}_${monthName}.pdf`);
};

function getStaffExportRows() {
    return staffListCache.map(s => ([
        s.name || '',
        s.mobile || '',
        s.role || '',
        s.amount || s.dailyWage || 0,
        s.active !== false ? 'Active' : 'Inactive'
    ]));
}

function exportStaffCSV() {
    if (!staffListCache.length) {
        alert('No staff data to export.');
        return;
    }

    const headers = ['Name', 'Mobile', 'Role', 'Wage/Salary', 'Status'];
    const rows = getStaffExportRows();
    const filename = `staff_${new Date().toISOString().split('T')[0]}.csv`;
    downloadCSV(filename, headers, rows);
}

function exportStaffPDF() {
    if (!staffListCache.length) {
        alert('No staff data to export.');
        return;
    }

    const headers = ['Name', 'Mobile', 'Role', 'Wage/Salary', 'Status'];
    const rows = getStaffExportRows();
    const filename = `staff_${new Date().toISOString().split('T')[0]}.pdf`;
    downloadPDF(filename, 'Staff Report', headers, rows);
}

window.editStaff = (id, name, mobile, role, wage, wageType = 'Daily') => {
    currentStaffId = id;
    document.getElementById('staffName').value = name;
    document.getElementById('staffMobile').value = mobile;
    document.getElementById('staffRole').value = role;
    document.getElementById('staffWage').value = wage;
    document.getElementById('staffSalaryType').value = wageType;
    document.querySelector('#staffModal .modal-title').textContent = 'Edit Staff';
    new bootstrap.Modal(document.getElementById('staffModal')).show();
};

window.toggleStaffStatus = async (id, isActive) => {
    const user = JSON.parse(localStorage.getItem('user'));
    if (user.permissions && user.permissions.canDelete === false) {
        return showAlert('danger', 'You do not have permission to update staff status.');
    }

    const actionText = isActive ? 'Deactivate' : 'Activate';
    window.showConfirm(`${actionText} Staff`, `Are you sure you want to ${actionText.toLowerCase()} this staff member?`, async () => {
        const businessId = user.businessId || user.uid;
        try {
            await db.collection('users').doc(businessId).collection('staff').doc(id).update({
                active: !isActive,
                updatedAt: new Date()
            });
            loadStaff();
            loadAttendance();
            loadPayroll();
        } catch (e) {
            console.error(e);
            showAlert('danger', 'Failed to update staff status');
        }
    });
};

window.deleteStaff = async (id) => {
    window.showConfirm('Delete Staff', 'Delete this staff member?', async () => {
        const user = JSON.parse(localStorage.getItem('user'));
        if (user.permissions && user.permissions.canDelete === false) {
            return showAlert('danger', 'You do not have permission to delete items.');
        }

        const businessId = user.businessId || user.uid;
        try {
            await db.collection('users').doc(businessId).collection('staff').doc(id).delete();
            loadStaff();
        } catch(e) { console.error(e); }
    });
};

window.deleteAttendance = async (id) => {
    window.showConfirm('Delete Attendance', 'Delete this attendance record?', async () => {
        const user = JSON.parse(localStorage.getItem('user'));
        if (user.permissions && user.permissions.canDelete === false) {
            return showAlert('danger', 'You do not have permission to delete items.');
        }

        const businessId = user.businessId || user.uid;
        try {
            await db.collection('users').doc(businessId).collection('attendance').doc(id).delete();
            loadAttendance();
            loadPayroll();
        } catch(e) { console.error(e); }
    });
};

window.printQR = async () => {
    const user = JSON.parse(localStorage.getItem('user'));
    const businessId = user.businessId || user.uid;
    let company = { companyName: 'My Company', address: '', phone: '', email: '' };
    
    try {
        const doc = await db.collection('users').doc(businessId).collection('settings').doc('business').get();
        if (doc.exists) company = doc.data();
    } catch(e) { console.error(e); }

    // Get QR Image source specifically to ensure it renders
    const qrContainer = document.getElementById('qrcode');
    const qrImg = qrContainer.querySelector('img');
    let qrHtml = '';
    
    if (qrImg) {
        qrHtml = `<img src="${qrImg.src}" alt="QR Code" />`;
    } else {
        // Fallback if canvas is used
        const canvas = qrContainer.querySelector('canvas');
        if (canvas) {
            qrHtml = `<img src="${canvas.toDataURL()}" alt="QR Code" />`;
        } else {
            qrHtml = qrContainer.innerHTML;
        }
    }

    const html = `
    <!DOCTYPE html>
    <html>
    <head>
        <title>Attendance QR Code</title>
        <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" rel="stylesheet">
        <style>
            @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;600;700&display=swap');
            
            @page { size: A4; margin: 0; }
            body {
                font-family: 'Poppins', sans-serif;
                margin: 0;
                padding: 0;
                background: #fff;
                color: #333;
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
            }
            .page-container {
                width: 210mm;
                min-height: 297mm;
                margin: 0 auto;
                background: white;
                position: relative;
                display: flex;
                flex-direction: column;
            }
            .header {
                background: linear-gradient(135deg, #0d6efd 0%, #0dcaf0 100%);
                color: white;
                padding: 40px 40px 60px 40px;
                text-align: center;
                clip-path: ellipse(150% 100% at 50% 0%);
            }
            .company-name {
                font-size: 36px;
                font-weight: 700;
                margin: 0;
                text-transform: uppercase;
                letter-spacing: 1px;
                text-shadow: 0 2px 4px rgba(0,0,0,0.1);
            }
            .company-details {
                font-size: 14px;
                opacity: 0.95;
                margin-top: 10px;
                font-weight: 300;
            }
            .content {
                flex: 1;
                padding: 20px 40px;
                text-align: center;
                display: flex;
                flex-direction: column;
                align-items: center;
            }
            .title-box {
                margin-bottom: 30px;
                margin-top: 10px;
            }
            .main-title {
                font-size: 32px;
                font-weight: 700;
                color: #2c3e50;
                margin-bottom: 5px;
            }
            .sub-title {
                font-size: 18px;
                color: #7f8c8d;
                font-weight: 300;
            }
            .qr-frame {
                background: white;
                padding: 25px;
                border-radius: 25px;
                box-shadow: 0 15px 35px rgba(13, 110, 253, 0.15);
                border: 1px solid #e9ecef;
                margin-bottom: 40px;
                display: inline-block;
                position: relative;
            }
            .qr-frame::before {
                content: '';
                position: absolute;
                top: -5px; left: -5px; right: -5px; bottom: -5px;
                border-radius: 30px;
                background: linear-gradient(45deg, #0d6efd, #0dcaf0);
                z-index: -1;
                opacity: 0.3;
            }
            .qr-frame img {
                width: 280px !important;
                height: 280px !important;
                display: block;
            }
            .instructions {
                background: #f8f9fa;
                border-radius: 15px;
                padding: 30px;
                width: 85%;
                text-align: left;
                border-left: 6px solid #0d6efd;
                box-shadow: 0 5px 15px rgba(0,0,0,0.05);
            }
            .step {
                display: flex;
                align-items: center;
                margin-bottom: 20px;
                font-size: 16px;
                color: #495057;
            }
            .step:last-child { margin-bottom: 0; }
            .step-icon {
                width: 40px;
                height: 40px;
                background: linear-gradient(135deg, #0d6efd 0%, #0a58ca 100%);
                color: white;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                margin-right: 20px;
                font-weight: bold;
                font-size: 18px;
                flex-shrink: 0;
                box-shadow: 0 4px 10px rgba(13, 110, 253, 0.3);
            }
            .footer {
                text-align: center;
                padding: 30px;
                color: #adb5bd;
                font-size: 13px;
                border-top: 1px solid #f1f1f1;
                background: #fff;
            }
            .brand {
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 8px;
                font-weight: 600;
                color: #6c757d;
                margin-bottom: 5px;
            }
            @media print {
                body { -webkit-print-color-adjust: exact; }
            }
        </style>
    </head>
    <body>
        <div class="page-container">
            <div class="header">
                <h1 class="company-name">${company.companyName || 'Company Name'}</h1>
                <div class="company-details">
                    ${company.address ? company.address : ''}
                    ${company.city ? ', ' + company.city : ''}
                    ${company.zip ? ' - ' + company.zip : ''}
                    <br>
                    ${company.phone ? '<i class="fas fa-phone"></i> ' + company.phone : ''} 
                    ${company.email ? ' &nbsp;|&nbsp; <i class="fas fa-envelope"></i> ' + company.email : ''}
                </div>
            </div>
            
            <div class="content">
                <div class="title-box">
                    <div class="main-title">Scan to Mark Attendance</div>
                    <div class="sub-title">Quick & Contactless Check-in</div>
                </div>
                
                <div class="qr-frame">
                    ${qrHtml}
                </div>
                
                <div class="instructions">
                    <h4 style="margin-top:0; margin-bottom:25px; color:#2c3e50; font-weight:600;">How to mark attendance:</h4>
                    <div class="step">
                        <div class="step-icon">1</div>
                        <div><strong>Scan QR Code</strong><br><span style="font-size:14px; color:#6c757d">Open your phone camera or QR scanner app and point it at the code.</span></div>
                    </div>
                    <div class="step">
                        <div class="step-icon">2</div>
                        <div><strong>Open Link</strong><br><span style="font-size:14px; color:#6c757d">Tap the notification or link that appears on your screen.</span></div>
                    </div>
                    <div class="step">
                        <div class="step-icon">3</div>
                        <div><strong>Enter Mobile Number</strong><br><span style="font-size:14px; color:#6c757d">Enter your registered mobile number to confirm your presence.</span></div>
                    </div>
                </div>
            </div>
            
            <div class="footer">
                <div class="brand">
                    <i class="fas fa-pipe-circle-notch"></i> Powered by SSPC
                </div>
                <p>Generated on ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}</p>
            </div>
        </div>
        <script>
            window.onload = function() { 
                setTimeout(function() { window.print(); }, 500);
            }
        </script>
    </body>
    </html>
    `;

    const win = window.open('', '_blank');
    win.document.write(html);
    win.document.close();
};



