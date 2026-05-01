(function () {
  "use strict";

  const ANSWER_FILE_RE = /(answer|answers|key|solution|solutions|scoring|mark)/i;
  const EXAM_FILE_RE = /(exam|test|question|questions|mcq|multiple|form)/i;
  const SUBJECTS = ["AP Calculus AB", "AP Calculus BC", "AP Chemistry", "AP MacroEconomics", "AP MicroEconomics", "AP Statistics"];
  const OPTION_LABELS = ["A", "B", "C", "D", "E"];
  const STORAGE_BUCKET = "exam-assets";
  let importState = null;

  function $(id) { return document.getElementById(id); }
  function escapeHtml(value) {
    return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function normalizeFileName(name) { return String(name || "file").replace(/[^a-z0-9._-]+/gi, "-").replace(/-+/g, "-").slice(0, 80); }
  function getExtension(name, fallback = "png") { const match = String(name || "").match(/\.([a-z0-9]+)$/i); return match ? match[1].toLowerCase() : fallback; }
  function mimeFromExt(ext) { return ({ jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp", svg: "image/svg+xml" })[ext] || "application/octet-stream"; }

  async function uploadBytes(path, bytes, contentType) {
    const client = window.apAuth.supabaseClient;
    const { error } = await client.storage.from(STORAGE_BUCKET).upload(path, bytes, { contentType, upsert: true });
    if (error) throw error;
    const { data } = client.storage.from(STORAGE_BUCKET).getPublicUrl(path);
    return data.publicUrl;
  }

  function getAttr(node, localName) {
    if (!node || !node.attributes) return "";
    for (const attr of node.attributes) {
      if (attr.localName === localName || attr.name === localName || attr.name.endsWith(":" + localName)) return attr.value;
    }
    return "";
  }

  function textFromNode(node) {
    return Array.from(node.getElementsByTagNameNS("http://schemas.openxmlformats.org/wordprocessingml/2006/main", "t"))
      .map((item) => item.textContent || "").join("").replace(/\s+/g, " ").trim();
  }

  function blipIdsFromNode(node) {
    return Array.from(node.getElementsByTagNameNS("http://schemas.openxmlformats.org/drawingml/2006/main", "blip"))
      .map((blip) => getAttr(blip, "embed")).filter(Boolean);
  }

  function tableToMarkdown(rows) {
    if (!rows || !rows.length) return "";
    const width = Math.max(...rows.map((row) => row.length));
    const normalized = rows.map((row) => Array.from({ length: width }, (_, i) => row[i] || ""));
    const header = normalized[0];
    return [`| ${header.join(" | ")} |`, `| ${header.map(() => "---").join(" | ")} |`, ...normalized.slice(1).map((row) => `| ${row.join(" | ")} |`)].join("\n");
  }

  async function parseDocxPackage(file) {
    const arrayBuffer = await file.arrayBuffer();
    const zip = await JSZip.loadAsync(arrayBuffer);
    const documentXmlText = await zip.file("word/document.xml").async("text");
    const relsText = await zip.file("word/_rels/document.xml.rels").async("text");
    const parser = new DOMParser();
    const documentXml = parser.parseFromString(documentXmlText, "application/xml");
    const relsXml = parser.parseFromString(relsText, "application/xml");
    const relMap = {};
    Array.from(relsXml.getElementsByTagName("Relationship")).forEach((rel) => { relMap[rel.getAttribute("Id")] = rel.getAttribute("Target"); });

    const userId = window.apAuth.user?.id || "unknown-user";
    const importId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const mediaMap = {};
    for (const name of Object.keys(zip.files)) {
      if (!name.startsWith("word/media/") || zip.files[name].dir) continue;
      const ext = getExtension(name);
      const bytes = await zip.file(name).async("uint8array");
      const storagePath = `${userId}/docx-imports/${importId}/${normalizeFileName(name.split("/").pop())}`;
      mediaMap[name.replace(/^word\//, "")] = await uploadBytes(storagePath, bytes, mimeFromExt(ext));
    }

    const body = documentXml.getElementsByTagNameNS("http://schemas.openxmlformats.org/wordprocessingml/2006/main", "body")[0];
    const blocks = [];
    let blockIndex = 0;
    Array.from(body.childNodes).forEach((node) => {
      if (node.nodeType !== 1) return;
      if (node.localName === "p") {
        const text = textFromNode(node);
        const numIdNode = node.getElementsByTagNameNS("http://schemas.openxmlformats.org/wordprocessingml/2006/main", "numId")[0];
        const ilvlNode = node.getElementsByTagNameNS("http://schemas.openxmlformats.org/wordprocessingml/2006/main", "ilvl")[0];
        const styleNode = node.getElementsByTagNameNS("http://schemas.openxmlformats.org/wordprocessingml/2006/main", "pStyle")[0];
        const images = blipIdsFromNode(node).map((id) => {
          const target = relMap[id] || "";
          const normalized = target.replace(/^\.\.\//, "");
          return mediaMap[normalized] || mediaMap[target] || null;
        }).filter(Boolean);
        if (text || images.length) {
          blocks.push({ index: ++blockIndex, type: "paragraph", text, numId: numIdNode ? getAttr(numIdNode, "val") : "", level: ilvlNode ? getAttr(ilvlNode, "val") : "", style: styleNode ? getAttr(styleNode, "val") : "", image_urls: images });
        }
      }
      if (node.localName === "tbl") {
        const rows = [];
        Array.from(node.getElementsByTagNameNS("http://schemas.openxmlformats.org/wordprocessingml/2006/main", "tr")).forEach((tr) => {
          const cells = Array.from(tr.getElementsByTagNameNS("http://schemas.openxmlformats.org/wordprocessingml/2006/main", "tc")).map((tc) => textFromNode(tc));
          if (cells.length) rows.push(cells);
        });
        blocks.push({ index: ++blockIndex, type: "table", rows, markdown: tableToMarkdown(rows) });
      }
    });

    const mammothResult = await mammoth.convertToHtml({ arrayBuffer });
    const rawTextResult = await mammoth.extractRawText({ arrayBuffer });
    return { file_name: file.name, blocks, media_map: mediaMap, html: mammothResult.value, raw_text: rawTextResult.value };
  }

  function chooseFiles(files) {
    const list = Array.from(files || []);
    const docxFiles = list.filter((file) => /\.docx$/i.test(file.name));
    const answerCandidates = list.filter((file) => ANSWER_FILE_RE.test(file.name) && /\.(docx|txt)$/i.test(file.name));
    let answerFile = answerCandidates[0] || null;
    let examFile = docxFiles.find((file) => file !== answerFile && EXAM_FILE_RE.test(file.name)) || docxFiles.find((file) => file !== answerFile) || docxFiles[0] || null;
    if (!answerFile && docxFiles.length === 2) answerFile = docxFiles.find((file) => file !== examFile) || null;
    return { examFile, answerFile };
  }

  async function readAnswerFile(file) {
    if (!file) return { raw_text: "", parsed: {} };
    if (/\.txt$/i.test(file.name)) { const rawText = await file.text(); return { raw_text: rawText, parsed: parseAnswerKey(rawText) }; }
    const arrayBuffer = await file.arrayBuffer();
    const rawTextResult = await mammoth.extractRawText({ arrayBuffer });
    return { raw_text: rawTextResult.value, parsed: parseAnswerKey(rawTextResult.value) };
  }

  function parseAnswerKey(text) {
    const answerMap = {};
    const normalized = String(text || "").replace(/\r/g, "\n");
    [/(?:^|\n)\s*(\d{1,3})\s*[\.)\-:]?\s*([A-E])\b/gi, /(?:question|q)\s*(\d{1,3})\s*[\-:]\s*([A-E])\b/gi].forEach((pattern) => {
      let match;
      while ((match = pattern.exec(normalized)) !== null) answerMap[Number(match[1])] = match[2].toUpperCase();
    });
    return answerMap;
  }

  async function callParser(payload) {
    const response = await fetch("/api/parse-docx", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "DOCX parse failed.");
    return data;
  }

  function mergeAnswers(parsedExam, answerMap) {
    const questions = (parsedExam.questions || []).map((question, index) => {
      const number = Number(question.question_number || index + 1);
      const answer = answerMap[number] || "";
      const warnings = Array.isArray(question.warnings) ? [...question.warnings] : [];
      if (!answer && !warnings.includes("missing_correct_answer")) warnings.push("missing_correct_answer");
      if (!question.question_text && !warnings.includes("missing_question_text")) warnings.push("missing_question_text");
      if (!Array.isArray(question.options) || question.options.length < 2) warnings.push("missing_or_too_few_options");
      return { ...question, question_number: number, correct_answer: answer, warnings };
    });
    return { ...parsedExam, questions };
  }

  function showStatus(message) {
    let status = $("docxImportStatus");
    if (!status) { status = document.createElement("div"); status.id = "docxImportStatus"; status.className = "docx-import-status"; document.body.appendChild(status); }
    status.textContent = message;
    status.classList.remove("hidden");
  }
  function hideStatus() { $("docxImportStatus")?.classList.add("hidden"); }

  function optionHtml(option, optionIndex) {
    const label = option.label || OPTION_LABELS[optionIndex] || "";
    return `<div class="docx-option-row" data-option-index="${optionIndex}"><span>${escapeHtml(label)}</span><textarea data-field="option-text">${escapeHtml(option.text || "")}</textarea></div>`;
  }

  function renderPreview(parsedExam) {
    importState = parsedExam;
    $("docxPreviewModal")?.remove();
    const modal = document.createElement("div");
    modal.id = "docxPreviewModal";
    modal.className = "docx-preview-overlay";
    modal.innerHTML = `
      <div class="docx-preview-modal">
        <div class="docx-preview-header"><div><h2>DOCX 导入预览</h2><p>AI 只识别题目和选项；答案只来自答案文档或教师手动填写。</p></div><button type="button" class="icon-btn" id="closeDocxPreviewBtn">×</button></div>
        <div class="docx-exam-fields"><label>标题<input id="docxExamTitle" value="${escapeHtml(parsedExam.exam_title || "Imported AP Exam")}"></label><label>科目<select id="docxExamSubject">${SUBJECTS.map((subject) => `<option value="${subject}" ${subject === parsedExam.subject ? "selected" : ""}>${subject}</option>`).join("")}</select></label><label>描述<input id="docxExamDesc" value="${escapeHtml(parsedExam.description || "Imported from DOCX")}"></label></div>
        <div id="docxQuestionList" class="docx-question-list"></div>
        <div class="docx-preview-actions"><button class="btn btn-outline" type="button" id="addDocxQuestionBtn">新增题目</button><button class="btn btn-primary" type="button" id="confirmDocxImportBtn">确认导入</button></div>
      </div>`;
    document.body.appendChild(modal);
    renderQuestionList();
    $("closeDocxPreviewBtn").addEventListener("click", () => modal.remove());
    $("addDocxQuestionBtn").addEventListener("click", () => { importState.questions.push({ type: "mcq", question_number: importState.questions.length + 1, question_text: "", question_images: [], options: OPTION_LABELS.slice(0, 4).map((label) => ({ label, text: "", image_urls: [] })), correct_answer: "", explanation: "", warnings: ["manual_new_question"] }); renderQuestionList(); });
    $("confirmDocxImportBtn").addEventListener("click", confirmImport);
  }

  function renderQuestionList() {
    const list = $("docxQuestionList");
    list.innerHTML = importState.questions.map((question, index) => {
      const status = question.warnings?.length ? "warning" : "complete";
      const images = (question.question_images || []).map((url) => `<img src="${escapeHtml(url)}" alt="question image">`).join("");
      return `<div class="docx-question-card ${status}" data-question-index="${index}"><div class="docx-question-card-head"><strong>Question ${index + 1}</strong><span>${status}</span><button type="button" class="btn btn-sm btn-danger" data-action="delete-question">删除</button></div>${question.warnings?.length ? `<div class="docx-warnings">${question.warnings.map(escapeHtml).join(" / ")}</div>` : ""}<label>题干<textarea data-field="question-text">${escapeHtml(question.question_text || "")}</textarea></label><div class="docx-image-strip">${images}</div><div class="docx-options">${(question.options || []).map((option, optionIndex) => optionHtml(option, optionIndex)).join("")}</div><label>正确答案<select data-field="correct-answer"><option value="">未填写</option>${OPTION_LABELS.map((label) => `<option value="${label}" ${question.correct_answer === label ? "selected" : ""}>${label}</option>`).join("")}</select></label><label>解析<textarea data-field="explanation">${escapeHtml(question.explanation || "")}</textarea></label></div>`;
    }).join("");
    list.querySelectorAll("[data-action='delete-question']").forEach((button) => button.addEventListener("click", () => { const card = button.closest(".docx-question-card"); importState.questions.splice(Number(card.dataset.questionIndex), 1); renderQuestionList(); }));
  }

  function collectPreviewState() {
    const cards = Array.from(document.querySelectorAll(".docx-question-card"));
    const questions = cards.map((card, index) => {
      const original = importState.questions[Number(card.dataset.questionIndex)] || {};
      const options = Array.from(card.querySelectorAll(".docx-option-row")).map((row, optionIndex) => ({ label: OPTION_LABELS[optionIndex], text: row.querySelector("[data-field='option-text']").value.trim(), image_urls: original.options?.[optionIndex]?.image_urls || [] })).filter((option) => option.text || option.image_urls.length);
      const correctAnswer = card.querySelector("[data-field='correct-answer']").value;
      const questionText = card.querySelector("[data-field='question-text']").value.trim();
      const warnings = [];
      if (!questionText) warnings.push("missing_question_text");
      if (options.length < 2) warnings.push("missing_or_too_few_options");
      if (!correctAnswer) warnings.push("missing_correct_answer");
      return { ...original, question_number: index + 1, question_text: questionText, options, correct_answer: correctAnswer, explanation: card.querySelector("[data-field='explanation']").value.trim(), warnings };
    });
    importState = { ...importState, exam_title: $("docxExamTitle").value.trim(), subject: $("docxExamSubject").value, description: $("docxExamDesc").value.trim(), questions };
    return importState;
  }

  function answerToIndex(answer) { const idx = OPTION_LABELS.indexOf(String(answer || "").toUpperCase()); return idx >= 0 ? idx : 0; }

  async function confirmImport() {
    const state = collectPreviewState();
    const incomplete = state.questions.filter((question) => question.warnings?.length);
    if (incomplete.length && !confirm(`${incomplete.length} 道题仍有警告，确定继续导入吗？`)) return;
    const examData = { title: state.exam_title || "Imported AP Exam", subject: state.subject || "AP MacroEconomics", description: state.description || "Imported from DOCX", timeLimit: 70, examType: "mcq", isPublic: false, questions: state.questions.map((question) => ({ type: "mcq", text: question.question_text, options: question.options, correct: answerToIndex(question.correct_answer), image: question.question_images?.[0] || null, image_urls: question.question_images || [], explanation: question.explanation || "", import_warnings: question.warnings || [] })) };
    try { showStatus("正在保存到 Supabase..."); await examDB.saveExam(examData); hideStatus(); alert("导入成功。页面将刷新显示新试卷。"); window.location.reload(); } catch (error) { hideStatus(); alert("导入失败：" + error.message); }
  }

  async function handleFiles(files) {
    if (!window.apAuth.canEditExams) { alert("只有 teacher/admin 可以导入试卷。"); return; }
    const { examFile, answerFile } = chooseFiles(files);
    if (!examFile) { alert("没有找到题目 DOCX 文件。"); return; }
    try {
      showStatus("正在读取 DOCX 结构和图片...");
      const examDoc = await parseDocxPackage(examFile);
      const answerDoc = await readAnswerFile(answerFile);
      showStatus("正在调用 AI 识别题目和选项...");
      const parsed = await callParser({ exam_doc: examDoc });
      const merged = mergeAnswers(parsed, answerDoc.parsed);
      if (!merged.exam_title) merged.exam_title = examFile.name.replace(/\.docx$/i, "");
      if (!merged.subject) merged.subject = "AP MacroEconomics";
      if (!merged.description) merged.description = examFile.name.replace(/\.docx$/i, "");
      hideStatus();
      renderPreview(merged);
    } catch (error) { hideStatus(); alert("DOCX 导入失败：" + error.message); }
  }

  function initDocxImport() {
    const importBtn = $("docxImportBtn"), folderBtn = $("docxFolderImportBtn"), importInput = $("docxImportInput"), folderInput = $("docxFolderInput");
    if (!importBtn || !folderBtn || !importInput || !folderInput) return;
    importBtn.addEventListener("click", () => importInput.click());
    folderBtn.addEventListener("click", () => folderInput.click());
    importInput.addEventListener("change", async (event) => { await handleFiles(event.target.files); importInput.value = ""; });
    folderInput.addEventListener("change", async (event) => { await handleFiles(event.target.files); folderInput.value = ""; });
  }

  window.docxImporter = { initDocxImport, parseAnswerKey };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initDocxImport); else initDocxImport();
})();