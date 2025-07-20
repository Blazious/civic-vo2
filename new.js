// === CONFIGURATION ===
const BASE_URL = 'https://6f6f3ee9ea25.ngrok-free.app';
const DETECTION_API_URL = `${BASE_URL}/api/detection/detect/`;
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
let frameCaptures = []; // Stores all frame data with locations

// === Geolocation Manager ===
const GeolocationManager = {
    // Configuration
    highAccuracyTimeout: 10000,
    standardAccuracyTimeout: 5000,
    fallbackIPTimeout: 3000,
    maxRetries: 3,
    currentRetry: 0,
    isHighAccuracy: true,
    watchId: null,
    lastPosition: null,

    init: function() {
        this.bindUI();
        this.requestLocationPermission();
    },

    bindUI: function() {
        if (!document.getElementById('geolocation-retry-btn')) {
            const retryBtn = document.createElement('button');
            retryBtn.id = 'geolocation-retry-btn';
            retryBtn.className = 'retry-btn hidden';
            retryBtn.textContent = 'Retry Location';
            retryBtn.onclick = () => this.forceGetLocation();
            gpsStatus.appendChild(retryBtn);
        }
    },

    forceGetLocation: function() {
        this.currentRetry = 0;
        this.isHighAccuracy = true;
        this.getLocationWithFallbacks();
    },

    getLocationWithFallbacks: function() {
        this.showLoadingState();
        
        this.getHighAccuracyLocation()
            .catch(() => {
                console.warn('High accuracy failed, trying standard accuracy');
                this.isHighAccuracy = false;
                return this.getStandardAccuracyLocation();
            })
            .catch(() => {
                console.warn('Standard accuracy failed, trying IP geolocation');
                return this.getIPBasedLocation();
            })
            .catch(error => {
                console.error('All location methods failed:', error);
                this.showErrorState('Could not determine your location. Please ensure location services are enabled.');
            });
    },

    getHighAccuracyLocation: function() {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('High accuracy timeout'));
            }, this.highAccuracyTimeout);

            navigator.geolocation.getCurrentPosition(
                position => {
                    clearTimeout(timeout);
                    this.handlePositionSuccess(position);
                    resolve(position);
                },
                error => {
                    clearTimeout(timeout);
                    this.handlePositionError(error);
                    reject(error);
                },
                {
                    enableHighAccuracy: true,
                    timeout: this.highAccuracyTimeout,
                    maximumAge: 0
                }
            );
        });
    },

    getStandardAccuracyLocation: function() {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Standard accuracy timeout'));
            }, this.standardAccuracyTimeout);

            navigator.geolocation.getCurrentPosition(
                position => {
                    clearTimeout(timeout);
                    this.handlePositionSuccess(position);
                    resolve(position);
                },
                error => {
                    clearTimeout(timeout);
                    this.handlePositionError(error);
                    reject(error);
                },
                {
                    enableHighAccuracy: false,
                    timeout: this.standardAccuracyTimeout,
                    maximumAge: 30000
                }
            );
        });
    },

    getIPBasedLocation: function() {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('IP geolocation timeout'));
            }, this.fallbackIPTimeout);

            Promise.any([
                this.queryIPApiCo(),
                this.queryIPInfoIo(),
                this.queryGeolocationDb()
            ])
            .then(position => {
                clearTimeout(timeout);
                position.isApproximate = true;
                this.handlePositionSuccess(position);
                resolve(position);
            })
            .catch(error => {
                clearTimeout(timeout);
                reject(error);
            });
        });
    },

    queryIPApiCo: function() {
        return fetch('https://ipapi.co/json/')
            .then(response => response.json())
            .then(data => ({
                coords: {
                    latitude: data.latitude,
                    longitude: data.longitude,
                    accuracy: 5000,
                },
                timestamp: Date.now()
            }));
    },

    queryIPInfoIo: function() {
        return fetch('https://ipinfo.io/json')
            .then(response => response.json())
            .then(data => {
                const [lat, lon] = data.loc.split(',');
                return {
                    coords: {
                        latitude: parseFloat(lat),
                        longitude: parseFloat(lon),
                        accuracy: 10000,
                    },
                    timestamp: Date.now()
                };
            });
    },

    queryGeolocationDb: function() {
        return fetch('https://geolocation-db.com/json/')
            .then(response => response.json())
            .then(data => ({
                coords: {
                    latitude: data.latitude,
                    longitude: data.longitude,
                    accuracy: 20000,
                },
                timestamp: Date.now()
            }));
    },

    requestLocationPermission: function() {
        if (navigator.permissions && navigator.permissions.query) {
            navigator.permissions.query({ name: 'geolocation' })
                .then(permissionStatus => {
                    permissionStatus.onchange = () => {
                        if (permissionStatus.state === 'granted') {
                            this.getLocationWithFallbacks();
                        }
                    };
                    
                    if (permissionStatus.state === 'granted') {
                        this.getLocationWithFallbacks();
                    } else {
                        this.showPermissionPrompt();
                    }
                })
                .catch(() => {
                    this.getLocationWithFallbacks();
                });
        } else {
            this.getLocationWithFallbacks();
        }
    },

    showPermissionPrompt: function() {
        const permissionModal = document.createElement('div');
        permissionModal.className = 'permission-modal';
        permissionModal.innerHTML = `
            <div class="permission-content">
                <h3>Location Access Required</h3>
                <p>This app needs your location to accurately report infrastructure issues.</p>
                <p>Please grant location permissions when prompted.</p>
                <div class="permission-buttons">
                    <button id="grant-permission-btn">Grant Permission</button>
                    <button id="continue-anyway-btn">Continue with Approximate Location</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(permissionModal);
        
        document.getElementById('grant-permission-btn').onclick = () => {
            permissionModal.remove();
            this.getLocationWithFallbacks();
        };
        
        document.getElementById('continue-anyway-btn').onclick = () => {
            permissionModal.remove();
            this.getIPBasedLocation().catch(() => {
                this.showErrorState('Using default location. Reports may not be accurate.');
            });
        };
    },

    handlePositionSuccess: function(position) {
        currentLocation = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            isApproximate: position.isApproximate || false
        };

        latitudeValue.textContent = currentLocation.latitude.toFixed(6);
        longitudeValue.textContent = currentLocation.longitude.toFixed(6);

        let statusMessage = 'Location acquired';
        if (currentLocation.isApproximate) {
            statusMessage += ' (approximate)';
        } else if (currentLocation.accuracy > 1000) {
            statusMessage += ' (low accuracy)';
        }

        gpsStatus.innerHTML = `
            <i class="fas fa-map-marker-alt"></i>
            <div>
                <h3>${statusMessage}</h3>
                <p>Accuracy: ~${Math.round(currentLocation.accuracy)} meters</p>
            </div>
        `;
        gpsStatus.classList.add('gps-success');
        
        document.getElementById('geolocation-retry-btn').classList.add('hidden');
        
        if (this.isHighAccuracy && !this.watchId) {
            this.startWatchingPosition();
        }
        
        this.fetchRoadName(currentLocation.latitude, currentLocation.longitude);
    },

    handlePositionError: function(error) {
        let errorMessage = 'Location error';
        switch (error.code) {
            case error.PERMISSION_DENIED:
                errorMessage = 'Location permission denied';
                break;
            case error.POSITION_UNAVAILABLE:
                errorMessage = 'Location unavailable';
                break;
            case error.TIMEOUT:
                errorMessage = 'Location request timed out';
                break;
        }

        this.showErrorState(errorMessage);
        
        document.getElementById('geolocation-retry-btn').classList.remove('hidden');
        
        if (this.currentRetry < this.maxRetries) {
            this.currentRetry++;
            setTimeout(() => this.getLocationWithFallbacks(), 2000);
        }
    },

    startWatchingPosition: function() {
        if (this.watchId) return;
        
        this.watchId = navigator.geolocation.watchPosition(
            position => {
                this.handlePositionSuccess(position);
            },
            error => {
                console.warn('Watch position error:', error);
            },
            {
                enableHighAccuracy: this.isHighAccuracy,
                maximumAge: 30000,
                timeout: this.highAccuracyTimeout
            }
        );
    },

    stopWatchingPosition: function() {
        if (this.watchId) {
            navigator.geolocation.clearWatch(this.watchId);
            this.watchId = null;
        }
    },

    fetchRoadName: async function(lat, lon) {
        try {
            const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1`);
            const data = await response.json();
            roadName = data.display_name || '';
            
            if (roadName) {
                const roadInfo = document.createElement('p');
                roadInfo.textContent = `Near: ${roadName.split(',').slice(0, 3).join(',')}`;
                gpsStatus.querySelector('div').appendChild(roadInfo);
            }
        } catch (err) {
            console.warn('Road name lookup failed:', err);
        }
    },

    showLoadingState: function() {
        gpsStatus.innerHTML = `
            <i class="fas fa-satellite fa-spin"></i>
            <div>
                <h3>Acquiring Location</h3>
                <p>${this.isHighAccuracy ? 'Using GPS...' : 'Using network...'}</p>
            </div>
        `;
        gpsStatus.classList.remove('gps-error', 'gps-success');
    },

    showErrorState: function(message) {
        gpsStatus.innerHTML = `
            <i class="fas fa-exclamation-triangle"></i>
            <div>
                <h3>${message}</h3>
                <p>Try moving to an open area</p>
            </div>
        `;
        gpsStatus.classList.remove('gps-success');
        gpsStatus.classList.add('gps-error');
    }
};

// === Helper Functions ===
async function getCurrentLocationWithFallback() {
    try {
        if (!currentLocation) {
            await GeolocationManager.getLocationWithFallbacks();
        }
        return currentLocation || {
            latitude: 0,
            longitude: 0,
            accuracy: 0,
            isApproximate: true
        };
    } catch (error) {
        console.error('Error getting location:', error);
        return {
            latitude: 0,
            longitude: 0,
            accuracy: 0,
            isApproximate: true
        };
    }
}

function showMessage(element, message, type) {
    element.textContent = message;
    element.className = `response-message ${type}`;
    element.classList.remove('hidden');
    setTimeout(() => element.classList.add('hidden'), 5000);
}

function showReportingInterface() {
    loginSection.classList.add('hidden');
    reportSection.classList.remove('hidden');
    GeolocationManager.init();
}

function updateSessionDisplay() {
    const minutes = Math.floor(sessionSeconds / 60).toString().padStart(2, '0');
    const seconds = (sessionSeconds % 60).toString().padStart(2, '0');
    sessionTimeDisplay.textContent = `${minutes}:${seconds}`;
    apiCallsDisplay.textContent = apiCalls;
    potholeCountDisplay.textContent = potholesDetected;
}

function drawBoundingBoxes(predictions) {
    const ctx = videoCanvas.getContext('2d');
    ctx.clearRect(0, 0, videoCanvas.width, videoCanvas.height);
    
    predictions.forEach(prediction => {
        const { x, y, width, height } = prediction;
        
        ctx.strokeStyle = '#FF0000';
        ctx.lineWidth = 3;
        ctx.strokeRect(x - width/2, y - height/2, width, height);
        
        ctx.fillStyle = '#FF0000';
        const textWidth = ctx.measureText('Pothole').width;
        ctx.fillRect(x - width/2, y - height/2 - 20, textWidth + 10, 20);
        
        ctx.fillStyle = '#FFFFFF';
        ctx.font = '16px Arial';
        ctx.fillText('Pothole', x - width/2 + 5, y - height/2 - 5);
    });
}

// === Event Listeners ===
window.addEventListener('DOMContentLoaded', () => {
    const storedToken = localStorage.getItem('civiceye_access');
    if (storedToken) {
        accessToken = storedToken;
        refreshToken = localStorage.getItem('civiceye_refresh');
        showReportingInterface();
    }
});

loginBtn.addEventListener('click', async (e) => {
    e.preventDefault();

    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;

    if (!username || !password) {
        showMessage(loginResponse, 'Please enter both email and password', 'error');
        return;
    }

    try {
        loginBtn.disabled = true;
        loginBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Logging in...';

        const response = await fetch(`${BASE_URL}/api/users/login/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                email: username,
                password: password
            })
        });

        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.detail || data.message || 'Login failed');
        }

        // Handle JWT tokens (access and refresh)
        if (!data.access || !data.refresh) {
            throw new Error('Invalid token response from server');
        }

        accessToken = data.access;
        refreshToken = data.refresh;

        // Store tokens in localStorage
        localStorage.setItem('civiceye_access', accessToken);
        localStorage.setItem('civiceye_refresh', refreshToken);

        showReportingInterface();
        showMessage(loginResponse, 'Login successful!', 'success');

    } catch (error) {
        console.error('Login error:', error);
        showMessage(loginResponse, error.message || 'An error occurred during login', 'error');
    } finally {
        loginBtn.disabled = false;
        loginBtn.innerHTML = 'Login';
    }
});

logoutBtn.addEventListener('click', () => {
    stopDriveSession();
    GeolocationManager.stopWatchingPosition();
    
    localStorage.removeItem('civiceye_access');
    localStorage.removeItem('civiceye_refresh');
    accessToken = null;
    refreshToken = null;
    currentLocation = null;
    roadName = null;
    frameCaptures = [];

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

async function initVideoStream() {
    try {
        videoStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'environment' },
            audio: false
        });
        liveVideo.srcObject = videoStream;
        
        liveVideo.addEventListener('loadedmetadata', () => {
            videoCanvas.width = liveVideo.videoWidth;
            videoCanvas.height = liveVideo.videoHeight;
        });
    } catch (err) {
        showMessage(driverResponse, `Error accessing camera: ${err.message}`, 'error');
    }
}

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

    sessionSeconds = 0;
    apiCalls = 0;
    potholesDetected = 0;
    frameCaptures = [];
    updateSessionDisplay();

    startDriveBtn.classList.add('hidden');
    stopDriveBtn.classList.remove('hidden');

    sessionTimer = setInterval(() => {
        sessionSeconds++;
        updateSessionDisplay();
        
        if (sessionSeconds >= MAX_SESSION_MINUTES * 60) {
            stopDriveSession();
            showMessage(driverResponse, 'Drive session completed (20 minute limit reached).', 'success');
        }
    }, 1000);

    detectionInterval = setInterval(captureAndDetect, FRAME_CAPTURE_INTERVAL);
}

function stopDriveSession() {
    if (detectionInterval) clearInterval(detectionInterval);
    if (sessionTimer) clearInterval(sessionTimer);
    
    startDriveBtn.classList.remove('hidden');
    stopDriveBtn.classList.add('hidden');
    
    // Log all frame captures with locations
    console.log('Session frame captures with GPS data:', frameCaptures);
    
    // Optionally save to localStorage
    localStorage.setItem('last_session_frames', JSON.stringify(frameCaptures));
    
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
        // Get current location before capturing frame
        const frameLocation = await getCurrentLocationWithFallback();
        
        const canvas = document.createElement('canvas');
        canvas.width = liveVideo.videoWidth;
        canvas.height = liveVideo.videoHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(liveVideo, 0, 0, canvas.width, canvas.height);
        const imageData = canvas.toDataURL('image/jpeg');
        
        // Store frame data with location
        const frameData = {
            timestamp: new Date().toISOString(),
            imageData: imageData,
            location: {
                latitude: frameLocation.latitude,
                longitude: frameLocation.longitude,
                accuracy: frameLocation.accuracy,
                isApproximate: frameLocation.isApproximate || false
            },
            roadName: roadName || null
        };
        
        frameCaptures.push(frameData);
        console.log('Frame captured with location:', frameData.location);

        // Send to your custom detection model
        const response = await fetch(DETECTION_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`
            },
            body: JSON.stringify({
                image: imageData.split(',')[1],
                latitude: frameLocation.latitude,
                longitude: frameLocation.longitude
            })
        });

        const data = await response.json();
        apiCalls++;
        
        if (data.predictions && data.predictions.length > 0) {
            const potholePredictions = data.predictions.filter(p => p.class === 'pothole');
            if (potholePredictions.length > 0) {
                potholesDetected += potholePredictions.length;
                drawBoundingBoxes(potholePredictions);
                potholeAlert.play();
                
                // Add predictions to frame data
                frameData.predictions = potholePredictions;
            }
        }
        
        if (data.predictions && data.predictions.some(p => p.class === 'pothole')) {
            await saveDriveReport(frameData);
        }
        
        updateSessionDisplay();
    } catch (error) {
        console.error('Detection error:', error);
    }
}

async function saveDriveReport(frameData) {
    try {
        const blob = await (await fetch(frameData.imageData)).blob();
        const file = new File([blob], 'pothole-detection.jpg', { type: 'image/jpeg' });

        const formData = new FormData();
        formData.append('latitude', frameData.location.latitude);
        formData.append('longitude', frameData.location.longitude);
        formData.append('issue_type', 'pothole');
        formData.append('description', 'Automatically detected during drive session');
        formData.append('image', file);
        formData.append('prediction_data', JSON.stringify({
            predictions: frameData.predictions,
            location: frameData.location,
            timestamp: frameData.timestamp
        }));

        if (frameData.roadName) formData.append('road_name', frameData.roadName);

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

// === Initialize ===
if (document.readyState !== 'loading') {
    GeolocationManager.init();
} else {
    document.addEventListener('DOMContentLoaded', () => GeolocationManager.init());
}