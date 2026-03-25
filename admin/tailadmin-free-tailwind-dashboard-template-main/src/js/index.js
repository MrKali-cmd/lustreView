import "jsvectormap/dist/jsvectormap.min.css";
import "flatpickr/dist/flatpickr.min.css";
import "dropzone/dist/dropzone.css";
import "../css/style.css";

import Alpine from "alpinejs";
import persist from "@alpinejs/persist";
import flatpickr from "flatpickr";
import Dropzone from "dropzone";

import chart01 from "./components/charts/chart-01";
import chart02 from "./components/charts/chart-02";
import chart03 from "./components/charts/chart-03";
import map01 from "./components/map-01";
import "./components/calendar-init.js";
import "./components/image-resize";

const API_BASE = (() => {
  const configuredBase =
    window.__LUXE_API_BASE__ ||
    document.querySelector('meta[name="luxe-api-base"]')?.content ||
    "";
  const { protocol, hostname, port, origin } = window.location;

  if (configuredBase) {
    return configuredBase.replace(/\/$/, "");
  }

  if (protocol === "file:") {
    return "http://localhost:3001/api";
  }

  if (hostname === "localhost" && port && port !== "3001") {
    return "http://localhost:3001/api";
  }

  return `${origin}/api`;
})();

const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const TABLE_FILTERS = ["all", "Live", "Draft", "Hidden"];

const dashboardState = {
  data: null,
  charts: {
    chart01: null,
    chart02: null,
    chart03: null,
  },
  chartMode: "overview",
  tableFilterIndex: 0,
};

Alpine.plugin(persist);
window.Alpine = Alpine;
Alpine.start();

const fetchJson = async (path) => {
  const response = await fetch(`${API_BASE}${path}`);
  if (!response.ok) {
    throw new Error(`Request failed for ${path}`);
  }
  return response.json();
};

const monthIndexFromValue = (value) => {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.getMonth();
};

const formatCount = (value) => Number(value || 0).toLocaleString("en-US");
const formatMoney = (value) => Number(value || 0).toLocaleString("en-US");
const formatPercent = (value) => `${Math.round(Number(value) || 0)}%`;

const statusBadgeClass = (status) => {
  if (status === "Live") {
    return "bg-success-50 text-success-600 dark:bg-success-500/15 dark:text-success-500";
  }

  if (status === "Draft") {
    return "bg-warning-50 text-warning-600 dark:bg-warning-500/15 dark:text-orange-400";
  }

  if (status === "Hidden") {
    return "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300";
  }

  return "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300";
};

const buildDashboardData = (collections, messages) => {
  const monthlyCollections = Array(12).fill(0);
  const monthlyMessages = Array(12).fill(0);
  const monthlyLiveValue = Array(12).fill(0);
  const monthlyDraftValue = Array(12).fill(0);
  const monthlyReplies = Array(12).fill(0);
  const monthlyPending = Array(12).fill(0);

  collections.forEach((item) => {
    const index = monthIndexFromValue(item.updatedAt);
    if (index === null) return;

    monthlyCollections[index] += 1;

    const price = Number(item.price || 0);
    if (item.status === "Live") {
      monthlyLiveValue[index] += price;
    } else if (item.status === "Draft") {
      monthlyDraftValue[index] += price;
    }
  });

  messages.forEach((item) => {
    const index = monthIndexFromValue(item.createdAt);
    if (index === null) return;

    monthlyMessages[index] += 1;

    if (item.status === "Replied") {
      monthlyReplies[index] += 1;
    } else {
      monthlyPending[index] += 1;
    }
  });

  const totalCollections = collections.length;
  const liveCollections = collections.filter((item) => item.status === "Live").length;
  const draftCollections = collections.filter((item) => item.status === "Draft").length;
  const totalMessages = messages.length;
  const repliedMessages = messages.filter((item) => item.status === "Replied").length;
  const inProgressMessages = messages.filter((item) => item.status === "In Progress").length;
  const newMessages = messages.filter((item) => item.status === "New").length;

  const liveRatio = totalCollections ? (liveCollections / totalCollections) * 100 : 0;
  const replyRate = totalMessages ? (repliedMessages / totalMessages) * 100 : 0;
  const liveValue = collections
    .filter((item) => item.status === "Live")
    .reduce((sum, item) => sum + Number(item.price || 0), 0);
  const draftValue = collections
    .filter((item) => item.status === "Draft")
    .reduce((sum, item) => sum + Number(item.price || 0), 0);
  const totalValue = collections.reduce((sum, item) => sum + Number(item.price || 0), 0);

  return {
    months: MONTH_LABELS,
    collections,
    messages,
    totalCollections,
    liveCollections,
    draftCollections,
    totalMessages,
    repliedMessages,
    inProgressMessages,
    newMessages,
    liveRatio,
    replyRate,
    liveValue,
    draftValue,
    totalValue,
    monthlyCollections,
    monthlyMessages,
    monthlyLiveValue,
    monthlyDraftValue,
    monthlyReplies,
    monthlyPending,
  };
};

const updateMetric = (id, value) => {
  const element = document.getElementById(id);
  if (element) {
    element.textContent = value;
  }
};

const updateProgressBar = (id, percent) => {
  const element = document.getElementById(id);
  if (element) {
    element.style.width = `${Math.max(0, Math.min(100, percent))}%`;
  }
};

const renderReplySummary = (data) => {
  updateMetric("overview-reply-rate-badge", formatPercent(data.replyRate));
  updateMetric(
    "overview-reply-summary",
    `${formatCount(data.repliedMessages)} of ${formatCount(data.totalMessages)} messages have been replied to.`,
  );
  updateMetric("overview-reply-replied-count", formatCount(data.repliedMessages));
  updateMetric("overview-reply-pending-count", formatCount(data.totalMessages - data.repliedMessages));
  updateMetric("overview-reply-total-count", formatCount(data.totalMessages));
};

const renderInboxStatus = (data) => {
  const total = data.totalMessages || 1;
  const statuses = [
    {
      key: "new",
      count: data.newMessages,
      percent: (data.newMessages / total) * 100,
    },
    {
      key: "progress",
      count: data.inProgressMessages,
      percent: (data.inProgressMessages / total) * 100,
    },
    {
      key: "replied",
      count: data.repliedMessages,
      percent: (data.repliedMessages / total) * 100,
    },
  ];

  statuses.forEach((status) => {
    updateMetric(`overview-status-${status.key}-count`, `${formatCount(status.count)} messages`);
    updateMetric(`overview-status-${status.key}-percent`, formatPercent(status.percent));
    updateProgressBar(`overview-status-${status.key}-bar`, status.percent);
  });
};

const renderOverviewMetrics = (data) => {
  updateMetric("overview-collections-count", formatCount(data.totalCollections));
  updateMetric("overview-collections-delta", formatPercent(data.liveRatio));
  updateMetric("overview-messages-count", formatCount(data.totalMessages));
  updateMetric("overview-messages-delta", formatPercent(data.replyRate));
  renderReplySummary(data);
  renderInboxStatus(data);
};

const renderOverviewTable = (data) => {
  const body = document.getElementById("overview-collections-body");
  if (!body) return;

  const activeFilter = TABLE_FILTERS[dashboardState.tableFilterIndex];
  const rows = data.collections.filter((item) => {
    if (activeFilter === "all") return true;
    return item.status === activeFilter;
  });

  const visibleRows = rows.slice(0, 6);

  if (!visibleRows.length) {
    body.innerHTML = `
      <tr>
        <td class="py-6 text-center text-gray-500 dark:text-gray-400" colspan="4">
          No collections match the current filter.
        </td>
      </tr>
    `;
    return;
  }

  body.innerHTML = visibleRows
    .map((item) => {
      const badgeClass = statusBadgeClass(item.status);
      return `
        <tr>
          <td class="py-3">
            <div class="flex items-center">
              <div class="flex items-center gap-3">
                <div class="h-[50px] w-[50px] overflow-hidden rounded-md bg-gray-100 dark:bg-gray-800">
                  <img src="${item.image}" alt="${item.name}" class="h-full w-full object-cover" />
                </div>
                <div>
                  <p class="font-medium text-gray-800 text-theme-sm dark:text-white/90">
                    ${item.name}
                  </p>
                  <span class="text-gray-500 text-theme-xs dark:text-gray-400">
                    ${item.label}
                  </span>
                </div>
              </div>
            </div>
          </td>
          <td class="py-3">
            <div class="flex items-center">
              <p class="text-gray-500 text-theme-sm dark:text-gray-400">
                ${item.type}
              </p>
            </div>
          </td>
          <td class="py-3">
            <div class="flex items-center">
              <p class="text-gray-500 text-theme-sm dark:text-gray-400">
                ${formatMoney(item.price)} IRR
              </p>
            </div>
          </td>
          <td class="py-3">
            <div class="flex items-center">
              <p class="rounded-full px-2 py-0.5 text-theme-xs font-medium ${badgeClass}">
                ${item.status}
              </p>
            </div>
          </td>
        </tr>
      `;
    })
    .join("");
};

const updateOverviewChart = (data, mode) => {
  const title = document.getElementById("overview-chart-title");
  const description = document.getElementById("overview-chart-description");

  const modeConfig = {
    overview: {
      series: [
        { name: "Collections", data: data.monthlyCollections },
        { name: "Messages", data: data.monthlyMessages },
      ],
      description: "Collections and inbox activity for the current month",
    },
    sales: {
      series: [
        { name: "Live Value", data: data.monthlyLiveValue },
        { name: "Draft Value", data: data.monthlyDraftValue },
      ],
      description: "Collection value split between live and draft listings",
    },
    revenue: {
      series: [
        { name: "Replied", data: data.monthlyReplies },
        { name: "Pending", data: data.monthlyPending },
      ],
      description: "Inbox response flow across the month",
    },
  };

  const config = modeConfig[mode] || modeConfig.overview;
  dashboardState.chartMode = mode;

  if (title) {
    title.textContent = "Site Activity";
  }

  if (description) {
    description.textContent = config.description;
  }

  if (dashboardState.charts.chart03) {
    dashboardState.charts.chart03.updateSeries(config.series, true);
  }
};

const updateCharts = (data) => {
  if (dashboardState.charts.chart01) {
    dashboardState.charts.chart01.updateSeries(
      [{ name: "Collections", data: data.monthlyCollections }],
      true,
    );
  }

  if (dashboardState.charts.chart02) {
    dashboardState.charts.chart02.updateSeries([Number(data.replyRate.toFixed(2))], true);
  }

  updateOverviewChart(data, dashboardState.chartMode);
};

const cycleTableFilter = () => {
  dashboardState.tableFilterIndex =
    (dashboardState.tableFilterIndex + 1) % TABLE_FILTERS.length;

  const label = document.getElementById("overview-table-filter-label");
  if (label) {
    label.textContent = `Filter: ${TABLE_FILTERS[dashboardState.tableFilterIndex]}`;
  }

  if (dashboardState.data) {
    renderOverviewTable(dashboardState.data);
  }
};

const initDashboardActions = () => {
  document.addEventListener("click", (event) => {
    const actionButton = event.target.closest("[data-overview-action]");
    if (!actionButton) return;

    const action = actionButton.dataset.overviewAction;

    if (action === "open-page") {
      const target = actionButton.dataset.target;
      if (target) {
        window.location.href = target;
      }
      return;
    }

    if (action === "hide-widget") {
      const widget = actionButton.closest("[data-dashboard-widget]");
      if (widget) {
        widget.classList.add("hidden");
      }
      return;
    }

    if (action === "cycle-table-filter") {
      cycleTableFilter();
    }
  });

  document.addEventListener("click", (event) => {
    const tabButton = event.target.closest("[data-chart-mode]");
    if (!tabButton) return;

    const mode = tabButton.dataset.chartMode;
    if (!mode || !dashboardState.data) return;

    updateOverviewChart(dashboardState.data, mode);
  });
};

const loadDashboardOverview = async () => {
  try {
    const [collections, messages] = await Promise.all([
      fetchJson("/collections"),
      fetchJson("/contact-messages"),
    ]);

    dashboardState.data = buildDashboardData(collections, messages);
    renderOverviewMetrics(dashboardState.data);
    renderOverviewTable(dashboardState.data);
    updateCharts(dashboardState.data);

    const filterLabel = document.getElementById("overview-table-filter-label");
    if (filterLabel) {
      filterLabel.textContent = `Filter: ${TABLE_FILTERS[dashboardState.tableFilterIndex]}`;
    }
  } catch (error) {
    const body = document.getElementById("overview-collections-body");
    if (body) {
      body.innerHTML = `
        <tr>
          <td class="py-6 text-center text-gray-500 dark:text-gray-400" colspan="4">
            Unable to load live overview data.
          </td>
        </tr>
      `;
    }
  }
};

// Init flatpickr
flatpickr(".datepicker", {
  mode: "range",
  static: true,
  monthSelectorType: "static",
  dateFormat: "M j",
  defaultDate: [new Date().setDate(new Date().getDate() - 6), new Date()],
  prevArrow:
    '<svg class="stroke-current" width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M15.25 6L9 12.25L15.25 18.5" stroke="" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  nextArrow:
    '<svg class="stroke-current" width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M8.75 19L15 12.75L8.75 6.5" stroke="" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  onReady: (selectedDates, dateStr, instance) => {
    // eslint-disable-next-line no-param-reassign
    instance.element.value = dateStr.replace("to", "-");
    const customClass = instance.element.getAttribute("data-class");
    instance.calendarContainer.classList.add(customClass);
  },
  onChange: (selectedDates, dateStr, instance) => {
    // eslint-disable-next-line no-param-reassign
    instance.element.value = dateStr.replace("to", "-");
  },
});

// Init Dropzone
const dropzoneArea = document.querySelectorAll("#demo-upload");

if (dropzoneArea.length) {
  // eslint-disable-next-line no-unused-vars
  const myDropzone = new Dropzone("#demo-upload", { url: "/file/post" });
}

document.addEventListener("DOMContentLoaded", async () => {
  dashboardState.charts.chart01 = chart01();
  dashboardState.charts.chart02 = chart02();
  dashboardState.charts.chart03 = chart03();
  map01();

  initDashboardActions();
  await loadDashboardOverview();
});

// Get the current year
const year = document.getElementById("year");
if (year) {
  year.textContent = new Date().getFullYear();
}

// For Copy
document.addEventListener("DOMContentLoaded", () => {
  const copyInput = document.getElementById("copy-input");
  if (!copyInput) return;

  const copyButton = document.getElementById("copy-button");
  const copyText = document.getElementById("copy-text");
  const websiteInput = document.getElementById("website-input");

  if (!copyButton || !copyText || !websiteInput) return;

  copyButton.addEventListener("click", () => {
    navigator.clipboard.writeText(websiteInput.value).then(() => {
      copyText.textContent = "Copied";

      setTimeout(() => {
        copyText.textContent = "Copy";
      }, 2000);
    });
  });
});

document.addEventListener("DOMContentLoaded", () => {
  const searchInput = document.getElementById("search-input");
  const searchButton = document.getElementById("search-button");

  if (!searchInput || !searchButton) return;

  function focusSearchInput() {
    searchInput.focus();
  }

  searchButton.addEventListener("click", focusSearchInput);

  document.addEventListener("keydown", function (event) {
    if ((event.metaKey || event.ctrlKey) && event.key === "k") {
      event.preventDefault();
      focusSearchInput();
    }
  });

  document.addEventListener("keydown", function (event) {
    if (event.key === "/" && document.activeElement !== searchInput) {
      event.preventDefault();
      focusSearchInput();
    }
  });
});
