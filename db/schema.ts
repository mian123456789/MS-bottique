import { sql } from "drizzle-orm";
import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const timestamps = {
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
};

export const roles = sqliteTable("roles", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  ...timestamps,
});

export const departments = sqliteTable("departments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  sequence: integer("sequence").notNull(),
  ...timestamps,
});

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  roleId: integer("role_id").references(() => roles.id),
  departmentId: integer("department_id").references(() => departments.id),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  ...timestamps,
});

export const customers = sqliteTable("customers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  contact: text("contact").notNull().default(""),
  destination: text("destination").notNull().default(""),
  ...timestamps,
});

export const designs = sqliteTable("designs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  designNo: text("design_no").notNull().unique(),
  fabrication: text("fabrication").notNull(),
  sizeRange: text("size_range").notNull(),
  ...timestamps,
});

export const lots = sqliteTable("lots", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  lotNo: text("lot_no").notNull().unique(),
  designId: integer("design_id").notNull().references(() => designs.id),
  customerId: integer("customer_id").notNull().references(() => customers.id),
  fabrication: text("fabrication").notNull(),
  quantity: integer("quantity").notNull(),
  sizeRange: text("size_range").notNull(),
  orderDate: text("order_date").notNull(),
  requiredDeliveryDate: text("required_delivery_date").notNull(),
  priority: text("priority").notNull().default("Normal"),
  currentDepartment: text("current_department").notNull().default("Issue Lot"),
  status: text("status").notNull().default("Lot Issued"),
  completedQty: integer("completed_qty").notNull().default(0),
  remarks: text("remarks").notNull().default(""),
  issueDate: text("issue_date").notNull(),
  userId: integer("user_id").references(() => users.id),
  ...timestamps,
}, (table) => [
  index("idx_lots_department_status").on(table.currentDepartment, table.status),
  index("idx_lots_design_id").on(table.designId),
]);

export const lotSizeBreakdowns = sqliteTable("lot_size_breakdowns", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  lotId: integer("lot_id").notNull().references(() => lots.id),
  size: text("size").notNull(),
  quantity: integer("quantity").notNull(),
  ...timestamps,
});

const departmentColumns = {
  id: integer("id").primaryKey({ autoIncrement: true }),
  lotId: integer("lot_id").notNull().references(() => lots.id),
  designId: integer("design_id").notNull().references(() => designs.id),
  departmentId: integer("department_id").notNull().references(() => departments.id),
  userId: integer("user_id").references(() => users.id),
  receivedQty: integer("received_qty").notNull().default(0),
  completedQty: integer("completed_qty").notNull().default(0),
  rejectedQty: integer("rejected_qty").notNull().default(0),
  reworkQty: integer("rework_qty").notNull().default(0),
  transferredQty: integer("transferred_qty").notNull().default(0),
  status: text("status").notNull().default("Waiting"),
  remarks: text("remarks").notNull().default(""),
  startDate: text("start_date"),
  completionDate: text("completion_date"),
  ...timestamps,
};

export const embroideryRecords = sqliteTable("embroidery_records", {
  ...departmentColumns,
  embroideryType: text("embroidery_type").notNull().default("Multi-head"),
  patternNo: text("pattern_no").notNull().default(""),
  machineNo: text("machine_no").notNull().default(""),
  operator: text("operator").notNull().default(""),
  supervisor: text("supervisor").notNull().default(""),
}, (table) => [uniqueIndex("idx_embroidery_lot_unique").on(table.lotId)]);

export const cuttingRecords = sqliteTable("cutting_records", {
  ...departmentColumns,
  targetQty: integer("target_qty").notNull().default(0),
  cuttingQty: integer("cutting_qty").notNull().default(0),
  passedQty: integer("passed_qty").notNull().default(0),
  layerNo: text("layer_no").notNull().default(""),
  markerNo: text("marker_no").notNull().default(""),
  cuttingTable: text("cutting_table").notNull().default(""),
  operator: text("operator").notNull().default(""),
  supervisor: text("supervisor").notNull().default(""),
}, (table) => [uniqueIndex("idx_cutting_lot_unique").on(table.lotId)]);

export const stitchingRecords = sqliteTable("stitching_records", {
  ...departmentColumns,
  productionLine: text("production_line").notNull().default(""),
  supervisor: text("supervisor").notNull().default(""),
  targetQty: integer("target_qty").notNull().default(0),
  todayProduction: integer("today_production").notNull().default(0),
  efficiency: real("efficiency").notNull().default(0),
  expectedCompletionDate: text("expected_completion_date"),
}, (table) => [uniqueIndex("idx_stitching_lot_unique").on(table.lotId)]);

export const finishingRecords = sqliteTable("finishing_records", {
  ...departmentColumns,
  process: text("process").notNull().default("General Quality Check"),
  checkedQty: integer("checked_qty").notNull().default(0),
  passedQty: integer("passed_qty").notNull().default(0),
  supervisor: text("supervisor").notNull().default(""),
  receivedDate: text("received_date"),
}, (table) => [uniqueIndex("idx_finishing_lot_unique").on(table.lotId)]);

export const packingRecords = sqliteTable("packing_records", {
  ...departmentColumns,
  packingQty: integer("packing_qty").notNull().default(0),
  piecesPerCarton: integer("pieces_per_carton").notNull().default(20),
  totalCartons: integer("total_cartons").notNull().default(0),
  barcodeStatus: text("barcode_status").notNull().default("Pending"),
  tagStatus: text("tag_status").notNull().default("Pending"),
  polybagStatus: text("polybag_status").notNull().default("Pending"),
  cartonStatus: text("carton_status").notNull().default("Pending"),
  supervisor: text("supervisor").notNull().default(""),
  packingDate: text("packing_date"),
}, (table) => [uniqueIndex("idx_packing_lot_unique").on(table.lotId)]);

export const warehouseReceipts = sqliteTable("warehouse_receipts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  receiptNo: text("receipt_no").notNull().unique(),
  lotId: integer("lot_id").notNull().references(() => lots.id),
  designId: integer("design_id").notNull().references(() => designs.id),
  departmentId: integer("department_id").notNull().references(() => departments.id),
  userId: integer("user_id").references(() => users.id),
  receivedQty: integer("received_qty").notNull(),
  cartons: integer("cartons").notNull().default(0),
  location: text("location").notNull().default("Finished Goods"),
  rackNo: text("rack_no").notNull().default(""),
  receivedBy: text("received_by").notNull().default(""),
  receivedDate: text("received_date").notNull(),
  status: text("status").notNull().default("Received"),
  remarks: text("remarks").notNull().default(""),
  ...timestamps,
});

export const warehouseInventory = sqliteTable("warehouse_inventory", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  lotId: integer("lot_id").notNull().unique().references(() => lots.id),
  designId: integer("design_id").notNull().references(() => designs.id),
  availableQty: integer("available_qty").notNull().default(0),
  reservedQty: integer("reserved_qty").notNull().default(0),
  dispatchedQty: integer("dispatched_qty").notNull().default(0),
  status: text("status").notNull().default("In Stock"),
  ...timestamps,
});

export const customerDispatches = sqliteTable("customer_dispatches", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  dispatchNo: text("dispatch_no").notNull().unique(),
  lotId: integer("lot_id").notNull().references(() => lots.id),
  designId: integer("design_id").notNull().references(() => designs.id),
  departmentId: integer("department_id").notNull().references(() => departments.id),
  userId: integer("user_id").references(() => users.id),
  customerId: integer("customer_id").notNull().references(() => customers.id),
  dispatchQty: integer("dispatch_qty").notNull(),
  cartonQty: integer("carton_qty").notNull().default(0),
  invoiceNo: text("invoice_no").notNull(),
  challanNo: text("challan_no").notNull(),
  transporter: text("transporter").notNull().default(""),
  vehicleNo: text("vehicle_no").notNull().default(""),
  driverName: text("driver_name").notNull().default(""),
  driverContact: text("driver_contact").notNull().default(""),
  dispatchDate: text("dispatch_date").notNull(),
  destination: text("destination").notNull().default(""),
  trackingNo: text("tracking_no").notNull().default(""),
  dispatchStatus: text("dispatch_status").notNull().default("Dispatched"),
  deliveryStatus: text("delivery_status").notNull().default("In Transit"),
  remarks: text("remarks").notNull().default(""),
  ...timestamps,
});

export const departmentTransfers = sqliteTable("department_transfers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  lotId: integer("lot_id").notNull().references(() => lots.id),
  designId: integer("design_id").notNull().references(() => designs.id),
  fromDepartmentId: integer("from_department_id").notNull().references(() => departments.id),
  toDepartmentId: integer("to_department_id").notNull().references(() => departments.id),
  userId: integer("user_id").references(() => users.id),
  quantity: integer("quantity").notNull(),
  remarks: text("remarks").notNull().default(""),
  transferDate: text("transfer_date").notNull(),
  ...timestamps,
}, (table) => [index("idx_transfers_lot_id").on(table.lotId)]);

export const lotRemarks = sqliteTable("lot_remarks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  lotId: integer("lot_id").notNull().references(() => lots.id),
  userId: integer("user_id").references(() => users.id),
  departmentId: integer("department_id").references(() => departments.id),
  remark: text("remark").notNull(),
  ...timestamps,
});

export const lotHistory = sqliteTable("lot_history", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  lotId: integer("lot_id").notNull().references(() => lots.id),
  userId: integer("user_id").references(() => users.id),
  departmentId: integer("department_id").references(() => departments.id),
  action: text("action").notNull(),
  quantity: integer("quantity").notNull().default(0),
  remarks: text("remarks").notNull().default(""),
  ...timestamps,
}, (table) => [index("idx_history_lot_id").on(table.lotId)]);

export const notifications = sqliteTable("notifications", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").references(() => users.id),
  title: text("title").notNull(),
  message: text("message").notNull(),
  read: integer("read", { mode: "boolean" }).notNull().default(false),
  ...timestamps,
});

export const auditLogs = sqliteTable("audit_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").references(() => users.id),
  departmentId: integer("department_id").references(() => departments.id),
  lotId: integer("lot_id").references(() => lots.id),
  designId: integer("design_id").references(() => designs.id),
  action: text("action").notNull(),
  previousValue: text("previous_value").notNull().default(""),
  newValue: text("new_value").notNull().default(""),
  quantity: integer("quantity").notNull().default(0),
  remarks: text("remarks").notNull().default(""),
  ...timestamps,
}, (table) => [index("idx_audit_lot_id").on(table.lotId)]);
