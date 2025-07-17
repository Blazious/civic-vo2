// === CONFIGURATION ===
const BASE_URL = 'https://c4f857e59df5.ngrok-free.app';

// === DOM Elements ===
const loginSection = document.getElementById('login-section');
const reportSection = document.getElementById('report-section');
const loginBtn = document.getElementById('login-btn');
const logoutBtn = document.getElementById('logout-btn');
const reportForm = document.getElementById('report-form');
const gpsStatus = document.getElementById('gps-status');
const latitudeValue = document.getElementById('latitude-value');
const longitudeValue = document.getElementById('longitude-value');
const imageUpload = document.getElementById('image-upload');
const imagePreview = document.getElementById('image-preview');
const loginResponse = document.getElementById('login-response');
const reportResponse = document.getElementById('report-response');

const pedestrianBtn = document.getElementById('pedestrian-btn');
const driveBtn = document.getElementById('drive-btn');
const driveUI = document.getElementById('drive-mode-ui');
const driveVideo = document.getElementById('drive-video');
const stopDriveBtn = document.getElementById('stop-drive-btn');

let mediaStream = null;

// === Application State ===
let accessToken = null;
let refreshToken = null;
let currentLocation = null;
let roadName = null;

// === Load Tokens on Page Load ===
window.addEventListener('DOMContentLoaded', () => {
    const storedToken = localStorage.getItem('civiceye_access');
    if (storedToken) {
        accessToken = storedToken;
        refreshToken = localStorage.getItem('civiceye_refresh');
        showReportingInterface();
    }
});

// === Mode Toggle Handlers ===
pedestrianBtn.addEventListener('click', () => {
    pedestrianBtn.classList.add('active');
    driveBtn.classList.remove('active');
    driveUI.classList.add('hidden');
    stopDriveStream();
});

driveBtn.addEventListener('click', async () => {
    driveBtn.classList.add('active');
    pedestrianBtn.classList.remove('active');
    driveUI.classList.remove('hidden');
    await startDriveStream();
});

async function startDriveStream() {
    try {
        mediaStream = await navigator.mediaDevices.getUserMedia({ video: true });
        driveVideo.srcObject = mediaStream;
    } catch (error) {
        document.getElementById('drive-status').textContent = 'Camera access denied or unavailable.';
    }
}

function stopDriveStream() {
    if (mediaStream) {
        mediaStream.getTracks().forEach(track => track.stop());
        mediaStream = null;
        driveVideo.srcObject = null;
    }
}

stopDriveBtn.addEventListener('click', () => {
    stopDriveStream();
    driveUI.classList.add('hidden');
    pedestrianBtn.classList.add('active');
    driveBtn.classList.remove('active');
});

// === Handle Login ===
loginBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;

    if (!username || !password) {
        showMessage(loginResponse, 'Please enter both email and password', 'error');
        return;
    }

    try {
        loginBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Logging in...';
        loginBtn.disabled = true;

        const response = await fetch(`${BASE_URL}/api/users/login/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: username, password: password })
        });

        const data = await response.json();

        if (response.ok) {
            accessToken = data.access;
            refreshToken = data.refresh;
            localStorage.setItem('civiceye_access', accessToken);
            localStorage.setItem('civiceye_refresh', refreshToken);
            showReportingInterface();
        } else {
            showMessage(loginResponse, data.detail || 'Login failed. Please check your credentials.', 'error');
        }
    } catch (error) {
        showMessage(loginResponse, 'Network error. Please try again.', 'error');
    } finally {
        loginBtn.innerHTML = 'Login';
        loginBtn.disabled = false;
    }
});

// === Handle Logout ===
logoutBtn.addEventListener('click', () => {
    localStorage.removeItem('civiceye_access');
    localStorage.removeItem('civiceye_refresh');
    accessToken = null;
    refreshToken = null;
    currentLocation = null;
    roadName = null;
    stopDriveStream();

    loginSection.classList.remove('hidden');
    reportSection.classList.add('hidden');
    reportForm.reset();
    imagePreview.style.display = 'none';
    latitudeValue.textContent = 'Not available';
    longitudeValue.textContent = 'Not available';
    gpsStatus.innerHTML = `
        <i class="fas fa-satellite"></i>
        <div>
            <h3>Location Status</h3>
            <p>Waiting for GPS coordinates...</p>
        </div>
    `;
});

// === Image Preview on Upload ===
imageUpload.addEventListener('change', function () {
    if (this.files && this.files[0]) {
        const reader = new FileReader();
        reader.onload = function (e) {
            imagePreview.src = e.target.result;
            imagePreview.style.display = 'block';
        };
        reader.readAsDataURL(this.files[0]);
    }
});

// === Report Submission ===
reportForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const issueType = document.getElementById('issue-type').value;
    const description = document.getElementById('description').value;
    const imageFile = imageUpload.files[0];

    if (!issueType) return showMessage(reportResponse, 'Please select an issue type', 'error');
    if (!description) return showMessage(reportResponse, 'Please add a description', 'error');
    if (!imageFile) return showMessage(reportResponse, 'Please upload an image', 'error');
    if (!currentLocation) return showMessage(reportResponse, 'Location not available. Please enable GPS.', 'error');

    try {
        const submitBtn = reportForm.querySelector('button[type="submit"]');
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting...';
        submitBtn.disabled = true;

        const formData = new FormData();
        formData.append('latitude', currentLocation.latitude);
        formData.append('longitude', currentLocation.longitude);
        formData.append('issue_type', issueType);
        formData.append('description', description);
        formData.append('image', imageFile);

        if (roadName) formData.append('road_name', roadName);

        const response = await fetch(`${BASE_URL}/api/reports/`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`
            },
            body: formData
        });

        const data = await response.json();

        if (response.ok) {
            showMessage(reportResponse, 'Report submitted successfully!', 'success');
            reportForm.reset();
            imagePreview.style.display = 'none';
        } else {
            const errorMsg = data.detail || Object.values(data).join(' ') || 'Failed to submit report';
            showMessage(reportResponse, errorMsg, 'error');
        }
    } catch (error) {
        showMessage(reportResponse, 'Network error. Please try again.', 'error');
    } finally {
        const submitBtn = reportForm.querySelector('button[type="submit"]');
        submitBtn.innerHTML = 'Submit Report';
        submitBtn.disabled = false;
    }
});

// === Show Reporting UI ===
function showReportingInterface() {
    loginSection.classList.add('hidden');
    reportSection.classList.remove('hidden');
    getLocation();
}

// === Geolocation ===
function getLocation() {
    if (!navigator.geolocation) {
        gpsStatus.innerHTML = `
            <i class="fas fa-exclamation-triangle"></i>
            <div><h3>Location Error</h3><p>Geolocation not supported by your browser</p></div>
        `;
        gpsStatus.classList.add('gps-error');
        return;
    }

    gpsStatus.innerHTML = `
        <i class="fas fa-satellite fa-spin"></i>
        <div><h3>Getting Location</h3><p>Please allow location access...</p></div>
    `;

    navigator.geolocation.getCurrentPosition(
        async position => {
            currentLocation = {
                latitude: position.coords.latitude,
                longitude: position.coords.longitude
            };

            latitudeValue.textContent = currentLocation.latitude.toFixed(6);
            longitudeValue.textContent = currentLocation.longitude.toFixed(6);

            gpsStatus.innerHTML = `
                <i class="fas fa-map-marker-alt"></i>
                <div><h3>Location Acquired</h3><p>Ready to submit report</p></div>
            `;
            gpsStatus.classList.add('gps-success');

            roadName = await fetchRoadName(currentLocation.latitude, currentLocation.longitude);
        },
        error => {
            let errorMessage = 'Unable to retrieve your location.';
            switch (error.code) {
                case error.PERMISSION_DENIED:
                    errorMessage = 'Location request denied.';
                    break;
                case error.POSITION_UNAVAILABLE:
                    errorMessage = 'Location info unavailable.';
                    break;
                case error.TIMEOUT:
                    errorMessage = 'Location request timed out.';
                    break;
            }

            gpsStatus.innerHTML = `
                <i class="fas fa-exclamation-triangle"></i>
                <div><h3>Location Error</h3><p>${errorMessage}</p></div>
            `;
            gpsStatus.classList.add('gps-error');
        },
        {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 0
        }
    );
}

// === Reverse Geocoding with OpenStreetMap ===
async function fetchRoadName(lat, lon) {
    try {
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1`);
        const data = await res.json();
        return data.display_name || '';
    } catch (err) {
        console.warn('Failed to fetch road name:', err);
        return '';
    }
}

// === Show Temporary Messages ===
function showMessage(element, message, type) {
    element.textContent = message;
    element.className = `response-message ${type}`;
    element.classList.remove('hidden');
    setTimeout(() => element.classList.add('hidden'), 5000);
}
