(function(){
  "use strict";

  const DEFAULT_EXAMS = [
    {
      id: 'ap-test-exam',
      subject: 'test',
      title: 'AP-test-exam',
      description: '极限、导数、积分与微分方程',
      timeLimit: 45,
      examType: 'mcq',
      isPublic: false,
      questions: [
        { 
          type: 'mcq',
          text: '若 f(x) = 3x² - 4x + 7，则 f\'(2) = ?', 
          options: ['4', '8', '10', '12'], 
          correct: 1,
          image: null
        },
        { 
          type: 'mcq',
          text: '极限 lim_{x→0} (sin 5x)/(2x) 的值是？', 
          options: ['0', '2.5', '5', '不存在'], 
          correct: 1,
          image: null
        }
      ]
    }
  ];

  let EXAMS = [];
  let editingExamId = null;
  let pendingImageCallback = null;
  let isSavingExam = false;
  let currentRole = "guest";
  let canEditExams = false;
  let selectedSubjectFilter = 'all';

  const examGridContainer = document.getElementById('examGridContainer');
  const editorModal = document.getElementById('editorModal');
  const modalTitle = document.getElementById('modalTitle');
  const examForm = document.getElementById('examForm');
  const examTypeSelect = document.getElementById('examType');
  const imageUploadInput = document.getElementById('imageUploadInput');
  const subjectFilter = document.getElementById('subjectFilter');


  function applyRolePermissions() {
    const teacherActions = document.getElementById('teacherActions');
    if (teacherActions) {
      teacherActions.style.display = canEditExams ? 'flex' : 'none';
    }
    if (!canEditExams && editorModal) {
      editorModal.classList.add('hidden');
    }
  }

  function requireTeacherPermission() {
    if (canEditExams) return true;
    alert('Students can view exam lists and take exams, but cannot create or edit exams.');
    return false;
  }
  // 初始化
  // 在 init 函数中
async function init() {
  console.log('🚀 初始化主页...');

  try {
    const profile = await window.apAuth.getCurrentProfile();
    window.apAuth.renderAuthBox('authContainer');
    if (!profile) {
      examGridContainer.innerHTML = '<p style="grid-column:1/-1; text-align:center; padding:40px; color:#999;">Please sign up or log in first.</p>';
      applyRolePermissions();
      return;
    }
    currentRole = profile.role;
    canEditExams = window.apAuth.isTeacherLike(currentRole);
    applyRolePermissions();
  } catch (error) {
    console.error('Auth init failed', error);
    alert('Auth init failed: ' + error.message);
    return;
  }
  
  try {
    await examDB.open();
    EXAMS = await examDB.getUserExams();
    
    // 异步渲染，加载历史记录
    await renderExamCards();
    
  } catch (error) {
    console.error('初始化失败:', error);
  }
}

  // 渲染试卷卡片
  // 修改 renderExamCards 函数
async function renderExamCards() {
  console.log('🎨 渲染试卷卡片...');
  
  // 获取所有试卷的最新记录
  let visibleExams = canEditExams ? EXAMS : EXAMS.filter(exam => exam.isPublic === true);
  if (selectedSubjectFilter !== 'all') {
    visibleExams = visibleExams.filter(exam => exam.subject === selectedSubjectFilter);
  }
  const latestRecords = await examDB.getAllLatestHistory();
  
  let html = '';
  if (visibleExams.length === 0) {
    html = '<p style="grid-column:1/-1; text-align:center; padding:40px; color:#999;">暂无试卷，点击"新建试卷"开始</p>';
  } else {
    visibleExams.forEach(exam => {
      const typeLabel = 'MCQ';
      const latestRecord = latestRecords[exam.id];
      const showAttemptHistory = !canEditExams;
      
      // 上次成绩信息
      let lastScoreHtml = '';
      if (!showAttemptHistory) {
        lastScoreHtml = '<div class="exam-history-slot teacher-spacer"></div>';
      } else if (latestRecord) {
        const date = new Date(latestRecord.completedAt);
        const dateStr = `${date.getMonth()+1}/${date.getDate()} ${date.getHours()}:${date.getMinutes().toString().padStart(2, '0')}`;
        const percent = Math.round(latestRecord.score / latestRecord.total * 100);
        const scoreColor = percent >= 80 ? '#4caf50' : percent >= 60 ? '#ff9800' : '#f44336';
        
        lastScoreHtml = `
          <div class="exam-history-slot has-history">
            <div class="exam-history-row">
              <span>Last attempt · ${dateStr}</span>
              <strong style="color:${scoreColor};">
                ${latestRecord.score}/${latestRecord.total} (${percent}%)
              </strong>
            </div>
            <button class="history-btn" onclick="viewHistory('${exam.id}')">
              View Details
            </button>
          </div>
        `;
      } else {
        lastScoreHtml = '<div class="exam-history-slot empty">No previous attempt</div>';
      }
      
      html += `
        <div class="exam-card">
          <div class="card-actions" style="display:${canEditExams ? 'flex' : 'none'}">
            <button class="icon-btn" onclick="editExam('${exam.id}')" title="编辑">✎</button>
            <button class="icon-btn" onclick="deleteExam('${exam.id}')" title="删除">🗑</button>
          </div>
          <div class="exam-badge-row">
            <span class="exam-badge">${exam.subject}</span>
            <span class="exam-type-badge">${typeLabel}</span>
          </div>
          <div class="exam-copy-block">
            <div class="exam-title">${exam.title}</div>
            <div class="exam-desc">${exam.description || ''}</div>
          </div>
          <div class="exam-meta">
            <span>${exam.timeLimit} min</span>
            <span class="exam-meta-dot">·</span>
            <span>${exam.questions?.length || 0} questions</span>
          </div>
          ${lastScoreHtml}
          <button class="start-btn" onclick="startExam('${exam.id}')">Start Exam</button>
        </div>
      `;
    });
  }
  
  examGridContainer.innerHTML = html;
}

  function renderExamCardsSync() {
    let html = '';
    let visibleExams = canEditExams ? EXAMS : EXAMS.filter(exam => exam.isPublic === true);
  if (selectedSubjectFilter !== 'all') {
    visibleExams = visibleExams.filter(exam => exam.subject === selectedSubjectFilter);
  }
    visibleExams.forEach(exam => {
      const typeLabel = 'MCQ';
      const historySlot = canEditExams
        ? '<div class="exam-history-slot teacher-spacer"></div>'
        : '<div class="exam-history-slot empty">No previous attempt</div>';
      html += `
        <div class="exam-card">
          <div class="card-actions" style="display:${canEditExams ? 'flex' : 'none'}">
            <button class="icon-btn" onclick="editExam('${exam.id}')" title="编辑">✎</button>
            <button class="icon-btn" onclick="deleteExam('${exam.id}')" title="删除">🗑</button>
          </div>
          <div class="exam-badge-row">
            <span class="exam-badge">${exam.subject}</span>
            <span class="exam-type-badge">${typeLabel}</span>
          </div>
          <div class="exam-copy-block">
            <div class="exam-title">${exam.title}</div>
            <div class="exam-desc">${exam.description || ''}</div>
          </div>
          <div class="exam-meta">
            <span>${exam.timeLimit} min</span>
            <span class="exam-meta-dot">·</span>
            <span>${exam.questions?.length || 0} questions</span>
          </div>
          ${historySlot}
          <button class="start-btn" onclick="startExam('${exam.id}')">Start Exam</button>
        </div>
      `;
    });
    examGridContainer.innerHTML = html || '<p style="grid-column:1/-1; text-align:center; padding:40px;">暂无试卷，点击"新建试卷"开始</p>';
  }

  // 查看历史详情
// 查看历史详情 - 跳转到答题详情页面
window.viewHistory = async function(examId) {
  console.log('📊 查看历史详情:', examId);
  
  try {
    // 获取试卷信息
    const exam = EXAMS.find(e => e.id === examId);
    if (!exam) {
      alert('试卷不存在');
      return;
    }
    
    // 获取该试卷最近一次记录
    const history = await examDB.getExamHistory(examId);
    const userHistory = history.filter(h => h.userId === examDB.userId);
    userHistory.sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt));
    
    if (userHistory.length === 0) {
      alert('暂无考试记录');
      return;
    }
    
    // 将最近的记录保存到 localStorage，然后跳转到考试页面（以回顾模式）
    localStorage.setItem('currentExamId', examId);
    localStorage.setItem('reviewMode', 'true');
    localStorage.setItem('reviewUserId', examDB.userId || '');
    localStorage.setItem('reviewAnswers', JSON.stringify(userHistory[0].answers));
    localStorage.setItem('reviewScore', userHistory[0].score);
    localStorage.setItem('reviewTotal', userHistory[0].total);
    
    // 跳转到考试页面
    window.location.href = 'exam.html';
    
  } catch (error) {
    console.error('获取历史失败:', error);
    alert('获取历史记录失败');
  }
};

// 显示历史记录弹窗
function showHistoryModal(exam, history) {
  // 创建模态框
  const modal = document.createElement('div');
  modal.style.cssText = `
    position: fixed;
    top: 0; left: 0; right: 0; bottom: 0;
    background: rgba(0,0,0,0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 2000;
  `;
  
  let historyHtml = '';
  history.forEach((record, index) => {
    const date = new Date(record.completedAt);
    const dateStr = `${date.getFullYear()}/${(date.getMonth()+1).toString().padStart(2, '0')}/${date.getDate().toString().padStart(2, '0')} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
    const timeUsed = Math.floor(record.timeUsed / 60) + '分' + (record.timeUsed % 60) + '秒';
    const percent = Math.round(record.score / record.total * 100);
    const scoreColor = percent >= 80 ? '#4caf50' : percent >= 60 ? '#ff9800' : '#f44336';
    
    historyHtml += `
      <div style="padding:16px; margin-bottom:12px; background:#f8fafd; border-radius:12px; ${index === 0 ? 'border:2px solid #1e2b5e;' : ''}">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
          <span style="font-weight:600;">${index === 0 ? '🆕 最新' : ''} ${dateStr}</span>
          <span style="font-size:1.2rem; font-weight:700; color:${scoreColor};">${record.score}/${record.total} (${percent}%)</span>
        </div>
        <div style="display:flex; gap:20px; color:#5b6778; font-size:0.9rem;">
          <span>⏱️ 用时: ${timeUsed}</span>
          <span>📝 类型: ${record.examType === 'mcq' ? '选择题' : 'FRQ'}</span>
        </div>
      </div>
    `;
  });
  
  modal.innerHTML = `
    <div style="background:white; border-radius:24px; padding:32px; max-width:600px; width:90%; max-height:80vh; overflow-y:auto;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:24px;">
        <h2 style="font-size:1.5rem;">📊 ${exam.title} - 考试记录</h2>
        <button onclick="this.closest('div').parentElement.remove()" style="width:32px;height:32px;border-radius:50%;border:1px solid #ddd;background:white;cursor:pointer;font-size:1.2rem;">✕</button>
      </div>
      
      <div style="margin-bottom:20px; padding:16px; background:#1e2b5e; color:white; border-radius:16px; text-align:center;">
        <div style="font-size:0.9rem; opacity:0.8;">共完成 ${history.length} 次考试</div>
        <div style="font-size:2rem; font-weight:700; margin-top:8px;">
          最佳: ${Math.max(...history.map(h => h.score))}/${history[0].total}
        </div>
      </div>
      
      <h3 style="margin-bottom:12px;">📝 历史记录</h3>
      ${historyHtml}
    </div>
  `;
  
  document.body.appendChild(modal);
  
  // 点击背景关闭
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.remove();
    }
  });
}

  // 跳转到考试页面
window.startExam = function(examId) {
  console.log('🎯 开始考试，试卷ID:', examId);
  
  // 验证试卷是否存在
  const exam = EXAMS.find(e => e.id === examId);
  if (!exam) {
    alert('试卷不存在，请刷新页面后重试');
    return;
  }
  
  localStorage.removeItem('reviewMode');
  localStorage.removeItem('reviewUserId');
  localStorage.removeItem('reviewAnswers');
  localStorage.removeItem('reviewScore');
  localStorage.removeItem('reviewTotal');
  localStorage.setItem('currentExamId', examId);
  window.location.href = 'exam.html';
};

  // 打开编辑器
  window.openEditor = function(examId = null) {
    editingExamId = examId;
    const exam = examId ? EXAMS.find(e => e.id === examId) : null;
    
    modalTitle.textContent = exam ? '编辑试卷' : '新建试卷';
    document.getElementById('examSubject').value = exam?.subject || '';
    document.getElementById('examTitle').value = exam?.title || '';
    document.getElementById('examDesc').value = exam?.description || '';
    document.getElementById('examTime').value = exam?.timeLimit || 45;
    document.getElementById('examType').value = 'mcq';
    document.getElementById('examVisibility').value = exam?.isPublic ? 'public' : 'private';
    
    renderQuestionsEditor(exam?.questions || [], 'mcq');
    editorModal.classList.remove('hidden');
  };

  window.closeEditor = function() {
    editorModal.classList.add('hidden');
    editingExamId = null;
  };

  window.editExam = function(examId) {
    openEditor(examId);
  };

  window.deleteExam = async function(examId) {
    if (confirm('确定删除这套试卷吗？')) {
      await examDB.deleteExam(examId);
      EXAMS = await examDB.getUserExams();
      await renderExamCards();
    }
  };

  // MCQ 编辑器
  function renderMCQEditor(q, qIndex) {
    let html = `
      <div class="question-item">
        <div class="question-header">
          <strong>题目 ${qIndex + 1}</strong>
          <div>
            <button type="button" class="btn-icon" onclick="moveQuestion(${qIndex}, 'up')" ${qIndex === 0 ? 'disabled' : ''}>↑</button>
            <button type="button" class="btn-icon" onclick="moveQuestion(${qIndex}, 'down')">↓</button>
            <button type="button" class="btn-icon" onclick="removeQuestion(${qIndex})">🗑</button>
          </div>
        </div>
        <div class="form-group">
          <input type="text" name="q${qIndex}_text" value="${(q.text || '').replace(/"/g, '&quot;')}" placeholder="题目内容" required>
        </div>
        <div class="image-upload-area">
          <button type="button" class="btn btn-sm btn-outline" onclick="uploadImageForMCQ(${qIndex})">📷 上传图片</button>
          ${q.image ? `<img src="${q.image}" class="image-preview">` : ''}
        </div>
        <input type="hidden" name="q${qIndex}_image" id="q${qIndex}_image" value="${q.image || ''}">
    `;
    
    q.options?.forEach((opt, optIndex) => {
      const letter = String.fromCharCode(65 + optIndex);
      const optionText = typeof opt === 'string' ? opt : (opt?.text || '');
      html += `
        <div class="option-row">
          <span style="width:24px; font-weight:600;">${letter}</span>
          <input type="text" name="q${qIndex}_opt${optIndex}" value="${optionText.replace(/"/g, '&quot;')}" placeholder="选项 ${letter}" required>
          <input type="hidden" name="q${qIndex}_opt${optIndex}_image_urls" value="${escapeAttribute(JSON.stringify(typeof opt === 'object' && Array.isArray(opt.image_urls) ? opt.image_urls : []))}">
          <button type="button" class="btn-icon" onclick="setMCQCorrect(${qIndex}, ${optIndex})" 
                  style="background:${q.correct === optIndex ? '#4caf50' : 'white'}; color:${q.correct === optIndex ? 'white' : '#1e2b5e'};">
            ✓
          </button>
        </div>
      `;
    });
    
    html += `
        <input type="hidden" name="q${qIndex}_correct" value="${q.correct || 0}" id="q${qIndex}_correct">
        <input type="hidden" name="q${qIndex}_image_urls" value="${escapeAttribute(JSON.stringify(Array.isArray(q.image_urls) ? q.image_urls : (q.image ? [q.image] : [])))}">
        <input type="hidden" name="q${qIndex}_explanation" value="${escapeAttribute(q.explanation || '')}">
        <input type="hidden" name="q${qIndex}_import_warnings" value="${escapeAttribute(JSON.stringify(Array.isArray(q.import_warnings) ? q.import_warnings : []))}">
      </div>
    `;
    
    return html;
  }

  // FRQ 编辑器（简化版，保留之前的功能）
  function renderFRQEditor(q, qIndex) {
    let html = `
      <div class="question-item">
        <div class="question-header">
          <strong>FRQ 题目 ${qIndex + 1}</strong>
          <div>
            <button type="button" class="btn-icon" onclick="moveQuestion(${qIndex}, 'up')">↑</button>
            <button type="button" class="btn-icon" onclick="moveQuestion(${qIndex}, 'down')">↓</button>
            <button type="button" class="btn-icon" onclick="removeQuestion(${qIndex})">🗑</button>
          </div>
        </div>
        
        <div class="frq-section">
          <div class="frq-section-header">
            <span class="frq-section-title">📌 大题干</span>
          </div>
          <input type="text" name="q${qIndex}_mainText" value="${(q.mainText || '').replace(/"/g, '&quot;')}" placeholder="输入大题题干" style="width:100%;">
        </div>
        
        <div class="frq-section">
          <div class="frq-section-header">
            <span class="frq-section-title">📋 小题干</span>
            <button type="button" class="btn-icon" onclick="addFRQPart(${qIndex})">➕</button>
          </div>
          <div id="frqParts_${qIndex}" class="frq-items-container">
    `;
    
    q.parts?.forEach((part, partIdx) => {
      html += renderFRQPartEditor(qIndex, partIdx, part);
    });
    
    html += `
          </div>
        </div>
      </div>
    `;
    
    return html;
  }

  function renderFRQPartEditor(qIndex, partIdx, part) {
    let html = `
      <div class="frq-item">
        <div class="frq-item-header">
          <span>小题干 ${String.fromCharCode(97 + partIdx)})</span>
          <button type="button" class="btn-icon" onclick="removeFRQPart(${qIndex}, ${partIdx})">🗑</button>
        </div>
        <input type="text" name="q${qIndex}_part${partIdx}_text" value="${(part.partText || '').replace(/"/g, '&quot;')}" placeholder="小题干内容" style="width:100%; margin-bottom:10px;">
        
        <div class="image-upload-area">
          <button type="button" class="btn btn-sm btn-outline" onclick="uploadImageForFRQPart(${qIndex}, ${partIdx})">📷 小题干图片</button>
          ${part.image ? `<img src="${part.image}" class="image-preview">` : ''}
          <input type="hidden" name="q${qIndex}_part${partIdx}_image" value="${part.image || ''}">
        </div>
        
        <div style="margin-top:12px;">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <strong style="font-size:0.9rem;">📝 小题</strong>
            <button type="button" class="btn-icon" onclick="addFRQSubPart(${qIndex}, ${partIdx})">➕</button>
          </div>
          <div id="frqSubParts_${qIndex}_${partIdx}">
    `;
    
    part.subParts?.forEach((subPart, subIdx) => {
      html += renderFRQSubPartEditor(qIndex, partIdx, subIdx, subPart);
    });
    
    html += `
          </div>
        </div>
      </div>
    `;
    
    return html;
  }

  function renderFRQSubPartEditor(qIndex, partIdx, subIdx, subPart) {
    return `
      <div style="margin-left:20px; margin-top:10px; padding:10px; background:#f0f4fa; border-radius:8px;">
        <div style="display:flex; justify-content:space-between;">
          <span>小题 ${subIdx+1}</span>
          <button type="button" class="btn-icon" onclick="removeFRQSubPart(${qIndex}, ${partIdx}, ${subIdx})" style="width:24px;height:24px;">✕</button>
        </div>
        <input type="text" name="q${qIndex}_part${partIdx}_sub${subIdx}_text" value="${(subPart.text || '').replace(/"/g, '&quot;')}" placeholder="小题内容" style="width:100%;">
        <div class="image-upload-area">
          <button type="button" class="btn btn-sm btn-outline" onclick="uploadImageForFRQSubPart(${qIndex}, ${partIdx}, ${subIdx})">📷 图片</button>
          ${subPart.image ? `<img src="${subPart.image}" class="image-preview">` : ''}
          <input type="hidden" name="q${qIndex}_part${partIdx}_sub${subIdx}_image" value="${subPart.image || ''}">
        </div>
      </div>
    `;
  }

  // 保持其他编辑器函数不变...
  // (addQuestion, removeQuestion, moveQuestion, setMCQCorrect, addFRQPart, removeFRQPart, addFRQSubPart, removeFRQSubPart, uploadImageForMCQ, uploadImageForFRQPart, uploadImageForFRQSubPart, getCurrentQuestionsFromForm)

  window.addQuestion = function() {
  const questions = getCurrentQuestionsFromForm();
  const examType = 'mcq';
  
  if (examType === 'mcq') {
    questions.push({
      type: 'mcq',
      text: '新题目',
      options: ['选项 A', '选项 B', '选项 C', '选项 D'],
      correct: 0,
      image: null
    });
  } else {
    questions.push({
      type: 'frq',
      mainText: '新 FRQ 大题',
      parts: []
    });
  }
  
  renderQuestionsEditor(questions, examType);
};

  window.removeQuestion = function(index) {
  const questions = getCurrentQuestionsFromForm();
  if (questions.length <= 1) {
    alert('至少保留一道题目');
    return;
  }
  questions.splice(index, 1);
  renderQuestionsEditor(questions, examTypeSelect.value);
};

  window.moveQuestion = function(index, direction) {
  const questions = getCurrentQuestionsFromForm();
  
  if (direction === 'up' && index > 0) {
    const temp = questions[index - 1];
    questions[index - 1] = questions[index];
    questions[index] = temp;
  } else if (direction === 'down' && index < questions.length - 1) {
    const temp = questions[index + 1];
    questions[index + 1] = questions[index];
    questions[index] = temp;
  }
  
  renderQuestionsEditor(questions, examTypeSelect.value);
};

  window.setMCQCorrect = function(qIndex, optIndex) {
  const correctInput = document.getElementById(`q${qIndex}_correct`);
  if (correctInput) {
    correctInput.value = optIndex;
  }
  const questions = getCurrentQuestionsFromForm();
  renderQuestionsEditor(questions, examTypeSelect.value);
};

window.uploadImageForMCQ = function(qIndex) {
  uploadImage((imageData) => {
    const imageInput = document.getElementById(`q${qIndex}_image`);
    if (imageInput) {
      imageInput.value = imageData;
    }
    const questions = getCurrentQuestionsFromForm();
    renderQuestionsEditor(questions, examTypeSelect.value);
  });
};

  window.addFRQPart = function(qIndex) {
  const questions = getCurrentQuestionsFromForm();
  if (!questions[qIndex]) return;
  
  if (!questions[qIndex].parts) questions[qIndex].parts = [];
  questions[qIndex].parts.push({
    id: `part_${Date.now()}`,
    partText: '',
    image: null,
    subParts: []
  });
  
  renderQuestionsEditor(questions, examTypeSelect.value);
};

window.removeFRQPart = function(qIndex, partIdx) {
  const questions = getCurrentQuestionsFromForm();
  if (!questions[qIndex] || !questions[qIndex].parts) return;
  
  questions[qIndex].parts.splice(partIdx, 1);
  renderQuestionsEditor(questions, examTypeSelect.value);
};

window.addFRQSubPart = function(qIndex, partIdx) {
  const questions = getCurrentQuestionsFromForm();
  if (!questions[qIndex] || !questions[qIndex].parts || !questions[qIndex].parts[partIdx]) return;
  
  if (!questions[qIndex].parts[partIdx].subParts) {
    questions[qIndex].parts[partIdx].subParts = [];
  }
  
  questions[qIndex].parts[partIdx].subParts.push({
    text: '',
    image: null
  });
  
  renderQuestionsEditor(questions, examTypeSelect.value);
};

window.removeFRQSubPart = function(qIndex, partIdx, subIdx) {
  const questions = getCurrentQuestionsFromForm();
  if (!questions[qIndex] || !questions[qIndex].parts || !questions[qIndex].parts[partIdx]) return;
  
  questions[qIndex].parts[partIdx].subParts.splice(subIdx, 1);
  renderQuestionsEditor(questions, examTypeSelect.value);
};

window.uploadImageForFRQPart = function(qIndex, partIdx) {
  uploadImage((imageData) => {
    const imageInput = document.querySelector(`input[name="q${qIndex}_part${partIdx}_image"]`);
    if (imageInput) {
      imageInput.value = imageData;
    }
    const questions = getCurrentQuestionsFromForm();
    renderQuestionsEditor(questions, examTypeSelect.value);
  });
};

window.uploadImageForFRQSubPart = function(qIndex, partIdx, subIdx) {
  uploadImage((imageData) => {
    const imageInput = document.querySelector(`input[name="q${qIndex}_part${partIdx}_sub${subIdx}_image"]`);
    if (imageInput) {
      imageInput.value = imageData;
    }
    const questions = getCurrentQuestionsFromForm();
    renderQuestionsEditor(questions, examTypeSelect.value);
  });
};

  function uploadImage(callback) {
  pendingImageCallback = callback;
  imageUploadInput.value = '';
  imageUploadInput.click();
}

imageUploadInput.addEventListener('change', (e) => {
  const file = e.target.files && e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    if (typeof pendingImageCallback === 'function') {
      pendingImageCallback(reader.result);
    }
    pendingImageCallback = null;
    imageUploadInput.value = '';
  };
  reader.onerror = () => {
    console.error('Image upload failed:', reader.error);
    alert('图片读取失败，请重试');
    pendingImageCallback = null;
    imageUploadInput.value = '';
  };
  reader.readAsDataURL(file);
});

examForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!requireTeacherPermission()) return;
  if (isSavingExam) {
    return;
  }
  isSavingExam = true;
  
  console.log('📝 提交表单...');
  
  const subject = document.getElementById('examSubject').value.trim();
  const title = document.getElementById('examTitle').value.trim();
  const description = document.getElementById('examDesc').value.trim();
  const timeLimit = parseInt(document.getElementById('examTime').value);
  const examType = 'mcq';
  const isPublic = document.getElementById('examVisibility').value === 'public';
  const questions = getCurrentQuestionsFromForm();
  
  if (!subject || !title || !description || questions.length === 0) {
    isSavingExam = false;
    alert('请填写完整信息并至少添加一道题目');
    return;
  }

  const examData = {
    id: editingExamId || `exam_${Date.now()}`,
    subject,
    title,
    description,
    timeLimit,
    examType,
    isPublic,
    questions
  };

  if (editingExamId) {
    examData.createdAt = EXAMS.find(e => e.id === editingExamId)?.createdAt;
  }
  
  try {
    await examDB.saveExam(examData);
    closeEditor();
    
    // 重新加载数据并刷新显示
    EXAMS = await examDB.getUserExams();
    await renderExamCards();
    console.log('✅ 保存成功，共', EXAMS.length, '套试卷');
    
  } catch (error) {
    console.error('❌ 保存失败:', error);
    alert('保存失败: ' + error.message);
  } finally {
    isSavingExam = false;
  }
});


  function renderQuestionsEditor(questions, examType) {
  const container = document.getElementById('questionsList');

  if (!questions || questions.length === 0) {
    container.innerHTML = '<p style="color:#999; padding:20px; text-align:center;">No questions yet. Click Add Question below.</p>';
    return;
  }

  let html = '';
  questions.forEach((q, qIndex) => {
    html += renderMCQEditor(q, qIndex);
  });

  container.innerHTML = html;
}

  function escapeAttribute(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function parseJsonArray(value) {
    try {
      const parsed = JSON.parse(value || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      return [];
    }
  }

  examTypeSelect.addEventListener('change', () => {
  examTypeSelect.value = 'mcq';
});
  
  // 表单提交
  false && examForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const subject = document.getElementById('examSubject').value.trim();
    const title = document.getElementById('examTitle').value.trim();
    const description = document.getElementById('examDesc').value.trim();
    const timeLimit = parseInt(document.getElementById('examTime').value);
    const examType = 'mcq';
    const isPublic = document.getElementById('examVisibility').value === 'public';
    const questions = getCurrentQuestionsFromForm();
    
    if (!subject || !title || !description || questions.length === 0) {
      alert('请填写完整信息并至少添加一道题目');
      return;
    }
    
    const examData = {
      id: editingExamId || `exam_${Date.now()}`,
      subject,
      title,
      description,
      timeLimit,
      examType,
      isPublic,
      questions
    };
    
    if (editingExamId) {
      examData.createdAt = EXAMS.find(e => e.id === editingExamId)?.createdAt;
    }
    
    await examDB.saveExam(examData);
    closeEditor();
    await renderExamCards();
  });

  const newExamMenuBtn = document.getElementById('newExamMenuBtn');
  const newExamMenu = document.getElementById('newExamMenu');

  if (newExamMenuBtn && newExamMenu) {
    newExamMenuBtn.addEventListener('click', (event) => {
      if (!requireTeacherPermission()) return;
      event.stopPropagation();
      newExamMenu.classList.toggle('hidden');
    });

    newExamMenu.addEventListener('click', (event) => {
      event.stopPropagation();
    });

    document.addEventListener('click', () => {
      newExamMenu.classList.add('hidden');
    });
  }

  document.getElementById('addExamBtn')?.addEventListener('click', () => {
    if (!requireTeacherPermission()) return;
    newExamMenu?.classList.add('hidden');
    openEditor(null);
  });
  if (subjectFilter) {
    subjectFilter.addEventListener('change', async () => {
      selectedSubjectFilter = subjectFilter.value || 'all';
      await renderExamCards();
    });
  }

  // 替换原来的空函数
window.getCurrentQuestionsFromForm = function() {
  const examType = 'mcq';
  const container = document.getElementById('questionsList');
  const questionItems = container.querySelectorAll('.question-item');
  const questions = [];
  
  questionItems.forEach((item, idx) => {
    if (examType === 'mcq') {
      // MCQ 题目解析
      const textInput = item.querySelector(`input[name^="q${idx}_text"]`);
      const text = textInput?.value || '';
      
      const options = [];
      for (let i = 0; i < 4; i++) {
        const optInput = item.querySelector(`input[name="q${idx}_opt${i}"]`);
        const optionImageInput = item.querySelector(`input[name="q${idx}_opt${i}_image_urls"]`);
        options.push({
          label: String.fromCharCode(65 + i),
          text: optInput?.value || `选项 ${String.fromCharCode(65 + i)}`,
          image_urls: parseJsonArray(optionImageInput?.value)
        });
      }
      
      const correctInput = item.querySelector(`input[name="q${idx}_correct"]`);
      const correct = parseInt(correctInput?.value || '0');
      
      const imageInput = item.querySelector(`input[name="q${idx}_image"]`);
      const image = imageInput?.value || null;
      const imageUrlsInput = item.querySelector(`input[name="q${idx}_image_urls"]`);
      const imageUrls = parseJsonArray(imageUrlsInput?.value);
      if (image && image !== 'null' && !imageUrls.includes(image)) {
        imageUrls.unshift(image);
      }
      const explanationInput = item.querySelector(`input[name="q${idx}_explanation"]`);
      const importWarningsInput = item.querySelector(`input[name="q${idx}_import_warnings"]`);
      
      questions.push({ 
        type: 'mcq', 
        text, 
        options, 
        correct, 
        image: image && image !== 'null' ? image : null,
        image_urls: imageUrls,
        explanation: explanationInput?.value || '',
        import_warnings: parseJsonArray(importWarningsInput?.value)
      });
    } else {
      // FRQ 题目解析
      const mainTextInput = item.querySelector(`input[name="q${idx}_mainText"]`);
      const mainText = mainTextInput?.value || '';
      
      const parts = [];
      const partsContainer = document.getElementById(`frqParts_${idx}`);
      
      if (partsContainer) {
        const partItems = partsContainer.querySelectorAll('.frq-item');
        partItems.forEach((partItem, partIdx) => {
          const partTextInput = partItem.querySelector(`input[name="q${idx}_part${partIdx}_text"]`);
          const partText = partTextInput?.value || '';
          
          const partImageInput = partItem.querySelector(`input[name="q${idx}_part${partIdx}_image"]`);
          const partImage = partImageInput?.value || null;
          
          const subParts = [];
          const subPartsContainer = document.getElementById(`frqSubParts_${idx}_${partIdx}`);
          
          if (subPartsContainer) {
            const subPartDivs = subPartsContainer.children;
            for (let subIdx = 0; subIdx < subPartDivs.length; subIdx++) {
              const subTextInput = subPartDivs[subIdx].querySelector(`input[name="q${idx}_part${partIdx}_sub${subIdx}_text"]`);
              const subText = subTextInput?.value || '';
              
              const subImageInput = subPartDivs[subIdx].querySelector(`input[name="q${idx}_part${partIdx}_sub${subIdx}_image"]`);
              const subImage = subImageInput?.value || null;
              
              subParts.push({ 
                text: subText, 
                image: subImage && subImage !== 'null' ? subImage : null 
              });
            }
          }
          
          parts.push({
            id: `part_${Date.now()}_${partIdx}`,
            partText,
            image: partImage && partImage !== 'null' ? partImage : null,
            subParts
          });
        });
      }
      
      questions.push({ type: 'frq', mainText, parts });
    }
  });
  
  return questions;
};


  // init
  init();
})();
