const placements = JSON.parse(localStorage.getItem("placements") || "{}");
const positions = JSON.parse(localStorage.getItem("positions") || "{}");

const topicGroupsEl = document.getElementById("topicGroups");
const boardEl = document.getElementById("board");
const promptListEl = document.getElementById("promptList");
const exportBtn = document.getElementById("exportBtn");
const resetBtn = document.getElementById("resetBtn");
const themeBtn = document.getElementById("themeBtn");
const modal = document.getElementById("modal");
const modalTitle = document.getElementById("modalTitle");
const modalList = document.getElementById("modalList");

let data = null;
let boardReady = false;
let resizeQueued = false;
let boardMetrics = { width: 0, height: 0 };

async function loadYaml(path) {
  const response = await fetch(path);
  const text = await response.text();
  return jsyaml.load(text);
}

function save() {
  localStorage.setItem("placements", JSON.stringify(placements));
  localStorage.setItem("positions", JSON.stringify(positions));
}

function ensureShape() {
  if (!data || !Array.isArray(data.groups)) throw new Error("topics.yml must contain a top-level 'groups' array");
  if (!Array.isArray(data.prompts)) throw new Error("topics.yml must contain a top-level 'prompts' array");
  if (!data.quadrants || !Array.isArray(data.quadrants.quadrants)) throw new Error("quadrants.yml must contain a top-level 'quadrants' array");
}

function renderPrompts() {
  promptListEl.innerHTML = data.prompts.map(p => `<li>${p}</li>`).join("");
}

function openGroup(groupName) {
  const group = data.groups.find(g => g.name === groupName);
  if (!group) return;
  modalTitle.textContent = group.name;
  modalList.innerHTML = group.topics.map(topic => `<li>${topic}</li>`).join("");
  modal.showModal();
}

function allTopics() {
  return data.groups.flatMap(group =>
    group.topics.map(topic => ({
      group: group.name,
      topic,
      key: `${group.name}::${topic}`
    }))
  );
}

function renderTopicGroups() {
  const html = data.groups.map(group => {
    const availableTopics = group.topics.filter(topic => !placements[`${group.name}::${topic}`]);
    return `
      <details class="group" data-group="${group.name}">
        <summary>
          <span>${group.name}</span>
          <span class="group-meta">${availableTopics.length}/${group.topics.length} visible</span>
        </summary>
        <div class="group-body">
          ${availableTopics.length ? availableTopics.map(topic => {
            const key = `${group.name}::${topic}`;
            return `
              <div class="topic-chip" draggable="true" data-key="${key}">
                <span>${topic}</span>
                <small class="pill">${group.name}</small>
              </div>
            `;
          }).join("") : `<div class="helper">All topics from this group are on the board.</div>`}
        </div>
      </details>
    `;
  }).join("");

  topicGroupsEl.innerHTML = html;

  topicGroupsEl.querySelectorAll("details.group").forEach(details => {
    details.addEventListener("toggle", () => {
      if (details.open) {
        topicGroupsEl.querySelectorAll("details.group").forEach(other => {
          if (other !== details) other.open = false;
        });
      }
    });
  });

  topicGroupsEl.querySelectorAll(".group").forEach(group => {
    group.addEventListener("click", e => {
      if (e.target.closest(".topic-chip")) return;
      if (e.target.closest("summary")) return;
      openGroup(group.dataset.group);
    });
  });

  enableDragging();
}

function fitBoardToViewport() {
  const shell = document.querySelector(".board-shell");
  const rect = shell.getBoundingClientRect();
  boardMetrics.width = Math.max(1, Math.floor(rect.width));
  boardMetrics.height = Math.max(1, Math.floor(rect.height));
  boardEl.style.width = `${boardMetrics.width}px`;
  boardEl.style.height = `${boardMetrics.height}px`;
}

function scheduleBoardResize() {
  if (resizeQueued) return;
  resizeQueued = true;
  requestAnimationFrame(() => {
    resizeQueued = false;
    fitBoardToViewport();
    renderBoard();
  });
}

function attachResizeObservers() {
  const ro = new ResizeObserver(() => scheduleBoardResize());
  ro.observe(document.querySelector(".layout"));
  ro.observe(document.querySelector(".board-shell"));
  window.addEventListener("resize", scheduleBoardResize);
}

function boardWidth() {
  return boardMetrics.width || boardEl.getBoundingClientRect().width || 1;
}

function boardHeight() {
  return boardMetrics.height || boardEl.getBoundingClientRect().height || 1;
}

function quadrantForPoint(x, y) {
  const r = boardEl.getBoundingClientRect();
  const nx = x - r.left;
  const ny = y - r.top;
  const left = nx < r.width / 2 ? "left" : "right";
  const top = ny < r.height / 2 ? "top" : "bottom";
  if (top === "top" && left === "left") return "used-daily";
  if (top === "top" && left === "right") return "mastered";
  if (top === "bottom" && left === "left") return "discovering";
  return "struggling";
}

function quadrantCenter(id) {
  const w = boardWidth();
  const h = boardHeight();
  const padX = Math.max(80, w * 0.08);
  const padY = Math.max(80, h * 0.08);
  const map = {
    "used-daily": { x: w * 0.28, y: h * 0.25 },
    "mastered": { x: w * 0.72, y: h * 0.25 },
    "discovering": { x: w * 0.28, y: h * 0.72 },
    "struggling": { x: w * 0.72, y: h * 0.72 }
  };
  const p = map[id] || { x: w * 0.3, y: h * 0.3 };
  return {
    x: Math.max(padX, Math.min(w - padX, p.x)),
    y: Math.max(padY, Math.min(h - padY, p.y))
  };
}

function attachBoardDropHandlers() {
  if (boardReady) return;
  boardReady = true;

  boardEl.addEventListener("dragover", e => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  });

  boardEl.addEventListener("drop", e => {
    e.preventDefault();

    const payload = JSON.parse(e.dataTransfer.getData("text/plain"));
    const r = boardEl.getBoundingClientRect();

    const cardWidth = 210;
    const cardHeight = 78;

    const x = Math.max(0, Math.min(r.width - cardWidth, e.clientX - r.left - cardWidth / 2));
    const y = Math.max(0, Math.min(r.height - cardHeight, e.clientY - r.top - cardHeight / 2));

    positions[payload.key] = {
      xPct: x / r.width,
      yPct: y / r.height
    };
    placements[payload.key] = quadrantForPoint(e.clientX, e.clientY);

    save();
    renderTopicGroups();
    renderBoard();
  });
}

function enableDragging() {
  document.querySelectorAll(".topic-chip").forEach(chip => {
    chip.addEventListener("dragstart", e => {
      chip.classList.add("dragging");
      e.dataTransfer.setData("text/plain", JSON.stringify({ key: chip.dataset.key }));
      e.dataTransfer.effectAllowed = "move";
    });

    chip.addEventListener("dragend", () => {
      chip.classList.remove("dragging");
    });
  });
}

function makeCardDraggable(card) {
  let offsetX = 0;
  let offsetY = 0;
  let dragging = false;

  card.addEventListener("pointerdown", e => {
    if (e.target.closest(".remove-btn")) return;
    dragging = true;
    card.setPointerCapture(e.pointerId);
    const rect = card.getBoundingClientRect();
    offsetX = e.clientX - rect.left;
    offsetY = e.clientY - rect.top;
    card.style.zIndex = 50;
  });

  card.addEventListener("pointermove", e => {
    if (!dragging) return;
    const r = boardEl.getBoundingClientRect();
    const w = card.offsetWidth;
    const h = card.offsetHeight;
    const x = e.clientX - r.left - offsetX;
    const y = e.clientY - r.top - offsetY;
    const nx = Math.max(0, Math.min(r.width - w, x));
    const ny = Math.max(0, Math.min(r.height - h, y));
    positions[card.dataset.key] = {
      xPct: nx / r.width,
      yPct: ny / r.height
    };
    save();
    card.style.left = `${nx}px`;
    card.style.top = `${ny}px`;
  });

  card.addEventListener("pointerup", e => {
    if (!dragging) return;
    dragging = false;
    card.releasePointerCapture(e.pointerId);
    card.style.zIndex = 10;

    const pos = positions[card.dataset.key];
    if (pos) {
      const r = boardEl.getBoundingClientRect();
      const centerX = (pos.xPct * r.width) + card.offsetWidth / 2;
      const centerY = (pos.yPct * r.height) + card.offsetHeight / 2;
      placements[card.dataset.key] = quadrantForPoint(
        boardEl.getBoundingClientRect().left + centerX,
        boardEl.getBoundingClientRect().top + centerY
      );
      save();
      renderTopicGroups();
      renderBoard();
    }
  });
}

function renderBoard() {
  const cards = allTopics().filter(item => placements[item.key]);

  boardEl.innerHTML = `
    <div class="quadrant-bg" aria-hidden="true">
      <div class="q1"></div>
      <div class="q2"></div>
      <div class="q3"></div>
      <div class="q4"></div>
    </div>
    <div class="quadrant-label q-label-1">Used daily</div>
    <div class="quadrant-label q-label-2">Mastered</div>
    <div class="quadrant-label q-label-3">Discovering</div>
    <div class="quadrant-label q-label-4">Struggling with</div>
    <div class="drop-layer" id="dropLayer">
      ${cards.length ? cards.map(item => {
        const r = boardEl.getBoundingClientRect();
        const pos = positions[item.key];
        const px = pos ? pos.xPct * r.width : quadrantCenter(placements[item.key]).x;
        const py = pos ? pos.yPct * r.height : quadrantCenter(placements[item.key]).y;
        return `
          <div class="card" data-key="${item.key}" style="left:${px}px; top:${py}px;">
            <div class="row">
              <div>
                <strong>${item.topic}</strong>
                <small>${item.group}</small>
              </div>
              <button class="remove-btn" data-remove="${item.key}" type="button" aria-label="Remove ${item.topic}">×</button>
            </div>
          </div>
        `;
      }).join("") : `<div class="placeholder">Drag topics here. Cards can overlap the quadrant lines.</div>`}
    </div>
  `;

  attachBoardDropHandlers();

  boardEl.querySelectorAll(".card").forEach(card => {
    makeCardDraggable(card);
  });

  boardEl.querySelectorAll("[data-remove]").forEach(btn => {
    btn.addEventListener("click", e => {
      e.stopPropagation();
      delete placements[btn.dataset.remove];
      delete positions[btn.dataset.remove];
      save();
      renderTopicGroups();
      renderBoard();
    });
  });
}

function applyTheme() {
  const saved = localStorage.getItem("theme") || "light";
  document.documentElement.dataset.theme = saved;
  themeBtn.textContent = saved === "dark" ? "☀" : "☾";
}

function toggleTheme() {
  const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  localStorage.setItem("theme", next);
  applyTheme();
}

function exportJson() {
  const payload = {
    exportedAt: new Date().toISOString(),
    placements,
    positions,
    topics: data.groups
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "workshop-results.json";
  a.click();
  URL.revokeObjectURL(url);
}

function resetBoard() {
  Object.keys(placements).forEach(key => delete placements[key]);
  Object.keys(positions).forEach(key => delete positions[key]);
  save();
  renderTopicGroups();
  renderBoard();
}

async function init() {
  applyTheme();

  const [quadrants, topics] = await Promise.all([
    loadYaml("_data/quadrants.yml"),
    loadYaml("_data/topics.yml")
  ]);

  data = {
    quadrants,
    groups: topics.groups,
    prompts: topics.prompts
  };

  ensureShape();
  renderPrompts();
  renderTopicGroups();
  fitBoardToViewport();
  attachResizeObservers();
  renderBoard();

  exportBtn.addEventListener("click", exportJson);
  resetBtn.addEventListener("click", resetBoard);
  themeBtn.addEventListener("click", toggleTheme);
}

init().catch(err => {
  document.body.innerHTML = `<pre style="padding:2rem;color:#b91c1c">Failed to load YAML: ${err.message}</pre>`;
});
