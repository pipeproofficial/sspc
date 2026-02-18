import { auth, db, remoteConfig } from './firebase-config.js';
import { showAlert } from './auth.js';

// DOM Elements
const userNameElement = document.getElementById('userName');
const userEmailElement = document.getElementById('userEmail');
const logoutBtn = document.getElementById('logoutBtn');
const lockBtn = document.getElementById('lockBtn');
const recentProjectsList = document.getElementById('recentProjects');
const sidebarToggle = document.getElementById('sidebarToggle');
const mobileLogoutBtn = document.getElementById('mobileLogoutBtn');
const mobileLockBtn = document.getElementById('mobileLockBtn');
const sidebarOverlay = document.getElementById('sidebarOverlay');
const notificationBadge = document.getElementById('notificationBadge');
const notificationMenu = document.getElementById('notificationMenu');
const profitReportBtn = document.getElementById('profitReportBtn');
const darkModeToggle = document.getElementById('darkModeToggle');
const themeToggleBtn = document.getElementById('themeToggle');

function ownerGateTrustKey(uid) {
    return `sspc_owner_gate_trust_${uid}`;
}

function hasOwnerGateTrust(uid) {
    if (!uid) return false;
    return localStorage.getItem(ownerGateTrustKey(uid)) === '1';
}

// Chart Variables
let revenueChart;
let teamMembersCache = [];
const RAW_CATEGORIES = ['Raw Materials', 'Cement', 'Sand', 'Aggregate', 'Steel', 'Fly Ash', 'Admixtures', 'Chemicals'];

// Notification State
let notificationState = { inventory: [], vehicles: [] };
let notificationUnsubscribers = [];
let notificationsBusinessId = '';
let productMasterCategoryCache = new Map();
let productMasterCategoryCacheBusinessId = '';

// Initialize Dashboard
document.addEventListener('DOMContentLoaded', async () => {
    initializeTheme();
    await checkAuth();
    setupNavigation();
    await loadUserData();
    loadTeamMembers();
    setupEventListeners();

    // Handle initial hash or default to dashboard
    if (!window.location.hash) {
        window.location.hash = '#dashboard';
    } else {
        handleHashChange();
    }

    // Listen for dashboard section to load data
    window.addEventListener('sectionChanged', (e) => {
        if (e.detail === 'dashboard') {
            loadDashboardData();
            initializeChart();
        }
    });

    // Global Modal Helpers
    window.showConfirm = (title, message, callback) => {
        document.getElementById('genericConfirmTitle').textContent = title;
        document.getElementById('genericConfirmMessage').textContent = message;
        const btn = document.getElementById('genericConfirmBtn');

        // Clone to remove old listeners
        const newBtn = btn.cloneNode(true);
        btn.parentNode.replaceChild(newBtn, btn);

        newBtn.addEventListener('click', () => {
            const modalEl = document.getElementById('genericConfirmModal');
            const modal = bootstrap.Modal.getInstance(modalEl) || new bootstrap.Modal(modalEl);
            modal.hide();
            callback();
        });

        new bootstrap.Modal(document.getElementById('genericConfirmModal')).show();
    };

    window.showPrompt = (title, label, defaultValue, callback) => {
        document.getElementById('genericInputTitle').textContent = title;
        document.getElementById('genericInputLabel').textContent = label;
        const input = document.getElementById('genericInputValue');
        input.value = defaultValue || '';

        const btn = document.getElementById('genericInputBtn');
        const newBtn = btn.cloneNode(true);
        btn.parentNode.replaceChild(newBtn, btn);

        newBtn.addEventListener('click', () => {
            const val = input.value;
            if (val) {
                const modalEl = document.getElementById('genericInputModal');
                const modal = bootstrap.Modal.getInstance(modalEl) || new bootstrap.Modal(modalEl);
                modal.hide();
                callback(val);
            }
        });

        new bootstrap.Modal(document.getElementById('genericInputModal')).show();
    };

    if (profitReportBtn) {
        profitReportBtn.addEventListener('click', openProfitReport);
    }

    if (lockBtn) {
        lockBtn.addEventListener('click', handleLock);
    }
    if (mobileLockBtn) {
        mobileLockBtn.addEventListener('click', handleLock);
    }
    if (logoutBtn) {
        logoutBtn.addEventListener('click', handleLogout);
    }
    if (mobileLogoutBtn) {
        mobileLogoutBtn.addEventListener('click', handleLogout);
    }
});

function applyTheme(isDark, persist = true) {
    document.documentElement.classList.toggle('theme-dark', Boolean(isDark));
    if (darkModeToggle) darkModeToggle.checked = Boolean(isDark);
    if (themeToggleBtn) {
        themeToggleBtn.classList.toggle('is-dark', Boolean(isDark));
        themeToggleBtn.setAttribute('aria-pressed', isDark ? 'true' : 'false');
        themeToggleBtn.setAttribute('title', isDark ? 'Switch to light theme' : 'Switch to dark theme');
    }
    if (persist) {
        localStorage.setItem('sspcTheme', isDark ? 'dark' : 'light');
    }
}

function initializeTheme() {
    const stored = localStorage.getItem('sspcTheme');
    const isDark = stored === 'dark';
    applyTheme(isDark, false);
    if (darkModeToggle && !darkModeToggle.dataset.bound) {
        darkModeToggle.addEventListener('change', () => {
            applyTheme(Boolean(darkModeToggle.checked), true);
        });
        darkModeToggle.dataset.bound = '1';
    }
    if (themeToggleBtn && !themeToggleBtn.dataset.bound) {
        themeToggleBtn.addEventListener('click', () => {
            const nextIsDark = !document.documentElement.classList.contains('theme-dark');
            applyTheme(nextIsDark, true);
        });
        themeToggleBtn.dataset.bound = '1';
    }
}

// Check Authentication
function setupNavigation() {
    // Listen for hash changes
    window.addEventListener('hashchange', handleHashChange);

    const navLinks = document.querySelectorAll('.sidebar .nav-link[data-section]');

    navLinks.forEach(link => {
        const section = link.getAttribute('data-section');
        link.setAttribute('href', `#${section}`);

        link.addEventListener('click', () => {
            // Close sidebar on mobile after click
            const sidebar = document.getElementById('sidebar');
            const overlay = document.getElementById('sidebarOverlay');
            if (sidebar) sidebar.classList.remove('show');
            if (overlay) overlay.classList.remove('show');
        });
    });
}

async function handleHashChange() {
    const hash = window.location.hash.substring(1);
    if (!hash) return;
    if (hash === 'suppliers' || hash === 'raw-materials') {
        if (window.location.hash !== '#supply') {
            window.location.hash = '#supply';
            return;
        }
    }
    const normalizedHash = (hash === 'suppliers' || hash === 'raw-materials') ? 'supply' : hash;

    // Update Body Class for Mobile Styling
    if (normalizedHash === 'dashboard') {
        document.body.classList.add('section-dashboard');
    } else {
        document.body.classList.remove('section-dashboard');
    }

    const targetSection = document.getElementById(`section-${normalizedHash}`);
    if (!targetSection) {
        window.location.hash = '#dashboard';
        return;
    }

    // Show Loading
    showSectionLoading();

    // Update Active Link
    document.querySelectorAll('.sidebar .nav-link').forEach(l => l.classList.remove('active'));
    const activeLink = document.querySelector(`.sidebar .nav-link[data-section="${normalizedHash}"]`);
    if (activeLink) activeLink.classList.add('active');

    // Hide all sections
    document.querySelectorAll('.main-section').forEach(s => s.classList.add('d-none'));

    // Artificial delay for premium feel
    await new Promise(resolve => setTimeout(resolve, 600));

    // Show target section
    targetSection.classList.remove('d-none');

    // Trigger data load
    window.dispatchEvent(new CustomEvent('sectionChanged', { detail: normalizedHash }));

    // Hide Loading
    hideSectionLoading();
}

async function checkAuth() {
    return new Promise((resolve) => {
        const unsubscribe = auth.onAuthStateChanged(async (user) => {
            unsubscribe();
            if (!user) {
                window.location.href = 'login.html?mode=gate';
                resolve(false);
            } else {
                // Ensure localStorage is populated so other functions work
                if (!localStorage.getItem('user')) {
                    try {
                        const doc = await db.collection('users').doc(user.uid).get();
                        const userData = doc.exists ? doc.data() : {};
                        localStorage.setItem('user', JSON.stringify({
                            uid: user.uid,
                            email: user.email,
                            displayName: user.displayName,
                            photoURL: user.photoURL,
                            businessId: userData.businessId || user.uid,
                            role: userData.role || 'owner',
                            permissions: userData.permissions || { canDelete: true, viewRevenue: true }
                        }));
                    } catch (error) {
                        console.error("Error fetching user profile:", error);
                    }
                }
                try {
                    const currentUser = JSON.parse(localStorage.getItem('user')) || {};
                    if (currentUser.role === 'owner') {
                        const businessId = currentUser.businessId || user.uid;
                        const ownerAuthDoc = await db.collection('users')
                            .doc(businessId)
                            .collection('settings')
                            .doc('owner_auth')
                            .get();
                        const ownerGateEnabled = !!(ownerAuthDoc.exists && ownerAuthDoc.data() && ownerAuthDoc.data().passwordHash);
                        const trusted = sessionStorage.getItem('ownerGate') === 'ok' || hasOwnerGateTrust(user.uid);
                        if (ownerGateEnabled && !trusted) {
                            window.location.href = 'login.html?mode=gate';
                            resolve(false);
                            return;
                        }
                        if (trusted) {
                            sessionStorage.setItem('ownerGate', 'ok');
                        }
                    }
                } catch (e) {
                    console.error('Owner gate check failed:', e);
                }
                resolve(true);
            }
        });
    });
}

// Load User Data
async function loadUserData() {
    const user = JSON.parse(localStorage.getItem('user'));

    if (user) {
        if (userNameElement) {
            const roleBadge = user.role !== 'owner' ? ` <span class="badge bg-info text-dark" style="font-size:0.6em">${user.role}</span>` : '';
            userNameElement.innerHTML = (user.displayName || user.email) + roleBadge;
        }
        if (userEmailElement) userEmailElement.textContent = user.email;

        const mobileUserName = document.getElementById('mobileUserName');
        if (mobileUserName) {
            mobileUserName.textContent = (user.displayName || user.email).split(' ')[0];
        }

        const sidebarUserName = document.getElementById('sidebarUserName');
        const sidebarUserEmail = document.getElementById('sidebarUserEmail');
        if (sidebarUserName) sidebarUserName.textContent = user.displayName || user.email;
        if (sidebarUserEmail) sidebarUserEmail.textContent = user.email;
    }
}

// Load Dashboard Data
async function loadDashboardData() {
    const user = JSON.parse(localStorage.getItem('user'));

    if (!user) return;
    const businessId = user.businessId || user.uid;
    const canViewRevenue = user.permissions ? user.permissions.viewRevenue : true;

    // Setup Real-time Notifications
    setupNotifications(businessId);

    try {
        // Load Recent Orders
        const projectsSnapshot = await db.collection('users').doc(businessId)
            .collection('orders')
            .orderBy('createdAt', 'desc')
            .limit(5)
            .get();

        if (recentProjectsList) {
            recentProjectsList.innerHTML = '';

            if (projectsSnapshot.empty) {
                recentProjectsList.innerHTML = `
                    <div class="text-center py-4 text-muted">
                        <i class="fas fa-project-diagram fa-3x mb-3"></i>
                        <p>No orders yet</p>
                    </div>
                `;
            } else {
                projectsSnapshot.forEach(doc => {
                    const project = doc.data();
                    const statusClass = getStatusClass(project.status);

                    const projectItem = `
                        <a href="#" onclick="window.navigateToSection('projects'); return false;" class="list-group-item list-group-item-action">
                            <div class="d-flex w-100 justify-content-between">
                                <h6 class="mb-1">${project.name}</h6>
                                <small class="${statusClass}">${project.status}</small>
                            </div>
                            <p class="mb-1">${project.customerName || 'No customer'}</p>
                            <small class="text-muted">${formatDate(project.createdAt)}</small>
                        </a>
                    `;

                    recentProjectsList.innerHTML += projectItem;
                });
            }
        }
        // Update stats
        updateDashboardStats(businessId);

    } catch (error) {
        console.error('Error loading dashboard data:', error);
        showAlert('danger', 'Failed to load dashboard data. Please refresh the page.');
    }
}

// Update Dashboard Statistics
async function updateDashboardStats(businessId) {
    try {
        // Get total projects
        const projectsSnapshot = await db.collection('users').doc(businessId)
            .collection('orders')
            .get();

        const totalProjects = projectsSnapshot.size;
        const activeProjects = projectsSnapshot.docs.filter(doc =>
            ['Pending', 'Processing', 'Dispatched'].includes(doc.data().status)
        ).length;

        // Get total customers
        const customersSnapshot = await db.collection('users').doc(businessId)
            .collection('customers')
            .get();

        const totalCustomers = customersSnapshot.size;

        // Calculate monthly revenue (last 30 days)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const revenueSnapshot = await db.collection('users').doc(businessId)
            .collection('transactions')
            .where('type', '==', 'Invoice')
            .where('status', '==', 'Paid')
            .where('date', '>=', thirtyDaysAgo)
            .get();

        let monthlyRevenue = 0;
        revenueSnapshot.forEach(doc => {
            monthlyRevenue += doc.data().amount || 0;
        });

        // Get pending invoices
        const pendingSnapshot = await db.collection('users').doc(businessId)
            .collection('transactions')
            .where('type', '==', 'Invoice')
            .where('status', '==', 'Pending')
            .get();

        let pendingAmount = 0;
        pendingSnapshot.forEach(doc => {
            pendingAmount += doc.data().amount || 0;
        });
        // Inventory summary
        const inventoryAllSnapshot = await db.collection('users').doc(businessId)
            .collection('inventory')
            .get();

        let lowStockItems = 0;
        let totalStockQty = 0;
        const lowStockList = [];
        inventoryAllSnapshot.forEach(doc => {
            const d = doc.data();
            const qty = d.quantity || 0;
            const reorder = d.reorderLevel ?? 10;
            totalStockQty += qty;
            if (qty <= reorder) {
                lowStockItems += 1;
                lowStockList.push({
                    name: d.name || 'Unnamed',
                    qty,
                    reorder
                });
            }
        });
        const totalStockItems = inventoryAllSnapshot.size;

        const stockSummaryList = [];
        inventoryAllSnapshot.forEach(doc => {
            const d = doc.data();
            if (RAW_CATEGORIES.includes(d.category)) return;
            stockSummaryList.push({
                name: d.name || 'Unnamed',
                category: d.category || '-',
                qty: d.quantity ?? 0,
                unit: d.unit || ''
            });
        });

        // Production summary (current month)
        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const productionSnapshot = await db.collection('users').doc(businessId)
            .collection('production_runs')
            .where('date', '>=', monthStart)
            .get();
        const productionCount = productionSnapshot.size;

        // Sales today (paid invoices)
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const salesSnapshot = await db.collection('users').doc(businessId)
            .collection('transactions')
            .where('type', '==', 'Invoice')
            .where('status', '==', 'Paid')
            .where('date', '>=', todayStart)
            .get();
        let salesToday = 0;
        salesSnapshot.forEach(doc => {
            salesToday += doc.data().amount || 0;
        });

        // Update UI elements
        updateStatElement('totalProjects', totalProjects);
        updateStatElement('totalCustomers', totalCustomers);
        updateStatElement('monthlyRevenue', `₹${monthlyRevenue.toLocaleString()}`);

        const pendingEl = document.getElementById('pendingInvoices');
        if (pendingEl) pendingEl.textContent = pendingSnapshot.size;

        updateStatElement('revenueAmount', `₹${monthlyRevenue.toLocaleString()}`);
        updateStatElement('activeProjects', activeProjects);
        updateStatElement('lowStockItems', lowStockItems);
        updateStatElement('pendingAmount', `₹${pendingAmount.toLocaleString()}`);

        updateStatElement('dashProductionSummary', productionCount);
        updateStatElement('dashStockSummary', totalStockItems);
        updateStatElement('dashSalesToday', `₹${salesToday.toLocaleString()}`);
        updateStatElement('dashPendingPayments', `₹${pendingAmount.toLocaleString()}`);
        updateStatElement('dashLowStockAlerts', lowStockItems);

        const prodSub = document.getElementById('dashProductionSummarySub');
        if (prodSub) prodSub.textContent = 'This month';
        const stockSub = document.getElementById('dashStockSummarySub');
        if (stockSub) stockSub.textContent = `Total qty: ${totalStockQty.toLocaleString()}`;

        const countEl = document.getElementById('dashLowStockCount');
        if (countEl) countEl.textContent = lowStockItems;

        const lowStockTable = document.querySelector('#lowStockTable tbody');
        if (lowStockTable) {
            lowStockTable.innerHTML = '';
            if (!lowStockList.length) {
                lowStockTable.innerHTML = '<tr><td colspan="3" class="text-center text-muted py-2">No low stock items</td></tr>';
            } else {
                lowStockList
                    .sort((a, b) => (a.qty - a.reorder) - (b.qty - b.reorder))
                    .slice(0, 12)
                    .forEach(item => {
                        lowStockTable.innerHTML += `
                            <tr>
                                <td>${item.name}</td>
                                <td class="text-end">${item.qty}</td>
                                <td class="text-end">${item.reorder}</td>
                            </tr>
                        `;
                    });
            }
        }

        const stockSummaryTable = document.querySelector('#dashStockSummaryTable tbody');
        if (stockSummaryTable) {
            stockSummaryTable.innerHTML = '';
            if (!stockSummaryList.length) {
                stockSummaryTable.innerHTML = '<tr><td colspan="3" class="text-center text-muted py-2">No stock items found</td></tr>';
            } else {
                stockSummaryList
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .slice(0, 15)
                    .forEach(item => {
                        stockSummaryTable.innerHTML += `
                            <tr>
                                <td>${item.name}</td>
                                <td>${item.category}</td>
                                <td class="text-end">${item.qty} ${item.unit}</td>
                            </tr>
                        `;
                    });
            }
        }

    } catch (error) {
        console.error('Error updating stats:', error);
    }
}

function updateStatElement(elementId, value) {
    const element = document.getElementById(elementId);
    if (element) {
        element.textContent = value;
    }
    document.querySelectorAll(`[data-kpi="${elementId}"]`).forEach((el) => {
        el.textContent = value;
    });
}

// Initialize Chart with Real Data
async function initializeChart() {
    const ctx = document.getElementById('revenueChart');
    if (!ctx) return;

    const user = JSON.parse(localStorage.getItem('user'));
    if (!user) return;
    const businessId = user.businessId || user.uid;

    // Check permission
    if (user.permissions && user.permissions.viewRevenue === false) {
        return; // Don't load chart data
    }

    let labels = [];
    let data = [];

    if (user) {
        try {
            // Get last 6 months of invoices
            const sixMonthsAgo = new Date();
            sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

            const snapshot = await db.collection('users').doc(businessId)
                .collection('transactions')
                .where('type', '==', 'Invoice')
                .where('date', '>=', sixMonthsAgo)
                .orderBy('date', 'asc')
                .get();

            const monthlyData = {};
            snapshot.forEach(doc => {
                const t = doc.data();
                const date = t.date.toDate ? t.date.toDate() : new Date(t.date);
                const monthYear = date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
                monthlyData[monthYear] = (monthlyData[monthYear] || 0) + (t.amount || 0);
            });

            labels = Object.keys(monthlyData);
            data = Object.values(monthlyData);
        } catch (e) {
            console.error("Error loading chart data", e);
        }
    }

    revenueChart = new Chart(ctx.getContext('2d'), {
        type: 'line',
        data: {
            labels: labels.length ? labels : ['No Data'],
            datasets: [{
                label: 'Revenue',
                data: data.length ? data : [0],
                borderColor: '#3498db',
                backgroundColor: 'rgba(52, 152, 219, 0.1)',
                borderWidth: 2,
                fill: true,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    mode: 'index',
                    intersect: false
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: {
                        drawBorder: false
                    },
                    ticks: {
                        callback: function (value) {
                            return '₹' + value.toLocaleString();
                        }
                    }
                },
                x: {
                    grid: {
                        display: false
                    }
                }
            }
        }
    });
}

// Setup Event Listeners
function setupEventListeners() {
    if (logoutBtn) {
        logoutBtn.addEventListener('click', handleLogout);
    }

    if (mobileLogoutBtn) {
        mobileLogoutBtn.addEventListener('click', handleLogout);
    }

    // Mobile Sidebar Toggle
    if (sidebarToggle) {
        sidebarToggle.addEventListener('click', () => {
            document.getElementById('sidebar').classList.toggle('show');
            if (sidebarOverlay) sidebarOverlay.classList.toggle('show');
        });
    }

    // Close sidebar when clicking overlay
    if (sidebarOverlay) {
        sidebarOverlay.addEventListener('click', () => {
            document.getElementById('sidebar').classList.remove('show');
            sidebarOverlay.classList.remove('show');
        });
    }

    // Add Team Member Button
    const addTeamBtn = document.getElementById('addTeamMemberBtn');
    if (addTeamBtn) {
        addTeamBtn.addEventListener('click', () => openTeamMemberModal());
    }

    const saveTeamMemberBtn = document.getElementById('saveTeamMemberBtn');
    if (saveTeamMemberBtn) {
        saveTeamMemberBtn.addEventListener('click', saveTeamMember);
    }
}

// Setup Real-time Notifications
function setupNotifications(businessId) {
    if (!businessId) return;
    if (notificationsBusinessId === businessId && notificationUnsubscribers.length) return;
    notificationUnsubscribers.forEach(unsub => {
        try { unsub(); } catch (e) { }
    });
    notificationUnsubscribers = [];
    notificationsBusinessId = businessId;

    // 1. Inventory Listener
    const unsubInventory = db.collection('users').doc(businessId).collection('inventory')
        .onSnapshot(snapshot => {
            const lowStockItems = [];
            const changes = snapshot.docChanges();
            snapshot.forEach(doc => {
                const item = doc.data();
                if (item.reorderLevel !== undefined && item.quantity <= item.reorderLevel) {
                    lowStockItems.push({
                        type: 'inventory',
                        id: doc.id,
                        name: item.name,
                        quantity: item.quantity,
                        unit: item.unit || ''
                    });
                }
            });
            notificationState.inventory = lowStockItems;
            updateNotificationUI();
            syncPublicFeaturedStockFromChanges(businessId, changes).catch((error) => {
                console.error('Featured stock sync failed:', error);
            });
        }, error => {
            console.error("Error listening for notifications:", error);
        });
    notificationUnsubscribers.push(unsubInventory);

    // 2. Vehicle Documents Listener
    const unsubVehicles = db.collection('users').doc(businessId).collection('vehicles')
        .onSnapshot(snapshot => {
            const alerts = [];
            const today = new Date();
            const warningDate = new Date();
            warningDate.setDate(today.getDate() + 30); // 30 days warning

            snapshot.forEach(doc => {
                const v = doc.data();
                const checkExpiry = (dateStr, docType) => {
                    if (!dateStr) return;
                    const d = new Date(dateStr);
                    if (d < today) {
                        alerts.push({ type: 'vehicle', id: doc.id, name: v.name, docType: docType, status: 'Expired', date: dateStr, severity: 'danger' });
                    } else if (d < warningDate) {
                        alerts.push({ type: 'vehicle', id: doc.id, name: v.name, docType: docType, status: 'Expiring Soon', date: dateStr, severity: 'warning' });
                    }
                };

                checkExpiry(v.insuranceExpiry, 'Insurance');
                checkExpiry(v.permitExpiry, 'Permit');
                checkExpiry(v.fitnessExpiry, 'Fitness');
                checkExpiry(v.pucExpiry, 'PUC');
            });
            notificationState.vehicles = alerts;
            updateNotificationUI();
        });
    notificationUnsubscribers.push(unsubVehicles);
}

function mapFeaturedStockDoc(item = {}, fallbackCategory = '') {
    const resolvedCategory = item.category || item.type || fallbackCategory || 'Other';
    return {
        name: item.name || 'Item',
        category: resolvedCategory,
        type: item.type || '',
        description: item.description || '',
        sku: item.sku || '',
        dimensions: item.dimensions || '',
        quantity: Number(item.quantity ?? 0),
        unit: item.unit || 'pcs',
        imageUrl: item.imageUrl || '',
        updatedAt: new Date()
    };
}

async function ensureProductMasterCategoryCache(businessId) {
    if (!businessId) return;
    if (productMasterCategoryCacheBusinessId === businessId && productMasterCategoryCache.size) return;
    productMasterCategoryCacheBusinessId = businessId;
    productMasterCategoryCache = new Map();
    const snap = await db.collection('users').doc(businessId).collection('product_master').get();
    snap.forEach(doc => {
        const p = doc.data() || {};
        const key = (p.name || '').toLowerCase().trim();
        const category = p.category || p.productCategory || '';
        if (key && category) productMasterCategoryCache.set(key, category);
    });
}

async function syncPublicFeaturedStockFromChanges(businessId, changes = []) {
    if (!businessId || !changes.length) return;
    await ensureProductMasterCategoryCache(businessId);
    const publicRef = db.collection('public').doc(businessId);
    let batch = db.batch();
    let ops = 0;

    for (const change of changes) {
        const featuredRef = publicRef.collection('featured_stock').doc(change.doc.id);
        if (change.type === 'removed') {
            batch.delete(featuredRef);
            ops += 1;
        } else {
            const item = change.doc.data() || {};
            const nameKey = (item.name || '').toLowerCase().trim();
            const fallbackCategory = nameKey ? (productMasterCategoryCache.get(nameKey) || '') : '';
            if (item.showOnLanding) {
                batch.set(featuredRef, mapFeaturedStockDoc(item, fallbackCategory), { merge: true });
            } else {
                batch.delete(featuredRef);
            }
            ops += 1;
        }

        if (ops >= 400) {
            // eslint-disable-next-line no-await-in-loop
            await batch.commit();
            batch = db.batch();
            ops = 0;
        }
    }

    if (ops > 0) await batch.commit();
}

function updateNotificationUI() {
    if (!notificationBadge || !notificationMenu) return;

    const items = [...notificationState.inventory, ...notificationState.vehicles];

    // Update Badge
    if (items.length > 0) {
        notificationBadge.textContent = items.length;
        notificationBadge.classList.remove('d-none');
        document.getElementById('notificationBtn')?.classList.add('pulse-animation');
    } else {
        notificationBadge.classList.add('d-none');
        document.getElementById('notificationBtn')?.classList.remove('pulse-animation');
    }

    // Update Menu
    let html = '<h6 class="dropdown-header">Notifications</h6>';

    if (items.length === 0) {
        html += '<div class="dropdown-item text-center text-muted small">No new notifications</div>';
    } else {
        items.forEach(item => {
            if (item.type === 'inventory') {
                html += `
                    <a class="dropdown-item d-flex align-items-center" href="#" onclick="window.navigateToSection('inventory'); return false;">
                        <div class="me-3">
                            <div class="bg-warning bg-opacity-10 p-2 rounded-circle text-warning">
                                <i class="fas fa-boxes"></i>
                            </div>
                        </div>
                        <div>
                            <div class="small text-muted">Low Stock Alert</div>
                            <span class="fw-bold d-block text-truncate" style="max-width: 200px;">${item.name}</span>
                            <small class="text-danger">Only ${item.quantity} ${item.unit} left</small>
                        </div>
                    </a>`;
            } else if (item.type === 'vehicle') {
                html += `
                    <a class="dropdown-item d-flex align-items-center" href="#" onclick="window.navigateToSection('vehicles'); return false;">
                        <div class="me-3">
                            <div class="bg-${item.severity} bg-opacity-10 p-2 rounded-circle text-${item.severity}">
                                <i class="fas fa-truck"></i>
                            </div>
                        </div>
                        <div>
                            <div class="small text-muted">${item.docType} ${item.status}</div>
                            <span class="fw-bold d-block text-truncate" style="max-width: 200px;">${item.name}</span>
                            <small class="text-${item.severity}">Due: ${item.date}</small>
                        </div>
                    </a>`;
            }
        });
    }

    notificationMenu.innerHTML = html;
}

// Handle Logout
async function handleLogout() {
    try {
        await auth.signOut();
        localStorage.removeItem('user');
        sessionStorage.removeItem('ownerGate');
        window.location.href = 'login.html?mode=gate';
    } catch (error) {
        console.error('Logout error:', error);
        showAlert('danger', 'Logout failed. Please try again.');
    }
}

function handleLock(e) {
    if (e) e.preventDefault();
    sessionStorage.removeItem('ownerGate');
    window.location.href = 'login.html?mode=gate';
}

// --- Team Management Functions ---

async function loadTeamMembers() {
    const user = JSON.parse(localStorage.getItem('user'));
    const table = document.getElementById('teamTable');
    if (!user || !table) return;

    // Only owner can see this
    if (user.role !== 'owner') {
        document.getElementById('teamManagementCard').classList.add('d-none');
        return;
    }

    const tbody = table.querySelector('tbody');
    tbody.innerHTML = '<tr><td colspan="4" class="text-center">Loading...</td></tr>';

    try {
        // Fetch from the owner's 'team' subcollection to avoid permission issues
        // with querying the root 'users' collection
        const snapshot = await db.collection('users').doc(user.uid).collection('team').get();

        tbody.innerHTML = '';
        teamMembersCache = [];
        snapshot.forEach(doc => {
            const member = doc.data();
            const isMe = doc.id === user.uid;
            tbody.innerHTML += `
                <tr>
                    <td>${member.firstName || ''} ${member.lastName || ''}</td>
                    <td>${member.email}</td>
                    <td><span class="badge bg-${member.role === 'owner' ? 'primary' : 'info'}">${member.role}</span></td>
                    <td>
                        ${!isMe ? `
                            <button class="btn btn-sm btn-outline-primary me-1" onclick="window.editTeamMember('${doc.id}')"><i class="fas fa-edit"></i></button>
                            <button class="btn btn-sm btn-outline-danger" onclick="window.deleteTeamMember('${doc.id}')"><i class="fas fa-trash"></i></button>
                        ` : '<span class="text-muted">Owner</span>'}
                    </td>
                </tr>
            `;
            teamMembersCache.push({ id: doc.id, ...member });
        });
    } catch (e) {
        console.error(e);
        tbody.innerHTML = '<tr><td colspan="4" class="text-center text-danger">Error loading team</td></tr>';
    }
}

function openTeamMemberModal(memberId = null) {
    const form = document.getElementById('teamMemberForm');
    form.reset();
    document.getElementById('tmId').value = '';
    document.getElementById('tmPasswordContainer').style.display = 'block';
    document.getElementById('tmEmail').disabled = false;

    // Default permissions
    document.getElementById('permDelete').checked = false;
    document.getElementById('permRevenue').checked = false;

    if (memberId) {
        const member = teamMembersCache.find(m => m.id === memberId);
        if (member) {
            document.getElementById('tmId').value = member.id;
            document.getElementById('tmEmail').value = member.email;
            document.getElementById('tmEmail').disabled = true;
            document.getElementById('tmFirstName').value = member.firstName || '';
            document.getElementById('tmLastName').value = member.lastName || '';
            document.getElementById('tmRole').value = member.role;
            document.getElementById('tmPasswordContainer').style.display = 'none';

            // Set permissions
            if (member.permissions) {
                document.getElementById('permDelete').checked = member.permissions.canDelete;
                document.getElementById('permRevenue').checked = member.permissions.viewRevenue;
            }
        }
    }

    new bootstrap.Modal(document.getElementById('teamMemberModal')).show();
}

async function saveTeamMember() {
    const user = JSON.parse(localStorage.getItem('user'));
    if (user.role !== 'owner') return alert("Only owners can add team members.");

    const id = document.getElementById('tmId').value;
    const email = document.getElementById('tmEmail').value;
    const firstName = document.getElementById('tmFirstName').value;
    const lastName = document.getElementById('tmLastName').value;
    const role = document.getElementById('tmRole').value;
    const password = document.getElementById('tmPassword').value;

    const permissions = {
        canDelete: document.getElementById('permDelete').checked,
        viewRevenue: document.getElementById('permRevenue').checked
    };

    if (!email || !firstName || !lastName) return alert("Please fill all required fields");

    try {
        if (id) {
            // Update existing
            const updateData = { firstName, lastName, role, permissions };

            // 1. Update Owner's Team List
            await db.collection('users').doc(user.uid).collection('team').doc(id).update(updateData);

            // 2. Update Member's User Profile
            await db.collection('users').doc(id).update(updateData);

            alert("Team member updated successfully.");
        } else {
            // Add new
            if (!password || password.length < 6) return alert("Password must be at least 6 characters");

            // Check limit
            const currentMembers = await db.collection('users').doc(user.uid).collection('team').get();
            if (currentMembers.size >= 3) {
                return alert("Limit reached. You can only have 3 active logins (Owner + 2 Team Members).");
            }

            // Create user using a secondary app
            const secondaryApp = firebase.initializeApp(firebase.app().options, "Secondary");
            const userCred = await secondaryApp.auth().createUserWithEmailAndPassword(email, password);
            const newUser = userCred.user;

            await newUser.updateProfile({ displayName: `${firstName} ${lastName}` });

            const memberData = {
                uid: newUser.uid,
                email, role, permissions,
                businessId: user.uid,
                firstName, lastName,
                createdAt: new Date()
            };

            await secondaryApp.firestore().collection('users').doc(newUser.uid).set(memberData);
            await db.collection('users').doc(user.uid).collection('team').doc(newUser.uid).set(memberData);

            await secondaryApp.auth().signOut();
            secondaryApp.delete();
            alert(`User created! Email: ${email}`);
        }

        bootstrap.Modal.getInstance(document.getElementById('teamMemberModal')).hide();
        loadTeamMembers();

    } catch (e) {
        console.error(e);
        alert("Error: " + e.message);
    }
};

window.deleteTeamMember = async (id) => {
    window.showConfirm('Remove User', 'Remove this user? They will no longer be able to login.', async () => {
        try {
            const user = JSON.parse(localStorage.getItem('user'));
            // Delete from Owner's team list
            await db.collection('users').doc(user.uid).collection('team').doc(id).delete();
            // Also remove the team member profile doc
            await db.collection('users').doc(id).delete();
            // Note: This doesn't delete from Auth, which requires Admin SDK.
            loadTeamMembers();
        } catch (e) { console.error(e); }
    });
};

window.editTeamMember = (id) => {
    openTeamMemberModal(id);
};

// --- Profit Engine Logic ---
async function openProfitReport() {
    const user = JSON.parse(localStorage.getItem('user'));
    const businessId = user.businessId || user.uid;

    // Show loading state in modal or button
    const btn = document.getElementById('profitReportBtn');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Loading...';

    try {
        const snapshot = await db.collection('users').doc(businessId)
            .collection('transactions')
            .where('type', '==', 'Invoice')
            .get();

        let totalRevenue = 0;
        let totalProfit = 0;
        let totalOutstanding = 0;

        const productStats = {}; // { productName: { qty, revenue, cost, profit } }
        const timeStats = {}; // { monthYear: { revenue, cost, profit } }

        snapshot.forEach(doc => {
            const t = doc.data();
            totalRevenue += (t.amount || 0);
            totalProfit += (t.profit || 0);
            totalOutstanding += (t.balance || 0);

            const date = t.date.toDate();
            const monthKey = date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

            if (!timeStats[monthKey]) timeStats[monthKey] = { revenue: 0, cost: 0, profit: 0 };
            timeStats[monthKey].revenue += t.amount;
            timeStats[monthKey].profit += (t.profit || 0);
            timeStats[monthKey].cost += (t.amount - (t.profit || 0));

            if (t.items && Array.isArray(t.items)) {
                t.items.forEach(item => {
                    if (!productStats[item.name]) productStats[item.name] = { qty: 0, revenue: 0, cost: 0, profit: 0 };
                    const itemRevenue = item.price * item.quantity;
                    const itemCost = (item.costPrice || 0) * item.quantity;
                    productStats[item.name].qty += item.quantity;
                    productStats[item.name].revenue += itemRevenue;
                    productStats[item.name].cost += itemCost;
                    productStats[item.name].profit += (itemRevenue - itemCost);
                });
            }
        });

        // Update Summary Cards
        document.getElementById('prTotalProfit').textContent = `₹${totalProfit.toLocaleString()}`;
        const margin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;
        document.getElementById('prAvgMargin').textContent = `${margin.toFixed(1)}%`;
        document.getElementById('prOutstanding').textContent = `₹${totalOutstanding.toLocaleString()}`;

        // Populate Product Table
        const prodTable = document.querySelector('#prProductTable tbody');
        prodTable.innerHTML = '';
        Object.keys(productStats).forEach(name => {
            const s = productStats[name];
            const avgPrice = s.qty > 0 ? s.revenue / s.qty : 0;
            const avgCost = s.qty > 0 ? s.cost / s.qty : 0;
            prodTable.innerHTML += `<tr><td>${name}</td><td>${s.qty}</td><td>₹${avgCost.toFixed(0)}</td><td>₹${avgPrice.toFixed(0)}</td><td class="text-success fw-bold">₹${s.profit.toLocaleString()}</td></tr>`;
        });

        // Populate Time Table
        const timeTable = document.querySelector('#prTimeTable tbody');
        timeTable.innerHTML = '';
        Object.keys(timeStats).forEach(month => {
            const s = timeStats[month];
            timeTable.innerHTML += `<tr><td>${month}</td><td>₹${s.revenue.toLocaleString()}</td><td>₹${s.cost.toLocaleString()}</td><td class="text-success fw-bold">₹${s.profit.toLocaleString()}</td></tr>`;
        });

        new bootstrap.Modal(document.getElementById('profitReportModal')).show();

    } catch (e) {
        console.error(e);
        alert("Failed to generate report");
    } finally {
        btn.innerHTML = originalText;
    }
}

// Helper Functions
function formatDate(timestamp) {
    if (!timestamp) return 'N/A';

    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
    });
}

function getStatusClass(status) {
    const statusMap = {
        'Completed': 'text-success',
        'Processing': 'text-primary',
        'Dispatched': 'text-info',
        'Pending': 'text-warning',
        'Cancelled': 'text-danger'
    };
    return statusMap[status] || 'text-secondary';
}

function getStatusBadge(status) {
    const badgeMap = {
        'Paid': 'badge bg-success',
        'Pending': 'badge bg-warning',
        'Overdue': 'badge bg-danger',
        'Draft': 'badge bg-secondary'
    };

    const badgeClass = badgeMap[status] || 'badge bg-secondary';
    return `<span class="${badgeClass}">${status}</span>`;
}

function toCsvValue(value) {
    if (value === null || value === undefined) return '';
    const str = String(value).replace(/\r?\n/g, ' ').trim();
    if (/[",\n]/.test(str)) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
}

function downloadCSV(filename, headers, rows) {
    const content = [
        headers.map(toCsvValue).join(','),
        ...rows.map(row => row.map(toCsvValue).join(','))
    ].join('\n');

    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

function downloadPDF(filename, title, headers, rows, options = {}) {
    const jspdf = window.jspdf;
    if (!jspdf || !jspdf.jsPDF) {
        alert('PDF export is unavailable.');
        return;
    }

    const doc = new jspdf.jsPDF({
        orientation: options.orientation || 'landscape',
        unit: 'pt',
        format: 'a4'
    });

    const startY = title ? 50 : 30;
    if (title) {
        doc.setFontSize(14);
        doc.text(title, 40, 35);
    }

    doc.autoTable({
        head: [headers],
        body: rows,
        startY,
        styles: { fontSize: 8 },
        headStyles: { fillColor: [13, 110, 253] },
        theme: 'grid'
    });

    doc.save(filename);
}

// Navigate to section programmatically
window.navigateToSection = function (sectionId) {
    if (window.location.hash === `#${sectionId}`) {
        handleHashChange();
    } else {
        window.location.hash = `#${sectionId}`;
    }
};

function showSectionLoading() {
    const loader = document.getElementById('premiumLoader');
    if (loader) {
        loader.classList.remove('d-none');
        loader.classList.add('d-flex');
    }
}

function hideSectionLoading() {
    const loader = document.getElementById('premiumLoader');
    if (loader) {
        loader.classList.remove('d-flex');
        loader.classList.add('d-none');
    }
}

// Export for use in other modules
export { checkAuth, loadUserData, formatDate, getStatusClass, downloadCSV, downloadPDF };
// Post Office API helpers (pincode -> village/district/state)
let postOfficeBaseUrlCache = null;
async function getPostOfficeBaseUrl() {
    if (postOfficeBaseUrlCache) return postOfficeBaseUrlCache;
    let base = '';
    try {
        if (remoteConfig) {
            await remoteConfig.fetchAndActivate();
            base = remoteConfig.getValue('post_office_api_base_url').asString();
        }
    } catch (e) { /* ignore */ }
    if (!base) {
        base = 'https://api.postalpincode.in/pincode/';
    }
    if (!base.endsWith('/')) base += '/';
    postOfficeBaseUrlCache = base;
    return base;
}

async function fetchPostOfficeByPincode(pincode) {
    const pin = String(pincode || '').trim();
    if (!pin || pin.length < 5) return null;
    const base = await getPostOfficeBaseUrl();
    const res = await fetch(`${base}${encodeURIComponent(pin)}`);
    if (!res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data) || !data[0] || data[0].Status !== 'Success') return null;
    const pos = Array.isArray(data[0].PostOffice) ? data[0].PostOffice : [];
    const po = pos[0] || null;
    if (!po) return null;
    return {
        village: po.Name || '',
        mandal: po.Block || '',
        district: po.District || '',
        state: po.State || '',
        postOffices: pos
    };
}

export { getPostOfficeBaseUrl, fetchPostOfficeByPincode };





