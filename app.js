const state = {
  bootstrap: null,
  positions: [],
  result: null,
  timer: null,
  quickForm: null,
};

const exchangeGrid = document.getElementById("exchange-grid");
const positionsBody = document.getElementById("positions-body");
const summaryGrid = document.getElementById("summary-grid");
const subSummary = document.getElementById("sub-summary");
const outputRows = document.getElementById("output-rows");
const workbookGrid = document.getElementById("workbook-grid");
const derivativeBody = document.getElementById("derivative-body");
const cashBody = document.getElementById("cash-body");
const scenarioHead = document.getElementById("scenario-head");
const scenarioBody = document.getElementById("scenario-body");
const referencesList = document.getElementById("references-list");
const errorBanner = document.getElementById("error-banner");
const quickExchange = document.getElementById("quick-exchange");
const quickProduct = document.getElementById("quick-product");
const quickSymbol = document.getElementById("quick-symbol");
const quickQuantity = document.getElementById("quick-quantity");
const quickPrice = document.getElementById("quick-price");
const quickProductType = document.getElementById("quick-product-type");
const quickLotNote = document.getElementById("quick-lot-note");

function formatINR(value) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function formatNumber(value) {
  return new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function showError(message = "") {
  errorBanner.textContent = message;
  errorBanner.classList.toggle("hidden", !message);
}

function getContractMap() {
  return new Map(state.bootstrap.contracts.map((contract) => [contract.id, contract]));
}

function createPosition(seed = {}) {
  const contracts = getContractMap();
  const firstContract = state.bootstrap.contracts[0];
  const contractId = seed.contractId || firstContract.id;
  const contract = contracts.get(contractId) || firstContract;
  return {
    contractId,
    productType: seed.productType || contract.productTypes[0],
    side: seed.side || "BUY",
    quantity: seed.quantity ?? 1,
    price: seed.price ?? contract.lastPrice,
  };
}

function deriveProductBucket(contract) {
  if (contract.segment === "CASH") {
    return "Equity";
  }
  if (contract.instrumentType === "OPTION") {
    return "Options";
  }
  return "Futures";
}

function createQuickForm(seed = {}) {
  const defaultContract = state.bootstrap.contracts[0];
  const contractId = seed.contractId || defaultContract.id;
  const contract = getContractMap().get(contractId) || defaultContract;
  return {
    exchange: seed.exchange || contract.exchange,
    productBucket: seed.productBucket || deriveProductBucket(contract),
    contractId,
    quantity: seed.quantity ?? 1,
    price: seed.price ?? contract.lastPrice,
    productType: seed.productType || contract.productTypes[0],
    side: seed.side || "BUY",
  };
}

function renderExchangeStrip() {
  exchangeGrid.innerHTML = state.bootstrap.exchanges
    .map(
      (exchange) => `
        <article class="exchange-chip">
          <span class="exchange-pill" style="background:${exchange.accent}">${escapeHtml(exchange.code)}</span>
          <h3>${escapeHtml(exchange.name)}</h3>
          <p>${escapeHtml(exchange.focus)}</p>
        </article>
      `,
    )
    .join("");
}

function renderWorkbook() {
  workbookGrid.innerHTML = state.bootstrap.workbookSections
    .map(
      (section) => `
        <article class="workbook-card">
          <p class="section-kicker">${escapeHtml(section.title)}</p>
          <h3>${escapeHtml(section.summary)}</h3>
          <ul>
            ${section.points.map((point) => `<li>${escapeHtml(point)}</li>`).join("")}
          </ul>
        </article>
      `,
    )
    .join("");
}

function renderReferences() {
  referencesList.innerHTML = state.bootstrap.officialReferences
    .map(
      (reference) => `
        <article class="reference-card">
          <p class="section-kicker">${escapeHtml(reference.label)}</p>
          <p><a href="${escapeHtml(reference.url)}" target="_blank" rel="noreferrer">${escapeHtml(reference.url)}</a></p>
        </article>
      `,
    )
    .join("");
}

function contractOptions(selectedId) {
  return state.bootstrap.contracts
    .map(
      (contract) => `
        <option value="${contract.id}" ${contract.id === selectedId ? "selected" : ""}>
          ${contract.exchange} · ${contract.displayName}
        </option>
      `,
    )
    .join("");
}

function productOptions(contract, selected) {
  return contract.productTypes
    .map(
      (product) => `
        <option value="${product}" ${product === selected ? "selected" : ""}>${product}</option>
      `,
    )
    .join("");
}

function renderPositions() {
  const contracts = getContractMap();
  if (!state.positions.length) {
    positionsBody.innerHTML = `<tr><td colspan="9" class="tiny-note">No positions added yet. Use the quick calculator above.</td></tr>`;
    return;
  }

  const perPosition = new Map();
  if (state.result?.positions) {
    state.result.positions.forEach((position) => {
      perPosition.set(`${position.contractId}:${position.side}:${position.productType}:${position.quantity}:${position.price}`, position);
    });
  }

  positionsBody.innerHTML = state.positions
    .map((position, index) => {
      const contract = contracts.get(position.contractId);
      const key = `${position.contractId}:${position.side}:${position.productType}:${position.quantity}:${position.price}`;
      const metrics = perPosition.get(key);
      const initialMargin = metrics
        ? metrics.kind === "cash"
          ? metrics.requirement
          : metrics.spanGross
        : 0;
      const exposureMargin = metrics
        ? metrics.kind === "cash"
          ? 0
          : metrics.chargesTotal
        : 0;
      const totalMargin = metrics
        ? metrics.kind === "cash"
          ? metrics.requirement
          : Math.max(metrics.spanGross + metrics.chargesTotal, metrics.shortOptionFloor || 0)
        : 0;
      const strike = contract.instrumentType === "OPTION" ? contract.displayName.match(/(\d+\s?[CP]E|\d+)/)?.[0] || "-" : "N/A";

      return `
        <tr>
          <td>${escapeHtml(contract.exchange)}</td>
          <td>
            <div class="row-contract-list">
              <div><strong>${escapeHtml(contract.symbol)}</strong></div>
              <div>${escapeHtml(contract.displayName)}</div>
            </div>
          </td>
          <td>${escapeHtml(position.productType)}</td>
          <td>${escapeHtml(strike)}</td>
          <td>${formatNumber(position.quantity)} ${position.side === "BUY" ? "B" : "S"}</td>
          <td>${formatINR(initialMargin)}</td>
          <td>${formatINR(exposureMargin)}</td>
          <td>${formatINR(totalMargin)}</td>
          <td><button class="remove-button" data-remove="${index}" aria-label="Remove row">×</button></td>
        </tr>
      `;
    })
    .join("");
}

function renderQuickForm() {
  const contracts = state.bootstrap.contracts;
  const exchanges = [...new Set(contracts.map((contract) => contract.exchange))];
  quickExchange.innerHTML = exchanges
    .map(
      (exchange) => `<option value="${exchange}" ${exchange === state.quickForm.exchange ? "selected" : ""}>${exchange}</option>`,
    )
    .join("");

  const productBuckets = ["Futures", "Options", "Equity"];
  quickProduct.innerHTML = productBuckets
    .map(
      (bucket) => `<option value="${bucket}" ${bucket === state.quickForm.productBucket ? "selected" : ""}>${bucket}</option>`,
    )
    .join("");

  const filteredContracts = contracts.filter(
    (contract) =>
      contract.exchange === state.quickForm.exchange &&
      deriveProductBucket(contract) === state.quickForm.productBucket,
  );
  const activeContract = filteredContracts.find((contract) => contract.id === state.quickForm.contractId) || filteredContracts[0];
  if (!activeContract) {
    return;
  }
  state.quickForm.contractId = activeContract.id;
  quickSymbol.innerHTML = filteredContracts
    .map(
      (contract) => `<option value="${contract.id}" ${contract.id === activeContract.id ? "selected" : ""}>${contract.displayName}</option>`,
    )
    .join("");

  if (!activeContract.productTypes.includes(state.quickForm.productType)) {
    state.quickForm.productType = activeContract.productTypes[0];
  }
  quickProductType.innerHTML = activeContract.productTypes
    .map(
      (productType) => `<option value="${productType}" ${productType === state.quickForm.productType ? "selected" : ""}>${productType}</option>`,
    )
    .join("");
  quickQuantity.value = state.quickForm.quantity;
  quickPrice.value = state.quickForm.price;
  quickLotNote.textContent = `Lot size ${activeContract.lotSize} · ${activeContract.exchange} · ${activeContract.riskStyle}`;

  const checkedRadio = document.querySelector(`input[name="quick-side"][value="${state.quickForm.side}"]`);
  if (checkedRadio) {
    checkedRadio.checked = true;
  }
}

function renderSummary(summary = {}) {
  const cards = [
    {
      label: "Span",
      value: formatINR(summary.netSpan || 0),
      help: "Worst grouped scenario loss after offsets.",
    },
    {
      label: "Exposure margin",
      value: formatINR(summary.charges || 0),
      help: "Exposure, additional, and delivery components.",
    },
    {
      label: "Spread benefit",
      value: formatINR(summary.hedgeBenefit || 0),
      help: "Reduction achieved from grouped offsets.",
    },
    {
      label: "Premium receivable",
      value: formatINR(summary.premiumReceivable || 0),
      help: "Shown separately for short-option credit.",
    },
    {
      label: "Total margin",
      value: formatINR(summary.totalRequirement || 0),
      help: "Closest estimate of required broker margin.",
      wide: true,
    },
  ];

  summaryGrid.innerHTML = cards
    .map(
      (card) => `
        <article class="summary-card ${card.wide ? "wide" : ""}">
          <p class="section-kicker">${card.label}</p>
          <div class="value">${card.value}</div>
          <div class="help">${card.help}</div>
        </article>
      `,
    )
    .join("");

  const subCards = [
    { label: "Cash margin", value: formatINR(summary.cashMargin || 0) },
    { label: "Premium payable", value: formatINR(summary.premiumPayable || 0) },
    { label: "Blocked funds", value: formatINR(summary.blockedFunds || 0) },
  ];

  subSummary.innerHTML = subCards
    .map(
      (card) => `
        <article class="sub-card">
          <div class="label">${card.label}</div>
          <div class="value">${card.value}</div>
        </article>
      `,
    )
    .join("");
}

function renderOutputRows(result) {
  if (!result) {
    outputRows.innerHTML = `<tr><td colspan="7" class="tiny-note">Add positions to see a direct output table.</td></tr>`;
    return;
  }

  const rows = [];
  result.derivativeBreakdown.forEach((group) => {
    const groupExposure = group.exposureMargin + group.additionalMargin + group.deliveryMargin;
    rows.push(`
      <tr>
        <td>${escapeHtml(group.exchange)}</td>
        <td>${escapeHtml(group.underlying)}</td>
        <td>SPAN group</td>
        <td>${formatNumber(group.positions.length)}</td>
        <td>${formatINR(group.netSpan)}</td>
        <td>${formatINR(groupExposure)}</td>
        <td>${formatINR(group.requirement)}</td>
      </tr>
    `);
  });

  result.cashBreakdown.forEach((row) => {
    rows.push(`
      <tr>
        <td>${escapeHtml(row.exchange)}</td>
        <td>${escapeHtml(row.symbol)}</td>
        <td>${escapeHtml(row.productType)}</td>
        <td>${formatNumber(row.quantity)}</td>
        <td>${formatINR(row.varMargin + row.elmMargin + row.adhocMargin)}</td>
        <td>${formatINR(0)}</td>
        <td>${formatINR(row.requirement)}</td>
      </tr>
    `);
  });

  outputRows.innerHTML = rows.join("");
}

function renderDerivativeBreakdown(rows = []) {
  if (!rows.length) {
    derivativeBody.innerHTML = `<tr><td colspan="7" class="tiny-note">Derivative groups will appear here as soon as you add derivative positions.</td></tr>`;
    return;
  }

  derivativeBody.innerHTML = rows
    .map((row) => {
      const contracts = row.positions
        .map(
          (position) => `
            <div>
              <strong>${escapeHtml(position.symbol)}</strong>
              · ${escapeHtml(position.side)} ${formatNumber(position.quantity)}
              · ${escapeHtml(position.productType)}
            </div>
          `,
        )
        .join("");
      const charges = row.exposureMargin + row.additionalMargin + row.deliveryMargin;
      return `
        <tr>
          <td>${escapeHtml(row.groupKey)}</td>
          <td><div class="row-contract-list">${contracts}</div></td>
          <td>${formatINR(row.grossSpan)}</td>
          <td>${formatINR(row.netSpan)}</td>
          <td>${formatINR(charges)}</td>
          <td>${formatINR(row.shortOptionFloor)}</td>
          <td>${formatINR(row.requirement)}</td>
        </tr>
      `;
    })
    .join("");
}

function renderCashBreakdown(rows = []) {
  if (!rows.length) {
    cashBody.innerHTML = `<tr><td colspan="8" class="tiny-note">Use NSE or BSE cash instruments to populate this section.</td></tr>`;
    return;
  }

  cashBody.innerHTML = rows
    .map(
      (row) => `
        <tr>
          <td>${escapeHtml(row.displayName)}</td>
          <td>${escapeHtml(row.productType)}</td>
          <td>${formatNumber(row.quantity)}</td>
          <td>${formatINR(row.price)}</td>
          <td>${formatINR(row.varMargin)}</td>
          <td>${formatINR(row.elmMargin)}</td>
          <td>${formatINR(row.adhocMargin)}</td>
          <td>${formatINR(row.requirement)}</td>
        </tr>
      `,
    )
    .join("");
}

function renderScenarioHeader() {
  const cells = ['<th>Group</th>'];
  for (let index = 1; index <= 16; index += 1) {
    cells.push(`<th>S${String(index).padStart(2, "0")}</th>`);
  }
  scenarioHead.innerHTML = cells.join("");
}

function renderScenarios(rows = []) {
  if (!rows.length) {
    scenarioBody.innerHTML = `<tr><td colspan="17" class="tiny-note">Grouped scan scenarios appear here when derivative positions are present.</td></tr>`;
    return;
  }

  scenarioBody.innerHTML = rows
    .map((row) => {
      const cells = row.scenarioPnl
        .map((value) => {
          const className = value >= 0 ? "positive" : "negative";
          const prefix = value > 0 ? "+" : "";
          return `<td><span class="${className}">${prefix}${formatNumber(value)}</span></td>`;
        })
        .join("");
      return `<tr><td>${escapeHtml(row.groupKey)}</td>${cells}</tr>`;
    })
    .join("");
}

function buildPayload() {
  return { positions: state.positions };
}

function scheduleCalculate() {
  clearTimeout(state.timer);
  state.timer = setTimeout(calculate, 120);
}

async function calculate() {
  try {
    const response = await fetch("/api/calculate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildPayload()),
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || "Calculation failed.");
    }
    state.result = payload;
    showError("");
    renderPositions();
    renderSummary(payload.summary);
    renderOutputRows(payload);
    renderDerivativeBreakdown(payload.derivativeBreakdown);
    renderCashBreakdown(payload.cashBreakdown);
    renderScenarios(payload.derivativeBreakdown);
  } catch (error) {
    state.result = null;
    showError(error.message || "Calculation failed.");
    renderPositions();
    renderSummary();
    renderOutputRows(null);
    renderDerivativeBreakdown([]);
    renderCashBreakdown([]);
    renderScenarios([]);
  }
}

function loadSample(sampleKey) {
  const sample = state.bootstrap.samplePortfolios[sampleKey];
  state.positions = sample.positions.map((position) => createPosition(position));
  renderPositions();
  scheduleCalculate();
}

function exportJson() {
  const blob = new Blob([JSON.stringify(buildPayload(), null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "nccl-cal-portfolio.json";
  link.click();
  URL.revokeObjectURL(url);
}

function importJson(text) {
  const parsed = JSON.parse(text);
  const positions = Array.isArray(parsed.positions) ? parsed.positions : [];
  state.positions = positions.length
    ? positions.map((position) => createPosition(position))
    : [createPosition()];
  renderPositions();
  scheduleCalculate();
}

function updatePosition(index, field, value) {
  const position = state.positions[index];
  position[field] = field === "quantity" || field === "price" ? Number(value) : value;

  if (field === "contractId") {
    const contract = getContractMap().get(position.contractId);
    position.productType = contract.productTypes[0];
    position.price = contract.lastPrice;
    renderPositions();
  }
  scheduleCalculate();
}

function addQuickPosition() {
  state.positions.push(
    createPosition({
      contractId: state.quickForm.contractId,
      productType: state.quickForm.productType,
      side: state.quickForm.side,
      quantity: Number(state.quickForm.quantity),
      price: Number(state.quickForm.price),
    }),
  );
  renderPositions();
  scheduleCalculate();
}

function resetQuickForm() {
  state.quickForm = createQuickForm();
  renderQuickForm();
}

document.getElementById("sample-diversified").addEventListener("click", () => {
  loadSample("diversified");
});

document.getElementById("sample-commodity").addEventListener("click", () => {
  loadSample("commodity_hedge");
});

document.getElementById("sample-validation").addEventListener("click", () => {
  loadSample("zerodha_validation");
});

document.getElementById("add-position").addEventListener("click", () => {
  addQuickPosition();
});

document.getElementById("quick-add").addEventListener("click", addQuickPosition);
document.getElementById("quick-reset").addEventListener("click", resetQuickForm);

document.getElementById("export-json").addEventListener("click", exportJson);

document.getElementById("import-json").addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) {
    return;
  }
  importJson(await file.text());
  event.target.value = "";
});

document.addEventListener("click", (event) => {
  const removeTarget = event.target.closest("[data-remove]");
  if (!removeTarget) {
    return;
  }
  const index = Number(removeTarget.dataset.remove);
  state.positions.splice(index, 1);
  if (!state.positions.length) {
    state.positions.push(createPosition());
  }
  renderPositions();
  scheduleCalculate();
});

function handleFieldChange(event) {
  const target = event.target;
  if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) {
    return;
  }
  const index = target.dataset.index;
  const field = target.dataset.field;
  if (index !== undefined && field) {
    updatePosition(Number(index), field, target.value);
    return;
  }

  if (target === quickExchange) {
    state.quickForm.exchange = target.value;
    const nextContract = state.bootstrap.contracts.find(
      (contract) =>
        contract.exchange === state.quickForm.exchange &&
        deriveProductBucket(contract) === state.quickForm.productBucket,
    );
    if (nextContract) {
      state.quickForm.contractId = nextContract.id;
      state.quickForm.productType = nextContract.productTypes[0];
      state.quickForm.price = nextContract.lastPrice;
    }
    renderQuickForm();
    return;
  }

  if (target === quickProduct) {
    state.quickForm.productBucket = target.value;
    const nextContract = state.bootstrap.contracts.find(
      (contract) =>
        contract.exchange === state.quickForm.exchange &&
        deriveProductBucket(contract) === state.quickForm.productBucket,
    );
    if (nextContract) {
      state.quickForm.contractId = nextContract.id;
      state.quickForm.productType = nextContract.productTypes[0];
      state.quickForm.price = nextContract.lastPrice;
    }
    renderQuickForm();
    return;
  }

  if (target === quickSymbol) {
    const contract = getContractMap().get(target.value);
    state.quickForm.contractId = contract.id;
    state.quickForm.productType = contract.productTypes[0];
    state.quickForm.price = contract.lastPrice;
    renderQuickForm();
    return;
  }

  if (target === quickProductType) {
    state.quickForm.productType = target.value;
    return;
  }

  if (target === quickQuantity) {
    state.quickForm.quantity = Number(target.value);
    return;
  }

  if (target === quickPrice) {
    state.quickForm.price = Number(target.value);
  }
}

document.addEventListener("change", handleFieldChange);
document.addEventListener("input", (event) => {
  if (
    event.target instanceof HTMLInputElement &&
    (event.target.dataset.field === "quantity" || event.target.dataset.field === "price" || event.target === quickQuantity || event.target === quickPrice)
  ) {
    handleFieldChange(event);
  }
});

document.querySelectorAll('input[name="quick-side"]').forEach((radio) => {
  radio.addEventListener("change", (event) => {
    state.quickForm.side = event.target.value;
  });
});

async function bootstrap() {
  const response = await fetch("/api/bootstrap");
  state.bootstrap = await response.json();
  state.quickForm = createQuickForm();
  renderExchangeStrip();
  renderWorkbook();
  renderReferences();
  renderScenarioHeader();
  renderQuickForm();
  loadSample("diversified");
}

bootstrap();
