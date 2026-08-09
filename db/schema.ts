import { sql } from "drizzle-orm";
import { integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const createdAt = () => text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`);
const updatedAt = () => text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`);

export const roles = sqliteTable("roles", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  permissions: text("permissions").notNull().default("[]"),
});

export const departments = sqliteTable("departments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  code: text("code").notNull().unique(),
  sequence: integer("sequence").notNull().default(0),
});

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  roleId: integer("role_id").references(() => roles.id),
  departmentId: integer("department_id").references(() => departments.id),
  status: text("status").notNull().default("Active"),
  createdAt: createdAt(),
});

export const customers = sqliteTable("customers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  contact: text("contact"),
  email: text("email"),
  createdAt: createdAt(),
});

export const suppliers = sqliteTable("suppliers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  contact: text("contact"),
  category: text("category"),
  createdAt: createdAt(),
});

export const designs = sqliteTable("designs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  designNo: text("design_no").notNull(),
  designName: text("design_name").notNull(),
  customerId: integer("customer_id").references(() => customers.id),
  brand: text("brand"), category: text("category"), season: text("season"),
  fabrication: text("fabrication").notNull(), fabricName: text("fabric_name"),
  fabricComposition: text("fabric_composition"), gsm: real("gsm"), color: text("color"),
  sizeRange: text("size_range"), sampleQuantity: integer("sample_quantity").default(0),
  orderQuantity: integer("order_quantity").notNull(), productionQuantity: integer("production_quantity").notNull(),
  orderDate: text("order_date"), startDate: text("start_date"), dueDate: text("due_date"),
  priority: text("priority").notNull().default("Medium"), factory: text("factory"),
  remarks: text("remarks"), imageUrl: text("image_url"), techPackUrl: text("tech_pack_url"),
  status: text("status").notNull().default("Draft"), workflow: text("workflow").notNull(),
  createdBy: integer("created_by").references(() => users.id),
  updatedBy: integer("updated_by").references(() => users.id),
  createdAt: createdAt(), updatedAt: updatedAt(),
}, (table) => [uniqueIndex("idx_designs_design_no").on(table.designNo)]);

export const orders = sqliteTable("orders", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  orderNo: text("order_no").notNull().unique(), designId: integer("design_id").notNull().references(() => designs.id),
  customerId: integer("customer_id").references(() => customers.id), quantity: integer("quantity").notNull(), status: text("status").notNull(), createdAt: createdAt(),
});

export const productionOrders = sqliteTable("production_orders", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  designId: integer("design_id").notNull().references(() => designs.id),
  currentDepartmentId: integer("current_department_id").references(() => departments.id),
  currentDepartment: text("current_department").notNull(), orderQty: integer("order_qty").notNull(),
  completedQty: integer("completed_qty").notNull().default(0), pendingQty: integer("pending_qty").notNull(),
  progress: integer("progress").notNull().default(0), status: text("status").notNull(),
  assignedEmployee: text("assigned_employee"), supervisor: text("supervisor"),
  delayDays: integer("delay_days").notNull().default(0), updatedAt: updatedAt(),
});

export const fabricInventory = sqliteTable("fabric_inventory", {
  id: integer("id").primaryKey({ autoIncrement: true }), designId: integer("design_id").references(() => designs.id),
  fabricCode: text("fabric_code").notNull(), fabrication: text("fabrication").notNull(), fabricName: text("fabric_name"),
  composition: text("composition"), gsm: real("gsm"), requiredFabric: real("required_fabric").notNull().default(0),
  availableFabric: real("available_fabric").notNull().default(0), issuedFabric: real("issued_fabric").notNull().default(0),
  balanceFabric: real("balance_fabric").notNull().default(0), supplierId: integer("supplier_id").references(() => suppliers.id),
  lotNo: text("lot_no"), rollNo: text("roll_no"), shade: text("shade"), receivedDate: text("received_date"),
  issuedDate: text("issued_date"), issuedTo: text("issued_to"), remarks: text("remarks"), updatedAt: updatedAt(),
});

export const inventoryItems = sqliteTable("inventory_items", {
  id: integer("id").primaryKey({ autoIncrement: true }), itemCode: text("item_code").notNull().unique(),
  itemName: text("item_name").notNull(), category: text("category").notNull(), unit: text("unit").notNull(),
  openingStock: real("opening_stock").notNull().default(0), received: real("received").notNull().default(0),
  issued: real("issued").notNull().default(0), currentStock: real("current_stock").notNull().default(0),
  minimumStock: real("minimum_stock").notNull().default(0), supplier: text("supplier"), location: text("location"), remarks: text("remarks"), updatedAt: updatedAt(),
});

const makeProductionTable = (name: string) => sqliteTable(name, {
  id: integer("id").primaryKey({ autoIncrement: true }), designId: integer("design_id").notNull().references(() => designs.id),
  productionOrderId: integer("production_order_id").references(() => productionOrders.id), departmentId: integer("department_id").references(() => departments.id),
  userId: integer("user_id").references(() => users.id), receivedQty: integer("received_qty").notNull().default(0),
  targetQty: integer("target_qty").notNull().default(0), completedQty: integer("completed_qty").notNull().default(0),
  passedQty: integer("passed_qty").notNull().default(0), rejectedQty: integer("rejected_qty").notNull().default(0),
  reworkQty: integer("rework_qty").notNull().default(0), pendingQty: integer("pending_qty").notNull().default(0),
  startDate: text("start_date"), completionDate: text("completion_date"), supervisor: text("supervisor"), operator: text("operator"),
  status: text("status").notNull().default("Pending"), remarks: text("remarks"), details: text("details").notNull().default("{}"), createdAt: createdAt(), updatedAt: updatedAt(),
});

export const cuttingRecords = makeProductionTable("cutting_records");
export const embroideryRecords = makeProductionTable("embroidery_records");
export const printingRecords = makeProductionTable("printing_records");
export const stitchingRecords = makeProductionTable("stitching_records");
export const finishingRecords = makeProductionTable("finishing_records");
export const qcRecords = makeProductionTable("qc_records");
export const packingRecords = makeProductionTable("packing_records");
export const dispatchRecords = makeProductionTable("dispatch_records");

export const departmentTransfers = sqliteTable("department_transfers", {
  id: integer("id").primaryKey({ autoIncrement: true }), designId: integer("design_id").notNull().references(() => designs.id),
  productionOrderId: integer("production_order_id").references(() => productionOrders.id), fromDepartmentId: integer("from_department_id").references(() => departments.id),
  toDepartmentId: integer("to_department_id").references(() => departments.id), quantity: integer("quantity").notNull(),
  status: text("status").notNull().default("Completed"), transferredBy: integer("transferred_by").references(() => users.id),
  remarks: text("remarks"), transferredAt: createdAt(),
});

export const employees = sqliteTable("employees", {
  id: integer("id").primaryKey({ autoIncrement: true }), employeeId: text("employee_id").notNull().unique(),
  name: text("name").notNull(), cnic: text("cnic"), phone: text("phone"), departmentId: integer("department_id").references(() => departments.id),
  department: text("department").notNull(), designation: text("designation").notNull(), joiningDate: text("joining_date"),
  salary: real("salary").default(0), shift: text("shift"), status: text("status").notNull().default("Active"), photoUrl: text("photo_url"), emergencyContact: text("emergency_contact"), createdAt: createdAt(),
});

export const attendance = sqliteTable("attendance", {
  id: integer("id").primaryKey({ autoIncrement: true }), employeeId: integer("employee_id").notNull().references(() => employees.id),
  date: text("date").notNull(), checkIn: text("check_in"), checkOut: text("check_out"), workingHours: real("working_hours"),
  overtime: real("overtime").default(0), status: text("status").notNull(), createdAt: createdAt(),
});

export const purchases = sqliteTable("purchases", {
  id: integer("id").primaryKey({ autoIncrement: true }), prNo: text("pr_no").notNull().unique(), departmentId: integer("department_id").references(() => departments.id),
  requestedItem: text("requested_item").notNull(), quantity: real("quantity").notNull(), requiredDate: text("required_date"),
  requestedBy: integer("requested_by").references(() => users.id), approvalStatus: text("approval_status").notNull().default("Pending"), createdAt: createdAt(),
});

export const purchaseOrders = sqliteTable("purchase_orders", {
  id: integer("id").primaryKey({ autoIncrement: true }), poNo: text("po_no").notNull().unique(), supplierId: integer("supplier_id").references(() => suppliers.id),
  item: text("item").notNull(), quantity: real("quantity").notNull(), rate: real("rate").notNull(), total: real("total").notNull(), tax: real("tax").default(0),
  deliveryDate: text("delivery_date"), paymentTerms: text("payment_terms"), status: text("status").notNull(), createdAt: createdAt(),
});

export const expenses = sqliteTable("expenses", {
  id: integer("id").primaryKey({ autoIncrement: true }), voucherNo: text("voucher_no").notNull().unique(), voucherType: text("voucher_type").notNull(),
  description: text("description").notNull(), amount: real("amount").notNull(), party: text("party"), date: text("date").notNull(),
  createdBy: integer("created_by").references(() => users.id), createdAt: createdAt(),
});

export const notifications = sqliteTable("notifications", {
  id: integer("id").primaryKey({ autoIncrement: true }), userId: integer("user_id").references(() => users.id), designId: integer("design_id").references(() => designs.id),
  type: text("type").notNull(), title: text("title").notNull(), message: text("message").notNull(), isRead: integer("is_read", { mode: "boolean" }).notNull().default(false), createdAt: createdAt(),
});

export const attachments = sqliteTable("attachments", {
  id: integer("id").primaryKey({ autoIncrement: true }), designId: integer("design_id").references(() => designs.id),
  fileName: text("file_name").notNull(), objectKey: text("object_key").notNull().unique(), contentType: text("content_type"), size: integer("size"),
  uploadedBy: integer("uploaded_by").references(() => users.id), createdAt: createdAt(),
});

export const auditLogs = sqliteTable("audit_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }), userId: integer("user_id").references(() => users.id),
  designId: integer("design_id").references(() => designs.id), departmentId: integer("department_id").references(() => departments.id),
  action: text("action").notNull(), entity: text("entity").notNull(), entityId: text("entity_id"), oldValue: text("old_value"), newValue: text("new_value"),
  ipAddress: text("ip_address"), device: text("device"), createdAt: createdAt(),
});
