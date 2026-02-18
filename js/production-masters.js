import { db, remoteConfig } from './firebase-config.js';
import { checkAuth } from './dashboard.js';
import { showAlert } from './auth.js';

const productForm = document.getElementById('productMasterFormNew');
const moldForm = document.getElementById('moldMasterForm');
const locationForm = document.getElementById('locationMasterForm');

const productTable = document.getElementById('productMasterTable');
const moldTable = document.getElementById('moldMasterTable');
const locationTable = document.getElementById('locationMasterTable');

const pmCreateBtn = document.getElementById('pmCreateBtn');
const mmCreateBtn = document.getElementById('mmCreateBtn');
const lmCreateBtn = document.getElementById('lmCreateBtn');
const pmImageFile = document.getElementById('pmImageFile');
const pmImageStatus = document.getElementById('pmImageStatus');
const pmImageUrl = document.getElementById('pmImageUrl');
const pmImageProgressWrap = document.getElementById('pmImageProgressWrap');
const pmImageProgress = document.getElementById('pmImageProgress');

let currentProductId = null;
let currentMoldId = null;
let currentLocationId = null;

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

document.addEventListener('DOMContentLoaded', async () => {
    await checkAuth();

    window.addEventListener('sectionChanged', (e) => {
        if (e.detail === 'production') {
            loadAllMasters();
        }
    });

    if (pmCreateBtn) pmCreateBtn.addEventListener('click', saveProductMaster);
    if (mmCreateBtn) mmCreateBtn.addEventListener('click', saveMoldMaster);
    if (lmCreateBtn) lmCreateBtn.addEventListener('click', saveLocationMaster);
    if (pmImageFile) pmImageFile.addEventListener('change', handleProductImageSelect);
    const categorySelect = document.getElementById('pmCategoryNew');
    if (categorySelect) {
        categorySelect.addEventListener('change', syncProductMasterCategoryFields);
        syncProductMasterCategoryFields();
    }
});

async function loadAllMasters() {
    await Promise.all([loadProducts(), loadMolds(), loadLocations()]);
}

function getBusinessId() {
    const user = JSON.parse(localStorage.getItem('user'));
    return user?.businessId || user?.uid;
}

async function loadProducts() {
    const businessId = getBusinessId();
    if (!businessId || !productTable) return;
    const tbody = productTable.querySelector('tbody');
    tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">Loading...</td></tr>';

    try {
        const snap = await db.collection('users').doc(businessId).collection('product_master').orderBy('name').get();
        if (snap.empty) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">No products yet</td></tr>';
            return;
        }
        tbody.innerHTML = '';
        snap.forEach(doc => {
            const p = doc.data();
            const cost = (p.costPrice ?? 0).toLocaleString();
            const price = (p.sellingPrice ?? 0).toLocaleString();
            const priceSummary = `₹${cost} / ₹${price}`;
            const imageCell = p.imageUrl
                ? `<a href="${p.imageUrl}" target="_blank" class="d-inline-block" title="View Image">
                        <img src="${p.imageUrl}" alt="Product" style="width: 40px; height: 40px; object-fit: cover; border-radius: 6px; border: 1px solid rgba(0,0,0,0.1);">
                   </a>`
                : '<span class="text-muted">-</span>';
            tbody.innerHTML += `
                <tr>
                    <td>${p.name || '-'}</td>
                    <td>${imageCell}</td>
                    <td>${p.category || '-'}</td>
                    <td>${priceSummary}</td>
                    <td>${p.status || 'Active'}</td>
                    <td>
                        <button class="btn btn-sm btn-outline-primary" onclick="window.editProductMaster('${doc.id}')">Edit</button>
                        <button class="btn btn-sm btn-outline-danger ms-1" onclick="window.deleteProductMaster('${doc.id}')">Delete</button>
                    </td>
                </tr>
            `;
        });
    } catch (e) {
        console.error(e);
        tbody.innerHTML = '<tr><td colspan="6" class="text-center text-danger">Error loading</td></tr>';
    }
}

async function loadMolds() {
    const businessId = getBusinessId();
    if (!businessId || !moldTable) return;
    const tbody = moldTable.querySelector('tbody');
    tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted">Loading...</td></tr>';

    try {
        const snap = await db.collection('users').doc(businessId).collection('mold_master').orderBy('moldId').get();
        if (snap.empty) {
            tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted">No molds yet</td></tr>';
            return;
        }
        tbody.innerHTML = '';
        snap.forEach(doc => {
            const m = doc.data();
            tbody.innerHTML += `
                <tr>
                    <td>${m.moldId || '-'}</td>
                    <td>${m.status || 'Available'}</td>
                    <td>${m.supportedProduct || '-'}</td>
                    <td>
                        <button class="btn btn-sm btn-outline-primary" onclick="window.editMoldMaster('${doc.id}')">Edit</button>
                        <button class="btn btn-sm btn-outline-danger ms-1" onclick="window.deleteMoldMaster('${doc.id}')">Delete</button>
                    </td>
                </tr>
            `;
        });
    } catch (e) {
        console.error(e);
        tbody.innerHTML = '<tr><td colspan="4" class="text-center text-danger">Error loading</td></tr>';
    }
}

async function loadLocations() {
    const businessId = getBusinessId();
    if (!businessId || !locationTable) return;
    const tbody = locationTable.querySelector('tbody');
    tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted">Loading...</td></tr>';

    try {
        const snap = await db.collection('users').doc(businessId).collection('location_master').orderBy('name').get();
        if (snap.empty) {
            tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted">No locations yet</td></tr>';
            return;
        }
        tbody.innerHTML = '';
        snap.forEach(doc => {
            const l = doc.data();
            const locationType = normalizeLocationType(l.type) || '-';
            tbody.innerHTML += `
                <tr>
                    <td>${l.name || '-'}</td>
                    <td>${locationType}</td>
                    <td>${l.status || 'Active'}</td>
                    <td>
                        <button class="btn btn-sm btn-outline-primary" onclick="window.editLocationMaster('${doc.id}')">Edit</button>
                        <button class="btn btn-sm btn-outline-danger ms-1" onclick="window.deleteLocationMaster('${doc.id}')">Delete</button>
                    </td>
                </tr>
            `;
        });
    } catch (e) {
        console.error(e);
        tbody.innerHTML = '<tr><td colspan="4" class="text-center text-danger">Error loading</td></tr>';
    }
}

async function saveProductMaster() {
    const businessId = getBusinessId();
    if (!businessId) return;
    const categoryVal = document.getElementById('pmCategoryNew').value;
    const autoHsn = categoryVal && categoryVal.toLowerCase().includes('septic') ? '6810' : '6810';
    const hsnVal = (document.getElementById('pmHsnNew')?.value || '').trim() || autoHsn;
    const data = {
        category: categoryVal,
        name: document.getElementById('pmNameNew').value.trim(),
        pipeType: document.getElementById('pmPipeTypeNew').value,
        loadClass: document.getElementById('pmLoadClassNew').value,
        unit: document.getElementById('pmUnitNew').value || 'Nos',
        costPrice: parseFloat(document.getElementById('pmCostPriceNew').value) || 0,
        sellingPrice: parseFloat(document.getElementById('pmSellingPriceNew').value) || 0,
        hsn: hsnVal,
        gstRate: parseFloat(document.getElementById('pmGstRateNew')?.value) || 0,
        standardProductionTime: parseFloat(document.getElementById('pmProdTimeNew').value) || 0,
        standardCuringDays: parseInt(document.getElementById('pmCuringDaysNew').value, 10) || 0,
        status: document.getElementById('pmStatusNew').value,
        imageUrl: pmImageUrl ? (pmImageUrl.value || '') : '',
        updatedAt: new Date()
    };
    if (!data.name) return showAlert('danger', 'Product name required');

    try {
        if (currentProductId) {
            await db.collection('users').doc(businessId).collection('product_master').doc(currentProductId).update(data);
            currentProductId = null;
        } else {
            data.createdAt = new Date();
            await db.collection('users').doc(businessId).collection('product_master').add(data);
        }
        productForm.reset();
        syncProductMasterCategoryFields();
        resetProductImageUI();
        showAlert('success', 'Product saved');
        loadProducts();
    } catch (e) {
        console.error(e);
        showAlert('danger', 'Failed to save product');
    }
}

function syncProductMasterCategoryFields() {
    const category = (document.getElementById('pmCategoryNew')?.value || '').toLowerCase();
    const isPipeCategory = category.includes('rcc pipe');
    const pipeTypeEl = document.getElementById('pmPipeTypeNew');
    const loadClassEl = document.getElementById('pmLoadClassNew');
    const pipeTypeWrap = pipeTypeEl?.closest('.col-md-6');
    const loadClassWrap = loadClassEl?.closest('.col-md-6');

    if (pipeTypeWrap) pipeTypeWrap.classList.toggle('d-none', !isPipeCategory);
    if (loadClassWrap) loadClassWrap.classList.toggle('d-none', !isPipeCategory);

    if (pipeTypeEl) {
        pipeTypeEl.disabled = !isPipeCategory;
        if (!isPipeCategory) {
            pipeTypeEl.value = '';
        } else if (!pipeTypeEl.value) {
            pipeTypeEl.value = 'Plain End';
        }
    }

    if (loadClassEl) {
        loadClassEl.disabled = !isPipeCategory;
        if (!isPipeCategory) {
            loadClassEl.value = '';
        } else if (!loadClassEl.value) {
            loadClassEl.value = 'NP2';
        }
    }
}

async function saveMoldMaster() {
    const businessId = getBusinessId();
    if (!businessId) return;
    const data = {
        moldId: document.getElementById('mmId').value.trim(),
        moldType: document.getElementById('mmType').value,
        supportedProduct: document.getElementById('mmProduct').value,
        status: document.getElementById('mmStatus').value,
        lastUsedDate: document.getElementById('mmLastUsed').value ? new Date(document.getElementById('mmLastUsed').value) : null,
        remarks: document.getElementById('mmRemarks').value,
        updatedAt: new Date()
    };
    if (!data.moldId) return showAlert('danger', 'Mold ID required');

    try {
        if (currentMoldId) {
            await db.collection('users').doc(businessId).collection('mold_master').doc(currentMoldId).update(data);
            currentMoldId = null;
        } else {
            data.createdAt = new Date();
            await db.collection('users').doc(businessId).collection('mold_master').add(data);
        }
        moldForm.reset();
        showAlert('success', 'Mold saved');
        loadMolds();
    } catch (e) {
        console.error(e);
        showAlert('danger', 'Failed to save mold');
    }
}

async function saveLocationMaster() {
    const businessId = getBusinessId();
    if (!businessId) return;
    const data = {
        name: document.getElementById('lmName').value.trim(),
        type: normalizeLocationType(document.getElementById('lmType').value),
        capacity: parseFloat(document.getElementById('lmCapacity').value) || 0,
        status: document.getElementById('lmStatus').value,
        updatedAt: new Date()
    };
    if (!data.name) return showAlert('danger', 'Location name required');

    try {
        if (currentLocationId) {
            await db.collection('users').doc(businessId).collection('location_master').doc(currentLocationId).update(data);
            currentLocationId = null;
        } else {
            data.createdAt = new Date();
            await db.collection('users').doc(businessId).collection('location_master').add(data);
        }
        locationForm.reset();
        showAlert('success', 'Location saved');
        loadLocations();
    } catch (e) {
        console.error(e);
        showAlert('danger', 'Failed to save location');
    }
}

window.editProductMaster = async (id) => {
    const businessId = getBusinessId();
    const doc = await db.collection('users').doc(businessId).collection('product_master').doc(id).get();
    if (!doc.exists) return;
    const p = doc.data();
    currentProductId = id;
    const categoryRaw = p.category || 'RCC Pipe';
    const categoryLower = categoryRaw.toLowerCase();
    const categoryNormalized = categoryLower === 'septic tank product' || categoryLower === 'septic tank products'
        ? 'Septic Tank'
        : categoryLower === 'water tank products'
            ? 'Water Tank'
            : categoryLower === 'rcc pipes'
                ? 'RCC Pipe'
                : categoryRaw;
    document.getElementById('pmCategoryNew').value = categoryNormalized;
    document.getElementById('pmNameNew').value = p.name || '';
    document.getElementById('pmPipeTypeNew').value = p.pipeType || 'Plain End';
    document.getElementById('pmLoadClassNew').value = p.loadClass || 'NP2';
    document.getElementById('pmUnitNew').value = p.unit || 'Nos';
    document.getElementById('pmCostPriceNew').value = p.costPrice ?? 0;
    document.getElementById('pmSellingPriceNew').value = p.sellingPrice ?? 0;
    const hsnInput = document.getElementById('pmHsnNew');
    if (hsnInput) hsnInput.value = p.hsn || '';
    const gstInput = document.getElementById('pmGstRateNew');
    if (gstInput) gstInput.value = p.gstRate ?? 0;
    document.getElementById('pmProdTimeNew').value = p.standardProductionTime || '';
    document.getElementById('pmCuringDaysNew').value = p.standardCuringDays || '';
    document.getElementById('pmStatusNew').value = p.status || 'Active';
    syncProductMasterCategoryFields();
    setProductImageUI(p.imageUrl || '');
};

window.deleteProductMaster = async (id) => {
    if (!confirm('Delete this product?')) return;
    const businessId = getBusinessId();
    await db.collection('users').doc(businessId).collection('product_master').doc(id).delete();
    loadProducts();
};

window.deleteProductImage = () => {
    if (pmImageUrl) pmImageUrl.value = '';
    if (pmImageFile) pmImageFile.value = '';
    const existing = document.getElementById('productImageExisting');
    if (existing) existing.classList.add('d-none');
    if (pmImageStatus) pmImageStatus.innerHTML = '<span class="text-danger">Removed</span>';
    if (pmImageProgressWrap) pmImageProgressWrap.classList.add('d-none');
};

function setProductImageUI(url) {
    if (!pmImageUrl) return;
    pmImageUrl.value = url || '';
    const existing = document.getElementById('productImageExisting');
    const link = document.getElementById('productImageLink');
    if (url) {
        if (existing) existing.classList.remove('d-none');
        if (link) link.href = url;
        if (pmImageStatus) pmImageStatus.innerHTML = '<span class="text-success">Image loaded</span>';
    } else {
        if (existing) existing.classList.add('d-none');
        if (pmImageStatus) pmImageStatus.innerHTML = '';
    }
}

function resetProductImageUI() {
    if (pmImageFile) pmImageFile.value = '';
    if (pmImageUrl) pmImageUrl.value = '';
    const existing = document.getElementById('productImageExisting');
    if (existing) existing.classList.add('d-none');
    if (pmImageStatus) pmImageStatus.innerHTML = '';
    if (pmImageProgressWrap) pmImageProgressWrap.classList.add('d-none');
}

async function handleProductImageSelect() {
    const file = pmImageFile?.files?.[0];
    if (!file) return;

    if (pmImageStatus) {
        pmImageStatus.innerHTML = '<span class="text-info"><i class="fas fa-cog fa-spin"></i> Compressing...</span>';
    }
    if (pmImageProgressWrap) pmImageProgressWrap.classList.add('d-none');

    try {
        const compressedFile = await compressProductImage(file);
        const businessId = getBusinessId();
        const apiKey = await getImgBBApiKey(businessId);
        if (!apiKey) {
            if (pmImageStatus) pmImageStatus.innerHTML = '<span class="text-danger">ImgBB API key not set</span>';
            return;
        }

        if (pmImageStatus) {
            const size = (compressedFile.size / 1024).toFixed(1);
            pmImageStatus.innerHTML = `<span class="text-primary"><i class="fas fa-spinner fa-spin"></i> Uploading (${size} KB)...</span>`;
        }
        if (pmImageProgressWrap) pmImageProgressWrap.classList.remove('d-none');
        if (pmImageProgress) {
            pmImageProgress.style.width = '0%';
            pmImageProgress.textContent = '0%';
        }

        const url = await uploadToImgBBWithProgress(compressedFile, apiKey, (pct) => {
            if (pmImageProgress) {
                pmImageProgress.style.width = `${pct}%`;
                pmImageProgress.textContent = `${pct}%`;
            }
        });

        setProductImageUI(url);
        if (pmImageStatus) pmImageStatus.innerHTML = '<span class="text-success"><i class="fas fa-check-circle"></i> Uploaded</span>';
    } catch (e) {
        console.error(e);
        if (pmImageStatus) pmImageStatus.innerHTML = '<span class="text-danger">Upload failed</span>';
    }
}

async function compressProductImage(file) {
    const maxSize = 100 * 1024; // 100KB target
    let quality = 0.92;
    let width, height;

    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.src = objectUrl;
    await new Promise(r => img.onload = r);

    const MAX_DIMENSION = 1400;
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

    while (blob.size > maxSize) {
        if (quality > 0.72) {
            quality -= 0.04;
            blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', quality));
        } else {
            width = Math.round(width * 0.9);
            height = Math.round(height * 0.9);
            if (width < 500 || height < 500) break;
            canvas.width = width;
            canvas.height = height;
            ctx.drawImage(img, 0, 0, width, height);
            quality = 0.85;
            blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', quality));
        }
    }

    URL.revokeObjectURL(objectUrl);
    return new File([blob], file.name, { type: 'image/jpeg' });
}

async function getImgBBApiKey(businessId) {
    try {
        if (remoteConfig) {
            await remoteConfig.fetchAndActivate();
            const rcKey = remoteConfig.getValue('imgbb_api_key').asString();
            if (rcKey) return rcKey;
        }

        const doc = await db.collection('users').doc(businessId).collection('settings').doc('integrations').get();
        if (doc.exists && doc.data().imgbbApiKey) {
            return doc.data().imgbbApiKey;
        }
        return null;
    } catch (e) {
        console.error('Config Error:', e);
        return null;
    }
}

function uploadToImgBBWithProgress(file, apiKey, onProgress) {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', `https://api.imgbb.com/1/upload?key=${apiKey}`);
        xhr.upload.onprogress = (e) => {
            if (!e.lengthComputable) return;
            const pct = Math.round((e.loaded / e.total) * 100);
            onProgress(pct);
        };
        xhr.onload = () => {
            try {
                const data = JSON.parse(xhr.responseText);
                if (data.success) return resolve(data.data.url);
                reject(new Error(data.error ? data.error.message : 'Upload failed'));
            } catch (err) {
                reject(err);
            }
        };
        xhr.onerror = () => reject(new Error('Upload failed'));
        const formData = new FormData();
        formData.append('image', file);
        xhr.send(formData);
    });
}

window.editMoldMaster = async (id) => {
    const businessId = getBusinessId();
    const doc = await db.collection('users').doc(businessId).collection('mold_master').doc(id).get();
    if (!doc.exists) return;
    const m = doc.data();
    currentMoldId = id;
    document.getElementById('mmId').value = m.moldId || '';
    document.getElementById('mmType').value = m.moldType || 'Pipe Mold';
    document.getElementById('mmProduct').value = m.supportedProduct || '';
    document.getElementById('mmStatus').value = m.status || 'Available';
    document.getElementById('mmLastUsed').value = m.lastUsedDate ? m.lastUsedDate.toDate().toISOString().split('T')[0] : '';
    document.getElementById('mmRemarks').value = m.remarks || '';
};

window.deleteMoldMaster = async (id) => {
    if (!confirm('Delete this mold?')) return;
    const businessId = getBusinessId();
    await db.collection('users').doc(businessId).collection('mold_master').doc(id).delete();
    loadMolds();
};

window.editLocationMaster = async (id) => {
    const businessId = getBusinessId();
    const doc = await db.collection('users').doc(businessId).collection('location_master').doc(id).get();
    if (!doc.exists) return;
    const l = doc.data();
    currentLocationId = id;
    document.getElementById('lmName').value = l.name || '';
    document.getElementById('lmType').value = normalizeLocationType(l.type) || 'Production Output';
    document.getElementById('lmCapacity').value = l.capacity || '';
    document.getElementById('lmStatus').value = l.status || 'Active';
};

window.deleteLocationMaster = async (id) => {
    if (!confirm('Delete this location?')) return;
    const businessId = getBusinessId();
    await db.collection('users').doc(businessId).collection('location_master').doc(id).delete();
    loadLocations();
};
