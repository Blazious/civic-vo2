// === CONFIGURATION ===
const BASE_URL = 'https://3f2d297d5513.ngrok-free.app';
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
        return fetch('https://ipinfo.io/json?token=YOUR_API_KEY')
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
        loginBtn.disabled = true;
        loginBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

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
        
        console.log('=== LOGIN DEBUG ===');
        console.log('Response status:', response.status);
        console.log('Response ok:', response.ok);
        console.log('Full response data:', data);
        console.log('data.tokens:', data.tokens);
        console.log('data.access:', data.access);
        console.log('==================');

        let accessToken = null;
        let refreshToken = null;

        if (response.ok) {
            if (data.tokens && data.tokens.access) {
                accessToken = data.tokens.access;
                refreshToken = data.tokens.refresh;
            } else if (data.access) {
                accessToken = data.access;
                refreshToken = data.refresh;
            } else if (data.access_token) {
                accessToken = data.access_token;
                refreshToken = data.refresh_token;
            } else if (data.token) {
                accessToken = data.token;
                refreshToken = data.refresh || null;
            }

            if (accessToken) {
                localStorage.setItem('civiceye_access', accessToken);
                if (refreshToken) {
                    localStorage.setItem('civiceye_refresh', refreshToken);
                }

                window.accessToken = accessToken;
                window.refreshToken = refreshToken;

                showReportingInterface();
                showMessage(loginResponse, 'Login successful!', 'success');
            } else {
                console.error('No access token found in response:', data);
                showMessage(
                    loginResponse,
                    'Login response missing token. Check console for details.',
                    'error'
                );
            }
        } else {
            showMessage(
                loginResponse,
                data.detail || data.message || data.error || 'Login failed — check credentials',
                'error'
            );
        }
    } catch (error) {
        console.error('Login error:', error);
        showMessage(loginResponse, 'An error occurred. Try again.', 'error');
    } finally {
        loginBtn.disabled = false;
        loginBtn.innerHTML = 'Login';
    }
});

// === Handle Logout ===
logoutBtn.addEventListener('click', () => {
    stopDriveSession();
    GeolocationManager.stopWatchingPosition();
    
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

    sessionSeconds = 0;
    apiCalls = 0;
    potholesDetected = 0;
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
        const canvas = document.createElement('canvas');
        canvas.width = liveVideo.videoWidth;
        canvas.height = liveVideo.videoHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(liveVideo, 0, 0, canvas.width, canvas.height);
        const imageData = canvas.toDataURL('image/jpeg');

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
        
        if (data.predictions && data.predictions.length > 0) {
            const potholePredictions = data.predictions.filter(p => p.class === 'pothole');
            if (potholePredictions.length > 0) {
                potholesDetected += potholePredictions.length;
                drawBoundingBoxes(potholePredictions);
                potholeAlert.play();
            }
        }
        
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
    GeolocationManager.init();
}

// === Show Temporary Messages ===
function showMessage(element, message, type) {
    element.textContent = message;
    element.className = `response-message ${type}`;
    element.classList.remove('hidden');
    setTimeout(() => element.classList.add('hidden'), 5000);
}

// Add this CSS to your stylesheet:
/*
.permission-modal {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0,0,0,0.7);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 1000;
}

.permission-content {
    background: white;
    padding: 20px;
    border-radius: 8px;
    max-width: 400px;
}

.permission-buttons {
    display: flex;
    gap: 10px;
    margin-top: 20px;
}

.permission-buttons button {
    flex: 1;
    padding: 10px;
    border: none;
    border-radius: 4px;
    cursor: pointer;
}

#grant-permission-btn {
    background: #4CAF50;
    color: white;
}

#continue-anyway-btn {
    background: #f0f0f0;
}

.retry-btn {
    margin-top: 10px;
    padding: 5px 10px;
    background: #2196F3;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
}

.retry-btn.hidden {
    display: none;
}
*/