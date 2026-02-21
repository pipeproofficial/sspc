import { db } from './firebase-config.js';

const form = document.getElementById('attendanceForm');
const messageDiv = document.getElementById('message');
const submitBtn = document.getElementById('submitBtn');

// Get Owner UID from URL
const urlParams = new URLSearchParams(window.location.search);
const ownerUid = urlParams.get('uid');

if (!ownerUid) {
    showMessage('danger', 'Invalid QR Code. Owner ID missing.');
    submitBtn.disabled = true;
}

form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const mobile = normalizeMobile(document.getElementById('mobile').value);
    
    if (!mobile) return;
    
    setLoading(true);

    try {
        // 1. Check Time Restrictions
        const settingsDoc = await db.collection('users').doc(ownerUid).collection('settings').doc('attendance').get();
        if (settingsDoc.exists) {
            const s = settingsDoc.data();
            const now = new Date();
            const currentTime = now.toTimeString().slice(0, 5); // HH:MM
            
            if (s.startTime && currentTime < s.startTime) throw `Check-in not allowed before ${s.startTime}`;
            if (s.endTime && currentTime > s.endTime) throw `Check-in closed at ${s.endTime}`;

        }

        // 2. Find Staff by Mobile
        const staffSnapshot = await db.collection('users').doc(ownerUid)
            .collection('staff')
            .where('mobile', '==', mobile)
            .where('active', '==', true)
            .get();

        if (staffSnapshot.empty) {
            throw "Staff not found or inactive. Check mobile number.";
        }

        const staffDoc = staffSnapshot.docs[0];
        const staff = staffDoc.data();

        // Calculate Wage Earned for Today
        let earnedWage = staff.amount || staff.dailyWage || 0;
        if (staff.wageType === 'Monthly') {
            earnedWage = Math.round(earnedWage / 30); // Standard 30-day basis for daily calculation
        }

        // 3. Mark Attendance
        // We use a deterministic ID (staffId_date) to prevent duplicates without needing read permissions.
        const todayStr = new Date().toISOString().split('T')[0];
        const docId = `${staffDoc.id}_${todayStr}`;

        try {
            await db.collection('users').doc(ownerUid).collection('attendance').doc(docId).set({
                staffId: staffDoc.id,
                staffName: staff.name,
                role: staff.role,
                wageEarned: todayStr,
                status: 'Present'
            });
        } catch (err) {
            // If permission denied, it likely means the document already exists (update denied for public users)
            if (err.code === 'permission-denied') {
                throw "Attendance already marked for today.";
            }
            throw err;
        }

        showMessage('success', `Welcome, ${staff.name}! Attendance marked.`);
        form.reset();

    } catch (error) {
        console.error(error);
        showMessage('danger', error.toString());
    } finally {
        setLoading(false);
    }
});

function showMessage(type, text) {
    messageDiv.className = `alert alert-${type}`;
    messageDiv.textContent = text;
    messageDiv.classList.remove('d-none');
}

function setLoading(isLoading) {
    if (isLoading) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Processing...';
    } else {
        submitBtn.disabled = false;
        submitBtn.innerHTML = 'Mark Present';
    }
}

function normalizeMobile(value) {
    return (value || '').replace(/\D/g, '');
}
