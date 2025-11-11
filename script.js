// Get DOM elements
const fileInput = document.getElementById('fileInput');
const canvas = document.getElementById('imageCanvas');
const overlay = document.getElementById('overlay');
const info = document.getElementById('info');
const ctx = canvas.getContext('2d');
const ovCtx = overlay.getContext('2d');

// State variables
let imgData = null;             // Image pixel buffer
let dragging = false;           // Is the user currently dragging a selection?
let startX = 0, startY = 0;     // Drag start (canvas pixels)
let curX = 0, curY = 0;         // Current mouse (canvas pixels) during drag
let rectFinal = null;           // Finalized rectangle {x1,y1,x2,y2}
let currentFileName = '';       // Name of the loaded file

// Map mouse event coordinates (client) to canvas pixel coordinates, accounting for CSS scaling
function getMousePosOnCanvas(e) {
  const rect = canvas.getBoundingClientRect();
  const cssX = e.clientX - rect.left;
  const cssY = e.clientY - rect.top;
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const x = Math.floor(cssX * scaleX);
  const y = Math.floor(cssY * scaleY);
  return {
    x: Math.max(0, Math.min(x, canvas.width - 1)),
    y: Math.max(0, Math.min(y, canvas.height - 1))
  };
}

// Handle image file selection and load into canvas
fileInput.addEventListener('change', e => {
  const f = e.target.files && e.target.files[0];
  if (!f) return;
  const img = new Image();
  img.onload = () => {
    // Set canvas buffers to image resolution
    canvas.width = img.width;
    canvas.height = img.height;
    overlay.width = img.width;
    overlay.height = img.height;
    // Draw image into the canvas buffer
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    // Read pixel data for analysis (may throw if cross-origin)
    try {
      imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    } catch (err) {
      console.error('getImageData error:', err);
      imgData = null;
    }
    // Clear overlay, reset selection state, update UI
    ovCtx.clearRect(0, 0, overlay.width, overlay.height);
    rectFinal = null;
    info.textContent = 'Image loaded. Move mouse or drag to select area.';
    currentFileName = f.name;
  };
  img.onerror = () => {
    info.textContent = 'Failed to load image.';
  };
  img.src = URL.createObjectURL(f);
});

// Draw selection rectangle on overlay canvas
function drawOverlayRect(xa, ya, xb, yb, dashed = false, keepFill = true) {
  ovCtx.clearRect(0, 0, overlay.width, overlay.height);
  const x = Math.min(xa, xb), y = Math.min(ya, yb);
  const w = Math.abs(xb - xa), h = Math.abs(yb - ya);
  if (w === 0 || h === 0) return;
  ovCtx.lineWidth = 2;
  ovCtx.setLineDash(dashed ? [6, 4] : []);
  ovCtx.strokeStyle = dashed ? 'white' : 'white';
  if (keepFill) {
    ovCtx.fillStyle = 'rgba(0,255,0,0.2)'; // translucent fill for selection
    ovCtx.fillRect(x, y, w, h);
  }
  ovCtx.strokeRect(x, y, w, h); // outline
}

// Mouse move: update live RGB readout and dynamic rectangle while dragging
canvas.addEventListener('mousemove', (e) => {
  const { x: mx, y: my } = getMousePosOnCanvas(e);
  if (dragging) {
    // Update current drag coordinates and redraw overlay
    curX = Math.max(0, Math.min(mx, canvas.width - 1));
    curY = Math.max(0, Math.min(my, canvas.height - 1));
    drawOverlayRect(startX, startY, curX, curY, true, true);
  }
  if (!imgData) {
    info.textContent = 'No image data yet.';
    return;
  }
  if (mx < 0 || my < 0 || mx >= canvas.width || my >= canvas.height) {
    info.textContent = `x: -, y: - | R: -, G: -, B: -`;
    return;
  }
  // Read RGB at mouse position and update info label
  const idx = (my * canvas.width + mx) * 4;
  const d = imgData.data;
  const R = d[idx], G = d[idx + 1], B = d[idx + 2];
  info.textContent = `x: ${mx}, y: ${my} | R: ${R}, G: ${G}, B: ${B}`;
});

// Mouse down: start a new rectangle selection
canvas.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return; // only left-click
  const pos = getMousePosOnCanvas(e);
  startX = pos.x;
  startY = pos.y;
  startX = Math.max(0, Math.min(startX, canvas.width - 1));
  startY = Math.max(0, Math.min(startY, canvas.height - 1));
  dragging = true;
  rectFinal = null;
  ovCtx.clearRect(0, 0, overlay.width, overlay.height);
});

// Mouse up: finalize rectangle, compute stats and update chart
canvas.addEventListener('mouseup', (e) => {
  if (!dragging) return;
  dragging = false;
  const pos = getMousePosOnCanvas(e);
  curX = pos.x;
  curY = pos.y;
  curX = Math.max(0, Math.min(curX, canvas.width - 1));
  curY = Math.max(0, Math.min(curY, canvas.height - 1));
  const x1 = Math.min(startX, curX);
  const x2 = Math.max(startX, curX);
  const y1 = Math.min(startY, curY);
  const y2 = Math.max(startY, curY);
  rectFinal = { x1, y1, x2, y2 };
  computeAndPlotRect(rectFinal);              // update chart based on selection
  drawOverlayRect(x1, y1, x2, y2, false, true);
  console.log('Rectangle finalized:', rectFinal);
  info.textContent = `Selected rect: x1=${x1}, y1=${y1}, x2=${x2}, y2=${y2}`;
});

// Mouse leave: if dragging, finalize selection with last known coords; otherwise reset info
canvas.addEventListener('mouseleave', (e) => {
  if (dragging) {
    dragging = false;
    if (typeof curX === 'number' && typeof curY === 'number') {
      const x1 = Math.min(startX, curX);
      const x2 = Math.max(startX, curX);
      const y1 = Math.min(startY, curY);
      const y2 = Math.max(startY, curY);
      rectFinal = { x1, y1, x2, y2 };
      drawOverlayRect(x1, y1, x2, y2, false, true);
      info.textContent = `Selected rect: x1=${x1}, y1=${y1}, x2=${x2}, y2=${y2}`;
      console.log('Rectangle finalized on leave:', rectFinal);
    } else {
      ovCtx.clearRect(0, 0, overlay.width, overlay.height);
    }
  } else {
    info.textContent = 'x: -, y: - | R: -, G: -, B: -';
  }
});

// Return array of pixel objects inside given rectangle
function getPixelsInRect(r) {
  if (!r || !imgData) return [];
  const w = canvas.width;
  const out = [];
  for (let yy = r.y1; yy <= r.y2; yy++) {
    for (let xx = r.x1; xx <= r.x2; xx++) {
      const idx = (yy * w + xx) * 4;
      out.push({ x: xx, y: yy, R: imgData.data[idx], G: imgData.data[idx + 1], B: imgData.data[idx + 2] });
    }
  }
  return out;
}

let chart = null;

// Initialize Chart.js line chart to show RGB histograms (0-255)
function initChart() {
  const canvasEl = document.getElementById('lineChart');
  if (!canvasEl) return;
  const ctx = canvasEl.getContext('2d');
  const labels = Array.from({length:256}, (_, i) => i);
  if (chart) chart.destroy();
  chart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [
        { label: 'Red', data: new Array(256).fill(0), borderWidth: 1, borderColor: 'rgba(255,0,0,0.9)', fill: false, hidden: false },
        { label: 'Green', data: new Array(256).fill(0), borderWidth: 1, borderColor: 'rgba(0,160,0,0.9)', fill: false, hidden: false },
        { label: 'Blue', data: new Array(256).fill(0), borderWidth: 1, borderColor: 'rgba(0,0,255,0.9)', fill: false, hidden: false }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { title: { display: true, text: 'Color value (0–255)' } },
        y: { title: { display: true, text: 'Pixel count' }, beginAtZero: true }
      },
      plugins: { legend: { display: true } },
      interaction: { mode: 'nearest', axis: 'x', intersect: false }
    }
  });
}
initChart();

// Compute histograms for selected rect and update chart
function computeAndPlotRect(r) {
  if (!r || !imgData || !chart) return;
  const w = canvas.width;
  const cntR = new Array(256).fill(0);
  const cntG = new Array(256).fill(0);
  const cntB = new Array(256).fill(0);

  for (let yy = r.y1; yy <= r.y2; yy++) {
    for (let xx = r.x1; xx <= r.x2; xx++) {
      const idx = (yy * w + xx) * 4;
      const d = imgData.data;
      cntR[d[idx]]++;
      cntG[d[idx + 1]]++;
      cntB[d[idx + 2]]++;
    }
  }

  // Update Chart.js datasets with new histogram data
  chart.data.datasets[0].data = cntR;
  chart.data.datasets[1].data = cntG;
  chart.data.datasets[2].data = cntB;

  const chkR = document.getElementById('chkR');
  const chkG = document.getElementById('chkG');
  const chkB = document.getElementById('chkB');
  if (chkR) chart.data.datasets[0].hidden = !chkR.checked;
  if (chkG) chart.data.datasets[1].hidden = !chkG.checked;
  if (chkB) chart.data.datasets[2].hidden = !chkB.checked;

  chart.update();
}

// Checkbox listeners to toggle dataset visibility
const cbR = document.getElementById('chkR');
const cbG = document.getElementById('chkG');
const cbB = document.getElementById('chkB');
if (cbR) cbR.addEventListener('change', (e) => { if (chart) { chart.data.datasets[0].hidden = !e.target.checked; chart.update(); }});
if (cbG) cbG.addEventListener('change', (e) => { if (chart) { chart.data.datasets[1].hidden = !e.target.checked; chart.update(); }});
if (cbB) cbB.addEventListener('change', (e) => { if (chart) { chart.data.datasets[2].hidden = !e.target.checked; chart.update(); }});

// Build pixel rows for database saving (one row per pixel in rect)
function getPixelsForSaving(r) {
  if (!r || !imgData) return [];
  const rows = [];
  const w = canvas.width;
  const d = imgData.data;
  const timestamp = new Date().toISOString().slice(0, 19).replace('T',' ');
  for (let yy = r.y1; yy <= r.y2; yy++) {
    for (let xx = r.x1; xx <= r.x2; xx++) {
      const idx = (yy * w + xx) * 4;
      rows.push({
        file_name: currentFileName || 'unknown',
        x: xx,
        y: yy,
        R: d[idx],
        G: d[idx + 1],
        B: d[idx + 2],
        T: timestamp
      });
    }
  }
  return rows;
}

// Save button: send selected pixels to server-side PHP for DB insertion
document.getElementById('saveBtn').addEventListener('click', async () => {
  const msgEl = document.getElementById('saveMsg');
  if (!rectFinal) {
    msgEl.style.color = 'red';
    msgEl.textContent = 'Draw a rectangle first.';
    setTimeout(()=>msgEl.textContent='',3000);
    return;
  }
  const rows = getPixelsForSaving(rectFinal);
  if (rows.length === 0) {
    msgEl.style.color = 'red';
    msgEl.textContent = 'No pixels found in selection.';
    setTimeout(()=>msgEl.textContent='',3000);
    return;
  }

  const MAX_ROWS = 20000;
  if (rows.length > MAX_ROWS) {
    if (!confirm(`Selection contains ${rows.length} pixels. This may be slow to save. Continue?`)) {
      return;
    }
  }

  msgEl.style.color = 'black';
  msgEl.textContent = 'Saving...';

  try {
    const res = await fetch('save_shape.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows })
    });
    const j = await res.json();
    if (j.success) {
      msgEl.style.color = 'green';
      msgEl.textContent = `Saved ${j.inserted} rows.`;
    } else {
      msgEl.style.color = 'red';
      msgEl.textContent = `Save failed: ${j.error || 'unknown'}`;
    }
  } catch (err) {
    msgEl.style.color = 'red';
    msgEl.textContent = `Network/error: ${err.message}`;
  } finally {
    setTimeout(()=>msgEl.textContent='',5000);
  }
});
