import { db, getPublicBusinessId } from './firebase-config.js';

function sanitizePhone(value) {
    if (!value) return '';
    return String(value).replace(/[^\d]/g, '');
}

function setEmail(linkId, textId, value) {
    const link = document.getElementById(linkId);
    const text = document.getElementById(textId);
    if (!link || !text) return;
    const email = String(value || '').trim();
    if (email) {
        link.href = `mailto:${email}`;
        text.textContent = email;
        link.classList.remove('disabled');
        link.removeAttribute('aria-disabled');
    } else {
        link.href = '#';
        text.textContent = 'Not available';
        link.classList.add('disabled');
        link.setAttribute('aria-disabled', 'true');
    }
}

function setPhone(linkId, textId, value) {
    const link = document.getElementById(linkId);
    const text = document.getElementById(textId);
    if (!link || !text) return;
    const raw = String(value || '').trim();
    const digits = sanitizePhone(raw);
    const display = raw || (digits ? `+${digits}` : '');
    if (digits) {
        link.href = `tel:+${digits}`;
        text.textContent = display;
        link.classList.remove('disabled');
        link.removeAttribute('aria-disabled');
    } else {
        link.href = '#';
        text.textContent = 'Not available';
        link.classList.add('disabled');
        link.setAttribute('aria-disabled', 'true');
    }
}

function applyAboutBusinessInfo(publicData = {}) {
    const companyName = String(publicData.companyName || publicData.businessName || 'SSPC').trim() || 'SSPC';
    const email = String(publicData.email || publicData.companyEmail || '').trim();
    const phoneRaw = String(publicData.phone || publicData.companyPhone || '').trim();

    const companyNameEl = document.getElementById('aboutFooterCompanyName');
    if (companyNameEl) companyNameEl.textContent = companyName;

    setEmail('aboutFooterEmailLink', 'aboutFooterEmailText', email);
    setPhone('aboutFooterPhoneLink', 'aboutFooterPhoneText', phoneRaw);

    const ctaLink = document.getElementById('aboutTalkToSalesLink');
    if (ctaLink) {
        const digits = sanitizePhone(phoneRaw);
        ctaLink.href = digits ? `tel:+${digits}` : 'contact.html';
    }
}

async function loadAboutBusinessInfo() {
    if (!db) return;
    const businessId = await getPublicBusinessId();
    if (!businessId) return;
    try {
        const publicDoc = await db.collection('public').doc(businessId).get();
        if (!publicDoc.exists) return;
        applyAboutBusinessInfo(publicDoc.data() || {});
    } catch (error) {
        console.warn('Failed to load about business info', error);
    }
}

document.addEventListener('DOMContentLoaded', loadAboutBusinessInfo);
