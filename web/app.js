const statusText = document.querySelector("#statusText");
const authPanel = document.querySelector("#authPanel");
const codeBox = document.querySelector("#codeBox");
const posts = document.querySelector("#posts");
const resultTitle = document.querySelector("#resultTitle");
const resultMeta = document.querySelector("#resultMeta");
const loadMoreBtn = document.querySelector("#loadMoreBtn");
const translateBtn = document.querySelector("#translateBtn");
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

let nextOffset = null;
let currentChannel = "TasnimNews";
let currentSearch = "";
let currentDateFrom = "";
let currentDateTo = "";
let isAuthorized = false;
let loadedItems = [];
let savedChannels = [];

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
  statusText.className = ok ? "ok" : "";
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
  const translation = item.translation_ko
    ? `<div class="translation"><div class="translationLabel">Korean translation</div><div class="translationText">${escapeHtml(item.translation_ko)}</div></div>`
    : "";
  const meta = [
    `#${item.id}`,
    formatDate(item.date),
    item.views != null ? `views ${item.views}` : "",
    item.forwards != null ? `forwards ${item.forwards}` : "",
    item.replies != null ? `replies ${item.replies}` : "",
    item.media_type ? `media ${item.media_type}` : item.has_media ? "media" : "",
  ].filter(Boolean);

  return `
    <article class="post">
      <div class="postMeta">${meta.map(escapeHtml).join("<span> - </span>")}</div>
      <div class="postText ${dirClass}">${escapeHtml(text)}</div>
      ${translation}
      <div class="postActions"><a href="${escapeHtml(item.link)}" target="_blank" rel="noreferrer">Open in Telegram</a></div>
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

function renderPosts() {
  posts.innerHTML = loadedItems.length
    ? loadedItems.map(postCard).join("")
    : `<div class="empty">No posts found.</div>`;
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
    const data = await request("/api/channels");
    const channels = data.channels || [];
    const normalized = channels.map((item) => {
      if (typeof item === "string") return { id: item, label: item };
      return { id: item.id, label: item.label || item.id };
    }).filter((item) => item.id);
    savedChannels = normalized;
    renderChannelRows(normalized);
    channelSelect.innerHTML = [
      `<option value="">Custom channel</option>`,
      ...normalized.map((channel) => {
        const label = channel.label === channel.id ? channel.id : `${channel.label} (@${channel.id})`;
        return `<option value="${escapeHtml(channel.id)}">${escapeHtml(label)}</option>`;
      }),
    ].join("");
    if (normalized.length) {
      channelSelect.value = normalized[0].id;
      document.querySelector("#channel").value = normalized[0].id;
    }
  } catch (error) {
    channelSelect.innerHTML = `<option value="">Custom channel</option>`;
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
  const payload = {
    api_id: document.querySelector("#apiId").value,
    api_hash: document.querySelector("#apiHash").value,
    phone: document.querySelector("#phone").value,
  };
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
  setStatus("Telegram login code sent. Enter it below.");
}

async function verify() {
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
}

async function loadPosts({ append = false } = {}) {
  currentChannel = document.querySelector("#channel").value.trim() || "TasnimNews";
  currentSearch = document.querySelector("#search").value.trim();
  currentDateFrom = document.querySelector("#dateFrom").value.trim();
  currentDateTo = document.querySelector("#dateTo").value.trim();
  const limit = document.querySelector("#limit").value || "30";
  const params = new URLSearchParams({ channel: currentChannel, limit });
  if (currentSearch) params.set("search", currentSearch);
  if (currentDateFrom) params.set("date_from", currentDateFrom);
  if (currentDateTo) params.set("date_to", currentDateTo);
  if (document.querySelector("#koreanSearch").checked) params.set("korean_search", "true");
  params.set("content_filter", document.querySelector("#contentFilter").value);
  if (append && nextOffset) params.set("offset_id", nextOffset);

  loadMoreBtn.disabled = true;
  if (!append) {
    posts.innerHTML = `<div class="empty">Loading posts...</div>`;
    nextOffset = null;
    loadedItems = [];
  }

  try {
    const data = await request(`/api/posts?${params.toString()}`);
    if (append) {
      loadedItems = loadedItems.concat(data.items);
      renderPosts();
      if (!data.items.length) posts.insertAdjacentHTML("beforeend", `<div class="empty">No more posts.</div>`);
    } else {
      loadedItems = data.items;
      renderPosts();
    }
    nextOffset = data.next_offset;
    loadMoreBtn.disabled = !nextOffset || !data.items.length;
    translateBtn.disabled = !loadedItems.length;
    downloadBtn.disabled = !loadedItems.length;
    resultTitle.textContent = `@${data.channel}`;
    const filterBits = [];
    if (currentSearch) filterBits.push(`search: ${currentSearch.replace(/\n+/g, ", ")}`);
    filterBits.push(`content: ${document.querySelector("#contentFilter").value}`);
    if (data.effective_searches && data.effective_searches.length) {
      filterBits.push(`effective: ${data.effective_searches.join(", ")}`);
    }
    if (currentDateFrom || currentDateTo) filterBits.push(`date: ${currentDateFrom || "..."} to ${currentDateTo || "..."}`);
    resultMeta.textContent = `${loadedItems.length} loaded${filterBits.length ? ` · ${filterBits.join(" · ")}` : ""}`;
  } catch (error) {
    renderError(error.message);
    resultMeta.textContent = "Load failed.";
  }
}

async function translateLoaded() {
  if (!loadedItems.length) return;
  translateBtn.disabled = true;
  translateBtn.textContent = "Translating...";
  try {
    const data = await request("/api/translate", {
      method: "POST",
      body: JSON.stringify({
        items: loadedItems.map((item) => ({ id: item.id, text: item.text || "" })),
      }),
    });
    const byId = new Map(data.items.map((item) => [item.id, item.translation_ko]));
    loadedItems = loadedItems.map((item) => ({
      ...item,
      translation_ko: byId.get(item.id) || item.translation_ko || "",
    }));
    renderPosts();
    resultMeta.textContent = `${loadedItems.length} loaded · translated to Korean${currentSearch ? ` · search: ${currentSearch}` : ""}`;
  } catch (error) {
    renderError(error.message);
    resultMeta.textContent = "Translation failed.";
  } finally {
    translateBtn.textContent = "Translate Loaded";
    translateBtn.disabled = !loadedItems.length;
    downloadBtn.disabled = !loadedItems.length;
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
        channel: currentChannel,
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

document.querySelector("#refreshStatus").addEventListener("click", refreshStatus);
document.querySelector("#connectBtn").addEventListener("click", () => connect().catch((error) => setStatus(error.message)));
document.querySelector("#verifyBtn").addEventListener("click", () => verify().catch((error) => setStatus(error.message)));
document.querySelector("#loadBtn").addEventListener("click", () => loadPosts());
loadMoreBtn.addEventListener("click", () => loadPosts({ append: true }));
translateBtn.addEventListener("click", () => translateLoaded());
downloadBtn.addEventListener("click", () => downloadForAi());
channelSelect.addEventListener("change", () => {
  if (channelSelect.value) document.querySelector("#channel").value = channelSelect.value;
});
saveDownloadDirBtn.addEventListener("click", () => saveDownloadDir());
saveChannelsBtn.addEventListener("click", () => saveChannels());
browseDownloadDirBtn.addEventListener("click", () => browseDownloadDir());
addChannelBtn.addEventListener("click", () => channelRows.appendChild(channelRow()));

refreshStatus();
loadChannels();
loadSettings();
