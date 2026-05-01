/**
 * DATA-ENGINE.JS
 * Cloud Data Layer: Interfaces strictly with the Render Java API & Supabase.
 */
const DataEngine = {
    inventoryState: [],

    async loadInventoryData() {
        try {
            // Fetch live data from Supabase via Render API
            const response = await fetch('https://cloud-chain-capstone.onrender.com/api/inventory');
            if (!response.ok) throw new Error("Cloud database fetch rejected.");
            
            const data = await response.json();
            this.inventoryState = data.map(item => ({
                sku: item.sku, node: item.node, cost: item.unitCost, 
                stock: item.currentStock, demand: item.dailyDemand, 
                stagnant: item.daysStagnant, leadTime: item.leadTime
            }));

            console.log("[DATA-ENGINE] Database sync complete.");
            return true;
        } catch (error) {
            console.error("[DATA-ENGINE] FATAL: Could not reach Render API.", error);
            return false;
        }
    },

    async fetchOptimization(payload) {
        const queryParams = new URLSearchParams(payload);
        try {
            const response = await fetch(`https://cloud-chain-capstone.onrender.com/api/optimize?${queryParams}`);
            if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
            return await response.json();
        } catch (error) {
            console.error("[DATA-ENGINE] API Connection timeout.", error);
            return { success: false, error: true };
        }
    },

    async executeTransferDB(payload) {
        try {
            const response = await fetch('https://cloud-chain-capstone.onrender.com/api/transfer', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            return response.ok;
        } catch (error) {
            console.error("[DATA-ENGINE] Write to database failed.", error);
            return false;
        }
    }
};