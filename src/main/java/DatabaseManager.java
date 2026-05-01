import java.sql.*;
import java.util.*;

public class DatabaseManager {

    // Cloud Database URL injected by Render
    private static String dbUrl = System.getenv("SUPABASE_JDBC_URL");

    private static Map<String, Map<String, Double>> distanceMatrix = new HashMap<>();
    private static List<LogisticsModels.InventoryRecord> inventoryState = new ArrayList<>();

    // --- GETTERS FOR THE ENGINE ---
    public static List<LogisticsModels.InventoryRecord> getInventoryState() {
        return inventoryState;
    }

    public static Map<String, Map<String, Double>> getDistanceMatrix() {
        return distanceMatrix;
    }

    // --- CLOUD READ OPERATION ---
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
                    inventoryState.add(new LogisticsModels.InventoryRecord(
                        rs.getString("sku_id"), rs.getString("node_location"),
                        rs.getDouble("unit_cost"), rs.getInt("current_stock"), rs.getInt("daily_demand"),
                        rs.getInt("days_stagnant"), rs.getInt("lead_time_days")
                    ));
                }
            }
            System.out.println("Cloud Sync Complete: Database loaded into memory cache.");
        } catch (Exception e) { 
            System.err.println("DB Connection Error: " + e.getMessage()); 
        }
    }

    // --- CLOUD WRITE OPERATION ---
    public static boolean executeCloudTransaction(String sku, String origin, String dest, int qty, String type, double savings, double unitCost) {
        try (Connection conn = DriverManager.getConnection(dbUrl)) {
            conn.setAutoCommit(false); // Begin strict SQL Transaction

            // 1. Deduct from Origin (if not Central Warehouse)
            if (!origin.equals("Central Warehouse")) {
                String deductSql = "UPDATE inventory_state SET current_stock = current_stock - ? WHERE sku_id = ? AND node_location = ?";
                try (PreparedStatement pstmt = conn.prepareStatement(deductSql)) {
                    pstmt.setInt(1, qty); pstmt.setString(2, sku); pstmt.setString(3, origin);
                    pstmt.executeUpdate();
                }
            }

            // 2. Add to Destination (Uses UPSERT in case the node didn't have this SKU before)
            if (!dest.equals("Central Warehouse")) {
                String addSql = "INSERT INTO inventory_state (sku_id, node_location, unit_cost, current_stock, daily_demand, days_stagnant, lead_time_days) " +
                                "VALUES (?, ?, ?, ?, 0, 0, 7) ON CONFLICT (sku_id, node_location) " +
                                "DO UPDATE SET current_stock = inventory_state.current_stock + EXCLUDED.current_stock";
                try (PreparedStatement pstmt = conn.prepareStatement(addSql)) {
                    pstmt.setString(1, sku); pstmt.setString(2, dest); pstmt.setDouble(3, unitCost); pstmt.setInt(4, qty);
                    pstmt.executeUpdate();
                }
            }

            // 3. Write to Logistics Execution Ledger
            String ledgerSql = "INSERT INTO execution_ledger (sku_id, action_type, origin_node, destination_node, quantity, net_savings) VALUES (?, ?, ?, ?, ?, ?)";
            try (PreparedStatement pstmt = conn.prepareStatement(ledgerSql)) {
                pstmt.setString(1, sku); pstmt.setString(2, type); pstmt.setString(3, origin);
                pstmt.setString(4, dest); pstmt.setInt(5, qty); pstmt.setDouble(6, savings);
                pstmt.executeUpdate();
            }

            conn.commit(); // Commit all three operations at once
            return true;

        } catch (SQLException e) {
            e.printStackTrace();
            return false; // If anything fails, Supabase automatically rolls back
        }
    }
}