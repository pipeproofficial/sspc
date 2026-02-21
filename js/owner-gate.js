import { auth, db, getPublicBusinessId } from './firebase-config.js';

const form = document.getElementById('ownerGateForm');
const passwordInput = document.getElementById('ownerGatePassword');
const alertEl = document.getElementById('alertMessage');
const submitBtn = document.getElementById('ownerGateBtn');

function showAlert(type, message) {
    if (!alertEl) return;
    alertEl.className = `alert alert-${type}`;
    alertEl.innerHTML = message;
    alertEl.classList.remove('d-none');
}

function hideAlert() {
    if (alertEl) alertEl.classList.add('d-none');
}

async function hashPassword(value) {
    const enc = new TextEncoder().encode(value);
    const buf = await crypto.subtle.digest('SHA-256', enc);
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function verifyOwnerPassword(raw) {
    if (!db) throw new Error('Firestore unavailable.');
    const businessId = auth && auth.currentUser
        ? auth.currentUser.uid
        : await getPublicBusinessId();
    if (!businessId) throw new Error('Business ID not configured.');

    const doc = await db.collection('users').doc(businessId).collection('settings').doc('owner_auth').get();
    if (!doc.exists || !doc.data().passwordHash) {
        throw new Error('Owner password not configured.');
    }

    const inputHash = await hashPassword(raw);
    return inputHash === doc.data().passwordHash;
}

if (form) {
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        hideAlert();

        const raw = (passwordInput?.value || '').trim();
        if (!raw) {
            showAlert('danger', 'Password is required.');
            return;
        }

        try {
            submitBtn.disabled = true;
            const spinner = submitBtn.querySelector('.spinner-border');
            if (spinner) spinner.classList.remove('d-none');

            const ok = await verifyOwnerPassword(raw);
            if (!ok) {
                showAlert('danger', 'Incorrect password.');
                return;
            }

            sessionStorage.setItem('ownerGate', 'ok');
            if (auth && auth.currentUser) {
                window.location.href = 'dashboard.html';
            } else {
                window.location.href = 'login.html?mode=auth';
            }
        } catch (err) {
            console.error(err);
            const msg = err && err.code === 'permission-denied'
                ? 'Owner gate is blocked by Firestore rules. Deploy updated rules and retry.'
                : (err.message || 'Access denied.');
            showAlert('danger', msg);
        } finally {
            submitBtn.disabled = false;
            const spinner = submitBtn.querySelector('.spinner-border');
            if (spinner) spinner.classList.add('d-none');
        }
    });
}
