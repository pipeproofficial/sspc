import { db, getPublicBusinessId, remoteConfig } from './firebase-config.js';

const form = document.getElementById('contactForm');
const alertBox = document.getElementById('contactAlert');
const submitBtn = document.getElementById('contactSubmit');

function showAlert(type, message) {
    if (!alertBox) return;
    alertBox.className = `alert alert-${type}`;
    alertBox.innerHTML = message;
    alertBox.classList.remove('d-none');
}

function setLoading(isLoading) {
    if (!submitBtn) return;
    const spinner = submitBtn.querySelector('.spinner-border');
    const icon = submitBtn.querySelector('.fa-paper-plane');
    if (spinner) spinner.classList.toggle('d-none', !isLoading);
    if (icon) icon.classList.toggle('d-none', isLoading);
    submitBtn.disabled = isLoading;
}

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

function applyContactBusinessInfo(publicData = {}) {
    const companyName = String(publicData.companyName || publicData.businessName || 'SSPC').trim() || 'SSPC';
    const email = String(publicData.email || publicData.companyEmail || '').trim();
    const phoneRaw = String(publicData.phone || publicData.companyPhone || '').trim();
    const address = [
        publicData.address || publicData.companyAddress || '',
        publicData.city || '',
        publicData.state || ''
    ].map(v => String(v || '').trim()).filter(Boolean).join(', ');

    const footerCompanyName = document.getElementById('contactFooterCompanyName');
    if (footerCompanyName) footerCompanyName.textContent = companyName;

    setEmail('contactOfficeEmailLink', 'contactOfficeEmailText', email);
    setEmail('contactFooterEmailLink', 'contactFooterEmailText', email);
    setPhone('contactOfficePhoneLink', 'contactOfficePhoneText', phoneRaw);
    setPhone('contactFooterPhoneLink', 'contactFooterPhoneText', phoneRaw);

    const callSales = document.getElementById('contactFooterCallSalesLink');
    if (callSales) {
        const digits = sanitizePhone(phoneRaw);
        callSales.href = digits ? `tel:+${digits}` : '#';
    }

    const addressEl = document.getElementById('contactOfficeAddressText');
    if (addressEl) {
        addressEl.textContent = address || 'SSPC Main Office';
    }
}

async function loadContactBusinessInfo() {
    if (!db) return;
    const businessId = await getPublicBusinessId();
    if (!businessId) return;
    try {
        const publicDoc = await db.collection('public').doc(businessId).get();
        if (!publicDoc.exists) return;
        applyContactBusinessInfo(publicDoc.data() || {});
    } catch (error) {
        console.warn('Failed to load contact business info', error);
    }
}

async function getFormspreeConfig() {
    if (!remoteConfig) {
        throw new Error('Remote Config not available. Serve the site over http(s) and ensure firebase-remote-config-compat.js is loaded.');
    }

    try {
        await remoteConfig.fetchAndActivate();
    } catch (error) {
        console.warn('Remote Config fetch failed, using existing values.', error);
    }

    return {
        endpoint: remoteConfig.getString('formspree_endpoint')
    };
}

async function handleSubmit(event) {
    event.preventDefault();
    setLoading(true);
    alertBox?.classList.add('d-none');

    try {
        const { endpoint } = await getFormspreeConfig();

        if (!endpoint) {
            throw new Error('Formspree endpoint is missing.');
        }

        const payload = {
            name: document.getElementById('contactName').value.trim(),
            email: document.getElementById('contactEmail').value.trim(),
            subject: document.getElementById('contactSubject').value.trim(),
            message: document.getElementById('contactMessage').value.trim()
        };

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            throw new Error('Formspree request failed.');
        }
        showAlert('success', '<i class="fas fa-check-circle me-2"></i>Your message has been sent.');
        const modalEl = document.getElementById('contactSuccessModal');
        if (modalEl && window.bootstrap?.Modal) {
            const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
            modal.show();
        }
        form.reset();
    } catch (error) {
        console.error('Contact form error:', error);
        const message = error?.message || 'Unable to send. Please try again later.';
        showAlert('danger', `<i class="fas fa-exclamation-circle me-2"></i>${message}`);
    } finally {
        setLoading(false);
    }
}

document.addEventListener('DOMContentLoaded', loadContactBusinessInfo);

if (form) {
    form.addEventListener('submit', handleSubmit);
}
