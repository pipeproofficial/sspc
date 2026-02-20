import { auth, db, getPublicBusinessId } from './firebase-config.js';

const ownerAuthCard = document.getElementById('ownerAuthCard');
const ownerGateCard = document.getElementById('ownerGateCard');
const ownerAuthNotice = document.getElementById('ownerAuthNotice');
const ownerGateNotice = document.getElementById('ownerGateNotice');

function showOwnerAuth() {
    if (ownerAuthCard) ownerAuthCard.classList.remove('d-none');
    if (ownerGateCard) ownerGateCard.classList.add('d-none');
}

function showOwnerGate() {
    if (ownerGateCard) ownerGateCard.classList.remove('d-none');
    if (ownerAuthCard) ownerAuthCard.classList.add('d-none');
    if (ownerGateNotice) {
        ownerGateNotice.textContent = 'Enter the owner password to continue.';
    }
}

async function getOwnerPasswordStatus(businessId) {
    if (!db || !businessId) return false;
    const doc = await db
        .collection('users')
        .doc(businessId)
        .collection('settings')
        .doc('owner_auth')
        .get();
    return !!(doc.exists && doc.data() && doc.data().passwordHash);
}

async function initOwnerLogin(user) {
    const hasAuthSession = !!user;
    let businessId = '';
    const urlMode = new URLSearchParams(window.location.search).get('mode');

    // Always open Owner Password gate first when login is requested in gate mode.
    if (urlMode === 'gate') {
        showOwnerGate();
        return;
    }

    if (hasAuthSession) {
        businessId = user.uid;
    } else {
        try {
            businessId = await getPublicBusinessId();
        } catch (e) {
            businessId = '';
        }
    }

    if (!businessId) {
        showOwnerAuth();
        if (ownerAuthNotice) {
            ownerAuthNotice.textContent = 'Owner ID is not configured. Sign in to configure owner access.';
        }
        return;
    }

    if (urlMode === 'auth') {
        showOwnerAuth();
        if (ownerAuthNotice) {
            ownerAuthNotice.textContent = 'Owner access verified. Sign in to continue.';
        }
        return;
    }

    try {
        const passwordSet = await getOwnerPasswordStatus(businessId);
        if (passwordSet) {
            showOwnerGate();
        } else {
            showOwnerAuth();
            if (ownerAuthNotice) {
                ownerAuthNotice.textContent = 'Owner password not set. Sign in to manage owner access in Settings.';
            }
        }
    } catch (e) {
        showOwnerAuth();
        if (ownerAuthNotice) {
            ownerAuthNotice.textContent = 'Unable to verify owner access status. Please sign in.';
        }
        console.error(e);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    if (auth && typeof auth.onAuthStateChanged === 'function') {
        auth.onAuthStateChanged((user) => initOwnerLogin(user));
    } else {
        initOwnerLogin(null);
    }
});
