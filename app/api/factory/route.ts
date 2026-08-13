import { getD1, ownerBootstrapPassword } from "@/db/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const now = () => new Date().toISOString();

// Every alert is addressed to the owner/admin inbox so one screen shows what
// each department did, and the banner picks the unread ones up automatically.
const notify = (actor: string, category: string, level: "info" | "success" | "warning" | "critical", title: string, message: string, link: string, timestamp: string) =>
  getD1()
    .prepare("INSERT INTO notifications (user_id,actor_name,audience,category,level,title,message,link,read,created_at,updated_at) VALUES (1,?,'Owner',?,?,?,?,?,0,?,?)")
    .bind(actor, category, level, title, message, link, timestamp, timestamp);

// Department rows 1-8 keep their original ids; "Gatepass" is appended as id 9 so
// existing lot, transfer and audit references never have to be renumbered.
const workflow = [
  "Issue Lot",
  "Embroidery",
  "Cutting",
  "Stitching",
  "Finishing",
  "Packing",
  "Warehouse",
  "Customer Dispatch",
] as const;

// Visible factory route: Packing hands over to Gatepass, Gatepass ships to Warehouse.
const flow = [
  "Issue Lot",
  "Embroidery",
  "Cutting",
  "Stitching",
  "Finishing",
  "Packing",
  "Gatepass",
  "Warehouse",
  "Customer Dispatch",
] as const;

const GATEPASS_DEPARTMENT_ID = 9;
const departmentId = (name: string) => {
  if (name === "Gatepass") return GATEPASS_DEPARTMENT_ID;
  const index = workflow.indexOf(name as typeof workflow[number]);
  return index < 0 ? 1 : index + 1;
};

const tableByDepartment: Record<string, string> = {
  Embroidery: "embroidery_records",
  Cutting: "cutting_records",
  Stitching: "stitching_records",
  Finishing: "finishing_records",
  Packing: "packing_records",
};

const attendanceStatuses = ["Present", "Absent", "Half Day", "Leave", "Overtime", "Holiday"];
const dispatchStatuses = ["Active", "In Transit", "Shipped", "Delivered"];

// Only the owner may manage people, shops and company settings.
const ownerOnlyActions = new Set(["save-user", "delete-user", "save-shop", "delete-shop", "save-settings", "ship-to-shop", "recalculate-period", "delete-lot", "delete-gatepass", "reset-system"]);
// A shop login can only ever touch its own counter.
const shopActions = new Set(["pos-sale", "delete-sale", "save-shop-expense", "delete-shop-expense", "save-shop-attendance", "shop-day-close", "save-shop-inventory", "receive-shop-shipment"]);

const encoder = new TextEncoder();
const toHex = (buffer: ArrayBuffer) => [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
const sha256Hex = async (value: string) => toHex(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
const randomHex = (bytes = 16) => toHex(crypto.getRandomValues(new Uint8Array(bytes)).buffer);

// Passwords are stored salted and hashed, never in the clear.
const hashPassword = async (password: string, salt = randomHex(8)) => `sha256:${salt}:${await sha256Hex(`${salt}:${password}`)}`;
async function passwordMatches(password: string, stored: string) {
  const [scheme, salt, digest] = String(stored).split(":");
  if (scheme !== "sha256" || !salt || !digest) return false;
  return (await sha256Hex(`${salt}:${password}`)) === digest;
}

async function sessionSecret() {
  const db = getD1();
  const row = await db.prepare("SELECT session_secret FROM system_settings WHERE id=1").first<{ session_secret: string }>();
  if (row?.session_secret) return row.session_secret;
  const secret = randomHex(32);
  await db.prepare("UPDATE system_settings SET session_secret=? WHERE id=1").bind(secret).run();
  return secret;
}

const b64url = (value: string) => btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64url = (value: string) => atob(value.replace(/-/g, "+").replace(/_/g, "/"));

async function signPayload(payload: string) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(await sessionSecret()), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return toHex(await crypto.subtle.sign("HMAC", key, encoder.encode(payload)));
}

type Session = { userId: number; role: string; shopId: number; exp: number };

async function createSession(user: Record<string, unknown>) {
  const payload = JSON.stringify({ userId: Number(user.id), role: String(user.role), shopId: Number(user.shop_id ?? 0), exp: Date.now() + 12 * 60 * 60 * 1000 } satisfies Session);
  const encoded = b64url(payload);
  return `${encoded}.${await signPayload(encoded)}`;
}

async function readSession(request: Request): Promise<Session | null> {
  const cookie = request.headers.get("cookie") ?? "";
  const token = /(?:^|;\s*)ms_session=([^;]+)/.exec(cookie)?.[1];
  if (!token) return null;
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return null;
  if ((await signPayload(encoded)) !== signature) return null;
  try {
    const session = JSON.parse(unb64url(encoded)) as Session;
    return session.exp > Date.now() ? session : null;
  } catch { return null; }
}

const sessionCookie = (token: string) => `ms_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${12 * 60 * 60}`;
const clearedCookie = "ms_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0";

const publicUser = (row: Record<string, unknown>) => ({
  id: Number(row.id), name: String(row.name), username: String(row.username), email: String(row.email),
  role: String(row.role), shopId: Number(row.shop_id ?? 0), active: Number(row.active) === 1,
  permissions: (() => { try { return JSON.parse(String(row.permissions || "[]")) as string[]; } catch { return []; } })(),
});

const createStatements = [
  `CREATE TABLE IF NOT EXISTS roles (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS departments (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, sequence INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, role_id INTEGER REFERENCES roles(id), department_id INTEGER REFERENCES departments(id), active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS customers (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, contact TEXT NOT NULL DEFAULT '', destination TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS system_settings (id INTEGER PRIMARY KEY, company_name TEXT NOT NULL DEFAULT 'MS Boutique', address TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL DEFAULT '', website TEXT NOT NULL DEFAULT '', logo_url TEXT NOT NULL DEFAULT '', invoice_prefix TEXT NOT NULL DEFAULT 'INV', challan_prefix TEXT NOT NULL DEFAULT 'DC', footer_note TEXT NOT NULL DEFAULT 'Thank you for choosing MS Boutique.', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS designs (id INTEGER PRIMARY KEY AUTOINCREMENT, design_no TEXT NOT NULL UNIQUE, fabrication TEXT NOT NULL, size_range TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS lots (id INTEGER PRIMARY KEY AUTOINCREMENT, lot_no TEXT NOT NULL UNIQUE, design_id INTEGER NOT NULL REFERENCES designs(id), customer_id INTEGER NOT NULL REFERENCES customers(id), fabrication TEXT NOT NULL, quantity INTEGER NOT NULL CHECK(quantity > 0), size_range TEXT NOT NULL, order_date TEXT NOT NULL, required_delivery_date TEXT NOT NULL, priority TEXT NOT NULL DEFAULT 'Normal', current_department TEXT NOT NULL DEFAULT 'Issue Lot', status TEXT NOT NULL DEFAULT 'Lot Issued', completed_qty INTEGER NOT NULL DEFAULT 0, remarks TEXT NOT NULL DEFAULT '', issue_date TEXT NOT NULL, user_id INTEGER REFERENCES users(id), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS lot_size_breakdowns (id INTEGER PRIMARY KEY AUTOINCREMENT, lot_id INTEGER NOT NULL REFERENCES lots(id), colour TEXT NOT NULL DEFAULT 'General', size TEXT NOT NULL, quantity INTEGER NOT NULL CHECK(quantity >= 0), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS embroidery_records (id INTEGER PRIMARY KEY AUTOINCREMENT, lot_id INTEGER NOT NULL UNIQUE REFERENCES lots(id), design_id INTEGER NOT NULL REFERENCES designs(id), department_id INTEGER NOT NULL REFERENCES departments(id), user_id INTEGER REFERENCES users(id), received_qty INTEGER NOT NULL DEFAULT 0, completed_qty INTEGER NOT NULL DEFAULT 0, rejected_qty INTEGER NOT NULL DEFAULT 0, rework_qty INTEGER NOT NULL DEFAULT 0, transferred_qty INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'Waiting', remarks TEXT NOT NULL DEFAULT '', start_date TEXT, completion_date TEXT, embroidery_type TEXT NOT NULL DEFAULT 'Multi-head', pattern_no TEXT NOT NULL DEFAULT '', machine_no TEXT NOT NULL DEFAULT '', operator TEXT NOT NULL DEFAULT '', supervisor TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS cutting_records (id INTEGER PRIMARY KEY AUTOINCREMENT, lot_id INTEGER NOT NULL UNIQUE REFERENCES lots(id), design_id INTEGER NOT NULL REFERENCES designs(id), department_id INTEGER NOT NULL REFERENCES departments(id), user_id INTEGER REFERENCES users(id), received_qty INTEGER NOT NULL DEFAULT 0, completed_qty INTEGER NOT NULL DEFAULT 0, rejected_qty INTEGER NOT NULL DEFAULT 0, rework_qty INTEGER NOT NULL DEFAULT 0, transferred_qty INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'Waiting', remarks TEXT NOT NULL DEFAULT '', start_date TEXT, completion_date TEXT, target_qty INTEGER NOT NULL DEFAULT 0, cutting_qty INTEGER NOT NULL DEFAULT 0, passed_qty INTEGER NOT NULL DEFAULT 0, layer_no TEXT NOT NULL DEFAULT '', marker_no TEXT NOT NULL DEFAULT '', cutting_table TEXT NOT NULL DEFAULT '', operator TEXT NOT NULL DEFAULT '', supervisor TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS stitching_records (id INTEGER PRIMARY KEY AUTOINCREMENT, lot_id INTEGER NOT NULL UNIQUE REFERENCES lots(id), design_id INTEGER NOT NULL REFERENCES designs(id), department_id INTEGER NOT NULL REFERENCES departments(id), user_id INTEGER REFERENCES users(id), received_qty INTEGER NOT NULL DEFAULT 0, completed_qty INTEGER NOT NULL DEFAULT 0, rejected_qty INTEGER NOT NULL DEFAULT 0, rework_qty INTEGER NOT NULL DEFAULT 0, transferred_qty INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'Waiting', remarks TEXT NOT NULL DEFAULT '', start_date TEXT, completion_date TEXT, production_line TEXT NOT NULL DEFAULT '', supervisor TEXT NOT NULL DEFAULT '', target_qty INTEGER NOT NULL DEFAULT 0, today_production INTEGER NOT NULL DEFAULT 0, efficiency REAL NOT NULL DEFAULT 0, expected_completion_date TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS finishing_records (id INTEGER PRIMARY KEY AUTOINCREMENT, lot_id INTEGER NOT NULL UNIQUE REFERENCES lots(id), design_id INTEGER NOT NULL REFERENCES designs(id), department_id INTEGER NOT NULL REFERENCES departments(id), user_id INTEGER REFERENCES users(id), received_qty INTEGER NOT NULL DEFAULT 0, completed_qty INTEGER NOT NULL DEFAULT 0, rejected_qty INTEGER NOT NULL DEFAULT 0, rework_qty INTEGER NOT NULL DEFAULT 0, transferred_qty INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'Waiting', remarks TEXT NOT NULL DEFAULT '', start_date TEXT, completion_date TEXT, process TEXT NOT NULL DEFAULT 'General Quality Check', checked_qty INTEGER NOT NULL DEFAULT 0, passed_qty INTEGER NOT NULL DEFAULT 0, supervisor TEXT NOT NULL DEFAULT '', received_date TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS packing_records (id INTEGER PRIMARY KEY AUTOINCREMENT, lot_id INTEGER NOT NULL UNIQUE REFERENCES lots(id), design_id INTEGER NOT NULL REFERENCES designs(id), department_id INTEGER NOT NULL REFERENCES departments(id), user_id INTEGER REFERENCES users(id), received_qty INTEGER NOT NULL DEFAULT 0, completed_qty INTEGER NOT NULL DEFAULT 0, rejected_qty INTEGER NOT NULL DEFAULT 0, rework_qty INTEGER NOT NULL DEFAULT 0, transferred_qty INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'Waiting', remarks TEXT NOT NULL DEFAULT '', start_date TEXT, completion_date TEXT, packing_qty INTEGER NOT NULL DEFAULT 0, pieces_per_carton INTEGER NOT NULL DEFAULT 20, total_cartons INTEGER NOT NULL DEFAULT 0, barcode_status TEXT NOT NULL DEFAULT 'Pending', tag_status TEXT NOT NULL DEFAULT 'Pending', polybag_status TEXT NOT NULL DEFAULT 'Pending', carton_status TEXT NOT NULL DEFAULT 'Pending', supervisor TEXT NOT NULL DEFAULT '', packing_date TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS gatepasses (id INTEGER PRIMARY KEY AUTOINCREMENT, gatepass_no TEXT NOT NULL UNIQUE, lot_id INTEGER NOT NULL REFERENCES lots(id), design_id INTEGER NOT NULL REFERENCES designs(id), user_id INTEGER REFERENCES users(id), quantity INTEGER NOT NULL CHECK(quantity > 0), cartons INTEGER NOT NULL DEFAULT 0, from_department TEXT NOT NULL DEFAULT 'Packing', to_department TEXT NOT NULL DEFAULT 'Warehouse', purpose TEXT NOT NULL DEFAULT 'Warehouse Shipment', vehicle_no TEXT NOT NULL DEFAULT '', driver_name TEXT NOT NULL DEFAULT '', driver_contact TEXT NOT NULL DEFAULT '', issued_by TEXT NOT NULL DEFAULT '', approved_by TEXT NOT NULL DEFAULT '', security_check TEXT NOT NULL DEFAULT 'Pending', gatepass_date TEXT NOT NULL, release_date TEXT, status TEXT NOT NULL DEFAULT 'Pending', remarks TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS warehouse_receipts (id INTEGER PRIMARY KEY AUTOINCREMENT, receipt_no TEXT NOT NULL UNIQUE, lot_id INTEGER NOT NULL REFERENCES lots(id), design_id INTEGER NOT NULL REFERENCES designs(id), department_id INTEGER NOT NULL REFERENCES departments(id), gatepass_id INTEGER REFERENCES gatepasses(id), user_id INTEGER REFERENCES users(id), received_qty INTEGER NOT NULL, receivable_qty INTEGER NOT NULL DEFAULT 0, non_receivable_qty INTEGER NOT NULL DEFAULT 0, non_receivable_reason TEXT NOT NULL DEFAULT '', cartons INTEGER NOT NULL DEFAULT 0, location TEXT NOT NULL DEFAULT 'Finished Goods', rack_no TEXT NOT NULL DEFAULT '', received_by TEXT NOT NULL DEFAULT '', received_date TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'Received', remarks TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS warehouse_inventory (id INTEGER PRIMARY KEY AUTOINCREMENT, lot_id INTEGER NOT NULL UNIQUE REFERENCES lots(id), design_id INTEGER NOT NULL REFERENCES designs(id), available_qty INTEGER NOT NULL DEFAULT 0, reserved_qty INTEGER NOT NULL DEFAULT 0, dispatched_qty INTEGER NOT NULL DEFAULT 0, non_receivable_qty INTEGER NOT NULL DEFAULT 0, dispatch_status TEXT NOT NULL DEFAULT 'Active', status TEXT NOT NULL DEFAULT 'In Stock', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS employees (id INTEGER PRIMARY KEY AUTOINCREMENT, employee_code TEXT NOT NULL UNIQUE, name TEXT NOT NULL, father_name TEXT NOT NULL DEFAULT '', cnic TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL DEFAULT '', address TEXT NOT NULL DEFAULT '', department TEXT NOT NULL DEFAULT 'Stitching', designation TEXT NOT NULL DEFAULT 'Operator', joining_date TEXT NOT NULL, salary_type TEXT NOT NULL DEFAULT 'Monthly', monthly_salary REAL NOT NULL DEFAULT 0, rate_per_piece REAL NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'Active', remarks TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS attendance_records (id INTEGER PRIMARY KEY AUTOINCREMENT, employee_id INTEGER NOT NULL REFERENCES employees(id), attendance_date TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'Present', in_time TEXT NOT NULL DEFAULT '', out_time TEXT NOT NULL DEFAULT '', overtime_hours REAL NOT NULL DEFAULT 0, pieces_done INTEGER NOT NULL DEFAULT 0, lot_no TEXT NOT NULL DEFAULT '', remarks TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS piece_work_entries (id INTEGER PRIMARY KEY AUTOINCREMENT, employee_id INTEGER NOT NULL REFERENCES employees(id), period TEXT NOT NULL, item TEXT NOT NULL, lot_no TEXT NOT NULL DEFAULT '', work_from TEXT NOT NULL, work_to TEXT NOT NULL, pcs_qty INTEGER NOT NULL DEFAULT 0, rate_per_piece REAL NOT NULL DEFAULT 0, total_amount REAL NOT NULL DEFAULT 0, remarks TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS salary_advances (id INTEGER PRIMARY KEY AUTOINCREMENT, employee_id INTEGER NOT NULL REFERENCES employees(id), period TEXT NOT NULL, advance_date TEXT NOT NULL, amount REAL NOT NULL DEFAULT 0, remarks TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS salary_records (id INTEGER PRIMARY KEY AUTOINCREMENT, employee_id INTEGER NOT NULL REFERENCES employees(id), period TEXT NOT NULL, salary_type TEXT NOT NULL DEFAULT 'Monthly', present_days INTEGER NOT NULL DEFAULT 0, absent_days INTEGER NOT NULL DEFAULT 0, total_pieces INTEGER NOT NULL DEFAULT 0, rate_per_piece REAL NOT NULL DEFAULT 0, base_amount REAL NOT NULL DEFAULT 0, overtime_amount REAL NOT NULL DEFAULT 0, bonus REAL NOT NULL DEFAULT 0, advance REAL NOT NULL DEFAULT 0, deduction REAL NOT NULL DEFAULT 0, net_payable REAL NOT NULL DEFAULT 0, payment_status TEXT NOT NULL DEFAULT 'Unpaid', paid_date TEXT, remarks TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS customer_dispatches (id INTEGER PRIMARY KEY AUTOINCREMENT, dispatch_no TEXT NOT NULL UNIQUE, lot_id INTEGER NOT NULL REFERENCES lots(id), design_id INTEGER NOT NULL REFERENCES designs(id), department_id INTEGER NOT NULL REFERENCES departments(id), user_id INTEGER REFERENCES users(id), customer_id INTEGER NOT NULL REFERENCES customers(id), dispatch_qty INTEGER NOT NULL, carton_qty INTEGER NOT NULL DEFAULT 0, invoice_no TEXT NOT NULL, challan_no TEXT NOT NULL, transporter TEXT NOT NULL DEFAULT '', vehicle_no TEXT NOT NULL DEFAULT '', driver_name TEXT NOT NULL DEFAULT '', driver_contact TEXT NOT NULL DEFAULT '', dispatch_date TEXT NOT NULL, destination TEXT NOT NULL DEFAULT '', tracking_no TEXT NOT NULL DEFAULT '', dispatch_status TEXT NOT NULL DEFAULT 'Dispatched', delivery_status TEXT NOT NULL DEFAULT 'In Transit', remarks TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS department_transfers (id INTEGER PRIMARY KEY AUTOINCREMENT, lot_id INTEGER NOT NULL REFERENCES lots(id), design_id INTEGER NOT NULL REFERENCES designs(id), from_department_id INTEGER NOT NULL REFERENCES departments(id), to_department_id INTEGER NOT NULL REFERENCES departments(id), user_id INTEGER REFERENCES users(id), quantity INTEGER NOT NULL CHECK(quantity > 0), remarks TEXT NOT NULL DEFAULT '', transfer_date TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS lot_remarks (id INTEGER PRIMARY KEY AUTOINCREMENT, lot_id INTEGER NOT NULL REFERENCES lots(id), user_id INTEGER REFERENCES users(id), department_id INTEGER REFERENCES departments(id), remark TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS lot_history (id INTEGER PRIMARY KEY AUTOINCREMENT, lot_id INTEGER NOT NULL REFERENCES lots(id), user_id INTEGER REFERENCES users(id), department_id INTEGER REFERENCES departments(id), action TEXT NOT NULL, quantity INTEGER NOT NULL DEFAULT 0, remarks TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS notifications (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER REFERENCES users(id), actor_name TEXT NOT NULL DEFAULT 'System', audience TEXT NOT NULL DEFAULT 'Owner', category TEXT NOT NULL DEFAULT 'Production', level TEXT NOT NULL DEFAULT 'info', title TEXT NOT NULL, message TEXT NOT NULL, link TEXT NOT NULL DEFAULT '', read INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS audit_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER REFERENCES users(id), department_id INTEGER REFERENCES departments(id), lot_id INTEGER REFERENCES lots(id), design_id INTEGER REFERENCES designs(id), action TEXT NOT NULL, previous_value TEXT NOT NULL DEFAULT '', new_value TEXT NOT NULL DEFAULT '', quantity INTEGER NOT NULL DEFAULT 0, remarks TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS suppliers (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, contact TEXT NOT NULL DEFAULT '', address TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS purchases (id INTEGER PRIMARY KEY AUTOINCREMENT, purchase_no TEXT NOT NULL UNIQUE, supplier_id INTEGER NOT NULL REFERENCES suppliers(id), purchase_date TEXT NOT NULL, item TEXT NOT NULL, category TEXT NOT NULL DEFAULT 'Fabric', quantity REAL NOT NULL DEFAULT 0, unit TEXT NOT NULL DEFAULT 'Meters', rate REAL NOT NULL DEFAULT 0, total_amount REAL NOT NULL DEFAULT 0, paid_amount REAL NOT NULL DEFAULT 0, balance_amount REAL NOT NULL DEFAULT 0, payment_method TEXT NOT NULL DEFAULT 'Cash', status TEXT NOT NULL DEFAULT 'Ordered', invoice_no TEXT NOT NULL DEFAULT '', received_date TEXT, remarks TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS shops (id INTEGER PRIMARY KEY AUTOINCREMENT, shop_code TEXT NOT NULL UNIQUE, name TEXT NOT NULL, address TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL DEFAULT '', manager TEXT NOT NULL DEFAULT '', logo_url TEXT NOT NULL DEFAULT '', invoice_prefix TEXT NOT NULL DEFAULT 'INV', footer_note TEXT NOT NULL DEFAULT 'Thank you for shopping with us.', opening_cash REAL NOT NULL DEFAULT 0, opening_date TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'Active', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS shop_shipments (id INTEGER PRIMARY KEY AUTOINCREMENT, shipment_no TEXT NOT NULL UNIQUE, shop_id INTEGER NOT NULL REFERENCES shops(id), lot_id INTEGER NOT NULL REFERENCES lots(id), design_id INTEGER NOT NULL REFERENCES designs(id), product_name TEXT NOT NULL DEFAULT '', quantity INTEGER NOT NULL CHECK(quantity > 0), receivable_qty INTEGER NOT NULL DEFAULT 0, non_receivable_qty INTEGER NOT NULL DEFAULT 0, non_receivable_reason TEXT NOT NULL DEFAULT '', sale_rate REAL NOT NULL DEFAULT 0, cartons INTEGER NOT NULL DEFAULT 0, sent_date TEXT NOT NULL, received_date TEXT, received_by TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'In Transit', remarks TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS shop_inventory (id INTEGER PRIMARY KEY AUTOINCREMENT, shop_id INTEGER NOT NULL REFERENCES shops(id), lot_id INTEGER REFERENCES lots(id), design_id INTEGER REFERENCES designs(id), product_name TEXT NOT NULL, sku TEXT NOT NULL DEFAULT '', received_qty INTEGER NOT NULL DEFAULT 0, sold_qty INTEGER NOT NULL DEFAULT 0, non_receivable_qty INTEGER NOT NULL DEFAULT 0, sale_rate REAL NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'In Stock', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS shop_sales (id INTEGER PRIMARY KEY AUTOINCREMENT, invoice_no TEXT NOT NULL UNIQUE, shop_id INTEGER NOT NULL REFERENCES shops(id), customer_name TEXT NOT NULL, customer_phone TEXT NOT NULL, sale_date TEXT NOT NULL, subtotal REAL NOT NULL DEFAULT 0, discount REAL NOT NULL DEFAULT 0, total_amount REAL NOT NULL DEFAULT 0, received_amount REAL NOT NULL DEFAULT 0, change_amount REAL NOT NULL DEFAULT 0, balance_amount REAL NOT NULL DEFAULT 0, payment_method TEXT NOT NULL DEFAULT 'Cash', sold_by TEXT NOT NULL DEFAULT '', remarks TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS shop_sale_items (id INTEGER PRIMARY KEY AUTOINCREMENT, sale_id INTEGER NOT NULL REFERENCES shop_sales(id), shop_id INTEGER NOT NULL REFERENCES shops(id), inventory_id INTEGER REFERENCES shop_inventory(id), product_name TEXT NOT NULL, quantity INTEGER NOT NULL DEFAULT 0, rate REAL NOT NULL DEFAULT 0, amount REAL NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS shop_expenses (id INTEGER PRIMARY KEY AUTOINCREMENT, shop_id INTEGER NOT NULL REFERENCES shops(id), expense_date TEXT NOT NULL, category TEXT NOT NULL DEFAULT 'General', description TEXT NOT NULL DEFAULT '', amount REAL NOT NULL DEFAULT 0, paid_by TEXT NOT NULL DEFAULT '', payment_method TEXT NOT NULL DEFAULT 'Cash', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS shop_attendance (id INTEGER PRIMARY KEY AUTOINCREMENT, shop_id INTEGER NOT NULL REFERENCES shops(id), staff_name TEXT NOT NULL, attendance_date TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'Present', in_time TEXT NOT NULL DEFAULT '', out_time TEXT NOT NULL DEFAULT '', remarks TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS shop_day_close (id INTEGER PRIMARY KEY AUTOINCREMENT, shop_id INTEGER NOT NULL REFERENCES shops(id), close_date TEXT NOT NULL, opening_cash REAL NOT NULL DEFAULT 0, cash_sales REAL NOT NULL DEFAULT 0, bank_sales REAL NOT NULL DEFAULT 0, total_sales REAL NOT NULL DEFAULT 0, expenses REAL NOT NULL DEFAULT 0, expected_cash REAL NOT NULL DEFAULT 0, counted_cash REAL NOT NULL DEFAULT 0, difference REAL NOT NULL DEFAULT 0, invoices INTEGER NOT NULL DEFAULT 0, closed_by TEXT NOT NULL DEFAULT '', remarks TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE INDEX IF NOT EXISTS idx_purchases_status ON purchases(status)`,
  `CREATE INDEX IF NOT EXISTS idx_shop_shipments_shop ON shop_shipments(shop_id, status)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_shop_inventory_unique ON shop_inventory(shop_id, sku)`,
  `CREATE INDEX IF NOT EXISTS idx_shop_sales_shop_date ON shop_sales(shop_id, sale_date)`,
  `CREATE INDEX IF NOT EXISTS idx_shop_sale_items_sale ON shop_sale_items(sale_id)`,
  `CREATE INDEX IF NOT EXISTS idx_shop_expenses_shop_date ON shop_expenses(shop_id, expense_date)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_shop_attendance_unique ON shop_attendance(shop_id, staff_name, attendance_date)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_shop_day_close_unique ON shop_day_close(shop_id, close_date)`,
  `CREATE INDEX IF NOT EXISTS idx_lots_department_status ON lots(current_department, status)`,
  `CREATE INDEX IF NOT EXISTS idx_lots_design_id ON lots(design_id)`,
  `CREATE INDEX IF NOT EXISTS idx_transfers_lot_id ON department_transfers(lot_id)`,
  `CREATE INDEX IF NOT EXISTS idx_history_lot_id ON lot_history(lot_id)`,
  `CREATE INDEX IF NOT EXISTS idx_audit_lot_id ON audit_logs(lot_id)`,
  `CREATE INDEX IF NOT EXISTS idx_gatepass_lot_id ON gatepasses(lot_id)`,
  `CREATE INDEX IF NOT EXISTS idx_employees_department ON employees(department)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_attendance_employee_date ON attendance_records(employee_id, attendance_date)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_salary_employee_period ON salary_records(employee_id, period)`,
  `CREATE INDEX IF NOT EXISTS idx_piece_work_employee_period ON piece_work_entries(employee_id, period)`,
  `CREATE INDEX IF NOT EXISTS idx_advance_employee_period ON salary_advances(employee_id, period)`,
  `CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read)`,
];

// Columns added after the first release. Databases created by an earlier build
// already have the tables, so the columns are patched in one by one.
const addedColumns: Array<[string, string, string]> = [
  ["users", "username", "TEXT NOT NULL DEFAULT ''"],
  ["users", "role", "TEXT NOT NULL DEFAULT 'Staff'"],
  ["users", "shop_id", "INTEGER"],
  ["users", "permissions", "TEXT NOT NULL DEFAULT '[]'"],
  ["system_settings", "session_secret", "TEXT NOT NULL DEFAULT ''"],
  ["system_settings", "seeded", "INTEGER NOT NULL DEFAULT 0"],
  ["warehouse_receipts", "gatepass_id", "INTEGER"],
  ["warehouse_receipts", "receivable_qty", "INTEGER NOT NULL DEFAULT 0"],
  ["warehouse_receipts", "non_receivable_qty", "INTEGER NOT NULL DEFAULT 0"],
  ["warehouse_receipts", "non_receivable_reason", "TEXT NOT NULL DEFAULT ''"],
  ["warehouse_inventory", "non_receivable_qty", "INTEGER NOT NULL DEFAULT 0"],
  ["warehouse_inventory", "dispatch_status", "TEXT NOT NULL DEFAULT 'Active'"],
  ["notifications", "actor_name", "TEXT NOT NULL DEFAULT 'System'"],
  ["notifications", "audience", "TEXT NOT NULL DEFAULT 'Owner'"],
  ["notifications", "category", "TEXT NOT NULL DEFAULT 'Production'"],
  ["notifications", "level", "TEXT NOT NULL DEFAULT 'info'"],
  ["notifications", "link", "TEXT NOT NULL DEFAULT ''"],
  ["lot_size_breakdowns", "colour", "TEXT NOT NULL DEFAULT 'General'"],
];

async function migrateColumns() {
  const db = getD1();
  const tables = [...new Set(addedColumns.map(([table]) => table))];
  const existing = new Map<string, Set<string>>();
  await Promise.all(tables.map(async (table) => {
    const info = await db.prepare(`PRAGMA table_info(${table})`).all<{ name: string }>();
    existing.set(table, new Set(info.results.map((column) => column.name)));
  }));
  const missing = addedColumns.filter(([table, column]) => !existing.get(table)?.has(column));
  for (const [table, column, definition] of missing) {
    await db.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`).run();
  }
  if (missing.some(([table, column]) => table === "warehouse_receipts" && column === "receivable_qty")) {
    await db.prepare("UPDATE warehouse_receipts SET receivable_qty=received_qty WHERE status<>'Expected' AND receivable_qty=0").run();
  }
}

// Sample data is offered once. After the owner clears the system this flag stays
// set, so an empty table is never mistaken for a fresh install to re-seed.
async function sampleDataSettled() {
  const row = await getD1().prepare("SELECT seeded FROM system_settings WHERE id=1").first<{ seeded: number }>();
  return Number(row?.seeded ?? 0) === 1;
}
const markSampleDataSettled = () => getD1().prepare("UPDATE system_settings SET seeded=1 WHERE id=1").run();

// The team directory seeds on its own so databases created before Administration
// existed still come up with a usable roster, attendance and payroll history.
async function seedTeam() {
  const db = getD1();
  if (await sampleDataSettled()) return;
  const count = await db.prepare("SELECT COUNT(*) AS count FROM employees").first<{ count: number }>();
  if ((count?.count ?? 0) > 0) return;
  await db.batch([
    db.prepare("INSERT INTO employees (employee_code,name,father_name,cnic,phone,address,department,designation,joining_date,salary_type,monthly_salary,rate_per_piece,status,remarks) VALUES ('EMP-001','Ali Raza','Muhammad Raza','35202-1122334-1','+92 300 411 0011','Township, Lahore','Embroidery','Manager','2023-02-14','Monthly',95000,0,'Active','Heads the embroidery floor.'),('EMP-002','Kashif Iqbal','Iqbal Hussain','35202-2233445-3','+92 301 522 0022','Johar Town, Lahore','Cutting','Supervisor','2023-06-01','Monthly',62000,0,'Active',''),('EMP-003','Sana Noor','Noor Ahmed','35202-3344556-8','+92 302 633 0033','Model Town, Lahore','Stitching','Line Manager','2024-01-09','Monthly',58000,0,'Active',''),('EMP-004','Mehwish Ali','Ali Akbar','35202-4455667-2','+92 303 744 0044','Gulberg, Lahore','Finishing','Supervisor','2024-03-18','Monthly',54000,0,'Active',''),('EMP-005','Faiza Khan','Khan Bahadur','35202-5566778-6','+92 304 855 0055','Faisal Town, Lahore','Packing','Manager','2022-11-05','Monthly',66000,0,'Active',''),('EMP-006','Usman Shah','Shah Nawaz','35202-6677889-4','+92 305 966 0066','Wapda Town, Lahore','Warehouse','Manager','2022-08-22','Monthly',72000,0,'Active',''),('EMP-007','Rafiq Masih','Masih Yaqoob','35202-7788990-9','+92 306 177 0077','Shahdara, Lahore','Stitching','Stitching Operator','2025-02-03','Theka',0,0,'Active','Piece-rate stitching operator.'),('EMP-008','Arslan Tariq','Tariq Mehmood','35202-8899001-5','+92 307 288 0088','Kot Lakhpat, Lahore','Cutting','Cutting Operator','2025-04-15','Theka',0,0,'Active','Piece-rate cutting operator.'),('EMP-009','Hina Bibi','Ghulam Nabi','35202-9900112-0','+92 308 399 0099','Green Town, Lahore','Finishing','Thread Cutting','2025-07-01','Theka',0,0,'Active','Piece-rate finishing.')"),
  ]);
  await db.batch([
    db.prepare("INSERT INTO attendance_records (employee_id,attendance_date,status,in_time,out_time,overtime_hours,pieces_done,lot_no,remarks) VALUES (1,'2026-08-07','Present','09:00','18:00',0,0,'',''),(1,'2026-08-08','Present','09:00','18:00',1.5,0,'','Late shift handover'),(2,'2026-08-07','Present','08:30','17:30',0,0,'',''),(2,'2026-08-08','Half Day','08:30','13:00',0,0,'','Family emergency'),(3,'2026-08-07','Present','09:00','18:00',2,0,'',''),(3,'2026-08-08','Present','09:00','18:00',0,0,'',''),(4,'2026-08-08','Leave','','',0,0,'','Annual leave'),(5,'2026-08-08','Present','09:00','19:00',1,0,'',''),(6,'2026-08-08','Present','09:00','18:00',0,0,'',''),(7,'2026-08-07','Present','09:00','18:00',0,240,'LOT-00001','Line 04 stitching'),(7,'2026-08-08','Present','09:00','18:00',0,265,'LOT-00001','Line 04 stitching'),(8,'2026-08-07','Present','08:30','17:30',0,410,'LOT-00003','Marker 3 cutting'),(8,'2026-08-08','Present','08:30','17:30',0,395,'LOT-00003','Marker 3 cutting'),(9,'2026-08-08','Present','09:00','18:00',0,520,'LOT-00004','Thread cutting')"),
    db.prepare("INSERT INTO salary_records (employee_id,period,salary_type,present_days,absent_days,total_pieces,rate_per_piece,base_amount,overtime_amount,bonus,advance,deduction,net_payable,payment_status,paid_date,remarks) VALUES (1,'2026-07','Monthly',31,0,0,0,95000,2500,0,10000,0,87500,'Paid','2026-08-02','July salary released.'),(3,'2026-07','Monthly',30,1,0,0,56129,1800,2000,0,0,59929,'Paid','2026-08-02','One absent day adjusted.'),(7,'2026-07','Theka',26,0,5820,26.5,154230,0,3000,15000,0,142230,'Paid','2026-08-02','Piece-rate July settlement.')"),
  ]);
}

// The owner account is the only login that exists until the owner creates more.
// Any earlier demo credential is upgraded to it rather than left behind.
async function seedOwner() {
  const db = getD1();
  const owner = await db.prepare("SELECT id, username, password_hash FROM users WHERE lower(role)='owner' OR id=1").first<Record<string, unknown>>();
  const hashed = await hashPassword(ownerBootstrapPassword());
  if (!owner) {
    await db.prepare("INSERT INTO users (name,email,username,password_hash,role,role_id,department_id,permissions,active) VALUES ('Owner','owner@msboutique.com','Admin',?,'Owner',1,1,'[]',1)").bind(hashed).run();
    return;
  }
  // Move the seeded demo login onto the real owner credentials exactly once.
  if (String(owner.username) !== "Admin" || !String(owner.password_hash).startsWith("sha256:")) {
    await db.prepare("UPDATE users SET name='Owner',username='Admin',password_hash=?,role='Owner',active=1 WHERE id=?").bind(hashed, owner.id).run();
  }
}

// Purchases and shops seed independently so an existing database picks them up.
async function seedTrade() {
  const db = getD1();
  if (await sampleDataSettled()) return;
  const [supplierCount, shopCount] = await Promise.all([
    db.prepare("SELECT COUNT(*) AS count FROM suppliers").first<{ count: number }>(),
    db.prepare("SELECT COUNT(*) AS count FROM shops").first<{ count: number }>(),
  ]);

  if ((supplierCount?.count ?? 0) === 0) {
    await db.prepare("INSERT INTO suppliers (name,contact,address) VALUES ('Ittehad Textiles','+92 300 777 1010','Faisalabad'),('Gul Ahmed Fabrics','+92 301 888 2020','Karachi'),('Master Trims & Accessories','+92 302 999 3030','Lahore')").run();
    await db.prepare("INSERT INTO purchases (purchase_no,supplier_id,purchase_date,item,category,quantity,unit,rate,total_amount,paid_amount,balance_amount,payment_method,status,invoice_no,received_date,remarks) VALUES ('PUR-00001',1,'2026-07-18','Cotton Lawn greige','Fabric',4200,'Meters',310,1302000,1302000,0,'Bank','Received','ITX-8821','2026-07-21','Full lot received'),('PUR-00002',2,'2026-07-29','Premium Linen','Fabric',2600,'Meters',540,1404000,700000,704000,'Bank','Partially Paid','GA-4417','2026-08-02','Balance due on 20 Aug'),('PUR-00003',3,'2026-08-05','Buttons, labels & polybags','Accessories',18000,'Pieces',12,216000,0,216000,'Cash','Ordered','','',''),('PUR-00004',1,'2026-08-08','Khaddar winter base','Fabric',3100,'Meters',395,1224500,400000,824500,'Bank','In Transit','ITX-8940','','Expected 14 Aug')").run();
  }

  if ((shopCount?.count ?? 0) === 0) {
    await db.prepare("INSERT INTO shops (shop_code,name,address,phone,manager,invoice_prefix,footer_note,opening_cash,opening_date,status) VALUES ('SHOP-01','MS Boutique — Gulberg','Main Boulevard, Gulberg III, Lahore','+92 300 411 5001','Nadia Aslam','GLB','Thank you for shopping at MS Boutique Gulberg.',25000,'2025-03-01','Active'),('SHOP-02','MS Boutique — DHA','Phase 5 Commercial, DHA, Lahore','+92 300 411 5002','Bilal Ahmed','DHA','Thank you for shopping at MS Boutique DHA.',20000,'2025-09-15','Active')").run();
    const shipmentSeed = await db.prepare("SELECT wi.lot_id, wi.design_id, l.lot_no, d.design_no, l.fabrication FROM warehouse_inventory wi JOIN lots l ON l.id=wi.lot_id JOIN designs d ON d.id=wi.design_id ORDER BY wi.id LIMIT 2").all<{ lot_id: number; design_id: number; lot_no: string; design_no: string; fabrication: string }>();
    let index = 1;
    for (const row of shipmentSeed.results) {
      const shopId = index;
      const productName = `${row.design_no} ${row.fabrication}`;
      const quantity = index === 1 ? 600 : 400;
      const receivable = index === 1 ? 592 : 400;
      const rate = index === 1 ? 3450 : 2950;
      await db.batch([
        db.prepare("INSERT INTO shop_shipments (shipment_no,shop_id,lot_id,design_id,product_name,quantity,receivable_qty,non_receivable_qty,non_receivable_reason,sale_rate,cartons,sent_date,received_date,received_by,status,remarks) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,'Received',?)")
          .bind(`SHP-${String(index).padStart(5, "0")}`, shopId, row.lot_id, row.design_id, productName, quantity, receivable, quantity - receivable, quantity - receivable > 0 ? "8 PCS stitching fault returned to factory" : "", rate, Math.ceil(quantity / 20), "2026-08-04", "2026-08-05", index === 1 ? "Nadia Aslam" : "Bilal Ahmed", "Counted and shelved"),
        db.prepare("INSERT INTO shop_inventory (shop_id,lot_id,design_id,product_name,sku,received_qty,sold_qty,non_receivable_qty,sale_rate,status) VALUES (?,?,?,?,?,?,?,?,?,'In Stock')")
          .bind(shopId, row.lot_id, row.design_id, productName, row.design_no, receivable, index === 1 ? 118 : 64, quantity - receivable, rate),
      ]);
      index += 1;
    }
  }
}

// Piece work seeds separately so databases that already have a team still get a
// worked example of the theka register.
async function seedPieceWork() {
  const db = getD1();
  if (await sampleDataSettled()) return;
  const [entries, staff] = await Promise.all([
    db.prepare("SELECT COUNT(*) AS count FROM piece_work_entries").first<{ count: number }>(),
    db.prepare("SELECT id FROM employees WHERE salary_type='Theka' ORDER BY employee_code").all<{ id: number }>(),
  ]);
  if ((entries?.count ?? 0) > 0 || staff.results.length < 3) return;
  const [a, b, c] = staff.results.map((row) => row.id);
  await db.batch([
    db.prepare("UPDATE employees SET rate_per_piece=0 WHERE salary_type='Theka'"),
    db.prepare("INSERT INTO piece_work_entries (employee_id,period,item,lot_no,work_from,work_to,pcs_qty,rate_per_piece,total_amount,remarks) VALUES (?,'2026-08','Shirt stitching','LOT-00001','2026-08-03','2026-08-08',1240,26.5,32860,'Line 04'),(?,'2026-08','Kameez stitching','LOT-00002','2026-08-04','2026-08-09',480,31,14880,'Heavy embroidery panel'),(?,'2026-08','Panel cutting','LOT-00003','2026-08-03','2026-08-08',2150,14,30100,'Marker 3'),(?,'2026-08','Thread cutting','LOT-00004','2026-08-05','2026-08-09',1860,9.75,18135,'Final finishing')").bind(a, a, b, c),
    db.prepare("INSERT INTO salary_advances (employee_id,period,advance_date,amount,remarks) VALUES (?,'2026-08','2026-08-06',8000,'Eid advance'),(?,'2026-08','2026-08-07',5000,'Medical advance')").bind(a, b),
  ]);
  const timestamp = now();
  for (const id of [a, b, c]) await recalculateSalary(id, "2026-08", timestamp);
}

// Initialization runs on every request, and the seeds guard on "is this table
// empty?". Two requests arriving together would both see an empty table and seed
// twice, so the whole setup is memoised and concurrent callers await one run.
let initializing: Promise<void> | null = null;
function ensureDatabase() {
  if (!initializing) initializing = initializeDatabase().catch((error) => { initializing = null; throw error; });
  return initializing;
}

async function initializeDatabase() {
  const db = getD1();
  await db.batch(createStatements.map((statement) => db.prepare(statement)));
  await migrateColumns();
  await seedOwner();
  await seedTeam();
  await seedPieceWork();
  await seedTrade();
  await db.prepare("INSERT OR IGNORE INTO system_settings (id,company_name,address,phone,website,logo_url,invoice_prefix,challan_prefix,footer_note) VALUES (1,'MS Boutique','Industrial Area, Lahore, Pakistan','+92 300 000 0000','www.msboutique.com','','INV','DC','Computer generated gate pass — no signature required for system approval.')").run();
  const count = await db.prepare("SELECT COUNT(*) AS count FROM lots").first<{ count: number }>();
  // The eight workflow departments must own ids 1-8, so Gatepass is only appended
  // once they exist — on an already-seeded database that is immediately.
  if ((count?.count ?? 0) > 0 || await sampleDataSettled()) {
    await db.prepare("INSERT OR IGNORE INTO departments (name,sequence) VALUES ('Issue Lot',1),('Embroidery',2),('Cutting',3),('Stitching',4),('Finishing',5),('Packing',6),('Warehouse',7),('Customer Dispatch',8)").run();
    await db.prepare("INSERT OR IGNORE INTO departments (id,name,sequence) VALUES (?,'Gatepass',7)").bind(GATEPASS_DEPARTMENT_ID).run();
    return;
  }

  const created = "2026-08-09T08:00:00.000Z";
  const seed = [
    db.prepare("INSERT INTO roles (name) VALUES (?), (?), (?), (?), (?), (?), (?), (?), (?), (?), (?)").bind("Super Admin", "Factory Manager", "Issue Lot User", "Embroidery Manager", "Cutting Manager", "Stitching Manager", "Finishing Manager", "Packing Manager", "Warehouse Manager", "Dispatch Manager", "Viewer"),
    db.prepare("INSERT INTO departments (name, sequence) VALUES (?,1),(?,2),(?,3),(?,4),(?,5),(?,6),(?,7),(?,8)").bind(...workflow),
    db.prepare("INSERT INTO users (name,email,password_hash,role_id,department_id) VALUES (?,?,?,?,?)").bind("Ayesha Khan", "admin@msboutique.com", "demo:admin123", 1, 1),
    db.prepare("INSERT INTO customers (name,contact,destination) VALUES (?,?,?),(?,?,?),(?,?,?)").bind("Noor Fashion House", "+92 300 555 0181", "Lahore", "Sapphire Retail", "+92 321 555 0144", "Karachi", "Zarqash Studio", "+92 333 555 0198", "Islamabad"),
    db.prepare("INSERT INTO designs (design_no,fabrication,size_range) VALUES (?,?,?),(?,?,?),(?,?,?),(?,?,?),(?,?,?)").bind("MS-1001", "Cotton Lawn", "S-XL", "MS-1002", "Premium Linen", "S-L", "MS-1003", "Khaddar", "M-XL", "MS-1004", "Silk", "S-XL", "MS-1005", "Cotton", "S-XXL"),
    db.prepare("INSERT INTO lots (lot_no,design_id,customer_id,fabrication,quantity,size_range,order_date,required_delivery_date,priority,current_department,status,completed_qty,remarks,issue_date,user_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?),(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?),(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?),(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?),(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
      .bind(
        "LOT-00001",1,1,"Cotton Lawn",5000,"S-XL","2026-07-20","2026-08-18","High","Stitching","Running",3500,"3,500 PCS completed.","2026-07-20",1,created,created,
        "LOT-00002",2,2,"Premium Linen",3000,"S-L","2026-07-25","2026-08-22","Normal","Embroidery","In Progress",1200,"Embroidery production in progress.","2026-07-25",1,created,created,
        "LOT-00003",3,1,"Khaddar",2500,"M-XL","2026-07-27","2026-08-25","Normal","Cutting","In Progress",1450,"Marker 3 cutting underway.","2026-07-27",1,created,created,
        "LOT-00004",4,3,"Silk",1500,"S-XL","2026-07-12","2026-08-12","Urgent","Packing","In Progress",1100,"Final cartons being packed.","2026-07-12",1,created,created,
        "LOT-00005",5,2,"Cotton",4000,"S-XXL","2026-07-02","2026-08-10","High","Warehouse","Ready for Dispatch",4000,"Ready for customer dispatch.","2026-07-02",1,created,created
      ),
  ];
  await db.batch(seed);

  const detailSeed = [
    db.prepare("INSERT INTO lot_size_breakdowns (lot_id,size,quantity) VALUES (1,'S',800),(1,'M',1500),(1,'L',1500),(1,'XL',1200),(2,'S',700),(2,'M',1200),(2,'L',1100),(3,'M',900),(3,'L',900),(3,'XL',700),(4,'S',250),(4,'M',450),(4,'L',450),(4,'XL',350),(5,'S',500),(5,'M',900),(5,'L',1000),(5,'XL',900),(5,'XXL',700)"),
    db.prepare("INSERT INTO embroidery_records (lot_id,design_id,department_id,user_id,received_qty,completed_qty,rejected_qty,rework_qty,transferred_qty,status,remarks,start_date,embroidery_type,pattern_no,machine_no,operator,supervisor) VALUES (1,1,2,1,5000,5000,40,40,5000,'Completed','Full lot cleared','2026-07-21','Multi-head','EP-221','EMB-04','Rafiq','Ali'),(2,2,2,1,3000,1200,20,30,0,'In Progress','Floral neckline embroidery running','2026-08-08','Sequence','EP-228','EMB-02','Sameer','Ali'),(3,3,2,1,2500,2500,25,20,2500,'Completed','Transferred to cutting','2026-07-29','Multi-head','EP-214','EMB-01','Rafiq','Ali'),(4,4,2,1,1500,1500,10,12,1500,'Completed','Cleared','2026-07-14','Dabka','EP-198','EMB-03','Noman','Ali'),(5,5,2,1,4000,4000,35,25,4000,'Completed','Cleared','2026-07-05','Multi-head','EP-176','EMB-01','Sameer','Ali')"),
    db.prepare("INSERT INTO cutting_records (lot_id,design_id,department_id,user_id,received_qty,completed_qty,rejected_qty,rework_qty,transferred_qty,status,remarks,start_date,target_qty,cutting_qty,passed_qty,layer_no,marker_no,cutting_table,operator,supervisor) VALUES (1,1,3,1,5000,5000,30,0,5000,'Completed','Cut panels bundled','2026-07-25',5000,5000,5000,'L-18','MRK-1001','CT-02','Nasir','Kashif'),(3,3,3,1,2500,1450,20,0,0,'In Progress','Marker 3 cutting underway','2026-08-08',2500,1470,1450,'L-12','MRK-1003','CT-01','Arslan','Kashif'),(4,4,3,1,1500,1500,12,0,1500,'Completed','Transferred','2026-07-18',1500,1500,1500,'L-08','MRK-1004','CT-03','Nasir','Kashif'),(5,5,3,1,4000,4000,28,0,4000,'Completed','Transferred','2026-07-09',4000,4000,4000,'L-22','MRK-1005','CT-02','Arslan','Kashif')"),
    db.prepare("INSERT INTO stitching_records (lot_id,design_id,department_id,user_id,received_qty,completed_qty,rejected_qty,rework_qty,transferred_qty,status,remarks,start_date,production_line,supervisor,target_qty,today_production,efficiency,expected_completion_date) VALUES (1,1,4,1,5000,3500,35,110,0,'Running','3,500 PCS completed.','2026-08-01','Line 04','Sana',500,440,88,'2026-08-13'),(4,4,4,1,1500,1500,18,25,1500,'Completed','Transferred','2026-07-21','Line 02','Sana',300,300,100,'2026-07-27'),(5,5,4,1,4000,4000,40,65,4000,'Completed','Transferred','2026-07-12','Line 05','Hina',600,580,96.7,'2026-07-21')"),
    db.prepare("INSERT INTO finishing_records (lot_id,design_id,department_id,user_id,received_qty,completed_qty,rejected_qty,rework_qty,transferred_qty,status,remarks,start_date,process,checked_qty,passed_qty,supervisor,received_date) VALUES (4,4,5,1,1500,1500,12,30,1500,'Completed','Silk finishing complete','2026-07-28','Final Inspection',1500,1500,'Mehwish','2026-07-28'),(5,5,5,1,4000,4000,25,45,4000,'Completed','QC cleared','2026-07-22','General Quality Check',4000,4000,'Mehwish','2026-07-22')"),
    db.prepare("INSERT INTO packing_records (lot_id,design_id,department_id,user_id,received_qty,completed_qty,rejected_qty,rework_qty,transferred_qty,status,remarks,start_date,packing_qty,pieces_per_carton,total_cartons,barcode_status,tag_status,polybag_status,carton_status,supervisor,packing_date) VALUES (4,4,6,1,1500,1100,0,0,0,'In Progress','Final cartons being packed','2026-08-07',1100,25,44,'Completed','Completed','Completed','In Progress','Faiza','2026-08-09'),(5,5,6,1,4000,4000,0,0,4000,'Completed','200 cartons dispatched to warehouse','2026-07-29',4000,20,200,'Completed','Completed','Completed','Completed','Faiza','2026-08-02')"),
    db.prepare("INSERT INTO gatepasses (gatepass_no,lot_id,design_id,user_id,quantity,cartons,from_department,to_department,purpose,vehicle_no,driver_name,driver_contact,issued_by,approved_by,security_check,gatepass_date,release_date,status,remarks) VALUES ('GP-00001',5,5,1,4000,200,'Packing','Warehouse','Warehouse Shipment','LEA-7781','Imran Ali','+92 300 111 2233','Faiza Khan','Ayesha Khan','Cleared','2026-08-02','2026-08-03','Released','200 cartons released to warehouse.')"),
    db.prepare("INSERT INTO warehouse_receipts (receipt_no,lot_id,design_id,department_id,gatepass_id,user_id,received_qty,receivable_qty,non_receivable_qty,non_receivable_reason,cartons,location,rack_no,received_by,received_date,status,remarks) VALUES ('WHR-00001',5,5,7,1,1,4000,3960,40,'40 PCS stain damage returned to Finishing',200,'Finished Goods - A','A-14','Usman Shah','2026-08-03','In Stock','Count verified')"),
    db.prepare("INSERT INTO warehouse_inventory (lot_id,design_id,available_qty,reserved_qty,dispatched_qty,non_receivable_qty,dispatch_status,status) VALUES (5,5,3960,0,0,40,'Active','In Stock')"),
    db.prepare("INSERT INTO department_transfers (lot_id,design_id,from_department_id,to_department_id,user_id,quantity,remarks,transfer_date) VALUES (1,1,1,2,1,5000,'Lot issued to Embroidery','2026-07-20T09:15:00Z'),(1,1,2,3,1,5000,'Embroidery cleared','2026-07-25T13:00:00Z'),(1,1,3,4,1,5000,'Cut panels transferred','2026-08-01T09:00:00Z'),(3,3,1,2,1,2500,'Lot issued','2026-07-27T09:00:00Z'),(3,3,2,3,1,2500,'Embroidery cleared','2026-08-08T09:30:00Z'),(4,4,1,2,1,1500,'Lot issued','2026-07-12T09:00:00Z'),(4,4,2,3,1,1500,'Embroidery cleared','2026-07-18T10:00:00Z'),(4,4,3,4,1,1500,'Cutting cleared','2026-07-21T09:00:00Z'),(4,4,4,5,1,1500,'Stitching cleared','2026-07-28T09:00:00Z'),(4,4,5,6,1,1500,'Finishing cleared','2026-08-07T09:00:00Z'),(5,5,1,2,1,4000,'Lot issued','2026-07-02T09:00:00Z'),(5,5,2,3,1,4000,'Embroidery cleared','2026-07-09T09:00:00Z'),(5,5,3,4,1,4000,'Cutting cleared','2026-07-12T09:00:00Z'),(5,5,4,5,1,4000,'Stitching cleared','2026-07-22T09:00:00Z'),(5,5,5,6,1,4000,'Finishing cleared','2026-07-29T09:00:00Z'),(5,5,6,7,1,4000,'Packed stock received','2026-08-03T10:00:00Z')"),
    db.prepare("INSERT INTO lot_remarks (lot_id,user_id,department_id,remark,created_at) VALUES (1,1,4,'3,500 PCS completed.','2026-08-09T11:30:00Z'),(2,1,2,'Embroidery production in progress.','2026-08-09T10:45:00Z'),(5,1,7,'Warehouse count verified; ready for dispatch.','2026-08-09T09:20:00Z')"),
    db.prepare("INSERT INTO lot_history (lot_id,user_id,department_id,action,quantity,remarks,created_at) VALUES (1,1,1,'LOT-00001 created',5000,'Production approved','2026-07-20T09:00:00Z'),(1,1,2,'Lot issued to Embroidery',5000,'Received by Ali','2026-07-20T09:15:00Z'),(1,1,3,'Transferred to Cutting',5000,'Embroidery cleared','2026-07-25T13:00:00Z'),(1,1,4,'Stitching production updated',3500,'3,500 PCS completed.','2026-08-09T11:30:00Z'),(2,1,2,'Embroidery production updated',1200,'Production in progress','2026-08-09T10:45:00Z'),(5,1,7,'Received in Warehouse',4000,'Count verified','2026-08-03T10:00:00Z')"),
    db.prepare("INSERT INTO audit_logs (user_id,department_id,lot_id,design_id,action,previous_value,new_value,quantity,remarks,created_at) VALUES (1,1,1,1,'Lot Created','','LOT-00001',5000,'Production approved','2026-07-20T09:00:00Z'),(1,4,1,1,'Production Updated','3050','3500',450,'Daily stitching output','2026-08-09T11:30:00Z'),(1,7,5,5,'Warehouse Received','0','4000',4000,'Count verified','2026-08-03T10:00:00Z')"),
    db.prepare("INSERT INTO notifications (user_id,actor_name,audience,category,level,title,message,link,read,created_at) VALUES (1,'Usman Shah','Owner','Warehouse','success','LOT-00005 ready for dispatch','3,960 receivable PCS added to Warehouse stock. 40 PCS marked non-receivable.','Warehouse',0,'2026-08-09T09:20:00Z'),(1,'System','Owner','Delivery','warning','Delivery due soon','LOT-00004 is due on 12 Aug 2026.','Lot Progress',0,'2026-08-09T08:00:00Z'),(1,'Faiza Khan','Owner','Gatepass','info','GP-00001 released to Warehouse','200 cartons of LOT-00005 left Packing on vehicle LEA-7781.','Gatepass',1,'2026-08-02T16:10:00Z'),(1,'Ayesha Khan','Owner','Payroll','info','July payroll pending approval','1 piece-rate salary record is still unpaid for July 2026.','Salary',0,'2026-08-05T10:00:00Z')"),
  ];
  await db.batch(detailSeed);
  await db.prepare("INSERT OR IGNORE INTO departments (id,name,sequence) VALUES (?,'Gatepass',7)").bind(GATEPASS_DEPARTMENT_ID).run();
  await markSampleDataSettled();
  await db.prepare("PRAGMA optimize").run();
}

const round2 = (value: number) => Math.round(value * 100) / 100;

// A month's day-rate is the monthly salary divided by that month's real length —
// 31 in August, 30 in September, 28/29 in February — not a fixed working-day figure.
const daysInPeriod = (period: string) => {
  const [year, month] = period.split("-").map(Number);
  if (!year || !month) return 30;
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
};

// Every attendance mark, piece entry and advance re-derives that month's salary
// line — monthly staff per attended day, theka staff per piece entry — so the
// payroll register is never stale. A month already marked Paid is left alone.
async function recalculateSalary(employeeId: number, period: string, timestamp: string) {
  const db = getD1();
  const employee = await db.prepare("SELECT * FROM employees WHERE id=?").bind(employeeId).first<Record<string, unknown>>();
  if (!employee) return null;
  const existing = await db.prepare("SELECT * FROM salary_records WHERE employee_id=? AND period=?").bind(employeeId, period).first<Record<string, unknown>>();
  if (existing && String(existing.payment_status) === "Paid") return null;

  const [attendance, pieceWork, advances] = await Promise.all([
    db.prepare(
      `SELECT COUNT(*) AS marked,
              COALESCE(SUM(CASE WHEN status IN ('Present','Overtime') THEN 1 WHEN status='Half Day' THEN 0.5 ELSE 0 END),0) AS present,
              COALESCE(SUM(CASE WHEN status='Absent' THEN 1 ELSE 0 END),0) AS absent
       FROM attendance_records WHERE employee_id=? AND attendance_date LIKE ?`
    ).bind(employeeId, `${period}%`).first<{ marked: number; present: number; absent: number }>(),
    db.prepare("SELECT COUNT(*) AS entries, COALESCE(SUM(pcs_qty),0) AS pieces, COALESCE(SUM(total_amount),0) AS amount FROM piece_work_entries WHERE employee_id=? AND period=?")
      .bind(employeeId, period).first<{ entries: number; pieces: number; amount: number }>(),
    db.prepare("SELECT COALESCE(SUM(amount),0) AS amount FROM salary_advances WHERE employee_id=? AND period=?")
      .bind(employeeId, period).first<{ amount: number }>(),
  ]);

  const marked = Number(attendance?.marked ?? 0);
  const pieceEntries = Number(pieceWork?.entries ?? 0);
  if (!marked && !pieceEntries && !existing) return null;

  const monthDays = daysInPeriod(period);
  const presentDays = Math.round(Number(attendance?.present ?? 0) * 2) / 2;
  const absentDays = Number(attendance?.absent ?? 0);
  const pieces = Number(pieceWork?.pieces ?? 0);
  const salaryType = String(employee.salary_type ?? "Monthly");
  const monthlySalary = Number(employee.monthly_salary ?? 0);
  const perDay = round2(monthlySalary / monthDays);
  // Theka staff are paid the sum of their item entries; the blended rate is only
  // shown for reference on the register.
  const baseAmount = salaryType === "Theka" ? round2(Number(pieceWork?.amount ?? 0)) : round2(perDay * Math.min(monthDays, presentDays));
  const ratePerPiece = salaryType === "Theka" && pieces > 0 ? round2(Number(pieceWork?.amount ?? 0) / pieces) : 0;

  // Manual adjustments already entered on the record are preserved; recorded
  // advances always win over a hand-typed advance figure.
  const overtimeAmount = Number(existing?.overtime_amount ?? 0);
  const bonus = Number(existing?.bonus ?? 0);
  const advance = Number(advances?.amount ?? 0) || Number(existing?.advance ?? 0);
  const deduction = Number(existing?.deduction ?? 0);
  const netPayable = Math.max(0, round2(baseAmount + overtimeAmount + bonus - advance - deduction));

  await db.prepare(
    `INSERT INTO salary_records (employee_id,period,salary_type,present_days,absent_days,total_pieces,rate_per_piece,base_amount,overtime_amount,bonus,advance,deduction,net_payable,payment_status,paid_date,remarks,created_at,updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,'Unpaid',NULL,?,?,?)
     ON CONFLICT(employee_id,period) DO UPDATE SET salary_type=excluded.salary_type,present_days=excluded.present_days,absent_days=excluded.absent_days,total_pieces=excluded.total_pieces,rate_per_piece=excluded.rate_per_piece,base_amount=excluded.base_amount,advance=excluded.advance,net_payable=excluded.net_payable,remarks=excluded.remarks,updated_at=excluded.updated_at`
  ).bind(employeeId, period, salaryType, Math.round(presentDays), absentDays, pieces, ratePerPiece, baseAmount, overtimeAmount, bonus, advance, deduction, netPayable,
    salaryType === "Theka"
      ? `Auto-calculated from ${pieceEntries} piece-work entr${pieceEntries === 1 ? "y" : "ies"} · ${pieces.toLocaleString()} PCS.`
      : `Auto-calculated at Rs ${perDay.toLocaleString()} per day (${monthlySalary.toLocaleString()} ÷ ${monthDays} days) × ${presentDays} day${presentDays === 1 ? "" : "s"} attended.`,
    timestamp, timestamp).run();

  return { salaryType, presentDays, absentDays, pieces, perDay, monthDays, baseAmount, netPayable };
}

// A shop counter needs none of the factory floor, and the factory needs none of a
// shop's invoice lines. Scoping the read keeps both responses small and quick.
type Scope = { kind: "factory" } | { kind: "shop"; shopId: number };

function scopeFromRequest(url: URL, body?: Record<string, unknown>): Scope {
  const kind = String(body?.scope ?? url.searchParams.get("scope") ?? "factory");
  const shopId = Number(body?.shopId ?? url.searchParams.get("shopId") ?? 0);
  return kind === "shop" && shopId > 0 ? { kind: "shop", shopId } : { kind: "factory" };
}

// An uploaded logo is swapped for its cacheable URL so the base64 never travels
// with the state. The version stamp busts the cache when the logo changes.
const logoLink = (row: Record<string, unknown>, shopId?: number) => {
  const value = String(row.logo_url ?? "");
  if (!value.startsWith("data:")) return row;
  const version = String(row.updated_at ?? "1").replace(/\D/g, "").slice(-10) || "1";
  return { ...row, logo_url: shopId ? `/api/factory/logo?shop=${shopId}&v=${version}` : `/api/factory/logo?v=${version}` };
};

async function getShopState(shopId: number) {
  const db = getD1();
  const [shops, inventory, sales, saleItems, expenses, attendance, dayClose, shipments] = await Promise.all([
    db.prepare("SELECT * FROM shops ORDER BY shop_code").all(),
    db.prepare(`SELECT si.*, s.name AS shop, s.shop_code, l.lot_no, (si.received_qty-si.sold_qty) AS remaining_qty FROM shop_inventory si JOIN shops s ON s.id=si.shop_id LEFT JOIN lots l ON l.id=si.lot_id WHERE si.shop_id=? ORDER BY si.product_name`).bind(shopId).all(),
    db.prepare(`SELECT sa.*, s.name AS shop, s.shop_code FROM shop_sales sa JOIN shops s ON s.id=sa.shop_id WHERE sa.shop_id=? ORDER BY sa.id DESC LIMIT 300`).bind(shopId).all(),
    db.prepare("SELECT * FROM shop_sale_items WHERE shop_id=? ORDER BY id DESC LIMIT 900").bind(shopId).all(),
    db.prepare(`SELECT e.*, s.name AS shop FROM shop_expenses e JOIN shops s ON s.id=e.shop_id WHERE e.shop_id=? ORDER BY e.id DESC LIMIT 200`).bind(shopId).all(),
    db.prepare("SELECT * FROM shop_attendance WHERE shop_id=? ORDER BY attendance_date DESC, staff_name LIMIT 200").bind(shopId).all(),
    db.prepare(`SELECT c.*, s.name AS shop FROM shop_day_close c JOIN shops s ON s.id=c.shop_id WHERE c.shop_id=? ORDER BY c.close_date DESC LIMIT 90`).bind(shopId).all(),
    db.prepare(`SELECT ss.*, s.name AS shop, s.shop_code, l.lot_no, d.design_no FROM shop_shipments ss JOIN shops s ON s.id=ss.shop_id JOIN lots l ON l.id=ss.lot_id JOIN designs d ON d.id=ss.design_id WHERE ss.shop_id=? ORDER BY ss.id DESC LIMIT 120`).bind(shopId).all(),
  ]);
  return {
    shops: shops.results.map((row) => logoLink(row, Number(row.id))),
    shopInventory: inventory.results, shopSales: sales.results, shopSaleItems: saleItems.results,
    shopExpenses: expenses.results, shopAttendance: attendance.results, shopDayClose: dayClose.results, shopShipments: shipments.results,
  };
}

async function getState(scope: Scope = { kind: "factory" }) {
  if (scope.kind === "shop") return getShopState(scope.shopId);
  const db = getD1();
  const [lots, sizes, embroidery, cutting, stitching, finishing, packing, warehouse, receipts, dispatches, transfers, remarks, history, audits, customers, designs, notifications, settings, gatepasses, employees, attendance, salaries, pieceWork, advances,
    users, suppliers, purchases, shops, shopShipments, shopInventory, shopSales, shopExpenses] = await Promise.all([
    db.prepare(`SELECT l.*, d.design_no, c.name AS customer, c.destination FROM lots l JOIN designs d ON d.id=l.design_id JOIN customers c ON c.id=l.customer_id ORDER BY l.id DESC`).all(),
    db.prepare("SELECT * FROM lot_size_breakdowns ORDER BY id").all(),
    db.prepare("SELECT * FROM embroidery_records ORDER BY id DESC").all(),
    db.prepare("SELECT * FROM cutting_records ORDER BY id DESC").all(),
    db.prepare("SELECT * FROM stitching_records ORDER BY id DESC").all(),
    db.prepare("SELECT * FROM finishing_records ORDER BY id DESC").all(),
    db.prepare("SELECT * FROM packing_records ORDER BY id DESC").all(),
    db.prepare(`SELECT wi.*, l.lot_no, l.fabrication, l.size_range, d.design_no, c.name AS customer, (wi.available_qty-wi.dispatched_qty) AS balance_qty FROM warehouse_inventory wi JOIN lots l ON l.id=wi.lot_id JOIN designs d ON d.id=wi.design_id JOIN customers c ON c.id=l.customer_id ORDER BY wi.id DESC`).all(),
    db.prepare(`SELECT wr.*, l.lot_no, l.fabrication, l.size_range, d.design_no, c.name AS customer, g.gatepass_no FROM warehouse_receipts wr JOIN lots l ON l.id=wr.lot_id JOIN designs d ON d.id=wr.design_id JOIN customers c ON c.id=l.customer_id LEFT JOIN gatepasses g ON g.id=wr.gatepass_id ORDER BY wr.id DESC LIMIT 300`).all(),
    db.prepare(`SELECT cd.*, l.lot_no, l.fabrication, l.size_range, d.design_no, c.name AS customer FROM customer_dispatches cd JOIN lots l ON l.id=cd.lot_id JOIN designs d ON d.id=cd.design_id JOIN customers c ON c.id=cd.customer_id ORDER BY cd.id DESC LIMIT 300`).all(),
    db.prepare(`SELECT t.*, fd.name AS from_department, td.name AS to_department, u.name AS user_name FROM department_transfers t JOIN departments fd ON fd.id=t.from_department_id JOIN departments td ON td.id=t.to_department_id LEFT JOIN users u ON u.id=t.user_id ORDER BY t.id DESC LIMIT 400`).all(),
    db.prepare(`SELECT r.*, u.name AS user_name, d.name AS department FROM lot_remarks r LEFT JOIN users u ON u.id=r.user_id LEFT JOIN departments d ON d.id=r.department_id ORDER BY r.id DESC LIMIT 300`).all(),
    db.prepare(`SELECT h.*, u.name AS user_name, d.name AS department FROM lot_history h LEFT JOIN users u ON u.id=h.user_id LEFT JOIN departments d ON d.id=h.department_id ORDER BY h.id DESC LIMIT 400`).all(),
    // Audit values are whole-record JSON snapshots; the register only ever shows a
    // short preview, so only that much is sent.
    db.prepare(`SELECT a.id, a.user_id, a.department_id, a.lot_id, a.design_id, a.action, substr(a.previous_value,1,120) AS previous_value, substr(a.new_value,1,120) AS new_value, a.quantity, a.remarks, a.created_at, u.name AS user_name, dep.name AS department, l.lot_no, d.design_no FROM audit_logs a LEFT JOIN users u ON u.id=a.user_id LEFT JOIN departments dep ON dep.id=a.department_id LEFT JOIN lots l ON l.id=a.lot_id LEFT JOIN designs d ON d.id=a.design_id ORDER BY a.id DESC LIMIT 200`).all(),
    db.prepare("SELECT * FROM customers ORDER BY name").all(),
    db.prepare("SELECT * FROM designs ORDER BY design_no").all(),
    db.prepare("SELECT * FROM notifications ORDER BY id DESC LIMIT 200").all(),
    db.prepare("SELECT * FROM system_settings WHERE id=1").all(),
    db.prepare(`SELECT g.*, l.lot_no, l.fabrication, l.size_range, d.design_no, c.name AS customer FROM gatepasses g JOIN lots l ON l.id=g.lot_id JOIN designs d ON d.id=g.design_id JOIN customers c ON c.id=l.customer_id ORDER BY g.id DESC`).all(),
    db.prepare("SELECT * FROM employees ORDER BY employee_code").all(),
    db.prepare(`SELECT a.*, e.name AS employee_name, e.employee_code, e.department, e.salary_type, e.rate_per_piece FROM attendance_records a JOIN employees e ON e.id=a.employee_id ORDER BY a.attendance_date DESC, e.employee_code LIMIT 400`).all(),
    db.prepare(`SELECT s.*, e.name AS employee_name, e.employee_code, e.department, e.designation FROM salary_records s JOIN employees e ON e.id=s.employee_id ORDER BY s.period DESC, e.employee_code`).all(),
    db.prepare(`SELECT p.*, e.name AS employee_name, e.employee_code, e.department, e.designation FROM piece_work_entries p JOIN employees e ON e.id=p.employee_id ORDER BY p.id DESC LIMIT 400`).all(),
    db.prepare(`SELECT a.*, e.name AS employee_name, e.employee_code, e.department FROM salary_advances a JOIN employees e ON e.id=a.employee_id ORDER BY a.id DESC LIMIT 200`).all(),
    db.prepare("SELECT id, name, username, email, role, shop_id, permissions, active, created_at FROM users ORDER BY role, username").all(),
    db.prepare("SELECT * FROM suppliers ORDER BY name").all(),
    db.prepare(`SELECT p.*, s.name AS supplier, s.contact AS supplier_contact FROM purchases p JOIN suppliers s ON s.id=p.supplier_id ORDER BY p.id DESC`).all(),
    db.prepare("SELECT * FROM shops ORDER BY shop_code").all(),
    db.prepare(`SELECT ss.*, s.name AS shop, s.shop_code, l.lot_no, d.design_no FROM shop_shipments ss JOIN shops s ON s.id=ss.shop_id JOIN lots l ON l.id=ss.lot_id JOIN designs d ON d.id=ss.design_id ORDER BY ss.id DESC`).all(),
    db.prepare(`SELECT si.*, s.name AS shop, s.shop_code, l.lot_no, (si.received_qty-si.sold_qty) AS remaining_qty FROM shop_inventory si JOIN shops s ON s.id=si.shop_id LEFT JOIN lots l ON l.id=si.lot_id ORDER BY si.shop_id, si.product_name`).all(),
    db.prepare(`SELECT sa.id, sa.shop_id, sa.invoice_no, sa.sale_date, sa.total_amount, sa.payment_method, sa.customer_name FROM shop_sales sa ORDER BY sa.id DESC LIMIT 250`).all(),
    db.prepare("SELECT id, shop_id, expense_date, amount, category FROM shop_expenses ORDER BY id DESC LIMIT 200").all(),
  ]);
  return {
    lots: lots.results, sizes: sizes.results,
    records: { Embroidery: embroidery.results, Cutting: cutting.results, Stitching: stitching.results, Finishing: finishing.results, Packing: packing.results },
    warehouse: warehouse.results, receipts: receipts.results, dispatches: dispatches.results,
    transfers: transfers.results, remarks: remarks.results, history: history.results, audits: audits.results,
    customers: customers.results, designs: designs.results, notifications: notifications.results,
    gatepasses: gatepasses.results, employees: employees.results, attendance: attendance.results, salaries: salaries.results,
    pieceWork: pieceWork.results, advances: advances.results,
    users: users.results.map((row) => publicUser(row as Record<string, unknown>)),
    suppliers: suppliers.results, purchases: purchases.results, shops: shops.results.map((row) => logoLink(row, Number(row.id))),
    shopShipments: shopShipments.results, shopInventory: shopInventory.results, shopSales: shopSales.results, shopExpenses: shopExpenses.results,
    settings: settings.results[0] ? logoLink(settings.results[0] as Record<string, unknown>) : {},
  };
}

function bad(error: string, status = 400) {
  return Response.json({ error }, { status });
}

export async function GET(request: Request) {
  try {
    await ensureDatabase();
    const session = await readSession(request);
    if (!session) return bad("Please sign in to continue.", 401);
    const requested = scopeFromRequest(new URL(request.url));
    // A shop login is pinned to its own counter: asking for a different shop is
    // refused, and anything else is simply narrowed to the shop it belongs to.
    if (session.role === "Shop" && requested.kind === "shop" && requested.shopId !== session.shopId) return bad("This account belongs to a different shop.", 403);
    const scope: Scope = session.role === "Shop" ? { kind: "shop", shopId: session.shopId } : requested;
    return Response.json(await getState(scope), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return bad(error instanceof Error ? error.message : "Unable to load factory data.", 500);
  }
}

export async function POST(request: Request) {
  try {
    await ensureDatabase();
    const db = getD1();
    const body = await request.json() as Record<string, unknown>;
    const action = String(body.action ?? "");

    if (action === "login") {
      const username = String(body.username ?? "").trim();
      const password = String(body.password ?? "");
      if (!username || !password) return bad("Enter your username and password.");
      const row = await db.prepare("SELECT * FROM users WHERE lower(username)=lower(?)").bind(username).first<Record<string, unknown>>();
      // The same message either way, so a wrong username cannot be told from a wrong password.
      if (!row || !(await passwordMatches(password, String(row.password_hash)))) return bad("Incorrect username or password.", 401);
      if (Number(row.active) !== 1) return bad("This account has been disabled. Ask the owner to re-enable it.", 403);
      const token = await createSession(row);
      return Response.json({ ok: true, user: publicUser(row), message: `Welcome back, ${String(row.name)}.` }, { headers: { "Set-Cookie": sessionCookie(token) } });
    }

    if (action === "logout") {
      return Response.json({ ok: true, message: "Signed out." }, { headers: { "Set-Cookie": clearedCookie } });
    }

    const session = await readSession(request);
    if (!session) return bad("Your session has expired. Please sign in again.", 401);

    if (action === "session") {
      const row = await db.prepare("SELECT * FROM users WHERE id=?").bind(session.userId).first<Record<string, unknown>>();
      if (!row || Number(row.active) !== 1) return bad("Your session has expired. Please sign in again.", 401);
      return Response.json({ ok: true, user: publicUser(row) });
    }

    // Access control: the owner does everything, a shop login only its own counter.
    if (session.role !== "Owner" && ownerOnlyActions.has(action)) return bad("Only the owner can do this.", 403);
    if (session.role === "Shop") {
      if (!shopActions.has(action)) return bad("This shop account can only use its own point of sale.", 403);
      const targetShop = Number(body.shopId ?? 0);
      if (targetShop && targetShop !== session.shopId) return bad("This account belongs to a different shop.", 403);
      if (action === "receive-shop-shipment") {
        const shipment = await db.prepare("SELECT shop_id FROM shop_shipments WHERE id=?").bind(Number(body.shipmentId ?? 0)).first<{ shop_id: number }>();
        if (shipment && Number(shipment.shop_id) !== session.shopId) return bad("That shipment belongs to a different shop.", 403);
      }
    }

    // Every handler replies with the caller's own slice of state, not the whole database.
    const requestedScope = scopeFromRequest(new URL(request.url), body);
    if (session.role === "Shop" && requestedScope.kind === "shop" && requestedScope.shopId !== session.shopId) return bad("This account belongs to a different shop.", 403);
    const scope: Scope = session.role === "Shop" ? { kind: "shop", shopId: session.shopId } : requestedScope;
    const state = () => getState(scope);

    if (action === "save-user" || action === "delete-user") {
      const timestamp = now();
      if (action === "delete-user") {
        const userId = Number(body.userId ?? 0);
        if (userId === session.userId) return bad("You cannot delete the account you are signed in with.");
        const target = await db.prepare("SELECT * FROM users WHERE id=?").bind(userId).first<Record<string, unknown>>();
        if (!target) return bad("User not found.", 404);
        if (String(target.role) === "Owner") return bad("The owner account cannot be deleted.");
        await db.batch([
          db.prepare("DELETE FROM users WHERE id=?").bind(userId),
          db.prepare("INSERT INTO audit_logs (user_id,department_id,action,previous_value,remarks,created_at) VALUES (1,1,'User Deleted',?,'Login removed by owner',?)").bind(String(target.username), timestamp),
          notify("Owner", "Users", "warning", `${String(target.name)} removed`, `The ${String(target.role).toLowerCase()} login ${String(target.username)} no longer has access.`, "Users & Permissions", timestamp),
        ]);
        return Response.json({ ok: true, message: `${String(target.name)} removed.`, state: await state() });
      }

      const userId = Number(body.userId ?? 0);
      const name = String(body.name ?? "").trim();
      const username = String(body.username ?? "").trim();
      const role = String(body.role ?? "Staff");
      const password = String(body.password ?? "");
      const shopId = Number(body.shopId ?? 0);
      const permissions = Array.isArray(body.permissions) ? (body.permissions as string[]).map(String) : [];
      if (!name) return bad("Full Name is required.");
      if (!username) return bad("Username is required.");
      if (!/^[A-Za-z0-9._-]{3,}$/.test(username)) return bad("Username must be at least 3 characters and use only letters, numbers, dot, dash or underscore.");
      if (!["Owner", "Staff", "Shop"].includes(role)) return bad("Role must be Owner, Staff or Shop.");
      if (role === "Shop" && !shopId) return bad("Choose which shop this login belongs to.");
      if (role === "Shop") {
        const shop = await db.prepare("SELECT id FROM shops WHERE id=?").bind(shopId).first<{ id: number }>();
        if (!shop) return bad("That shop no longer exists.");
      }
      if (role === "Staff" && !permissions.length) return bad("Choose at least one page this user may open.");
      const clash = await db.prepare("SELECT id FROM users WHERE lower(username)=lower(?) AND id<>?").bind(username, userId || -1).first<{ id: number }>();
      if (clash) return bad("That username is already taken.");
      // Email is optional in the form, but the column is unique — an empty box must
      // not become a shared blank value that blocks the next user.
      const email = String(body.email ?? "").trim() || `${username}@msboutique.com`;
      const emailClash = await db.prepare("SELECT id FROM users WHERE lower(email)=lower(?) AND id<>?").bind(email, userId || -1).first<{ id: number }>();
      if (emailClash) return bad(`That email address is already used by another login. Leave it blank or enter a different one.`);

      if (userId) {
        const previous = await db.prepare("SELECT * FROM users WHERE id=?").bind(userId).first<Record<string, unknown>>();
        if (!previous) return bad("User not found.", 404);
        if (String(previous.role) === "Owner" && role !== "Owner") return bad("The owner account must keep the Owner role.");
        if (password && password.length < 6) return bad("Password must be at least 6 characters.");
        const hash = password ? await hashPassword(password) : String(previous.password_hash);
        await db.batch([
          db.prepare("UPDATE users SET name=?,username=?,email=?,password_hash=?,role=?,shop_id=?,permissions=?,active=?,updated_at=? WHERE id=?")
            .bind(name, username, email, hash, role, role === "Shop" ? shopId : null, JSON.stringify(permissions), Number(body.active ?? 1) ? 1 : 0, timestamp, userId),
          db.prepare("INSERT INTO audit_logs (user_id,department_id,action,previous_value,new_value,remarks,created_at) VALUES (1,1,'User Updated',?,?,'Access changed by owner',?)").bind(String(previous.username), `${username} · ${role}`, timestamp),
        ]);
        return Response.json({ ok: true, message: `${name} updated.${password ? " New password set." : ""}`, state: await state() });
      }

      if (!password || password.length < 6) return bad("Set a password of at least 6 characters for the new user.");
      const hash = await hashPassword(password);
      await db.batch([
        db.prepare("INSERT INTO users (name,email,username,password_hash,role,role_id,department_id,shop_id,permissions,active,created_at,updated_at) VALUES (?,?,?,?,?,1,1,?,?,1,?,?)")
          .bind(name, email, username, hash, role, role === "Shop" ? shopId : null, JSON.stringify(permissions), timestamp, timestamp),
        db.prepare("INSERT INTO audit_logs (user_id,department_id,action,new_value,remarks,created_at) VALUES (1,1,'User Created',?,'Login created by owner',?)").bind(`${username} · ${role}`, timestamp),
        notify("Owner", "Users", "success", `${name} can now sign in`, role === "Shop" ? `${username} opens the shop point of sale only.` : `${username} has access to ${permissions.length} page${permissions.length === 1 ? "" : "s"}.`, "Users & Permissions", timestamp),
      ]);
      return Response.json({ ok: true, message: `${name} created. They can sign in with "${username}".`, state: await state() });
    }

    if (action === "save-settings") {
      const companyName = String(body.companyName ?? "").trim();
      const address = String(body.address ?? "").trim();
      const phone = String(body.phone ?? "").trim();
      const website = String(body.website ?? "").trim();
      let logoUrl = String(body.logoUrl ?? "").trim();
      // The form receives the cacheable logo URL, not the stored data URI. Saving it
      // back must not wipe the uploaded image.
      if (logoUrl.startsWith("/api/factory/logo")) {
        const current = await db.prepare("SELECT logo_url FROM system_settings WHERE id=1").first<{ logo_url: string }>();
        logoUrl = String(current?.logo_url ?? "");
      }
      const invoicePrefix = String(body.invoicePrefix ?? "INV").trim().toUpperCase();
      const challanPrefix = String(body.challanPrefix ?? "DC").trim().toUpperCase();
      const footerNote = String(body.footerNote ?? "").trim();
      if (!companyName) return bad("Company Name is required.");
      if (!address) return bad("Company Address is required.");
      if (!phone) return bad("Company Phone is required.");
      if (!invoicePrefix || !challanPrefix) return bad("Invoice and challan prefixes are required.");
      // An uploaded logo arrives inlined as a data URI; a pasted one must be a URL or site path.
      const uploadedLogo = /^data:image\/(png|jpeg|jpg|webp|gif|svg\+xml);base64,/i.test(logoUrl);
      if (logoUrl && !uploadedLogo && !/^(https?:\/\/|\/)/i.test(logoUrl)) return bad("Logo must be an uploaded image, a web address or a site path.");
      if (uploadedLogo && logoUrl.length > 560_000) return bad("That logo image is too large. Please upload one under 400 KB.");
      const timestamp = now();
      await db.batch([
        db.prepare("UPDATE system_settings SET company_name=?,address=?,phone=?,website=?,logo_url=?,invoice_prefix=?,challan_prefix=?,footer_note=?,updated_at=? WHERE id=1").bind(companyName, address, phone, website, logoUrl, invoicePrefix, challanPrefix, footerNote, timestamp),
        db.prepare("INSERT INTO audit_logs (user_id,department_id,action,new_value,remarks,created_at) VALUES (1,1,'Invoice Settings Updated',?,'Company document profile updated',?)").bind(JSON.stringify({ companyName, address, phone, website, invoicePrefix, challanPrefix }), timestamp),
      ]);
      return Response.json({ ok: true, message: "Invoice and company settings saved.", state: await state() });
    }

    if (["create-customer", "update-customer", "delete-customer"].includes(action)) {
      const customerId = Number(body.customerId ?? 0);
      if (action === "delete-customer") {
        const customer = await db.prepare("SELECT * FROM customers WHERE id=?").bind(customerId).first<Record<string, unknown>>();
        if (!customer) return bad("Customer not found.", 404);
        const linked = await db.prepare("SELECT COUNT(*) AS count FROM lots WHERE customer_id=?").bind(customerId).first<{ count: number }>();
        if (Number(linked?.count ?? 0) > 0) return bad("This customer has linked production lots and cannot be deleted.");
        const timestamp = now();
        await db.batch([
          db.prepare("INSERT INTO audit_logs (user_id,department_id,action,previous_value,remarks,created_at) VALUES (1,1,'Customer Deleted',?,'Customer master record deleted',?)").bind(JSON.stringify(customer), timestamp),
          db.prepare("DELETE FROM customers WHERE id=?").bind(customerId),
        ]);
        return Response.json({ ok: true, message: "Customer deleted.", state: await state() });
      }

      const name = String(body.name ?? "").trim();
      const contact = String(body.contact ?? "").trim();
      const destination = String(body.destination ?? "").trim();
      if (!name) return bad("Customer Name is required.");
      if (!contact) return bad("Customer Phone is required.");
      if (!destination) return bad("Customer Address / Destination is required.");
      const duplicate = await db.prepare("SELECT id FROM customers WHERE lower(name)=lower(?) AND id<>?").bind(name, customerId || -1).first<{ id: number }>();
      if (duplicate) return bad("A customer with this name already exists.");
      const timestamp = now();
      if (action === "create-customer") {
        await db.batch([
          db.prepare("INSERT INTO customers (name,contact,destination,created_at,updated_at) VALUES (?,?,?,?,?)").bind(name, contact, destination, timestamp, timestamp),
          db.prepare("INSERT INTO audit_logs (user_id,department_id,action,new_value,remarks,created_at) VALUES (1,1,'Customer Created',?,'Customer master record added',?)").bind(name, timestamp),
        ]);
        return Response.json({ ok: true, message: `${name} added to Customers.`, state: await state() });
      }
      const previous = await db.prepare("SELECT * FROM customers WHERE id=?").bind(customerId).first<Record<string, unknown>>();
      if (!previous) return bad("Customer not found.", 404);
      await db.batch([
        db.prepare("UPDATE customers SET name=?,contact=?,destination=?,updated_at=? WHERE id=?").bind(name, contact, destination, timestamp, customerId),
        db.prepare("INSERT INTO audit_logs (user_id,department_id,action,previous_value,new_value,remarks,created_at) VALUES (1,1,'Customer Updated',?,?,'Customer master record updated',?)").bind(JSON.stringify(previous), JSON.stringify({ name, contact, destination }), timestamp),
      ]);
      return Response.json({ ok: true, message: `${name} updated.`, state: await state() });
    }

    if (action === "mark-notifications-read") {
      const notificationId = Number(body.notificationId ?? 0);
      const timestamp = now();
      if (notificationId) await db.prepare("UPDATE notifications SET read=1,updated_at=? WHERE id=?").bind(timestamp, notificationId).run();
      else await db.prepare("UPDATE notifications SET read=1,updated_at=? WHERE read=0").bind(timestamp).run();
      return Response.json({ ok: true, message: notificationId ? "Notification marked as read." : "All notifications marked as read.", state: await state() });
    }

    if (action === "save-employee" || action === "delete-employee") {
      const employeeId = Number(body.employeeId ?? 0);
      const timestamp = now();

      if (action === "delete-employee") {
        const employee = await db.prepare("SELECT * FROM employees WHERE id=?").bind(employeeId).first<Record<string, unknown>>();
        if (!employee) return bad("Employee not found.", 404);
        await db.batch([
          db.prepare("DELETE FROM attendance_records WHERE employee_id=?").bind(employeeId),
          db.prepare("DELETE FROM salary_records WHERE employee_id=?").bind(employeeId),
          db.prepare("DELETE FROM employees WHERE id=?").bind(employeeId),
          db.prepare("INSERT INTO audit_logs (user_id,department_id,action,previous_value,remarks,created_at) VALUES (1,1,'Employee Deleted',?,'Employee, attendance and salary records removed',?)").bind(JSON.stringify(employee), timestamp),
          notify("Ayesha Khan", "Employees", "warning", `${String(employee.name)} removed from the team`, `${String(employee.employee_code)} was deleted along with attendance and salary history.`, "Employees", timestamp),
        ]);
        return Response.json({ ok: true, message: `${String(employee.name)} deleted.`, state: await state() });
      }

      const name = String(body.name ?? "").trim();
      const department = String(body.department ?? "").trim();
      const designation = String(body.designation ?? "").trim();
      const phone = String(body.phone ?? "").trim();
      const joiningDate = String(body.joiningDate ?? "").trim();
      const salaryType = String(body.salaryType ?? "Monthly");
      const monthlySalary = Number(body.monthlySalary ?? 0);
      // Theka staff carry no rate on their record — each piece-work entry sets
      // its own item rate, so the same worker can be on several rates at once.
      const ratePerPiece = 0;
      if (!name) return bad("Employee Name is required.");
      if (!department) return bad("Department is required.");
      if (!designation) return bad("Designation is required.");
      if (!phone) return bad("Phone Number is required.");
      if (!joiningDate) return bad("Joining Date is required.");
      if (!["Monthly", "Theka"].includes(salaryType)) return bad("Salary Type must be Monthly or Theka (per piece).");
      if (salaryType === "Monthly" && monthlySalary <= 0) return bad("Monthly Salary must be greater than zero.");

      if (employeeId) {
        const previous = await db.prepare("SELECT * FROM employees WHERE id=?").bind(employeeId).first<Record<string, unknown>>();
        if (!previous) return bad("Employee not found.", 404);
        await db.batch([
          db.prepare("UPDATE employees SET name=?,father_name=?,cnic=?,phone=?,address=?,department=?,designation=?,joining_date=?,salary_type=?,monthly_salary=?,rate_per_piece=?,status=?,remarks=?,updated_at=? WHERE id=?")
            .bind(name, String(body.fatherName ?? ""), String(body.cnic ?? ""), phone, String(body.address ?? ""), department, designation, joiningDate, salaryType, salaryType === "Monthly" ? monthlySalary : 0, ratePerPiece, String(body.status ?? "Active"), String(body.remarks ?? ""), timestamp, employeeId),
          db.prepare("INSERT INTO audit_logs (user_id,department_id,action,previous_value,new_value,remarks,created_at) VALUES (1,1,'Employee Updated',?,?,'Employee master record updated',?)").bind(JSON.stringify(previous), JSON.stringify({ name, department, designation, salaryType, monthlySalary, ratePerPiece }), timestamp),
        ]);
        return Response.json({ ok: true, message: `${name} updated.`, state: await state() });
      }

      const next = await db.prepare("SELECT COALESCE(MAX(id),0)+1 AS next FROM employees").first<{ next: number }>();
      const employeeCode = String(body.employeeCode ?? "").trim() || `EMP-${String(next?.next ?? 1).padStart(3, "0")}`;
      const duplicate = await db.prepare("SELECT id FROM employees WHERE lower(employee_code)=lower(?)").bind(employeeCode).first<{ id: number }>();
      if (duplicate) return bad("An employee with this code already exists.");
      await db.batch([
        db.prepare("INSERT INTO employees (employee_code,name,father_name,cnic,phone,address,department,designation,joining_date,salary_type,monthly_salary,rate_per_piece,status,remarks,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
          .bind(employeeCode, name, String(body.fatherName ?? ""), String(body.cnic ?? ""), phone, String(body.address ?? ""), department, designation, joiningDate, salaryType, salaryType === "Monthly" ? monthlySalary : 0, ratePerPiece, String(body.status ?? "Active"), String(body.remarks ?? ""), timestamp, timestamp),
        db.prepare("INSERT INTO audit_logs (user_id,department_id,action,new_value,remarks,created_at) VALUES (1,1,'Employee Created',?,'Employee added to the team directory',?)").bind(employeeCode, timestamp),
        notify("Ayesha Khan", "Employees", "success", `${name} added to ${department}`, `${employeeCode} joined as ${designation} on ${salaryType === "Theka" ? `Theka (Rs ${ratePerPiece}/piece)` : `monthly salary Rs ${monthlySalary.toLocaleString()}`}.`, "Employees", timestamp),
      ]);
      return Response.json({ ok: true, message: `${name} added to Employees.`, state: await state() });
    }

    if (action === "save-attendance" || action === "delete-attendance") {
      const timestamp = now();
      if (action === "delete-attendance") {
        const attendanceId = Number(body.attendanceId ?? 0);
        const record = await db.prepare("SELECT * FROM attendance_records WHERE id=?").bind(attendanceId).first<Record<string, unknown>>();
        if (!record) return bad("Attendance record not found.", 404);
        await db.batch([
          db.prepare("DELETE FROM attendance_records WHERE id=?").bind(attendanceId),
          db.prepare("INSERT INTO audit_logs (user_id,department_id,action,previous_value,remarks,created_at) VALUES (1,1,'Attendance Deleted',?,'Attendance record removed',?)").bind(JSON.stringify(record), timestamp),
        ]);
        const revised = await recalculateSalary(Number(record.employee_id), String(record.attendance_date).slice(0, 7), timestamp);
        return Response.json({ ok: true, message: revised ? `Attendance deleted. ${String(record.attendance_date).slice(0, 7)} salary recalculated to Rs ${revised.netPayable.toLocaleString()}.` : "Attendance record deleted.", state: await state() });
      }

      const employeeId = Number(body.employeeId ?? 0);
      const employee = await db.prepare("SELECT * FROM employees WHERE id=?").bind(employeeId).first<Record<string, unknown>>();
      if (!employee) return bad("Choose an employee before saving attendance.");
      const attendanceDate = String(body.attendanceDate ?? "").trim();
      const status = String(body.status ?? "Present");
      const piecesDone = Number(body.piecesDone ?? 0);
      const overtimeHours = Number(body.overtimeHours ?? 0);
      if (!attendanceDate) return bad("Attendance Date is required.");
      if (!attendanceStatuses.includes(status)) return bad("Choose a valid attendance status.");
      if (!Number.isInteger(piecesDone) || piecesDone < 0) return bad("Pieces Done cannot be negative.");
      if (overtimeHours < 0 || overtimeHours > 12) return bad("Overtime Hours must be between 0 and 12.");
      await db.batch([
        db.prepare("INSERT INTO attendance_records (employee_id,attendance_date,status,in_time,out_time,overtime_hours,pieces_done,lot_no,remarks,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(employee_id,attendance_date) DO UPDATE SET status=excluded.status,in_time=excluded.in_time,out_time=excluded.out_time,overtime_hours=excluded.overtime_hours,pieces_done=excluded.pieces_done,lot_no=excluded.lot_no,remarks=excluded.remarks,updated_at=excluded.updated_at")
          .bind(employeeId, attendanceDate, status, String(body.inTime ?? ""), String(body.outTime ?? ""), overtimeHours, piecesDone, String(body.lotNo ?? ""), String(body.remarks ?? ""), timestamp, timestamp),
        db.prepare("INSERT INTO audit_logs (user_id,department_id,action,new_value,quantity,remarks,created_at) VALUES (1,1,'Attendance Marked',?,?,?,?)").bind(`${String(employee.employee_code)} · ${attendanceDate} · ${status}`, piecesDone, String(body.remarks ?? ""), timestamp),
      ]);
      const period = attendanceDate.slice(0, 7);
      const salary = await recalculateSalary(employeeId, period, timestamp);
      const message = salary
        ? `Attendance saved for ${String(employee.name)}. ${period} salary auto-updated to Rs ${salary.netPayable.toLocaleString()} (${salary.salaryType === "Theka" ? `${salary.pieces.toLocaleString()} PCS` : `${salary.presentDays} days attended`}).`
        : `Attendance saved for ${String(employee.name)}. ${period} salary is already paid, so it was left unchanged.`;
      return Response.json({ ok: true, message, state: await state() });
    }

    if (action === "save-piece-work" || action === "delete-piece-work") {
      const timestamp = now();
      if (action === "delete-piece-work") {
        const entryId = Number(body.entryId ?? 0);
        const entry = await db.prepare("SELECT * FROM piece_work_entries WHERE id=?").bind(entryId).first<Record<string, unknown>>();
        if (!entry) return bad("Piece-work entry not found.", 404);
        await db.batch([
          db.prepare("DELETE FROM piece_work_entries WHERE id=?").bind(entryId),
          db.prepare("INSERT INTO audit_logs (user_id,department_id,action,previous_value,quantity,remarks,created_at) VALUES (1,1,'Piece Work Deleted',?,?,'Theka item entry removed',?)").bind(JSON.stringify(entry), Number(entry.pcs_qty ?? 0), timestamp),
        ]);
        const revised = await recalculateSalary(Number(entry.employee_id), String(entry.period), timestamp);
        return Response.json({ ok: true, message: revised ? `Entry deleted. ${String(entry.period)} theka salary recalculated to Rs ${revised.netPayable.toLocaleString()}.` : "Piece-work entry deleted.", state: await state() });
      }

      const employeeId = Number(body.employeeId ?? 0);
      const employee = await db.prepare("SELECT * FROM employees WHERE id=?").bind(employeeId).first<Record<string, unknown>>();
      if (!employee) return bad("Choose a staff member for this piece-work entry.");
      const item = String(body.item ?? "").trim();
      const workFrom = String(body.workFrom ?? "").trim();
      const workTo = String(body.workTo ?? "").trim();
      const pcsQty = Number(body.pcsQty ?? 0);
      const ratePerPiece = Number(body.ratePerPiece ?? 0);
      if (!item) return bad("Item / Work is required.");
      if (!workFrom || !workTo) return bad("Work From and Work To dates are required.");
      if (workTo < workFrom) return bad("Work To cannot be before Work From.");
      if (!Number.isInteger(pcsQty) || pcsQty <= 0) return bad("PCS Qty. must be greater than zero.");
      if (!Number.isFinite(ratePerPiece) || ratePerPiece <= 0) return bad("Per Piece Rate must be greater than zero.");
      const totalAmount = round2(pcsQty * ratePerPiece);
      const period = workFrom.slice(0, 7);
      await db.batch([
        db.prepare("INSERT INTO piece_work_entries (employee_id,period,item,lot_no,work_from,work_to,pcs_qty,rate_per_piece,total_amount,remarks,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)")
          .bind(employeeId, period, item, String(body.lotNo ?? ""), workFrom, workTo, pcsQty, ratePerPiece, totalAmount, String(body.remarks ?? ""), timestamp, timestamp),
        db.prepare("INSERT INTO audit_logs (user_id,department_id,action,new_value,quantity,remarks,created_at) VALUES (1,1,'Piece Work Added',?,?,?,?)").bind(`${String(employee.employee_code)} · ${item} · ${pcsQty} PCS @ ${ratePerPiece}`, pcsQty, `Rs ${totalAmount}`, timestamp),
      ]);
      const salary = await recalculateSalary(employeeId, period, timestamp);
      return Response.json({ ok: true, message: `${item} · ${pcsQty.toLocaleString()} PCS × Rs ${ratePerPiece} = Rs ${totalAmount.toLocaleString()} added for ${String(employee.name)}.${salary ? ` ${period} theka salary is now Rs ${salary.netPayable.toLocaleString()}.` : ""}`, state: await state() });
    }

    if (action === "save-advance" || action === "delete-advance") {
      const timestamp = now();
      if (action === "delete-advance") {
        const advanceId = Number(body.advanceId ?? 0);
        const advance = await db.prepare("SELECT * FROM salary_advances WHERE id=?").bind(advanceId).first<Record<string, unknown>>();
        if (!advance) return bad("Advance not found.", 404);
        await db.batch([
          db.prepare("DELETE FROM salary_advances WHERE id=?").bind(advanceId),
          db.prepare("INSERT INTO audit_logs (user_id,department_id,action,previous_value,remarks,created_at) VALUES (1,1,'Advance Deleted',?,'Salary advance removed',?)").bind(JSON.stringify(advance), timestamp),
        ]);
        await recalculateSalary(Number(advance.employee_id), String(advance.period), timestamp);
        return Response.json({ ok: true, message: "Advance deleted and the salary recalculated.", state: await state() });
      }

      const employeeId = Number(body.employeeId ?? 0);
      const employee = await db.prepare("SELECT * FROM employees WHERE id=?").bind(employeeId).first<Record<string, unknown>>();
      if (!employee) return bad("Choose a staff member for this advance.");
      const advanceDate = String(body.advanceDate ?? "").trim();
      const amount = Number(body.amount ?? 0);
      if (!advanceDate) return bad("Advance Date is required.");
      if (!Number.isFinite(amount) || amount <= 0) return bad("Advance Amount must be greater than zero.");
      const period = advanceDate.slice(0, 7);
      await db.batch([
        db.prepare("INSERT INTO salary_advances (employee_id,period,advance_date,amount,remarks,created_at,updated_at) VALUES (?,?,?,?,?,?,?)")
          .bind(employeeId, period, advanceDate, amount, String(body.remarks ?? ""), timestamp, timestamp),
        db.prepare("INSERT INTO audit_logs (user_id,department_id,action,new_value,quantity,remarks,created_at) VALUES (1,1,'Advance Paid',?,?,?,?)").bind(`${String(employee.employee_code)} · ${period}`, Math.round(amount), String(body.remarks ?? ""), timestamp),
      ]);
      const salary = await recalculateSalary(employeeId, period, timestamp);
      return Response.json({ ok: true, message: `Rs ${amount.toLocaleString()} advance recorded for ${String(employee.name)}.${salary ? ` Net payable is now Rs ${salary.netPayable.toLocaleString()}.` : ""}`, state: await state() });
    }

    if (action === "recalculate-period") {
      const period = String(body.period ?? "");
      if (!/^\d{4}-\d{2}$/.test(period)) return bad("Choose a salary month such as 2026-08.");
      const timestamp = now();
      // Only unpaid months are touched; a settled salary is never rewritten.
      const pending = await db.prepare("SELECT DISTINCT employee_id FROM (SELECT employee_id FROM salary_records WHERE period=? AND payment_status<>'Paid' UNION SELECT employee_id FROM attendance_records WHERE attendance_date LIKE ? UNION SELECT employee_id FROM piece_work_entries WHERE period=?)")
        .bind(period, `${period}%`, period).all<{ employee_id: number }>();
      let updated = 0;
      for (const row of pending.results) {
        const revised = await recalculateSalary(Number(row.employee_id), period, timestamp);
        if (revised) updated += 1;
      }
      const monthDays = daysInPeriod(period);
      await db.prepare("INSERT INTO audit_logs (user_id,department_id,action,new_value,quantity,remarks,created_at) VALUES (1,1,'Payroll Recalculated',?,?,?,?)").bind(period, updated, `Day rate based on ${monthDays} days in ${period}`, timestamp).run();
      return Response.json({ ok: true, message: `${updated} unpaid salary record${updated === 1 ? "" : "s"} recalculated for ${period} using ${monthDays} days in the month.`, state: await state() });
    }

    if (action === "save-salary" || action === "delete-salary") {
      const timestamp = now();
      if (action === "delete-salary") {
        const salaryId = Number(body.salaryId ?? 0);
        const record = await db.prepare("SELECT * FROM salary_records WHERE id=?").bind(salaryId).first<Record<string, unknown>>();
        if (!record) return bad("Salary record not found.", 404);
        await db.batch([
          db.prepare("DELETE FROM salary_records WHERE id=?").bind(salaryId),
          db.prepare("INSERT INTO audit_logs (user_id,department_id,action,previous_value,remarks,created_at) VALUES (1,1,'Salary Deleted',?,'Salary record removed',?)").bind(JSON.stringify(record), timestamp),
        ]);
        return Response.json({ ok: true, message: "Salary record deleted.", state: await state() });
      }

      const employeeId = Number(body.employeeId ?? 0);
      const employee = await db.prepare("SELECT * FROM employees WHERE id=?").bind(employeeId).first<Record<string, unknown>>();
      if (!employee) return bad("Choose an employee before saving a salary record.");
      const period = String(body.period ?? "").trim();
      if (!/^\d{4}-\d{2}$/.test(period)) return bad("Salary Period must be a month such as 2026-08.");
      const salaryType = String(employee.salary_type ?? "Monthly");
      const presentDays = Number(body.presentDays ?? 0);
      const absentDays = Number(body.absentDays ?? 0);
      const totalPieces = Number(body.totalPieces ?? 0);
      const ratePerPiece = Number(body.ratePerPiece ?? employee.rate_per_piece ?? 0);
      const overtimeAmount = Number(body.overtimeAmount ?? 0);
      const bonus = Number(body.bonus ?? 0);
      const advance = Number(body.advance ?? 0);
      const deduction = Number(body.deduction ?? 0);
      if ([presentDays, absentDays, totalPieces, overtimeAmount, bonus, advance, deduction].some((value) => !Number.isFinite(value) || value < 0)) return bad("Salary values cannot be negative.");
      if (presentDays + absentDays > 31) return bad("Present plus absent days cannot exceed 31.");
      // Monthly staff are paid pro-rata on the real length of the month; theka
      // staff are paid per piece at the rate entered on this record.
      const monthDays = daysInPeriod(period);
      const baseAmount = salaryType === "Theka"
        ? round2(totalPieces * ratePerPiece)
        : round2((Number(employee.monthly_salary ?? 0) / monthDays) * Math.min(monthDays, presentDays || monthDays));
      const netPayable = Math.round((baseAmount + overtimeAmount + bonus - advance - deduction) * 100) / 100;
      if (netPayable < 0) return bad("Advance and deductions cannot exceed the earned amount.");
      const paymentStatus = String(body.paymentStatus ?? "Unpaid") === "Paid" ? "Paid" : "Unpaid";
      await db.batch([
        db.prepare("INSERT INTO salary_records (employee_id,period,salary_type,present_days,absent_days,total_pieces,rate_per_piece,base_amount,overtime_amount,bonus,advance,deduction,net_payable,payment_status,paid_date,remarks,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(employee_id,period) DO UPDATE SET salary_type=excluded.salary_type,present_days=excluded.present_days,absent_days=excluded.absent_days,total_pieces=excluded.total_pieces,rate_per_piece=excluded.rate_per_piece,base_amount=excluded.base_amount,overtime_amount=excluded.overtime_amount,bonus=excluded.bonus,advance=excluded.advance,deduction=excluded.deduction,net_payable=excluded.net_payable,payment_status=excluded.payment_status,paid_date=excluded.paid_date,remarks=excluded.remarks,updated_at=excluded.updated_at")
          .bind(employeeId, period, salaryType, presentDays, absentDays, totalPieces, ratePerPiece, baseAmount, overtimeAmount, bonus, advance, deduction, netPayable, paymentStatus, paymentStatus === "Paid" ? String(body.paidDate ?? timestamp.slice(0, 10)) : null, String(body.remarks ?? ""), timestamp, timestamp),
        db.prepare("INSERT INTO audit_logs (user_id,department_id,action,new_value,quantity,remarks,created_at) VALUES (1,1,'Salary Saved',?,?,?,?)").bind(`${String(employee.employee_code)} · ${period} · ${paymentStatus}`, Math.round(netPayable), `${salaryType} salary`, timestamp),
        notify("Ayesha Khan", "Payroll", paymentStatus === "Paid" ? "success" : "warning", `${String(employee.name)} — ${period} salary ${paymentStatus.toLowerCase()}`, `${salaryType === "Theka" ? `${totalPieces.toLocaleString()} PCS @ Rs ${ratePerPiece}` : `${presentDays} days attended`} · Net payable Rs ${netPayable.toLocaleString()}.`, "Salary", timestamp),
      ]);
      return Response.json({ ok: true, message: `${period} salary saved for ${String(employee.name)}.`, state: await state() });
    }

    if (action === "pos-sale") {
      const shopId = Number(body.shopId ?? 0);
      const shop = await db.prepare("SELECT * FROM shops WHERE id=?").bind(shopId).first<Record<string, unknown>>();
      if (!shop) return bad("Shop not found.", 404);
      const customerName = String(body.customerName ?? "").trim();
      const customerPhone = String(body.customerPhone ?? "").trim();
      if (!customerName) return bad("Customer Name is required on every invoice.");
      if (!customerPhone) return bad("Customer Phone Number is required on every invoice.");
      if (!/^[\d+][\d\s-]{6,}$/.test(customerPhone)) return bad("Enter a valid customer phone number.");
      const items = Array.isArray(body.items) ? body.items as Array<{ inventoryId: number; quantity: number; rate: number }> : [];
      if (!items.length) return bad("Add at least one product to the invoice.");
      const paymentMethod = String(body.paymentMethod ?? "Cash");
      if (!["Cash", "Bank"].includes(paymentMethod)) return bad("Payment Method must be Cash or Bank.");

      // Every line is priced and stock-checked against the shop's own shelf.
      const priced: Array<{ row: Record<string, unknown>; quantity: number; rate: number; amount: number }> = [];
      for (const line of items) {
        const quantity = Number(line.quantity ?? 0);
        const rate = Number(line.rate ?? 0);
        if (!Number.isInteger(quantity) || quantity <= 0) return bad("Each product needs a quantity greater than zero.");
        if (!Number.isFinite(rate) || rate <= 0) return bad("Each product needs a rate greater than zero.");
        const row = await db.prepare("SELECT * FROM shop_inventory WHERE id=? AND shop_id=?").bind(Number(line.inventoryId ?? 0), shopId).first<Record<string, unknown>>();
        if (!row) return bad("A product on this invoice is not in this shop's stock.");
        const remaining = Number(row.received_qty ?? 0) - Number(row.sold_qty ?? 0);
        if (quantity > remaining) return bad(`Only ${remaining.toLocaleString()} PCS of ${String(row.product_name)} remain in stock.`);
        priced.push({ row, quantity, rate, amount: round2(quantity * rate) });
      }

      const subtotal = round2(priced.reduce((sum, line) => sum + line.amount, 0));
      const discount = Number(body.discount ?? 0);
      if (discount < 0 || discount > subtotal) return bad("Discount cannot be negative or greater than the subtotal.");
      const totalAmount = round2(subtotal - discount);
      const receivedAmount = Number(body.receivedAmount ?? 0);
      if (!Number.isFinite(receivedAmount) || receivedAmount < 0) return bad("Received Amount cannot be negative.");
      const changeAmount = round2(Math.max(0, receivedAmount - totalAmount));
      const balanceAmount = round2(Math.max(0, totalAmount - receivedAmount));
      const timestamp = now();
      const saleDate = String(body.saleDate ?? timestamp.slice(0, 10));
      const next = await db.prepare("SELECT COALESCE(MAX(id),0)+1 AS next FROM shop_sales").first<{ next: number }>();
      const invoiceNo = `${String(shop.invoice_prefix || "INV")}-${String(next?.next ?? 1).padStart(5, "0")}`;

      const sale = await db.prepare("INSERT INTO shop_sales (invoice_no,shop_id,customer_name,customer_phone,sale_date,subtotal,discount,total_amount,received_amount,change_amount,balance_amount,payment_method,sold_by,remarks,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id")
        .bind(invoiceNo, shopId, customerName, customerPhone, saleDate, subtotal, discount, totalAmount, receivedAmount, changeAmount, balanceAmount, paymentMethod, String(body.soldBy ?? shop.manager ?? ""), String(body.remarks ?? ""), timestamp, timestamp).first<{ id: number }>();
      if (!sale) return bad("The invoice could not be created.", 500);

      const statements = priced.flatMap((line) => [
        db.prepare("INSERT INTO shop_sale_items (sale_id,shop_id,inventory_id,product_name,quantity,rate,amount,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)")
          .bind(sale.id, shopId, line.row.id, String(line.row.product_name), line.quantity, line.rate, line.amount, timestamp, timestamp),
        db.prepare("UPDATE shop_inventory SET sold_qty=sold_qty+?,status=CASE WHEN received_qty-(sold_qty+?)<=0 THEN 'Sold Out' ELSE 'In Stock' END,updated_at=? WHERE id=?")
          .bind(line.quantity, line.quantity, timestamp, line.row.id),
      ]);
      statements.push(db.prepare("INSERT INTO audit_logs (user_id,department_id,action,new_value,quantity,remarks,created_at) VALUES (1,8,'Shop Sale',?,?,?,?)")
        .bind(`${invoiceNo} · ${String(shop.shop_code)}`, priced.reduce((sum, line) => sum + line.quantity, 0), `${customerName} · ${paymentMethod} · Rs ${totalAmount}`, timestamp));
      await db.batch(statements);
      return Response.json({ ok: true, message: `${invoiceNo} billed — Rs ${totalAmount.toLocaleString()} received by ${paymentMethod.toLowerCase()}.`, saleId: sale.id, invoiceNo, state: await state() });
    }

    if (action === "delete-sale") {
      const saleId = Number(body.saleId ?? 0);
      const sale = await db.prepare("SELECT * FROM shop_sales WHERE id=?").bind(saleId).first<Record<string, unknown>>();
      if (!sale) return bad("Invoice not found.", 404);
      const shop = await db.prepare("SELECT * FROM shops WHERE id=?").bind(sale.shop_id).first<Record<string, unknown>>();
      const lines = await db.prepare("SELECT * FROM shop_sale_items WHERE sale_id=?").bind(saleId).all<Record<string, unknown>>();
      const timestamp = now();
      const statements = lines.results.filter((line) => line.inventory_id).map((line) =>
        db.prepare("UPDATE shop_inventory SET sold_qty=MAX(0,sold_qty-?),status='In Stock',updated_at=? WHERE id=?").bind(Number(line.quantity ?? 0), timestamp, line.inventory_id));
      statements.push(
        db.prepare("DELETE FROM shop_sale_items WHERE sale_id=?").bind(saleId),
        db.prepare("DELETE FROM shop_sales WHERE id=?").bind(saleId),
        db.prepare("INSERT INTO audit_logs (user_id,department_id,action,previous_value,quantity,remarks,created_at) VALUES (1,8,'Shop Sale Deleted',?,?,?,?)").bind(JSON.stringify(sale), Math.round(Number(sale.total_amount ?? 0)), String(sale.customer_name), timestamp),
        // A shop deleting a bill is exactly the kind of change the owner must see.
        notify(String(body.actor ?? shop?.manager ?? "Shop user"), "Shops", "critical", `Invoice ${String(sale.invoice_no)} deleted at ${String(shop?.name ?? "shop")}`,
          `Rs ${Number(sale.total_amount ?? 0).toLocaleString()} sale to ${String(sale.customer_name)} was removed and the stock returned to the shelf.`, "Shops", timestamp),
      );
      await db.batch(statements);
      return Response.json({ ok: true, message: `${String(sale.invoice_no)} deleted and stock returned.`, state: await state() });
    }

    if (action === "save-shop-expense" || action === "delete-shop-expense") {
      const timestamp = now();
      const shopId = Number(body.shopId ?? 0);
      const shop = await db.prepare("SELECT * FROM shops WHERE id=?").bind(shopId).first<Record<string, unknown>>();
      if (!shop) return bad("Shop not found.", 404);
      if (action === "delete-shop-expense") {
        const expenseId = Number(body.expenseId ?? 0);
        const expense = await db.prepare("SELECT * FROM shop_expenses WHERE id=? AND shop_id=?").bind(expenseId, shopId).first<Record<string, unknown>>();
        if (!expense) return bad("Expense not found.", 404);
        await db.batch([
          db.prepare("DELETE FROM shop_expenses WHERE id=?").bind(expenseId),
          notify(String(body.actor ?? shop.manager ?? "Shop user"), "Shops", "warning", `Expense deleted at ${String(shop.name)}`, `Rs ${Number(expense.amount ?? 0).toLocaleString()} · ${String(expense.description || expense.category)} was removed.`, "Shops", timestamp),
        ]);
        return Response.json({ ok: true, message: "Expense deleted.", state: await state() });
      }
      const amount = Number(body.amount ?? 0);
      const description = String(body.description ?? "").trim();
      if (!Number.isFinite(amount) || amount <= 0) return bad("Expense Amount must be greater than zero.");
      if (!description) return bad("Expense Description is required.");
      await db.batch([
        db.prepare("INSERT INTO shop_expenses (shop_id,expense_date,category,description,amount,paid_by,payment_method,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)")
          .bind(shopId, String(body.expenseDate ?? timestamp.slice(0, 10)), String(body.category ?? "General"), description, amount, String(body.paidBy ?? shop.manager ?? ""), String(body.paymentMethod ?? "Cash"), timestamp, timestamp),
        db.prepare("INSERT INTO audit_logs (user_id,department_id,action,new_value,quantity,remarks,created_at) VALUES (1,8,'Shop Expense',?,?,?,?)").bind(`${String(shop.shop_code)} · ${description}`, Math.round(amount), String(body.category ?? "General"), timestamp),
      ]);
      return Response.json({ ok: true, message: `Rs ${amount.toLocaleString()} expense recorded.`, state: await state() });
    }

    if (action === "save-shop-attendance") {
      const shopId = Number(body.shopId ?? 0);
      const shop = await db.prepare("SELECT * FROM shops WHERE id=?").bind(shopId).first<Record<string, unknown>>();
      if (!shop) return bad("Shop not found.", 404);
      const staffName = String(body.staffName ?? "").trim();
      const attendanceDate = String(body.attendanceDate ?? "").trim();
      const status = String(body.status ?? "Present");
      if (!staffName) return bad("Staff Name is required.");
      if (!attendanceDate) return bad("Attendance Date is required.");
      if (!attendanceStatuses.includes(status)) return bad("Choose a valid attendance status.");
      const timestamp = now();
      await db.prepare("INSERT INTO shop_attendance (shop_id,staff_name,attendance_date,status,in_time,out_time,remarks,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(shop_id,staff_name,attendance_date) DO UPDATE SET status=excluded.status,in_time=excluded.in_time,out_time=excluded.out_time,remarks=excluded.remarks,updated_at=excluded.updated_at")
        .bind(shopId, staffName, attendanceDate, status, String(body.inTime ?? ""), String(body.outTime ?? ""), String(body.remarks ?? ""), timestamp, timestamp).run();
      return Response.json({ ok: true, message: `${staffName} marked ${status.toLowerCase()} for ${attendanceDate}.`, state: await state() });
    }

    if (action === "shop-day-close") {
      const shopId = Number(body.shopId ?? 0);
      const shop = await db.prepare("SELECT * FROM shops WHERE id=?").bind(shopId).first<Record<string, unknown>>();
      if (!shop) return bad("Shop not found.", 404);
      const closeDate = String(body.closeDate ?? "").trim();
      if (!closeDate) return bad("Close Date is required.");
      const countedCash = Number(body.countedCash ?? 0);
      if (!Number.isFinite(countedCash) || countedCash < 0) return bad("Counted Cash cannot be negative.");
      const [sales, expenses] = await Promise.all([
        db.prepare("SELECT COUNT(*) AS invoices, COALESCE(SUM(CASE WHEN payment_method='Cash' THEN received_amount-change_amount ELSE 0 END),0) AS cash, COALESCE(SUM(CASE WHEN payment_method='Bank' THEN total_amount ELSE 0 END),0) AS bank, COALESCE(SUM(total_amount),0) AS total FROM shop_sales WHERE shop_id=? AND sale_date=?")
          .bind(shopId, closeDate).first<{ invoices: number; cash: number; bank: number; total: number }>(),
        db.prepare("SELECT COALESCE(SUM(amount),0) AS total FROM shop_expenses WHERE shop_id=? AND expense_date=?").bind(shopId, closeDate).first<{ total: number }>(),
      ]);
      const openingCash = Number(body.openingCash ?? shop.opening_cash ?? 0);
      const cashSales = round2(Number(sales?.cash ?? 0));
      const bankSales = round2(Number(sales?.bank ?? 0));
      const expenseTotal = round2(Number(expenses?.total ?? 0));
      const expectedCash = round2(openingCash + cashSales - expenseTotal);
      const difference = round2(countedCash - expectedCash);
      const timestamp = now();
      await db.batch([
        db.prepare("INSERT INTO shop_day_close (shop_id,close_date,opening_cash,cash_sales,bank_sales,total_sales,expenses,expected_cash,counted_cash,difference,invoices,closed_by,remarks,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(shop_id,close_date) DO UPDATE SET opening_cash=excluded.opening_cash,cash_sales=excluded.cash_sales,bank_sales=excluded.bank_sales,total_sales=excluded.total_sales,expenses=excluded.expenses,expected_cash=excluded.expected_cash,counted_cash=excluded.counted_cash,difference=excluded.difference,invoices=excluded.invoices,closed_by=excluded.closed_by,remarks=excluded.remarks,updated_at=excluded.updated_at")
          .bind(shopId, closeDate, openingCash, cashSales, bankSales, round2(Number(sales?.total ?? 0)), expenseTotal, expectedCash, countedCash, difference, Number(sales?.invoices ?? 0), String(body.closedBy ?? shop.manager ?? ""), String(body.remarks ?? ""), timestamp, timestamp),
        notify(String(body.closedBy ?? shop.manager ?? "Shop user"), "Shops", Math.abs(difference) > 0.5 ? "warning" : "success", `${String(shop.name)} day closed for ${closeDate}`,
          `${Number(sales?.invoices ?? 0)} invoices · Rs ${round2(Number(sales?.total ?? 0)).toLocaleString()} sales · expected cash Rs ${expectedCash.toLocaleString()} vs counted Rs ${countedCash.toLocaleString()}${Math.abs(difference) > 0.5 ? ` · difference Rs ${difference.toLocaleString()}` : " · balanced"}.`, "Shops", timestamp),
      ]);
      return Response.json({ ok: true, message: `Day closed for ${closeDate}. ${Math.abs(difference) > 0.5 ? `Cash difference Rs ${difference.toLocaleString()}.` : "Cash balanced."}`, state: await state() });
    }

    if (action === "save-shop-inventory") {
      const shopId = Number(body.shopId ?? 0);
      const inventoryId = Number(body.inventoryId ?? 0);
      const row = await db.prepare("SELECT * FROM shop_inventory WHERE id=? AND shop_id=?").bind(inventoryId, shopId).first<Record<string, unknown>>();
      if (!row) return bad("Stock item not found.", 404);
      const shop = await db.prepare("SELECT * FROM shops WHERE id=?").bind(shopId).first<Record<string, unknown>>();
      const saleRate = Number(body.saleRate ?? 0);
      if (!Number.isFinite(saleRate) || saleRate <= 0) return bad("Sale Rate must be greater than zero.");
      const timestamp = now();
      await db.batch([
        db.prepare("UPDATE shop_inventory SET sale_rate=?,product_name=?,updated_at=? WHERE id=?").bind(saleRate, String(body.productName ?? row.product_name), timestamp, inventoryId),
        notify(String(body.actor ?? shop?.manager ?? "Shop user"), "Shops", "info", `Stock edited at ${String(shop?.name ?? "shop")}`,
          `${String(row.product_name)} rate changed from Rs ${Number(row.sale_rate ?? 0).toLocaleString()} to Rs ${saleRate.toLocaleString()}.`, "Shops", timestamp),
      ]);
      return Response.json({ ok: true, message: `${String(row.product_name)} updated.`, state: await state() });
    }

    if (action === "reset-system") {
      // Everything the business entered goes. What stays is the shell needed to
      // sign in and start again: this owner login, the company profile and the
      // fixed workflow departments.
      if (String(body.confirm ?? "") !== "RESET") return bad("Type RESET to confirm clearing the whole system.");
      const timestamp = now();
      // Strictly children before parents: audit_logs and notifications reference
      // lots, designs and users, so they have to go before those are touched.
      const wipe = [
        "shop_sale_items", "shop_sales", "shop_expenses", "shop_attendance", "shop_day_close",
        "shop_inventory", "shop_shipments", "shops",
        "piece_work_entries", "salary_advances", "salary_records", "attendance_records", "employees",
        "purchases", "suppliers",
        "audit_logs", "notifications",
        "customer_dispatches", "warehouse_inventory", "warehouse_receipts", "gatepasses",
        "department_transfers", "lot_remarks", "lot_history", "lot_size_breakdowns",
        ...Object.values(tableByDepartment),
        "lots", "designs", "customers",
      ];
      for (const table of wipe) await db.prepare(`DELETE FROM ${table}`).run();
      await db.batch([
        db.prepare("DELETE FROM users WHERE id<>?").bind(session.userId),
        db.prepare("UPDATE users SET shop_id=NULL WHERE id=?").bind(session.userId),
        db.prepare("UPDATE system_settings SET seeded=1 WHERE id=1"),
        db.prepare("INSERT INTO audit_logs (user_id,department_id,action,new_value,remarks,created_at) VALUES (?,1,'System Reset','All records cleared','Owner cleared the system to start fresh',?)").bind(session.userId, timestamp),
      ]);
      return Response.json({ ok: true, message: "System cleared. Everything is ready for fresh data.", state: await state() });
    }

    if (action === "delete-gatepass") {
      const gatepassId = Number(body.gatepassId ?? 0);
      const gatepass = await db.prepare("SELECT * FROM gatepasses WHERE id=?").bind(gatepassId).first<Record<string, unknown>>();
      if (!gatepass) return bad("Gate pass not found.", 404);
      // A released gate pass created a warehouse receipt; removing it would leave stock unexplained.
      const receipt = await db.prepare("SELECT id, status FROM warehouse_receipts WHERE gatepass_id=?").bind(gatepassId).first<{ id: number; status: string }>();
      if (receipt && String(receipt.status) !== "Expected") return bad("This gate pass has already been received into Warehouse stock and cannot be removed.");
      const timestamp = now();
      const statements = [] as ReturnType<typeof db.prepare>[];
      if (receipt) statements.push(db.prepare("DELETE FROM warehouse_receipts WHERE id=?").bind(receipt.id));
      statements.push(
        db.prepare("DELETE FROM gatepasses WHERE id=?").bind(gatepassId),
        db.prepare("UPDATE lots SET current_department='Packing',status='Completed',updated_at=? WHERE id=? AND current_department IN ('Gatepass','Warehouse')").bind(timestamp, gatepass.lot_id),
        db.prepare("INSERT INTO audit_logs (user_id,department_id,lot_id,action,previous_value,quantity,remarks,created_at) VALUES (1,?,?,'Gate Pass Deleted',?,?,'Removed by owner',?)").bind(GATEPASS_DEPARTMENT_ID, gatepass.lot_id, String(gatepass.gatepass_no), Number(gatepass.quantity ?? 0), timestamp),
        notify("Owner", "Gatepass", "warning", `${String(gatepass.gatepass_no)} deleted`, `${Number(gatepass.quantity ?? 0).toLocaleString()} PCS gate pass removed; the lot returns to Packing.`, "Gatepass", timestamp),
      );
      await db.batch(statements);
      return Response.json({ ok: true, message: `${String(gatepass.gatepass_no)} deleted.`, state: await state() });
    }

    if (action === "delete-lot") {
      const targetId = Number(body.lotId ?? 0);
      const target = await db.prepare("SELECT l.*, d.design_no FROM lots l JOIN designs d ON d.id=l.design_id WHERE l.id=?").bind(targetId).first<Record<string, unknown>>();
      if (!target) return bad("Lot not found.", 404);
      // Anything already sold to a customer at a shop must keep its history intact.
      const sold = await db.prepare("SELECT COUNT(*) AS count FROM shop_sale_items si JOIN shop_inventory inv ON inv.id=si.inventory_id WHERE inv.lot_id=?").bind(targetId).first<{ count: number }>();
      if (Number(sold?.count ?? 0) > 0) return bad("This lot has been sold at a shop and cannot be deleted without losing sales history.");
      const timestamp = now();
      await db.batch([
        ...Object.values(tableByDepartment).map((table) => db.prepare(`DELETE FROM ${table} WHERE lot_id=?`).bind(targetId)),
        db.prepare("DELETE FROM shop_inventory WHERE lot_id=?").bind(targetId),
        db.prepare("DELETE FROM shop_shipments WHERE lot_id=?").bind(targetId),
        db.prepare("DELETE FROM customer_dispatches WHERE lot_id=?").bind(targetId),
        db.prepare("DELETE FROM warehouse_inventory WHERE lot_id=?").bind(targetId),
        db.prepare("DELETE FROM warehouse_receipts WHERE lot_id=?").bind(targetId),
        db.prepare("DELETE FROM gatepasses WHERE lot_id=?").bind(targetId),
        db.prepare("DELETE FROM department_transfers WHERE lot_id=?").bind(targetId),
        db.prepare("DELETE FROM lot_remarks WHERE lot_id=?").bind(targetId),
        db.prepare("DELETE FROM lot_history WHERE lot_id=?").bind(targetId),
        db.prepare("DELETE FROM lot_size_breakdowns WHERE lot_id=?").bind(targetId),
        // The audit trail survives the record it described.
        db.prepare("UPDATE audit_logs SET lot_id=NULL WHERE lot_id=?").bind(targetId),
        db.prepare("DELETE FROM lots WHERE id=?").bind(targetId),
        db.prepare("INSERT INTO audit_logs (user_id,department_id,action,previous_value,quantity,remarks,created_at) VALUES (1,1,'Lot Deleted',?,?,'Lot and all linked records removed by owner',?)").bind(`${String(target.lot_no)} · ${String(target.design_no)}`, Number(target.quantity ?? 0), timestamp),
        notify("Owner", "Production", "warning", `${String(target.lot_no)} deleted`, `${String(target.design_no)} · ${Number(target.quantity ?? 0).toLocaleString()} PCS removed with its transfers, gate passes, receipts and stock.`, "Lot Progress", timestamp),
      ]);
      return Response.json({ ok: true, message: `${String(target.lot_no)} and its linked records deleted.`, state: await state() });
    }

    if (action === "save-purchase" || action === "delete-purchase") {
      const timestamp = now();
      if (action === "delete-purchase") {
        const purchaseId = Number(body.purchaseId ?? 0);
        const purchase = await db.prepare("SELECT * FROM purchases WHERE id=?").bind(purchaseId).first<Record<string, unknown>>();
        if (!purchase) return bad("Purchase not found.", 404);
        await db.batch([
          db.prepare("DELETE FROM purchases WHERE id=?").bind(purchaseId),
          db.prepare("INSERT INTO audit_logs (user_id,department_id,action,previous_value,remarks,created_at) VALUES (1,1,'Purchase Deleted',?,'Purchase order removed',?)").bind(JSON.stringify(purchase), timestamp),
          notify("Ayesha Khan", "Purchase", "warning", `${String(purchase.purchase_no)} deleted`, `${String(purchase.item)} from the purchase register was removed.`, "Purchase", timestamp),
        ]);
        return Response.json({ ok: true, message: `${String(purchase.purchase_no)} deleted.`, state: await state() });
      }

      const supplierName = String(body.supplier ?? "").trim();
      const item = String(body.item ?? "").trim();
      const quantity = Number(body.quantity ?? 0);
      const rate = Number(body.rate ?? 0);
      const paidAmount = Number(body.paidAmount ?? 0);
      const purchaseDate = String(body.purchaseDate ?? "").trim();
      if (!supplierName) return bad("Supplier is required.");
      if (!item) return bad("Item is required.");
      if (!purchaseDate) return bad("Purchase Date is required.");
      if (!Number.isFinite(quantity) || quantity <= 0) return bad("Quantity must be greater than zero.");
      if (!Number.isFinite(rate) || rate <= 0) return bad("Rate must be greater than zero.");
      const totalAmount = round2(quantity * rate);
      if (paidAmount < 0 || paidAmount > totalAmount) return bad(`Paid Amount must be between 0 and ${totalAmount.toLocaleString()}.`);
      let supplier = await db.prepare("SELECT id FROM suppliers WHERE lower(name)=lower(?)").bind(supplierName).first<{ id: number }>();
      if (!supplier) supplier = await db.prepare("INSERT INTO suppliers (name,contact,address) VALUES (?,?,?) RETURNING id").bind(supplierName, String(body.supplierContact ?? ""), String(body.supplierAddress ?? "")).first<{ id: number }>();
      if (!supplier) return bad("Unable to create the supplier record.", 500);
      const balanceAmount = round2(totalAmount - paidAmount);
      const status = String(body.status ?? (balanceAmount <= 0 ? "Paid" : paidAmount > 0 ? "Partially Paid" : "Ordered"));
      const purchaseId = Number(body.purchaseId ?? 0);

      if (purchaseId) {
        const previous = await db.prepare("SELECT * FROM purchases WHERE id=?").bind(purchaseId).first<Record<string, unknown>>();
        if (!previous) return bad("Purchase not found.", 404);
        await db.batch([
          db.prepare("UPDATE purchases SET supplier_id=?,purchase_date=?,item=?,category=?,quantity=?,unit=?,rate=?,total_amount=?,paid_amount=?,balance_amount=?,payment_method=?,status=?,invoice_no=?,received_date=?,remarks=?,updated_at=? WHERE id=?")
            .bind(supplier.id, purchaseDate, item, String(body.category ?? "Fabric"), quantity, String(body.unit ?? "Meters"), rate, totalAmount, paidAmount, balanceAmount, String(body.paymentMethod ?? "Cash"), status, String(body.invoiceNo ?? ""), body.receivedDate ? String(body.receivedDate) : null, String(body.remarks ?? ""), timestamp, purchaseId),
          db.prepare("INSERT INTO audit_logs (user_id,department_id,action,previous_value,new_value,quantity,remarks,created_at) VALUES (1,1,'Purchase Updated',?,?,?,?,?)").bind(JSON.stringify(previous), `${item} · ${status}`, Math.round(quantity), String(body.remarks ?? ""), timestamp),
        ]);
        return Response.json({ ok: true, message: `${String(previous.purchase_no)} updated.`, state: await state() });
      }

      const next = await db.prepare("SELECT COALESCE(MAX(id),0)+1 AS next FROM purchases").first<{ next: number }>();
      const purchaseNo = `PUR-${String(next?.next ?? 1).padStart(5, "0")}`;
      await db.batch([
        db.prepare("INSERT INTO purchases (purchase_no,supplier_id,purchase_date,item,category,quantity,unit,rate,total_amount,paid_amount,balance_amount,payment_method,status,invoice_no,received_date,remarks,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
          .bind(purchaseNo, supplier.id, purchaseDate, item, String(body.category ?? "Fabric"), quantity, String(body.unit ?? "Meters"), rate, totalAmount, paidAmount, balanceAmount, String(body.paymentMethod ?? "Cash"), status, String(body.invoiceNo ?? ""), body.receivedDate ? String(body.receivedDate) : null, String(body.remarks ?? ""), timestamp, timestamp),
        db.prepare("INSERT INTO audit_logs (user_id,department_id,action,new_value,quantity,remarks,created_at) VALUES (1,1,'Purchase Created',?,?,?,?)").bind(`${purchaseNo} · ${item}`, Math.round(quantity), `Rs ${totalAmount}`, timestamp),
        notify("Ayesha Khan", "Purchase", balanceAmount > 0 ? "warning" : "success", `${purchaseNo} raised for ${supplierName}`, `${item} · ${quantity.toLocaleString()} ${String(body.unit ?? "Meters")} × Rs ${rate} = Rs ${totalAmount.toLocaleString()}${balanceAmount > 0 ? ` · Rs ${balanceAmount.toLocaleString()} outstanding` : " · fully paid"}.`, "Purchase", timestamp),
      ]);
      return Response.json({ ok: true, message: `${purchaseNo} added to the purchase register.`, state: await state() });
    }

    if (action === "save-shop" || action === "delete-shop") {
      const timestamp = now();
      if (action === "delete-shop") {
        const shopId = Number(body.shopId ?? 0);
        const shop = await db.prepare("SELECT * FROM shops WHERE id=?").bind(shopId).first<Record<string, unknown>>();
        if (!shop) return bad("Shop not found.", 404);
        const sales = await db.prepare("SELECT COUNT(*) AS count FROM shop_sales WHERE shop_id=?").bind(shopId).first<{ count: number }>();
        if (Number(sales?.count ?? 0) > 0) return bad("This shop has recorded sales and cannot be deleted.");
        await db.batch([
          db.prepare("DELETE FROM shop_inventory WHERE shop_id=?").bind(shopId),
          db.prepare("DELETE FROM shop_shipments WHERE shop_id=?").bind(shopId),
          db.prepare("DELETE FROM shops WHERE id=?").bind(shopId),
          db.prepare("INSERT INTO audit_logs (user_id,department_id,action,previous_value,remarks,created_at) VALUES (1,1,'Shop Deleted',?,'Shop removed',?)").bind(JSON.stringify(shop), timestamp),
          notify("Ayesha Khan", "Shops", "warning", `${String(shop.name)} closed`, `${String(shop.shop_code)} was removed along with its stock records.`, "Shops", timestamp),
        ]);
        return Response.json({ ok: true, message: `${String(shop.name)} deleted.`, state: await state() });
      }

      const name = String(body.name ?? "").trim();
      const address = String(body.address ?? "").trim();
      const phone = String(body.phone ?? "").trim();
      const manager = String(body.manager ?? "").trim();
      let logoUrl = String(body.logoUrl ?? "").trim();
      const editingShopId = Number(body.shopId ?? 0);
      if (logoUrl.startsWith("/api/factory/logo") && editingShopId) {
        const current = await db.prepare("SELECT logo_url FROM shops WHERE id=?").bind(editingShopId).first<{ logo_url: string }>();
        logoUrl = String(current?.logo_url ?? "");
      }
      if (!name) return bad("Shop Name is required.");
      if (!address) return bad("Shop Address is required.");
      if (!phone) return bad("Shop Phone is required.");
      if (!manager) return bad("Shop Manager is required.");
      const uploadedLogo = /^data:image\/(png|jpeg|jpg|webp|gif|svg\+xml);base64,/i.test(logoUrl);
      if (logoUrl && !uploadedLogo && !/^(https?:\/\/|\/)/i.test(logoUrl)) return bad("Shop logo must be an uploaded image, a web address or a site path.");
      if (uploadedLogo && logoUrl.length > 560_000) return bad("That shop logo is too large. Please upload one under 400 KB.");
      const shopId = Number(body.shopId ?? 0);

      if (shopId) {
        const previous = await db.prepare("SELECT * FROM shops WHERE id=?").bind(shopId).first<Record<string, unknown>>();
        if (!previous) return bad("Shop not found.", 404);
        await db.batch([
          db.prepare("UPDATE shops SET name=?,address=?,phone=?,manager=?,logo_url=?,invoice_prefix=?,footer_note=?,opening_cash=?,status=?,updated_at=? WHERE id=?")
            .bind(name, address, phone, manager, logoUrl, String(body.invoicePrefix ?? "INV").toUpperCase(), String(body.footerNote ?? ""), Number(body.openingCash ?? 0), String(body.status ?? "Active"), timestamp, shopId),
          db.prepare("INSERT INTO audit_logs (user_id,department_id,action,previous_value,new_value,remarks,created_at) VALUES (1,1,'Shop Updated',?,?,'Shop profile updated',?)").bind(JSON.stringify(previous), name, timestamp),
        ]);
        return Response.json({ ok: true, message: `${name} updated.`, state: await state() });
      }

      const next = await db.prepare("SELECT COALESCE(MAX(id),0)+1 AS next FROM shops").first<{ next: number }>();
      const shopCode = String(body.shopCode ?? "").trim().toUpperCase() || `SHOP-${String(next?.next ?? 1).padStart(2, "0")}`;
      const duplicate = await db.prepare("SELECT id FROM shops WHERE lower(shop_code)=lower(?)").bind(shopCode).first<{ id: number }>();
      if (duplicate) return bad("A shop with this code already exists.");
      await db.batch([
        db.prepare("INSERT INTO shops (shop_code,name,address,phone,manager,logo_url,invoice_prefix,footer_note,opening_cash,opening_date,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)")
          .bind(shopCode, name, address, phone, manager, logoUrl, String(body.invoicePrefix ?? "INV").toUpperCase(), String(body.footerNote ?? "Thank you for shopping with us."), Number(body.openingCash ?? 0), String(body.openingDate ?? timestamp.slice(0, 10)), "Active", timestamp, timestamp),
        db.prepare("INSERT INTO audit_logs (user_id,department_id,action,new_value,remarks,created_at) VALUES (1,1,'Shop Created',?,'New retail shop opened',?)").bind(shopCode, timestamp),
        notify("Ayesha Khan", "Shops", "success", `${name} opened`, `${shopCode} is live with ${manager} as manager. Open it to start POS billing.`, "Shops", timestamp),
      ]);
      return Response.json({ ok: true, message: `${name} created. Open it to run its POS.`, state: await state() });
    }

    if (action === "ship-to-shop") {
      const shopId = Number(body.shopId ?? 0);
      const shop = await db.prepare("SELECT * FROM shops WHERE id=?").bind(shopId).first<Record<string, unknown>>();
      if (!shop) return bad("Choose a shop to ship to.");
      const shipLotId = Number(body.lotId ?? 0);
      const shipLot = await db.prepare("SELECT l.*, d.design_no FROM lots l JOIN designs d ON d.id=l.design_id WHERE l.id=?").bind(shipLotId).first<Record<string, unknown>>();
      if (!shipLot) return bad("Lot not found.", 404);
      const inventory = await db.prepare("SELECT * FROM warehouse_inventory WHERE lot_id=?").bind(shipLotId).first<Record<string, unknown>>();
      if (!inventory) return bad("This lot is not available in Warehouse.");
      const available = Number(inventory.available_qty ?? 0) - Number(inventory.dispatched_qty ?? 0);
      const quantity = Number(body.quantity ?? 0);
      const saleRate = Number(body.saleRate ?? 0);
      if (!Number.isInteger(quantity) || quantity <= 0) return bad("Shipment QTY must be greater than zero.");
      if (quantity > available) return bad(`Only ${available.toLocaleString()} PCS are available in Warehouse for this lot.`);
      if (!Number.isFinite(saleRate) || saleRate <= 0) return bad("Shop Sale Rate must be greater than zero.");
      const timestamp = now();
      const next = await db.prepare("SELECT COALESCE(MAX(id),0)+1 AS next FROM shop_shipments").first<{ next: number }>();
      const shipmentNo = `SHP-${String(next?.next ?? 1).padStart(5, "0")}`;
      const productName = String(body.productName ?? `${String(shipLot.design_no)} ${String(shipLot.fabrication)}`).trim();
      await db.batch([
        db.prepare("INSERT INTO shop_shipments (shipment_no,shop_id,lot_id,design_id,product_name,quantity,sale_rate,cartons,sent_date,status,remarks,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,'In Transit',?,?,?)")
          .bind(shipmentNo, shopId, shipLotId, shipLot.design_id, productName, quantity, saleRate, Number(body.cartons ?? 0), String(body.sentDate ?? timestamp.slice(0, 10)), String(body.remarks ?? ""), timestamp, timestamp),
        db.prepare("UPDATE warehouse_inventory SET dispatched_qty=dispatched_qty+?,dispatch_status='In Transit',status=?,updated_at=? WHERE lot_id=?").bind(quantity, quantity === available ? "Fully Dispatched" : "Partially Dispatched", timestamp, shipLotId),
        db.prepare("INSERT INTO lot_history (lot_id,user_id,department_id,action,quantity,remarks,created_at) VALUES (?,1,8,?,?,?,?)").bind(shipLotId, `Shipped to ${String(shop.name)}`, quantity, shipmentNo, timestamp),
        db.prepare("INSERT INTO audit_logs (user_id,department_id,lot_id,design_id,action,new_value,quantity,remarks,created_at) VALUES (1,8,?,?,'Shop Shipment',?,?,?,?)").bind(shipLotId, shipLot.design_id, `${shipmentNo} → ${String(shop.name)}`, quantity, productName, timestamp),
        notify("Warehouse", "Shops", "info", `${shipmentNo} sent to ${String(shop.name)}`, `${quantity.toLocaleString()} PCS of ${productName} left the warehouse. The shop must confirm receivable and non-receivable pieces.`, "Shops", timestamp),
      ]);
      return Response.json({ ok: true, message: `${shipmentNo} sent to ${String(shop.name)}.`, state: await state() });
    }

    if (action === "receive-shop-shipment") {
      const shipmentId = Number(body.shipmentId ?? 0);
      const shipment = await db.prepare("SELECT * FROM shop_shipments WHERE id=?").bind(shipmentId).first<Record<string, unknown>>();
      if (!shipment) return bad("Shipment not found.", 404);
      if (String(shipment.status) === "Received") return bad("This shipment has already been received.");
      const sentQty = Number(shipment.quantity ?? 0);
      const receivableQty = Number(body.receivableQty ?? sentQty);
      const nonReceivableQty = Number(body.nonReceivableQty ?? 0);
      const nonReceivableReason = String(body.nonReceivableReason ?? "").trim();
      const receivedBy = String(body.receivedBy ?? "").trim();
      if (!receivedBy) return bad("Received By is required.");
      if (![receivableQty, nonReceivableQty].every((value) => Number.isInteger(value) && value >= 0)) return bad("Receivable and non-receivable quantities cannot be negative.");
      if (receivableQty <= 0) return bad("Receivable PCS must be greater than zero.");
      if (receivableQty + nonReceivableQty !== sentQty) return bad(`Receivable plus non-receivable PCS must equal the ${sentQty.toLocaleString()} PCS sent.`);
      if (nonReceivableQty > 0 && !nonReceivableReason) return bad("A reason is required for non-receivable PCS.");
      const timestamp = now();
      const shop = await db.prepare("SELECT * FROM shops WHERE id=?").bind(shipment.shop_id).first<Record<string, unknown>>();
      const design = await db.prepare("SELECT design_no FROM designs WHERE id=?").bind(shipment.design_id).first<{ design_no: string }>();
      const sku = String(design?.design_no ?? shipment.product_name);
      await db.batch([
        db.prepare("UPDATE shop_shipments SET receivable_qty=?,non_receivable_qty=?,non_receivable_reason=?,received_by=?,received_date=?,status='Received',remarks=?,updated_at=? WHERE id=?")
          .bind(receivableQty, nonReceivableQty, nonReceivableReason, receivedBy, String(body.receivedDate ?? timestamp.slice(0, 10)), String(body.remarks ?? ""), timestamp, shipmentId),
        // Only the receivable count reaches the shop shelf.
        db.prepare("INSERT INTO shop_inventory (shop_id,lot_id,design_id,product_name,sku,received_qty,sold_qty,non_receivable_qty,sale_rate,status,created_at,updated_at) VALUES (?,?,?,?,?,?,0,?,?,'In Stock',?,?) ON CONFLICT(shop_id,sku) DO UPDATE SET received_qty=received_qty+excluded.received_qty,non_receivable_qty=non_receivable_qty+excluded.non_receivable_qty,sale_rate=excluded.sale_rate,status='In Stock',updated_at=excluded.updated_at")
          .bind(shipment.shop_id, shipment.lot_id, shipment.design_id, shipment.product_name, sku, receivableQty, nonReceivableQty, Number(shipment.sale_rate ?? 0), timestamp, timestamp),
        db.prepare("INSERT INTO audit_logs (user_id,department_id,lot_id,design_id,action,previous_value,new_value,quantity,remarks,created_at) VALUES (1,8,?,?,'Shop Shipment Received','In Transit',?,?,?,?)")
          .bind(shipment.lot_id, shipment.design_id, `Receivable ${receivableQty} / Non-receivable ${nonReceivableQty}`, receivableQty, nonReceivableReason, timestamp),
        notify(receivedBy, "Shops", nonReceivableQty > 0 ? "warning" : "success", `${String(shipment.shipment_no)} received at ${String(shop?.name ?? "shop")}`,
          `${receivableQty.toLocaleString()} receivable PCS added to shop stock${nonReceivableQty > 0 ? ` · ${nonReceivableQty.toLocaleString()} non-receivable (${nonReceivableReason})` : ""}.`, "Shops", timestamp),
      ]);
      return Response.json({ ok: true, message: `${String(shipment.shipment_no)} received. ${receivableQty.toLocaleString()} PCS added to shop stock.`, state: await state() });
    }

    if (action === "create-lot") {
      const designNo = String(body.designNo ?? "").trim().toUpperCase();
      const fabrication = String(body.fabrication ?? "").trim();
      const sizeRange = String(body.sizeRange ?? "").trim();
      const customerName = String(body.customer ?? "").trim();
      const quantity = Number(body.quantity ?? 0);
      const sizes = (Array.isArray(body.sizes) ? body.sizes as Array<{ colour?: string; size?: string; quantity: number }> : [])
        .map((item) => ({ colour: String(item.colour || "General").trim() || "General", size: String(item.size || "All").trim().toUpperCase() || "ALL", quantity: Number(item.quantity ?? 0) }))
        .filter((item) => item.quantity !== 0);
      if (!designNo) return bad("Design No. is required.");
      if (!fabrication) return bad("Fabrication is required.");
      if (!sizeRange) return bad("Size Range is required.");
      if (!customerName) return bad("Customer is required.");
      if (!Number.isInteger(quantity) || quantity <= 0) return bad("QTY must be greater than zero.");
      if (sizes.some((item) => !Number.isInteger(item.quantity) || item.quantity < 0)) return bad("Colour / size quantities must be whole numbers and cannot be negative.");
      if (sizes.length && sizes.reduce((sum, item) => sum + item.quantity, 0) !== quantity) return bad("Total colour / size quantity must equal lot quantity.");
      let customer = await db.prepare("SELECT id FROM customers WHERE lower(name)=lower(?)").bind(customerName).first<{ id: number }>();
      if (!customer) {
        const result = await db.prepare("INSERT INTO customers (name) VALUES (?) RETURNING id").bind(customerName).first<{ id: number }>();
        customer = result;
      }
      let design = await db.prepare("SELECT id FROM designs WHERE design_no=?").bind(designNo).first<{ id: number }>();
      if (!design) {
        const result = await db.prepare("INSERT INTO designs (design_no,fabrication,size_range) VALUES (?,?,?) RETURNING id").bind(designNo, fabrication, sizeRange).first<{ id: number }>();
        design = result;
      }
      if (!customer || !design) return bad("Unable to create linked customer or design.", 500);
      const next = await db.prepare("SELECT COALESCE(MAX(id),0)+1 AS next FROM lots").first<{ next: number }>();
      const lotNo = `LOT-${String(next?.next ?? 1).padStart(5, "0")}`;
      const timestamp = now();
      const lot = await db.prepare(`INSERT INTO lots (lot_no,design_id,customer_id,fabrication,quantity,size_range,order_date,required_delivery_date,priority,current_department,status,completed_qty,remarks,issue_date,user_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,'Issue Lot','Lot Issued',?,?,?,1,?,?) RETURNING id`)
        .bind(lotNo, design.id, customer.id, fabrication, quantity, sizeRange, String(body.orderDate ?? timestamp.slice(0,10)), String(body.deliveryDate ?? timestamp.slice(0,10)), String(body.priority ?? "Normal"), quantity, String(body.remarks ?? "Production approved."), timestamp.slice(0,10), timestamp, timestamp).first<{ id: number }>();
      if (!lot) return bad("Lot could not be created.", 500);
      const entries = sizes.map((item) => db.prepare("INSERT INTO lot_size_breakdowns (lot_id,colour,size,quantity) VALUES (?,?,?,?)").bind(lot.id, item.colour, item.size, item.quantity));
      entries.push(
        db.prepare("INSERT INTO lot_history (lot_id,user_id,department_id,action,quantity,remarks,created_at) VALUES (?,1,1,?,?,?,?)").bind(lot.id, `${lotNo} created`, quantity, String(body.remarks ?? "Production approved."), timestamp),
        db.prepare("INSERT INTO lot_remarks (lot_id,user_id,department_id,remark,created_at) VALUES (?,1,1,?,?)").bind(lot.id, String(body.remarks ?? "Production approved."), timestamp),
        db.prepare("INSERT INTO audit_logs (user_id,department_id,lot_id,design_id,action,new_value,quantity,remarks,created_at) VALUES (1,1,?,?, 'Lot Created',?,?,?,?)").bind(lot.id, design.id, lotNo, quantity, String(body.remarks ?? "Production approved."), timestamp)
      );
      await db.batch(entries);
      return Response.json({ ok: true, message: `${lotNo} issued successfully.`, state: await state() });
    }

    const lotId = Number(body.lotId ?? 0);
    const lot = lotId ? await db.prepare("SELECT * FROM lots WHERE id=?").bind(lotId).first<Record<string, unknown>>() : null;
    if (!lot) return bad("Lot not found.", 404);

    if (action === "add-remark") {
      const remark = String(body.remark ?? "").trim();
      const department = String(body.department ?? lot.current_department);
      if (!remark) return bad("Remarks cannot be blank.");
      const depId = departmentId(department);
      const timestamp = now();
      await db.batch([
        db.prepare("INSERT INTO lot_remarks (lot_id,user_id,department_id,remark,created_at) VALUES (?,1,?,?,?)").bind(lotId, depId, remark, timestamp),
        db.prepare("INSERT INTO lot_history (lot_id,user_id,department_id,action,quantity,remarks,created_at) VALUES (?,1,?,'Remark added',0,?,?)").bind(lotId, depId, remark, timestamp),
        db.prepare("INSERT INTO audit_logs (user_id,department_id,lot_id,design_id,action,new_value,remarks,created_at) VALUES (1,?,?,?,'Remark Added',?,?,?)").bind(depId, lotId, lot.design_id, remark, remark, timestamp),
        db.prepare("UPDATE lots SET remarks=?,updated_at=? WHERE id=?").bind(remark, timestamp, lotId),
      ]);
      return Response.json({ ok: true, message: "Remark added to the permanent history.", state: await state() });
    }

    if (action === "update-lot") {
      const fabrication = String(body.fabrication ?? "").trim();
      const sizeRange = String(body.sizeRange ?? "").trim();
      const quantity = Number(body.quantity ?? 0);
      const hasBreakdown = Array.isArray(body.sizes);
      const sizes = (Array.isArray(body.sizes) ? body.sizes as Array<{ colour?: string; size?: string; quantity: number }> : [])
        .map((item) => ({ colour: String(item.colour || "General").trim() || "General", size: String(item.size || "All").trim().toUpperCase() || "ALL", quantity: Number(item.quantity ?? 0) }))
        .filter((item) => item.quantity !== 0);
      if (!fabrication) return bad("Fabrication is required.");
      if (!sizeRange) return bad("Size Range is required.");
      if (!Number.isInteger(quantity) || quantity <= 0) return bad("QTY must be greater than zero.");
      if (sizes.some((item) => !Number.isInteger(item.quantity) || item.quantity < 0)) return bad("Colour / size quantities must be whole numbers and cannot be negative.");
      if (sizes.length && sizes.reduce((sum, item) => sum + item.quantity, 0) !== quantity) return bad("Total colour / size quantity must equal lot quantity.");
      if (quantity < Number(lot.completed_qty ?? 0)) return bad("QTY cannot be less than quantity already completed.");
      if (String(body.deliveryDate ?? "") < String(body.orderDate ?? "")) return bad("Required Delivery Date cannot be before Order Date.");
      const timestamp = now();
      const statements = [
        db.prepare("UPDATE lots SET fabrication=?,quantity=?,size_range=?,order_date=?,required_delivery_date=?,priority=?,remarks=?,updated_at=? WHERE id=?").bind(fabrication, quantity, sizeRange, body.orderDate, body.deliveryDate, body.priority, body.remarks, timestamp, lotId),
        db.prepare("INSERT INTO audit_logs (user_id,department_id,lot_id,design_id,action,previous_value,new_value,quantity,remarks,created_at) VALUES (1,1,?,?, 'Lot Updated',?,?,?,?,?)").bind(lotId, lot.design_id, JSON.stringify(lot), JSON.stringify(body), quantity, String(body.remarks ?? ""), timestamp),
      ];
      if (hasBreakdown) statements.push(
        db.prepare("DELETE FROM lot_size_breakdowns WHERE lot_id=?").bind(lotId),
        ...sizes.map((item) => db.prepare("INSERT INTO lot_size_breakdowns (lot_id,colour,size,quantity) VALUES (?,?,?,?)").bind(lotId, item.colour, item.size, item.quantity)),
      );
      await db.batch(statements);
      return Response.json({ ok: true, message: `${String(lot.lot_no)} updated.`, state: await state() });
    }

    if (action === "receive") {
      const department = String(body.department ?? "");
      const table = tableByDepartment[department];
      if (!table) return bad("This department does not use a receive record.");
      const record = await db.prepare(`SELECT * FROM ${table} WHERE lot_id=?`).bind(lotId).first<Record<string, unknown>>();
      if (!record) return bad("This lot has not been transferred to this department.");
      const timestamp = now();
      await db.batch([
        db.prepare(`UPDATE ${table} SET status='Received',start_date=COALESCE(start_date,?),updated_at=? WHERE lot_id=?`).bind(timestamp.slice(0,10), timestamp, lotId),
        db.prepare("UPDATE lots SET status='Received',updated_at=? WHERE id=?").bind(timestamp, lotId),
        db.prepare("INSERT INTO lot_history (lot_id,user_id,department_id,action,quantity,remarks,created_at) VALUES (?,1,?,?,?,'Received and counted',?)").bind(lotId, departmentId(department), `Received in ${department}`, record.received_qty, timestamp),
        db.prepare("INSERT INTO audit_logs (user_id,department_id,lot_id,design_id,action,new_value,quantity,remarks,created_at) VALUES (1,?,?,?,'Department Received','Received',?,'Received and counted',?)").bind(departmentId(department), lotId, lot.design_id, record.received_qty, timestamp),
      ]);
      return Response.json({ ok: true, message: `${String(lot.lot_no)} received in ${department}.`, state: await state() });
    }

    if (action === "update-production") {
      const department = String(body.department ?? "");
      const table = tableByDepartment[department];
      if (!table) return bad("Invalid production department.");
      const record = await db.prepare(`SELECT * FROM ${table} WHERE lot_id=?`).bind(lotId).first<Record<string, unknown>>();
      if (!record) return bad("This lot has not been received by this department.");
      const completed = Number(body.completedQty ?? 0);
      const rejected = Number(body.rejectedQty ?? 0);
      const rework = Number(body.reworkQty ?? 0);
      const received = Number(record.received_qty ?? 0);
      if (![completed, rejected, rework].every((value) => Number.isInteger(value) && value >= 0)) return bad("Incorrect Quantity — quantities cannot be negative.");
      if (completed > received) return bad("Completed QTY cannot exceed Received QTY.");
      if (completed + rejected > received) return bad("Completed plus Rejected QTY cannot exceed Received QTY.");
      const status = String(body.status ?? (completed === received ? "Completed" : completed > 0 ? "Partially Completed" : "Received"));
      const remark = String(body.remarks ?? "").trim();
      const timestamp = now();
      const extraUpdates: string[] = [];
      const extraValues: unknown[] = [];
      if (department === "Cutting") { extraUpdates.push("cutting_qty=?", "passed_qty=?", "target_qty=?"); extraValues.push(completed + rejected, completed, Number(body.targetQty ?? received)); }
      if (department === "Stitching") { const target = Math.max(1, Number(body.targetQty ?? received)); extraUpdates.push("today_production=?", "target_qty=?", "efficiency=?", "production_line=?", "supervisor=?"); extraValues.push(Number(body.todayProduction ?? 0), target, Math.round((Number(body.todayProduction ?? 0) / target) * 1000) / 10, String(body.productionLine ?? "Line 01"), String(body.supervisor ?? "Sana")); }
      if (department === "Finishing") { extraUpdates.push("checked_qty=?", "passed_qty=?", "process=?"); extraValues.push(completed + rejected, completed, String(body.process ?? "General Quality Check")); }
      if (department === "Packing") { const perCarton = Math.max(1, Number(body.piecesPerCarton ?? 20)); extraUpdates.push("packing_qty=?", "pieces_per_carton=?", "total_cartons=?", "barcode_status=?", "tag_status=?", "polybag_status=?", "carton_status=?"); extraValues.push(completed, perCarton, Math.ceil(completed / perCarton), body.barcodeStatus ?? "Completed", body.tagStatus ?? "Completed", body.polybagStatus ?? "Completed", body.cartonStatus ?? (completed === received ? "Completed" : "In Progress")); }
      const setExtra = extraUpdates.length ? `,${extraUpdates.join(",")}` : "";
      await db.batch([
        db.prepare(`UPDATE ${table} SET completed_qty=?,rejected_qty=?,rework_qty=?,status=?,remarks=?,completion_date=?,updated_at=?${setExtra} WHERE lot_id=?`).bind(completed, rejected, rework, status, remark, completed === received ? timestamp.slice(0,10) : null, timestamp, ...extraValues, lotId),
        db.prepare("UPDATE lots SET completed_qty=?,status=?,remarks=CASE WHEN ?='' THEN remarks ELSE ? END,updated_at=? WHERE id=?").bind(completed, status, remark, remark, timestamp, lotId),
        db.prepare("INSERT INTO lot_history (lot_id,user_id,department_id,action,quantity,remarks,created_at) VALUES (?,1,?,?,?,?,?)").bind(lotId, departmentId(department), `${department} production updated`, completed, remark, timestamp),
        db.prepare("INSERT INTO audit_logs (user_id,department_id,lot_id,design_id,action,previous_value,new_value,quantity,remarks,created_at) VALUES (1,?,?,?,'Production Updated',?,?,?,?,?)").bind(departmentId(department), lotId, lot.design_id, String(record.completed_qty), String(completed), completed - Number(record.completed_qty ?? 0), remark, timestamp),
      ]);
      return Response.json({ ok: true, message: `${department} production saved.`, state: await state() });
    }

    if (action === "transfer") {
      const from = String(body.department ?? lot.current_department);
      const flowIndex = flow.indexOf(from as typeof flow[number]);
      if (flowIndex < 0 || ["Gatepass", "Warehouse", "Customer Dispatch"].includes(from)) return bad("Invalid department transfer.");
      const to = flow[flowIndex + 1];
      const fromDepartmentId = departmentId(from);
      const toDepartmentId = departmentId(to);
      const quantity = Number(body.quantity ?? 0);
      if (!Number.isInteger(quantity) || quantity <= 0) return bad("Transfer QTY must be greater than zero.");
      let completed = Number(lot.quantity);
      let transferred = 0;
      let record: Record<string, unknown> | null = null;
      if (from !== "Issue Lot") {
        const table = tableByDepartment[from];
        if (!table) return bad("Invalid transfer source.");
        record = await db.prepare(`SELECT * FROM ${table} WHERE lot_id=?`).bind(lotId).first<Record<string, unknown>>() ?? null;
        if (!record) return bad("This lot has not been received by this department.");
        completed = Number(record.completed_qty ?? 0);
        transferred = Number(record.transferred_qty ?? 0);
      } else {
        const sent = await db.prepare("SELECT COALESCE(SUM(quantity),0) AS total FROM department_transfers WHERE lot_id=? AND from_department_id=1").bind(lotId).first<{ total: number }>();
        transferred = Number(sent?.total ?? 0);
      }
      const available = completed - transferred;
      if (quantity > available) return bad("Transfer quantity cannot exceed available completed quantity.");
      const timestamp = now();
      const remark = String(body.remarks ?? `${quantity.toLocaleString()} PCS transferred to ${to}.`);
      const statements = [
        db.prepare("INSERT INTO department_transfers (lot_id,design_id,from_department_id,to_department_id,user_id,quantity,remarks,transfer_date,created_at,updated_at) VALUES (?,?,?,?,1,?,?,?,?,?)").bind(lotId, lot.design_id, fromDepartmentId, toDepartmentId, quantity, remark, timestamp, timestamp, timestamp),
        db.prepare("UPDATE lots SET current_department=?,status=?,completed_qty=0,remarks=?,updated_at=? WHERE id=?").bind(to, to === "Gatepass" ? "Gatepass Pending" : "Waiting", remark, timestamp, lotId),
        db.prepare("INSERT INTO lot_history (lot_id,user_id,department_id,action,quantity,remarks,created_at) VALUES (?,1,?,?,?,?,?)").bind(lotId, fromDepartmentId, `${quantity.toLocaleString()} PCS transferred from ${from} to ${to}`, quantity, remark, timestamp),
        db.prepare("INSERT INTO audit_logs (user_id,department_id,lot_id,design_id,action,previous_value,new_value,quantity,remarks,created_at) VALUES (1,?,?,?,'Department Transfer',?,?,?,?,?)").bind(fromDepartmentId, lotId, lot.design_id, from, to, quantity, remark, timestamp),
      ];
      if (from !== "Issue Lot" && record) statements.push(db.prepare(`UPDATE ${tableByDepartment[from]} SET transferred_qty=transferred_qty+?,status=?,updated_at=? WHERE lot_id=?`).bind(quantity, quantity === available ? "Completed" : "Partially Completed", timestamp, lotId));
      if (to === "Gatepass") {
        const cartons = Math.ceil(quantity / Math.max(1, Number(record?.pieces_per_carton ?? 20)));
        const nextGatepass = await db.prepare("SELECT COALESCE(MAX(id),0)+1 AS next FROM gatepasses").first<{ next: number }>();
        const gatepassNo = `GP-${String(nextGatepass?.next ?? 1).padStart(5, "0")}`;
        statements.push(
          db.prepare("INSERT INTO gatepasses (gatepass_no,lot_id,design_id,user_id,quantity,cartons,from_department,to_department,purpose,gatepass_date,status,remarks,created_at,updated_at) VALUES (?,?,?,1,?,?,'Packing','Warehouse','Warehouse Shipment',?,'Pending',?,?,?)").bind(gatepassNo, lotId, lot.design_id, quantity, cartons, timestamp.slice(0, 10), remark, timestamp, timestamp),
          notify("Faiza Khan", "Gatepass", "warning", `${gatepassNo} awaiting gate pass issue`, `${quantity.toLocaleString()} PCS (${cartons} cartons) of ${String(lot.lot_no)} left Packing and need a gate pass before warehouse shipment.`, "Gatepass", timestamp),
        );
      } else {
        const targetTable = tableByDepartment[to];
        statements.push(db.prepare(`INSERT INTO ${targetTable} (lot_id,design_id,department_id,user_id,received_qty,status,remarks,created_at,updated_at) VALUES (?,?,?,1,?,'Waiting',?,?,?) ON CONFLICT(lot_id) DO UPDATE SET received_qty=received_qty+excluded.received_qty,remarks=excluded.remarks,updated_at=excluded.updated_at`).bind(lotId, lot.design_id, toDepartmentId, quantity, remark, timestamp, timestamp));
      }
      await db.batch(statements);
      return Response.json({ ok: true, message: `${quantity.toLocaleString()} PCS transferred to ${to}.`, state: await state() });
    }

    if (action === "issue-gatepass" || action === "release-gatepass") {
      const gatepassId = Number(body.gatepassId ?? 0);
      const gatepass = await db.prepare("SELECT * FROM gatepasses WHERE id=? AND lot_id=?").bind(gatepassId, lotId).first<Record<string, unknown>>();
      if (!gatepass) return bad("Gate pass not found.", 404);
      if (String(gatepass.status) === "Released") return bad("This gate pass has already been released to Warehouse.");
      const timestamp = now();

      if (action === "issue-gatepass") {
        const vehicleNo = String(body.vehicleNo ?? "").trim();
        const driverName = String(body.driverName ?? "").trim();
        const issuedBy = String(body.issuedBy ?? "").trim();
        const approvedBy = String(body.approvedBy ?? "").trim();
        if (!vehicleNo) return bad("Vehicle No. is required on a gate pass.");
        if (!driverName) return bad("Driver Name is required on a gate pass.");
        if (!issuedBy) return bad("Issued By is required.");
        if (!approvedBy) return bad("Approved By is required.");
        await db.batch([
          db.prepare("UPDATE gatepasses SET vehicle_no=?,driver_name=?,driver_contact=?,issued_by=?,approved_by=?,security_check=?,purpose=?,gatepass_date=?,status='Issued',remarks=?,updated_at=? WHERE id=?")
            .bind(vehicleNo, driverName, String(body.driverContact ?? ""), issuedBy, approvedBy, String(body.securityCheck ?? "Cleared"), String(body.purpose ?? "Warehouse Shipment"), String(body.gatepassDate ?? timestamp.slice(0, 10)), String(body.remarks ?? ""), timestamp, gatepassId),
          db.prepare("UPDATE lots SET status='Gatepass Issued',updated_at=? WHERE id=?").bind(timestamp, lotId),
          db.prepare("INSERT INTO lot_history (lot_id,user_id,department_id,action,quantity,remarks,created_at) VALUES (?,1,?,?,?,?,?)").bind(lotId, GATEPASS_DEPARTMENT_ID, `${String(gatepass.gatepass_no)} issued`, gatepass.quantity, `${vehicleNo} · ${driverName}`, timestamp),
          db.prepare("INSERT INTO audit_logs (user_id,department_id,lot_id,design_id,action,previous_value,new_value,quantity,remarks,created_at) VALUES (1,?,?,?,'Gate Pass Issued','Pending','Issued',?,?,?)").bind(GATEPASS_DEPARTMENT_ID, lotId, lot.design_id, gatepass.quantity, String(gatepass.gatepass_no), timestamp),
          notify(issuedBy, "Gatepass", "info", `${String(gatepass.gatepass_no)} issued`, `${Number(gatepass.quantity).toLocaleString()} PCS of ${String(lot.lot_no)} approved by ${approvedBy} on vehicle ${vehicleNo}.`, "Gatepass", timestamp),
        ]);
        return Response.json({ ok: true, message: `${String(gatepass.gatepass_no)} issued. Release it when the vehicle leaves Packing.`, state: await state() });
      }

      if (String(gatepass.status) !== "Issued") return bad("Issue this gate pass before releasing it to Warehouse.");
      const quantity = Number(gatepass.quantity ?? 0);
      const nextReceipt = await db.prepare("SELECT COALESCE(MAX(id),0)+1 AS next FROM warehouse_receipts").first<{ next: number }>();
      const receiptNo = `WHR-${String(nextReceipt?.next ?? 1).padStart(5, "0")}`;
      await db.batch([
        db.prepare("UPDATE gatepasses SET status='Released',release_date=?,security_check='Cleared',updated_at=? WHERE id=?").bind(String(body.releaseDate ?? timestamp.slice(0, 10)), timestamp, gatepassId),
        db.prepare("INSERT INTO warehouse_receipts (receipt_no,lot_id,design_id,department_id,gatepass_id,user_id,received_qty,cartons,location,rack_no,received_by,received_date,status,remarks,created_at,updated_at) VALUES (?,?,?,7,?,1,?,?,'Receiving Bay','','',?,'Expected',?,?,?)")
          .bind(receiptNo, lotId, lot.design_id, gatepassId, quantity, Number(gatepass.cartons ?? 0), timestamp.slice(0, 10), `Released on ${String(gatepass.gatepass_no)} · vehicle ${String(gatepass.vehicle_no)}`, timestamp, timestamp),
        db.prepare("UPDATE lots SET current_department='Warehouse',status='In Transit to Warehouse',remarks=?,updated_at=? WHERE id=?").bind(`${quantity.toLocaleString()} PCS released on ${String(gatepass.gatepass_no)}.`, timestamp, lotId),
        db.prepare("INSERT INTO lot_history (lot_id,user_id,department_id,action,quantity,remarks,created_at) VALUES (?,1,?,?,?,?,?)").bind(lotId, GATEPASS_DEPARTMENT_ID, `${String(gatepass.gatepass_no)} released to Warehouse`, quantity, `Receipt ${receiptNo} created as Expected`, timestamp),
        db.prepare("INSERT INTO audit_logs (user_id,department_id,lot_id,design_id,action,previous_value,new_value,quantity,remarks,created_at) VALUES (1,?,?,?,'Gate Pass Released','Issued','Released',?,?,?)").bind(GATEPASS_DEPARTMENT_ID, lotId, lot.design_id, quantity, receiptNo, timestamp),
        notify(String(gatepass.issued_by || "Packing"), "Warehouse", "warning", `${String(lot.lot_no)} awaiting Warehouse receipt`, `${quantity.toLocaleString()} PCS arrived on ${String(gatepass.gatepass_no)}. Warehouse must confirm receivable and non-receivable pieces.`, "Warehouse", timestamp),
      ]);
      return Response.json({ ok: true, message: `${String(gatepass.gatepass_no)} released. ${receiptNo} is now expected in Warehouse.`, state: await state() });
    }

    if (action === "receive-warehouse") {
      const receiptId = Number(body.receiptId ?? 0);
      const receipt = await db.prepare("SELECT * FROM warehouse_receipts WHERE id=? AND lot_id=?").bind(receiptId, lotId).first<Record<string, unknown>>();
      if (!receipt) return bad("Warehouse receipt not found.", 404);
      if (String(receipt.status) !== "Expected") return bad("This warehouse receipt has already been received.");
      const receivedQty = Number(receipt.received_qty ?? 0);
      if (!Number.isInteger(receivedQty) || receivedQty <= 0) return bad("Warehouse receipt quantity is invalid.");
      const receivedBy = String(body.receivedBy ?? "").trim();
      const location = String(body.location ?? "").trim();
      const rackNo = String(body.rackNo ?? "").trim();
      const remarks = String(body.remarks ?? "").trim();
      const receivableQty = Number(body.receivableQty ?? receivedQty);
      const nonReceivableQty = Number(body.nonReceivableQty ?? 0);
      const nonReceivableReason = String(body.nonReceivableReason ?? "").trim();
      if (!receivedBy) return bad("Received By is required.");
      if (!location) return bad("Warehouse Location is required.");
      if (!rackNo) return bad("Rack No. is required.");
      if (![receivableQty, nonReceivableQty].every((value) => Number.isInteger(value) && value >= 0)) return bad("Receivable and non-receivable quantities cannot be negative.");
      if (receivableQty <= 0) return bad("Receivable PCS must be greater than zero.");
      if (receivableQty + nonReceivableQty !== receivedQty) return bad(`Receivable plus non-receivable PCS must equal the ${receivedQty.toLocaleString()} PCS on this gate pass.`);
      if (nonReceivableQty > 0 && !nonReceivableReason) return bad("A reason is required for non-receivable PCS.");
      const timestamp = now();
      await db.batch([
        db.prepare("UPDATE warehouse_receipts SET received_by=?,received_date=?,location=?,rack_no=?,receivable_qty=?,non_receivable_qty=?,non_receivable_reason=?,status='In Stock',remarks=?,updated_at=? WHERE id=?").bind(receivedBy, String(body.receivedDate ?? timestamp.slice(0,10)), location, rackNo, receivableQty, nonReceivableQty, nonReceivableReason, remarks, timestamp, receiptId),
        // Only the receivable count enters live stock; rejected pieces stay on the receipt for reporting.
        db.prepare("INSERT INTO warehouse_inventory (lot_id,design_id,available_qty,reserved_qty,dispatched_qty,non_receivable_qty,dispatch_status,status,updated_at) VALUES (?,?,?,0,0,?,'Active','In Stock',?) ON CONFLICT(lot_id) DO UPDATE SET available_qty=available_qty+excluded.available_qty,non_receivable_qty=non_receivable_qty+excluded.non_receivable_qty,dispatch_status='Active',status='In Stock',updated_at=excluded.updated_at").bind(lotId, lot.design_id, receivableQty, nonReceivableQty, timestamp),
        db.prepare("UPDATE lots SET status='Ready for Dispatch',completed_qty=(SELECT available_qty FROM warehouse_inventory WHERE lot_id=?),remarks=?,updated_at=? WHERE id=?").bind(lotId, `${receivableQty.toLocaleString()} receivable PCS added to Warehouse stock.`, timestamp, lotId),
        db.prepare("INSERT INTO lot_history (lot_id,user_id,department_id,action,quantity,remarks,created_at) VALUES (?,1,7,'Received in Warehouse',?,?,?)").bind(lotId, receivableQty, remarks || `${String(receipt.receipt_no)} received and counted.`, timestamp),
        db.prepare("INSERT INTO audit_logs (user_id,department_id,lot_id,design_id,action,previous_value,new_value,quantity,remarks,created_at) VALUES (1,7,?,?,'Warehouse Received','Expected',?,?,?,?)").bind(lotId, lot.design_id, `Receivable ${receivableQty} / Non-receivable ${nonReceivableQty}`, receivableQty, nonReceivableReason || remarks, timestamp),
        notify(receivedBy, "Warehouse", nonReceivableQty > 0 ? "warning" : "success", `${String(lot.lot_no)} received in Warehouse`, `${receivableQty.toLocaleString()} receivable PCS added to stock${nonReceivableQty > 0 ? ` · ${nonReceivableQty.toLocaleString()} non-receivable (${nonReceivableReason})` : ""}.`, "Warehouse", timestamp),
      ]);
      return Response.json({ ok: true, message: `${String(receipt.receipt_no)} received. ${receivableQty.toLocaleString()} PCS added to stock.`, state: await state() });
    }

    if (action === "dispatch") {
      const inventory = await db.prepare("SELECT * FROM warehouse_inventory WHERE lot_id=?").bind(lotId).first<Record<string, unknown>>();
      if (!inventory) return bad("This lot is not available in Warehouse.");
      const available = Number(inventory.available_qty ?? 0) - Number(inventory.dispatched_qty ?? 0);
      const quantity = Number(body.quantity ?? 0);
      if (!Number.isInteger(quantity) || quantity <= 0) return bad("Dispatch QTY must be greater than zero.");
      if (quantity > available) return bad("Dispatch QTY cannot be greater than Warehouse Available QTY.");
      if (!String(body.invoiceNo ?? "").trim()) return bad("Invoice No. is required.");
      if (!String(body.challanNo ?? "").trim()) return bad("Delivery Challan No. is required.");
      const timestamp = now();
      const nextDispatch = await db.prepare("SELECT COALESCE(MAX(id),0)+1 AS next FROM customer_dispatches").first<{ next: number }>();
      const dispatchNo = `DSP-${String(nextDispatch?.next ?? 1).padStart(5,"0")}`;
      const isFull = quantity === available;
      const dispatchStatus = dispatchStatuses.includes(String(body.dispatchStatus)) ? String(body.dispatchStatus) : "In Transit";
      await db.batch([
        db.prepare("INSERT INTO customer_dispatches (dispatch_no,lot_id,design_id,department_id,user_id,customer_id,dispatch_qty,carton_qty,invoice_no,challan_no,transporter,vehicle_no,driver_name,driver_contact,dispatch_date,destination,tracking_no,dispatch_status,delivery_status,remarks,created_at,updated_at) VALUES (?,?,?,8,1,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(dispatchNo, lotId, lot.design_id, lot.customer_id, quantity, Number(body.cartonQty ?? 0), body.invoiceNo, body.challanNo, body.transporter, body.vehicleNo, body.driverName, body.driverContact, String(body.dispatchDate ?? timestamp.slice(0,10)), body.destination, body.trackingNo, dispatchStatus, dispatchStatus === "Delivered" ? "Delivered" : "In Transit", body.remarks, timestamp, timestamp),
        db.prepare("UPDATE warehouse_inventory SET dispatched_qty=dispatched_qty+?,dispatch_status=?,status=?,updated_at=? WHERE lot_id=?").bind(quantity, dispatchStatus, isFull ? "Fully Dispatched" : "Partially Dispatched", timestamp, lotId),
        db.prepare("UPDATE lots SET current_department='Customer Dispatch',status=?,completed_qty=?,remarks=?,updated_at=? WHERE id=?").bind(isFull ? "Dispatched" : "Partially Dispatched", Number(inventory.dispatched_qty ?? 0) + quantity, `${quantity.toLocaleString()} PCS dispatched under ${dispatchNo}.`, timestamp, lotId),
        db.prepare("INSERT INTO lot_history (lot_id,user_id,department_id,action,quantity,remarks,created_at) VALUES (?,1,8,'Customer dispatch created',?,?,?)").bind(lotId, quantity, `${dispatchNo} — ${String(body.transporter ?? "Transport arranged")}`, timestamp),
        db.prepare("INSERT INTO audit_logs (user_id,department_id,lot_id,design_id,action,previous_value,new_value,quantity,remarks,created_at) VALUES (1,8,?,?,'Customer Dispatch',?,?,?,?,?)").bind(lotId, lot.design_id, String(available), String(available - quantity), quantity, dispatchNo, timestamp),
        notify("Dispatch Desk", "Dispatch", "info", `${dispatchNo} dispatched to ${String(body.destination ?? "customer")}`, `${quantity.toLocaleString()} PCS of ${String(lot.lot_no)} left the warehouse. Inventory status set to ${dispatchStatus}.`, "Customer Dispatch", timestamp),
      ]);
      return Response.json({ ok: true, message: `${dispatchNo} created. Warehouse balance updated.`, state: await state() });
    }

    if (action === "update-dispatch-status") {
      const status = String(body.dispatchStatus ?? "");
      if (!dispatchStatuses.includes(status)) return bad("Choose Active, In Transit, Shipped or Delivered.");
      const inventory = await db.prepare("SELECT * FROM warehouse_inventory WHERE lot_id=?").bind(lotId).first<Record<string, unknown>>();
      if (!inventory) return bad("This lot is not available in Warehouse.");
      const previous = String(inventory.dispatch_status ?? "Active");
      if (status !== "Active" && Number(inventory.dispatched_qty ?? 0) <= 0) return bad("Dispatch stock before moving it to In Transit, Shipped or Delivered.");
      const timestamp = now();
      const statements = [
        db.prepare("UPDATE warehouse_inventory SET dispatch_status=?,updated_at=? WHERE lot_id=?").bind(status, timestamp, lotId),
        db.prepare("INSERT INTO lot_history (lot_id,user_id,department_id,action,quantity,remarks,created_at) VALUES (?,1,8,?,0,?,?)").bind(lotId, `Inventory status set to ${status}`, `Changed from ${previous}`, timestamp),
        db.prepare("INSERT INTO audit_logs (user_id,department_id,lot_id,design_id,action,previous_value,new_value,quantity,remarks,created_at) VALUES (1,8,?,?,'Dispatch Status Updated',?,?,0,'Inventory dispatch status changed',?)").bind(lotId, lot.design_id, previous, status, timestamp),
        notify("Dispatch Desk", "Dispatch", status === "Delivered" ? "success" : "info", `${String(lot.lot_no)} marked ${status}`, `Inventory dispatch status moved from ${previous} to ${status}.`, "Inventory", timestamp),
      ];
      if (Number(inventory.dispatched_qty ?? 0) > 0) {
        statements.push(db.prepare("UPDATE customer_dispatches SET dispatch_status=?,delivery_status=?,updated_at=? WHERE lot_id=?").bind(status, status === "Delivered" ? "Delivered" : status === "Shipped" ? "Shipped" : "In Transit", timestamp, lotId));
      }
      await db.batch(statements);
      return Response.json({ ok: true, message: `${String(lot.lot_no)} inventory status set to ${status}.`, state: await state() });
    }

    return bad("Unsupported action.");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to save factory data.";
    // Name the column that actually clashed instead of blaming lot numbers for every
    // unique violation, which sent users hunting in the wrong place.
    const clash = /UNIQUE constraint failed:\s*([\w.]+)/i.exec(message)?.[1];
    if (clash) {
      const field: Record<string, string> = {
        "lots.lot_no": "That Lot No. already exists.",
        "users.username": "That username is already taken.",
        "users.email": "That email address is already used by another login.",
        "designs.design_no": "That Design No. already exists.",
        "shops.shop_code": "That shop code already exists.",
        "shop_sales.invoice_no": "That invoice number already exists.",
        "gatepasses.gatepass_no": "That gate pass number already exists.",
        "warehouse_receipts.receipt_no": "That receipt number already exists.",
        "purchases.purchase_no": "That purchase number already exists.",
        "employees.employee_code": "That employee code already exists.",
      };
      return bad(field[clash] ?? `A record with this ${clash.split(".").pop()?.replace(/_/g, " ")} already exists.`, 400);
    }
    return bad(message, 500);
  }
}
