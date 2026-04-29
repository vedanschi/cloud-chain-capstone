/**
 * UI-CONTROLLER.JS
 * Presentation Layer: Handles DOM, Modals, and Context-Aware Logic.
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
            let isStagnant = item.stagnant >= 90;
            let reorderPoint = (item.demand * item.leadTime) * 1.2;
            let isStockout = item.stock <= reorderPoint && item.demand > 0;

            if (this.currentHealthFilter === 'STAGNANT' && !isStagnant) return;
            if (this.currentHealthFilter === 'STOCKOUT' && !isStockout) return;
            if (this.currentNodeFilter !== 'ALL' && item.node !== this.currentNodeFilter) return;

            let stateLabel = '<span style="color: #888;">NORMAL</span>';
            if (isStagnant) stateLabel = '<span class="critical-stagnant">DEAD STOCK</span>';
            else if (isStockout) stateLabel = '<span class="critical-stockout">STOCKOUT RISK</span>';

            const tr = document.createElement('tr');
            tr.onclick = () => this.selectTarget(index);
            
            tr.innerHTML = `
                <td style="color: var(--teal); font-weight: bold;">${item.sku}</td>
                <td>${item.node}</td>
                <td style="font-weight: bold;">${item.stock}</td>
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
        const manualActionDiv = document.getElementById('manualActionContainer');
        const optimizeBtn = document.getElementById('optimizeBtn');
        
        let isStagnant = this.selectedAsset.stagnant >= 90;
        let reorderPoint = (this.selectedAsset.demand * this.selectedAsset.leadTime) * 1.2;
        let isStockout = this.selectedAsset.stock <= reorderPoint && this.selectedAsset.demand > 0;

        let mode = 'NORMAL';
        let actionLabel = 'Transfer Details';
        let optionsHtml = '';

        if (isStagnant) {
            mode = 'PUSH';
            actionLabel = 'Surplus: Push Inventory';
            // PUSH: Only show nodes that already carry this SKU to push to
            optionsHtml = `
                <label style="color: var(--lavender);">Transfer To:</label>
                <select id="manualNodeSelect" class="form-select">
                    ${this.generateValidNodes(this.selectedAsset.sku, this.selectedAsset.node, 'PUSH')}
                </select>
                <label style="color: var(--lavender); margin-top: 10px; display: block;">Quantity:</label>
                <input type="number" id="transferQty" class="form-select" value="10" min="1" max="${this.selectedAsset.stock}">
            `;
        } else if (isStockout) {
            mode = 'PULL';
            actionLabel = 'Deficit: Pull Replenishment';
            // PULL: Only show nodes that have surplus stock of this SKU
            optionsHtml = `
                <label style="color: var(--lavender);">Transfer From:</label>
                <select id="manualNodeSelect" class="form-select">
                    <option value="Central Warehouse">Central Warehouse (Infinite Stock)</option>
                    ${this.generateValidNodes(this.selectedAsset.sku, this.selectedAsset.node, 'PULL')}
                </select>
                <label style="color: var(--lavender); margin-top: 10px; display: block;">Quantity:</label>
                <input type="number" id="transferQty" class="form-select" value="10" min="1">
            `;
        } else {
            detailsDiv.innerHTML = `<div style="color: var(--warning);">Target stable. Optimization bypassed.</div>`;
            optimizeBtn.disabled = true;
            manualActionDiv.innerHTML = '';
            return;
        }

        detailsDiv.innerHTML = `
            <div style="color: var(--electric-blue); margin-bottom: 10px; text-transform: uppercase;">${actionLabel}</div>
            <div><span style="color: var(--lavender);">SKU:</span> <span>${this.selectedAsset.sku}</span></div>
            <div><span style="color: var(--lavender);">Location:</span> <span>${this.selectedAsset.node}</span></div>
            <div><span style="color: var(--lavender);">Current Stock:</span> <span>${this.selectedAsset.stock}</span></div>
        `;
        
        manualActionDiv.innerHTML = optionsHtml;
        optimizeBtn.disabled = false;
        optimizeBtn.dataset.mode = mode;
    },

    generateValidNodes(sku, excludeNode, mode) {
        // Filter strictly for nodes carrying this exact SKU
        let validPeers = DataEngine.inventoryState.filter(item => item.sku === sku && item.node !== excludeNode);
        
        if (mode === 'PULL') {
            // If pulling, peer must have stock available to give
            validPeers = validPeers.filter(item => item.stock > 10);
        }

        if (validPeers.length === 0) {
            return `<option value="NONE" disabled>No valid lateral peers found</option>`;
        }

        return validPeers.map(n => `<option value="${n.node}">${n.node} (Avail: ${n.stock})</option>`).join('');
    },

    async evaluateRoute() {
        if (!this.selectedAsset) return;

        const manualSelection = document.getElementById('manualNodeSelect').value;
        const transferQty = parseInt(document.getElementById('transferQty').value);
        const mode = document.getElementById('optimizeBtn').dataset.mode;
        
        if (manualSelection === "NONE") {
            alert("No valid routes available for this item.");
            return;
        }

        const payload = {
            sku: this.selectedAsset.sku,
            origin: this.selectedAsset.node,
            cost: this.selectedAsset.cost,
            stock: this.selectedAsset.stock,
            stagnant: this.selectedAsset.stagnant,
            targetNode: manualSelection,
            mode: mode
        };

        const modal = document.getElementById('comparisonModal');
        const modalContent = document.getElementById('modalContent');
        modal.style.display = 'flex';
        modalContent.innerHTML = `<div style="text-align: center; color: var(--electric-blue); padding: 40px;">>> Pinging Cloud Engine...</div>`;

        const optimizationData = await DataEngine.fetchOptimization(payload);
        
        // Render Math in the Modal
        let html = `
            <h2 style="color: var(--lavender); margin-bottom: 20px; text-align: center;">NETWORK ROUTE EVALUATION</h2>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
                
                <div style="border: 1px solid var(--warning); padding: 15px; background: rgba(255, 170, 0, 0.05); border-radius: 4px;">
                    <h3 style="color: var(--warning); margin-top: 0;">HUMAN SELECTION</h3>
                    <div style="margin-bottom: 10px;"><strong>Route:</strong> ${mode === 'PUSH' ? this.selectedAsset.node + ' &rarr; ' + manualSelection : manualSelection + ' &rarr; ' + this.selectedAsset.node}</div>
                    <div style="color: #ccc; font-size: 0.9rem;">Estimated Freight: -$${(transferQty * 4.5).toFixed(2)}</div>
                    <div style="color: #ccc; font-size: 0.9rem;">Sunk Cost Penalty: -$${(manualSelection === 'Central Warehouse' ? (this.selectedAsset.cost * transferQty).toFixed(2) : '0.00')}</div>
                    
                    <button class="action-btn" style="background: transparent; border: 1px solid var(--warning); color: var(--warning);" 
                    onclick="UIController.executeTransfer('MANUAL', '${manualSelection}', ${transferQty}, ${(transferQty * -4.5)})">Force Manual Route</button>
                </div>
                
                <div style="border: 1px solid var(--neon-green); padding: 15px; background: rgba(0,250,154,0.05); border-radius: 4px;">
                    <h3 style="color: var(--neon-green); margin-top: 0;">CLOUD OPTIMIZED</h3>
                    <div style="margin-bottom: 10px;"><strong>Optimal Route:</strong> ${optimizationData.success ? optimizationData.winner.destinationNode : 'HOLD ASSET'}</div>
                    <div style="color: #ccc; font-size: 0.9rem;">Calculated Savings: <span style="color: var(--neon-green);">+$${optimizationData.success ? optimizationData.winner.netSavings.toFixed(2) : '0.00'}</span></div>
                    <div style="color: #ccc; font-size: 0.9rem;">Holding Cost Relieved: Yes</div>
                    
                    <button class="action-btn" style="background: var(--neon-green); color: black;" 
                    onclick="UIController.executeTransfer('OPTIMIZED', '${optimizationData.success ? optimizationData.winner.destinationNode : 'HOLD'}', ${transferQty}, ${optimizationData.success ? optimizationData.winner.netSavings : 0})">
                    Execute Optimized</button>
                </div>
            </div>
            <button onclick="document.getElementById('comparisonModal').style.display='none'" style="margin-top: 20px; width: 100%; padding: 10px; background: transparent; border: 1px solid var(--lavender); color: var(--text-main); cursor: pointer;">Cancel</button>
        `;

        modalContent.innerHTML = html;
    },

    executeTransfer(decisionType, targetNode, quantity, netImpact) {
        if (targetNode === 'HOLD') {
            document.getElementById('comparisonModal').style.display = 'none';
            return;
        }

        const mode = document.getElementById('optimizeBtn').dataset.mode;
        
        // 1. Physically update the local arrays so the table changes
        let originNode = mode === 'PUSH' ? this.selectedAsset.node : targetNode;
        let destNode = mode === 'PUSH' ? targetNode : this.selectedAsset.node;

        if (originNode !== 'Central Warehouse') {
            let originItem = DataEngine.inventoryState.find(i => i.sku === this.selectedAsset.sku && i.node === originNode);
            if (originItem) originItem.stock -= quantity;
        }

        if (destNode !== 'Central Warehouse') {
            let destItem = DataEngine.inventoryState.find(i => i.sku === this.selectedAsset.sku && i.node === destNode);
            if (destItem) destItem.stock += quantity;
        }

        // 2. Hide Modal and Update UI
        document.getElementById('comparisonModal').style.display = 'none';
        this.renderTable();
        
        // 3. Print success text in the console
        const consoleDiv = document.getElementById('outputConsole');
        consoleDiv.innerHTML = `<div style="color: var(--neon-green);">>> SUCCESS: ${quantity} units of ${this.selectedAsset.sku} transferred ${originNode} &rarr; ${destNode}. Database state updated.</div>` + consoleDiv.innerHTML;

        // 4. Fire the ledger event
        if (window.LedgerEngine) {
            LedgerEngine.recordTransaction(this.selectedAsset, decisionType, targetNode, netImpact);
        }

        // 5. Clear selection
        this.selectedAsset = null;
        document.getElementById('selectedAssetDetails').innerHTML = `<div style="color: var(--lavender-dark);">Awaiting target selection from telemetry...</div>`;
        document.getElementById('manualActionContainer').innerHTML = '';
        document.getElementById('optimizeBtn').disabled = true;
    }
};
