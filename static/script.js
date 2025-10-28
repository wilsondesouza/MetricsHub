// API Base URL
const API_BASE = '/api';

// Estados
let currentDatabase = null;
let currentTable = null;
let currentPage = 1;
let totalPages = 1;
let tableStatsChart = null;
let dataChart = null;
let metricsComparisonChart = {};
let metricsViewMode = 'grouped'; // 'grouped' ou 'stacked'
let gaugeCharts = {}; // Armazenar instâncias dos gauges

// DOM Elements
const databaseSelector = document.getElementById('databaseSelector');
const tableList = document.getElementById('tableList');
const tableSearch = document.getElementById('tableSearch');
const refreshBtn = document.getElementById('refreshBtn');
const loading = document.getElementById('loading');

// Elementos da aba
const tabBtns = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');

// Elementos do dashboard
const currentDbEl = document.getElementById('currentDb');
const totalTablesEl = document.getElementById('totalTables');
const totalRowsEl = document.getElementById('totalRows');
const tableDetailsEl = document.getElementById('tableDetails');

// Elementos da visualização de dados
const currentTableEl = document.getElementById('currentTable');
const rowCountEl = document.getElementById('rowCount');
const tableHead = document.getElementById('tableHead');
const tableBody = document.getElementById('tableBody');
const prevPageBtn = document.getElementById('prevPage');
const nextPageBtn = document.getElementById('nextPage');
const pageInfo = document.getElementById('pageInfo');

// Funções de utilidade
function showLoading() {
    loading.style.display = 'flex';
}

function hideLoading() {
    loading.style.display = 'none';
}

async function fetchAPI(endpoint) {
    try {
        const response = await fetch(`${API_BASE}${endpoint}`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        console.error('API Error:', error);
        alert('Error fetching data: ' + error.message);
        return null;
    }
}

// Inicializar aplicação
async function init() {
    showLoading();
    await loadDatabases();
    setupEventListeners();
    hideLoading();
}

// Carregar databases
async function loadDatabases() {
    const databases = await fetchAPI('/databases');
    if (!databases) return;

    databaseSelector.innerHTML = '<option value="">Select Database...</option>';
    databases.forEach(db => {
        const option = document.createElement('option');
        option.value = db.name;
        option.textContent = `${db.name} ${db.exists ? '✓' : '✗'}`;
        option.disabled = !db.exists;
        databaseSelector.appendChild(option);
    });
}

// Carregar tabelas para o banco de dados selecionado
async function loadTables(dbName) {
    showLoading();
    const tables = await fetchAPI(`/tables/${dbName}`);
    hideLoading();
    
    if (!tables) return;

    tableList.innerHTML = '';
    document.getElementById('tableCount').textContent = tables.length;

    if (tables.length === 0) {
        tableList.innerHTML = '<li class="empty-state">No tables found</li>';
        return;
    }

    tables.forEach(table => {
        const li = document.createElement('li');
        li.textContent = table;
        li.dataset.table = table;
        li.addEventListener('click', () => selectTable(table));
        tableList.appendChild(li);
    });
}

// Selecionar tabela
function selectTable(tableName) {
    currentTable = tableName;
    
    // Atualizar UI
    document.querySelectorAll('.table-list li').forEach(li => {
        li.classList.remove('active');
        if (li.dataset.table === tableName) {
            li.classList.add('active');
        }
    });

    // Trocar para a aba de visualização de dados
    switchTab('data');

    // Carregar dados da tabela
    loadTableData(tableName, 1);
}

// Carregar dados da tabela
async function loadTableData(tableName, page = 1) {
    if (!currentDatabase || !tableName) return;

    showLoading();
    const data = await fetchAPI(`/query/${currentDatabase}/${tableName}?page=${page}`);
    hideLoading();

    if (!data) return;

    currentPage = page;
    totalPages = data.pagination.pages;

    // Atualizar header
    currentTableEl.textContent = tableName;
    rowCountEl.textContent = `${data.pagination.total} rows`;

    // Atualizar tabela
    renderTable(data.columns, data.data);

    // Atualizar paginação
    updatePagination();

    // Carregar dados do gráfico
    loadChartData(tableName);
}

// Render table
function renderTable(columns, rows) {
    // Render header
    tableHead.innerHTML = '';
    const headerRow = document.createElement('tr');
    columns.forEach(col => {
        const th = document.createElement('th');
        th.textContent = col;
        headerRow.appendChild(th);
    });
    tableHead.appendChild(headerRow);

    // Render body
    tableBody.innerHTML = '';
    if (rows.length === 0) {
        const emptyRow = document.createElement('tr');
        const emptyCell = document.createElement('td');
        emptyCell.colSpan = columns.length;
        emptyCell.className = 'empty-state';
        emptyCell.textContent = 'No data found';
        emptyRow.appendChild(emptyCell);
        tableBody.appendChild(emptyRow);
        return;
    }

    rows.forEach(row => {
        const tr = document.createElement('tr');
        columns.forEach(col => {
            const td = document.createElement('td');
            const value = row[col];
            td.textContent = value !== null && value !== undefined ? value : 'NULL';
            tr.appendChild(td);
        });
        tableBody.appendChild(tr);
    });
}

// Atualizar paginação
function updatePagination() {
    pageInfo.textContent = `Page ${currentPage} of ${totalPages}`;
    prevPageBtn.disabled = currentPage <= 1;
    nextPageBtn.disabled = currentPage >= totalPages;
}

// Carregar estatísticas do painel
async function loadDashboardStats(dbName) {
    showLoading();
    const stats = await fetchAPI(`/dashboard/${dbName}`);
    hideLoading();

    if (!stats) return;

    // Atualizar overview
    currentDbEl.textContent = stats.database;
    totalTablesEl.textContent = stats.table_count;
    const totalRows = stats.tables.reduce((sum, t) => sum + t.rows, 0);
    totalRowsEl.textContent = totalRows.toLocaleString();

    // Render table details
    renderTableDetails(stats.tables);

    // Render chart
    renderTableStatsChart(stats.tables);
    
    // Carregar dados de métricas atuais para os gauges
    await loadCurrentMetrics(dbName);

    // Carregar dados de comparação de métricas se existir sistema_info_media
    await loadMetricsComparison(dbName);
}

// Render table details
function renderTableDetails(tables) {
    tableDetailsEl.innerHTML = '';
    
    tables.forEach(table => {
        const card = document.createElement('div');
        card.className = 'table-detail-card';
        card.innerHTML = `
            <h4>${table.name}</h4>
            <div class="detail-row">
                <span>Rows:</span>
                <strong>${table.rows.toLocaleString()}</strong>
            </div>
            <div class="detail-row">
                <span>Columns:</span>
                <strong>${table.columns}</strong>
            </div>
        `;
        tableDetailsEl.appendChild(card);
    });
}

// Render table stats chart
function renderTableStatsChart(tables) {
    const ctx = document.getElementById('tableStatsChart');
    
    if (tableStatsChart) {
        tableStatsChart.destroy();
    }

    tableStatsChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: tables.map(t => t.name),
            datasets: [{
                label: 'Row Count',
                data: tables.map(t => t.rows),
                backgroundColor: 'rgba(37, 99, 235, 0.8)',
                borderColor: 'rgba(37, 99, 235, 1)',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                y: {
                    beginAtZero: true
                }
            }
        }
    });
}

// Carregar dados do gráfico para tabela específica
async function loadChartData(tableName) {
    if (!currentDatabase || !tableName) return;

    const data = await fetchAPI(`/chart-data/${currentDatabase}/${tableName}`);
    if (!data) return;

    renderDataChart(data);
}

// Render data chart
function renderDataChart(data) {
    const ctx = document.getElementById('dataChart');
    
    if (dataChart) {
        dataChart.destroy();
    }

    dataChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: data.labels,
            datasets: [{
                label: 'Records',
                data: data.values,
                backgroundColor: 'rgba(37, 99, 235, 0.2)',
                borderColor: 'rgba(37, 99, 235, 1)',
                borderWidth: 2,
                tension: 0.4,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    display: true
                }
            },
            scales: {
                y: {
                    beginAtZero: true
                }
            }
        }
    });
}

// Carregar dados de métricas atuais para os gauges
async function loadCurrentMetrics(dbName) {
    const data = await fetchAPI(`/current-metrics/${dbName}`);
    
    const statusCard = document.getElementById('currentStatusCard');
    
    if (!data || data.error) {
        statusCard.style.display = 'none';
        return;
    }
    
    statusCard.style.display = 'block';
    renderGauges(data);
}

// Render gauge charts
function renderGauges(data) {
    const RAM_MAX_MB = 2000;
    const ramPercentage = (data.ram / RAM_MAX_MB) * 100;
    
    const gaugeConfigs = [
        {
            id: 'cpuGauge',
            value: data.cpu,
            max: 100,
            unit: '%',
            color: 'rgba(59, 130, 246, 1)',
            warningThreshold: 70,
            dangerThreshold: 90
        },
        {
            id: 'ramGauge',
            value: ramPercentage,
            max: 100,
            unit: '%',
            color: 'rgba(16, 185, 129, 1)',
            warningThreshold: 65,
            dangerThreshold: 90,
            originalValue: data.ram,
            originalUnit: 'MB'
        },
        {
            id: 'temperaturaGauge',
            value: data.temperatura,
            max: 65,
            unit: '°C',
            color: 'rgba(245, 158, 11, 1)',
            warningThreshold: 50,
            dangerThreshold: 60
        },
        {
            id: 'potenciaGauge',
            value: data.potencia,
            max: 15,
            unit: 'W',
            color: 'rgba(239, 68, 68, 1)',
            warningThreshold: 9,
            dangerThreshold: 13
        }
    ];

    gaugeConfigs.forEach(config => {
        renderGauge(config);
    });
}

// Render individual gauge
function renderGauge(config) {
    const ctx = document.getElementById(config.id);
    
    if (gaugeCharts[config.id]) {
        gaugeCharts[config.id].destroy();
    }

    // Determinar cor baseada nos thresholds
    let backgroundColor;
    if (config.value >= config.dangerThreshold) {
        backgroundColor = 'rgba(239, 68, 68, 0.8)'; // Vermelho
    } else if (config.value >= config.warningThreshold) {
        backgroundColor = 'rgba(245, 158, 11, 0.8)'; // Amarelo
    } else {
        backgroundColor = 'rgba(16, 185, 129, 0.8)'; // Verde
    }

    gaugeCharts[config.id] = new Chart(ctx, {
        type: 'doughnut',
        data: {
            datasets: [{
                data: [config.value, config.max - config.value],
                backgroundColor: [
                    backgroundColor,
                    'rgba(226, 232, 240, 0.3)'
                ],
                borderWidth: 0,
                circumference: 180,
                rotation: 270
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    enabled: true,
                    callbacks: {
                        label: function(context) {
                            if (context.dataIndex === 0) {
                                let label = config.value.toFixed(2) + config.unit;
                                if (config.originalValue) {
                                    label += ' (' + config.originalValue.toFixed(2) + config.originalUnit + ')';
                                }
                                return label;
                            }
                            return null;
                        }
                    }
                }
            },
            cutout: '75%'
        },
        plugins: [{
            id: 'gaugeText',
            afterDraw: (chart) => {
                const { ctx, chartArea } = chart;
                const canvas = chart.canvas;
                const width = canvas.width / (window.devicePixelRatio || 1);
                const height = canvas.height / (window.devicePixelRatio || 1);

                const centerX = (chartArea.left + chartArea.right) / 2;
                const centerY = (chartArea.top + chartArea.bottom) / 2 + (height * 0.18);

                const valueText = String(Math.round(config.value));

                // Ajustar tamanho da fonte dinamicamente para evitar cortar o texto
                const fontSize = Math.max(12, Math.floor(Math.min(width, height) * 0.22));
                ctx.save();

                ctx.font = `bold ${fontSize}px sans-serif`;
                ctx.fillStyle = config.color;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(valueText, centerX, centerY - (fontSize * 0.15));

                // Unidade menor abaixo do número (se desejar)
                ctx.font = `${Math.max(10, Math.floor(fontSize * 0.6))}px sans-serif`;
                ctx.fillStyle = 'rgba(100, 116, 139, 1)';
                ctx.fillText(config.unit, centerX, centerY + (fontSize * 0.6));

                ctx.restore();
            }
        }]
    });
}

// Carregar dados de comparação de métricas
async function loadMetricsComparison(dbName) {
    const data = await fetchAPI(`/metrics-comparison/${dbName}`);
    
    const metricsCard = document.getElementById('metricsComparisonCard');
    
    if (!data || data.error) {
        metricsCard.style.display = 'none';
        return;
    }
    
    metricsCard.style.display = 'block';
    renderMetricsComparisonChart(data);
}

// Render metrics comparison chart
function renderMetricsComparisonChart(data) {
    // Converter RAM de MB para %
    const RAM_MAX_MB = 2000;
    const ramPercentage = data.datasets.ram.map(value => {
        return parseFloat(((value / RAM_MAX_MB) * 100).toFixed(2));
    });

    // Configurações individuais para cada métrica
    const metricsConfigs = [
        {
            canvasId: 'cpuMetricChart',
            label: 'CPU',
            data: data.datasets.cpu,
            color: 'rgba(59, 130, 246, 1)',
            backgroundColor: 'rgba(59, 130, 246, 0.2)',
            unit: '%',
            max: 100
        },
        {
            canvasId: 'ramMetricChart',
            label: 'RAM',
            data: ramPercentage,
            color: 'rgba(16, 185, 129, 1)',
            backgroundColor: 'rgba(16, 185, 129, 0.2)',
            unit: '%',
            max: 100,
            originalData: data.datasets.ram,
            originalUnit: 'MB'
        },
        {
            canvasId: 'tempMetricChart',
            label: 'Temperatura',
            data: data.datasets.temperatura,
            color: 'rgba(245, 158, 11, 1)',
            backgroundColor: 'rgba(245, 158, 11, 0.2)',
            unit: '°C',
            max: 70
        },
        {
            canvasId: 'powerMetricChart',
            label: 'Potência',
            data: data.datasets.potencia,
            color: 'rgba(239, 68, 68, 1)',
            backgroundColor: 'rgba(239, 68, 68, 0.2)',
            unit: 'W',
            max: 15
        }
    ];

    metricsConfigs.forEach(config => {
        renderIndividualMetricChart(data.labels, config);
    });
}

// Render individual metric chart
function renderIndividualMetricChart(labels, config) {
    const ctx = document.getElementById(config.canvasId);
    
    if (!ctx) {
        console.error(`Canvas ${config.canvasId} not found`);
        return;
    }
    
    // Destruir gráfico anterior se existir
    if (metricsComparisonChart[config.canvasId]) {
        metricsComparisonChart[config.canvasId].destroy();
    }

    metricsComparisonChart[config.canvasId] = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: config.label,
                data: config.data,
                backgroundColor: config.backgroundColor,
                borderColor: config.color,
                borderWidth: 2,
                tension: 0.4,
                fill: true,
                pointRadius: 4,
                pointHoverRadius: 6,
                pointBackgroundColor: config.color,
                pointBorderColor: '#fff',
                pointBorderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            interaction: {
                mode: 'index',
                intersect: false
            },
            plugins: {
                legend: {
                    display: false
                },
                title: {
                    display: true,
                    text: config.label,
                    font: {
                        size: 16,
                        weight: 'bold'
                    },
                    color: config.color,
                    padding: {
                        top: 10,
                        bottom: 15
                    }
                },
                tooltip: {
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    padding: 12,
                    titleFont: {
                        size: 13
                    },
                    bodyFont: {
                        size: 14,
                        weight: 'bold'
                    },
                    callbacks: {
                        label: function(context) {
                            let label = context.parsed.y.toFixed(2) + config.unit;
                            if (config.originalData) {
                                label += ' (' + config.originalData[context.dataIndex].toFixed(2) + config.originalUnit + ')';
                            }
                            return label;
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: {
                        display: false
                    },
                    ticks: {
                        maxRotation: 45,
                        minRotation: 45,
                        font: {
                            size: 11
                        }
                    }
                },
                y: {
                    beginAtZero: true,
                    max: config.max,
                    ticks: {
                        callback: function(value) {
                            return value + config.unit;
                        },
                        font: {
                            size: 11
                        }
                    },
                    grid: {
                        color: 'rgba(0, 0, 0, 0.05)',
                        drawBorder: false
                    }
                }
            }
        }
    });
}

// Toggle metrics view mode (agrupado/empilhado)
function toggleMetricsView() {
    if (currentDatabase) {
        loadMetricsComparison(currentDatabase);
    }
}

// Switch tab 
function switchTab(tabName) {
    tabBtns.forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.tab === tabName) {
            btn.classList.add('active');
        }
    });

    tabContents.forEach(content => {
        content.classList.remove('active');
        if (content.id === tabName) {
            content.classList.add('active');
        }
    });
}

// Event listeners 
function setupEventListeners() {
    // Database selector
    databaseSelector.addEventListener('change', async (e) => {
        currentDatabase = e.target.value;
        if (currentDatabase) {
            await loadTables(currentDatabase);
            await loadDashboardStats(currentDatabase);
        }
    });

    // Table search
    tableSearch.addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase();
        document.querySelectorAll('.table-list li').forEach(li => {
            const tableName = li.dataset.table;
            if (tableName) {
                li.style.display = tableName.toLowerCase().includes(searchTerm) ? 'block' : 'none';
            }
        });
    });

    // Refresh button
    refreshBtn.addEventListener('click', async () => {
        if (currentDatabase) {
            await loadTables(currentDatabase);
            await loadDashboardStats(currentDatabase);
            if (currentTable) {
                await loadTableData(currentTable, currentPage);
            }
        }
    });

    // Tab buttons
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            switchTab(btn.dataset.tab);
        });
    });

    // Pagination
    prevPageBtn.addEventListener('click', () => {
        if (currentPage > 1 && currentTable) {
            loadTableData(currentTable, currentPage - 1);
        }
    });

    nextPageBtn.addEventListener('click', () => {
        if (currentPage < totalPages && currentTable) {
            loadTableData(currentTable, currentPage + 1);
        }
    });

     // Metrics comparison controls
    const refreshMetricsBtn = document.getElementById('refreshMetrics');
    const refreshGaugesBtn = document.getElementById('refreshGauges');
    
    // Removido o botão toggleMetricView do HTML também
    
    if (refreshMetricsBtn) {
        refreshMetricsBtn.addEventListener('click', async () => {
            if (currentDatabase) {
                await loadMetricsComparison(currentDatabase);
            }
        });
    }
    
    if (refreshGaugesBtn) {
        refreshGaugesBtn.addEventListener('click', async () => {
            if (currentDatabase) {
                await loadCurrentMetrics(currentDatabase);
            }
        });
    }
}

// Initialize app
document.addEventListener('DOMContentLoaded', init);