import { auth, db, remoteConfig } from './firebase-config.js';
import { fetchPostOfficeByPincode } from './dashboard.js';
import { checkAuth } from './dashboard.js';
import { showAlert } from './auth.js';
import { initializeStateDistrictPair, setStateDistrictValues } from './location-data.js';

const settingsForm = document.getElementById('settingsForm');
let pendingFiles = {};
const backupToDriveBtn = document.getElementById('backupToComputerBtn');
const backupStatus = document.getElementById('backupStatus');
const restoreFromDriveBtn = document.getElementById('restoreFromComputerBtn');
const restoreStatus = document.getElementById('restoreStatus');
const recalcCustomerTotalsBtn = document.getElementById('recalcCustomerTotalsBtn');
const recalcCustomerTotalsStatus = document.getElementById('recalcCustomerTotalsStatus');
const settingsPasswordForm = document.getElementById('settingsPasswordForm');
const settingsNewPasswordInput = document.getElementById('settingsNewPassword');
const settingsConfirmPasswordInput = document.getElementById('settingsConfirmPassword');
const saveSettingsPasswordBtn = document.getElementById('saveSettingsPasswordBtn');
const settingsPasswordStatus = document.getElementById('settingsPasswordStatus');
const googlePasswordSetupModalEl = document.getElementById('googlePasswordSetupModal');
const googlePasswordSetupForm = document.getElementById('googlePasswordSetupForm');
const googleSetupNewPasswordInput = document.getElementById('googleSetupNewPassword');
const googleSetupConfirmPasswordInput = document.getElementById('googleSetupConfirmPassword');
const confirmGooglePasswordSetupBtn = document.getElementById('confirmGooglePasswordSetupBtn');
const googlePasswordSetupStatus = document.getElementById('googlePasswordSetupStatus');

document.addEventListener('DOMContentLoaded', async () => {
    await checkAuth();
    await initializeStateDistrictPair(
        document.getElementById('companyState'),
        document.getElementById('companyDistrict')
    );
    loadSettings();
    setupFileListeners();

    if (backupToDriveBtn) {
        backupToDriveBtn.addEventListener('click', backupToComputer);
    }
    if (restoreFromDriveBtn) {
        restoreFromDriveBtn.addEventListener('click', restoreFromComputer);
    }
    if (recalcCustomerTotalsBtn) {
        recalcCustomerTotalsBtn.addEventListener('click', recalculateCustomerTotalsSpentOnce);
    }

    if (settingsForm) {
        settingsForm.addEventListener('submit', saveSettings);
    }

    if (settingsPasswordForm) {
        settingsPasswordForm.addEventListener('submit', handleSettingsPasswordSubmit);
    }

    if (googlePasswordSetupForm) {
        googlePasswordSetupForm.addEventListener('submit', (e) => {
            e.preventDefault();
            handleGoogleSetupSubmit();
        });
    }

    if (confirmGooglePasswordSetupBtn) {
        confirmGooglePasswordSetupBtn.addEventListener('click', handleGoogleSetupSubmit);
    }

    maybeShowGooglePasswordSetupModal();
});

async function loadSettings() {
    const user = JSON.parse(localStorage.getItem('user'));
    if (!user) return;
    const businessId = user.businessId || user.uid;

    try {
        const doc = await db.collection('users').doc(businessId).collection('settings').doc('business').get();
        if (doc.exists) {
            const data = doc.data();
            if (document.getElementById('companyName')) {
                document.getElementById('companyName').value = data.companyName || '';
                document.getElementById('taxId').value = data.taxId || '';
                document.getElementById('companyEmail').value = data.email || '';
                document.getElementById('companyPhone').value = data.phone || '';
                document.getElementById('companyAddress').value = data.address || '';
                document.getElementById('companyZip').value = data.zip || '';
                if (document.getElementById('companyVillage')) document.getElementById('companyVillage').value = data.village || '';
                await setStateDistrictValues(
                    document.getElementById('companyState'),
                    document.getElementById('companyDistrict'),
                    data.state || '',
                    data.district || ''
                );
                if (document.getElementById('companyMandal')) document.getElementById('companyMandal').value = data.mandal || '';
                if (document.getElementById('companyUpiId')) {
                    document.getElementById('companyUpiId').value = data.upiId || '';
                }
                if (document.getElementById('companyBankName')) {
                    document.getElementById('companyBankName').value = data.bankName || '';
                }
                if (document.getElementById('companyBankAccountName')) {
                    document.getElementById('companyBankAccountName').value = data.bankAccountName || '';
                }
                if (document.getElementById('companyBankAccountNo')) {
                    document.getElementById('companyBankAccountNo').value = data.bankAccountNo || '';
                }
                if (document.getElementById('companyBankIfsc')) {
                    document.getElementById('companyBankIfsc').value = data.bankIfsc || '';
                }
                if (document.getElementById('companyBankBranch')) {
                    document.getElementById('companyBankBranch').value = data.bankBranch || '';
                }
                if (document.getElementById('companyGstRate')) {
                    document.getElementById('companyGstRate').value = data.gstRate ?? 18;
                }
                if (document.getElementById('invoicePrefix')) {
                    document.getElementById('invoicePrefix').value = data.invoicePrefix || '';
                }
                if (document.getElementById('invoicePad')) {
                    document.getElementById('invoicePad').value = data.invoicePad ?? 4;
                }
                if (document.getElementById('gstInvoicePrefix')) {
                    document.getElementById('gstInvoicePrefix').value = data.gstInvoicePrefix || '';
                }
                if (document.getElementById('gstInvoicePad')) {
                    document.getElementById('gstInvoicePad').value = data.gstInvoicePad ?? 4;
                }
                if (document.getElementById('gstInvoiceNextNumber')) {
                    document.getElementById('gstInvoiceNextNumber').value = data.gstInvoiceNextNumber ?? 1;
                }

                if (data.logoUrl) {
                    document.getElementById('logoUrl').value = data.logoUrl;
                    showExistingImage('logo', data.logoUrl);
                }

                if (data.signatureUrl) {
                    document.getElementById('signatureUrl').value = data.signatureUrl;
                    showExistingImage('signature', data.signatureUrl);
                }

                if (document.getElementById('autoExpiryReports')) {
                    document.getElementById('autoExpiryReports').checked = data.autoExpiryReports !== false;
                }
            }
            applyRecalcCustomerTotalsState(data);
        } else {
            applyRecalcCustomerTotalsState({});
        }

        // Disable editing for non-owners
        if (user.role !== 'owner') {
            const form = document.getElementById('settingsForm');
            if (form) {
                Array.from(form.elements).forEach(element => {
                    element.disabled = true;
                });
            }
            const saveBtn = document.getElementById('saveSettingsBtn');
            if (saveBtn) {
                saveBtn.style.display = 'none';
            }
            if (recalcCustomerTotalsBtn) recalcCustomerTotalsBtn.disabled = true;
        }
    } catch (error) {
        console.error('Error loading settings:', error);
    }
}

function setRecalcCustomerTotalsStatus(message, type = 'muted') {
    if (!recalcCustomerTotalsStatus) return;
    recalcCustomerTotalsStatus.className = `small text-${type}`;
    recalcCustomerTotalsStatus.textContent = message || '';
}

function normalizePartyName(value) {
    return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function resolveInvoiceAmountLocal(inv = {}) {
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
        const qty = Number(item.quantity || 0);
        const price = Number(item.price ?? item.rate ?? item.unitPrice ?? item.sellingPrice ?? 0);
        const gstRate = Number(item.gstRate ?? item.gst ?? 0);
        const safeQty = Number.isFinite(qty) ? qty : 0;
        const safePrice = Number.isFinite(price) ? price : 0;
        const safeGst = Number.isFinite(gstRate) ? gstRate : 0;
        const finalRate = safePrice + (safePrice * safeGst / 100);
        return sum + (safeQty * finalRate);
    }, 0);
    const transport = Number(inv.transportCost || 0);
    return itemsTotal + (Number.isFinite(transport) ? transport : 0);
}

function toDateOrNull(value) {
    if (!value) return null;
    if (value.toDate && typeof value.toDate === 'function') return value.toDate();
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
}

function applyRecalcCustomerTotalsState(settingsData = {}) {
    if (!recalcCustomerTotalsBtn) return;
    const doneAt = toDateOrNull(settingsData.customerTotalsRecalcDoneAt);
    if (doneAt) {
        recalcCustomerTotalsBtn.disabled = true;
        setRecalcCustomerTotalsStatus(`Already run on ${doneAt.toLocaleString()}.`, 'success');
    } else if (!recalcCustomerTotalsBtn.disabled) {
        setRecalcCustomerTotalsStatus('Run once to repair old Parties total spent mismatch.', 'muted');
    }
}

async function recalculateCustomerTotalsSpentOnce() {
    const user = JSON.parse(localStorage.getItem('user'));
    if (!user) return;
    if (user.role !== 'owner') {
        showAlert('danger', 'Only owner can run this repair.');
        return;
    }
    const businessId = user.businessId || user.uid;
    const settingsRef = db.collection('users').doc(businessId).collection('settings').doc('business');

    try {
        const settingsDoc = await settingsRef.get();
        const settingsData = settingsDoc.exists ? (settingsDoc.data() || {}) : {};
        const alreadyDoneAt = toDateOrNull(settingsData.customerTotalsRecalcDoneAt);
        const confirmMessage = alreadyDoneAt
            ? `This repair already ran on ${alreadyDoneAt.toLocaleString()}. Run it again now?`
            : 'This will run once and recompute Parties total spent from existing Invoice documents. Continue?';
        const confirmed = await window.showConfirmAsync(
            'Recalculate Parties Total Spent',
            confirmMessage,
            { confirmText: 'Run Repair', cancelText: 'Cancel' }
        );
        if (!confirmed) return;

        if (recalcCustomerTotalsBtn) {
            recalcCustomerTotalsBtn.disabled = true;
            recalcCustomerTotalsBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Running...';
        }
        setRecalcCustomerTotalsStatus('Recalculating from invoices...', 'muted');

        const customersRef = db.collection('users').doc(businessId).collection('customers');
        const txRef = db.collection('users').doc(businessId).collection('transactions');

        const [customersSnap, txSnap] = await Promise.all([
            customersRef.get(),
            txRef.get()
        ]);

        const totalsByName = new Map();
        let invoiceDocCount = 0;
        txSnap.forEach((doc) => {
            const inv = doc.data() || {};
            const type = String(inv.type || '').trim();
            const docType = String(inv.docType || '').trim();
            if (type !== 'Invoice' && docType !== 'Invoice') return;
            invoiceDocCount += 1;

            const key = normalizePartyName(inv.customer || inv.billLabel || '');
            if (!key) return;

            let amt = Math.max(0, Number(resolveInvoiceAmountLocal(inv) || 0));
            if (amt <= 0) {
                const bal = Number(inv.balance || 0);
                const paid = Number(inv.amountPaid || 0);
                const derived = (Number.isFinite(bal) ? bal : 0) + (Number.isFinite(paid) ? paid : 0);
                amt = Math.max(0, derived);
            }
            totalsByName.set(key, (totalsByName.get(key) || 0) + amt);
        });

        if (invoiceDocCount === 0) {
            setRecalcCustomerTotalsStatus('No Invoice documents found. Repair aborted to avoid wrong reset.', 'warning');
            showAlert('warning', 'No invoices found. Parties total spent was not changed.');
            return;
        }

        let updated = 0;
        let scanned = 0;
        let batch = db.batch();
        let batchCount = 0;
        const flushBatch = async () => {
            if (batchCount <= 0) return;
            await batch.commit();
            batch = db.batch();
            batchCount = 0;
        };

        customersSnap.forEach((doc) => {
            scanned += 1;
            const customer = doc.data() || {};
            const key = normalizePartyName(customer.name || '');
            const computed = Math.round(((totalsByName.get(key) || 0) + Number.EPSILON) * 100) / 100;
            const current = Math.round((Number(customer.totalSpent || 0) + Number.EPSILON) * 100) / 100;
            if (computed === current) return;
            batch.update(doc.ref, { totalSpent: computed, updatedAt: new Date() });
            batchCount += 1;
            updated += 1;
        });

        await flushBatch();
        await settingsRef.set({
            customerTotalsRecalcDoneAt: new Date(),
            customerTotalsRecalcVersion: 2
        }, { merge: true });

        setRecalcCustomerTotalsStatus(`Completed. Updated ${updated} of ${scanned} parties.`, 'success');
        showAlert('success', `Parties repair completed. Updated ${updated} records.`);
    } catch (error) {
        console.error('Failed to recalculate customer totals:', error);
        if (recalcCustomerTotalsBtn) recalcCustomerTotalsBtn.disabled = false;
        setRecalcCustomerTotalsStatus('Repair failed. Please try again.', 'danger');
        showAlert('danger', 'Failed to recalculate parties total spent.');
    } finally {
        if (recalcCustomerTotalsBtn) {
            recalcCustomerTotalsBtn.innerHTML = '<i class="fas fa-wrench me-2"></i>One-Time: Recalculate Parties Total Spent';
        }
        try {
            const latest = await settingsRef.get();
            if (latest.exists) applyRecalcCustomerTotalsState(latest.data() || {});
        } catch (_) {
            // no-op
        }
    }
}

function setupFileListeners() {
    ['companyLogo', 'companySignature'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('change', (e) => handleFileSelect(e, id));
        }
    });

    const ifscInput = document.getElementById('companyBankIfsc');
    if (ifscInput) {
        ifscInput.addEventListener('blur', () => fetchBankDetailsFromIfsc());
    }

    const ifscLookupBtn = document.getElementById('ifscLookupBtn');
    if (ifscLookupBtn) {
        ifscLookupBtn.addEventListener('click', () => fetchBankDetailsFromIfsc(true));
    }

    const companyZip = document.getElementById('companyZip');
    if (companyZip) {
        companyZip.addEventListener('blur', () => fillCompanyAddressFromPincode());
    }
}

async function fillCompanyAddressFromPincode() {
    const zipEl = document.getElementById('companyZip');
    const villageEl = document.getElementById('companyVillage');
    const districtEl = document.getElementById('companyDistrict');
    const stateEl = document.getElementById('companyState');
    const mandalEl = document.getElementById('companyMandal');
    if (!zipEl) return;
    const pin = (zipEl.value || '').trim();
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
}

async function fetchBankDetailsFromIfsc(fromModal = false) {
    const ifscInput = document.getElementById('companyBankIfsc');
    const bankNameInput = document.getElementById('companyBankName');
    const branchInput = document.getElementById('companyBankBranch');
    if (!ifscInput || !bankNameInput || !branchInput) return;
    const ifsc = (ifscInput.value || '').trim();
    if (!ifsc) return;
    try {
        const res = await fetch(`https://ifsc.razorpay.com/${encodeURIComponent(ifsc)}`);
        if (!res.ok) throw new Error('Invalid IFSC');
        const data = await res.json();
        if (data && data.BANK) bankNameInput.value = data.BANK;
        if (data && data.BRANCH) branchInput.value = data.BRANCH;
        if (ifscInput) ifscInput.value = ifsc;
    } catch (e) {
        console.error('IFSC lookup failed', e);
        showAlert('warning', 'IFSC code not found. Please check and enter bank details manually.');
    }
}

function setSettingsPasswordStatus(message, type = 'muted') {
    if (!settingsPasswordStatus) return;
    settingsPasswordStatus.className = `small text-${type}`;
    settingsPasswordStatus.textContent = message;
}

function setGoogleSetupStatus(message, type = 'muted') {
    if (!googlePasswordSetupStatus) return;
    googlePasswordSetupStatus.className = `small text-${type}`;
    googlePasswordSetupStatus.textContent = message;
}

function getCurrentAuthUser() {
    return auth?.currentUser || null;
}

function hasProvider(user, providerId) {
    if (!user || !Array.isArray(user.providerData)) return false;
    return user.providerData.some((provider) => provider && provider.providerId === providerId);
}

async function applyAccountPassword({ newPassword, confirmPassword, source = 'settings' }) {
    const user = getCurrentAuthUser();
    if (!user) throw new Error('No authenticated user found.');

    const next = String(newPassword || '').trim();
    const confirm = String(confirmPassword || '').trim();

    if (!next) throw new Error('Password is required.');
    if (next.length < 6) throw new Error('Use at least 6 characters.');
    if (next !== confirm) throw new Error('Passwords do not match.');

    await user.updatePassword(next);

    // If account was Google-based, disable Google sign-in by unlinking provider.
    if (hasProvider(user, 'google.com')) {
        await user.unlink('google.com');
    }

    if (source === 'settings') {
        if (settingsPasswordForm) settingsPasswordForm.reset();
        setSettingsPasswordStatus('Password updated. Google sign-in disabled for this account.', 'success');
    } else {
        if (googlePasswordSetupForm) googlePasswordSetupForm.reset();
        setGoogleSetupStatus('Password updated. Google sign-in disabled.', 'success');
    }

    showAlert('success', 'Password updated successfully.');
}

async function handleSettingsPasswordSubmit(e) {
    e.preventDefault();
    try {
        if (saveSettingsPasswordBtn) {
            saveSettingsPasswordBtn.disabled = true;
            saveSettingsPasswordBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Updating...';
        }
        setSettingsPasswordStatus('', 'muted');
        await applyAccountPassword({
            newPassword: settingsNewPasswordInput?.value,
            confirmPassword: settingsConfirmPasswordInput?.value,
            source: 'settings'
        });
    } catch (error) {
        console.error('Password update failed:', error);
        const msg = error?.message || 'Failed to update password.';
        setSettingsPasswordStatus(msg, 'danger');
        showAlert('danger', msg);
    } finally {
        if (saveSettingsPasswordBtn) {
            saveSettingsPasswordBtn.disabled = false;
            saveSettingsPasswordBtn.innerHTML = '<i class="fas fa-key me-2"></i>Update Account Password';
        }
    }
}

async function handleGoogleSetupSubmit() {
    try {
        if (confirmGooglePasswordSetupBtn) {
            confirmGooglePasswordSetupBtn.disabled = true;
            confirmGooglePasswordSetupBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Saving...';
        }
        setGoogleSetupStatus('', 'muted');
        await applyAccountPassword({
            newPassword: googleSetupNewPasswordInput?.value,
            confirmPassword: googleSetupConfirmPasswordInput?.value,
            source: 'google-modal'
        });
        sessionStorage.removeItem('sspc_google_password_setup_uid');
        if (googlePasswordSetupModalEl && window.bootstrap?.Modal) {
            const modal = bootstrap.Modal.getInstance(googlePasswordSetupModalEl) || new bootstrap.Modal(googlePasswordSetupModalEl);
            modal.hide();
        }
    } catch (error) {
        console.error('Google password setup failed:', error);
        const msg = error?.message || 'Failed to set password.';
        setGoogleSetupStatus(msg, 'danger');
    } finally {
        if (confirmGooglePasswordSetupBtn) {
            confirmGooglePasswordSetupBtn.disabled = false;
            confirmGooglePasswordSetupBtn.innerHTML = '<i class="fas fa-key me-2"></i>Set Password & Disable Google';
        }
    }
}

function maybeShowGooglePasswordSetupModal() {
    if (!googlePasswordSetupModalEl || !window.bootstrap?.Modal) return;
    const pendingUid = sessionStorage.getItem('sspc_google_password_setup_uid');
    const user = getCurrentAuthUser();
    if (!pendingUid || !user || user.uid !== pendingUid) return;
    if (!hasProvider(user, 'google.com')) {
        sessionStorage.removeItem('sspc_google_password_setup_uid');
        return;
    }

    setGoogleSetupStatus('', 'muted');
    const modal = new bootstrap.Modal(googlePasswordSetupModalEl);
    modal.show();
}

function showExistingImage(type, url) {
    const previewDiv = document.getElementById(`${type}Preview`);
    if (previewDiv) {
        previewDiv.innerHTML = `
            <img src="${url}" class="border rounded" style="height: 50px; width: auto; object-fit: contain;">
            <button type="button" class="btn btn-sm btn-outline-danger" onclick="window.removeSettingImage('${type}')"><i class="fas fa-times"></i></button>
        `;
    }
}

window.removeSettingImage = async (type) => {
    document.getElementById(`${type}Url`).value = '';
    document.getElementById(`${type}Preview`).innerHTML = '';
    document.getElementById(type === 'logo' ? 'companyLogo' : 'companySignature').value = '';

    const user = JSON.parse(localStorage.getItem('user'));
    if (!user) return;
    const businessId = user.businessId || user.uid;
    const field = type === 'logo' ? 'logoUrl' : 'signatureUrl';

    try {
        await db.collection('users')
            .doc(businessId)
            .collection('settings')
            .doc('business')
            .update({
                [field]: '',
                updatedAt: new Date()
            });
        showAlert('success', 'Image removed');
    } catch (e) {
        console.error(e);
        showAlert('danger', 'Failed to remove image');
    }
};

async function saveSettings(e) {
    e.preventDefault();
    const user = JSON.parse(localStorage.getItem('user'));
    const businessId = user.businessId || user.uid;

    const upiId = document.getElementById('companyUpiId') ? document.getElementById('companyUpiId').value.trim() : '';
    // Validate UPI ID format (e.g. username@bank, min length check)
    if (upiId && !/^[a-zA-Z0-9.\-_]{2,}@[a-zA-Z]{2,}$/.test(upiId)) {
        showAlert('warning', 'Invalid UPI ID format. Please use format like name@bank');
        return;
    }

    const settingsData = {
        companyName: document.getElementById('companyName').value,
        taxId: document.getElementById('taxId').value,
        email: document.getElementById('companyEmail').value,
        phone: document.getElementById('companyPhone').value,
        address: document.getElementById('companyAddress').value,
        state: document.getElementById('companyState').value,
        zip: document.getElementById('companyZip').value,
        village: document.getElementById('companyVillage')?.value || '',
        district: document.getElementById('companyDistrict')?.value || '',
        mandal: document.getElementById('companyMandal')?.value || '',
        upiId: upiId,
        bankName: document.getElementById('companyBankName')?.value || '',
        bankAccountName: document.getElementById('companyBankAccountName')?.value || '',
        bankAccountNo: document.getElementById('companyBankAccountNo')?.value || '',
        bankIfsc: document.getElementById('companyBankIfsc')?.value || '',
        bankBranch: document.getElementById('companyBankBranch')?.value || '',
        gstRate: parseFloat(document.getElementById('companyGstRate')?.value) || 0,
        invoicePrefix: document.getElementById('invoicePrefix')?.value || '',
        invoicePad: parseInt(document.getElementById('invoicePad')?.value, 10) || 4,
        gstInvoicePrefix: document.getElementById('gstInvoicePrefix')?.value || '',
        gstInvoicePad: parseInt(document.getElementById('gstInvoicePad')?.value, 10) || 4,
        gstInvoiceNextNumber: parseInt(document.getElementById('gstInvoiceNextNumber')?.value, 10) || 1,
        autoExpiryReports: document.getElementById('autoExpiryReports') ? document.getElementById('autoExpiryReports').checked : true,
        logoUrl: document.getElementById('logoUrl').value,
        signatureUrl: document.getElementById('signatureUrl').value,
        updatedAt: new Date()
    };

    const btn = document.getElementById('saveSettingsBtn');
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Saving...';

    // Handle Uploads
    try {
        const apiKey = await getImgBBApiKey(businessId);
        if (pendingFiles['companyLogo']) {
            settingsData.logoUrl = await uploadToImgBB(pendingFiles['companyLogo'], apiKey);
        }
        if (pendingFiles['companySignature']) {
            settingsData.signatureUrl = await uploadToImgBB(pendingFiles['companySignature'], apiKey);
        }
    } catch (error) {
        console.error('Upload error:', error);
        showAlert('warning', 'Settings saved but image upload failed: ' + error.message);
        // Continue to save text data even if upload fails
    }

    try {
        await db.collection('users').doc(businessId).collection('settings').doc('business').set(settingsData, { merge: true });
        await db.collection('public').doc(businessId).set({
            companyName: settingsData.companyName || '',
            email: settingsData.email || '',
            phone: settingsData.phone || '',
            whatsapp: settingsData.phone || '',
            updatedAt: new Date()
        }, { merge: true });
        showAlert('success', 'Settings saved successfully');
    } catch (error) {
        console.error('Error saving settings:', error);
        showAlert('danger', 'Failed to save settings');
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}

// --- Image Handling Logic (Reused from Vehicles) ---

async function handleFileSelect(e, inputId) {
    const file = e.target.files[0];
    if (!file) return;

    const type = inputId === 'companyLogo' ? 'logo' : 'signature';
    const previewDiv = document.getElementById(`${type}Preview`);
    previewDiv.innerHTML = '<span class="text-info small"><i class="fas fa-cog fa-spin"></i> Compressing...</span>';

    try {
        const compressedFile = await compressImage(file);
        pendingFiles[inputId] = compressedFile;

        const url = URL.createObjectURL(compressedFile);
        previewDiv.innerHTML = `
            <img src="${url}" class="border rounded" style="height: 50px; width: auto; object-fit: contain;">
            <span class="text-success small"><i class="fas fa-check"></i> Ready</span>
        `;
    } catch (error) {
        console.error(error);
        previewDiv.innerHTML = '<span class="text-danger small">Compression failed</span>';
    }
}

async function compressImage(file) {
    const maxSize = 100 * 1024; // 100KB for logos/signatures
    let quality = 0.9;
    let width, height;

    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.src = objectUrl;
    await new Promise(r => img.onload = r);

    const MAX_DIMENSION = 800; // Smaller max dimension for logos
    width = img.width;
    height = img.height;

    if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
        const ratio = Math.min(MAX_DIMENSION / width, MAX_DIMENSION / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, width, height);

    let blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', quality));

    while (blob.size > maxSize && quality > 0.5) {
        quality -= 0.1;
        blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', quality));
    }

    URL.revokeObjectURL(objectUrl);
    return new File([blob], file.name, { type: 'image/jpeg' });
}

async function getImgBBApiKey(businessId) {
    try {
        await remoteConfig.fetchAndActivate();
        const rcKey = remoteConfig.getValue('imgbb_api_key').asString();
        if (rcKey) return rcKey;

        const doc = await db.collection('users').doc(businessId).collection('settings').doc('integrations').get();
        if (doc.exists && doc.data().imgbbApiKey) {
            return doc.data().imgbbApiKey;
        }
        // Fallback key if none configured (Development only, ideally remove in prod)
        return "031d6299529790696342316431f5516a";
    } catch (e) {
        return null;
    }
}

async function uploadToImgBB(file, apiKey) {
    if (!apiKey) throw new Error("API Key missing");

    const formData = new FormData();
    formData.append('image', file);

    const response = await fetch(`https://api.imgbb.com/1/upload?key=${apiKey}`, {
        method: 'POST',
        body: formData
    });

    const data = await response.json();
    if (data.success) {
        return data.data.url;
    }
    throw new Error(data.error ? data.error.message : 'Upload failed');
}

function setBackupStatus(message, type = 'muted') {
    if (!backupStatus) return;
    backupStatus.className = `small text-${type}`;
    backupStatus.textContent = message;
}

function setRestoreStatus(message, type = 'muted') {
    if (restoreStatus) {
        restoreStatus.className = `small text-${type}`;
        restoreStatus.textContent = message;
    }
    if (backupStatus) {
        backupStatus.className = `small text-${type}`;
        backupStatus.textContent = message;
    }
}

const BACKUP_COLLECTIONS = [
    'transactions',
    'inventory',
    'customers',
    'suppliers',
    'orders',
    'projects',
    'purchases',
    'purchase_orders',
    'purchase_bills',
    'purchase_returns',
    'returns',
    'vehicle_expenses',
    'vehicles',
    'staff',
    'attendance',
    'salaryPayments',
    'production_runs',
    'labour_payables',
    'recipes',
    'product_master',
    'gstDocuments',
    'raw_materials',
    'settings',
    'team',
    'challans'
];

function sanitizeForJson(value) {
    if (value === null || value === undefined) return value;
    if (value.toDate && typeof value.toDate === 'function') {
        return value.toDate().toISOString();
    }
    if (Array.isArray(value)) {
        return value.map(sanitizeForJson);
    }
    if (typeof value === 'object') {
        const out = {};
        Object.keys(value).forEach((k) => {
            out[k] = sanitizeForJson(value[k]);
        });
        return out;
    }
    return value;
}

function reviveJsonDates(value) {
    if (value === null || value === undefined) return value;
    if (Array.isArray(value)) return value.map(reviveJsonDates);
    if (typeof value === 'object') {
        const out = {};
        Object.keys(value).forEach((k) => {
            out[k] = reviveJsonDates(value[k]);
        });
        return out;
    }
    if (typeof value === 'string') {
        // Convert serialized Firestore timestamps back to Date for proper query behavior.
        if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) {
            const d = new Date(value);
            if (!Number.isNaN(d.getTime())) return d;
        }
    }
    return value;
}

async function fetchCollectionData(businessId, name) {
    const snapshot = await db.collection('users').doc(businessId).collection(name).get();
    const rows = [];
    snapshot.forEach(doc => {
        rows.push({
            id: doc.id,
            ...sanitizeForJson(doc.data())
        });
    });
    return rows;
}

function isPermissionDenied(error) {
    const code = String(error?.code || '').toLowerCase();
    const msg = String(error?.message || '').toLowerCase();
    return code.includes('permission-denied') || msg.includes('insufficient permissions');
}

async function clearCollection(businessId, name) {
    const snap = await db.collection('users').doc(businessId).collection(name).get();
    const batchSize = 400;
    let batch = db.batch();
    let count = 0;

    for (const doc of snap.docs) {
        batch.delete(doc.ref);
        count++;
        if (count >= batchSize) {
            await batch.commit();
            batch = db.batch();
            count = 0;
        }
    }
    if (count > 0) await batch.commit();
}

async function restoreCollection(businessId, name, rows) {
    const batchSize = 400;
    let batch = db.batch();
    let count = 0;

    for (const row of rows) {
        const { id, ...data } = row;
        const ref = db.collection('users').doc(businessId).collection(name).doc(id || undefined);
        batch.set(ref, reviveJsonDates(data));
        count++;
        if (count >= batchSize) {
            await batch.commit();
            batch = db.batch();
            count = 0;
        }
    }
    if (count > 0) await batch.commit();
}

async function restoreFromBackupData(backup) {
    const user = JSON.parse(localStorage.getItem('user'));
    if (!user) return;
    const businessId = user.businessId || user.uid;

    window.showConfirm(
        'Restore Backup',
        'This will overwrite current data. Continue?',
        async () => {
            try {
                setRestoreStatus('Restoring backup...', 'muted');

                if (!backup || !backup.collections) {
                    throw new Error('Invalid backup format.');
                }

                const collectionNames = Object.keys(backup.collections);
                for (const name of collectionNames) {
                    await clearCollection(businessId, name);
                    await restoreCollection(businessId, name, backup.collections[name] || []);
                }

                setRestoreStatus('Restore completed successfully.', 'success');
                showAlert('success', 'Restore completed.');
            } catch (e) {
                console.error(e);
                setRestoreStatus('Restore failed.', 'danger');
                showAlert('danger', 'Restore failed.');
            }
        }
    );
}

function triggerDownload(filename, data) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

function selectBackupFile() {
    return new Promise((resolve) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json,application/json';
        input.onchange = () => resolve(input.files?.[0] || null);
        input.click();
    });
}

async function readBackupFile(file) {
    const text = await file.text();
    return JSON.parse(text);
}

async function backupToComputer() {
    const user = JSON.parse(localStorage.getItem('user'));
    if (!user) return;
    const businessId = user.businessId || user.uid;

    if (backupToDriveBtn) backupToDriveBtn.disabled = true;
    setBackupStatus('Preparing backup...', 'muted');

    try {
        setBackupStatus('Collecting data...', 'muted');

        const data = {
            businessId,
            createdAt: new Date().toISOString(),
            collections: {},
            skippedCollections: []
        };

        for (const name of BACKUP_COLLECTIONS) {
            try {
                data.collections[name] = await fetchCollectionData(businessId, name);
            } catch (error) {
                if (!isPermissionDenied(error)) throw error;
                data.collections[name] = [];
                data.skippedCollections.push(name);
            }
        }

        const filename = `PipePro_backup_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
        triggerDownload(filename, data);

        if (data.skippedCollections.length) {
            const skipped = data.skippedCollections.join(', ');
            setBackupStatus(`Backup completed with limited access. Skipped: ${skipped}`, 'warning');
            showAlert('warning', `Backup completed, but some collections were skipped due to permissions: ${skipped}`);
        } else {
            setBackupStatus('Backup completed and downloaded to your computer.', 'success');
        }
    } catch (error) {
        console.error('Backup failed:', error);
        setBackupStatus('Backup failed. Please try again.', 'danger');
        showAlert('danger', 'Backup failed.');
    } finally {
        if (backupToDriveBtn) backupToDriveBtn.disabled = false;
    }
}

async function restoreFromComputer() {
    try {
        setRestoreStatus('Select a backup file from your computer.', 'muted');
        const file = await selectBackupFile();
        if (!file) return;
        setRestoreStatus('Reading backup file...', 'muted');
        const backup = await readBackupFile(file);
        await restoreFromBackupData(backup);
    } catch (error) {
        console.error('Restore failed:', error);
        setRestoreStatus('Restore failed. Invalid or corrupted backup file.', 'danger');
        showAlert('danger', 'Restore failed.');
    }
}
