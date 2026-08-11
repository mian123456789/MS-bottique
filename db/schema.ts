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

export const systemSettings = sqliteTable("system_settings", {
  id: integer("id").primaryKey(),
  companyName: text("company_name").notNull().default("MS Boutique"),
  address: text("address").notNull().default(""),
  phone: text("phone").notNull().default(""),
  website: text("website").notNull().default(""),
  logoUrl: text("logo_url").notNull().default(""),
  invoicePrefix: text("invoice_prefix").notNull().default("INV"),
  challanPrefix: text("challan_prefix").notNull().default("DC"),
  footerNote: text("footer_note").notNull().default("Thank you for choosing MS Boutique."),
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

export const gatepasses = sqliteTable("gatepasses", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  gatepassNo: text("gatepass_no").notNull().unique(),
  lotId: integer("lot_id").notNull().references(() => lots.id),
  designId: integer("design_id").notNull().references(() => designs.id),
  userId: integer("user_id").references(() => users.id),
  quantity: integer("quantity").notNull(),
  cartons: integer("cartons").notNull().default(0),
  fromDepartment: text("from_department").notNull().default("Packing"),
  toDepartment: text("to_department").notNull().default("Warehouse"),
  purpose: text("purpose").notNull().default("Warehouse Shipment"),
  vehicleNo: text("vehicle_no").notNull().default(""),
  driverName: text("driver_name").notNull().default(""),
  driverContact: text("driver_contact").notNull().default(""),
  issuedBy: text("issued_by").notNull().default(""),
  approvedBy: text("approved_by").notNull().default(""),
  securityCheck: text("security_check").notNull().default("Pending"),
  gatepassDate: text("gatepass_date").notNull(),
  releaseDate: text("release_date"),
  status: text("status").notNull().default("Pending"),
  remarks: text("remarks").notNull().default(""),
  ...timestamps,
}, (table) => [index("idx_gatepass_lot_id").on(table.lotId)]);

export const warehouseReceipts = sqliteTable("warehouse_receipts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  receiptNo: text("receipt_no").notNull().unique(),
  lotId: integer("lot_id").notNull().references(() => lots.id),
  designId: integer("design_id").notNull().references(() => designs.id),
  departmentId: integer("department_id").notNull().references(() => departments.id),
  gatepassId: integer("gatepass_id").references(() => gatepasses.id),
  userId: integer("user_id").references(() => users.id),
  receivedQty: integer("received_qty").notNull(),
  receivableQty: integer("receivable_qty").notNull().default(0),
  nonReceivableQty: integer("non_receivable_qty").notNull().default(0),
  nonReceivableReason: text("non_receivable_reason").notNull().default(""),
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
  nonReceivableQty: integer("non_receivable_qty").notNull().default(0),
  dispatchStatus: text("dispatch_status").notNull().default("Active"),
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

export const employees = sqliteTable("employees", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  employeeCode: text("employee_code").notNull().unique(),
  name: text("name").notNull(),
  fatherName: text("father_name").notNull().default(""),
  cnic: text("cnic").notNull().default(""),
  phone: text("phone").notNull().default(""),
  address: text("address").notNull().default(""),
  department: text("department").notNull().default("Stitching"),
  designation: text("designation").notNull().default("Operator"),
  joiningDate: text("joining_date").notNull(),
  salaryType: text("salary_type").notNull().default("Monthly"),
  monthlySalary: real("monthly_salary").notNull().default(0),
  ratePerPiece: real("rate_per_piece").notNull().default(0),
  status: text("status").notNull().default("Active"),
  remarks: text("remarks").notNull().default(""),
  ...timestamps,
}, (table) => [index("idx_employees_department").on(table.department)]);

export const attendanceRecords = sqliteTable("attendance_records", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  employeeId: integer("employee_id").notNull().references(() => employees.id),
  attendanceDate: text("attendance_date").notNull(),
  status: text("status").notNull().default("Present"),
  inTime: text("in_time").notNull().default(""),
  outTime: text("out_time").notNull().default(""),
  overtimeHours: real("overtime_hours").notNull().default(0),
  piecesDone: integer("pieces_done").notNull().default(0),
  lotNo: text("lot_no").notNull().default(""),
  remarks: text("remarks").notNull().default(""),
  ...timestamps,
}, (table) => [uniqueIndex("idx_attendance_employee_date").on(table.employeeId, table.attendanceDate)]);

// Theka pay is built from item entries, so the rate lives on the work done and
// not on the employee — the same worker can be on different rates per item.
export const pieceWorkEntries = sqliteTable("piece_work_entries", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  employeeId: integer("employee_id").notNull().references(() => employees.id),
  period: text("period").notNull(),
  item: text("item").notNull(),
  lotNo: text("lot_no").notNull().default(""),
  workFrom: text("work_from").notNull(),
  workTo: text("work_to").notNull(),
  pcsQty: integer("pcs_qty").notNull().default(0),
  ratePerPiece: real("rate_per_piece").notNull().default(0),
  totalAmount: real("total_amount").notNull().default(0),
  remarks: text("remarks").notNull().default(""),
  ...timestamps,
}, (table) => [index("idx_piece_work_employee_period").on(table.employeeId, table.period)]);

export const salaryAdvances = sqliteTable("salary_advances", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  employeeId: integer("employee_id").notNull().references(() => employees.id),
  period: text("period").notNull(),
  advanceDate: text("advance_date").notNull(),
  amount: real("amount").notNull().default(0),
  remarks: text("remarks").notNull().default(""),
  ...timestamps,
}, (table) => [index("idx_advance_employee_period").on(table.employeeId, table.period)]);

export const salaryRecords = sqliteTable("salary_records", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  employeeId: integer("employee_id").notNull().references(() => employees.id),
  period: text("period").notNull(),
  salaryType: text("salary_type").notNull().default("Monthly"),
  presentDays: integer("present_days").notNull().default(0),
  absentDays: integer("absent_days").notNull().default(0),
  totalPieces: integer("total_pieces").notNull().default(0),
  ratePerPiece: real("rate_per_piece").notNull().default(0),
  baseAmount: real("base_amount").notNull().default(0),
  overtimeAmount: real("overtime_amount").notNull().default(0),
  bonus: real("bonus").notNull().default(0),
  advance: real("advance").notNull().default(0),
  deduction: real("deduction").notNull().default(0),
  netPayable: real("net_payable").notNull().default(0),
  paymentStatus: text("payment_status").notNull().default("Unpaid"),
  paidDate: text("paid_date"),
  remarks: text("remarks").notNull().default(""),
  ...timestamps,
}, (table) => [uniqueIndex("idx_salary_employee_period").on(table.employeeId, table.period)]);

export const suppliers = sqliteTable("suppliers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  contact: text("contact").notNull().default(""),
  address: text("address").notNull().default(""),
  ...timestamps,
});

export const purchases = sqliteTable("purchases", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  purchaseNo: text("purchase_no").notNull().unique(),
  supplierId: integer("supplier_id").notNull().references(() => suppliers.id),
  purchaseDate: text("purchase_date").notNull(),
  item: text("item").notNull(),
  category: text("category").notNull().default("Fabric"),
  quantity: real("quantity").notNull().default(0),
  unit: text("unit").notNull().default("Meters"),
  rate: real("rate").notNull().default(0),
  totalAmount: real("total_amount").notNull().default(0),
  paidAmount: real("paid_amount").notNull().default(0),
  balanceAmount: real("balance_amount").notNull().default(0),
  paymentMethod: text("payment_method").notNull().default("Cash"),
  status: text("status").notNull().default("Ordered"),
  invoiceNo: text("invoice_no").notNull().default(""),
  receivedDate: text("received_date"),
  remarks: text("remarks").notNull().default(""),
  ...timestamps,
}, (table) => [index("idx_purchases_status").on(table.status)]);

export const shops = sqliteTable("shops", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  shopCode: text("shop_code").notNull().unique(),
  name: text("name").notNull(),
  address: text("address").notNull().default(""),
  phone: text("phone").notNull().default(""),
  manager: text("manager").notNull().default(""),
  logoUrl: text("logo_url").notNull().default(""),
  invoicePrefix: text("invoice_prefix").notNull().default("INV"),
  footerNote: text("footer_note").notNull().default("Thank you for shopping with us."),
  openingCash: real("opening_cash").notNull().default(0),
  openingDate: text("opening_date").notNull(),
  status: text("status").notNull().default("Active"),
  ...timestamps,
});

// Warehouse ships finished goods out to a shop; the shop confirms what arrived.
export const shopShipments = sqliteTable("shop_shipments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  shipmentNo: text("shipment_no").notNull().unique(),
  shopId: integer("shop_id").notNull().references(() => shops.id),
  lotId: integer("lot_id").notNull().references(() => lots.id),
  designId: integer("design_id").notNull().references(() => designs.id),
  productName: text("product_name").notNull().default(""),
  quantity: integer("quantity").notNull(),
  receivableQty: integer("receivable_qty").notNull().default(0),
  nonReceivableQty: integer("non_receivable_qty").notNull().default(0),
  nonReceivableReason: text("non_receivable_reason").notNull().default(""),
  saleRate: real("sale_rate").notNull().default(0),
  cartons: integer("cartons").notNull().default(0),
  sentDate: text("sent_date").notNull(),
  receivedDate: text("received_date"),
  receivedBy: text("received_by").notNull().default(""),
  status: text("status").notNull().default("In Transit"),
  remarks: text("remarks").notNull().default(""),
  ...timestamps,
}, (table) => [index("idx_shop_shipments_shop").on(table.shopId, table.status)]);

export const shopInventory = sqliteTable("shop_inventory", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  shopId: integer("shop_id").notNull().references(() => shops.id),
  lotId: integer("lot_id").references(() => lots.id),
  designId: integer("design_id").references(() => designs.id),
  productName: text("product_name").notNull(),
  sku: text("sku").notNull().default(""),
  receivedQty: integer("received_qty").notNull().default(0),
  soldQty: integer("sold_qty").notNull().default(0),
  nonReceivableQty: integer("non_receivable_qty").notNull().default(0),
  saleRate: real("sale_rate").notNull().default(0),
  status: text("status").notNull().default("In Stock"),
  ...timestamps,
}, (table) => [uniqueIndex("idx_shop_inventory_unique").on(table.shopId, table.sku)]);

export const shopSales = sqliteTable("shop_sales", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  invoiceNo: text("invoice_no").notNull().unique(),
  shopId: integer("shop_id").notNull().references(() => shops.id),
  customerName: text("customer_name").notNull(),
  customerPhone: text("customer_phone").notNull(),
  saleDate: text("sale_date").notNull(),
  subtotal: real("subtotal").notNull().default(0),
  discount: real("discount").notNull().default(0),
  totalAmount: real("total_amount").notNull().default(0),
  receivedAmount: real("received_amount").notNull().default(0),
  changeAmount: real("change_amount").notNull().default(0),
  balanceAmount: real("balance_amount").notNull().default(0),
  paymentMethod: text("payment_method").notNull().default("Cash"),
  soldBy: text("sold_by").notNull().default(""),
  remarks: text("remarks").notNull().default(""),
  ...timestamps,
}, (table) => [index("idx_shop_sales_shop_date").on(table.shopId, table.saleDate)]);

export const shopSaleItems = sqliteTable("shop_sale_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  saleId: integer("sale_id").notNull().references(() => shopSales.id),
  shopId: integer("shop_id").notNull().references(() => shops.id),
  inventoryId: integer("inventory_id").references(() => shopInventory.id),
  productName: text("product_name").notNull(),
  quantity: integer("quantity").notNull().default(0),
  rate: real("rate").notNull().default(0),
  amount: real("amount").notNull().default(0),
  ...timestamps,
}, (table) => [index("idx_shop_sale_items_sale").on(table.saleId)]);

export const shopExpenses = sqliteTable("shop_expenses", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  shopId: integer("shop_id").notNull().references(() => shops.id),
  expenseDate: text("expense_date").notNull(),
  category: text("category").notNull().default("General"),
  description: text("description").notNull().default(""),
  amount: real("amount").notNull().default(0),
  paidBy: text("paid_by").notNull().default(""),
  paymentMethod: text("payment_method").notNull().default("Cash"),
  ...timestamps,
}, (table) => [index("idx_shop_expenses_shop_date").on(table.shopId, table.expenseDate)]);

export const shopAttendance = sqliteTable("shop_attendance", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  shopId: integer("shop_id").notNull().references(() => shops.id),
  staffName: text("staff_name").notNull(),
  attendanceDate: text("attendance_date").notNull(),
  status: text("status").notNull().default("Present"),
  inTime: text("in_time").notNull().default(""),
  outTime: text("out_time").notNull().default(""),
  remarks: text("remarks").notNull().default(""),
  ...timestamps,
}, (table) => [uniqueIndex("idx_shop_attendance_unique").on(table.shopId, table.staffName, table.attendanceDate)]);

export const shopDayClose = sqliteTable("shop_day_close", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  shopId: integer("shop_id").notNull().references(() => shops.id),
  closeDate: text("close_date").notNull(),
  openingCash: real("opening_cash").notNull().default(0),
  cashSales: real("cash_sales").notNull().default(0),
  bankSales: real("bank_sales").notNull().default(0),
  totalSales: real("total_sales").notNull().default(0),
  expenses: real("expenses").notNull().default(0),
  expectedCash: real("expected_cash").notNull().default(0),
  countedCash: real("counted_cash").notNull().default(0),
  difference: real("difference").notNull().default(0),
  invoices: integer("invoices").notNull().default(0),
  closedBy: text("closed_by").notNull().default(""),
  remarks: text("remarks").notNull().default(""),
  ...timestamps,
}, (table) => [uniqueIndex("idx_shop_day_close_unique").on(table.shopId, table.closeDate)]);

export const notifications = sqliteTable("notifications", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").references(() => users.id),
  actorName: text("actor_name").notNull().default("System"),
  audience: text("audience").notNull().default("Owner"),
  category: text("category").notNull().default("Production"),
  level: text("level").notNull().default("info"),
  title: text("title").notNull(),
  message: text("message").notNull(),
  link: text("link").notNull().default(""),
  read: integer("read", { mode: "boolean" }).notNull().default(false),
  ...timestamps,
}, (table) => [index("idx_notifications_read").on(table.read)]);

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
