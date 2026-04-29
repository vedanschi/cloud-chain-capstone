/**
 * DATA-ENGINE.JS
 * Core Data Layer: Handles local CSV parsing and Cloud API telemetry.
 */

const DataEngine = {
    // Master array holding the live network state
    inventoryState: [],

    /**
     * Fetches and parses the decoupled 250-item inventory dataset.
     */
    async loadInventoryData() {
        try {
            const response = await fetch('/inventory_state.csv');
            if (!response.ok) throw new Error("Database fetch rejected.");
            
            const data = await response.text();
            
            // Split into rows and drop the CSV header row
            const rows = data.split('\n').slice(1); 
            
            this.inventoryState = []; // Initialize clean state
            
            rows.forEach(row => {
                if (row.trim() === '') return;
                const cols = row.split(',');
                
                // Map CSV columns directly to object properties
                this.inventoryState.push({
                    sku: cols[0].trim(),
                    node: cols[1].trim(),
                    cost: parseFloat(cols[2].trim()),
                    stock: parseInt(cols[3].trim()),
                    demand: parseInt(cols[4].trim()),
                    stagnant: parseInt(cols[5].trim()),
                    leadTime: parseInt(cols[6].trim())
                });
            });

            console.log("[DATA-ENGINE] Telemetry sync complete. 250 records loaded.");
            return true;
            
        } catch (error) {
            console.error("[DATA-ENGINE] FATAL: Could not locate inventory_state.csv database.", error);
            return false;
        }
    },

    /**
     * Bridges the dashboard to the Render Java API for optimization math.
     * @param {Object} payload - The telemetry parameters for the engine.
     */
    async fetchOptimization(payload) {
        // payload includes: sku, origin, cost, stock, stagnant, mode, targetNode
        const queryParams = new URLSearchParams(payload);
        
        try {
            const response = await fetch(`https://cloud-chain-capstone.onrender.com/api/optimize?${queryParams}`);
            
            if (!response.ok) {
                throw new Error(`HTTP Error: ${response.status}`);
            }
            
            return await response.json();
            
        } catch (error) {
            console.error("[DATA-ENGINE] Connection timeout. Ensure Render service is active.", error);
            return { success: false, error: true };
        }
    }
};
