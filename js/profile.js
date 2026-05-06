(function() {
  const app = document.getElementById("profileApp");
  let profile = null;

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function getInitial() {
    const source = (profile?.nickname || profile?.real_name || profile?.email || "?").trim();
    return (source[0] || "?").toUpperCase();
  }

  function avatarMarkup(sizeClass = "large") {
    if (profile?.avatar_url) {
      return `<span class="profile-avatar ${sizeClass}"><img src="${escapeHtml(profile.avatar_url)}" alt=""></span>`;
    }
    return `<span class="profile-avatar ${sizeClass}">${escapeHtml(getInitial())}</span>`;
  }

  function formatDate(value) {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";
    return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
  }

  function render(editing = false, message = "") {
    const displayName = profile?.real_name || profile?.nickname || profile?.email || "APMock User";
    const nickname = profile?.nickname || "";
    app.innerHTML = `
      <header class="profile-topbar">
        <a href="index.html">Return</a>
        <strong>AP Practice Exam</strong>
      </header>
      <main class="profile-shell">
        <aside class="profile-sidebar">
          ${avatarMarkup()}
          <h1>${escapeHtml(displayName)}</h1>
          <p>${escapeHtml(nickname || profile?.email || "")}</p>
          <button class="profile-edit-btn" type="button" onclick="toggleProfileEdit(${editing ? "false" : "true"})">
            ${editing ? "Cancel" : "Edit profile"}
          </button>
          <dl class="profile-meta">
            <div><dt>Email</dt><dd>${escapeHtml(profile?.email || "-")}</dd></div>
            <div><dt>Role</dt><dd>${escapeHtml(profile?.role || "student")}</dd></div>
            <div><dt>Joined</dt><dd>${formatDate(profile?.created_at)}</dd></div>
          </dl>
        </aside>

        <section class="profile-main">
          ${message ? `<div class="profile-message">${escapeHtml(message)}</div>` : ""}
          ${editing ? renderEditForm() : renderOverview()}
        </section>
      </main>
    `;
  }

  function renderOverview() {
    return `
      <section class="profile-panel">
        <div class="profile-panel-head">
          <h2>Overview</h2>
          <p>账户资料会用于首页显示和老师成绩面板。</p>
        </div>
        <div class="profile-repo-card">
          <div>
            <h3>apmock</h3>
            <p>AP practice exam workspace</p>
          </div>
          <span>${escapeHtml(profile?.role || "student")}</span>
        </div>
      </section>
      <section class="profile-panel">
        <div class="profile-panel-head">
          <h2>Profile details</h2>
        </div>
        <div class="profile-detail-grid">
          <div><span>真实姓名</span><strong>${escapeHtml(profile?.real_name || "未填写")}</strong></div>
          <div><span>昵称</span><strong>${escapeHtml(profile?.nickname || "未填写")}</strong></div>
          <div><span>邮箱</span><strong>${escapeHtml(profile?.email || "未填写")}</strong></div>
        </div>
      </section>
    `;
  }

  function renderEditForm() {
    return `
      <form class="profile-panel profile-edit-form" id="profileEditForm">
        <div class="profile-panel-head">
          <h2>Edit profile</h2>
          <p>更新昵称、真实姓名和头像。</p>
        </div>
        <label>
          <span>真实姓名</span>
          <input type="text" id="editRealName" value="${escapeHtml(profile?.real_name || "")}" required>
        </label>
        <label>
          <span>昵称</span>
          <input type="text" id="editNickname" value="${escapeHtml(profile?.nickname || "")}">
        </label>
        <label>
          <span>新头像</span>
          <input type="file" id="editAvatar" accept="image/*">
        </label>
        <button class="profile-save-btn" type="submit">Save profile</button>
      </form>
    `;
  }

  window.toggleProfileEdit = function(editing) {
    render(editing);
    if (editing) attachEditHandler();
  };

  function attachEditHandler() {
    document.getElementById("profileEditForm")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const realName = document.getElementById("editRealName").value;
      const nickname = document.getElementById("editNickname").value;
      const avatarFile = document.getElementById("editAvatar").files?.[0] || null;

      try {
        const avatarUrl = avatarFile ? await window.apAuth.uploadProfileAvatar(avatarFile) : undefined;
        profile = await window.apAuth.saveProfileDetails(realName, nickname, avatarUrl);
        render(false, "Profile updated.");
      } catch (error) {
        render(true, "保存失败：" + window.apAuth.friendlyAuthError(error));
        attachEditHandler();
      }
    });
  }

  async function init() {
    profile = await window.apAuth.requireLogin();
    if (!profile) return;
    render(false);
  }

  init();
})();
