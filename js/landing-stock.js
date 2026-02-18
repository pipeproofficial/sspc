import { db, getPublicBusinessId } from './firebase-config.js';

const grid = document.getElementById('landingStockGrid');
const LANDING_PRODUCT_LIMIT = 4;
let landingFeaturedUnsubscribe = null;

function sanitizePhone(value) {
    if (!value) return '';
    return String(value).replace(/[^\d]/g, '');
}

function applyLandingBusinessInfo(publicData = {}) {
    const companyName = String(publicData.companyName || publicData.businessName || 'SSPC').trim() || 'SSPC';
    const rawPhone = String(publicData.phone || publicData.companyPhone || '').trim();
    const phoneDigits = sanitizePhone(rawPhone);
    const displayPhone = rawPhone || (phoneDigits ? `+${phoneDigits}` : '');
    const email = String(publicData.email || publicData.companyEmail || '').trim();

    const aboutCompanyNameEl = document.getElementById('aboutCompanyName');
    const footerCompanyNameEl = document.getElementById('footerCompanyName');
    if (aboutCompanyNameEl) aboutCompanyNameEl.textContent = companyName;
    if (footerCompanyNameEl) footerCompanyNameEl.textContent = companyName;

    const phoneTargets = [
        { link: 'aboutPhoneLink', text: 'aboutPhoneText' },
        { link: 'footerPhoneLink', text: 'footerPhoneText' }
    ];
    phoneTargets.forEach(({ link, text }) => {
        const linkEl = document.getElementById(link);
        const textEl = document.getElementById(text);
        if (!linkEl || !textEl) return;
        if (phoneDigits) {
            linkEl.href = `tel:+${phoneDigits}`;
            textEl.textContent = displayPhone;
            linkEl.classList.remove('disabled');
            linkEl.removeAttribute('aria-disabled');
        } else {
            linkEl.href = '#';
            textEl.textContent = 'Not available';
            linkEl.classList.add('disabled');
            linkEl.setAttribute('aria-disabled', 'true');
        }
    });

    const emailTargets = [
        { link: 'aboutEmailLink', text: 'aboutEmailText' },
        { link: 'footerEmailLink', text: 'footerEmailText' }
    ];
    emailTargets.forEach(({ link, text }) => {
        const linkEl = document.getElementById(link);
        const textEl = document.getElementById(text);
        if (!linkEl || !textEl) return;
        if (email) {
            linkEl.href = `mailto:${email}`;
            textEl.textContent = email;
            linkEl.classList.remove('disabled');
            linkEl.removeAttribute('aria-disabled');
        } else {
            linkEl.href = '#';
            textEl.textContent = 'Not available';
            linkEl.classList.add('disabled');
            linkEl.setAttribute('aria-disabled', 'true');
        }
    });
}

function renderEmpty(message) {
    if (!grid) return;
    grid.innerHTML = `<div class="col-12 text-center text-muted">${message}</div>`;
}

function createStockCard(item, phone, whatsapp) {
    const img = item.imageUrl || 'factory-hero.png';
    const qty = item.quantity ?? 0;
    const unit = item.unit || 'pcs';
    const category = item.category || item.type || 'Other';
    const callLink = phone ? `tel:+${phone}` : '#';
    const waText = encodeURIComponent(`Hi, I want pricing for ${item.name}.`);
    const waLink = whatsapp ? `https://wa.me/${whatsapp}?text=${waText}` : '#';

    return `
        <div class="col-md-6 col-lg-3">
            <div class="stock-card h-100">
                <div class="stock-image">
                    <img src="${img}" alt="${item.name || 'Stock item'}">
                </div>
                <div class="stock-body">
                    <div class="stock-title">${item.name || 'Item'}</div>
                    <div class="stock-qty">Category: <strong>${category}</strong></div>
                    <div class="stock-qty">Available Qty: <strong>${qty}</strong></div>
                    <div class="stock-qty">Unit: <strong>${unit}</strong></div>
                    <div class="stock-quick compact">
                        <a class="btn btn-sm btn-call ${phone ? '' : 'disabled'}" href="${callLink}" title="Call">
                            <i class="fas fa-phone-alt"></i>
                        </a>
                        <a class="btn btn-sm btn-whatsapp ${whatsapp ? '' : 'disabled'}" href="${waLink}" title="WhatsApp">
                            <i class="fab fa-whatsapp"></i>
                        </a>
                    </div>
                </div>
            </div>
        </div>
    `;
}

async function loadLandingStock() {
    if (!grid) return;
    if (!db) {
        renderEmpty('Stock is unavailable.');
        return;
    }
    const businessId = await getPublicBusinessId();
    if (!businessId) {
        renderEmpty('Set `public_business_id` in Firebase Remote Config to load stock.');
        return;
    }

    try {
        const publicDoc = await db.collection('public').doc(businessId).get();
        const publicData = publicDoc.exists ? publicDoc.data() : {};
        applyLandingBusinessInfo(publicData);
        const phone = sanitizePhone(publicData.phone || publicData.companyPhone || '');
        const whatsapp = sanitizePhone(publicData.whatsapp || publicData.companyWhatsapp || phone);

        if (landingFeaturedUnsubscribe) {
            landingFeaturedUnsubscribe();
            landingFeaturedUnsubscribe = null;
        }

        landingFeaturedUnsubscribe = db.collection('public')
            .doc(businessId)
            .collection('featured_stock')
            .orderBy('name')
            .onSnapshot((snapshot) => {
                if (snapshot.empty) {
                    renderEmpty('No featured stock available right now.');
                    return;
                }
                const cards = [];
                snapshot.forEach(doc => {
                    if (cards.length < LANDING_PRODUCT_LIMIT) {
                        cards.push(createStockCard(doc.data(), phone, whatsapp));
                    }
                });
                grid.innerHTML = cards.join('');
            }, (error) => {
                console.error('Failed to subscribe landing stock', error);
                renderEmpty('Failed to load stock.');
            });
    } catch (err) {
        console.error('Failed to load landing stock', err);
        renderEmpty('Failed to load stock.');
    }
}

document.addEventListener('DOMContentLoaded', loadLandingStock);
