const API = 'http://127.0.0.1:3000';

// ── Auth helpers ──────────────────────────────
function getToken() { return localStorage.getItem('token'); }
function getEmail() { return localStorage.getItem('email'); }
function saveAuth(token, email) {
  localStorage.setItem('token', token);
  localStorage.setItem('email', email);
}
function clearAuth() {
  localStorage.removeItem('token');
  localStorage.removeItem('email');
}

// ── On page load ──────────────────────────────
window.onload = function() {
  if (getToken()) {
    showApp();
  } else {
    showAuth();
  }
}

function showAuth() {
  document.getElementById('authPage').style.display = 'flex';
  document.getElementById('mainApp').style.display = 'none';
}

function showApp() {
  document.getElementById('authPage').style.display = 'none';
  document.getElementById('mainApp').style.display = 'block';
  document.getElementById('userEmail').textContent = getEmail();

  // Restore saved resume if exists
  const savedResume = localStorage.getItem('saved_resume');
  const savedName = localStorage.getItem('saved_resume_name');
  if (savedResume) {
    document.getElementById('resume').value = savedResume;
    document.getElementById('uploadBtn').style.display = 'none';
    document.getElementById('clearResumeBtn').style.display = 'inline-flex';
    if (savedName) {
      document.getElementById('uploadStatus').textContent = `✅ ${savedName} loaded`;
    }
  }

  loadHistory();
}
function switchTab(tab) {
  document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
  event.target.classList.add('active');
  document.getElementById('loginForm').style.display = tab === 'login' ? 'block' : 'none';
  document.getElementById('registerForm').style.display = tab === 'register' ? 'block' : 'none';
  hideAuthMessages();
}

function showError(msg) {
  const el = document.getElementById('authError');
  el.textContent = msg;
  el.style.display = 'block';
  document.getElementById('authSuccess').style.display = 'none';
}

function showSuccess(msg) {
  const el = document.getElementById('authSuccess');
  el.textContent = msg;
  el.style.display = 'block';
  document.getElementById('authError').style.display = 'none';
}

function hideAuthMessages() {
  document.getElementById('authError').style.display = 'none';
  document.getElementById('authSuccess').style.display = 'none';
}

// ── Register ──────────────────────────────────
async function register() {
  const email = document.getElementById('regEmail').value.trim();
  const password = document.getElementById('regPassword').value.trim();
  if (!email || !password) { showError('Please fill in all fields.'); return; }

  try {
    const res = await fetch(`${API}/api/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (!res.ok) { showError(data.detail); return; }
    showSuccess('Account created successfully! Please login now.');
    document.getElementById('regEmail').value = '';
    document.getElementById('regPassword').value = '';
    switchTabByName('login');
  } catch (err) {
    showError('Something went wrong. Make sure backend is running.');
  }
}

// ── Login ─────────────────────────────────────
async function login() {
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value.trim();
  if (!email || !password) { showError('Please fill in all fields.'); return; }

  try {
    const res = await fetch(`${API}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (!res.ok) { showError(data.detail); return; }
    saveAuth(data.token, data.email);
    showApp();
  } catch (err) {
    showError('Something went wrong. Make sure backend is running.');
  }
}

// ── Logout ────────────────────────────────────
function logout() {
  clearAuth();
  document.getElementById('results').style.display = 'none';
  document.getElementById('resume').value = '';
  document.getElementById('jd').value = '';
  showAuth();
}
// ── File Upload ───────────────────────────────
async function handleFileUpload() {
  const fileInput = document.getElementById('resumeFile');
  const file = fileInput.files[0];
  const status = document.getElementById('uploadStatus');

  if (!file) return;

  status.textContent = '⏳ Extracting text...';
  status.className = 'upload-status loading';

  const formData = new FormData();
  formData.append('file', file);

  try {
    const res = await fetch(`${API}/api/upload-resume`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${getToken()}` },
      body: formData
    });

    const data = await res.json();

    if (!res.ok) {
      status.textContent = '❌ ' + data.detail;
      status.className = 'upload-status error';
      return;
    }

    document.getElementById('resume').value = data.text;
    status.textContent = `✅ ${data.filename} loaded`;
    status.className = 'upload-status';

    // Save resume to localStorage so it stays after page refresh
    localStorage.setItem('saved_resume', data.text);
    localStorage.setItem('saved_resume_name', data.filename);

    // Show clear button, hide upload button
    document.getElementById('uploadBtn').style.display = 'none';
    document.getElementById('clearResumeBtn').style.display = 'inline-flex';

  } catch (err) {
    status.textContent = '❌ Upload failed. Make sure backend is running.';
    status.className = 'upload-status error';
    console.error(err);
  }
}

function clearResume() {
  document.getElementById('resume').value = '';
  document.getElementById('resumeFile').value = '';
  document.getElementById('uploadStatus').textContent = '';
  document.getElementById('uploadBtn').style.display = 'inline-flex';
  document.getElementById('clearResumeBtn').style.display = 'none';
  localStorage.removeItem('saved_resume');
  localStorage.removeItem('saved_resume_name');
}

function clearJD() {
  document.getElementById('jd').value = '';
}

function onResumeType() {
  const text = document.getElementById('resume').value;
  if (text) {
    localStorage.setItem('saved_resume', text);
    document.getElementById('clearResumeBtn').style.display = 'inline-flex';
    document.getElementById('uploadBtn').style.display = 'none';
  } else {
    clearResume();
  }
}
// ── Analyze ───────────────────────────────────
async function analyze() {
  const resume = document.getElementById('resume').value.trim();
  const jd = document.getElementById('jd').value.trim();
  if (!resume || !jd) { alert('Please paste both your resume and the job description.'); return; }

  const btn = document.getElementById('analyzeBtn');
  btn.disabled = true;
  document.getElementById('loading').style.display = 'block';
  document.getElementById('results').style.display = 'none';

  // Scroll to loading
  document.getElementById('loading').scrollIntoView({ behavior: 'smooth', block: 'center' });

  try {
    const res = await fetch(`${API}/api/analyze`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getToken()}`
      },
      body: JSON.stringify({ resume, jd })
    });

    if (res.status === 401) { logout(); return; }

    const data = await res.json();

    document.getElementById('scoreNum').textContent = data.score + '%';
    document.getElementById('verdict').textContent = data.verdict;
    document.getElementById('summary').textContent = data.summary;
    document.getElementById('tip').textContent = 'Tip: ' + data.top_tip;

    document.getElementById('categories').innerHTML = data.categories.map(c => `
      <div class="bar-row">
        <div class="bar-label"><span>${c.label}</span><span>${c.score}%</span></div>
        <div class="bar-bg"><div class="bar-fill" style="width:${c.score}%"></div></div>
      </div>
    `).join('');

    document.getElementById('matchedSkills').innerHTML =
      data.matched_skills.map(s => `<span class="tag match">${s}</span>`).join('');
    document.getElementById('missingSkills').innerHTML =
      data.missing_skills.map(s => `<span class="tag miss">${s}</span>`).join('');

    document.getElementById('results').style.display = 'block';

    // Scroll to results smoothly
    setTimeout(() => {
      document.getElementById('results').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);

    loadHistory();

  } catch (err) {
    alert('Something went wrong. Make sure backend is running on port 3000.');
    console.error(err);
  } finally {
    btn.disabled = false;
    document.getElementById('loading').style.display = 'none';
  }
}
// ── History ───────────────────────────────────
async function loadHistory() {
  try {
    const res = await fetch(`${API}/api/history`, {
      headers: { 'Authorization': `Bearer ${getToken()}` }
    });
    const data = await res.json();
    renderHistory(data.history);
  } catch (err) {
    console.error('Failed to load history:', err);
  }
}

function renderHistory(history) {
  const container = document.getElementById('historyList');
  if (!history || history.length === 0) {
    container.innerHTML = '<p class="no-history">No analyses yet. Analyze a resume to see history here!</p>';
    return;
  }

  container.innerHTML = history.map(item => `
    <div class="history-item" id="history-${item.id}">
      <div class="history-score">
        <span class="h-pct">${item.score}%</span>
        <span class="h-lbl">match</span>
      </div>
      <div class="history-content">
        <div class="history-verdict">${item.verdict}</div>
        <div class="history-summary">${item.summary}</div>
        <div class="history-tip">💡 ${item.top_tip}</div>
        <div class="history-date">🕐 ${new Date(item.created_at).toLocaleString()}</div>
      </div>
      <button class="delete-btn" onclick="deleteHistory(${item.id})">🗑️</button>
    </div>
  `).join('');
}

async function deleteHistory(id) {
  try {
    await fetch(`${API}/api/history/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${getToken()}` }
    });
    document.getElementById(`history-${id}`).remove();
  } catch (err) {
    console.error('Failed to delete:', err);
  }
}