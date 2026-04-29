/**
 * LEDGER-ENGINE.JS
 * Financial Layer: Tracks global savings and logs persistent transaction history.
 */

const LedgerEngine = {
    totalSavings: 0.00,
    transactionCount: 0,

    /**
     * Records a completed transaction into the live ledger and updates the global savings.
     * @param {Object} asset - The asset being transferred (sku, origin, etc.)
     * @param {String} decisionType - 'MANUAL' or 'OPTIMIZED'
     * @param {String} destination - The target node
     * @param {Number} netImpact - The financial impact of the choice (positive for savings, negative for loss)
     */
    recordTransaction(asset, decisionType, destination, netImpact) {
        this.transactionCount++;

        // Update the global savings tracker
        this.totalSavings += netImpact;
        this.updateHeroMetric();

        // Format the timestamp
        const now = new Date();
        const timestamp = now.toLocaleTimeString('en-US', { hour12: false });

        // Determine styling based on the financial impact
        const isProfit = netImpact >= 0;
        const impactColor = isProfit ? 'var(--neon-green)' : 'var(--danger)';
        const impactSign = isProfit ? '+$' : '-$';
        const absoluteImpact = Math.abs(netImpact).toFixed(2);

        // Construct the ledger row
        const tr = document.createElement('tr');
        
        tr.innerHTML = `
            <td style="color: var(--lavender);">${timestamp}</td>
            <td><span style="font-weight: bold; color: ${decisionType === 'OPTIMIZED' ? 'var(--neon-green)' : 'var(--warning)'};">[${decisionType}]</span></td>
            <td style="color: var(--teal); font-weight: bold;">${asset.sku}</td>
            <td>${asset.node} &rarr; ${destination}</td>
            <td style="color: ${impactColor}; font-weight: bold;">${impactSign}${absoluteImpact}</td>
        `;

        // Prepend the row to the top of the ledger table so the newest action is always visible
        const tbody = document.getElementById('ledgerBody');
        if (tbody) {
            tbody.insertBefore(tr, tbody.firstChild);
        }

        console.log(`[LEDGER-ENGINE] Transaction ${this.transactionCount} logged. Net Impact: ${impactSign}${absoluteImpact}`);
    },

    /**
     * Updates the glowing "Hero Metric" at the top of the ledger panel.
     */
    updateHeroMetric() {
        const savingsEl = document.getElementById('totalSavingsCounter');
        if (!savingsEl) return;

        const isProfit = this.totalSavings >= 0;
        const impactSign = isProfit ? '+$' : '-$';
        const impactColor = isProfit ? 'var(--neon-green)' : 'var(--danger)';
        const absoluteSavings = Math.abs(this.totalSavings).toFixed(2);

        savingsEl.innerText = `${impactSign}${absoluteSavings}`;
        savingsEl.style.color = impactColor;
        
        // Add a quick pulse animation to draw attention to the money saved
        savingsEl.style.transform = 'scale(1.1)';
        setTimeout(() => {
            savingsEl.style.transform = 'scale(1)';
        }, 200);
    }
};
