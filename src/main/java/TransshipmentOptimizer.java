import io.javalin.Javalin;
import com.google.gson.Gson;
import com.google.gson.JsonObject;
import java.sql.*;
import java.util.*;

public class TransshipmentOptimizer {

    private static final double ANNUAL_HOLDING_COST_PCT = 0.20;
    private static final double PROFIT_MARGIN_PCT = 0.30;
    private static final double BASE_FREIGHT_COST = 50.0;
    private static final double RATE_PER_MILE = 0.15;
    private static final double HANDLING_FEE = 20.0;
    private static final int ORIGIN_SAFETY_STOCK_BUFFER = 10;
    private static final double CENTRAL_WAREHOUSE_FREIGHT = 120.0;

    private static Map<String, Map<String, Double>> distanceMatrix = new HashMap<>();
    private static List<InventoryRecord> inventoryState = new ArrayList<>();
    
    // Cloud Database URL injected by Render
    private static String dbUrl = System.getenv("SUPABASE_JDBC_URL");

    public static void main(String[] args) {
        try {
            System.out.println("Starting up Global Optimization API & Database Sync...");
            syncDataFromCloud(); // Initial fetch from Supabase

            int port = System.getenv("PORT") != null ? Integer.parseInt(System.getenv("PORT")) : 7070;

            Javalin app = Javalin.create(config -> {
                config.bundledPlugins.enableCors(cors -> cors.addRule(it -> it.anyHost()));
            }).start(port);

            System.out.println("API successfully running on port " + port);

            // ENDPOINT: Fetch Live Inventory for the Dashboard
            app.get("/api/inventory", ctx -> {
                syncDataFromCloud(); // Always fetch freshest data
                ctx.json(new Gson().toJson(inventoryState));
            });

            // ENDPOINT: Run the Optimization Engine
            app.get("/api/optimize", ctx -> {
                String targetSku = ctx.queryParam("sku");
                String originNode = ctx.queryParam("origin");
                double targetCost = Double.parseDouble(ctx.queryParam("cost"));
                int targetStock = Integer.parseInt(ctx.queryParam("stock"));
                int targetStagnant = Integer.parseInt(ctx.queryParam("stagnant"));
                String targetNode = ctx.queryParam("targetNode");
                String mode = ctx.queryParam("mode");

                OptimizationResult response = runGlobalEngine(targetSku, originNode, targetCost, targetStock, targetStagnant, targetNode, mode);
                ctx.json(new Gson().toJson(response));
            });

            // ENDPOINT: Execute Transfer & Write to Database
            app.post("/api/transfer", ctx -> {
                JsonObject body = new Gson().fromJson(ctx.body(), JsonObject.class);
                String sku = body.get("sku").getAsString();
                String origin = body.get("origin").getAsString();
                String destination = body.get("destination").getAsString();
                int qty = body.get("quantity").getAsInt();
                String type = body.get("type").getAsString();
                double savings = body.get("netSavings").getAsDouble();
                double cost = body.get("unitCost").getAsDouble();

                boolean success = executeCloudTransaction(sku, origin, destination, qty, type, savings, cost);
                if (success) {
                    syncDataFromCloud(); // Resync memory state after DB write
                    ctx.status(200).json("{\"status\":\"success\"}");
                } else {
                    ctx.status(500).json("{\"status\":\"database_error\"}");
                }
            });

        } catch (Exception e) {
            System.err.println("FATAL STARTUP ERROR:");
            e.printStackTrace();
        }
    }

    private static boolean executeCloudTransaction(String sku, String origin, String dest, int qty, String type, double savings, double unitCost) {
        try (Connection conn = DriverManager.getConnection(dbUrl)) {
            conn.setAutoCommit(false); // Begin Transaction

            // 1. Deduct from Origin (if not Central Warehouse)
            if (!origin.equals("Central Warehouse")) {
                String deductSql = "UPDATE inventory_state SET current_stock = current_stock - ? WHERE sku_id = ? AND node_location = ?";
                try (PreparedStatement pstmt = conn.prepareStatement(deductSql)) {
                    pstmt.setInt(1, qty); pstmt.setString(2, sku); pstmt.setString(3, origin);
                    pstmt.executeUpdate();
                }
            }

            // 2. Add to Destination (if not Central Warehouse). Uses UPSERT in case node didn't have SKU before.
            if (!dest.equals("Central Warehouse")) {
                String addSql = "INSERT INTO inventory_state (sku_id, node_location, unit_cost, current_stock, daily_demand, days_stagnant, lead_time_days) " +
                                "VALUES (?, ?, ?, ?, 0, 0, 7) ON CONFLICT (sku_id, node_location) " +
                                "DO UPDATE SET current_stock = inventory_state.current_stock + EXCLUDED.current_stock";
                try (PreparedStatement pstmt = conn.prepareStatement(addSql)) {
                    pstmt.setString(1, sku); pstmt.setString(2, dest); pstmt.setDouble(3, unitCost); pstmt.setInt(4, qty);
                    pstmt.executeUpdate();
                }
            }

            // 3. Write to Logistics Ledger
            String ledgerSql = "INSERT INTO execution_ledger (sku_id, action_type, origin_node, destination_node, quantity, net_savings) VALUES (?, ?, ?, ?, ?, ?)";
            try (PreparedStatement pstmt = conn.prepareStatement(ledgerSql)) {
                pstmt.setString(1, sku); pstmt.setString(2, type); pstmt.setString(3, origin);
                pstmt.setString(4, dest); pstmt.setInt(5, qty); pstmt.setDouble(6, savings);
                pstmt.executeUpdate();
            }

            conn.commit(); // Commit Transaction
            return true;

        } catch (SQLException e) {
            e.printStackTrace();
            return false;
        }
    }

    public static void syncDataFromCloud() {
        inventoryState.clear();
        distanceMatrix.clear();
        
        try (Connection conn = DriverManager.getConnection(dbUrl)) {
            // Load Distances
            try (Statement stmt = conn.createStatement(); ResultSet rs = stmt.executeQuery("SELECT origin_node, destination_node, distance_miles FROM network_distances")) {
                while (rs.next()) {
                    distanceMatrix.computeIfAbsent(rs.getString("origin_node"), k -> new HashMap<>())
                                  .put(rs.getString("destination_node"), rs.getDouble("distance_miles"));
                }
            }
            // Load Inventory
            try (Statement stmt = conn.createStatement(); ResultSet rs = stmt.executeQuery("SELECT * FROM inventory_state")) {
                while (rs.next()) {
                    inventoryState.add(new InventoryRecord(rs.getString("sku_id"), rs.getString("node_location"),
                        rs.getDouble("unit_cost"), rs.getInt("current_stock"), rs.getInt("daily_demand"),
                        rs.getInt("days_stagnant"), rs.getInt("lead_time_days")));
                }
            }
            System.out.println("Cloud Sync Complete: Data Loaded into Memory.");
        } catch (Exception e) { System.err.println("DB Connection Error: " + e.getMessage()); }
    }

    public static OptimizationResult runGlobalEngine(String sku, String lockedNode, double unitCost, int stock, int stagnant, String manualTarget, String mode) {
        OptimizationResult result = new OptimizationResult();
        double accumulatedHoldingCost = (unitCost * ANNUAL_HOLDING_COST_PCT) * (stagnant / 365.0);
        double costOfLostSale = unitCost * PROFIT_MARGIN_PCT;

        if ("PUSH".equalsIgnoreCase(mode)) {
            double totalCostOfInaction = accumulatedHoldingCost + costOfLostSale;
            int originSurplus = stock - ORIGIN_SAFETY_STOCK_BUFFER;

            for (InventoryRecord dest : inventoryState) {
                if (dest.sku.equals(sku) && !dest.node.equals(lockedNode)) {
                    double reorderPoint = (dest.dailyDemand * dest.leadTime) * 1.2;
                    if (dest.currentStock <= reorderPoint && dest.dailyDemand > 0) {
                        double distance = distanceMatrix.getOrDefault(lockedNode, new HashMap<>()).getOrDefault(dest.node, 9999.0);
                        double totalFreightCost = BASE_FREIGHT_COST + (distance * RATE_PER_MILE) + HANDLING_FEE;

                        if (totalCostOfInaction > totalFreightCost) {
                            int destDeficit = (int) Math.ceil(reorderPoint - dest.currentStock);
                            int transferQuantity = Math.min(originSurplus, destDeficit);
                            double netSavings = totalCostOfInaction - totalFreightCost;

                            if (transferQuantity > 0) result.viableRoutes.add(new RouteDecision(dest.node, distance, transferQuantity, netSavings));
                        }
                    }
                }
            }
        } else if ("PULL".equalsIgnoreCase(mode)) {
            double cwPenalty = CENTRAL_WAREHOUSE_FREIGHT + unitCost; // Human baseline cost

            // THE LOGIC FIX: Instantly inject Central Warehouse as the fallback guarantee. 
            // It has $0.00 relative savings because it is the baseline we compare against.
            result.viableRoutes.add(new RouteDecision("Central Warehouse", 0.0, 50, 0.0));

            for (InventoryRecord origin : inventoryState) {
                if (origin.sku.equals(sku) && !origin.node.equals(lockedNode)) {
                    int surplus = origin.currentStock - ORIGIN_SAFETY_STOCK_BUFFER;
                    
                    if (surplus > 0 && origin.daysStagnant >= 90) {
                        double distance = distanceMatrix.getOrDefault(origin.node, new HashMap<>()).getOrDefault(lockedNode, 9999.0);
                        double lateralFreightCost = BASE_FREIGHT_COST + (distance * RATE_PER_MILE) + HANDLING_FEE;
                        double peerHoldingCostSaved = (unitCost * ANNUAL_HOLDING_COST_PCT) * (origin.daysStagnant / 365.0);
                        double lateralNetCost = lateralFreightCost - peerHoldingCostSaved;

                        // Does this lateral move beat the Central Warehouse?
                        if (lateralNetCost < cwPenalty) {
                            double netSavings = cwPenalty - lateralNetCost;
                            int transferQuantity = Math.min(surplus, 50);
                            result.viableRoutes.add(new RouteDecision(origin.node, distance, transferQuantity, netSavings));
                        }
                    }
                }
            }
        }

        if (!result.viableRoutes.isEmpty()) {
            // Sort by highest savings first. If a lateral route saves money, it beats the Central Warehouse.
            result.viableRoutes.sort((r1, r2) -> Double.compare(r2.netSavings, r1.netSavings));
            result.winner = result.viableRoutes.get(0);
            result.success = true;
        }

        return result;
    }

    static class InventoryRecord {
        String sku, node; double unitCost; int currentStock, dailyDemand, daysStagnant, leadTime;
        public InventoryRecord(String s, String n, double u, int c, int d, int ds, int lt) {
            sku = s; node = n; unitCost = u; currentStock = c; dailyDemand = d; daysStagnant = ds; leadTime = lt;
        }
    }

    static class RouteDecision {
        String destinationNode; double distanceMiles, netSavings; int transferQuantity;
        public RouteDecision(String d, double dist, int t, double s) { destinationNode = d; distanceMiles = dist; transferQuantity = t; netSavings = s; }
    }

    static class OptimizationResult { boolean success = false; RouteDecision winner = null; List<RouteDecision> viableRoutes = new ArrayList<>(); }
}