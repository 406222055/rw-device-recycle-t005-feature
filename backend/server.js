const http = require("http");
const fs = require("fs");
const path = require("path");
const { randomUUID } = require("crypto");
const { URL } = require("url");

const PORT = Number(process.env.PORT || 4177);
const backendRoot = __dirname;
const projectRoot = path.resolve(backendRoot, "..");
const frontendRoot = path.join(projectRoot, "frontend");
const dataDir = path.join(backendRoot, "data");
const storePath = path.join(dataDir, "storage.json");

const STATUS_LABELS = {
  received: "待质检",
  quoted: "待确认",
  recycled: "已回收",
  rejected: "已拒绝",
  listed: "已上架"
};

const categoryFactor = {
  phone: 1,
  laptop: 1.24,
  camera: 1.12,
  console: 0.92,
  tablet: 0.88,
  headphone: 0.52
};

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml"
};

function now() {
  return new Date().toISOString();
}

function ensureStore() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  if (!fs.existsSync(storePath)) {
    const seededAt = now();
    const seed = {
      devices: [
        {
          id: randomUUID(),
          code: "DR-260610-001",
          category: "phone",
          brand: "Apple",
          model: "iPhone 14 Pro 256G",
          serialNumber: "IP14P-DEMO-001",
          sourceChannel: "门店到店",
          ownerName: "陈先生",
          ownerPhone: "13800001111",
          expectedPrice: 3600,
          accessories: ["原装盒", "数据线"],
          issueDescription: "屏幕轻微划痕，电池健康 86%",
          status: "quoted",
          createdAt: seededAt,
          updatedAt: seededAt,
          inspection: {
            screenCondition: "visible",
            batteryCondition: "service",
            bodyCondition: "worn",
            functionCondition: "normal",
            hasRepairLock: false,
            missingAccessories: 1,
            repairCost: 120,
            notes: "Face ID 正常，摄像头无进灰。",
            score: 78,
            grade: "B",
            quotePrice: 2750,
            riskFlags: ["屏幕划痕", "电池需关注"],
            inspector: "质检员 A",
            inspectedAt: seededAt
          },
          decision: null,
          inventory: null
        }
      ]
    };
    fs.writeFileSync(storePath, JSON.stringify(seed, null, 2), "utf8");
  }
}

function readStore() {
  ensureStore();
  return JSON.parse(fs.readFileSync(storePath, "utf8"));
}

function writeStore(store) {
  fs.writeFileSync(storePath, JSON.stringify(store, null, 2), "utf8");
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(body);
}

function sendError(res, status, message, details) {
  sendJson(res, status, { error: message, details });
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(new Error("请求体过大"));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!body.trim()) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(new Error("JSON 格式不正确"));
      }
    });
    req.on("error", reject);
  });
}

function required(payload, fields) {
  const missing = fields.filter((field) => {
    const value = payload[field];
    return value === undefined || value === null || String(value).trim() === "";
  });
  if (missing.length) {
    throw new Error(`缺少字段：${missing.join(", ")}`);
  }
}

function normalizeAccessories(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  return String(value || "")
    .split(/[，,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function createDevice(payload, store) {
  required(payload, [
    "category",
    "brand",
    "model",
    "serialNumber",
    "sourceChannel",
    "ownerName",
    "ownerPhone"
  ]);

  const serialNumber = String(payload.serialNumber).trim();
  const exists = store.devices.some(
    (device) => device.serialNumber.toLowerCase() === serialNumber.toLowerCase()
  );
  if (exists) {
    const error = new Error("该序列号已经登记");
    error.status = 409;
    throw error;
  }

  const createdAt = now();
  const sequence = String(store.devices.length + 1).padStart(3, "0");
  const datePart = createdAt.slice(2, 10).replaceAll("-", "");

  return {
    id: randomUUID(),
    code: `DR-${datePart}-${sequence}`,
    category: String(payload.category).trim(),
    brand: String(payload.brand).trim(),
    model: String(payload.model).trim(),
    serialNumber,
    sourceChannel: String(payload.sourceChannel).trim(),
    ownerName: String(payload.ownerName).trim(),
    ownerPhone: String(payload.ownerPhone).trim(),
    expectedPrice: Math.max(0, Number(payload.expectedPrice || 0)),
    accessories: normalizeAccessories(payload.accessories),
    issueDescription: String(payload.issueDescription || "").trim(),
    status: "received",
    createdAt,
    updatedAt: createdAt,
    inspection: null,
    decision: null,
    inventory: null
  };
}

function calculateQuote(device, payload) {
  const screenDeduct = { none: 0, visible: 12, cracked: 30 };
  const batteryDeduct = { good: 0, service: 8, poor: 20 };
  const bodyDeduct = { clean: 0, worn: 6, dented: 16 };
  const functionDeduct = { normal: 0, minor: 12, major: 36 };

  const deduct =
    (screenDeduct[payload.screenCondition] ?? 0) +
    (batteryDeduct[payload.batteryCondition] ?? 0) +
    (bodyDeduct[payload.bodyCondition] ?? 0) +
    (functionDeduct[payload.functionCondition] ?? 0) +
    (payload.hasRepairLock ? 50 : 0);

  const score = Math.max(0, 100 - deduct);
  const grade = score >= 90 ? "A" : score >= 75 ? "B" : score >= 55 ? "C" : "D";
  const base = Math.max(Number(device.expectedPrice || 0), 200);
  const factor = categoryFactor[device.category] || 1;
  const missingCost = Math.max(0, Number(payload.missingAccessories || 0)) * 45;
  const repairCost = Math.max(0, Number(payload.repairCost || 0));
  const conditionRate = Math.max(0.12, score / 100);
  const rawQuote = base * factor * conditionRate - missingCost - repairCost;
  const quotePrice = Math.max(0, Math.round(rawQuote / 10) * 10);

  const riskFlags = [];
  if (payload.screenCondition === "cracked") riskFlags.push("屏幕破损");
  if (payload.batteryCondition === "poor") riskFlags.push("电池严重衰减");
  if (payload.functionCondition === "major") riskFlags.push("核心功能异常");
  if (payload.hasRepairLock) riskFlags.push("存在维修锁/账号锁风险");
  if (repairCost > base * 0.25) riskFlags.push("维修成本偏高");

  return { score, grade, quotePrice, riskFlags };
}

function updateInspection(device, payload) {
  required(payload, [
    "screenCondition",
    "batteryCondition",
    "bodyCondition",
    "functionCondition",
    "inspector"
  ]);

  const quote = calculateQuote(device, payload);
  const inspectedAt = now();
  device.inspection = {
    screenCondition: payload.screenCondition,
    batteryCondition: payload.batteryCondition,
    bodyCondition: payload.bodyCondition,
    functionCondition: payload.functionCondition,
    hasRepairLock: Boolean(payload.hasRepairLock),
    missingAccessories: Math.max(0, Number(payload.missingAccessories || 0)),
    repairCost: Math.max(0, Number(payload.repairCost || 0)),
    notes: String(payload.notes || "").trim(),
    score: quote.score,
    grade: quote.grade,
    quotePrice: quote.quotePrice,
    riskFlags: quote.riskFlags,
    inspector: String(payload.inspector).trim(),
    inspectedAt
  };
  device.status = "quoted";
  device.updatedAt = inspectedAt;
  return device;
}

function updateDecision(device, payload) {
  if (!device.inspection) {
    const error = new Error("请先完成质检报价");
    error.status = 422;
    throw error;
  }
  const decision = String(payload.decision || "").trim();
  if (!["accept", "reject"].includes(decision)) {
    const error = new Error("decision 只能是 accept 或 reject");
    error.status = 422;
    throw error;
  }

  const decidedAt = now();
  device.decision = {
    decision,
    finalPrice: decision === "accept" ? device.inspection.quotePrice : 0,
    note: String(payload.note || "").trim(),
    decidedAt
  };
  device.status = decision === "accept" ? "recycled" : "rejected";
  device.updatedAt = decidedAt;
  return device;
}

function updateListing(device, payload) {
  if (device.status !== "recycled" && device.status !== "listed") {
    const error = new Error("只有已回收设备可以入库上架");
    error.status = 422;
    throw error;
  }

  required(payload, ["targetPrice", "channel"]);
  const listedAt = now();
  device.inventory = {
    refurbishCost: Math.max(0, Number(payload.refurbishCost || 0)),
    targetPrice: Math.max(0, Number(payload.targetPrice || 0)),
    channel: String(payload.channel).trim(),
    inventoryStatus: "listed",
    listedAt
  };
  device.status = "listed";
  device.updatedAt = listedAt;
  return device;
}

function listDevices(url, store) {
  const status = url.searchParams.get("status") || "all";
  const keyword = (url.searchParams.get("keyword") || "").trim().toLowerCase();
  const category = url.searchParams.get("category") || "all";
  const minPriceRaw = url.searchParams.get("minPrice");
  const maxPriceRaw = url.searchParams.get("maxPrice");
  const minPrice = minPriceRaw !== null && minPriceRaw !== "" ? Number(minPriceRaw) : null;
  const maxPrice = maxPriceRaw !== null && maxPriceRaw !== "" ? Number(maxPriceRaw) : null;
  const hasPriceFilter = minPrice !== null || maxPrice !== null;
  const dateRange = url.searchParams.get("dateRange") || "all";
  const hasRiskParam = url.searchParams.get("hasRisk");
  const hasRisk = hasRiskParam === "true";
  const sortBy = url.searchParams.get("sortBy") || "updatedAt";
  const sortOrder = url.searchParams.get("sortOrder") || "desc";

  const now = new Date();
  let dateFrom = null;
  if (dateRange === "today") {
    dateFrom = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  } else if (dateRange === "week") {
    dateFrom = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  } else if (dateRange === "month") {
    dateFrom = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  }

  let result = store.devices
    .filter((device) => status === "all" || device.status === status)
    .filter((device) => category === "all" || device.category === category)
    .filter((device) => {
      if (!keyword) return true;
      return [
        device.code,
        device.category,
        device.brand,
        device.model,
        device.serialNumber,
        device.ownerName,
        device.ownerPhone
      ]
        .join(" ")
        .toLowerCase()
        .includes(keyword);
    })
    .filter((device) => {
      const quotePrice = device.inspection?.quotePrice;
      if (hasPriceFilter) {
        if (typeof quotePrice !== "number") return false;
      }
      if (minPrice !== null && quotePrice < minPrice) return false;
      if (maxPrice !== null && quotePrice > maxPrice) return false;
      return true;
    })
    .filter((device) => {
      if (!dateFrom) return true;
      return device.updatedAt >= dateFrom;
    })
    .filter((device) => {
      if (!hasRisk) return true;
      return device.inspection?.riskFlags?.length > 0;
    });

  result = result.sort((a, b) => {
    let aVal;
    let bVal;
    switch (sortBy) {
      case "quotePrice":
        aVal = a.inspection?.quotePrice || 0;
        bVal = b.inspection?.quotePrice || 0;
        break;
      case "createdAt":
        aVal = new Date(a.createdAt);
        bVal = new Date(b.createdAt);
        break;
      case "updatedAt":
      default:
        aVal = new Date(a.updatedAt);
        bVal = new Date(b.updatedAt);
    }
    if (sortOrder === "asc") {
      return aVal > bVal ? 1 : -1;
    }
    return aVal < bVal ? 1 : -1;
  });

  return result;
}

function dashboard(store) {
  const counts = Object.fromEntries(Object.keys(STATUS_LABELS).map((status) => [status, 0]));
  let quoteTotal = 0;
  let quoteCount = 0;
  let marginTotal = 0;

  for (const device of store.devices) {
    counts[device.status] = (counts[device.status] || 0) + 1;
    if (device.inspection) {
      quoteTotal += device.inspection.quotePrice;
      quoteCount += 1;
    }
    if (device.inventory && device.decision) {
      marginTotal +=
        device.inventory.targetPrice -
        device.decision.finalPrice -
        device.inventory.refurbishCost;
    }
  }

  return {
    total: store.devices.length,
    counts,
    averageQuote: quoteCount ? Math.round(quoteTotal / quoteCount) : 0,
    estimatedMargin: Math.round(marginTotal),
    recent: store.devices
      .slice()
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
      .slice(0, 6)
  };
}

function findDevice(store, id) {
  return store.devices.find((device) => device.id === id);
}

async function handleApi(req, res, url) {
  const store = readStore();
  const parts = url.pathname.split("/").filter(Boolean);

  try {
    if (req.method === "GET" && url.pathname === "/api/health") {
      sendJson(res, 200, { ok: true, time: now() });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/dashboard") {
      sendJson(res, 200, dashboard(store));
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/devices") {
      sendJson(res, 200, listDevices(url, store));
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/devices") {
      const payload = await readJson(req);
      const device = createDevice(payload, store);
      store.devices.push(device);
      writeStore(store);
      sendJson(res, 201, device);
      return;
    }

    if (parts[0] === "api" && parts[1] === "devices" && parts[2]) {
      const device = findDevice(store, parts[2]);
      if (!device) {
        sendError(res, 404, "设备不存在");
        return;
      }

      if (req.method === "GET" && parts.length === 3) {
        sendJson(res, 200, device);
        return;
      }

      if (req.method === "PATCH" && parts[3] === "inspection") {
        const payload = await readJson(req);
        updateInspection(device, payload);
        writeStore(store);
        sendJson(res, 200, device);
        return;
      }

      if (req.method === "PATCH" && parts[3] === "decision") {
        const payload = await readJson(req);
        updateDecision(device, payload);
        writeStore(store);
        sendJson(res, 200, device);
        return;
      }

      if (req.method === "PATCH" && parts[3] === "listing") {
        const payload = await readJson(req);
        updateListing(device, payload);
        writeStore(store);
        sendJson(res, 200, device);
        return;
      }
    }

    sendError(res, 404, "接口不存在");
  } catch (error) {
    sendError(res, error.status || 400, error.message || "请求处理失败");
  }
}

function serveStatic(req, res, url) {
  const requested = url.pathname === "/" ? "/index.html" : url.pathname;
  const decoded = decodeURIComponent(requested);
  const filePath = path.resolve(frontendRoot, `.${decoded}`);

  if (!filePath.startsWith(frontendRoot)) {
    sendError(res, 403, "非法路径");
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("页面不存在");
      return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, {
      "Content-Type": mimeTypes[ext] || "application/octet-stream",
      "Cache-Control": "no-store"
    });
    res.end(content);
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  if (url.pathname.startsWith("/api/")) {
    handleApi(req, res, url);
    return;
  }
  serveStatic(req, res, url);
});

ensureStore();
server.listen(PORT, () => {
  console.log(`Device recycle system is running at http://localhost:${PORT}`);
});
