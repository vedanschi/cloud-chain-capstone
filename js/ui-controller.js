/**
 * UI-CONTROLLER.JS
 * Presentation Layer: Handles DOM manipulation, routing modals, and context-aware forms.
 */

const UIController = {
    currentHealthFilter: 'ALL',
    currentNodeFilter: 'ALL',
    selectedAsset: null,
    

    init() {
        this.updateClock();
        setInterval(() => this.updateClock(), 1000);
        this.populateNodeDropdown();
    },

    updateClock() {
        const now = new Date();
        const clockEl = document.getElementById('sysClock');
        if (clockEl) clockEl.innerText = `STATUS: ACTIVE_MONITORING | SYS_TIME: ${now.toLocaleTimeString('en-US', { hour12: false })}`;
    },

    setHealthFilter(filterType, buttonElement) {
        this.currentHealthFilter = filterType;
        document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
        if (buttonElement) buttonElement.classList.add('active');
        this.renderTable();
    },

    setNodeFilter(nodeName) {
        this.currentNodeFilter = nodeName;
        this.renderTable();
    },

    populateNodeDropdown() {
        // Extract unique nodes from the data engine
        const nodes = [...new Set(DataEngine.inventoryState.map(item => item.node))].sort();
        const selector = document.getElementById('nodeSelector');
        
        if (!selector) return;
        
        selector.innerHTML = `<option value="ALL">Global Network View</option>`;
        nodes.forEach(node => {
            selector.innerHTML += `<option value="${node}">${node}</option>`;
        });
    },

    renderTable() {
        const tbody = document.getElementById('tableBody');
        if (!tbody) return;
        tbody.innerHTML = '';

        DataEngine.inventoryState.forEach((item, index) => {
            // Supply Chain Logic Triggers
            let isStagnant = item.stagnant >= 90;
            let reorderPoint = (item.demand * item.leadTime) * 1.2;
            let isStockout = item.stock <= reorderPoint && item.demand > 0;

            // Apply Filters
            if (this.currentHealthFilter === 'STAGNANT' && !isStagnant) return;
            if (this.currentHealthFilter === 'STOCKOUT' && !isStockout) return;
            if (this.currentNodeFilter !== 'ALL' && item.node !== this.currentNodeFilter) return;

            let stateLabel = '<span style="color: #888;">NORMAL</span>';
            let rowClass = '';

            if (isStagnant) {
                stateLabel = '<span class="critical-stagnant">DEAD STOCK</span>';
            } else if (isStockout) {
                stateLabel = '<span class="critical-stockout">STOCKOUT RISK</span>';
            }

            const tr = document.createElement('tr');
            tr.onclick = () => this.selectTarget(index);
            
            tr.innerHTML = `
                <td style="color: var(--teal); font-weight: bold;">${item.sku}</td>
                <td>${item.node}</td>
                <td>${item.stock}</td>
                <td>${item.demand}</td>
                <td class="${isStagnant ? 'critical-stagnant' : ''}">${item.stagnant}</td>
                <td>${stateLabel}</td>
            `;
            tbody.appendChild(tr);
        });
    },

    selectTarget(index) {
        this.selectedAsset = DataEngine.inventoryState[index];
        const detailsDiv = document.getElementById('selectedAssetDetails');
        const optimizeBtn = document.getElementById('optimizeBtn');
        const manualActionDiv = document.getElementById('manualActionContainer');
        
        let isStagnant = this.selectedAsset.stagnant >= 90;
        let reorderPoint = (this.selectedAsset.demand * this.selectedAsset.leadTime) * 1.2;
        let isStockout = this.selectedAsset.stock <= reorderPoint && this.selectedAsset.demand > 0;

        let mode = 'NORMAL';
        let actionLabel = 'Transfer Details';
        let optionsHtml = '';

        // Context-Aware UI Generation
        if (isStagnant) {
            mode = 'PUSH';
            actionLabel = 'Surplus Detected: Push Inventory';
            optionsHtml = `
                <label>Transfer To:</label>
                <select id="manualNodeSelect" class="form-select">
                    ${this.generateNodeOptions(this.selectedAsset.node)}
                </select>
            `;
        } else if (isStockout) {
            mode = 'PULL';
            actionLabel = 'Deficit Detected: Pull Replenishment';
            optionsHtml = `
                <label>Transfer From:</label>
                <select id="manualNodeSelect" class="form-select">
                    <option value="Central Warehouse">Central Warehouse (Vertical)</option>
                    ${this.generateNodeOptions(this.selectedAsset.node)}
                </select>
            `;
        } else {
            detailsDiv.innerHTML = `<div style="color: var(--warning);">Target ${this.selectedAsset.sku} at ${this.selectedAsset.node} is stable. Optimization bypassed.</div>`;
            optimizeBtn.disabled = true;
            manualActionDiv.innerHTML = '';
            return;
        }

        // Render the Command Center Panel
        detailsDiv.innerHTML = `
            <div style="color: var(--electric-blue); margin-bottom: 10px; text-transform: uppercase;">${actionLabel}</div>
            <div><span style="color: var(--lavender);">SKU:</span> <span style="color: var(--text-main);">${this.selectedAsset.sku}</span></div>
            <div><span style="color: var(--lavender);">Origin:</span> <span style="color: var(--text-main);">${this.selectedAsset.node}</span></div>
            <div><span style="color: var(--lavender);">On-Hand:</span> <span style="color: var(--text-main);">${this.selectedAsset.stock} Units</span></div>
            <div><span style="color: var(--lavender);">Unit Cost:</span> <span style="color: var(--text-main);">$${this.selectedAsset.cost.toFixed(2)}</span></div>
        `;
        
        manualActionDiv.innerHTML = optionsHtml;
        optimizeBtn.disabled = false;
        
        // Tag the button with the current operational mode
        optimizeBtn.dataset.mode = mode;
    },

    generateNodeOptions(excludeNode) {
        const nodes = [...new Set(DataEngine.inventoryState.map(item => item.node))].sort();
        return nodes.filter(n => n !== excludeNode).map(n => `<option value="${n}">${n} (Lateral)</option>`).join('');
    },

    async evaluateRoute() {
        if (!this.selectedAsset) return;

        const manualSelection = document.getElementById('manualNodeSelect').value;
        const mode = document.getElementById('optimizeBtn').dataset.mode;
        
        // Payload prepared for the upcoming Java engine update
        const payload = {
            sku: this.selectedAsset.sku,
            origin: this.selectedAsset.node,
            cost: this.selectedAsset.cost,
            stock: this.selectedAsset.stock,
            stagnant: this.selectedAsset.stagnant,
            targetNode: manualSelection,
            mode: mode
        };

        // Trigger loading state in UI
        this.showModalLoading();

        // Fetch optimized results from Render
        const optimizationData = await DataEngine.fetchOptimization(payload);
        
        // Render the Dual-Comparison Modal
        this.renderDualComparison(optimizationData, manualSelection, mode);
    },

    showModalLoading() {
        const modal = document.getElementById('comparisonModal');
        const modalContent = document.getElementById('modalContent');
        modal.style.display = 'flex';
        modalContent.innerHTML = `<div style="text-align: center; color: var(--electric-blue); padding: 40px;">>> Pinging Cloud Engine... Computing network paths...</div>`;
    },

    renderDualComparison(cloudData, humanChoice, mode) {
        // This function wires directly into the HTML skeleton we will build in index.html
        // It injects the specific math for the Left Column (Human) and Right Column (Cloud)
        
        const modalContent = document.getElementById('modalContent');
        
        // Fallback UI generation logic will be placed here to populate the modal visually
        // before passing the final execution command to ledger-engine.js
        
        let html = `
            <h2 style="color: var(--lavender); margin-bottom: 20px; text-align: center;">ROUTE EVALUATION</h2>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
                <div style="border: 1px solid var(--danger); padding: 15px; background: rgba(255,51,102,0.05); border-radius: 4px;">
                    <h3 style="color: var(--danger); margin-top: 0;">HUMAN INTUITION</h3>
                    <div><strong>Selection:</strong> ${humanChoice}</div>
                    <div style="margin-top: 20px; text-align: center;">
                        <button class="action-btn" style="background: var(--danger);" onclick="UIController.executeTransfer('MANUAL', '${humanChoice}')">Force Manual Route</button>
                    </div>
                </div>
                
                <div style="border: 1px solid var(--neon-green); padding: 15px; background: rgba(0,250,154,0.05); border-radius: 4px;">
                    <h3 style="color: var(--neon-green); margin-top: 0;">CLOUD OPTIMIZED</h3>
                    <div><strong>Selection:</strong> ${cloudData.success ? cloudData.winner.destinationNode : 'Hold Asset (No Profitable Route)'}</div>
                    <div style="margin-top: 20px; text-align: center;">
                        <button class="action-btn" style="background: var(--neon-green); color: black;" onclick="UIController.executeTransfer('OPTIMIZED', '${cloudData.success ? cloudData.winner.destinationNode : 'HOLD'}')">Execute Optimized</button>
                    </div>
                </div>
            </div>
            <button onclick="document.getElementById('comparisonModal').style.display='none'" style="margin-top: 20px; width: 100%; padding: 10px; background: transparent; border: 1px solid var(--lavender); color: var(--text-main); cursor: pointer;">Cancel Evaluation</button>
        `;

        modalContent.innerHTML = html;
    },

    executeTransfer(decisionType, destination) {
        // Hide the modal
        document.getElementById('comparisonModal').style.display = 'none';
        
        // Send the execution result to the Ledger Engine (which we will build next)
        if (window.LedgerEngine) {
            // LedgerEngine.recordTransaction(this.selectedAsset, decisionType, destination);
            console.log(`[UI-CONTROLLER] Handing off ${decisionType} execution to Ledger Engine.`);
        }
        
        // Reset selection
        this.selectedAsset = null;
        document.getElementById('selectedAssetDetails').innerHTML = `<div style="color: var(--lavender-dark);">Awaiting target selection from telemetry...</div>`;
        document.getElementById('manualActionContainer').innerHTML = '';
        document.getElementById('optimizeBtn').disabled = true;
        
        this.renderTable();
    }
};
