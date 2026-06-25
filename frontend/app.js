async function analyze() {
  const resume = document.getElementById('resume').value.trim();
  const jd = document.getElementById('jd').value.trim();

  if (!resume || !jd) {
    alert('Please paste both your resume and the job description.');
    return;
  }

  document.getElementById('analyzeBtn').disabled = true;
  document.getElementById('loading').style.display = 'block';
  document.getElementById('results').style.display = 'none';

  try {
    const response = await fetch('http://localhost:3000/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resume, jd })
    });

    const data = await response.json();

    document.getElementById('scoreNum').textContent = data.score + '%';
    document.getElementById('verdict').textContent = data.verdict;
    document.getElementById('summary').textContent = data.summary;
    document.getElementById('tip').textContent = 'Tip: ' + data.top_tip;

    const catDiv = document.getElementById('categories');
    catDiv.innerHTML = data.categories.map(c => `
      <div class="bar-row">
        <div class="bar-label">
          <span>${c.label}</span>
          <span>${c.score}%</span>
        </div>
        <div class="bar-bg">
          <div class="bar-fill" style="width:${c.score}%"></div>
        </div>
      </div>
    `).join('');

    document.getElementById('matchedSkills').innerHTML =
      data.matched_skills.map(s => `<span class="tag match">${s}</span>`).join('');

    document.getElementById('missingSkills').innerHTML =
      data.missing_skills.map(s => `<span class="tag miss">${s}</span>`).join('');

    document.getElementById('results').style.display = 'block';

  } catch (error) {
    alert('Something went wrong. Make sure the backend server is running on port 3000.');
    console.error(error);
  } finally {
    document.getElementById('analyzeBtn').disabled = false;
    document.getElementById('loading').style.display = 'none';
  }
}