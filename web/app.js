const statusText = document.querySelector("#statusText");
const authPanel = document.querySelector("#authPanel");
const codeBox = document.querySelector("#codeBox");
const posts = document.querySelector("#posts");
const resultTitle = document.querySelector("#resultTitle");
const resultMeta = document.querySelector("#resultMeta");
const loadMoreBtn = document.querySelector("#loadMoreBtn");
const downloadBtn = document.querySelector("#downloadBtn");
const authHint = document.querySelector("#authHint");
const channelSelect = document.querySelector("#channelSelect");
const downloadDir = document.querySelector("#downloadDir");
const downloadHint = document.querySelector("#downloadHint");
const saveDownloadDirBtn = document.querySelector("#saveDownloadDirBtn");
const dbHint = document.querySelector("#dbHint");
const channelRows = document.querySelector("#channelRows");
const saveChannelsBtn = document.querySelector("#saveChannelsBtn");
const browseDownloadDirBtn = document.querySelector("#browseDownloadDirBtn");
const addChannelBtn = document.querySelector("#addChannelBtn");
const groupRows = document.querySelector("#groupRows");
const addGroupBtn = document.querySelector("#addGroupBtn");
const saveGroupsBtn = document.querySelector("#saveGroupsBtn");
const groupHint = document.querySelector("#groupHint");
const settingsPanel = document.querySelector("#settingsPanel");
const toggleSettingsBtn = document.querySelector("#toggleSettingsBtn");
const connectBtn = document.querySelector("#connectBtn");
const verifyBtn = document.querySelector("#verifyBtn");
const advancedFilters = document.querySelector("#advancedFilters");
const directChannelField = document.querySelector("#directChannelField");
const datePresetButtons = Array.from(document.querySelectorAll(".datePreset"));
const resultSearch = document.querySelector("#resultSearch");
const clearResultSearch = document.querySelector("#clearResultSearch");
const resultSearchCount = document.querySelector("#resultSearchCount");
const languageLabels = { fa: "페르시아어", ru: "러시아어", "zh-CN": "중국어", en: "영어" };

let nextOffset = null;
let currentChannel = "TasnimNews";
let currentSearch = "";
let currentDateFrom = "";
let currentDateTo = "";
let isAuthorized = false;
let loadedItems = [];
let savedChannels = [];
let savedGroups = [];
let currentExportChannel = "All saved channels";
let resultFilterGroups = [];
let resultTranslationTimer = null;
let resultTranslationSequence = 0;
let resultTranslationNote = "";

async function request(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Request failed");
  return data;
}

function setStatus(text, ok = false) {
  statusText.textContent = text;
  statusText.classList.toggle("ok", ok);
}

function renderError(message) {
  posts.innerHTML = `<div class="error">${escapeHtml(message)}</div>`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function likelyRtl(text) {
  return /[\u0600-\u06ff]/.test(text || "");
}

function formatDate(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function fileSafe(value) {
  return String(value || "telegram")
    .replace(/[^a-z0-9가-힣_-]+/gi, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60) || "telegram";
}

function postCard(item) {
  const text = item.text || "(media/no text)";
  const dirClass = likelyRtl(text) ? "rtl" : "";
  const channelLabel = item.channel
    ? item.channel_label && item.channel_label !== item.channel
      ? `${item.channel_label} (@${item.channel})`
      : `@${item.channel}`
    : "";
  const meta = [
    channelLabel,
    `#${item.id}`,
    formatDate(item.date),
    item.views != null ? `views ${item.views}` : "",
    item.forwards != null ? `forwards ${item.forwards}` : "",
    item.replies != null ? `replies ${item.replies}` : "",
    item.media_type ? `media ${item.media_type}` : item.has_media ? "media" : "",
  ].filter(Boolean);
  const downloadVideo = item.media_type === "video" && item.channel
    ? `<button class="downloadVideoBtn secondaryButton" type="button" data-channel="${escapeHtml(item.channel)}" data-id="${escapeHtml(item.id)}">Download Video</button>`
    : "";

  return `
    <article class="post">
      <div class="postMeta">${meta.map(escapeHtml).join("<span> - </span>")}</div>
      <div class="postText ${dirClass}">${escapeHtml(text)}</div>
      <div class="postActions">
        <a href="${escapeHtml(item.link)}" target="_blank" rel="noreferrer">Open in Telegram</a>
        ${downloadVideo}
      </div>
    </article>
  `;
}

function channelRow(item = { id: "", label: "" }) {
  const row = document.createElement("div");
  row.className = "channelRow";
  row.innerHTML = `
    <label>
      <span>Channel ID</span>
      <input class="channelIdInput" autocomplete="off" placeholder="TasnimNews" value="${escapeHtml(item.id || "")}">
    </label>
    <label>
      <span>Korean name</span>
      <input class="channelLabelInput" autocomplete="off" placeholder="타스님뉴스" value="${escapeHtml(item.label || "")}">
    </label>
    <button class="removeChannelBtn" type="button">Remove</button>
  `;
  row.querySelector(".removeChannelBtn").addEventListener("click", () => row.remove());
  return row;
}

function renderChannelRows(channels) {
  channelRows.innerHTML = "";
  (channels.length ? channels : [{ id: "", label: "" }]).forEach((item) => {
    channelRows.appendChild(channelRow(item));
  });
}

function groupRow(item = { id: "", name: "", channel_ids: [] }) {
  const card = document.createElement("div");
  card.className = "groupCard";
  if (item.id) card.dataset.groupId = item.id;
  const selected = new Set(item.channel_ids || []);
  const channelChoices = savedChannels.length
    ? savedChannels.map((channel) => `
        <label class="groupChannelChoice">
          <input type="checkbox" value="${escapeHtml(channel.id)}" ${selected.has(channel.id) ? "checked" : ""}>
          <span>${escapeHtml(channel.label)} <small>@${escapeHtml(channel.id)}</small></span>
        </label>
      `).join("")
    : `<p class="settingsHint">먼저 저장 채널을 추가해 주세요.</p>`;
  card.innerHTML = `
    <div class="groupCardHeader">
      <label>
        <span>목록 이름</span>
        <input class="groupNameInput" autocomplete="off" placeholder="예: 미국·이란 충돌" value="${escapeHtml(item.name || "")}">
      </label>
      <button class="removeGroupBtn secondaryButton" type="button">목록 삭제</button>
    </div>
    <div class="groupChannelGrid">${channelChoices}</div>
    <p class="groupCount"></p>
  `;
  const updateCount = () => {
    const count = card.querySelectorAll('.groupChannelChoice input:checked').length;
    card.querySelector(".groupCount").textContent = `${count}개 채널 선택됨`;
  };
  card.querySelectorAll('.groupChannelChoice input').forEach((input) => {
    input.addEventListener("change", updateCount);
  });
  card.querySelector(".removeGroupBtn").addEventListener("click", () => card.remove());
  updateCount();
  return card;
}

function renderGroupRows(groups) {
  groupRows.innerHTML = "";
  if (!groups.length) {
    groupRows.innerHTML = `<div class="emptyGroupState">아직 모니터링 목록이 없습니다. ‘+ 새 목록’을 눌러 만들어 보세요.</div>`;
    return;
  }
  groups.forEach((item) => groupRows.appendChild(groupRow(item)));
}

function selectedLanguages(selector) {
  return Array.from(document.querySelectorAll(`${selector}:checked`)).map((input) => input.value);
}

function resultSearchTerms() {
  return String(resultSearch.value || "")
    .split(/[\s,]+/)
    .map((term) => term.trim().toLocaleLowerCase())
    .filter(Boolean);
}

function filteredLoadedItems() {
  const terms = resultSearchTerms();
  if (!terms.length) return loadedItems;
  const groups = resultFilterGroups.length ? resultFilterGroups : terms.map((term) => [term]);
  return loadedItems.filter((item) => {
    const searchable = [item.text, item.channel, item.channel_label]
      .filter(Boolean)
      .join(" ")
      .toLocaleLowerCase();
    return groups.every((alternatives) => alternatives.some((term) => searchable.includes(term)));
  });
}

function renderPosts() {
  const visibleItems = filteredLoadedItems();
  posts.innerHTML = visibleItems.length
    ? visibleItems.map(postCard).join("")
    : `<div class="empty">조건에 맞는 게시글이 없습니다.</div>`;
  const hasFilter = resultSearchTerms().length > 0;
  resultSearch.disabled = !loadedItems.length;
  clearResultSearch.disabled = !hasFilter;
  const countText = !loadedItems.length
    ? "게시글을 불러오면 사용할 수 있습니다."
    : hasFilter
      ? `전체 ${loadedItems.length}개 중 ${visibleItems.length}개 표시`
      : `불러온 게시글 ${loadedItems.length}개`;
  resultSearchCount.textContent = resultTranslationNote ? `${countText} · ${resultTranslationNote}` : countText;
}

function scheduleResultTranslation() {
  if (resultTranslationTimer) clearTimeout(resultTranslationTimer);
  const terms = resultSearchTerms();
  const languages = selectedLanguages(".resultLanguage");
  resultTranslationSequence += 1;
  const sequence = resultTranslationSequence;
  resultFilterGroups = terms.map((term) => [term]);
  resultTranslationNote = "";

  if (!terms.length || !languages.length) {
    renderPosts();
    return;
  }

  resultTranslationNote = "검색어 변환 준비 중";
  renderPosts();
  resultTranslationTimer = setTimeout(async () => {
    try {
      const data = await request("/api/translate-search", {
        method: "POST",
        body: JSON.stringify({ search: resultSearch.value, languages }),
      });
      if (sequence !== resultTranslationSequence) return;
      resultFilterGroups = (data.groups || []).map((group) =>
        group.map((term) => String(term).toLocaleLowerCase()).filter(Boolean)
      );
      resultTranslationNote = data.warning || `${languages.map((code) => languageLabels[code]).join("·")} 변환 적용`;
    } catch (error) {
      if (sequence !== resultTranslationSequence) return;
      resultTranslationNote = "검색어 변환 실패";
    }
    renderPosts();
  }, 350);
}

function setSettingsExpanded(expanded) {
  settingsPanel.classList.toggle("collapsed", !expanded);
  toggleSettingsBtn.textContent = expanded ? "Collapse" : "Expand";
}

async function refreshStatus() {
  try {
    const data = await request("/api/status");
    isAuthorized = Boolean(data.authorized);
    if (isAuthorized) {
      setStatus(`Authorized session: ${data.session}`, true);
      authPanel.hidden = true;
    } else if (data.configured) {
      setStatus("API configured from environment. Login verification may be required.");
      authPanel.hidden = false;
      authHint.textContent = data.phone_configured
        ? "Credentials and phone are loaded from .env. Click Connect to send a login code if needed."
        : "Credentials are loaded from .env. Add TELEGRAM_PHONE or enter Phone below.";
      document.querySelector("#apiId").closest("label").hidden = true;
      document.querySelector("#apiHash").closest("label").hidden = true;
    } else {
      setStatus("API credentials are not configured.");
      authPanel.hidden = false;
      authHint.textContent = "Enter credentials once, or save them in .env.";
      document.querySelector("#apiId").closest("label").hidden = false;
      document.querySelector("#apiHash").closest("label").hidden = false;
    }
  } catch (error) {
    setStatus(error.message);
  }
}

async function loadChannels() {
  try {
    const [data, groupData] = await Promise.all([
      request("/api/channels"),
      request("/api/channel-groups"),
    ]);
    const channels = data.channels || [];
    const normalized = channels.map((item) => {
      if (typeof item === "string") return { id: item, label: item };
      return { id: item.id, label: item.label || item.id };
    }).filter((item) => item.id);
    savedChannels = normalized;
    savedGroups = groupData.groups || [];
    renderChannelRows(normalized);
    renderGroupRows(savedGroups);
    channelSelect.innerHTML = [
      `<option value="__all__">전체 저장 채널 (${normalized.length})</option>`,
      savedGroups.length ? `<optgroup label="모니터링 목록">${savedGroups.map((group) =>
        `<option value="__group__:${group.id}">${escapeHtml(group.name)} (${group.channel_ids.length})</option>`
      ).join("")}</optgroup>` : "",
      `<optgroup label="개별 채널">${normalized.map((channel) => {
        const label = channel.label === channel.id ? channel.id : `${channel.label} (@${channel.id})`;
        return `<option value="${escapeHtml(channel.id)}">${escapeHtml(label)}</option>`;
      }).join("")}</optgroup>`,
      `<option value="">직접 입력</option>`,
    ].join("");
    channelSelect.value = "__all__";
    document.querySelector("#channel").value = "전체 저장 채널";
    document.querySelector("#channel").disabled = true;
    directChannelField.hidden = true;
  } catch (error) {
    channelSelect.innerHTML = `<option value="">직접 입력</option>`;
    directChannelField.hidden = false;
    document.querySelector("#channel").disabled = false;
    advancedFilters.open = true;
    groupHint.textContent = error.message;
  }
}

function readChannelRows() {
  return Array.from(channelRows.querySelectorAll(".channelRow"))
    .map((row) => {
      const channel = row.querySelector(".channelIdInput").value.trim().replace(/^@+/, "");
      const label = row.querySelector(".channelLabelInput").value.trim() || channel;
      return { id: channel, label };
    })
    .filter((item) => item.id);
}

async function saveChannels() {
  saveChannelsBtn.disabled = true;
  saveChannelsBtn.textContent = "Saving...";
  try {
    await request("/api/channels", {
      method: "POST",
      body: JSON.stringify({ channels: readChannelRows() }),
    });
    await loadChannels();
    downloadHint.textContent = "Channel list saved to local DB.";
  } catch (error) {
    downloadHint.textContent = error.message;
  } finally {
    saveChannelsBtn.textContent = "Save Channels";
    saveChannelsBtn.disabled = false;
  }
}

function readGroupRows() {
  return Array.from(groupRows.querySelectorAll(".groupCard")).map((card) => ({
    id: card.dataset.groupId || null,
    name: card.querySelector(".groupNameInput").value.trim(),
    channel_ids: Array.from(card.querySelectorAll('.groupChannelChoice input:checked')).map((input) => input.value),
  }));
}

async function saveGroups() {
  saveGroupsBtn.disabled = true;
  saveGroupsBtn.textContent = "저장 중...";
  try {
    const data = await request("/api/channel-groups", {
      method: "POST",
      body: JSON.stringify({ groups: readGroupRows() }),
    });
    savedGroups = data.groups || [];
    await loadChannels();
    groupHint.textContent = "모니터링 목록을 로컬 DB에 저장했습니다.";
  } catch (error) {
    groupHint.textContent = error.message;
  } finally {
    saveGroupsBtn.textContent = "모니터링 목록 저장";
    saveGroupsBtn.disabled = false;
  }
}

async function loadSettings() {
  try {
    const data = await request("/api/settings");
    downloadDir.value = data.download_dir || "";
    downloadHint.textContent = data.download_dir ? `Saving exports to ${data.download_dir}` : "Download folder is not set.";
    dbHint.textContent = data.db_path ? `Local settings DB: ${data.db_path}` : "";
  } catch (error) {
    downloadHint.textContent = error.message;
  }
}

async function saveDownloadDir() {
  saveDownloadDirBtn.disabled = true;
  saveDownloadDirBtn.textContent = "Saving...";
  try {
    const data = await request("/api/settings", {
      method: "POST",
      body: JSON.stringify({ download_dir: downloadDir.value }),
    });
    downloadDir.value = data.download_dir;
    downloadHint.textContent = `Saving exports to ${data.download_dir}`;
  } catch (error) {
    downloadHint.textContent = error.message;
  } finally {
    saveDownloadDirBtn.textContent = "Save Folder";
    saveDownloadDirBtn.disabled = false;
  }
}

async function browseDownloadDir() {
  browseDownloadDirBtn.disabled = true;
  browseDownloadDirBtn.textContent = "Opening...";
  try {
    const data = await request("/api/pick-folder", {
      method: "POST",
      body: JSON.stringify({}),
    });
    downloadDir.value = data.download_dir;
    downloadHint.textContent = data.cancelled
      ? `Folder selection cancelled. Current folder: ${data.download_dir}`
      : `Saving exports to ${data.download_dir}`;
  } catch (error) {
    downloadHint.textContent = error.message;
  } finally {
    browseDownloadDirBtn.textContent = "Browse";
    browseDownloadDirBtn.disabled = false;
  }
}

async function connect() {
  connectBtn.disabled = true;
  connectBtn.textContent = "Connecting...";
  const payload = {
    api_id: document.querySelector("#apiId").value,
    api_hash: document.querySelector("#apiHash").value,
    phone: document.querySelector("#phone").value,
  };
  try {
    const data = await request("/api/connect", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    if (data.authorized) {
      codeBox.hidden = true;
      await refreshStatus();
      return;
    }
    if (data.phone_required) {
      setStatus("Phone number is required for the first login.");
      return;
    }
    codeBox.hidden = false;
    setStatus(data.warning || "Telegram login code sent. Enter it below.");
  } finally {
    connectBtn.textContent = "Connect";
    connectBtn.disabled = false;
  }
}

async function verify() {
  verifyBtn.disabled = true;
  verifyBtn.textContent = "Verifying...";
  try {
    const data = await request("/api/verify", {
      method: "POST",
      body: JSON.stringify({
        code: document.querySelector("#code").value,
        password: document.querySelector("#password").value,
      }),
    });
    if (data.password_required) {
      setStatus("2FA password is required.");
      return;
    }
    await refreshStatus();
  } finally {
    verifyBtn.textContent = "Verify";
    verifyBtn.disabled = false;
  }
}

function localDateTimeValue(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function setDateRange(range) {
  const dateFrom = document.querySelector("#dateFrom");
  const dateTo = document.querySelector("#dateTo");
  datePresetButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.dateRange === range);
  });

  if (range === "all") {
    dateFrom.value = "";
    dateTo.value = "";
    return;
  }

  const end = new Date();
  const start = new Date(end);
  start.setHours(0, 0, 0, 0);
  if (range === "3days") start.setDate(start.getDate() - 2);
  if (range === "7days") start.setDate(start.getDate() - 6);
  dateFrom.value = localDateTimeValue(start);
  dateTo.value = localDateTimeValue(end);
}

function syncChannelSelection() {
  const channelInput = document.querySelector("#channel");
  const isDirect = channelSelect.value === "";
  directChannelField.hidden = !isDirect;

  if (channelSelect.value === "__all__") {
    channelInput.value = "전체 저장 채널";
    channelInput.disabled = true;
  } else if (channelSelect.value.startsWith("__group__:")) {
    const group = savedGroups.find((item) => `__group__:${item.id}` === channelSelect.value);
    channelInput.value = group ? `${group.name} · ${group.channel_ids.length}개 채널` : "모니터링 목록";
    channelInput.disabled = true;
  } else if (isDirect) {
    channelInput.value = channelInput.value === "전체 저장 채널" ? "" : channelInput.value;
    channelInput.disabled = false;
    advancedFilters.open = true;
  } else {
    channelInput.value = channelSelect.value;
    channelInput.disabled = true;
  }
}

async function loadPosts({ append = false } = {}) {
  currentChannel = channelSelect.value || document.querySelector("#channel").value.trim() || "TasnimNews";
  currentSearch = document.querySelector("#search").value.trim();
  currentDateFrom = document.querySelector("#dateFrom").value.trim();
  currentDateTo = document.querySelector("#dateTo").value.trim();
  const limit = document.querySelector("#limit").value || "100";
  const translateLanguages = selectedLanguages(".searchLanguage");
  const params = new URLSearchParams({ channel: currentChannel, limit });
  if (currentSearch) params.set("search", currentSearch);
  if (currentDateFrom) params.set("date_from", currentDateFrom);
  if (currentDateTo) params.set("date_to", currentDateTo);
  if (translateLanguages.length) params.set("translate_languages", translateLanguages.join(","));
  params.set("content_filter", document.querySelector("#contentFilter").value);
  if (append && nextOffset) {
    if (typeof nextOffset === "object") {
      params.set("offset_state", JSON.stringify(nextOffset));
    } else {
      params.set("offset_id", nextOffset);
    }
  }

  loadMoreBtn.disabled = true;
  if (!append) {
    posts.innerHTML = `<div class="empty">Loading posts...</div>`;
    nextOffset = null;
    loadedItems = [];
    resultSearch.value = "";
    resultFilterGroups = [];
    resultTranslationNote = "";
    resultTranslationSequence += 1;
    resultSearch.disabled = true;
    clearResultSearch.disabled = true;
    resultSearchCount.textContent = "게시글을 불러오는 중입니다.";
  }

  try {
    const data = await request(`/api/posts?${params.toString()}`);
    if (append) {
      const seen = new Set(loadedItems.map((item) => `${item.channel || data.channel}:${item.id}`));
      const freshItems = data.items.filter((item) => {
        const key = `${item.channel || data.channel}:${item.id}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      loadedItems = loadedItems.concat(freshItems);
      renderPosts();
      if (!freshItems.length) posts.insertAdjacentHTML("beforeend", `<div class="empty">No more posts.</div>`);
    } else {
      loadedItems = data.items;
      renderPosts();
    }
    nextOffset = data.next_offset;
    currentExportChannel = data.channel || currentChannel;
    const hasNext = nextOffset && (
      typeof nextOffset === "object" ? Object.values(nextOffset).some(Boolean) : Boolean(nextOffset)
    );
    loadMoreBtn.disabled = !hasNext || !data.items.length;
    downloadBtn.disabled = !loadedItems.length;
    resultTitle.textContent = data.mode === "group"
      ? `모니터링 목록 · ${data.group_name}`
      : data.mode === "multi" ? "전체 저장 채널" : `@${data.channel}`;
    const filterBits = [];
    if ((data.mode === "multi" || data.mode === "group") && data.channels) {
      filterBits.push(`${data.channels.length}개 채널`);
    }
    if (currentSearch) filterBits.push(`검색어: ${currentSearch.replace(/\n+/g, ", ")}`);
    if (data.translated_searches && data.translated_searches.length) {
      filterBits.push(`${translateLanguages.map((code) => languageLabels[code]).join("·")}로 변환해 검색`);
    }
    if (data.translation_warning) filterBits.push(data.translation_warning);
    const contentLabels = {
      all: "전체 글",
      with_media: "미디어 포함",
      with_photo: "사진 포함",
      with_video: "영상 포함",
    };
    const contentFilter = document.querySelector("#contentFilter").value;
    if (contentFilter !== "all") filterBits.push(contentLabels[contentFilter]);
    if (currentDateFrom || currentDateTo) filterBits.push(`기간: ${currentDateFrom || "처음"} ~ ${currentDateTo || "현재"}`);
    resultMeta.textContent = `${loadedItems.length}개 불러옴${filterBits.length ? ` · ${filterBits.join(" · ")}` : ""}`;
  } catch (error) {
    renderError(error.message);
    resultMeta.textContent = "Load failed.";
  }
}

async function downloadForAi() {
  if (!loadedItems.length) return;
  downloadBtn.disabled = true;
  downloadBtn.textContent = "Saving...";
  try {
    const data = await request("/api/export", {
      method: "POST",
      body: JSON.stringify({
        channel: currentExportChannel,
        search: currentSearch,
        date_from: currentDateFrom,
        date_to: currentDateTo,
        items: loadedItems,
      }),
    });
    resultMeta.textContent = `${loadedItems.length} loaded · saved to ${data.path}`;
  } catch (error) {
    renderError(error.message);
    resultMeta.textContent = "Save failed.";
  } finally {
    downloadBtn.textContent = "Save to Folder";
    downloadBtn.disabled = !loadedItems.length;
  }
}

async function downloadVideo(button) {
  const channel = button.dataset.channel;
  const id = button.dataset.id;
  button.disabled = true;
  button.textContent = "Downloading...";
  try {
    const data = await request("/api/download-video", {
      method: "POST",
      body: JSON.stringify({ channel, id }),
    });
    const size = data.size ? ` (${Math.round(data.size / 1024 / 1024)} MB)` : "";
    button.textContent = data.cached ? "Video Cached" : "Video Saved";
    resultMeta.textContent = `Video saved to ${data.path}${size}`;
  } catch (error) {
    button.textContent = "Download Video";
    button.disabled = false;
    resultMeta.textContent = error.message;
  }
}

document.querySelector("#refreshStatus").addEventListener("click", refreshStatus);
connectBtn.addEventListener("click", () => connect().catch((error) => setStatus(error.message)));
verifyBtn.addEventListener("click", () => verify().catch((error) => setStatus(error.message)));
document.querySelector("#loadBtn").addEventListener("click", () => loadPosts());
loadMoreBtn.addEventListener("click", () => loadPosts({ append: true }));
downloadBtn.addEventListener("click", () => downloadForAi());
posts.addEventListener("click", (event) => {
  const button = event.target.closest(".downloadVideoBtn");
  if (button) downloadVideo(button);
});
channelSelect.addEventListener("change", syncChannelSelection);
datePresetButtons.forEach((button) => {
  button.addEventListener("click", () => setDateRange(button.dataset.dateRange));
});
[document.querySelector("#dateFrom"), document.querySelector("#dateTo")].forEach((input) => {
  input.addEventListener("change", () => datePresetButtons.forEach((button) => button.classList.remove("active")));
});
document.querySelector("#search").addEventListener("keydown", (event) => {
  if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) loadPosts();
});
resultSearch.addEventListener("input", scheduleResultTranslation);
document.querySelectorAll(".resultLanguage").forEach((input) => {
  input.addEventListener("change", scheduleResultTranslation);
});
clearResultSearch.addEventListener("click", () => {
  resultSearch.value = "";
  scheduleResultTranslation();
  resultSearch.focus();
});
saveDownloadDirBtn.addEventListener("click", () => saveDownloadDir());
saveChannelsBtn.addEventListener("click", () => saveChannels());
browseDownloadDirBtn.addEventListener("click", () => browseDownloadDir());
addChannelBtn.addEventListener("click", () => channelRows.appendChild(channelRow()));
addGroupBtn.addEventListener("click", () => {
  const emptyState = groupRows.querySelector(".emptyGroupState");
  if (emptyState) emptyState.remove();
  groupRows.appendChild(groupRow());
});
saveGroupsBtn.addEventListener("click", () => saveGroups());
toggleSettingsBtn.addEventListener("click", () => {
  setSettingsExpanded(settingsPanel.classList.contains("collapsed"));
});

refreshStatus();
loadChannels();
loadSettings();

// Heartbeat logic to automatically shut down server when browser is closed
async function sendHeartbeat() {
  try {
    await fetch("/api/heartbeat", { method: "POST" });
  } catch (err) {
    // Ignore network errors when server goes down
  }
}
setInterval(sendHeartbeat, 10000);
sendHeartbeat();
