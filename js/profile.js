import { auth, db } from './firebase-config.js';
import { checkAuth } from './dashboard.js';
import { showAlert } from './auth.js';

const profileForm = document.getElementById('profileForm');

document.addEventListener('DOMContentLoaded', async () => {
    await checkAuth();
    loadProfile();
    
    if (profileForm) {
        profileForm.addEventListener('submit', updateProfile);
    }
    
    window.addEventListener('sectionChanged', (e) => {
        if (e.detail === 'profile') loadProfile();
    });
});

async function loadProfile() {
    const user = auth.currentUser;
    if (!user) return;

    // Update Header
    document.getElementById('profileDisplayName').textContent = user.displayName || 'User';
    document.getElementById('profileEmail').textContent = user.email;

    // Load Firestore Data
    try {
        const doc = await db.collection('users').doc(user.uid).get();
        if (doc.exists) {
            const data = doc.data();
            document.getElementById('profileFirstName').value = data.firstName || '';
            document.getElementById('profileLastName').value = data.lastName || '';
            document.getElementById('profilePhone').value = data.phone || '';
        }
    } catch (error) {
        console.error("Error loading profile:", error);
    }
}

async function updateProfile(e) {
    e.preventDefault();
    const user = auth.currentUser;
    if (!user) return;

    const firstName = document.getElementById('profileFirstName').value;
    const lastName = document.getElementById('profileLastName').value;
    const phone = document.getElementById('profilePhone').value;
    const displayName = `${firstName} ${lastName}`.trim();

    const btn = document.getElementById('saveProfileBtn');
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Saving...';

    try {
        // Update Auth Profile
        await user.updateProfile({ displayName });

        // Update Firestore
        await db.collection('users').doc(user.uid).set({
            firstName,
            lastName,
            phone,
            updatedAt: new Date()
        }, { merge: true });

        // Update Local Storage
        const localUser = JSON.parse(localStorage.getItem('user'));
        localUser.displayName = displayName;
        localStorage.setItem('user', JSON.stringify(localUser));

        showAlert('success', 'Profile updated successfully');
        loadProfile(); // Refresh UI
    } catch (error) {
        console.error("Error updating profile:", error);
        showAlert('danger', 'Failed to update profile');
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}

