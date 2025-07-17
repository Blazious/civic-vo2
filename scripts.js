// === CONFIGURATION ===
const BASE_URL = 'https://115e8482cc22.ngrok-free.app';
const DETECTION_API_URL = 'https://detect.roboflow.com/pothole-detection-lwf9u/3';
const API_KEY = 'zwRLkWFX34uJ2UPRjUYC';
const MAX_SESSION_MINUTES = 20;
const FRAME_CAPTURE_INTERVAL = 5000; // 5 seconds

// === DOM Elements ===
const loginSection = document.getElementById('login-section');
const reportSection = document.getElementById('report-section');
const loginBtn = document.getElementById('login-btn');
const logoutBtn = document.getElementById('logout-btn');
const pedestrianForm = document.getElementById('pedestrian-form');
const driverForm = document.getElementById('driver-form');
const pedestrianModeBtn = document.getElementById('pedestrian-mode-btn');
const driverModeBtn = document.getElementById('driver-mode-btn');
const gpsStatus = document.getElementById('gps-status');
const latitudeValue = document.getElementById('latitude-value');
const longitudeValue = document.getElementById('longitude-value');
const imageUpload = document.getElementById('image-upload');
const imagePreview = document.getElementById('image-preview');
const loginResponse = document.getElementById('login-response');
const pedestrianResponse = document.getElementById('pedestrian-response');
const driverResponse = document.getElementById('driver-response');
const liveVideo = document.getElementById('live-video');
const videoCanvas = document.getElementById('video-canvas');
const startDriveBtn = document.getElementById('start-drive-btn');
const stopDriveBtn = document.getElementById('stop-drive-btn');
const sessionTimeDisplay = document.getElementById('session-time');
const apiCallsDisplay = document.getElementById('api-calls');
const potholeCountDisplay = document.getElementById('pothole-count');
const potholeAlert = document.getElementById('pothole-alert');

// === Application State ===
let accessToken = null;
let refreshToken = null;
let currentLocation = null;
let roadName = null;
let videoStream = null;
let detectionInterval = null;
let sessionTimer = null;
let sessionSeconds = 0;
let apiCalls = 0;
let potholesDetected = 0;
let isDriverMode = false;

// === Load Tokens on Page Load ===
window.addEventListener('DOMContentLoaded', () => {
    const storedToken = localStorage.getItem('civiceye_access');
    if (storedToken) {
        accessToken = storedToken;
        refreshToken = localStorage.getItem('civiceye_refresh');
        showReportingInterface();
    }
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
    // Stop any active video session
    stopDriveSession();
    
    localStorage.removeItem('civiceye_access');
    localStorage.removeItem('civiceye_refresh');
    accessToken = null;
    refreshToken = null;
    currentLocation = null;
    roadName = null;

    loginSection.classList.remove('hidden');
    reportSection.classList.add('hidden');
    pedestrianForm.reset();
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

// === Pedestrian Mode Form Submission ===
pedestrianForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const issueType = document.getElementById('issue-type').value;
    const description = document.getElementById('description').value;
    const imageFile = imageUpload.files[0];

    if (!issueType) return showMessage(pedestrianResponse, 'Please select an issue type', 'error');
    if (!description) return showMessage(pedestrianResponse, 'Please add a description', 'error');
    if (!imageFile) return showMessage(pedestrianResponse, 'Please upload an image', 'error');
    if (!currentLocation) return showMessage(pedestrianResponse, 'Location not available. Please enable GPS.', 'error');

    try {
        const submitBtn = pedestrianForm.querySelector('button[type="submit"]');
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
            showMessage(pedestrianResponse, 'Report submitted successfully!', 'success');
            pedestrianForm.reset();
            imagePreview.style.display = 'none';
        } else {
            const errorMsg = data.detail || Object.values(data).join(' ') || 'Failed to submit report';
            showMessage(pedestrianResponse, errorMsg, 'error');
        }
    } catch (error) {
        showMessage(pedestrianResponse, 'Network error. Please try again.', 'error');
    } finally {
        const submitBtn = pedestrianForm.querySelector('button[type="submit"]');
        submitBtn.innerHTML = 'Submit Report';
        submitBtn.disabled = false;
    }
});

// === Mode Switching ===
pedestrianModeBtn.addEventListener('click', () => {
    if (isDriverMode) {
        stopDriveSession();
        switchMode(false);
    }
});

driverModeBtn.addEventListener('click', () => {
    if (!isDriverMode) {
        switchMode(true);
        initVideoStream();
    }
});

function switchMode(driverMode) {
    isDriverMode = driverMode;
    if (driverMode) {
        pedestrianModeBtn.classList.remove('active');
        driverModeBtn.classList.add('active');
        pedestrianForm.classList.add('hidden');
        driverForm.classList.remove('hidden');
    } else {
        pedestrianModeBtn.classList.add('active');
        driverModeBtn.classList.remove('active');
        pedestrianForm.classList.remove('hidden');
        driverForm.classList.add('hidden');
    }
}

// === Video Stream Handling ===
async function initVideoStream() {
    try {
        videoStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'environment' },
            audio: false
        });
        liveVideo.srcObject = videoStream;
        
        // Set canvas dimensions to match video
        liveVideo.addEventListener('loadedmetadata', () => {
            videoCanvas.width = liveVideo.videoWidth;
            videoCanvas.height = liveVideo.videoHeight;
        });
    } catch (err) {
        showMessage(driverResponse, `Error accessing camera: ${err.message}`, 'error');
    }
}

// === Drive Session Controls ===
startDriveBtn.addEventListener('click', startDriveSession);
stopDriveBtn.addEventListener('click', stopDriveSession);

function startDriveSession() {
    if (!currentLocation) {
        showMessage(driverResponse, 'Location not available. Please enable GPS.', 'error');
        return;
    }

    if (!videoStream) {
        showMessage(driverResponse, 'Video stream not initialized.', 'error');
        return;
    }

    // Reset session stats
    sessionSeconds = 0;
    apiCalls = 0;
    potholesDetected = 0;
    updateSessionDisplay();

    // Show stop button
    startDriveBtn.classList.add('hidden');
    stopDriveBtn.classList.remove('hidden');

    // Start session timer
    sessionTimer = setInterval(() => {
        sessionSeconds++;
        updateSessionDisplay();
        
        // End session after MAX_SESSION_MINUTES
        if (sessionSeconds >= MAX_SESSION_MINUTES * 60) {
            stopDriveSession();
            showMessage(driverResponse, 'Drive session completed (20 minute limit reached).', 'success');
        }
    }, 1000);

    // Start frame capture and detection
    detectionInterval = setInterval(captureAndDetect, FRAME_CAPTURE_INTERVAL);
}

function stopDriveSession() {
    // Clear timers
    if (detectionInterval) clearInterval(detectionInterval);
    if (sessionTimer) clearInterval(sessionTimer);
    
    // Reset UI
    startDriveBtn.classList.remove('hidden');
    stopDriveBtn.classList.add('hidden');
    
    // Stop video stream
    if (videoStream) {
        videoStream.getTracks().forEach(track => track.stop());
        videoStream = null;
        liveVideo.srcObject = null;
    }
}

async function captureAndDetect() {
    if (apiCalls >= 240) {
        showMessage(driverResponse, 'API call limit reached (240 calls).', 'error');
        stopDriveSession();
        return;
    }

    try {
        // Capture frame from video
        const canvas = document.createElement('canvas');
        canvas.width = liveVideo.videoWidth;
        canvas.height = liveVideo.videoHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(liveVideo, 0, 0, canvas.width, canvas.height);
        const imageData = canvas.toDataURL('image/jpeg');

        // Send to detection API
        const response = await fetch(DETECTION_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                api_key: API_KEY,
                image: imageData.split(',')[1]
            })
        });

        const data = await response.json();
        apiCalls++;
        
        // Process detections
        if (data.predictions && data.predictions.length > 0) {
            const potholePredictions = data.predictions.filter(p => p.class === 'pothole');
            if (potholePredictions.length > 0) {
                potholesDetected += potholePredictions.length;
                drawBoundingBoxes(potholePredictions);
                potholeAlert.play(); // Play alert sound
            }
        }
        
        // Save report if potholes detected
        if (data.predictions && data.predictions.some(p => p.class === 'pothole')) {
            await saveDriveReport(imageData, data);
        }
        
        updateSessionDisplay();
    } catch (error) {
        console.error('Detection error:', error);
    }
}

function drawBoundingBoxes(predictions) {
    const ctx = videoCanvas.getContext('2d');
    ctx.clearRect(0, 0, videoCanvas.width, videoCanvas.height);
    
    predictions.forEach(prediction => {
        const { x, y, width, height } = prediction;
        
        // Draw bounding box
        ctx.strokeStyle = '#FF0000';
        ctx.lineWidth = 3;
        ctx.strokeRect(x - width/2, y - height/2, width, height);
        
        // Draw label background
        ctx.fillStyle = '#FF0000';
        const textWidth = ctx.measureText('Pothole').width;
        ctx.fillRect(x - width/2, y - height/2 - 20, textWidth + 10, 20);
        
        // Draw label text
        ctx.fillStyle = '#FFFFFF';
        ctx.font = '16px Arial';
        ctx.fillText('Pothole', x - width/2 + 5, y - height/2 - 5);
    });
}

async function saveDriveReport(imageData, predictionData) {
    try {
        const blob = await (await fetch(imageData)).blob();
        const file = new File([blob], 'pothole-detection.jpg', { type: 'image/jpeg' });

        const formData = new FormData();
        formData.append('latitude', currentLocation.latitude);
        formData.append('longitude', currentLocation.longitude);
        formData.append('issue_type', 'pothole');
        formData.append('description', 'Automatically detected during drive session');
        formData.append('image', file);
        formData.append('prediction_data', JSON.stringify(predictionData));

        if (roadName) formData.append('road_name', roadName);

        await fetch(`${BASE_URL}/api/reports/`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`
            },
            body: formData
        });
    } catch (error) {
        console.error('Error saving drive report:', error);
    }
}

function updateSessionDisplay() {
    const minutes = Math.floor(sessionSeconds / 60).toString().padStart(2, '0');
    const seconds = (sessionSeconds % 60).toString().padStart(2, '0');
    sessionTimeDisplay.textContent = `${minutes}:${seconds}`;
    apiCallsDisplay.textContent = apiCalls;
    potholeCountDisplay.textContent = potholesDetected;
}

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

            // Fetch road name from coordinates
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