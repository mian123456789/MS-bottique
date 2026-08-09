import { env } from "cloudflare:workers";

type D1 = D1Database;

const workflow = ["Design", "Fabric / Store", "Cutting", "Embroidery", "Printing", "Stitching", "Finishing", "Quality Control", "Packing", "Dispatch"];

const schema = [
  `CREATE TABLE IF NOT EXISTS departments (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, code TEXT NOT NULL UNIQUE, sequence INTEGER NOT NULL DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS roles (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, permissions TEXT NOT NULL DEFAULT '[]')`,
  `CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL, role_id INTEGER, department_id INTEGER, status TEXT NOT NULL DEFAULT 'Active', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(role_id) REFERENCES roles(id), FOREIGN KEY(department_id) REFERENCES departments(id))`,
  `CREATE TABLE IF NOT EXISTS customers (id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT NOT NULL UNIQUE, name TEXT NOT NULL, contact TEXT, email TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS designs (id INTEGER PRIMARY KEY AUTOINCREMENT, design_no TEXT NOT NULL UNIQUE, design_name TEXT NOT NULL, customer_id INTEGER, brand TEXT, category TEXT, season TEXT, fabrication TEXT NOT NULL, fabric_name TEXT, fabric_composition TEXT, gsm REAL, color TEXT, size_range TEXT, sample_quantity INTEGER DEFAULT 0, order_quantity INTEGER NOT NULL, production_quantity INTEGER NOT NULL, order_date TEXT, start_date TEXT, due_date TEXT, priority TEXT NOT NULL DEFAULT 'Medium', factory TEXT, remarks TEXT, image_url TEXT, tech_pack_url TEXT, status TEXT NOT NULL DEFAULT 'Draft', workflow TEXT NOT NULL, created_by INTEGER, updated_by INTEGER, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS production_orders (id INTEGER PRIMARY KEY AUTOINCREMENT, design_id INTEGER NOT NULL UNIQUE, current_department_id INTEGER, current_department TEXT NOT NULL, order_qty INTEGER NOT NULL, completed_qty INTEGER NOT NULL DEFAULT 0, pending_qty INTEGER NOT NULL, progress INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL, assigned_employee TEXT, supervisor TEXT, delay_days INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS inventory_items (id INTEGER PRIMARY KEY AUTOINCREMENT, item_code TEXT NOT NULL UNIQUE, item_name TEXT NOT NULL, category TEXT NOT NULL, unit TEXT NOT NULL, opening_stock REAL NOT NULL DEFAULT 0, received REAL NOT NULL DEFAULT 0, issued REAL NOT NULL DEFAULT 0, current_stock REAL NOT NULL DEFAULT 0, minimum_stock REAL NOT NULL DEFAULT 0, supplier TEXT, location TEXT, remarks TEXT, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS employees (id INTEGER PRIMARY KEY AUTOINCREMENT, employee_id TEXT NOT NULL UNIQUE, name TEXT NOT NULL, cnic TEXT, phone TEXT, department_id INTEGER, department TEXT NOT NULL, designation TEXT NOT NULL, joining_date TEXT, salary REAL DEFAULT 0, shift TEXT, status TEXT NOT NULL DEFAULT 'Active', photo_url TEXT, emergency_contact TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS notifications (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, design_id INTEGER, type TEXT NOT NULL, title TEXT NOT NULL, message TEXT NOT NULL, is_read INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS attachments (id INTEGER PRIMARY KEY AUTOINCREMENT, design_id INTEGER, file_name TEXT NOT NULL, object_key TEXT NOT NULL UNIQUE, content_type TEXT, size INTEGER, uploaded_by INTEGER, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS audit_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, design_id INTEGER, department_id INTEGER, action TEXT NOT NULL, entity TEXT NOT NULL, entity_id TEXT, old_value TEXT, new_value TEXT, ip_address TEXT, device TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS department_transfers (id INTEGER PRIMARY KEY AUTOINCREMENT, design_id INTEGER NOT NULL, production_order_id INTEGER, from_department_id INTEGER, to_department_id INTEGER, from_department TEXT NOT NULL, to_department TEXT NOT NULL, quantity INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'Completed', transferred_by INTEGER, remarks TEXT, transferred_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS department_records (id INTEGER PRIMARY KEY AUTOINCREMENT, design_id INTEGER NOT NULL, production_order_id INTEGER, department TEXT NOT NULL, received_qty INTEGER NOT NULL DEFAULT 0, target_qty INTEGER NOT NULL DEFAULT 0, completed_qty INTEGER NOT NULL DEFAULT 0, passed_qty INTEGER NOT NULL DEFAULT 0, rejected_qty INTEGER NOT NULL DEFAULT 0, rework_qty INTEGER NOT NULL DEFAULT 0, pending_qty INTEGER NOT NULL DEFAULT 0, start_date TEXT, completion_date TEXT, supervisor TEXT, operator TEXT, status TEXT NOT NULL DEFAULT 'Pending', remarks TEXT, details TEXT NOT NULL DEFAULT '{}', user_id INTEGER, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE INDEX IF NOT EXISTS idx_designs_status ON designs(status)`,
  `CREATE INDEX IF NOT EXISTS idx_production_department ON production_orders(current_department)`,
  `CREATE INDEX IF NOT EXISTS idx_audit_design ON audit_logs(design_id, created_at)`,
];

async function getActorId(db: D1) {
  const actor = await db.prepare("SELECT id FROM users WHERE email='admin@msboutique.com'").first<{ id: number }>();
  if (!actor) throw new Error("System administrator account is unavailable.");
  return actor.id;
}

async function ensureSchema(db: D1) {
  await db.batch(schema.map((statement) => db.prepare(statement)));
  await db.batch(workflow.map((name, index) => db.prepare("INSERT OR IGNORE INTO departments (name, code, sequence) VALUES (?, ?, ?)").bind(name, name.toUpperCase().replace(/[^A-Z]+/g, "_"), index + 1)));
  await db.prepare("INSERT OR IGNORE INTO roles (name, permissions) VALUES ('Super Admin', '[\"*\"]')").run();
  await db.prepare("INSERT OR IGNORE INTO users (email, name, role_id, department_id, status) VALUES ('admin@msboutique.com', 'Areeba Raza', (SELECT id FROM roles WHERE name='Super Admin'), NULL, 'Active')").run();
  const actorId = await getActorId(db);
  await db.prepare("UPDATE designs SET category=CASE WHEN category LIKE '%Eastern%' THEN 'Eastern' WHEN category LIKE '%Formal%' THEN 'Formal' ELSE 'Western' END WHERE category NOT IN ('Eastern','Western','Formal')").run();
  const result = await db.prepare("SELECT COUNT(*) AS count FROM designs").first<{ count: number }>();
  if (Number(result?.count ?? 0) > 0) return;

  await db.batch([
    db.prepare("INSERT OR IGNORE INTO customers (code, name, contact, email) VALUES ('CUS-001','Maison Avenue','Ayesha Khan','production@maisonavenue.com')"),
    db.prepare("INSERT OR IGNORE INTO customers (code, name, contact, email) VALUES ('CUS-002','Northline Outfitters','Hamza Ali','buying@northline.com')"),
    db.prepare("INSERT OR IGNORE INTO customers (code, name, contact, email) VALUES ('CUS-003','Lumière Studio','Mariam Noor','orders@lumiere.studio')"),
  ]);

  const customers = await db.prepare("SELECT id, code FROM customers ORDER BY id").all<{ id: number; code: string }>();
  const customerIds = Object.fromEntries(customers.results.map((c) => [c.code, c.id]));
  const demo = [
    ["MS-10001", "Ladies Embroidered 3 Piece Suit", "CUS-001", "MS Boutique", "Eastern", "Festive 2026", "Cotton Lawn", "Premium Lawn", "100% Cotton", 115, "Ivory / Maroon", "XS–XL", 5000, 5000, "2026-07-02", "2026-07-05", "2026-08-18", "High", "MS Factory Lahore", "Priority festive line", "In Production", "Stitching", 3250, 65, 0, "Sana Sheikh", "Adnan Qureshi"],
    ["MS-10002", "Men's Premium Polo Shirt", "CUS-002", "Northline", "Western", "Autumn 2026", "100% Cotton Pique", "Combed Pique", "100% Cotton", 220, "Navy", "S–XXL", 8000, 8000, "2026-07-10", "2026-07-14", "2026-08-28", "Medium", "MS Factory Lahore", "Contrast collar detail", "In Production", "Cutting", 2480, 31, 0, "Usman Tariq", "Rashid Malik"],
    ["MS-10003", "Ladies Printed Kurta", "CUS-003", "Lumière", "Eastern", "Resort 2026", "Viscose", "Airflow Viscose", "100% Viscose", 140, "Sage Floral", "XS–XL", 3500, 3500, "2026-06-22", "2026-06-25", "2026-08-10", "Urgent", "MS Factory Lahore", "Gold foil print placement", "QC Inspection", "Quality Control", 3020, 86, 2, "Mehwish Noor", "Sadia Riaz"],
    ["MS-10004", "Kids Tracksuit", "CUS-002", "Northline Kids", "Western", "Winter 2026", "Fleece", "Brushed Fleece", "Cotton Polyester", 280, "Teal / Sand", "2Y–12Y", 6000, 6000, "2026-06-15", "2026-06-20", "2026-08-12", "High", "MS Factory Lahore", "Assorted size ratio", "Packing", "Packing", 5580, 93, 0, "Nadia Saleem", "Bilal Ahmed"],
    ["MS-10005", "Women's Luxury Co-Ord Set", "CUS-001", "MS Atelier", "Western", "Summer 2026", "Premium Linen", "Washed Linen", "Linen Viscose", 180, "Terracotta", "XS–L", 2500, 2500, "2026-05-12", "2026-05-18", "2026-07-25", "Medium", "MS Factory Lahore", "Completed export order", "Completed", "Dispatch", 2500, 100, 0, "Farah Ahmed", "Kamran Shah"],
    ["MS-10006", "Embellished Formal Kaftan", "CUS-003", "Lumière", "Formal", "Festive 2026", "Silk Crepe", "Silk Crepe", "Viscose Silk", 125, "Midnight Blue", "S–XL", 1800, 1800, "2026-07-18", "2026-07-22", "2026-08-07", "Urgent", "MS Factory Lahore", "Hand embellishment bottleneck", "Delayed", "Embroidery", 720, 40, 3, "Amna Siddiqui", "Javed Iqbal"],
  ];
  for (const row of demo) {
    const [designNo, designName, customerCode, brand, category, season, fabrication, fabricName, composition, gsm, color, sizeRange, orderQty, productionQty, orderDate, startDate, dueDate, priority, factory, remarks, status, currentDepartment, completedQty, progress, delayDays, assigned, supervisor] = row;
    const inserted = await db.prepare(`INSERT INTO designs (design_no,design_name,customer_id,brand,category,season,fabrication,fabric_name,fabric_composition,gsm,color,size_range,order_quantity,production_quantity,order_date,start_date,due_date,priority,factory,remarks,status,workflow,created_by,updated_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id`).bind(designNo, designName, customerIds[String(customerCode)], brand, category, season, fabrication, fabricName, composition, gsm, color, sizeRange, orderQty, productionQty, orderDate, startDate, dueDate, priority, factory, remarks, status, JSON.stringify(workflow), actorId, actorId).first<{ id: number }>();
    await db.prepare(`INSERT INTO production_orders (design_id,current_department,current_department_id,order_qty,completed_qty,pending_qty,progress,status,assigned_employee,supervisor,delay_days) VALUES (?,?,(SELECT id FROM departments WHERE name=?),?,?,?,?,?,?,?,?)`).bind(inserted!.id, currentDepartment, currentDepartment, orderQty, completedQty, Number(orderQty) - Number(completedQty), progress, status, assigned, supervisor, delayDays).run();
  }

  await db.batch([
    db.prepare("INSERT INTO inventory_items (item_code,item_name,category,unit,opening_stock,received,issued,current_stock,minimum_stock,supplier,location,remarks) VALUES ('FAB-LAWN-101','Premium Cotton Lawn','Fabric','Meters',8200,4200,7950,4450,3000,'Al-Karam Textiles','Fabric Rack A-12','Reserved for MS-10001')"),
    db.prepare("INSERT INTO inventory_items (item_code,item_name,category,unit,opening_stock,received,issued,current_stock,minimum_stock,supplier,location,remarks) VALUES ('THR-POLY-040','Polyester Thread 40/2','Thread','Cones',950,200,880,270,300,'Sapphire Threads','Store B-04','Reorder required')"),
    db.prepare("INSERT INTO inventory_items (item_code,item_name,category,unit,opening_stock,received,issued,current_stock,minimum_stock,supplier,location,remarks) VALUES ('BTN-SHELL-18','Shell Button 18L','Buttons','Pieces',18000,12000,15400,14600,5000,'Apex Accessories','Bin C-22','')"),
    db.prepare("INSERT INTO inventory_items (item_code,item_name,category,unit,opening_stock,received,issued,current_stock,minimum_stock,supplier,location,remarks) VALUES ('PKG-CART-05','Export Carton 5-Ply','Cartons','Pieces',850,600,1180,270,350,'Packwell Industries','Packing Bay 2','Below minimum')"),
    db.prepare("INSERT INTO employees (employee_id,name,cnic,phone,department,designation,joining_date,salary,shift,status,emergency_contact) VALUES ('EMP-0108','Sana Sheikh','35202-8456921-4','0301-5550168','Stitching','Line Supervisor','2022-03-14',78000,'Morning','Active','0321-5509012')"),
    db.prepare("INSERT INTO employees (employee_id,name,cnic,phone,department,designation,joining_date,salary,shift,status,emergency_contact) VALUES ('EMP-0142','Rashid Malik','35202-2368194-8','0300-5550142','Cutting','Cutting Supervisor','2021-09-06',82000,'Morning','Active','0333-9011222')"),
    db.prepare("INSERT INTO employees (employee_id,name,cnic,phone,department,designation,joining_date,salary,shift,status,emergency_contact) VALUES ('EMP-0176','Mehwish Noor','35202-6730091-2','0321-5550176','Quality Control','Senior QC Inspector','2023-01-19',72000,'Morning','Active','0308-4499001')"),
    db.prepare("INSERT INTO notifications (design_id,type,title,message) VALUES (6,'danger','Production delay','MS-10006 Embroidery is delayed by 3 days.')"),
    db.prepare("INSERT INTO notifications (design_id,type,title,message) VALUES (3,'warning','QC attention','MS-10003 QC inspection requires final approval.')"),
    db.prepare("INSERT INTO notifications (design_id,type,title,message) VALUES (4,'success','Ready soon','MS-10004 packing is 93% complete.')"),
    db.prepare("INSERT INTO notifications (type,title,message) VALUES ('danger','Low stock','Polyester Thread 40/2 is below minimum stock.')"),
  ]);
  for (let i = 1; i <= 6; i++) {
    await db.prepare("INSERT INTO audit_logs (user_id,design_id,action,entity,entity_id,new_value,ip_address,device) VALUES (?,?,'CREATE','design',?,'Production order initialized','192.168.10.24','Web / Chrome')").bind(actorId, i, String(i)).run();
  }
  await db.prepare("PRAGMA optimize").run();
}

function error(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

async function getPayload(db: D1) {
  const [designs, inventory, employees, notifications, audit, transfers, departmentRecords] = await Promise.all([
    db.prepare(`SELECT d.*, c.name AS customer, p.id AS production_order_id, p.current_department, p.completed_qty, p.pending_qty, p.progress, p.status AS production_status, p.assigned_employee, p.supervisor, p.delay_days, p.updated_at AS last_updated FROM designs d LEFT JOIN customers c ON c.id=d.customer_id JOIN production_orders p ON p.design_id=d.id ORDER BY p.updated_at DESC, d.id DESC`).all(),
    db.prepare("SELECT * FROM inventory_items ORDER BY item_name").all(),
    db.prepare("SELECT * FROM employees ORDER BY name").all(),
    db.prepare("SELECT * FROM notifications ORDER BY created_at DESC LIMIT 20").all(),
    db.prepare("SELECT a.*, d.design_no FROM audit_logs a LEFT JOIN designs d ON d.id=a.design_id ORDER BY a.created_at DESC LIMIT 60").all(),
    db.prepare("SELECT t.*, d.design_no FROM department_transfers t JOIN designs d ON d.id=t.design_id ORDER BY t.transferred_at DESC LIMIT 30").all(),
    db.prepare("SELECT r.*, d.design_no FROM department_records r JOIN designs d ON d.id=r.design_id ORDER BY r.updated_at DESC LIMIT 50").all(),
  ]);
  return { designs: designs.results, inventory: inventory.results, employees: employees.results, notifications: notifications.results, audit: audit.results, transfers: transfers.results, departmentRecords: departmentRecords.results, workflow };
}

export async function GET() {
  try {
    await ensureSchema(env.DB);
    return Response.json(await getPayload(env.DB));
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Database unavailable";
    return error(`Unable to load factory data: ${message}`, 500);
  }
}

export async function POST(request: Request) {
  try {
    await ensureSchema(env.DB);
    const actorId = await getActorId(env.DB);
    const body = await request.json() as Record<string, unknown>;
    const action = String(body.action ?? "");

    if (action === "createDesign" || action === "updateDesign") {
      const values = (body.values ?? {}) as Record<string, unknown>;
      const designNo = String(values.designNo ?? "").trim().toUpperCase();
      const designName = String(values.designName ?? "").trim();
      const category = String(values.category ?? "").trim();
      const fabrication = String(values.fabrication ?? "").trim();
      const orderQty = Number(values.orderQuantity);
      const productionQty = Number(values.productionQuantity || orderQty);
      if (!designNo) return error("Error: Design No. is required.");
      if (!designName) return error("Error: Design Name is required.");
      if (!["Eastern", "Western", "Formal"].includes(category)) return error("Error: Category must be Eastern, Western or Formal.");
      if (!fabrication) return error("Error: Please select Fabrication.");
      if (!Number.isFinite(orderQty) || orderQty <= 0) return error("Error: Quantity must be greater than 0.");
      if (productionQty > orderQty || productionQty <= 0) return error("Error: Production quantity must be between 1 and order quantity.");
      if (values.startDate && values.dueDate && String(values.dueDate) < String(values.startDate)) return error("Error: Completion date cannot be before start date.");
      const existing = await env.DB.prepare("SELECT id FROM designs WHERE design_no=? AND id != ?").bind(designNo, Number(body.id ?? 0)).first();
      if (existing) return error("Error: Design No. already exists.", 409);

      let designId = Number(body.id ?? 0);
      if (action === "createDesign") {
        const customer = "MS Boutique";
        let customerRow = await env.DB.prepare("SELECT id FROM customers WHERE name=?").bind(customer).first<{ id: number }>();
        if (!customerRow) customerRow = await env.DB.prepare("INSERT INTO customers (code,name) VALUES (?,?) RETURNING id").bind(`CUS-${Date.now()}`, customer).first<{ id: number }>();
        const inserted = await env.DB.prepare(`INSERT INTO designs (design_no,design_name,customer_id,brand,category,season,fabrication,fabric_name,fabric_composition,gsm,color,size_range,sample_quantity,order_quantity,production_quantity,order_date,start_date,due_date,priority,factory,remarks,status,workflow,created_by,updated_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id`).bind(designNo,designName,customerRow!.id,values.brand ?? "MS Boutique",category,values.season ?? "2026",fabrication,values.fabricName ?? fabrication,values.fabricComposition ?? "",Number(values.gsm ?? 0),values.color ?? "",values.sizeRange ?? "",Number(values.sampleQuantity ?? 0),orderQty,productionQty,values.orderDate ?? "",values.startDate ?? "",values.dueDate ?? "",values.priority ?? "Medium",values.factory ?? "MS Factory Lahore",values.remarks ?? "",values.status ?? "Approved",JSON.stringify(values.workflow ?? workflow),actorId,actorId).first<{ id: number }>();
        designId = inserted!.id;
        await env.DB.prepare("INSERT INTO production_orders (design_id,current_department,current_department_id,order_qty,completed_qty,pending_qty,progress,status,assigned_employee,supervisor) VALUES (?,'Design',(SELECT id FROM departments WHERE name='Design'),?,0,?,5,?,'Unassigned','Unassigned')").bind(designId,orderQty,orderQty,values.status ?? "Approved").run();
      } else {
        const old = await env.DB.prepare("SELECT * FROM designs WHERE id=?").bind(designId).first();
        if (!old) return error("Error: Design record not found.", 404);
        await env.DB.prepare(`UPDATE designs SET design_no=?, design_name=?, category=?, fabrication=?, fabric_name=?, fabric_composition=?, gsm=?, color=?, size_range=?, order_quantity=?, production_quantity=?, order_date=?, start_date=?, due_date=?, priority=?, factory=?, remarks=?, status=?, updated_by=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(designNo,designName,category,fabrication,values.fabricName ?? "",values.fabricComposition ?? "",Number(values.gsm ?? 0),values.color ?? "",values.sizeRange ?? "",orderQty,productionQty,values.orderDate ?? "",values.startDate ?? "",values.dueDate ?? "",values.priority ?? "Medium",values.factory ?? "MS Factory Lahore",values.remarks ?? "",values.status ?? "Approved",actorId,designId).run();
        await env.DB.prepare("UPDATE production_orders SET order_qty=?, pending_qty=MAX(0,?-completed_qty), status=?, updated_at=CURRENT_TIMESTAMP WHERE design_id=?").bind(orderQty,orderQty,values.status ?? "Approved",designId).run();
        await env.DB.prepare("INSERT INTO audit_logs (user_id,design_id,action,entity,entity_id,old_value,new_value,ip_address,device) VALUES (?,?,'UPDATE','design',?,?,?,'192.168.10.24','Web / Chrome')").bind(actorId,designId,String(designId),JSON.stringify(old),JSON.stringify(values)).run();
      }
      if (action === "createDesign") await env.DB.prepare("INSERT INTO audit_logs (user_id,design_id,action,entity,entity_id,new_value,ip_address,device) VALUES (?,?,'CREATE','design',?,'New production order created','192.168.10.24','Web / Chrome')").bind(actorId,designId,String(designId)).run();
      return Response.json(await getPayload(env.DB), { status: action === "createDesign" ? 201 : 200 });
    }

    if (action === "createInventory") {
      const values = (body.values ?? {}) as Record<string, unknown>;
      const code = String(values.itemCode ?? "").trim().toUpperCase();
      const name = String(values.itemName ?? "").trim();
      const opening = Number(values.openingStock ?? 0), received = Number(values.received ?? 0), issued = Number(values.issued ?? 0), minimum = Number(values.minimumStock ?? 0);
      if (!code || !name || !values.category || !values.unit) return error("Error: Required field is missing.");
      if ([opening,received,issued,minimum].some((v) => v < 0 || !Number.isFinite(v))) return error("Error: Quantity cannot be negative.");
      if (issued > opening + received) return error("Error: Quantity cannot exceed available quantity.");
      if (await env.DB.prepare("SELECT id FROM inventory_items WHERE item_code=?").bind(code).first()) return error("Error: Item Code already exists.", 409);
      await env.DB.prepare("INSERT INTO inventory_items (item_code,item_name,category,unit,opening_stock,received,issued,current_stock,minimum_stock,supplier,location,remarks) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)").bind(code,name,values.category,values.unit,opening,received,issued,opening+received-issued,minimum,values.supplier ?? "",values.location ?? "",values.remarks ?? "").run();
      return Response.json(await getPayload(env.DB), { status: 201 });
    }

    if (action === "createEmployee") {
      const values = (body.values ?? {}) as Record<string, unknown>;
      const employeeId = String(values.employeeId ?? "").trim().toUpperCase();
      if (!employeeId || !values.name || !values.department || !values.designation) return error("Error: Required field is missing.");
      if (Number(values.salary ?? 0) < 0) return error("Error: Salary cannot be negative.");
      if (await env.DB.prepare("SELECT id FROM employees WHERE employee_id=?").bind(employeeId).first()) return error("Error: Employee ID already exists.", 409);
      await env.DB.prepare("INSERT INTO employees (employee_id,name,cnic,phone,department,designation,joining_date,salary,shift,status,emergency_contact) VALUES (?,?,?,?,?,?,?,?,?,?,?)").bind(employeeId,values.name,values.cnic ?? "",values.phone ?? "",values.department,values.designation,values.joiningDate ?? "",Number(values.salary ?? 0),values.shift ?? "Morning",values.status ?? "Active",values.emergencyContact ?? "").run();
      return Response.json(await getPayload(env.DB), { status: 201 });
    }

    if (action === "departmentUpdate") {
      const values = (body.values ?? {}) as Record<string, unknown>;
      const designId = Number(values.designId), received = Number(values.receivedQty), completed = Number(values.completedQty), passed = Number(values.passedQty ?? completed), rejected = Number(values.rejectedQty ?? 0), rework = Number(values.reworkQty ?? 0);
      const department = String(values.department ?? "");
      if (!designId || !department) return error("Error: Required field is missing.");
      if ([received,completed,passed,rejected,rework].some((v) => v < 0 || !Number.isFinite(v))) return error("Error: Quantity cannot be negative.");
      if (completed > received) return error("Error: Completed quantity cannot be greater than received quantity.");
      if (passed + rejected > received) return error("Error: Passed + rejected quantities cannot exceed total received quantity.");
      if (values.startDate && values.completionDate && String(values.completionDate) < String(values.startDate)) return error("Error: Completion date cannot be before start date.");
      const order = await env.DB.prepare("SELECT * FROM production_orders WHERE design_id=?").bind(designId).first<Record<string, unknown>>();
      if (!order) return error("Error: Production order not found.", 404);
      const currentIndex = workflow.indexOf(String(order.current_department));
      const updateIndex = workflow.indexOf(department);
      if (updateIndex > currentIndex + 1) return error("Error: This design has not completed the previous department.");
      if (department === "Packing" && String(values.status) === "Completed") {
        const qc = await env.DB.prepare("SELECT status, passed_qty FROM department_records WHERE design_id=? AND department='Quality Control' ORDER BY id DESC LIMIT 1").bind(designId).first<{ status: string; passed_qty: number }>();
        if (!qc || qc.status !== "Passed") return error("Error: QC must pass before packing.");
        if (completed > Number(qc.passed_qty)) return error("Error: Packing quantity cannot exceed QC passed quantity.");
      }
      if (department === "Dispatch") {
        const packing = await env.DB.prepare("SELECT completed_qty FROM department_records WHERE design_id=? AND department='Packing' ORDER BY id DESC LIMIT 1").bind(designId).first<{ completed_qty: number }>();
        if (packing && completed > Number(packing.completed_qty)) return error("Error: Dispatch quantity cannot exceed packing quantity.");
      }
      await env.DB.prepare(`INSERT INTO department_records (design_id,production_order_id,department,received_qty,target_qty,completed_qty,passed_qty,rejected_qty,rework_qty,pending_qty,start_date,completion_date,supervisor,operator,status,remarks,details,user_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(designId,order.id,department,received,Number(values.targetQty ?? received),completed,passed,rejected,rework,Math.max(0,received-completed),values.startDate ?? "",values.completionDate ?? "",values.supervisor ?? "",values.operator ?? "",values.status ?? "Running",values.remarks ?? "",JSON.stringify(values),actorId).run();
      await env.DB.prepare("UPDATE production_orders SET completed_qty=?, pending_qty=MAX(0,order_qty-?), status=?, supervisor=?, updated_at=CURRENT_TIMESTAMP WHERE design_id=?").bind(completed,completed,values.status ?? "Running",values.supervisor ?? "",designId).run();
      await env.DB.prepare("INSERT INTO audit_logs (user_id,design_id,action,entity,entity_id,new_value,ip_address,device) VALUES (?,?,'UPDATE',?,? ,?,'192.168.10.24','Web / Chrome')").bind(actorId,designId,`${department} record`,String(designId),JSON.stringify(values)).run();
      return Response.json(await getPayload(env.DB), { status: 201 });
    }

    if (action === "transfer") {
      const designId = Number(body.designId), quantity = Number(body.quantity), nextDepartment = String(body.nextDepartment ?? "");
      if (!designId || !nextDepartment || quantity <= 0 || !Number.isFinite(quantity)) return error("Error: Transfer quantity must be greater than 0.");
      const order = await env.DB.prepare("SELECT * FROM production_orders WHERE design_id=?").bind(designId).first<Record<string, unknown>>();
      if (!order) return error("Error: Production order not found.", 404);
      if (quantity > Number(order.completed_qty)) return error("Error: Departments cannot receive more quantity than completed by the previous department.");
      const currentDepartment = String(order.current_department);
      const expected = workflow[workflow.indexOf(currentDepartment) + 1];
      if (nextDepartment !== expected && nextDepartment !== "Dispatch") return error("Error: This design has not completed the previous department.");
      if (nextDepartment === "Packing") {
        const qc = await env.DB.prepare("SELECT status, passed_qty FROM department_records WHERE design_id=? AND department='Quality Control' ORDER BY id DESC LIMIT 1").bind(designId).first<{ status: string; passed_qty: number }>();
        if (!qc || qc.status !== "Passed") return error("Error: QC must pass before packing.");
        if (quantity > Number(qc.passed_qty)) return error("Error: Packing quantity cannot exceed QC passed quantity.");
      }
      const newProgress = Math.min(100, Math.max(Number(order.progress), Math.round(((workflow.indexOf(nextDepartment) + 0.25) / workflow.length) * 100)));
      await env.DB.batch([
        env.DB.prepare("INSERT INTO department_transfers (design_id,production_order_id,from_department,to_department,from_department_id,to_department_id,quantity,transferred_by,remarks) VALUES (?,?,?, ?,(SELECT id FROM departments WHERE name=?),(SELECT id FROM departments WHERE name=?),?,?,?)").bind(designId,order.id,currentDepartment,nextDepartment,currentDepartment,nextDepartment,quantity,actorId,body.remarks ?? "Authorized transfer"),
        env.DB.prepare("UPDATE production_orders SET current_department=?, current_department_id=(SELECT id FROM departments WHERE name=?), completed_qty=?, pending_qty=MAX(0,order_qty-?), progress=?, status=?, updated_at=CURRENT_TIMESTAMP WHERE design_id=?").bind(nextDepartment,nextDepartment,quantity,quantity,newProgress,nextDepartment === "Dispatch" ? "Ready for Dispatch" : "In Production",designId),
        env.DB.prepare("INSERT INTO audit_logs (user_id,design_id,action,entity,entity_id,old_value,new_value,ip_address,device) VALUES (?,?,'TRANSFER','production_order',?,?,?,'192.168.10.24','Web / Chrome')").bind(actorId,designId,String(order.id),currentDepartment,`${quantity} PCS to ${nextDepartment}`),
        env.DB.prepare("INSERT INTO notifications (design_id,type,title,message) VALUES (?,'success','Department transfer',?)").bind(designId,`${quantity.toLocaleString()} PCS transferred to ${nextDepartment}.`),
      ]);
      return Response.json(await getPayload(env.DB));
    }

    return error("Unknown action.", 404);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Unexpected error";
    if (message.includes("UNIQUE")) return error("Error: A record with this value already exists.", 409);
    if (message.includes("FOREIGN KEY")) return error("Error: A required related record is missing. Please refresh and try again.", 409);
    return error(`Unable to save: ${message}`, 500);
  }
}
