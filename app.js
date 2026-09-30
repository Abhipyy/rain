// ═══════════════════════════════════════════════════════════
// TRADITIONAL RAIN PREDICTION VERIFIER
// ═══════════════════════════════════════════════════════════

const METHOD_DEFS = {
  ant: {
    name: 'Ant Relocation',
    emoji: '🐜',
    condition: 'Pressure drops >2 hPa in 6 hrs AND RH >80% (both at same hour)',
    explain: 'Pressure drop = (pressure 6 hrs ago) − (current pressure). Positive = falling pressure.',
    check: (i, data) => {
      if (i < 6) return null;
      const pDrop = data.pressure[i - 6] - data.pressure[i];
      if (pDrop > 2.0 && data.rh[i] > 80) {
        return { pressure_6h_ago: data.pressure[i-6], pressure_now: data.pressure[i], pressure_drop: pDrop, rh_now: data.rh[i] };
      }
      return null;
    }
  },
  frog: {
    name: 'Frog Choruses', emoji: '🐸',
    condition: 'RH >85% AND Pressure <1000 hPa (both at same hour)',
    explain: 'Frogs need both high humidity for skin breathing and low pressure to emerge.',
    check: (i, data) => (data.rh[i] > 85 && data.pressure[i] < 1000)
      ? { rh_now: data.rh[i], pressure_now: data.pressure[i] } : null
  },
  sparrow: {
    name: 'Sparrow Dust-Bathing', emoji: '🐦',
    condition: 'RH >80%',
    explain: 'High humidity makes sparrow feathers heavy with oil.',
    check: (i, data) => data.rh[i] > 80 ? { rh_now: data.rh[i] } : null
  },
  chilli: {
    name: 'Chilli Softening', emoji: '🌶️',
    condition: 'RH >80%',
    explain: 'Dried chillies absorb moisture from humid air.',
    check: (i, data) => data.rh[i] > 80 ? { rh_now: data.rh[i] } : null
  },
  cricket: {
    name: 'Cricket Excavation', emoji: '🦗',
    condition: 'Soil moisture rises >0.005 m³/m³ in 24 hrs',
    explain: 'Rising soil moisture forces crickets to clear burrows.',
    check: (i, data) => {
      if (i < 24) return null;
      const change = data.soil[i] - data.soil[i - 24];
      return change > 0.005 ? { soil_then: data.soil[i-24], soil_now: data.soil[i], soil_change: change } : null;
    }
  },
  fish: {
    name: 'Fish Breaching', emoji: '🐟',
    condition: 'Pressure drops >2 hPa in 6 hrs AND Temp >30°C (both at same hour)',
    explain: 'Falling pressure + warm water = low dissolved oxygen.',
    check: (i, data) => {
      if (i < 6) return null;
      const pDrop = data.pressure[i - 6] - data.pressure[i];
      return (pDrop > 2.0 && data.temp[i] > 30)
        ? { pressure_6h_ago: data.pressure[i-6], pressure_now: data.pressure[i], pressure_drop: pDrop, temp_now: data.temp[i] }
        : null;
    }
  },
  amaltas: {
    name: 'Amaltas Bloom (GDD)', emoji: '🌼',
    condition: 'Cumulative GDD >800 (base 10°C) over 45 days',
    explain: 'Growing Degree Days = sum of daily (T_mean − 10°C). Needs ~45 days of warm weather.',
    check: null
  }
};

// ── MAP ──────────────────────────────────────────────────
const map = L.map('map').setView([20.5937, 78.9629], 5);
L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {
  attribution: 'Tiles © Esri', maxZoom: 19
}).addTo(map);

let selectedLat = null;
let selectedLon = null;
let marker = null;

map.on('click', function (e) {
  selectedLat = e.latlng.lat;
  selectedLon = e.latlng.lng;
  reverseGeocodeAndUpdate(selectedLat, selectedLon);
});

// ── REVERSE GEOCODE (safe innerHTML access) ──────────────
async function reverseGeocodeAndUpdate(lat, lon) {
  let placeLabel = null;
  try {
    const nomUrl = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=10&addressdetails=1`;
    const res = await fetch(nomUrl, { headers: { 'Accept': 'application/json' } });
    if (res.ok) {
      const data = await res.json();
      if (data && data.display_name) {
        const parts = data.display_name.split(',').map(p => p.trim());
        placeLabel = parts.slice(0, 2).join(', ');
      }
    }
  } catch (err) {
    console.warn('Reverse geocoding failed:', err);
  }
  updateMarker(lat, lon, placeLabel);
}

// ── UPDATE MARKER + ALL INPUT FIELDS ─────────────────────
function updateMarker(lat, lon, placeLabel) {
  if (marker) map.removeLayer(marker);
  marker = L.marker([lat, lon]).addTo(map);

  const popupText = placeLabel
    ? `<strong>${placeLabel}</strong><br>Lat: ${lat.toFixed(4)}, Lon: ${lon.toFixed(4)}`
    : `Lat: ${lat.toFixed(4)}, Lon: ${lon.toFixed(4)}`;
  marker.bindPopup(popupText).openPopup();

  // Fill coordinate fields
  document.getElementById('latInput').value = lat.toFixed(4);
  document.getElementById('lonInput').value = lon.toFixed(4);

  // Fill place name field
  if (placeLabel) {
    document.getElementById('placeName').value = placeLabel;
  }

  // Safe update of location info (element may not exist if results were replaced)
  const info = document.getElementById('locationInfo');
  if (info) {
    info.innerHTML = placeLabel
      ? `<strong>${placeLabel}</strong><br>Lat: <strong>${lat.toFixed(4)}</strong>, Lon: <strong>${lon.toFixed(4)}</strong>`
      : `Lat: <strong>${lat.toFixed(4)}</strong>, Lon: <strong>${lon.toFixed(4)}</strong>`;
  }

  document.getElementById('fetchBtn').disabled = false;
}

// ── PLACE NAME SEARCH ────────────────────────────────────
document.getElementById('searchBtn').addEventListener('click', async function () {
  const placeName = document.getElementById('placeName').value.trim();
  if (!placeName) { alert('Please enter a place name.'); return; }

  this.disabled = true;
  this.textContent = '...';

  try {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(placeName)}&count=1&language=en&format=json`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Geocoding error: ${response.status}`);

    const data = await response.json();
    if (!data.results || data.results.length === 0) {
      alert(`No results found for "${placeName}".`);
      this.disabled = false; this.textContent = '🔍'; return;
    }

    const r = data.results[0];
    selectedLat = r.latitude;
    selectedLon = r.longitude;

    map.setView([selectedLat, selectedLon], 10);
    updateMarker(selectedLat, selectedLon, `${r.name}, ${r.country || r.admin1 || ''}`);
  } catch (err) {
    alert(`Search failed: ${err.message}`);
  }

  this.disabled = false;
  this.textContent = '🔍';
});

document.getElementById('placeName').addEventListener('keypress', function (e) {
  if (e.key === 'Enter') document.getElementById('searchBtn').click();
});

// ── COORDINATE INPUT ─────────────────────────────────────
document.getElementById('coordBtn').addEventListener('click', function () {
  const lat = parseFloat(document.getElementById('latInput').value);
  const lon = parseFloat(document.getElementById('lonInput').value);
  if (isNaN(lat) || isNaN(lon)) { alert('Please enter valid latitude and longitude.'); return; }
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    alert('Latitude must be -90 to 90, Longitude -180 to 180.'); return;
  }
  selectedLat = lat;
  selectedLon = lon;
  map.setView([lat, lon], 10);
  reverseGeocodeAndUpdate(lat, lon);
});

// ── FETCH & ANALYZE ──────────────────────────────────────
document.getElementById('fetchBtn').addEventListener('click', async function () {
  const rainDate = document.getElementById('rainDate').value;
  const lookback = parseInt(document.getElementById('lookback').value);

  if (!rainDate) { alert('Please select a rain event date.'); return; }
  if (selectedLat === null || selectedLon === null) {
    alert('Please click on the map, search a place, or enter coordinates.'); return;
  }

  this.disabled = true;
  this.textContent = 'Fetching...';

  const results = document.getElementById('results');
  results.innerHTML = `
    <div class="card">
      <div class="loading">
        <div class="spinner"></div>
        <p>Fetching historical weather data...</p>
      </div>
    </div>
  `;

  try {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    let endDate = new Date(rainDate);
    if (endDate > today) endDate = new Date(today);
    let startDate = new Date(endDate.getTime() - lookback * 60 * 60 * 1000);
    if (startDate < new Date('1940-01-01')) startDate = new Date('1940-01-01');
    let checkEndDate = new Date(endDate.getTime() + 24 * 60 * 60 * 1000);
    if (checkEndDate > today) checkEndDate = new Date(today);

    const startStr = startDate.toISOString().split('T')[0];
    const endStr = checkEndDate.toISOString().split('T')[0];

    const url = `https://archive-api.open-meteo.com/v1/archive?` +
      `latitude=${selectedLat}&longitude=${selectedLon}` +
      `&start_date=${startStr}&end_date=${endStr}` +
      `&hourly=temperature_2m,relative_humidity_2m,pressure_msl,cloud_cover_high,precipitation` +
      `&daily=soil_moisture_0_to_7cm_mean&timezone=auto`;

    const response = await fetch(url);
    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.reason || `Weather API error: ${response.status}`);
    }

    const data = await response.json();
    if (!data.hourly || !data.hourly.time || data.hourly.time.length === 0) {
      throw new Error('No data returned for this location and date.');
    }

    const times = data.hourly.time.map(t => new Date(t));
    const temp = data.hourly.temperature_2m;
    const rh = data.hourly.relative_humidity_2m;
    const pressure = data.hourly.pressure_msl;
    const cloudHigh = data.hourly.cloud_cover_high;
    const precipitation = data.hourly.precipitation;

    const dailySoil = (data.daily && data.daily.soil_moisture_0_to_7cm_mean) || [];
    const soilMoisture = [];
    for (let d = 0; d < dailySoil.length; d++) {
      for (let h = 0; h < 24; h++) soilMoisture.push(dailySoil[d]);
    }
    const soilMoistureHourly = soilMoisture.slice(0, times.length);

    // Auto-detect last rain event in window
    let rainEventTime = null;
    for (let i = times.length - 1; i >= 0; i--) {
      if (precipitation[i] > 0) { rainEventTime = times[i]; break; }
    }
    if (!rainEventTime) rainEventTime = new Date(rainDate);

    const dataPack = { times, temp, rh, pressure, cloud: cloudHigh, precip: precipitation, soil: soilMoistureHourly };

    // 45-day GDD
    let gddTotal = 0;
    try {
      const gddStartDate = new Date(endDate.getTime() - 45 * 24 * 60 * 60 * 1000);
      if (gddStartDate < new Date('1940-01-01')) gddStartDate.setTime(new Date('1940-01-01').getTime());
      const gddStartStr = gddStartDate.toISOString().split('T')[0];
      const gddUrl = `https://archive-api.open-meteo.com/v1/archive?` +
        `latitude=${selectedLat}&longitude=${selectedLon}` +
        `&start_date=${gddStartStr}&end_date=${endStr}&daily=temperature_2m_mean&timezone=auto`;
      const gddRes = await fetch(gddUrl);
      if (gddRes.ok) {
        const gddData = await gddRes.json();
        const dailyTemps = (gddData.daily && gddData.daily.temperature_2m_mean) || [];
        for (const t of dailyTemps) if (t > 10) gddTotal += (t - 10);
      }
    } catch (err) { console.warn('GDD fetch failed:', err); }

    const { signals, allTriggerHours } = detectSignals(dataPack, rainEventTime, gddTotal);

    const triggerHour = {};
    for (const [key, indices] of Object.entries(allTriggerHours)) {
      const emoji = METHOD_DEFS[key]?.emoji || '❓';
      for (const idx of indices) {
        if (!triggerHour[idx]) triggerHour[idx] = [];
        if (!triggerHour[idx].includes(emoji)) triggerHour[idx].push(emoji);
      }
    }

    renderResults(signals, dataPack, rainEventTime, selectedLat, selectedLon, startStr, endStr, triggerHour, gddTotal);
  } catch (err) {
    results.innerHTML = `
      <div class="card">
        <div class="error">
          <strong>Error:</strong> ${err.message}
          <br><br>
          <small>Try a different location or date. The Open-Meteo archive covers 1940–present.</small>
        </div>
      </div>
    `;
  }

  this.disabled = false;
  this.textContent = 'Fetch & Analyze';
});

// ── SIGNAL DETECTION ─────────────────────────────────────
function detectSignals(data, rainEventTime, gddTotal = 0) {
  const signals = {};
  const allTriggerHours = {};

  for (const key of Object.keys(METHOD_DEFS)) {
    signals[key] = {
      name: METHOD_DEFS[key].name, condition: METHOD_DEFS[key].condition,
      explain: METHOD_DEFS[key].explain, active: false, triggerTime: null,
      leadHours: null, triggerIdx: null, details: null, reason: ''
    };
    allTriggerHours[key] = [];
  }

  let rainIdx = -1;
  for (let i = 0; i < data.times.length; i++) {
    if (data.times[i].getTime() >= rainEventTime.getTime()) { rainIdx = i; break; }
  }
  if (rainIdx === -1) rainIdx = data.times.length - 1;

  for (let i = 1; i < rainIdx; i++) {
    const hrsBefore = (rainEventTime.getTime() - data.times[i].getTime()) / (1000 * 60 * 60);
    for (const key of Object.keys(METHOD_DEFS)) {
      const def = METHOD_DEFS[key];
      if (!def.check) continue;
      const result = def.check(i, data);
      if (result) {
        allTriggerHours[key].push(i);
        if (!signals[key].active) {
          signals[key].active = true;
          signals[key].triggerTime = data.times[i];
          signals[key].leadHours = hrsBefore;
          signals[key].triggerIdx = i;
          signals[key].details = result;
        }
      }
    }
  }

  if (gddTotal > 800) {
    signals.amaltas.active = true;
    signals.amaltas.triggerTime = data.times[0];
    signals.amaltas.leadHours = (rainEventTime.getTime() - data.times[0].getTime()) / (1000 * 60 * 60);
    signals.amaltas.triggerIdx = 0;
    signals.amaltas.details = { gdd_total: gddTotal };
    allTriggerHours.amaltas.push(0);
  }

  // Reasons for inactive signals
  for (const key of Object.keys(signals)) {
    const s = signals[key];
    if (s.active) continue;

    switch (key) {
      case 'ant': {
        let bestDrop = 0, bestDropRH = 0, maxRHVal = 0, maxRHDrop = 0;
        for (let i = 6; i < rainIdx; i++) {
          const pDrop = data.pressure[i - 6] - data.pressure[i];
          if (pDrop > bestDrop) { bestDrop = pDrop; bestDropRH = data.rh[i]; }
          if (data.rh[i] > maxRHVal) { maxRHVal = data.rh[i]; maxRHDrop = pDrop; }
        }
        s.reason = `No hour had BOTH conditions. Best pressure drop: ${bestDrop.toFixed(2)} hPa (RH was ${bestDropRH.toFixed(0)}%). Best RH: ${maxRHVal.toFixed(0)}% (drop was ${maxRHDrop.toFixed(2)} hPa).`;
        break;
      }
      case 'frog': {
        let bestRH = 0, bestRHP = 0, lowestP = Infinity, lowRH = 0;
        for (let i = 1; i < rainIdx; i++) {
          if (data.rh[i] > bestRH) { bestRH = data.rh[i]; bestRHP = data.pressure[i]; }
          if (data.pressure[i] < lowestP) { lowestP = data.pressure[i]; lowRH = data.rh[i]; }
        }
        s.reason = `Needs RH >85% AND P <1000 hPa together. Best RH: ${bestRH.toFixed(0)}% (P=${bestRHP.toFixed(1)}). Lowest P: ${lowestP.toFixed(1)} hPa (RH=${lowRH.toFixed(0)}%).`;
        break;
      }
      case 'sparrow':
      case 'chilli': {
        let bestRH = 0;
        for (let i = 1; i < rainIdx; i++) if (data.rh[i] > bestRH) bestRH = data.rh[i];
        s.reason = `Max RH in window was ${bestRH.toFixed(0)}% (need >80).`;
        break;
      }
      case 'cricket': {
        let bestChange = -Infinity;
        for (let i = 24; i < rainIdx; i++) {
          const c = data.soil[i] - data.soil[i - 24];
          if (c > bestChange) bestChange = c;
        }
        s.reason = `Max soil change in 24 hrs was ${bestChange.toFixed(4)} m³/m³ (need >0.005).`;
        break;
      }
      case 'fish': {
        let bestDrop = 0, bestDropT = 0, maxT = 0, maxTDrop = 0;
        for (let i = 6; i < rainIdx; i++) {
          const pDrop = data.pressure[i - 6] - data.pressure[i];
          if (pDrop > bestDrop) { bestDrop = pDrop; bestDropT = data.temp[i]; }
          if (data.temp[i] > maxT) { maxT = data.temp[i]; maxTDrop = pDrop; }
        }
        s.reason = `No hour had BOTH conditions. Best drop: ${bestDrop.toFixed(2)} hPa (temp ${bestDropT.toFixed(1)}°C). Max temp: ${maxT.toFixed(1)}°C (drop ${maxTDrop.toFixed(2)} hPa).`;
        break;
      }
      case 'amaltas':
        s.reason = `Cumulative GDD over 45 days was ${gddTotal.toFixed(0)} (need >800).`;
        break;
    }
  }

  return { signals, allTriggerHours };
}

function buildZoomEarthLink(lat, lon, dateStr, layer = 'radar') {
  const date = new Date(dateStr);
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `https://zoom.earth/maps/${layer}/#view=${lat.toFixed(4)},${lon.toFixed(4)},8z/date=${yyyy}-${mm}-${dd},00:00,+5.5`;
}

// ── RENDER RESULTS ───────────────────────────────────────
function renderResults(signals, data, rainEventTime, lat, lon, startStr, endStr, triggerHour = {}, gddTotal = 0) {
  const { times, temp, rh, pressure, cloud, precip, soil } = data;
  const activeCount = Object.values(signals).filter(s => s.active).length;
  const total = Object.values(signals).length;

  const apiLink = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${startStr}&end_date=${endStr}&hourly=temperature_2m,relative_humidity_2m,pressure_msl,cloud_cover_high,precipitation&daily=soil_moisture_0_to_7cm_mean&timezone=auto`;
  const radarLink = buildZoomEarthLink(lat, lon, startStr, 'radar');
  const satLink = buildZoomEarthLink(lat, lon, startStr, 'satellite');

  const rainEvents = [];
  for (let i = 0; i < times.length; i++) {
    if (precip[i] > 0) rainEvents.push({ time: times[i], amount: precip[i] });
  }

  let html = `
    <div class="card">
      <h2>📍 Location <span class="badge">${lat.toFixed(3)}, ${lon.toFixed(3)}</span></h2>
      <p class="muted">Rain event (auto-detected): <strong>${rainEventTime.toLocaleString('en-IN')}</strong></p>
      <p class="muted">Lookback window: <strong>${startStr} → ${endStr}</strong></p>
      <p class="muted">GDD (45 days): <strong>${gddTotal.toFixed(0)}</strong> ${gddTotal > 800 ? '✅' : '(need >800)'}</p>
      <p class="muted" style="margin-top:0.5rem; font-size:0.72rem;">
        <a href="${apiLink}" target="_blank" style="color:#38bdf8;">🔗 Open raw JSON on Open-Meteo →</a>
      </p>
      <div class="sim-buttons">
        <a class="sim-link" href="${radarLink}" target="_blank">🛰️ Radar Simulation</a>
        <a class="sim-link" href="${satLink}" target="_blank">☁️ Satellite Simulation</a>
      </div>
    </div>

    <div class="card">
      <h2>🌧️ Rain Events <span class="badge">${rainEvents.length} events</span></h2>
      ${rainEvents.length === 0
        ? '<p class="muted">No rain recorded in this window.</p>'
        : `<div class="rain-events">${
            rainEvents.map(r => `
              <div class="rain-event-row">
                <span class="time">${r.time.toLocaleString('en-IN', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit', hour12:false })}</span>
                <span class="amount">${r.amount.toFixed(2)} mm</span>
              </div>
            `).join('')
          }</div>`
      }
    </div>

    <div class="card">
      <h2>🔍 Signal Detection <span class="badge">${activeCount}/${total} active</span></h2>
      <div class="explain-box">
        <strong>Rain event</strong> is auto-detected as the <em>last</em> hour with precipitation in the window. Lead times measured backward from that hour.
      </div>
      <div class="signal-grid">
  `;

  for (const [key, sig] of Object.entries(signals)) {
    const cls = sig.active ? 'active' : 'inactive';
    const statusText = sig.active ? '✅ Triggered' : '❌ Not triggered';
    const timeText = sig.active && sig.triggerTime ? `⏱ First at ${sig.leadHours.toFixed(1)} hrs before rain` : '';
    const reasonText = !sig.active && sig.reason ? `💡 ${sig.reason}` : '';
    const emoji = METHOD_DEFS[key]?.emoji || '❓';

    let detailHtml = '';
    if (sig.active && sig.details) {
      const d = sig.details;
      if (d.pressure_drop !== undefined) {
        detailHtml = `<div class="trigger-detail">P: ${d.pressure_6h_ago?.toFixed(1)} → ${d.pressure_now?.toFixed(1)} hPa (drop ${d.pressure_drop.toFixed(2)})<br>RH: ${d.rh_now}%${d.temp_now !== undefined ? ` · Temp: ${d.temp_now}°C` : ''}</div>`;
      } else if (d.rh_now !== undefined) {
        detailHtml = `<div class="trigger-detail">RH: ${d.rh_now}%${d.pressure_now !== undefined ? ` · Pressure: ${d.pressure_now} hPa` : ''}</div>`;
      } else if (d.soil_change !== undefined) {
        detailHtml = `<div class="trigger-detail">Soil: ${d.soil_then?.toFixed(3)} → ${d.soil_now?.toFixed(3)} m³/m³ (change ${d.soil_change.toFixed(4)})</div>`;
      } else if (d.gdd_total !== undefined) {
        detailHtml = `<div class="trigger-detail">GDD: ${d.gdd_total.toFixed(0)}</div>`;
      }
    }

    html += `
      <div class="signal-item ${cls}">
        <div class="name">${emoji} ${sig.name}</div>
        <div class="status">${statusText} ${timeText}</div>
        <div class="condition"><strong>Condition:</strong> ${sig.condition}</div>
        <div class="condition" style="border-top:none; padding-top:0; color:#67e8f9;"><strong>Why:</strong> ${sig.explain}</div>
        ${detailHtml}
        ${reasonText ? `<div class="reason">${reasonText}</div>` : ''}
      </div>
    `;
  }

  html += `
      </div>
    </div>

    <div class="card">
      <h2>📊 Pressure & Humidity</h2>
      <div class="chart-container"><canvas id="pressureChart"></canvas></div>
      <div class="legend">
        <span><span class="swatch" style="background:#38bdf8;"></span> Pressure (hPa)</span>
        <span><span class="swatch" style="background:#f97316;"></span> Humidity (%)</span>
      </div>
    </div>

    <div class="card">
      <h2>🌱 Soil Moisture & Temperature</h2>
      <div class="chart-container"><canvas id="soilChart"></canvas></div>
      <div class="legend">
        <span><span class="swatch" style="background:#a855f7;"></span> Soil Moisture (m³/m³)</span>
        <span><span class="swatch" style="background:#ef4444;"></span> Temperature (°C)</span>
      </div>
    </div>

    <div class="card">
      <h2>☁️ High Cloud Cover & Precipitation</h2>
      <div class="chart-container"><canvas id="cloudChart"></canvas></div>
      <div class="legend">
        <span><span class="swatch" style="background:#64748b;"></span> High Cloud (%)</span>
        <span><span class="swatch" style="background:#06b6d4;"></span> Precipitation (mm)</span>
      </div>
    </div>

    <div class="card">
      <h2>📋 Hourly Data Table <span class="badge">${times.length} rows</span></h2>
      <div class="explain-box">
        <strong>Emojis shown ONLY at the exact hour the condition was true.</strong><br>
        🐜 Ant · 🐸 Frog · 🐦 Sparrow · 🌶️ Chilli · 🦗 Cricket · 🐟 Fish · 🌼 Amaltas<br>
        🟩 Green = method triggered · 🟦 Blue = rain
      </div>
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>Date & Time</th><th>Temp</th><th>RH%</th><th>Pressure</th>
              <th>Cloud%</th><th>Rain mm</th><th>Soil</th><th>Signals</th>
            </tr>
          </thead>
          <tbody>
  `;

  for (let i = 0; i < times.length; i++) {
    const isRain = precip[i] > 0;
    const emojis = triggerHour[i] || [];
    let rowClass = '';
    if (isRain) rowClass = 'rain-row';
    else if (emojis.length > 0) rowClass = 'signal-row';

    const localTime = times[i].toLocaleString('en-IN', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit', hour12:false });
    const emojiDisplay = emojis.map(e => `<span class="trigger-emoji">${e}</span>`).join(' ');

    html += `
      <tr class="${rowClass}">
        <td>${localTime}</td>
        <td>${temp[i]?.toFixed(1) ?? '—'}</td>
        <td>${rh[i]?.toFixed(0) ?? '—'}</td>
        <td>${pressure[i]?.toFixed(1) ?? '—'}</td>
        <td>${cloud[i]?.toFixed(0) ?? '—'}</td>
        <td>${precip[i]?.toFixed(2) ?? '—'}</td>
        <td>${soil[i]?.toFixed(3) ?? '—'}</td>
        <td class="emoji-cell">${emojiDisplay}</td>
      </tr>
    `;
  }

  html += `</tbody></table></div></div>`;
  document.getElementById('results').innerHTML = html;

  const commonXScale = {
    type: 'time',
    time: { unit: 'hour', displayFormats: { hour: 'dd MMM HH:mm', day: 'dd MMM' }, tooltipFormat: 'dd MMM yyyy HH:mm' },
    ticks: { color: '#94a3b8', maxRotation: 45, minRotation: 45, autoSkip: true, maxTicksLimit: 12, font: { size: 10 } },
    grid: { color: '#1e293b' }
  };

  new Chart(document.getElementById('pressureChart').getContext('2d'), {
    type: 'line',
    data: {
      labels: times,
      datasets: [
        { label: 'Pressure (hPa)', data: pressure, borderColor: '#38bdf8', backgroundColor: 'rgba(56,189,248,0.1)', borderWidth: 2, pointRadius: 0, tension: 0.3, yAxisID: 'y' },
        { label: 'Humidity (%)', data: rh, borderColor: '#f97316', backgroundColor: 'rgba(249,115,22,0.1)', borderWidth: 2, pointRadius: 0, tension: 0.3, yAxisID: 'y1' }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: { display: false }, tooltip: { callbacks: { title: items => new Date(items[0].label).toLocaleString('en-IN') } } },
      scales: {
        x: commonXScale,
        y: { position: 'left', title: { display: true, text: 'Pressure (hPa)', color: '#38bdf8', font: { size: 10 } }, ticks: { color: '#64748b', font: { size: 10 } }, grid: { color: '#1e293b' } },
        y1: { position: 'right', title: { display: true, text: 'Humidity (%)', color: '#f97316', font: { size: 10 } }, ticks: { color: '#64748b', font: { size: 10 } }, grid: { drawOnChartArea: false }, min: 0, max: 100 }
      }
    }
  });

  new Chart(document.getElementById('soilChart').getContext('2d'), {
    type: 'line',
    data: {
      labels: times,
      datasets: [
        { label: 'Soil Moisture (m³/m³)', data: soil, borderColor: '#a855f7', backgroundColor: 'rgba(168,85,247,0.1)', borderWidth: 2, pointRadius: 0, tension: 0.3, yAxisID: 'y' },
        { label: 'Temperature (°C)', data: temp, borderColor: '#ef4444', backgroundColor: 'rgba(239,68,68,0.1)', borderWidth: 2, pointRadius: 0, tension: 0.3, yAxisID: 'y1' }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: { display: false }, tooltip: { callbacks: { title: items => new Date(items[0].label).toLocaleString('en-IN') } } },
      scales: {
        x: commonXScale,
        y: { position: 'left', title: { display: true, text: 'Soil Moisture (m³/m³)', color: '#a855f7', font: { size: 10 } }, ticks: { color: '#64748b', font: { size: 10 } }, grid: { color: '#1e293b' } },
        y1: { position: 'right', title: { display: true, text: 'Temperature (°C)', color: '#ef4444', font: { size: 10 } }, ticks: { color: '#64748b', font: { size: 10 } }, grid: { drawOnChartArea: false } }
      }
    }
  });

  new Chart(document.getElementById('cloudChart').getContext('2d'), {
    type: 'bar',
    data: {
      labels: times,
      datasets: [
        { label: 'High Cloud (%)', data: cloud, backgroundColor: 'rgba(100,116,139,0.5)', borderColor: '#64748b', borderWidth: 1, yAxisID: 'y' },
        { type: 'line', label: 'Precipitation (mm)', data: precip, borderColor: '#06b6d4', backgroundColor: 'rgba(6,182,212,0.2)', borderWidth: 2, pointRadius: 2, fill: true, tension: 0.3, yAxisID: 'y1' }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: { display: false }, tooltip: { callbacks: { title: items => new Date(items[0].label).toLocaleString('en-IN') } } },
      scales: {
        x: commonXScale,
        y: { position: 'left', title: { display: true, text: 'Cloud Cover (%)', color: '#64748b', font: { size: 10 } }, ticks: { color: '#64748b', font: { size: 10 } }, grid: { color: '#1e293b' }, min: 0, max: 100 },
        y1: { position: 'right', title: { display: true, text: 'Precipitation (mm)', color: '#06b6d4', font: { size: 10 } }, ticks: { color: '#64748b', font: { size: 10 } }, grid: { drawOnChartArea: false }, beginAtZero: true }
      }
    }
  });
}