/**
 * UI-CONTROLLER.JS
 * Presentation Layer: Handles DOM, Modals, and the Mathematical DSS Logic.
 */

const UIController = {
    currentHealthFilter: 'ALL',
    currentNodeFilter: 'ALL',
    selectedAsset: null,
    lastOptimization: null,
    currentMode: 'NORMAL',

    init() {
        this.injectStylesAndControls();
        this.updateClock();
        setInterval(() => this.updateClock(), 1000);
        this.populateNodeDropdown();
    },

    // Dynamically injects the 5-tier taxonomy UI without needing to edit index.html
    injectStylesAndControls() {
        const style = document.createElement('style');
        style.innerHTML = `
            .tax-critical { color: #ff3366; font-weight: bold; background: rgba(255,51,102,0.1); padding: 2px 6px; border-radius: 3px; }
            .tax-stockout { color: var(--warning); font-weight: bold; }
            .tax-surplus { color: var(--neon-green); font-weight: bold; }
            .tax-dead { color: #888; font-weight: bold; text-decoration: line-through; }
            .tax-normal { color: #ccc; }
        `;
        document.head.appendChild(style);

        const controlsDiv = document.querySelector('.controls');
        if (controlsDiv) {
            controlsDiv.innerHTML = `
                <button class="filter-btn active" onclick="UIController.setHealthFilter('ALL', this)">ALL ASSETS</button>
                <button class="filter-btn" onclick="UIController.setHealthFilter('CRITICAL', this)">CRITICAL SHORTAGE</button>
                <button class="filter-btn" onclick="UIController.setHealthFilter('STOCKOUT', this)">STOCKOUT RISK</button>
                <button class="filter-btn" onclick="UIController.setHealthFilter('SURPLUS', this)">SURPLUS</button>
                <button class="filter-btn" onclick="UIController.setHealthFilter('DEAD_STOCK', this)">DEAD STOCK</button>
            `;
        }
    },

    updateClock() {
        const now = new Date();
        const clockEl = document.getElementById('sysClock');
        if (clockEl) clockEl.innerText = `STATUS: DSS_ACTIVE | SYS_TIME: ${now.toLocaleTimeString('en-US', { hour12: false })}`;
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
            // The 5-Tier Supply Chain Taxonomy Math
            let reorderPoint = (item.demand * item.leadTime) * 1.2;
            
            let isDeadStock = item.stagnant >= 90;
            let isCritical = item.stock < item.demand && item.demand > 0;
            let isStockoutRisk = item.stock <= reorderPoint && item.demand > 0 && !isCritical;
            let isSurplus = item.stock > (reorderPoint * 1.5) && !isDeadStock;

            let stateCategory = 'NORMAL';
            if (isDeadStock) stateCategory = 'DEAD_STOCK';
            else if (isCritical) stateCategory = 'CRITICAL';
            else if (isStockoutRisk) stateCategory = 'STOCKOUT';
            else if (isSurplus) stateCategory = 'SURPLUS';

            // Apply Filters
            if (this.currentHealthFilter !== 'ALL' && stateCategory !== this.currentHealthFilter) return;
            if (this.currentNodeFilter !== 'ALL' && item.node !== this.currentNodeFilter) return;

            // UI Labels
            let stateLabel = '<span class="tax-normal">NORMAL</span>';
            if (isDeadStock) stateLabel = '<span class="tax-dead">DEAD STOCK</span>';
            else if (isCritical) stateLabel = '<span class="tax-critical">CRITICAL SHORTAGE</span>';
            else if (isStockoutRisk) stateLabel = '<span class="tax-stockout">STOCKOUT RISK</span>';
            else if (isSurplus) stateLabel = '<span class="tax-surplus">SURPLUS</span>';

            const tr = document.createElement('tr');
            tr.onclick = () => this.selectTarget(index, stateCategory);
            
            tr.innerHTML = `
                <td style="color: var(--teal); font-weight: bold;">${item.sku}</td>
                <td>${item.node}</td>
                <td style="font-weight: bold;">${item.stock}</td>
                <td>${item.demand}</td>
                <td>${item.stagnant}</td>
                <td>${stateLabel}</td>
            `;
            tbody.appendChild(tr);
        });
    },

    async selectTarget(index, stateCategory) {
        this.selectedAsset = DataEngine.inventoryState[index];
        this.lastOptimization = null;
        
        const detailsDiv = document.getElementById('selectedAssetDetails');
        const manualActionDiv = document.getElementById('manualActionContainer');
        const optimizeBtn = document.getElementById('optimizeBtn');
        
        // 1. Determine Logistics Mode based on Taxonomy
        if (stateCategory === 'DEAD_STOCK' || stateCategory === 'SURPLUS') this.currentMode = 'PUSH';
        else if (stateCategory === 'CRITICAL' || stateCategory === 'STOCKOUT') this.currentMode = 'PULL';
        else this.currentMode = 'NORMAL'; // Unrestricted Fluidity

        // 2. Show Pre-Calculation Loading State
        detailsDiv.innerHTML = `
            <div style="color: var(--electric-blue); font-weight: bold; margin-bottom: 10px;">>> ENGINE ENGAGED</div>
            <div style="color: #ccc;">Scanning network matrix for ${this.selectedAsset.sku}...</div>
        `;
        manualActionDiv.innerHTML = '';
        optimizeBtn.disabled = true;

        // 3. Autonomous Background Routing
        const payload = {
            sku: this.selectedAsset.sku,
            origin: this.selectedAsset.node,
            cost: this.selectedAsset.cost,
            stock: this.selectedAsset.stock,
            stagnant: this.selectedAsset.stagnant,
            targetNode: "NONE",
            mode: this.currentMode
        };

        this.lastOptimization = await DataEngine.fetchOptimization(payload);

        // 4. Render the Actionable Command Center
        let actionLabel = this.currentMode === 'PULL' ? 'Deficit: Pull Replenishment' : 'Surplus: Push/Transfer Inventory';
        
        detailsDiv.innerHTML = `
            <div style="color: var(--electric-blue); margin-bottom: 10px; font-weight: bold; text-transform: uppercase;">${actionLabel}</div>
            <div><span style="color: var(--lavender);">Target SKU:</span> <span>${this.selectedAsset.sku}</span></div>
            <div><span style="color: var(--lavender);">Origin Node:</span> <span>${this.selectedAsset.node}</span></div>
            <hr style="border-color: rgba(162, 141, 236, 0.2); margin: 10px 0;">
            <div style="color: var(--neon-green); font-weight: bold;">Cloud Recommendation:</div>
            <div style="color: white; font-size: 1.1rem;">
                ${this.lastOptimization.success 
                    ? `Route to ${this.lastOptimization.winner.destinationNode} (Est. Savings: +$${this.lastOptimization.winner.netSavings.toFixed(2)})` 
                    : `Central Warehouse Fallback Required`}
            </div>
        `;
        
        let allNodes = [...new Set(DataEngine.inventoryState.map(item => item.node))].sort();
        let optionsHtml = allNodes.filter(n => n !== this.selectedAsset.node).map(n => `<option value="${n}">${n}</option>`).join('');

        manualActionDiv.innerHTML = `
            <div style="margin-top: 15px; border-top: 1px dashed var(--lavender-dark); padding-top: 15px;">
                <label style="color: var(--warning); font-size: 0.85rem;">MANUAL OVERRIDE (OPTIONAL):</label>
                <select id="manualNodeSelect" class="form-select">
                    <option value="Central Warehouse">Central Warehouse (Baseline)</option>
                    ${optionsHtml}
                </select>
                <label style="color: var(--lavender); margin-top: 10px; display: block; font-size: 0.85rem;">TRANSFER QUANTITY:</label>
                <input type="number" id="transferQty" class="form-select" value="10" min="1">
            </div>
        `;
        
        optimizeBtn.innerHTML = "View Mathematical Breakdown";
        optimizeBtn.disabled = false;
    },

    evaluateRoute() {
        if (!this.selectedAsset || !this.lastOptimization) return;

        const manualSelection = document.getElementById('manualNodeSelect').value;
        const transferQty = parseInt(document.getElementById('transferQty').value);
        
        const modal = document.getElementById('comparisonModal');
        const modalContent = document.getElementById('modalContent');
        modal.style.display = 'flex';

        // Find the manual route in the API's viable array to get true math, if it exists
        let manualRouteMath = this.lastOptimization.viableRoutes.find(r => r.destinationNode === manualSelection);
        let optimalRouteMath = this.lastOptimization.success ? this.lastOptimization.winner : null;

        // Generate the HTML for the two comparison panes
        let manualHtml = this.generateMathHTML("HUMAN OVERRIDE", manualRouteMath, manualSelection === 'Central Warehouse', true, manualSelection, transferQty);
        let cloudHtml = this.generateMathHTML("CLOUD OPTIMIZED", optimalRouteMath, optimalRouteMath && optimalRouteMath.destinationNode === 'Central Warehouse', false, optimalRouteMath ? optimalRouteMath.destinationNode : 'Central Warehouse', transferQty);

        modalContent.innerHTML = `
            <h2 style="color: var(--lavender); margin-bottom: 20px; text-align: center; letter-spacing: 2px;">LOGISTICS TIPPING POINT ANALYSIS</h2>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
                ${manualHtml}
                ${cloudHtml}
            </div>
            <button onclick="document.getElementById('comparisonModal').style.display='none'" style="margin-top: 20px; width: 100%; padding: 10px; background: transparent; border: 1px solid var(--lavender); color: var(--text-main); cursor: pointer; font-family: 'JetBrains Mono';">Cancel Evaluation</button>
        `;
    },

    // Generates the academic economic breakdown for the UI
    generateMathHTML(title, routeObj, isBaseline, isManual, nodeName, transferQty) {
        const themeColor = isManual ? 'var(--warning)' : 'var(--neon-green)';
        const bgTheme = isManual ? 'rgba(255,170,0,0.05)' : 'rgba(0,250,154,0.05)';

        if (isBaseline) {
            return `
                <div style="border: 1px solid var(--electric-blue); padding: 20px; background: rgba(0, 120, 255, 0.05); border-radius: 4px;">
                    <h3 style="color: var(--electric-blue); margin-top: 0; font-size: 1.1rem;">${title}</h3>
                    <div style="margin-bottom: 15px; font-weight: bold;">Route: Vertical Replenishment (Central)</div>
                    <div style="font-family: 'JetBrains Mono', monospace; font-size: 0.9rem; color: #ccc;">
                        <div style="display: flex; justify-content: space-between; margin-bottom: 8px;"><span>Capital Expenditure (New Stock):</span> <span style="color: var(--danger);">-$${(this.selectedAsset.cost * transferQty).toFixed(2)}</span></div>
                        <div style="display: flex; justify-content: space-between; margin-bottom: 8px;"><span>Central Freight Penalty:</span> <span style="color: var(--danger);">-$120.00</span></div>
                        <hr style="border-color: #444; margin: 15px 0;">
                        <div style="display: flex; justify-content: space-between; font-weight: bold; color: var(--electric-blue);"><span>Relative Net Savings:</span> <span>+$0.00 (Baseline)</span></div>
                    </div>
                    <button class="action-btn" style="background: var(--electric-blue); color: white; margin-top: 25px;" onclick="UIController.executeTransfer('${isManual ? 'MANUAL' : 'BASELINE'}', 'Central Warehouse', ${transferQty}, 0)">Authorize Vertical Action</button>
                </div>
            `;
        }

        if (!routeObj) {
             return `
                <div style="border: 1px solid var(--danger); padding: 20px; background: rgba(255, 51, 102, 0.05); border-radius: 4px;">
                    <h3 style="color: var(--danger); margin-top: 0; font-size: 1.1rem;">${title}</h3>
                    <div style="margin-bottom: 15px; font-weight: bold; color: var(--danger);">Route Rejected by Engine</div>
                    <div style="font-family: 'JetBrains Mono', monospace; font-size: 0.85rem; color: #ccc; line-height: 1.5;">
                        This lateral route is mathematically unprofitable. The LTL freight cost strictly outweighs the relief of holding costs or the prevention of lost sales.
                    </div>
                    <button class="action-btn" disabled style="margin-top: 25px;">Execution Halted</button>
                </div>`;
        }

        // Deconstruct the math for transparent academic display
        let ltlFreight = 50.0 + (routeObj.distanceMiles * 0.15) + 20.0;
        let holdingSaved = (this.selectedAsset.cost * 0.20) * ((this.selectedAsset.stagnant || 90) / 365.0); 

        return `
            <div style="border: 1px solid ${themeColor}; padding: 20px; background: ${bgTheme}; border-radius: 4px;">
                <h3 style="color: ${themeColor}; margin-top: 0; font-size: 1.1rem;">${title}</h3>
                <div style="margin-bottom: 15px; font-weight: bold;">Route: Lateral Transshipment &rarr; ${nodeName}</div>
                <div style="font-family: 'JetBrains Mono', monospace; font-size: 0.9rem; color: #ccc;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 8px;"><span>LTL Freight & Handling:</span> <span style="color: var(--danger);">-$${ltlFreight.toFixed(2)}</span></div>
                    ${this.currentMode === 'PULL' ? `<div style="display: flex; justify-content: space-between; margin-bottom: 8px;"><span>Capital Exp. Avoided:</span> <span style="color: var(--neon-green);">+$${this.selectedAsset.cost.toFixed(2)}</span></div>` : ''}
                    <div style="display: flex; justify-content: space-between; margin-bottom: 8px;"><span>Holding Cost/Lost Sales Relieved:</span> <span style="color: var(--neon-green);">+$${holdingSaved.toFixed(2)}</span></div>
                    <hr style="border-color: #444; margin: 15px 0;">
                    <div style="display: flex; justify-content: space-between; font-weight: bold; color: ${themeColor};"><span>Algorithmic Net Savings:</span> <span>+$${routeObj.netSavings.toFixed(2)}</span></div>
                </div>
                <button class="action-btn" style="background: ${isManual ? 'transparent' : themeColor}; color: ${isManual ? themeColor : 'black'}; border: ${isManual ? `1px solid ${themeColor}` : 'none'}; margin-top: 25px;" 
                onclick="UIController.executeTransfer('${isManual ? 'MANUAL' : 'OPTIMIZED'}', '${nodeName}', ${transferQty}, ${routeObj.netSavings})">
                ${isManual ? 'Force Manual Route' : 'Execute Transshipment'}</button>
            </div>
        `;
    },

    executeTransfer(decisionType, targetNode, quantity, netImpact) {
        let originNode = this.currentMode === 'PUSH' ? this.selectedAsset.node : targetNode;
        let destNode = this.currentMode === 'PUSH' ? targetNode : this.selectedAsset.node;

        document.getElementById('comparisonModal').style.display = 'none';
        
        this.showToast(`SUCCESS: Transferred ${quantity} units of ${this.selectedAsset.sku} (${originNode} \u2192 ${destNode}). Syncing to cloud ledger...`);

        try {
            LedgerEngine.recordTransaction(this.selectedAsset, decisionType, targetNode, netImpact);
        } catch (e) {
            console.error("Ledger connection failed:", e);
        }

        // Database Write via DataEngine
        DataEngine.executeTransferDB({ 
            sku: this.selectedAsset.sku, 
            origin: originNode, 
            destination: destNode, 
            quantity: quantity, 
            type: decisionType, 
            netSavings: netImpact, 
            unitCost: this.selectedAsset.cost 
        }).then(() => {
            DataEngine.loadInventoryData().then(() => {
                this.renderTable();
            });
        });

        // Reset Command Center
        this.selectedAsset = null;
        document.getElementById('selectedAssetDetails').innerHTML = `<div style="color: var(--lavender-dark);">Awaiting target selection from telemetry...</div>`;
        document.getElementById('manualActionContainer').innerHTML = '';
        document.getElementById('optimizeBtn').disabled = true;
    },

    showToast(message) {
        let toast = document.createElement('div');
        toast.style.position = 'fixed';
        toast.style.top = '30px';
        toast.style.right = '40px';
        toast.style.background = 'var(--neon-green)';
        toast.style.color = '#000';
        toast.style.padding = '15px 25px';
        toast.style.borderRadius = '4px';
        toast.style.fontFamily = "'JetBrains Mono', monospace";
        toast.style.fontWeight = 'bold';
        toast.style.boxShadow = '0 5px 20px rgba(0, 250, 154, 0.4)';
        toast.style.zIndex = '9999';
        toast.style.transition = 'opacity 0.4s ease-in-out';
        toast.innerText = message;

        document.body.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => document.body.removeChild(toast), 400);
        }, 3500);
    }
};
