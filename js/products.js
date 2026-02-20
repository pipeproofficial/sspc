import { db, getPublicBusinessId } from './firebase-config.js';

const grid = document.getElementById('productsGrid');
const tabs = document.getElementById('productCategoryTabs');
let featuredStockUnsubscribe = null;
let activeCategory = 'All';
let allItems = [];
let contactPhone = '';
let contactWhatsapp = '';

function sanitizePhone(value) {
    if (!value) return '';
    return String(value).replace(/[^\d]/g, '');
}

function normalizeCategory(value) {
    const text = String(value || '').trim();
    return text || 'Other';
}

function applyProductsBusinessInfo(publicData = {}) {
    const companyName = String(publicData.companyName || publicData.businessName || 'SSPC').trim() || 'SSPC';
    const rawPhone = String(publicData.phone || publicData.companyPhone || '').trim();
    const phoneDigits = sanitizePhone(rawPhone);
    const displayPhone = rawPhone || (phoneDigits ? `+${phoneDigits}` : '');
    const email = String(publicData.email || publicData.companyEmail || '').trim();

    const companyNameEl = document.getElementById('productsFooterCompanyName');
    if (companyNameEl) companyNameEl.textContent = companyName;

    const phoneLink = document.getElementById('productsFooterPhoneLink');
    const phoneText = document.getElementById('productsFooterPhoneText');
    const ctaLink = document.getElementById('productsTalkToSalesLink');
    if (phoneLink && phoneText) {
        if (phoneDigits) {
            phoneLink.href = `tel:+${phoneDigits}`;
            phoneText.textContent = displayPhone;
            phoneLink.classList.remove('disabled');
            phoneLink.removeAttribute('aria-disabled');
        } else {
            phoneLink.href = '#';
            phoneText.textContent = 'Not available';
            phoneLink.classList.add('disabled');
            phoneLink.setAttribute('aria-disabled', 'true');
        }
    }
    if (ctaLink) {
        if (phoneDigits) ctaLink.href = `tel:+${phoneDigits}`;
        else ctaLink.href = 'contact.html';
    }

    const emailLink = document.getElementById('productsFooterEmailLink');
    const emailText = document.getElementById('productsFooterEmailText');
    if (emailLink && emailText) {
        if (email) {
            emailLink.href = `mailto:${email}`;
            emailText.textContent = email;
            emailLink.classList.remove('disabled');
            emailLink.removeAttribute('aria-disabled');
        } else {
            emailLink.href = '#';
            emailText.textContent = 'Not available';
            emailLink.classList.add('disabled');
            emailLink.setAttribute('aria-disabled', 'true');
        }
    }
}

function renderEmpty(message) {
    if (!grid) return;
    grid.innerHTML = `<div class="col-12 text-center text-muted">${message}</div>`;
}

function createProductCard(item, phone, whatsapp) {
    const img = item.imageUrl || 'factory-hero.png';
    const qty = item.quantity ?? 0;
    const unit = item.unit || 'pcs';
    const category = item.category || 'Other';
    const callLink = phone ? `tel:+${phone}` : '#';
    const waText = encodeURIComponent(`Hi, I want pricing for ${item.name}.`);
    const waLink = whatsapp ? `https://wa.me/${whatsapp}?text=${waText}` : '#';
    const specs = [];

    if (item.specs) specs.push(item.specs);
    if (item.diameter) specs.push(`Dia: ${item.diameter}`);
    if (item.length) specs.push(`Length: ${item.length}`);

    return `
        <div class="col-md-6 col-lg-4">
            <div class="product-card">
                <img src="${img}" alt="${item.name || 'Product'}" class="product-img">
                <h5>${item.name || 'Product'}</h5>
                <p>${item.description || 'High-strength pipe solution for infrastructure projects.'}</p>
                <div class="product-specs">
                    <span>Category: ${category}</span>
                    <span>Available Qty: ${qty}</span>
                    <span>Unit: ${unit}</span>
                    ${specs.map(s => `<span>${s}</span>`).join('')}
                </div>
                <div class="stock-quick compact product-actions">
                    <a class="btn btn-sm btn-call ${phone ? '' : 'disabled'}" href="${callLink}" title="Call">
                        <i class="fas fa-phone-alt"></i>
                    </a>
                    <a class="btn btn-sm btn-whatsapp ${whatsapp ? '' : 'disabled'}" href="${waLink}" title="WhatsApp">
                        <i class="fab fa-whatsapp"></i>
                    </a>
                </div>
            </div>
        </div>
    `;
}

function renderTabs(categories, active) {
    if (!tabs) return;
    const pills = ['All', ...categories];
    tabs.innerHTML = pills.map(cat => {
        const isActive = cat === active;
        return `<button type="button" class="category-pill ${isActive ? 'active' : ''}" data-category="${cat}">${cat}</button>`;
    }).join('');
}

function renderProductsGrid() {
    const filtered = activeCategory === 'All'
        ? allItems
        : allItems.filter(i => i.category === activeCategory);
    if (!filtered.length) {
        renderEmpty('No products found in this category.');
        return;
    }
    grid.innerHTML = filtered.map(item => createProductCard(item, contactPhone, contactWhatsapp)).join('');
}

function renderProductsView() {
    const categories = Array.from(new Set(allItems.map(i => i.category))).sort();
    if (activeCategory !== 'All' && !categories.includes(activeCategory)) {
        activeCategory = 'All';
    }
    renderTabs(categories, activeCategory);
    renderProductsGrid();
}

async function loadProducts() {
    if (!grid) return;
    if (!db) {
        renderEmpty('Products are unavailable.');
        return;
    }

    const businessId = await getPublicBusinessId();
    if (!businessId) {
        renderEmpty('Set `public_business_id` in Firebase Remote Config to load products.');
        return;
    }

    try {
        const publicDoc = await db.collection('public').doc(businessId).get();
        const publicData = publicDoc.exists ? publicDoc.data() : {};
        applyProductsBusinessInfo(publicData);
        contactPhone = sanitizePhone(publicData.phone || publicData.companyPhone || '');
        contactWhatsapp = sanitizePhone(publicData.whatsapp || publicData.companyWhatsapp || contactPhone);

        if (featuredStockUnsubscribe) {
            featuredStockUnsubscribe();
            featuredStockUnsubscribe = null;
        }

        featuredStockUnsubscribe = db.collection('public')
            .doc(businessId)
            .collection('featured_stock')
            .orderBy('name')
            .onSnapshot((snapshot) => {
                if (snapshot.empty) {
                    allItems = [];
                    renderEmpty('No products available right now.');
                    return;
                }

                const items = [];
                snapshot.forEach(doc => {
                    const data = doc.data();
                    items.push({
                        id: doc.id,
                        ...data,
                        category: normalizeCategory(data.category || data.type)
                    });
                });
                allItems = items;
                renderProductsView();
            }, (error) => {
                console.error('Failed to subscribe products', error);
                renderEmpty('Failed to load products.');
            });

        if (tabs) {
            if (!tabs.dataset.bound) {
                tabs.addEventListener('click', (e) => {
                    const btn = e.target.closest('.category-pill');
                    if (!btn) return;
                    activeCategory = btn.dataset.category;
                    renderProductsView();
                });
                tabs.dataset.bound = '1';
            }
        }
    } catch (err) {
        console.error('Failed to load products', err);
        renderEmpty('Failed to load products.');
    }
}

document.addEventListener('DOMContentLoaded', loadProducts);
