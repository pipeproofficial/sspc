import { db, getPublicBusinessId } from './firebase-config.js';

const grid = document.getElementById('landingStockGrid');
let landingFeaturedUnsubscribe = null;

function getLandingPipeCategory(item = {}) {
    const raw = String(item.productCategory || item.category || item.type || '').trim();
    return raw || 'Other Products';
}

function sanitizePhone(value) {
    if (!value) return '';
    return String(value).replace(/[^\d]/g, '');
}

function resolveBusinessContacts(publicData = {}) {
    const rawPhone = String(
        publicData.phone
        || publicData.companyPhone
        || publicData.mobile
        || publicData.phoneNumber
        || ''
    ).trim();
    const phoneDigits = sanitizePhone(rawPhone);
    const displayPhone = rawPhone || (phoneDigits ? `+${phoneDigits}` : '');
    const email = String(publicData.email || publicData.companyEmail || '').trim();
    const rawWhatsapp = String(
        publicData.whatsapp
        || publicData.companyWhatsapp
        || publicData.whatsappNumber
        || ''
    ).trim();
    const whatsappDigits = sanitizePhone(rawWhatsapp || phoneDigits);
    return { phoneDigits, displayPhone, email, whatsappDigits };
}

function applyLandingBusinessInfo(publicData = {}) {
    const companyName = String(publicData.companyName || publicData.businessName || 'SSPC').trim() || 'SSPC';
    const { phoneDigits, displayPhone, email } = resolveBusinessContacts(publicData);

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

function resolveLandingImageUrl(item = {}) {
    const raw = String(item.imageUrl || '').trim();
    if (!raw) return '/factory-hero.png';
    if (raw.startsWith('http://')) return `https://${raw.slice(7)}`;
    if (raw.startsWith('https://')) return raw;
    if (raw.startsWith('//')) return `https:${raw}`;
    if (raw.startsWith('/')) return raw;
    return `/${raw.replace(/^\.?\//, '')}`;
}

function createStockCard(item, phone, whatsapp) {
    const img = resolveLandingImageUrl(item);
    const qty = item.quantity ?? 0;
    const unit = item.unit || 'pcs';
    const productCategory = item.productCategory || item.category || item.type || 'Other';
    const categoryText = String(productCategory || '').toLowerCase();
    const nameText = String(item.name || '').toLowerCase();
    const isSeptic = categoryText.includes('septic') || nameText.includes('septic');
    const callLink = phone ? `tel:+${phone}` : '#';
    const waText = encodeURIComponent(`Hi, I want pricing for ${item.name}.`);
    const waLink = whatsapp ? `https://wa.me/${whatsapp}?text=${waText}` : '#';

    return `
        <div class="col-md-6 col-lg-3">
            <div class="stock-card h-100">
                <div class="stock-image">
                    <img src="${img}" alt="${item.name || 'Stock item'}" loading="lazy" onerror="if(!this.dataset.fallback){this.dataset.fallback='1';this.src='/hero.png';}">
                </div>
                <div class="stock-body">
                    <div class="stock-title">${item.name || 'Item'}</div>
                    <div class="stock-qty">Pipe Category: <strong>${productCategory}</strong></div>
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
        const contacts = resolveBusinessContacts(publicData);
        const phone = contacts.phoneDigits;
        const whatsapp = contacts.whatsappDigits;

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
                const groups = new Map();

                snapshot.forEach(doc => {
                    const item = doc.data() || {};
                    const group = getLandingPipeCategory(item);
                    if (!groups.has(group)) groups.set(group, []);
                    groups.get(group).push(createStockCard(item, phone, whatsapp));
                });

                const sections = [];
                Array.from(groups.keys()).sort((a, b) => a.localeCompare(b)).forEach((title) => {
                    const cards = groups.get(title) || [];
                    if (!cards.length) return;
                    sections.push(`
                        <div class="col-12 mt-3">
                            <h4 class="fw-bold mb-3">${title}</h4>
                            <div class="row g-3">
                                ${cards.join('')}
                            </div>
                        </div>
                    `);
                });
                grid.innerHTML = sections.join('');
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
