import { auth, db, googleProvider } from './firebase-config.js';

// DOM Elements
const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');
const googleSignInBtn = document.getElementById('googleSignIn');
const sendResetLinkBtn = document.getElementById('sendResetLink');

function ownerGateTrustKey(uid) {
    return `sspc_owner_gate_trust_${uid}`;
}

function hasOwnerGateTrust(uid) {
    if (!uid) return false;
    return localStorage.getItem(ownerGateTrustKey(uid)) === '1';
}

function setOwnerGateTrust(uid, trusted) {
    if (!uid) return;
    if (trusted) {
        localStorage.setItem(ownerGateTrustKey(uid), '1');
    } else {
        localStorage.removeItem(ownerGateTrustKey(uid));
    }
}

// Check if elements exist before adding event listeners
if (loginForm) {
    loginForm.addEventListener('submit', handleLogin);
}

if (registerForm) {
    registerForm.addEventListener('submit', handleRegister);
}

if (googleSignInBtn) {
    googleSignInBtn.addEventListener('click', handleGoogleSignIn);
}

// Password Toggle Event Delegation
document.addEventListener('click', function(e) {
    const btn = e.target.closest('.password-toggle-btn');
    if (btn) {
        e.preventDefault();
        e.stopPropagation(); // Prevent event bubbling issues
        const targetId = btn.getAttribute('data-target');
        const passwordInput = document.getElementById(targetId);
        const icon = btn.querySelector('i');
        
        if (passwordInput) {
            if (passwordInput.type === 'password') {
                passwordInput.type = 'text';
                icon.classList.remove('fa-eye');
                icon.classList.add('fa-eye-slash');
            } else {
                passwordInput.type = 'password';
                icon.classList.remove('fa-eye-slash');
                icon.classList.add('fa-eye');
            }
        }
    }
});

if (sendResetLinkBtn) {
    sendResetLinkBtn.addEventListener('click', handlePasswordReset);
}

// Show Alert Message
function showAlert(type, message, elementId = 'alertMessage') {
    const alertDiv = document.getElementById(elementId);
    if (!alertDiv) return; // Safety check
    alertDiv.className = `alert alert-${type}`;
    alertDiv.innerHTML = message;
    alertDiv.classList.remove('d-none');
    
    setTimeout(() => {
        alertDiv.classList.add('d-none');
    }, 5000);
}

async function isOwnerGateEnabled(businessId) {
    if (!db || !businessId) return false;
    try {
        const doc = await db.collection('users').doc(businessId).collection('settings').doc('owner_auth').get();
        return !!(doc.exists && doc.data() && doc.data().passwordHash);
    } catch (e) {
        return false;
    }
}

// Show Loading State
function showLoading(buttonId) {
    const button = document.getElementById(buttonId);
    const spinner = button.querySelector('.spinner-border');
    const icon = button.querySelector('.fa-sign-in-alt');
    
    if (spinner) spinner.classList.remove('d-none');
    if (icon) icon.classList.add('d-none');
    button.disabled = true;
}

// Hide Loading State
function hideLoading(buttonId) {
    const button = document.getElementById(buttonId);
    const spinner = button.querySelector('.spinner-border');
    const icon = button.querySelector('.fa-sign-in-alt');
    
    if (spinner) spinner.classList.add('d-none');
    if (icon) icon.classList.remove('d-none');
    button.disabled = false;
}

// Handle User Login
async function handleLogin(e) {
    e.preventDefault();
    
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    const rememberMe = document.getElementById('rememberMe').checked;
    
    showLoading('loginBtn');
    
    try {
        sessionStorage.removeItem('sspc_google_password_setup_uid');

        // Set persistence based on remember me
        const persistence = rememberMe ? 
            firebase.auth.Auth.Persistence.LOCAL : 
            firebase.auth.Auth.Persistence.SESSION;
        
        await auth.setPersistence(persistence);
        
        // Sign in with email and password
        const userCredential = await auth.signInWithEmailAndPassword(email, password);
        const user = userCredential.user;
        setOwnerGateTrust(user.uid, Boolean(rememberMe));
        if (rememberMe) sessionStorage.setItem('ownerGate', 'ok');
        
        // Fetch user details (role, businessId)
        const userDoc = await db.collection('users').doc(user.uid).get();
        const userData = userDoc.exists ? userDoc.data() : {};

        // Store user data in localStorage
        localStorage.setItem('user', JSON.stringify({
            uid: user.uid,
            email: user.email,
            displayName: user.displayName,
            businessId: userData.businessId || user.uid,
            role: userData.role || 'owner',
            permissions: userData.permissions || { canDelete: true, viewRevenue: true }
        }));
        
        const ownerGateEnabled = await isOwnerGateEnabled(userData.businessId || user.uid);
        const onLogin = window.location.pathname.includes('login.html');
        const urlMode = new URLSearchParams(window.location.search).get('mode');
        const isTrusted = sessionStorage.getItem('ownerGate') === 'ok' || hasOwnerGateTrust(user.uid);
        if (ownerGateEnabled && onLogin && !isTrusted) {
            sessionStorage.removeItem('ownerGate');
            window.location.href = 'login.html?mode=gate';
        } else if (onLogin && urlMode === 'auth') {
            window.location.href = 'dashboard.html';
        } else {
            window.location.href = 'dashboard.html';
        }
        
    } catch (error) {
        hideLoading('loginBtn');
        let errorMessage = 'Login failed. Please try again.';
        
        switch (error.code) {
            case 'auth/user-not-found':
                errorMessage = 'No account found with this email.';
                break;
            case 'auth/wrong-password':
                errorMessage = 'Incorrect password. Please try again.';
                break;
            case 'auth/invalid-email':
                errorMessage = 'Invalid email address.';
                break;
            case 'auth/user-disabled':
                errorMessage = 'This account has been disabled.';
                break;
        }
        
        showAlert('danger', `<i class="fas fa-exclamation-circle me-2"></i>${errorMessage}`, 'authAlertMessage');
    }
}

// Handle User Registration
async function handleRegister(e) {
    e.preventDefault();
    
    const firstName = document.getElementById('firstName').value;
    const lastName = document.getElementById('lastName').value;
    const email = document.getElementById('businessEmail').value;
    const phone = document.getElementById('phone').value;
    const businessName = document.getElementById('businessName').value;
    const password = document.getElementById('password').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    
    // Validate passwords match
    if (password !== confirmPassword) {
        showAlert('danger', '<i class="fas fa-exclamation-circle me-2"></i>Passwords do not match.');
        return;
    }

    // Validate password length
    if (password.length < 8) {
        showAlert('danger', '<i class="fas fa-exclamation-circle me-2"></i>Password must be at least 8 characters long.');
        return;
    }

    // Validate password contains a number
    if (!/\d/.test(password)) {
        showAlert('danger', '<i class="fas fa-exclamation-circle me-2"></i>Password must contain at least one number.');
        return;
    }
    
    showLoading('registerBtn');
    
    try {
        // Create user with email and password
        const userCredential = await auth.createUserWithEmailAndPassword(email, password);
        const user = userCredential.user;
        
        // Update user profile
        await user.updateProfile({
            displayName: `${firstName} ${lastName}`
        });
        
        // Create user document in Firestore
        await db.collection('users').doc(user.uid).set({
            uid: user.uid,
            firstName,
            lastName,
            email,
            phone,
            businessName,
            role: 'owner',
            businessId: user.uid,
            permissions: { canDelete: true, viewRevenue: true },
            businessType: 'concrete-pipe-manufacturing',
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            subscription: 'free_trial',
            trialEnds: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days from now
        });
        
        // Create initial collections for the user
        await db.collection('users').doc(user.uid).collection('settings').doc('business').set({
            companyName: businessName,
            address: '',
            phone,
            email,
            taxId: '',
            currency: 'INR'
        });
        
        await auth.signOut();
        localStorage.removeItem('user');
        window.location.href = 'login.html?mode=gate';
        return;
        
    } catch (error) {
        hideLoading('registerBtn');
        let errorMessage = 'Registration failed. Please try again.';
        
        switch (error.code) {
            case 'auth/email-already-in-use':
                errorMessage = 'An account already exists with this email.';
                break;
            case 'auth/invalid-email':
                errorMessage = 'Invalid email address.';
                break;
            case 'auth/weak-password':
                errorMessage = 'Password should be at least 6 characters.';
                break;
            case 'auth/operation-not-allowed':
                errorMessage = 'Email/password accounts are not enabled.';
                break;
        }
        
        showAlert('danger', `<i class="fas fa-exclamation-circle me-2"></i>${errorMessage}`);
    }
}

// Handle Google Sign In
async function handleGoogleSignIn() {
    try {
        const result = await auth.signInWithPopup(googleProvider);
        const user = result.user;
        setOwnerGateTrust(user.uid, false);
        sessionStorage.setItem('sspc_google_password_setup_uid', user.uid);
        
        // Check if user document exists
        const userDoc = await db.collection('users').doc(user.uid).get();
        
        if (!userDoc.exists) {
            // Create new user document
            await db.collection('users').doc(user.uid).set({
                uid: user.uid,
                firstName: user.displayName.split(' ')[0],
                lastName: user.displayName.split(' ').slice(1).join(' '),
                email: user.email,
                phone: user.phoneNumber || '',
                businessName: `${user.displayName}'s Business`,
                role: 'owner',
                businessId: user.uid,
                permissions: { canDelete: true, viewRevenue: true },
                businessType: 'concrete-pipe-manufacturing',
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                subscription: 'free_trial',
                trialEnds: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
            });
            
            // Create initial settings
            await db.collection('users').doc(user.uid).collection('settings').doc('business').set({
                companyName: `${user.displayName}'s Business`,
                address: '',
                phone: user.phoneNumber || '',
                email: user.email,
                taxId: '',
                currency: 'INR'
            });
        }

        const latestDoc = await db.collection('users').doc(user.uid).get();
        const userData = latestDoc.exists ? latestDoc.data() : { businessId: user.uid, role: 'owner' };

        // Store user data in localStorage
        localStorage.setItem('user', JSON.stringify({
            uid: user.uid,
            email: user.email,
            displayName: user.displayName,
            photoURL: user.photoURL,
            businessId: userData.businessId || user.uid,
            role: userData.role || 'owner',
            permissions: userData.permissions || { canDelete: true, viewRevenue: true }
        }));
        
        const ownerGateEnabled = await isOwnerGateEnabled(userData.businessId || user.uid);
        const onLogin = window.location.pathname.includes('login.html');
        const urlMode = new URLSearchParams(window.location.search).get('mode');
        const isTrusted = sessionStorage.getItem('ownerGate') === 'ok' || hasOwnerGateTrust(user.uid);
        if (ownerGateEnabled && onLogin && !isTrusted) {
            sessionStorage.removeItem('ownerGate');
            window.location.href = 'login.html?mode=gate';
        } else if (onLogin && urlMode === 'auth') {
            window.location.href = 'dashboard.html';
        } else {
            window.location.href = 'dashboard.html';
        }
        
    } catch (error) {
        console.error('Google Sign In Error:', error);
        let errorMessage = 'Google sign in failed. Please try again.';
        showAlert('danger', `<i class="fas fa-exclamation-circle me-2"></i>${errorMessage}`);
    }
}

// Handle Password Reset
async function handlePasswordReset() {
    const email = document.getElementById('resetEmail').value;
    
    if (!email) {
        showAlert('danger', 'Please enter your email address.', 'forgotAlert');
        return;
    }
    
    showLoading('sendResetLink');
    
    try {
        await auth.sendPasswordResetEmail(email);
        showAlert('success', 'Password reset link sent! Check your email.', 'forgotAlert');
        
        // Close modal after 3 seconds
        setTimeout(() => {
            const modal = bootstrap.Modal.getInstance(document.getElementById('forgotPassword'));
            modal.hide();
        }, 3000);
        
    } catch (error) {
        hideLoading('sendResetLink');
        let errorMessage = 'Failed to send reset email. Please try again.';
        
        if (error.code === 'auth/user-not-found') {
            errorMessage = 'No account found with this email.';
        }
        
        showAlert('danger', errorMessage, 'forgotAlert');
    }
}

// Check Authentication State
auth.onAuthStateChanged((user) => {
    const currentPath = window.location.pathname;
    
    if (user) {
        db.collection('users').doc(user.uid).get().then(async (doc) => {
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
        }).catch(() => {});

        if (currentPath.includes('login.html')) {
            const urlMode = new URLSearchParams(window.location.search).get('mode');
            if (urlMode === 'auth') {
                return;
            }
            isOwnerGateEnabled(user.uid).then((enabled) => {
                if (enabled) {
                    if (sessionStorage.getItem('ownerGate') === 'ok' || hasOwnerGateTrust(user.uid)) {
                        sessionStorage.setItem('ownerGate', 'ok');
                        window.location.href = 'dashboard.html';
                    }
                } else {
                    window.location.href = 'dashboard.html';
                }
            });
            return;
        }

        // Keep landing page accessible for signed-in users; only block register page.
        if (currentPath.includes('register.html')) {
            window.location.href = 'dashboard.html';
        }
    } else {
        // User is signed out, clear localStorage
        localStorage.removeItem('user');
        const onLoginFlow = currentPath.includes('login.html');
        if (!onLoginFlow) {
            sessionStorage.removeItem('ownerGate');
        }

        if (currentPath.includes('dashboard.html') || currentPath.includes('inventory.html') || currentPath.includes('customers.html') || currentPath.includes('projects.html') || currentPath.includes('invoices.html') || currentPath.includes('settings.html')) {
            // User is not logged in but on a protected page, redirect to login
            window.location.href = 'login.html?mode=gate';
        }
    }
});

// Export functions for use in other modules
export { showAlert, showAlert as ShowAlert, showLoading, hideLoading };

