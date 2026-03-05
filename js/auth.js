import { auth, db } from './firebase-config.js';

// DOM Elements
const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');
const sendResetLinkBtn = document.getElementById('sendResetLink');

// Check if elements exist before adding event listeners
if (loginForm) {
    loginForm.addEventListener('submit', handleLogin);
}

if (registerForm) {
    registerForm.addEventListener('submit', handleRegister);
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

// Show login reason (for example: subscription expired) when redirected from protected pages.
if (loginForm) {
    try {
        const params = new URLSearchParams(window.location.search || '');
        const reason = String(params.get('reason') || '').trim().toLowerCase();
        if (reason === 'subscription_expired') {
            showAlert(
                'warning',
                '<i class="fas fa-ban me-2"></i>Your subscription is expired or inactive. Please contact admin to renew access.',
                'authAlertMessage'
            );
            const notice = document.getElementById('ownerAuthNotice');
            if (notice) {
                notice.textContent = 'Access is blocked due to inactive subscription.';
            }
            params.delete('reason');
            const nextQuery = params.toString();
            const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ''}${window.location.hash || ''}`;
            window.history.replaceState({}, '', nextUrl);
        }
    } catch (error) {
        console.warn('Failed to read login reason:', error);
    }
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
        // Set persistence based on remember me
        const persistence = rememberMe ? 
            firebase.auth.Auth.Persistence.LOCAL : 
            firebase.auth.Auth.Persistence.SESSION;
        
        await auth.setPersistence(persistence);
        
        // Sign in with email and password
        const userCredential = await auth.signInWithEmailAndPassword(email, password);
        const user = userCredential.user;
        
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
        
        window.location.href = 'dashboard.html';
        
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
        window.location.href = 'login.html';
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
            window.location.href = 'dashboard.html';
            return;
        }

        // Keep landing page accessible for signed-in users; only block register page.
        if (currentPath.includes('register.html')) {
            window.location.href = 'dashboard.html';
        }
    } else {
        // User is signed out, clear localStorage
        localStorage.removeItem('user');

        if (currentPath.includes('dashboard.html') || currentPath.includes('inventory.html') || currentPath.includes('customers.html') || currentPath.includes('projects.html') || currentPath.includes('invoices.html') || currentPath.includes('settings.html')) {
            // User is not logged in but on a protected page, redirect to login
            window.location.href = 'login.html';
        }
    }
});

// Export functions for use in other modules
export { showAlert, showAlert as ShowAlert, showLoading, hideLoading };

