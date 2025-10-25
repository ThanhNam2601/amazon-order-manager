// Global variables
let allOrders = [];
let filteredOrders = [];

// Initialize dashboard on page load
document.addEventListener('DOMContentLoaded', function() {
    loadOrdersFromSheets();
});

// Test Gmail connection
async function testGmail() {
    try {
        const response = await fetch('/api/test-gmail');
        const data = await response.json();
        
        if (data.success) {
            showNotification(`Gmail connection successful! Found ${data.count} emails from Amazon.`, 'success');
        } else {
            showNotification(`Gmail error: ${data.error}`, 'danger');
        }
    } catch (error) {
        showNotification(`Connection error: ${error.message}`, 'danger');
    }
}

// Sync orders from Gmail to Google Sheets
async function syncOrders() {
    showLoading(true);
    
    try {
        const response = await fetch('/api/sync-orders', {
            method: 'POST'
        });
        const data = await response.json();
        
        if (data.success) {
            showNotification(`Synced ${data.orders.length} orders to Google Sheets!`, 'success');
            // Reload orders after sync
            setTimeout(() => {
                loadOrdersFromSheets();
            }, 1000);
        } else {
            showNotification(`Sync error: ${data.error}`, 'danger');
        }
    } catch (error) {
        showNotification(`Sync connection error: ${error.message}`, 'danger');
    } finally {
        showLoading(false);
    }
}

// Load orders from Google Sheets
async function loadOrdersFromSheets() {
    showLoading(true);
    
    try {
        const response = await fetch('/api/orders');
        const data = await response.json();
        
        if (data.success) {
            allOrders = data.orders;
            filteredOrders = [...allOrders];
            updateDashboardStats();
            displayOrdersTable(filteredOrders);
            showNotification(`Loaded ${allOrders.length} orders successfully`, 'success');
        } else {
            showNotification(`Error loading orders: ${data.error}`, 'danger');
        }
    } catch (error) {
        showNotification(`Connection error: ${error.message}`, 'danger');
    } finally {
        showLoading(false);
    }
}

// Update dashboard statistics cards
function updateDashboardStats() {
    const totalOrders = allOrders.length;
    const totalRevenue = allOrders.reduce((sum, order) => sum + order.earnings, 0);
    const totalCosts = allOrders.reduce((sum, order) => sum + order.ffmCost, 0);
    const netProfit = totalRevenue - totalCosts;
    const profitMargin = totalRevenue > 0 ? ((netProfit / totalRevenue) * 100) : 0;

    // Update DOM elements
    document.getElementById('total-orders').textContent = totalOrders;
    document.getElementById('total-revenue').textContent = `$${totalRevenue.toFixed(2)}`;
    document.getElementById('total-costs').textContent = `$${totalCosts.toFixed(2)}`;
    document.getElementById('net-profit').textContent = `$${netProfit.toFixed(2)}`;
    document.getElementById('profit-margin').textContent = `${profitMargin.toFixed(1)}% margin`;

    // Update profit card color based on performance
    const profitCard = document.getElementById('net-profit').closest('.card');
    profitCard.className = 'card text-white ' + (netProfit >= 0 ? 'bg-info' : 'bg-danger');
}

// Display orders in table
function displayOrdersTable(orders) {
    const container = document.getElementById('orders-container');
    
    if (orders.length === 0) {
        container.innerHTML = `
            <div class="text-center text-muted">
                <i class="fas fa-inbox fa-3x mb-3"></i>
                <p>No orders found matching your criteria</p>
            </div>
        `;
        document.getElementById('showing-count').textContent = 'Showing 0 orders';
        return;
    }
    
    let html = `
        <div class="table-responsive">
            <table class="table table-hover">
                <thead>
                    <tr>
                        <th>Order ID</th>
                        <th>Date</th>
                        <th>Item</th>
                        <th>SKU</th>
                        <th>Qty</th>
                        <th>Price</th>
                        <th>Earnings</th>
                        <th>FFM Cost</th>
                        <th>Profit</th>
                        <th>Status</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
    `;
    
    orders.forEach((order, index) => {
        const profitClass = order.profit > 0 ? 'text-success' : 
                           (order.profit < 0 ? 'text-danger' : 'text-muted');
        
        const statusClass = getStatusBadgeClass(order.status);
        
        html += `
            <tr>
                <td>
                    <span class="text-primary fw-bold">${order.orderId}</span>
                    <br><small class="text-muted">${formatDate(order.createdAt)}</small>
                </td>
                <td>${order.orderDate || 'N/A'}</td>
                <td>
                    <div title="${order.item}" style="max-width: 200px;">
                        ${order.item ? truncateText(order.item, 40) : 'N/A'}
                    </div>
                </td>
                <td><span class="badge bg-secondary">${order.sku || 'N/A'}</span></td>
                <td class="text-center">${order.quantity}</td>
                <td>$${order.price.toFixed(2)}</td>
                <td class="text-success fw-bold">$${order.earnings.toFixed(2)}</td>
                <td>
                    <div class="input-group input-group-sm" style="width: 100px;">
                        <span class="input-group-text">$</span>
                        <input type="number" class="form-control" 
                               value="${order.ffmCost}" 
                               placeholder="0.00" 
                               step="0.01"
                               onchange="updateFFMCostInSheets('${order.orderId}', this.value)"
                               onblur="this.value = parseFloat(this.value || 0).toFixed(2)">
                    </div>
                </td>
                <td class="${profitClass} fw-bold" id="profit-${order.orderId}">

                    $${order.profit.toFixed(2)}
                </td>
                <td>
                    <select class="form-select form-select-sm" 
                            onchange="updateOrderStatus('${order.orderId}', this.value)">
                        <option value="new" ${order.status === 'new' ? 'selected' : ''}>New</option>
                        <option value="processing" ${order.status === 'processing' ? 'selected' : ''}>Processing</option>
                        <option value="shipped" ${order.status === 'shipped' ? 'selected' : ''}>Shipped</option>
                        <option value="completed" ${order.status === 'completed' ? 'selected' : ''}>Completed</option>
                    </select>
                </td>
                <td>
                    <div class="btn-group btn-group-sm">
                        <button class="btn btn-outline-primary" 
                                onclick="viewOrderDetails('${order.orderId}')"
                                title="View Details">
                            <i class="fas fa-eye"></i>
                        </button>
                        <button class="btn btn-outline-secondary" 
                                onclick="addOrderNote('${order.orderId}')"
                                title="Add Note">
                            <i class="fas fa-sticky-note"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    });
    
    html += `
                </tbody>
            </table>
        </div>
    `;
    
    container.innerHTML = html;
    document.getElementById('showing-count').textContent = `Showing ${orders.length} orders`;
}

// Update FFM Cost in Google Sheets
async function updateFFMCostInSheets(orderId, ffmCost) {
    try {
        const response = await fetch(`/api/orders/${orderId}/ffm-cost`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ ffmCost: parseFloat(ffmCost) || 0 })
        });
        
        const data = await response.json();
        
        if (data.success) {
            // Update local data
            const orderIndex = allOrders.findIndex(o => o.orderId === orderId);
            if (orderIndex !== -1) {
                allOrders[orderIndex].ffmCost = data.ffmCost;
                allOrders[orderIndex].profit = data.profit;
            }
            
            // Update profit display
            const profitCell = document.getElementById(`profit-${orderId}`);
            if (profitCell) {
                profitCell.textContent = `$${data.profit.toFixed(2)}`;
                profitCell.className = data.profit > 0 ? 'text-success fw-bold' : 
                                      (data.profit < 0 ? 'text-danger fw-bold' : 'text-muted fw-bold');
            }
            
            // Update dashboard stats
            updateDashboardStats();
            
            showNotification(`Updated FFM Cost for ${orderId}: $${data.ffmCost}`, 'success');
        } else {
            showNotification(`Error updating FFM cost: ${data.error}`, 'danger');
        }
    } catch (error) {
        showNotification(`Error: ${error.message}`, 'danger');
    }
}

// Filter orders based on search and filters
function filterOrders() {
    const searchTerm = document.getElementById('search-input').value.toLowerCase();
    const statusFilter = document.getElementById('status-filter').value;
    const dateFilter = document.getElementById('date-filter').value;
    const profitFilter = document.getElementById('profit-filter').value;
    
    filteredOrders = allOrders.filter(order => {
        // Search filter
        const matchesSearch = !searchTerm || 
            order.orderId.toLowerCase().includes(searchTerm) ||
            (order.sku && order.sku.toLowerCase().includes(searchTerm)) ||
            (order.item && order.item.toLowerCase().includes(searchTerm));
        
        // Status filter
        const matchesStatus = !statusFilter || order.status === statusFilter;
        
        // Date filter
        const matchesDate = !dateFilter || checkDateFilter(order.createdAt, dateFilter);
        
        // Profit filter
        const matchesProfit = !profitFilter || checkProfitFilter(order, profitFilter);
        
        return matchesSearch && matchesStatus && matchesDate && matchesProfit;
    });
    
    displayOrdersTable(filteredOrders);
}

// Apply filters (same as filterOrders but with notification)
function applyFilters() {
    filterOrders();
    showNotification(`Applied filters. Showing ${filteredOrders.length} of ${allOrders.length} orders`, 'info');
}

// Clear all filters
function clearFilters() {
    document.getElementById('search-input').value = '';
    document.getElementById('status-filter').value = '';
    document.getElementById('date-filter').value = '';
    document.getElementById('profit-filter').value = '';
    
    filteredOrders = [...allOrders];
    displayOrdersTable(filteredOrders);
    showNotification('Filters cleared', 'info');
}

// Export data to CSV
function exportData() {
    if (filteredOrders.length === 0) {
        showNotification('No data to export', 'warning');
        return;
    }
    
    const headers = ['Order ID', 'Date', 'Item', 'SKU', 'Quantity', 'Price', 'Earnings', 'FFM Cost', 'Profit', 'Status'];
    const csvContent = [
        headers.join(','),
        ...filteredOrders.map(order => [
            order.orderId,
            order.orderDate,
            `"${order.item}"`,
            order.sku,
            order.quantity,
            order.price,
            order.earnings,
            order.ffmCost,
            order.profit,
            order.status
        ].join(','))
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `amazon-orders-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
    
    showNotification(`Exported ${filteredOrders.length} orders to CSV`, 'success');
}

// Helper functions
function getStatusBadgeClass(status) {
    const statusClasses = {
        'new': 'bg-primary',
        'processing': 'bg-warning',
        'shipped': 'bg-info',
        'completed': 'bg-success'
    };
    return statusClasses[status] || 'bg-secondary';
}

function formatDate(dateString) {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('vi-VN');
}

function truncateText(text, maxLength) {
    if (!text) return 'N/A';
    return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
}

function checkDateFilter(dateString, filter) {
    if (!dateString) return false;
    
    const orderDate = new Date(dateString);
    const now = new Date();
    
    switch (filter) {
        case 'today':
            return orderDate.toDateString() === now.toDateString();
        case 'week':
            const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            return orderDate >= weekAgo;
        case 'month':
            const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            return orderDate >= monthAgo;
        default:
            return true;
    }
}

function checkProfitFilter(order, filter) {
    switch (filter) {
        case 'profitable':
            return order.profit > 0;
        case 'loss':
            return order.profit < 0;
        case 'no-cost':
            return order.ffmCost === 0;
        default:
            return true;
    }
}

// Show loading spinner
function showLoading(show) {
    const loading = document.getElementById('loading');
    if (show) {
        loading.classList.remove('d-none');
    } else {
        loading.classList.add('d-none');
    }
}

// Show notification
function showNotification(message, type = 'info') {
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type} alert-dismissible fade show position-fixed`;
    alertDiv.style.cssText = 'top: 20px; right: 20px; z-index: 9999; min-width: 300px;';
    alertDiv.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    
    document.body.appendChild(alertDiv);
    
    // Auto remove after 5 seconds
    setTimeout(() => {
        if (alertDiv.parentNode) {
            alertDiv.parentNode.removeChild(alertDiv);
        }
    }, 5000);
}

// Placeholder functions for future features
function updateOrderStatus(orderId, status) {
    showNotification(`Status update for ${orderId}: ${status} (Coming soon!)`, 'info');
}

function viewOrderDetails(orderId) {
    const order = allOrders.find(o => o.orderId === orderId);
    if (order) {
        alert(`Order Details:\n\nOrder ID: ${order.orderId}\nItem: ${order.item}\nSKU: ${order.sku}\nEarnings: $${order.earnings}\nFFM Cost: $${order.ffmCost}\nProfit: $${order.profit}`);
    }
}

function addOrderNote(orderId) {
    const note = prompt(`Add note for order ${orderId}:`);
    if (note) {
        showNotification(`Note added for ${orderId} (Coming soon!)`, 'info');
    }
}

function showAbout() {
    alert('Amazon Order Management System v1.0\nBuilt for POD sellers to manage orders efficiently.');
}

function showHelp() {
    alert('Help:\n1. Use "Sync New Orders" to import from Gmail\n2. Update FFM costs to calculate profits\n3. Use filters to find specific orders\n4. Export data as CSV for reporting');
}
// Telegram Bot Functions

// Test Telegram bot connection
async function testTelegramBot() {
    try {
        showLoading(true);
        const response = await fetch('/api/telegram/test');
        const data = await response.json();
        
        if (data.success) {
            document.getElementById('telegram-status').innerHTML = `
                <div class="alert alert-success">
                    <i class="fas fa-check-circle"></i> <strong>Bot connected successfully!</strong><br>
                    Bot name: @${data.botInfo.username}<br>
                    Test message sent to Telegram.
                </div>
            `;
            showNotification('Telegram bot test successful! Check your Telegram.', 'success');
        } else {
            document.getElementById('telegram-status').innerHTML = `
                <div class="alert alert-danger">
                    <i class="fas fa-exclamation-triangle"></i> <strong>Bot connection failed!</strong><br>
                    Error: ${data.error}
                </div>
            `;
            showNotification(`Telegram bot error: ${data.error}`, 'danger');
        }
    } catch (error) {
        showNotification(`Connection error: ${error.message}`, 'danger');
    } finally {
        showLoading(false);
    }
}

// Send test notification
async function sendTestNotification() {
    if (allOrders.length === 0) {
        showNotification('No orders available for test notification', 'warning');
        return;
    }
    
    try {
        const firstOrder = allOrders[0];
        const response = await fetch('/api/telegram/notify-order', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ orderId: firstOrder.orderId })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification('Test notification sent to Telegram!', 'success');
        } else {
            showNotification(`Notification error: ${data.error}`, 'danger');
        }
    } catch (error) {
        showNotification(`Error: ${error.message}`, 'danger');
    }
}

// Send daily summary to Telegram
async function sendDailySummary() {
    try {
        showLoading(true);
        const response = await fetch('/api/telegram/daily-summary', {
            method: 'POST'
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification('Daily summary sent to Telegram!', 'success');
            
            // Show summary preview
            document.getElementById('telegram-status').innerHTML = `
                <div class="alert alert-info">
                    <i class="fas fa-chart-bar"></i> <strong>Daily Summary Sent!</strong><br>
                    Total Orders: ${data.summary.totalOrders}<br>
                    Total Earnings: $${data.summary.totalEarnings.toFixed(2)}<br>
                    Net Profit: $${data.summary.netProfit.toFixed(2)}<br>
                    Profit Margin: ${data.summary.profitMargin.toFixed(1)}%
                </div>
            `;
        } else {
            showNotification(`Summary error: ${data.error}`, 'danger');
        }
    } catch (error) {
        showNotification(`Error: ${error.message}`, 'danger');
    } finally {
        showLoading(false);
    }
}

// Enhanced sync orders with Telegram notification
async function syncOrders() {
    showLoading(true);
    
    try {
        const response = await fetch('/api/sync-orders', {
            method: 'POST'
        });
        const data = await response.json();
        
        if (data.success) {
            const autoNotify = document.getElementById('auto-notify')?.checked;
            
            if (data.orders.length > 0) {
                showNotification(
                    `Synced ${data.orders.length} orders to Google Sheets! ${autoNotify ? 'Telegram notification sent.' : ''}`, 
                    'success'
                );
                
                if (autoNotify) {
                    document.getElementById('telegram-status').innerHTML = `
                        <div class="alert alert-success">
                            <i class="fab fa-telegram"></i> <strong>Orders synced and notified!</strong><br>
                            ${data.orders.length} new orders sent to Telegram.
                        </div>
                    `;
                }
            } else {
                showNotification('No new orders found to sync.', 'info');
            }
            
            // Reload orders after sync
            setTimeout(() => {
                loadOrdersFromSheets();
            }, 1000);
        } else {
            showNotification(`Sync error: ${data.error}`, 'danger');
        }
    } catch (error) {
        showNotification(`Sync connection error: ${error.message}`, 'danger');
    } finally {
        showLoading(false);
    }
}

// Add notification button to order actions
function displayOrdersTable(orders) {
    const container = document.getElementById('orders-container');
    
    if (orders.length === 0) {
        container.innerHTML = `
            <div class="text-center text-muted">
                <i class="fas fa-inbox fa-3x mb-3"></i>
                <p>No orders found matching your criteria</p>
            </div>
        `;
        document.getElementById('showing-count').textContent = 'Showing 0 orders';
        return;
    }
    
    let html = `
        <div class="table-responsive">
            <table class="table table-hover">
                <thead>
                    <tr>
                        <th>Order ID</th>
                        <th>Date</th>
                        <th>Item</th>
                        <th>SKU</th>
                        <th>Qty</th>
                        <th>Price</th>
                        <th>Earnings</th>
                        <th>FFM Cost</th>
                        <th>Profit</th>
                        <th>Status</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
    `;
    
    orders.forEach((order, index) => {
        const profitClass = order.profit > 0 ? 'text-success' : 
                           (order.profit < 0 ? 'text-danger' : 'text-muted');
        
        const statusClass = getStatusBadgeClass(order.status);
        
        html += `
            <tr>
                <td>
                    <span class="text-primary fw-bold">${order.orderId}</span>
                    <br><small class="text-muted">${formatDate(order.createdAt)}</small>
                </td>
                <td>${order.orderDate || 'N/A'}</td>
                <td>
                    <div title="${order.item}" style="max-width: 200px;">
                        ${order.item ? truncateText(order.item, 40) : 'N/A'}
                    </div>
                </td>
                <td><span class="badge bg-secondary">${order.sku || 'N/A'}</span></td>
                <td class="text-center">${order.quantity}</td>
                <td>$${order.price.toFixed(2)}</td>
                <td class="text-success fw-bold">$${order.earnings.toFixed(2)}</td>
                <td>
                    <div class="input-group input-group-sm" style="width: 100px;">
                        <span class="input-group-text">$</span>
                        <input type="number" class="form-control" 
                               value="${order.ffmCost}" 
                               placeholder="0.00" 
                               step="0.01"
                               onchange="updateFFMCostInSheets('${order.orderId}', this.value)"
                               onblur="this.value = parseFloat(this.value || 0).toFixed(2)">
                    </div>
                </td>
                <td class="${profitClass} fw-bold" id="profit-${order.orderId}">

                    $${order.profit.toFixed(2)}
                </td>
                <td>
                    <select class="form-select form-select-sm" 
                            onchange="updateOrderStatus('${order.orderId}', this.value)">
                        <option value="new" ${order.status === 'new' ? 'selected' : ''}>New</option>
                        <option value="processing" ${order.status === 'processing' ? 'selected' : ''}>Processing</option>
                        <option value="shipped" ${order.status === 'shipped' ? 'selected' : ''}>Shipped</option>
                        <option value="completed" ${order.status === 'completed' ? 'selected' : ''}>Completed</option>
                    </select>
                </td>
                <td>
                    <div class="btn-group btn-group-sm">
                        <button class="btn btn-outline-primary" 
                                onclick="viewOrderDetails('${order.orderId}')"
                                title="View Details">
                            <i class="fas fa-eye"></i>
                        </button>
                        <button class="btn btn-outline-info" 
                                onclick="notifyOrderToTelegram('${order.orderId}')"
                                title="Send to Telegram">
                            <i class="fab fa-telegram"></i>
                        </button>
                        <button class="btn btn-outline-secondary" 
                                onclick="addOrderNote('${order.orderId}')"
                                title="Add Note">
                            <i class="fas fa-sticky-note"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    });
    
    html += `
                </tbody>
            </table>
        </div>
    `;
    
    container.innerHTML = html;
    document.getElementById('showing-count').textContent = `Showing ${orders.length} orders`;
}

// Send specific order to Telegram
async function notifyOrderToTelegram(orderId) {
    try {
        const response = await fetch('/api/telegram/notify-order', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ orderId: orderId })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification(`Order ${orderId} sent to Telegram!`, 'success');
        } else {
            showNotification(`Notification error: ${data.error}`, 'danger');
        }
    } catch (error) {
        showNotification(`Error: ${error.message}`, 'danger');
    }
}
// Scheduler Functions

// Check job status
async function checkJobStatus() {
    try {
        const response = await fetch('/api/scheduler/status');
        const data = await response.json();
        
        if (data.success) {
            let statusHtml = '<div class="alert alert-info"><h6>Job Status:</h6><ul class="mb-0">';
            
            Object.entries(data.jobs).forEach(([jobName, status]) => {
                const statusIcon = status.running ? 
                    '<i class="fas fa-play-circle text-success"></i>' : 
                    '<i class="fas fa-pause-circle text-danger"></i>';
                
                statusHtml += `<li>${statusIcon} <strong>${jobName}:</strong> ${status.running ? 'Running' : 'Stopped'}</li>`;
            });
            
            statusHtml += '</ul></div>';
            document.getElementById('scheduler-status').innerHTML = statusHtml;
        } else {
            showNotification(`Status check error: ${data.error}`, 'danger');
        }
    } catch (error) {
        showNotification(`Connection error: ${error.message}`, 'danger');
    }
}

// Start specific job
async function startJob(jobName) {
    try {
        const response = await fetch(`/api/scheduler/start/${jobName}`, {
            method: 'POST'
        });
        const data = await response.json();
        
        if (data.success) {
            showNotification(data.message, 'success');
            setTimeout(checkJobStatus, 500);
        } else {
            showNotification(`Start job error: ${data.error}`, 'danger');
        }
    } catch (error) {
        showNotification(`Connection error: ${error.message}`, 'danger');
    }
}

// Stop specific job
async function stopJob(jobName) {
    try {
        const response = await fetch(`/api/scheduler/stop/${jobName}`, {
            method: 'POST'
        });
        const data = await response.json();
        
        if (data.success) {
            showNotification(data.message, 'warning');
            setTimeout(checkJobStatus, 500);
        } else {
            showNotification(`Stop job error: ${data.error}`, 'danger');
        }
    } catch (error) {
        showNotification(`Connection error: ${error.message}`, 'danger');
    }
}

// Run manual sync
async function runManualSync() {
    showLoading(true);
    
    try {
        const response = await fetch('/api/manual-sync', {
            method: 'POST'
        });
        const data = await response.json();
        
        if (data.success) {
            showNotification(data.message, 'success');
            
            if (data.orders.length > 0) {
                document.getElementById('scheduler-status').innerHTML = `
                    <div class="alert alert-success">
                        <i class="fas fa-sync"></i> <strong>Manual sync completed!</strong><br>
                        Found ${data.orders.length} new orders and sent to Telegram.
                    </div>
                `;
                
                // Reload orders
                setTimeout(() => {
                    loadOrdersFromSheets();
                }, 1000);
            }
        } else {
            showNotification(`Manual sync error: ${data.error}`, 'danger');
        }
    } catch (error) {
        showNotification(`Connection error: ${error.message}`, 'danger');
    } finally {
        showLoading(false);
    }
}

// Initialize scheduler status on page load
document.addEventListener('DOMContentLoaded', function() {
    loadOrdersFromSheets();
    // Check job status after 2 seconds
    setTimeout(checkJobStatus, 2000);
});
