(function() {
  const app = document.getElementById("teacherReportApp");
  let examData = null;
  let attempts = [];

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function formatDate(value) {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";
    return `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  }

  function percent(score, total) {
    const safeTotal = Number(total) || 0;
    if (!safeTotal) return 0;
    return Math.round((Number(score || 0) / safeTotal) * 100);
  }

  function scoreLabel(record) {
    return `${Number(record.score || 0)}/${Number(record.total || 0)} (${percent(record.score, record.total)}%)`;
  }

  function studentName(record) {
    const student = record.student || {};
    return student.real_name || student.nickname || student.email || `Student ${String(record.userId || "").slice(0, 8)}`;
  }

  function studentMeta(record) {
    const student = record.student || {};
    return student.email || record.userId || "-";
  }

  function groupByStudent(records) {
    const groups = new Map();
    records.forEach((record) => {
      const key = record.userId || "unknown";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(record);
    });
    return Array.from(groups.entries()).map(([userId, rows]) => {
      rows.sort((a, b) => new Date(b.completedAt || 0) - new Date(a.completedAt || 0));
      const latest = rows[0];
      const best = rows.reduce((currentBest, row) => {
        return percent(row.score, row.total) > percent(currentBest.score, currentBest.total) ? row : currentBest;
      }, rows[0]);
      const totalScore = rows.reduce((sum, row) => sum + Number(row.score || 0), 0);
      const totalPossible = rows.reduce((sum, row) => sum + Number(row.total || 0), 0);
      return {
        userId,
        latest,
        best,
        attempts: rows.length,
        averagePercent: percent(totalScore, totalPossible)
      };
    }).sort((a, b) => percent(b.latest.score, b.latest.total) - percent(a.latest.score, a.latest.total));
  }

  function renderStatCards(studentGroups) {
    const submissionCount = attempts.length;
    const studentCount = studentGroups.length;
    const totalScore = attempts.reduce((sum, row) => sum + Number(row.score || 0), 0);
    const totalPossible = attempts.reduce((sum, row) => sum + Number(row.total || 0), 0);
    const best = attempts.reduce((currentBest, row) => {
      if (!currentBest) return row;
      return percent(row.score, row.total) > percent(currentBest.score, currentBest.total) ? row : currentBest;
    }, null);
    const latest = attempts[0] || null;

    return `
      <div class="teacher-report-stat">
        <span>提交次数</span>
        <strong>${submissionCount}</strong>
      </div>
      <div class="teacher-report-stat">
        <span>参与学生</span>
        <strong>${studentCount}</strong>
      </div>
      <div class="teacher-report-stat">
        <span>平均正确率</span>
        <strong>${percent(totalScore, totalPossible)}%</strong>
      </div>
      <div class="teacher-report-stat">
        <span>最高成绩</span>
        <strong>${best ? scoreLabel(best) : "-"}</strong>
      </div>
      <div class="teacher-report-stat">
        <span>最近提交</span>
        <strong>${latest ? formatDate(latest.completedAt) : "-"}</strong>
      </div>
    `;
  }

  function renderStudentSummary(studentGroups) {
    if (!studentGroups.length) {
      return `<div class="teacher-report-empty">暂无学生提交记录。</div>`;
    }

    return `
      <div class="teacher-report-table-wrap">
        <table class="teacher-report-table">
          <thead>
            <tr>
              <th>学生</th>
              <th>最近成绩</th>
              <th>最高成绩</th>
              <th>平均正确率</th>
              <th>提交次数</th>
              <th>最后提交</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${studentGroups.map((group) => `
              <tr>
                <td>
                  <strong>${escapeHtml(studentName(group.latest))}</strong>
                  <span>${escapeHtml(studentMeta(group.latest))}</span>
                </td>
                <td>${scoreLabel(group.latest)}</td>
                <td>${scoreLabel(group.best)}</td>
                <td>${group.averagePercent}%</td>
                <td>${group.attempts}</td>
                <td>${formatDate(group.latest.completedAt)}</td>
                <td><button class="btn btn-sm" type="button" onclick="openStudentAttemptHistory('${group.userId}')">Review</button></td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  function renderAttemptRows() {
    if (!attempts.length) {
      return `<div class="teacher-report-empty">暂无提交记录。</div>`;
    }

    return `
      <div class="teacher-report-table-wrap">
        <table class="teacher-report-table">
          <thead>
            <tr>
              <th>学生</th>
              <th>成绩</th>
              <th>正确率</th>
              <th>提交时间</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${attempts.map((record) => `
              <tr>
                <td>
                  <strong>${escapeHtml(studentName(record))}</strong>
                  <span>${escapeHtml(studentMeta(record))}</span>
                </td>
                <td>${Number(record.score || 0)}/${Number(record.total || 0)}</td>
                <td>${percent(record.score, record.total)}%</td>
                <td>${formatDate(record.completedAt)}</td>
                <td><button class="btn btn-sm" type="button" onclick="reviewAttempt('${record.id}')">Review</button></td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  function render() {
    const studentGroups = groupByStudent(attempts);
    app.innerHTML = `
      <header class="exam-top-bar">
        <div class="toolbar-group">
          <button class="btn" type="button" onclick="goHome()">Return</button>
        </div>
        <div class="exam-title-display">
          <div class="exam-kicker">STUDENT SCORE REPORT</div>
          <h1>${escapeHtml(examData.title)}</h1>
          <div>${escapeHtml(examData.subject || "AP Practice Exam")} · ${examData.questions?.length || 0} questions</div>
        </div>
        <div class="toolbar-group end">
          <button class="btn" type="button" onclick="openTeacherPreview()">View Details</button>
        </div>
      </header>

      <main class="teacher-report-layout">
        <aside class="teacher-report-sidebar">
          <h2>Overview</h2>
          <div class="teacher-report-stats">
            ${renderStatCards(studentGroups)}
          </div>
        </aside>

        <section class="teacher-report-main">
          <div class="teacher-report-panel">
            <div class="teacher-report-panel-head">
              <h2>学生汇总</h2>
              <p>按每个学生的最近一次提交汇总。</p>
            </div>
            ${renderStudentSummary(studentGroups)}
          </div>

          <div class="teacher-report-panel">
            <div class="teacher-report-panel-head">
              <h2>全部提交记录</h2>
              <p>老师之间共享这张试卷下的所有学生提交记录。</p>
            </div>
            ${renderAttemptRows()}
          </div>
        </section>
      </main>
    `;
  }

  window.goHome = function() {
    window.location.href = "index.html";
  };

  window.openTeacherPreview = function() {
    localStorage.setItem("currentExamId", examData.id);
    localStorage.setItem("reviewMode", "true");
    localStorage.setItem("teacherReviewMode", "true");
    localStorage.removeItem("reviewReturnUrl");
    localStorage.removeItem("reviewUserId");
    localStorage.removeItem("reviewAnswers");
    localStorage.removeItem("reviewScore");
    localStorage.removeItem("reviewTotal");
    window.location.href = "exam.html";
  };

  window.openStudentAttemptHistory = function(userId) {
    const studentAttempts = attempts
      .filter((record) => (record.userId || "unknown") === userId)
      .sort((a, b) => new Date(b.completedAt || 0) - new Date(a.completedAt || 0));

    if (!studentAttempts.length) return;

    const latest = studentAttempts[0];
    const modal = document.createElement("div");
    modal.className = "teacher-report-modal-overlay";
    modal.innerHTML = `
      <div class="teacher-report-modal" role="dialog" aria-modal="true" aria-labelledby="studentAttemptHistoryTitle">
        <div class="teacher-report-modal-head">
          <div>
            <div class="exam-kicker">STUDENT HISTORY</div>
            <h2 id="studentAttemptHistoryTitle">${escapeHtml(studentName(latest))}</h2>
            <p>${escapeHtml(studentMeta(latest))}</p>
          </div>
          <button class="btn" type="button" onclick="closeStudentAttemptHistory()">Close</button>
        </div>
        <div class="teacher-report-table-wrap">
          <table class="teacher-report-table">
            <thead>
              <tr>
                <th>提交时间</th>
                <th>成绩</th>
                <th>正确率</th>
                <th>记录</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              ${studentAttempts.map((record, index) => `
                <tr>
                  <td>${formatDate(record.completedAt)}</td>
                  <td>${Number(record.score || 0)}/${Number(record.total || 0)}</td>
                  <td>${percent(record.score, record.total)}%</td>
                  <td>${index === 0 ? "Latest attempt" : `Attempt ${studentAttempts.length - index}`}</td>
                  <td><button class="btn btn-sm" type="button" onclick="reviewAttempt('${record.id}')">Review</button></td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      </div>
    `;
    modal.addEventListener("click", (event) => {
      if (event.target === modal) closeStudentAttemptHistory();
    });
    document.body.appendChild(modal);
  };

  window.closeStudentAttemptHistory = function() {
    document.querySelector(".teacher-report-modal-overlay")?.remove();
  };

  window.reviewAttempt = function(attemptId) {
    const record = attempts.find((item) => item.id === attemptId);
    if (!record) return;
    localStorage.setItem("currentExamId", examData.id);
    localStorage.setItem("reviewMode", "true");
    localStorage.removeItem("teacherReviewMode");
    localStorage.setItem("reviewUserId", record.userId || "");
    localStorage.setItem("reviewAnswers", JSON.stringify(record.answers || []));
    localStorage.setItem("reviewScore", Number(record.score || 0));
    localStorage.setItem("reviewTotal", Number(record.total || 0));
    localStorage.setItem("reviewReturnUrl", `teacher-report.html?examId=${encodeURIComponent(examData.id)}`);
    window.location.href = "exam.html";
  };

  async function init() {
    const profile = await window.apAuth.requireLogin();
    if (!profile) return;
    if (!window.apAuth.isTeacherLike(profile.role)) {
      alert("Only teachers can view student reports.");
      window.location.href = "index.html";
      return;
    }

    const examId = new URLSearchParams(window.location.search).get("examId");
    if (!examId) {
      alert("No exam was selected.");
      window.location.href = "index.html";
      return;
    }

    try {
      if (!examDB.db) await examDB.open();
      examData = await examDB.getExamById(examId);
      if (!examData) {
        alert("This exam no longer exists.");
        window.location.href = "index.html";
        return;
      }
      attempts = await examDB.getTeacherExamAttempts(examId);
      render();
    } catch (error) {
      console.error("Failed to load student report:", error);
      app.innerHTML = `
        <div class="teacher-report-error">
          <h1>学生成绩面板加载失败</h1>
          <p>${escapeHtml(error.message || "Unknown error")}</p>
          <button class="btn btn-primary" type="button" onclick="goHome()">Return</button>
        </div>
      `;
    }
  }

  init();
})();
