const state = {
  status: "all",
  keyword: "",
  category: "all",
  minPrice: "",
  maxPrice: "",
  dateRange: "all",
  hasRisk: false,
  sortBy: "updatedAt",
  sortOrder: "desc",
  devices: [],
  selectedId: null
};

const statusLabels = {
  received: "待质检",
  quoted: "待确认",
  recycled: "已回收",
  rejected: "已拒绝",
  listed: "已上架"
};

const categoryLabels = {
  phone: "手机",
  laptop: "笔记本",
  camera: "相机",
  console: "游戏机",
  tablet: "平板",
  headphone: "耳机"
};

const conditionText = {
  none: "无明显问题",
  visible: "可见瑕疵",
  cracked: "破损",
  good: "良好",
  service: "需维护",
  poor: "严重衰减",
  clean: "整洁",
  worn: "磨损",
  dented: "磕碰变形",
  normal: "正常",
  minor: "轻微异常",
  major: "严重异常"
};

const els = {
  todayText: document.querySelector("#todayText"),
  metrics: document.querySelector("#metrics"),
  list: document.querySelector("#deviceList"),
  detail: document.querySelector("#detailPanel"),
  listCount: document.querySelector("#listCount"),
  createForm: document.querySelector("#createForm"),
  statusTabs: document.querySelector("#statusTabs"),
  keywordInput: document.querySelector("#keywordInput"),
  refreshBtn: document.querySelector("#refreshBtn"),
  toast: document.querySelector("#toast"),
  categoryFilter: document.querySelector("#categoryFilter"),
  minPriceFilter: document.querySelector("#minPriceFilter"),
  maxPriceFilter: document.querySelector("#maxPriceFilter"),
  dateRangeFilter: document.querySelector("#dateRangeFilter"),
  riskFilter: document.querySelector("#riskFilter"),
  sortByFilter: document.querySelector("#sortByFilter"),
  sortOrderFilter: document.querySelector("#sortOrderFilter"),
  resetFiltersBtn: document.querySelector("#resetFiltersBtn")
};

function money(value) {
  return `￥${Number(value || 0).toLocaleString("zh-CN")}`;
}

function dateText(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("show");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => els.toast.classList.remove("show"), 2200);
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "请求失败");
  }
  return data;
}

function formJson(form) {
  return Object.fromEntries(new FormData(form).entries());
}

function renderMetrics(data) {
  const items = [
    ["设备总数", data.total],
    ["待质检", data.counts.received || 0],
    ["待确认", data.counts.quoted || 0],
    ["已回收", data.counts.recycled || 0],
    ["平均报价", money(data.averageQuote)],
    ["预计毛利", money(data.estimatedMargin)]
  ];

  els.metrics.innerHTML = items
    .map(
      ([label, value]) => `
        <div class="metric">
          <span>${label}</span>
          <strong>${value}</strong>
        </div>
      `
    )
    .join("");
}

function renderList() {
  els.listCount.textContent = `${state.devices.length} 台`;
  if (!state.devices.length) {
    els.list.innerHTML = `<div class="empty-state"><p>没有匹配的设备。</p></div>`;
    return;
  }

  els.list.innerHTML = state.devices
    .map(
      (device) => `
        <button class="device-row ${device.id === state.selectedId ? "active" : ""}" data-id="${device.id}">
          <div class="device-row-title">
            <h4>${device.brand} ${device.model}</h4>
            <span class="badge ${device.status}">${statusLabels[device.status]}</span>
          </div>
          <p>${device.code} · ${categoryLabels[device.category] || device.category} · ${device.serialNumber}</p>
          <p>${device.ownerName} ${device.ownerPhone} · 更新 ${dateText(device.updatedAt)}</p>
        </button>
      `
    )
    .join("");
}

function infoBox(label, value) {
  return `<div class="info-box"><span>${label}</span><strong>${value || "-"}</strong></div>`;
}

function renderDetail(device) {
  if (!device) {
    els.detail.innerHTML = `
      <div class="empty-state">
        <h3>选择一台设备</h3>
        <p>查看质检、报价、客户确认和入库信息。</p>
      </div>
    `;
    return;
  }

  const inspection = device.inspection;
  const risks = inspection?.riskFlags?.length
    ? inspection.riskFlags.map((item) => `<span>${item}</span>`).join("")
    : "<span>暂无风险标记</span>";

  els.detail.innerHTML = `
    <div class="detail-stack">
      <div class="detail-heading">
        <div>
          <h3>${device.brand} ${device.model}</h3>
          <p class="meta-line">${device.code} · ${categoryLabels[device.category] || device.category}</p>
        </div>
        <span class="badge ${device.status}">${statusLabels[device.status]}</span>
      </div>

      <div class="info-grid">
        ${infoBox("序列号", device.serialNumber)}
        ${infoBox("客户", `${device.ownerName} ${device.ownerPhone}`)}
        ${infoBox("来源", device.sourceChannel)}
        ${infoBox("预期价格", money(device.expectedPrice))}
        ${infoBox("随机配件", device.accessories?.join("，") || "无")}
        ${infoBox("登记时间", dateText(device.createdAt))}
      </div>

      <div class="section-line">
        <h4>客户描述</h4>
        <p class="meta-line">${device.issueDescription || "未填写"}</p>
      </div>

      <div class="section-line">
        <h4>质检报价</h4>
        ${inspection ? renderQuote(inspection) : renderInspectionForm(device)}
      </div>

      ${
        inspection
          ? `<div class="section-line">
              <h4>风险标记</h4>
              <div class="risk-list">${risks}</div>
            </div>`
          : ""
      }

      ${renderDecisionArea(device)}
      ${renderListingArea(device)}
    </div>
  `;
}

function renderQuote(inspection) {
  return `
    <div class="quote-box">
      <div class="quote-item"><span>质检分</span><strong>${inspection.score}</strong></div>
      <div class="quote-item"><span>等级</span><strong>${inspection.grade}</strong></div>
      <div class="quote-item"><span>报价</span><strong>${money(inspection.quotePrice)}</strong></div>
      <div class="quote-item"><span>质检员</span><strong>${inspection.inspector}</strong></div>
    </div>
    <p class="meta-line">
      屏幕：${conditionText[inspection.screenCondition]} · 电池：${conditionText[inspection.batteryCondition]} ·
      外观：${conditionText[inspection.bodyCondition]} · 功能：${conditionText[inspection.functionCondition]} ·
      维修成本：${money(inspection.repairCost)}
    </p>
    <p class="meta-line">${inspection.notes || "无备注"}</p>
  `;
}

function renderInspectionForm(device) {
  return `
    <form class="inline-form" data-form="inspection" data-id="${device.id}">
      <div class="two-cols">
        <label>
          屏幕
          <select name="screenCondition">
            <option value="none">无明显问题</option>
            <option value="visible">可见瑕疵</option>
            <option value="cracked">破损</option>
          </select>
        </label>
        <label>
          电池
          <select name="batteryCondition">
            <option value="good">良好</option>
            <option value="service">需维护</option>
            <option value="poor">严重衰减</option>
          </select>
        </label>
      </div>
      <div class="two-cols">
        <label>
          外观
          <select name="bodyCondition">
            <option value="clean">整洁</option>
            <option value="worn">磨损</option>
            <option value="dented">磕碰变形</option>
          </select>
        </label>
        <label>
          功能
          <select name="functionCondition">
            <option value="normal">正常</option>
            <option value="minor">轻微异常</option>
            <option value="major">严重异常</option>
          </select>
        </label>
      </div>
      <div class="two-cols">
        <label>
          缺配件数量
          <input name="missingAccessories" type="number" min="0" value="0" />
        </label>
        <label>
          维修成本
          <input name="repairCost" type="number" min="0" value="0" />
        </label>
      </div>
      <div class="two-cols">
        <label>
          质检员
          <input name="inspector" required value="质检员 A" />
        </label>
        <label class="checkbox-line">
          <input name="hasRepairLock" type="checkbox" value="true" />
          存在维修锁/账号锁风险
        </label>
      </div>
      <label>
        质检备注
        <textarea name="notes" rows="3" placeholder="功能、拆修、进水、外观细节"></textarea>
      </label>
      <button class="primary-btn" type="submit">生成报价</button>
    </form>
  `;
}

function renderDecisionArea(device) {
  if (!device.inspection || device.decision) {
    if (!device.decision) return "";
    return `
      <div class="section-line">
        <h4>客户确认</h4>
        <p class="meta-line">
          ${device.decision.decision === "accept" ? "客户接受报价" : "客户拒绝报价"} ·
          成交价 ${money(device.decision.finalPrice)} · ${dateText(device.decision.decidedAt)}
        </p>
        <p class="meta-line">${device.decision.note || "无备注"}</p>
      </div>
    `;
  }

  return `
    <div class="section-line">
      <h4>客户确认</h4>
      <div class="action-row">
        <button class="secondary-btn" data-action="accept" data-id="${device.id}">接受回收</button>
        <button class="danger-btn" data-action="reject" data-id="${device.id}">拒绝报价</button>
      </div>
    </div>
  `;
}

function renderListingArea(device) {
  if (device.status === "listed" && device.inventory) {
    const margin =
      device.inventory.targetPrice -
      (device.decision?.finalPrice || 0) -
      device.inventory.refurbishCost;
    return `
      <div class="section-line">
        <h4>入库上架</h4>
        <div class="quote-box">
          <div class="quote-item"><span>翻新成本</span><strong>${money(device.inventory.refurbishCost)}</strong></div>
          <div class="quote-item"><span>目标售价</span><strong>${money(device.inventory.targetPrice)}</strong></div>
          <div class="quote-item"><span>渠道</span><strong>${device.inventory.channel}</strong></div>
          <div class="quote-item"><span>预计毛利</span><strong>${money(margin)}</strong></div>
        </div>
      </div>
    `;
  }

  if (device.status !== "recycled") return "";
  return `
    <div class="section-line">
      <h4>入库上架</h4>
      <form class="inline-form" data-form="listing" data-id="${device.id}">
        <div class="two-cols">
          <label>
            翻新成本
            <input name="refurbishCost" type="number" min="0" value="0" />
          </label>
          <label>
            目标售价
            <input name="targetPrice" type="number" min="0" required value="${Math.round(
              (device.decision?.finalPrice || 0) * 1.25
            )}" />
          </label>
        </div>
        <label>
          销售渠道
          <input name="channel" required value="门店二手柜台" />
        </label>
        <button class="primary-btn" type="submit">登记上架</button>
      </form>
    </div>
  `;
}

async function load() {
  const params = new URLSearchParams();
  params.set("status", state.status);
  if (state.keyword) params.set("keyword", state.keyword);
  if (state.category !== "all") params.set("category", state.category);
  if (state.minPrice) params.set("minPrice", state.minPrice);
  if (state.maxPrice) params.set("maxPrice", state.maxPrice);
  if (state.dateRange !== "all") params.set("dateRange", state.dateRange);
  if (state.hasRisk) params.set("hasRisk", "true");
  params.set("sortBy", state.sortBy);
  params.set("sortOrder", state.sortOrder);

  const [dashboard, devices] = await Promise.all([
    api("/api/dashboard"),
    api(`/api/devices?${params.toString()}`)
  ]);

  state.devices = devices;
  if (state.selectedId && !devices.some((device) => device.id === state.selectedId)) {
    state.selectedId = devices[0]?.id || null;
  }
  if (!state.selectedId && devices[0]) {
    state.selectedId = devices[0].id;
  }

  renderMetrics(dashboard);
  renderList();
  const selected = devices.find((device) => device.id === state.selectedId);
  renderDetail(selected);
}

async function submitCreate(event) {
  event.preventDefault();
  const payload = formJson(event.currentTarget);
  try {
    const device = await api("/api/devices", {
      method: "POST",
      body: JSON.stringify(payload)
    });
    state.selectedId = device.id;
    event.currentTarget.reset();
    showToast("设备已登记");
    await load();
  } catch (error) {
    showToast(error.message);
  }
}

async function submitInspection(form) {
  const payload = formJson(form);
  payload.hasRepairLock = form.querySelector('[name="hasRepairLock"]').checked;
  payload.missingAccessories = Number(payload.missingAccessories || 0);
  payload.repairCost = Number(payload.repairCost || 0);

  await api(`/api/devices/${form.dataset.id}/inspection`, {
    method: "PATCH",
    body: JSON.stringify(payload)
  });
  showToast("报价已生成");
  await load();
}

async function submitListing(form) {
  const payload = formJson(form);
  payload.refurbishCost = Number(payload.refurbishCost || 0);
  payload.targetPrice = Number(payload.targetPrice || 0);

  await api(`/api/devices/${form.dataset.id}/listing`, {
    method: "PATCH",
    body: JSON.stringify(payload)
  });
  showToast("设备已上架");
  await load();
}

async function submitDecision(id, decision) {
  await api(`/api/devices/${id}/decision`, {
    method: "PATCH",
    body: JSON.stringify({ decision })
  });
  showToast(decision === "accept" ? "已进入回收入库" : "已标记为拒绝");
  await load();
}

els.createForm.addEventListener("submit", submitCreate);

els.statusTabs.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-status]");
  if (!button) return;
  state.status = button.dataset.status;
  state.selectedId = null;
  els.statusTabs.querySelectorAll("button").forEach((item) => item.classList.remove("active"));
  button.classList.add("active");
  load().catch((error) => showToast(error.message));
});

els.list.addEventListener("click", (event) => {
  const row = event.target.closest(".device-row");
  if (!row) return;
  state.selectedId = row.dataset.id;
  renderList();
  renderDetail(state.devices.find((device) => device.id === state.selectedId));
});

els.detail.addEventListener("submit", (event) => {
  const form = event.target.closest("form[data-form]");
  if (!form) return;
  event.preventDefault();
  const task = form.dataset.form === "inspection" ? submitInspection(form) : submitListing(form);
  task.catch((error) => showToast(error.message));
});

els.detail.addEventListener("click", (event) => {
  const action = event.target.closest("[data-action]");
  if (!action) return;
  submitDecision(action.dataset.id, action.dataset.action).catch((error) => showToast(error.message));
});

els.refreshBtn.addEventListener("click", () => load().catch((error) => showToast(error.message)));

els.keywordInput.addEventListener("input", (event) => {
  state.keyword = event.target.value.trim();
  window.clearTimeout(els.keywordInput.timer);
  els.keywordInput.timer = window.setTimeout(() => {
    state.selectedId = null;
    load().catch((error) => showToast(error.message));
  }, 250);
});

els.categoryFilter.addEventListener("change", (event) => {
  state.category = event.target.value;
  state.selectedId = null;
  load().catch((error) => showToast(error.message));
});

els.minPriceFilter.addEventListener("input", (event) => {
  state.minPrice = event.target.value;
  window.clearTimeout(els.minPriceFilter.timer);
  els.minPriceFilter.timer = window.setTimeout(() => {
    state.selectedId = null;
    load().catch((error) => showToast(error.message));
  }, 300);
});

els.maxPriceFilter.addEventListener("input", (event) => {
  state.maxPrice = event.target.value;
  window.clearTimeout(els.maxPriceFilter.timer);
  els.maxPriceFilter.timer = window.setTimeout(() => {
    state.selectedId = null;
    load().catch((error) => showToast(error.message));
  }, 300);
});

els.dateRangeFilter.addEventListener("change", (event) => {
  state.dateRange = event.target.value;
  state.selectedId = null;
  load().catch((error) => showToast(error.message));
});

els.riskFilter.addEventListener("change", (event) => {
  state.hasRisk = event.target.checked;
  state.selectedId = null;
  load().catch((error) => showToast(error.message));
});

els.sortByFilter.addEventListener("change", (event) => {
  state.sortBy = event.target.value;
  load().catch((error) => showToast(error.message));
});

els.sortOrderFilter.addEventListener("change", (event) => {
  state.sortOrder = event.target.value;
  load().catch((error) => showToast(error.message));
});

function resetFilters() {
  state.category = "all";
  state.minPrice = "";
  state.maxPrice = "";
  state.dateRange = "all";
  state.hasRisk = false;
  state.sortBy = "updatedAt";
  state.sortOrder = "desc";
  state.keyword = "";
  state.status = "all";
  state.selectedId = null;

  els.categoryFilter.value = "all";
  els.minPriceFilter.value = "";
  els.maxPriceFilter.value = "";
  els.dateRangeFilter.value = "all";
  els.riskFilter.checked = false;
  els.sortByFilter.value = "updatedAt";
  els.sortOrderFilter.value = "desc";
  els.keywordInput.value = "";
  els.statusTabs.querySelectorAll("button").forEach((item) => item.classList.remove("active"));
  els.statusTabs.querySelector('button[data-status="all"]').classList.add("active");

  load().catch((error) => showToast(error.message));
}

els.resetFiltersBtn.addEventListener("click", resetFilters);

els.todayText.textContent = new Date().toLocaleDateString("zh-CN", {
  year: "numeric",
  month: "long",
  day: "numeric",
  weekday: "long"
});

load().catch((error) => showToast(error.message));
