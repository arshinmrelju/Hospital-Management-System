/* =========================================
   DASHBOARD.JS (Admin Dashboard)
   Executive Cockpit Portal Logic
   ========================================= */

'use strict';

/* --- Chart.js CDN Loader --- */
function loadChartJS(callback) {
  if (window.Chart) { callback(); return; }
  const s = document.createElement('script');
  s.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js';
  s.onload = callback;
  document.head.appendChild(s);
}

let adminAdmissionsChartInstance = null;
let adminStatusChartInstance = null;

/* --- Initialize Admin Charts --- */
function initAdminCharts(callback) {
  loadChartJS(() => {
    // Admissions Trend Chart
    const admCtx = document.getElementById('adminAdmissionsChart');
    if (admCtx) {
      adminAdmissionsChartInstance = new Chart(admCtx, {
        type: 'line',
        data: {
          labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
          datasets: [{
            label: 'Admissions',
            data: [0, 0, 0, 0, 0, 0, 0],
            borderColor: '#4338ca',
            backgroundColor: 'rgba(99,102,241,0.08)',
            borderWidth: 2.5,
            tension: 0.4,
            fill: true,
            pointBackgroundColor: '#4338ca',
            pointRadius: 4,
          }, {
            label: 'Discharges',
            data: [0, 0, 0, 0, 0, 0, 0],
            borderColor: '#10b981',
            backgroundColor: 'rgba(16,185,129,0.05)',
            borderWidth: 2,
            tension: 0.4,
            fill: true,
            pointBackgroundColor: '#10b981',
            pointRadius: 4,
          }]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { position: 'top', labels: { font: { family: 'Manrope', size: 11 }, usePointStyle: true } } },
          scales: {
            x: { grid: { color: 'rgba(100,116,139,0.08)' }, ticks: { font: { family: 'Manrope', size: 11 } } },
            y: { grid: { color: 'rgba(100,116,139,0.08)' }, ticks: { font: { family: 'Manrope', size: 11 } } }
          }
        }
      });
    }

    // Patient Status Donut Chart
    const donutCtx = document.getElementById('adminStatusChart');
    if (donutCtx) {
      adminStatusChartInstance = new Chart(donutCtx, {
        type: 'doughnut',
        data: {
          labels: ['In-Patient', 'Out-Patient', 'Discharged', 'Critical'],
          datasets: [{
            data: [0, 0, 0, 0],
            backgroundColor: ['#4338ca', '#10b981', '#64748b', '#ef4444'],
            borderWidth: 0,
            hoverOffset: 6
          }]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          cutout: '72%',
          plugins: {
            legend: {
              position: 'bottom',
              labels: { font: { family: 'Manrope', size: 10 }, usePointStyle: true, padding: 12 }
            }
          }
        }
      });
    }

    if (typeof callback === 'function') callback();
  });
}

/* --- Admin Filters --- */
function applyAdminFilter() {
  const startDate = document.getElementById('adminStartDate')?.value;
  const startTime = document.getElementById('adminStartTime')?.value || '00:00';
  const endDate = document.getElementById('adminEndDate')?.value;
  const endTime = document.getElementById('adminEndTime')?.value || '23:59';

  if (!startDate) {
    toast('Please select a start date to filter operations.', 'warning');
    return;
  }

  toast('Filter applied. Connect to Firestore to load real data for this range.', 'info', 'filter_alt');
}

function clearAdminFilter() {
  const startD = document.getElementById('adminStartDate');
  const startT = document.getElementById('adminStartTime');
  const endD = document.getElementById('adminEndDate');
  const endT = document.getElementById('adminEndTime');
  if (startD) startD.value = '';
  if (startT) startT.value = '';
  if (endD) endD.value = '';
  if (endT) endT.value = '';
  
  // Reset charts to default values
  if (adminAdmissionsChartInstance) {
    adminAdmissionsChartInstance.data.datasets[0].data = [0, 0, 0, 0, 0, 0, 0];
    adminAdmissionsChartInstance.data.datasets[1].data = [0, 0, 0, 0, 0, 0, 0];
    adminAdmissionsChartInstance.update();
  }

  if (adminStatusChartInstance) {
    adminStatusChartInstance.data.datasets[0].data = [0, 0, 0, 0];
    adminStatusChartInstance.update();
  }

  // Reset counters
  document.querySelectorAll('.stat-value').forEach(el => {
    const target = parseInt(el.getAttribute('data-target') || '0', 10);
    if (el.textContent.includes('₹')) {
      el.textContent = '₹' + target.toLocaleString('en-IN');
    } else {
      el.textContent = target;
    }
  });

  // Hide result badge
  const badge = document.getElementById('adminResultBadge');
  if (badge) badge.classList.remove('visible');

  toast('Global filter cleared. Showing all-time metrics.', 'info');
}

/* --- DOMContentLoaded --- */
document.addEventListener('DOMContentLoaded', () => {
  initAdminCharts(() => {
    const todayChip = document.querySelector(`#adminSmartFilter .sf-chip[onclick*="'today'"]`);
    if (todayChip) {
      sfChipSelect(todayChip, 'admin', 'today');
    }
  });
});
