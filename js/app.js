// ═══════════════════════════════════════════════════
//  AWS Bibitan DLJ1 — Weather Station Dashboard JS
//  Real-time Firebase RTDB + Chart.js
// ═══════════════════════════════════════════════════

// ─── Firebase Configuration ───
const firebaseConfig = {
  apiKey: "AIzaSyAZgkLOMUUAX3cV5TMXTCWutsViKpgGhm0",
  authDomain: "awsbibitandlj1.firebaseapp.com",
  databaseURL: "https://awsbibitandlj1-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "awsbibitandlj1",
  storageBucket: "awsbibitandlj1.firebasestorage.app",
  messagingSenderId: "906423381613",
  appId: "1:906423381613:web:e7a3fbba7bc5f9f3465964"
};

// ─── Initialize Firebase ───
firebase.initializeApp(firebaseConfig);
const database = firebase.database();

// ─── Global State ───
let historyChart = null;
let lastUpdateTime = 0;
let isConnected = false;
const historyData = {
  labels: [],
  temperature: [],
  humidity: []
};
const MAX_HISTORY_POINTS = 50;

// ─── Weather Emoji Mapping ───
const weatherEmojis = {
  'Berawan': '☁️',
  'Hujan Ringan': '🌦️',
  'Hujan Sedang': '🌧️',
  'Hujan Lebat': '⛈️',
  'Hujan Sangat Lebat': '🌊',
  'Hujan Ekstrem': '🌪️'
};

// ─── Light Level Description ───
function getLightDesc(lux) {
  if (lux < 0) return 'Sensor Error';
  if (lux < 1) return 'Gelap Total';
  if (lux < 50) return 'Redup';
  if (lux < 200) return 'Senja/Fajar';
  if (lux < 500) return 'Mendung';
  if (lux < 1000) return 'Teduh';
  if (lux < 10000) return 'Cerah Berawan';
  if (lux < 25000) return 'Cerah';
  if (lux < 50000) return 'Terik';
  return 'Sangat Terik';
}

// ─── Humidity Description ───
function getHumidityDesc(hum) {
  if (hum < 30) return 'Sangat Kering';
  if (hum < 40) return 'Kering';
  if (hum < 60) return 'Nyaman';
  if (hum < 70) return 'Lembab';
  if (hum < 80) return 'Sangat Lembab';
  return 'Basah';
}

// ─── Format Uptime ───
function formatUptime(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) return `${days}h ${hours % 24}j ${minutes % 60}m`;
  if (hours > 0) return `${hours}j ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}d`;
  return `${seconds} detik`;
}

// ─── Animate Value Change ───
function animateValue(elementId) {
  const el = document.getElementById(elementId);
  if (el) {
    el.classList.remove('data-updated');
    void el.offsetWidth; // Force reflow
    el.classList.add('data-updated');
  }
}

// ─── Safe Number Format ───
function fmt(val, decimals = 1) {
  if (val === undefined || val === null || isNaN(val)) return '--';
  return Number(val).toFixed(decimals);
}

// ═══════════════════════════════════════════════════
//  UPDATE UI FUNCTIONS
// ═══════════════════════════════════════════════════

function updateHeroSection(data) {
  // Temperature
  const temp = data.temperature;
  document.getElementById('temp-main').textContent = temp !== undefined ? Math.round(temp) : '--';
  
  // Weather
  const weather = data.weather || 'Berawan';
  document.getElementById('weather-status').textContent = weather;
  document.getElementById('weather-emoji').textContent = weatherEmojis[weather] || '☁️';
  
  // Details
  document.getElementById('heat-index').textContent = `${fmt(data.heatIndex)}°C`;
  document.getElementById('dew-point').textContent = `${fmt(data.dewPoint)}°C`;
  document.getElementById('bmp-temp').textContent = `${fmt(data.bmpTemperature)}°C`;
  
  // Hero Stats
  document.getElementById('humidity-hero').textContent = `${fmt(data.humidity)}%`;
  document.getElementById('wind-hero').textContent = `${fmt(data.windSpeed_kmh)} km/h`;
  document.getElementById('rain-hero').textContent = `${fmt(data.rainfallToday_mm, 2)} mm`;
  document.getElementById('light-hero').textContent = `${Math.round(data.light_lux || 0)} Lux`;
  
  animateValue('temp-main');
}

function updateWindSection(data) {
  // Compass needle rotation
  const degree = data.windDegree || 0;
  const needle = document.getElementById('compass-needle');
  if (needle && degree >= 0) {
    needle.style.transform = `translate(-50%, -100%) rotate(${degree}deg)`;
  }
  
  // Speed in compass center
  document.getElementById('wind-speed-compass').textContent = fmt(data.windSpeed_kmh, 0);
  
  // Details
  document.getElementById('wind-direction').textContent = data.windDirection || '--';
  document.getElementById('wind-speed-ms').textContent = `${fmt(data.windSpeed_ms)} m/s`;
  document.getElementById('beaufort-desc').textContent = data.beaufortDesc || '--';
  
  // Beaufort badge
  const beaufort = data.beaufort || 0;
  document.getElementById('beaufort-badge').textContent = `Beaufort ${beaufort}`;
}

function updateRainSection(data) {
  const rainToday = data.rainfallToday_mm || 0;
  const weather = data.weather || 'Berawan';
  
  // Rain gauge fill (max 150mm = 100%)
  const fillPercent = Math.min((rainToday / 150) * 100, 100);
  document.getElementById('rain-gauge-fill').style.height = `${fillPercent}%`;
  document.getElementById('rain-gauge-value').textContent = fmt(rainToday, 2);
  
  // Status badge
  const badge = document.getElementById('rain-status-badge');
  badge.textContent = weather;
  badge.classList.toggle('raining', rainToday > 0.5);
  
  // Details
  document.getElementById('rain-per-minute').textContent = `${fmt(data.rainfallPerMinute_mm, 2)} mm`;
  document.getElementById('rain-per-hour').textContent = `${fmt(data.rainfallPerHour_mm, 2)} mm`;
  document.getElementById('rain-today').textContent = `${fmt(rainToday, 2)} mm`;
}

function updateDetailCards(data) {
  // Pressure
  document.getElementById('pressure-hpa').textContent = `${fmt(data.pressure_hPa)} hPa`;
  document.getElementById('pressure-mmhg').textContent = `${fmt(data.pressure_mmHg)} mmHg`;
  
  // Light
  const lux = data.light_lux || 0;
  document.getElementById('light-lux').textContent = `${Math.round(lux)} Lux`;
  document.getElementById('light-desc').textContent = getLightDesc(lux);
  
  // Humidity
  const hum = data.humidity || 0;
  document.getElementById('humidity-value').textContent = `${fmt(hum)}%`;
  document.getElementById('humidity-desc').textContent = getHumidityDesc(hum);
  
  // Beaufort
  document.getElementById('beaufort-scale').textContent = data.beaufort || 0;
  document.getElementById('beaufort-text').textContent = data.beaufortDesc || 'Tenang';
}

function updateSystemStatus(data) {
  document.getElementById('sys-rssi').textContent = `${data.rssi || '--'} dBm`;
  document.getElementById('sys-heap').textContent = 
    data.freeHeap ? `${(data.freeHeap / 1024).toFixed(1)} KB` : '--';
  document.getElementById('sys-uptime').textContent = 
    data.uptimeMs ? formatUptime(data.uptimeMs) : '--';
  document.getElementById('sys-last-update').textContent = data.time || '--';
}

function updateHeaderTime(data) {
  const time = data.time || '--:--:--';
  const date = data.date || '--';
  
  document.getElementById('header-time').textContent = time;
  document.getElementById('header-date').textContent = date;
}

// ═══════════════════════════════════════════════════
//  CHART SETUP
// ═══════════════════════════════════════════════════

function initChart() {
  const ctx = document.getElementById('historyChart');
  if (!ctx) return;
  
  // Chart.js default colors for dark theme
  Chart.defaults.color = 'rgba(255, 255, 255, 0.5)';
  Chart.defaults.borderColor = 'rgba(255, 255, 255, 0.06)';
  
  historyChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: historyData.labels,
      datasets: [
        {
          label: 'Suhu (°C)',
          data: historyData.temperature,
          borderColor: '#ff7043',
          backgroundColor: 'rgba(255, 112, 67, 0.1)',
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 5,
          pointHoverBackgroundColor: '#ff7043',
          fill: true,
          tension: 0.4,
          yAxisID: 'y'
        },
        {
          label: 'Kelembaban (%)',
          data: historyData.humidity,
          borderColor: '#4fc3f7',
          backgroundColor: 'rgba(79, 195, 247, 0.08)',
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 5,
          pointHoverBackgroundColor: '#4fc3f7',
          fill: true,
          tension: 0.4,
          yAxisID: 'y1'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(10, 22, 40, 0.9)',
          titleColor: '#ffffff',
          bodyColor: 'rgba(255,255,255,0.8)',
          borderColor: 'rgba(255,255,255,0.1)',
          borderWidth: 1,
          cornerRadius: 8,
          padding: 12,
          titleFont: { family: 'Inter', weight: '600' },
          bodyFont: { family: 'JetBrains Mono', size: 12 }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { 
            font: { size: 10, family: 'JetBrains Mono' },
            maxTicksLimit: 10
          }
        },
        y: {
          type: 'linear',
          position: 'left',
          title: {
            display: true,
            text: 'Suhu (°C)',
            font: { size: 10, family: 'Inter' },
            color: '#ff7043'
          },
          grid: { color: 'rgba(255, 255, 255, 0.04)' },
          ticks: { font: { size: 10, family: 'JetBrains Mono' } }
        },
        y1: {
          type: 'linear',
          position: 'right',
          title: {
            display: true,
            text: 'Kelembaban (%)',
            font: { size: 10, family: 'Inter' },
            color: '#4fc3f7'
          },
          grid: { display: false },
          ticks: { font: { size: 10, family: 'JetBrains Mono' } },
          min: 0,
          max: 100
        }
      }
    }
  });
}

function addChartDataPoint(data) {
  if (!historyChart) return;
  
  const time = data.time || '--:--';
  const shortTime = time.substring(0, 5); // HH:MM
  
  historyData.labels.push(shortTime);
  historyData.temperature.push(data.temperature || 0);
  historyData.humidity.push(data.humidity || 0);
  
  // Limit data points
  if (historyData.labels.length > MAX_HISTORY_POINTS) {
    historyData.labels.shift();
    historyData.temperature.shift();
    historyData.humidity.shift();
  }
  
  historyChart.update('none'); // 'none' = no animation for performance
}

// ═══════════════════════════════════════════════════
//  LOAD HISTORY DATA FROM FIREBASE
// ═══════════════════════════════════════════════════

function loadHistoryData() {
  // Get today's date
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD
  
  const historyRef = database.ref(`/stations/aws_bibitan_dlj1/history/${dateStr}`);
  historyRef.orderByKey().limitToLast(MAX_HISTORY_POINTS).once('value', (snapshot) => {
    if (!snapshot.exists()) return;
    
    const data = snapshot.val();
    const times = Object.keys(data).sort();
    
    times.forEach(time => {
      const entry = data[time];
      const displayTime = time.replace('_', ':');
      
      historyData.labels.push(displayTime);
      historyData.temperature.push(entry.t || 0);
      historyData.humidity.push(entry.h || 0);
    });
    
    if (historyChart) {
      historyChart.update('none');
    }
  });
}

// ═══════════════════════════════════════════════════
//  FIREBASE REAL-TIME LISTENER
// ═══════════════════════════════════════════════════

function startRealtimeListener() {
  const currentRef = database.ref('/stations/aws_bibitan_dlj1/current');
  
  currentRef.on('value', (snapshot) => {
    if (!snapshot.exists()) {
      console.warn('No data available');
      return;
    }
    
    const data = snapshot.val();
    lastUpdateTime = Date.now();
    
    // Update connection status
    setConnectionStatus(true);
    
    // Update all UI sections
    updateHeroSection(data);
    updateWindSection(data);
    updateRainSection(data);
    updateDetailCards(data);
    updateSystemStatus(data);
    updateHeaderTime(data);
    
    // Add to chart
    addChartDataPoint(data);
    
    console.log('[Firebase] Data received:', data.time);
  }, (error) => {
    console.error('[Firebase] Error:', error);
    setConnectionStatus(false);
  });
  
  // Also load station info
  database.ref('/stations/aws_bibitan_dlj1/info').once('value', (snapshot) => {
    if (snapshot.exists()) {
      const info = snapshot.val();
      if (info.name) document.getElementById('station-name').textContent = info.name;
      if (info.location) document.getElementById('station-location').textContent = `📍 ${info.location}`;
      if (info.ip) document.getElementById('sys-ip').textContent = info.ip;
      document.getElementById('sys-firebase').textContent = 'Connected';
    }
  });
}

// ─── Connection Status ───
function setConnectionStatus(connected) {
  isConnected = connected;
  const badge = document.getElementById('live-badge');
  const statusText = document.getElementById('connection-status');
  
  if (connected) {
    badge.classList.remove('offline');
    statusText.textContent = 'LIVE';
  } else {
    badge.classList.add('offline');
    statusText.textContent = 'Offline';
  }
}

// ─── Check if data is stale (>30 seconds old) ───
function checkStaleData() {
  if (lastUpdateTime > 0 && Date.now() - lastUpdateTime > 30000) {
    setConnectionStatus(false);
    document.getElementById('connection-status').textContent = 'Stale';
  }
}

// ═══════════════════════════════════════════════════
//  LOCAL CLOCK (runs independently of Firebase)
// ═══════════════════════════════════════════════════

function updateLocalClock() {
  const now = new Date();
  const timeStr = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  const dateStr = now.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  
  // Only update header clock if no Firebase data yet or data is stale
  if (!isConnected || Date.now() - lastUpdateTime > 15000) {
    document.getElementById('header-time').textContent = timeStr;
    document.getElementById('header-date').textContent = dateStr;
  }
}

// ═══════════════════════════════════════════════════
//  INITIALIZE APP
// ═══════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {
  console.log('🌦️ AWS Bibitan DLJ1 Dashboard Starting...');
  
  // Initialize chart
  initChart();
  
  // Load historical data
  loadHistoryData();
  
  // Start real-time listener
  startRealtimeListener();
  
  // Start local clock
  updateLocalClock();
  setInterval(updateLocalClock, 1000);
  
  // Check for stale data
  setInterval(checkStaleData, 5000);
  
  // Monitor Firebase connection
  database.ref('.info/connected').on('value', (snap) => {
    if (snap.val() === true) {
      console.log('[Firebase] Connected to server');
      setConnectionStatus(true);
    } else {
      console.log('[Firebase] Disconnected from server');
      setConnectionStatus(false);
    }
  });
  
  console.log('✅ Dashboard initialized');
});
