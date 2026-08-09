import { getD1 } from "@/db/runtime";

const now = () => new Date().toISOString();

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

const tableByDepartment: Record<string, string> = {
  Embroidery: "embroidery_records",
  Cutting: "cutting_records",
  Stitching: "stitching_records",
  Finishing: "finishing_records",
  Packing: "packing_records",
};

const createStatements = [
  `CREATE TABLE IF NOT EXISTS roles (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS departments (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, sequence INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, role_id INTEGER REFERENCES roles(id), department_id INTEGER REFERENCES departments(id), active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS customers (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, contact TEXT NOT NULL DEFAULT '', destination TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS designs (id INTEGER PRIMARY KEY AUTOINCREMENT, design_no TEXT NOT NULL UNIQUE, fabrication TEXT NOT NULL, size_range TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS lots (id INTEGER PRIMARY KEY AUTOINCREMENT, lot_no TEXT NOT NULL UNIQUE, design_id INTEGER NOT NULL REFERENCES designs(id), customer_id INTEGER NOT NULL REFERENCES customers(id), fabrication TEXT NOT NULL, quantity INTEGER NOT NULL CHECK(quantity > 0), size_range TEXT NOT NULL, order_date TEXT NOT NULL, required_delivery_date TEXT NOT NULL, priority TEXT NOT NULL DEFAULT 'Normal', current_department TEXT NOT NULL DEFAULT 'Issue Lot', status TEXT NOT NULL DEFAULT 'Lot Issued', completed_qty INTEGER NOT NULL DEFAULT 0, remarks TEXT NOT NULL DEFAULT '', issue_date TEXT NOT NULL, user_id INTEGER REFERENCES users(id), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS lot_size_breakdowns (id INTEGER PRIMARY KEY AUTOINCREMENT, lot_id INTEGER NOT NULL REFERENCES lots(id), size TEXT NOT NULL, quantity INTEGER NOT NULL CHECK(quantity >= 0), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS embroidery_records (id INTEGER PRIMARY KEY AUTOINCREMENT, lot_id INTEGER NOT NULL UNIQUE REFERENCES lots(id), design_id INTEGER NOT NULL REFERENCES designs(id), department_id INTEGER NOT NULL REFERENCES departments(id), user_id INTEGER REFERENCES users(id), received_qty INTEGER NOT NULL DEFAULT 0, completed_qty INTEGER NOT NULL DEFAULT 0, rejected_qty INTEGER NOT NULL DEFAULT 0, rework_qty INTEGER NOT NULL DEFAULT 0, transferred_qty INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'Waiting', remarks TEXT NOT NULL DEFAULT '', start_date TEXT, completion_date TEXT, embroidery_type TEXT NOT NULL DEFAULT 'Multi-head', pattern_no TEXT NOT NULL DEFAULT '', machine_no TEXT NOT NULL DEFAULT '', operator TEXT NOT NULL DEFAULT '', supervisor TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS cutting_records (id INTEGER PRIMARY KEY AUTOINCREMENT, lot_id INTEGER NOT NULL UNIQUE REFERENCES lots(id), design_id INTEGER NOT NULL REFERENCES designs(id), department_id INTEGER NOT NULL REFERENCES departments(id), user_id INTEGER REFERENCES users(id), received_qty INTEGER NOT NULL DEFAULT 0, completed_qty INTEGER NOT NULL DEFAULT 0, rejected_qty INTEGER NOT NULL DEFAULT 0, rework_qty INTEGER NOT NULL DEFAULT 0, transferred_qty INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'Waiting', remarks TEXT NOT NULL DEFAULT '', start_date TEXT, completion_date TEXT, target_qty INTEGER NOT NULL DEFAULT 0, cutting_qty INTEGER NOT NULL DEFAULT 0, passed_qty INTEGER NOT NULL DEFAULT 0, layer_no TEXT NOT NULL DEFAULT '', marker_no TEXT NOT NULL DEFAULT '', cutting_table TEXT NOT NULL DEFAULT '', operator TEXT NOT NULL DEFAULT '', supervisor TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS stitching_records (id INTEGER PRIMARY KEY AUTOINCREMENT, lot_id INTEGER NOT NULL UNIQUE REFERENCES lots(id), design_id INTEGER NOT NULL REFERENCES designs(id), department_id INTEGER NOT NULL REFERENCES departments(id), user_id INTEGER REFERENCES users(id), received_qty INTEGER NOT NULL DEFAULT 0, completed_qty INTEGER NOT NULL DEFAULT 0, rejected_qty INTEGER NOT NULL DEFAULT 0, rework_qty INTEGER NOT NULL DEFAULT 0, transferred_qty INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'Waiting', remarks TEXT NOT NULL DEFAULT '', start_date TEXT, completion_date TEXT, production_line TEXT NOT NULL DEFAULT '', supervisor TEXT NOT NULL DEFAULT '', target_qty INTEGER NOT NULL DEFAULT 0, today_production INTEGER NOT NULL DEFAULT 0, efficiency REAL NOT NULL DEFAULT 0, expected_completion_date TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS finishing_records (id INTEGER PRIMARY KEY AUTOINCREMENT, lot_id INTEGER NOT NULL UNIQUE REFERENCES lots(id), design_id INTEGER NOT NULL REFERENCES designs(id), department_id INTEGER NOT NULL REFERENCES departments(id), user_id INTEGER REFERENCES users(id), received_qty INTEGER NOT NULL DEFAULT 0, completed_qty INTEGER NOT NULL DEFAULT 0, rejected_qty INTEGER NOT NULL DEFAULT 0, rework_qty INTEGER NOT NULL DEFAULT 0, transferred_qty INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'Waiting', remarks TEXT NOT NULL DEFAULT '', start_date TEXT, completion_date TEXT, process TEXT NOT NULL DEFAULT 'General Quality Check', checked_qty INTEGER NOT NULL DEFAULT 0, passed_qty INTEGER NOT NULL DEFAULT 0, supervisor TEXT NOT NULL DEFAULT '', received_date TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS packing_records (id INTEGER PRIMARY KEY AUTOINCREMENT, lot_id INTEGER NOT NULL UNIQUE REFERENCES lots(id), design_id INTEGER NOT NULL REFERENCES designs(id), department_id INTEGER NOT NULL REFERENCES departments(id), user_id INTEGER REFERENCES users(id), received_qty INTEGER NOT NULL DEFAULT 0, completed_qty INTEGER NOT NULL DEFAULT 0, rejected_qty INTEGER NOT NULL DEFAULT 0, rework_qty INTEGER NOT NULL DEFAULT 0, transferred_qty INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'Waiting', remarks TEXT NOT NULL DEFAULT '', start_date TEXT, completion_date TEXT, packing_qty INTEGER NOT NULL DEFAULT 0, pieces_per_carton INTEGER NOT NULL DEFAULT 20, total_cartons INTEGER NOT NULL DEFAULT 0, barcode_status TEXT NOT NULL DEFAULT 'Pending', tag_status TEXT NOT NULL DEFAULT 'Pending', polybag_status TEXT NOT NULL DEFAULT 'Pending', carton_status TEXT NOT NULL DEFAULT 'Pending', supervisor TEXT NOT NULL DEFAULT '', packing_date TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS warehouse_receipts (id INTEGER PRIMARY KEY AUTOINCREMENT, receipt_no TEXT NOT NULL UNIQUE, lot_id INTEGER NOT NULL REFERENCES lots(id), design_id INTEGER NOT NULL REFERENCES designs(id), department_id INTEGER NOT NULL REFERENCES departments(id), user_id INTEGER REFERENCES users(id), received_qty INTEGER NOT NULL, cartons INTEGER NOT NULL DEFAULT 0, location TEXT NOT NULL DEFAULT 'Finished Goods', rack_no TEXT NOT NULL DEFAULT '', received_by TEXT NOT NULL DEFAULT '', received_date TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'Received', remarks TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS warehouse_inventory (id INTEGER PRIMARY KEY AUTOINCREMENT, lot_id INTEGER NOT NULL UNIQUE REFERENCES lots(id), design_id INTEGER NOT NULL REFERENCES designs(id), available_qty INTEGER NOT NULL DEFAULT 0, reserved_qty INTEGER NOT NULL DEFAULT 0, dispatched_qty INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'In Stock', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS customer_dispatches (id INTEGER PRIMARY KEY AUTOINCREMENT, dispatch_no TEXT NOT NULL UNIQUE, lot_id INTEGER NOT NULL REFERENCES lots(id), design_id INTEGER NOT NULL REFERENCES designs(id), department_id INTEGER NOT NULL REFERENCES departments(id), user_id INTEGER REFERENCES users(id), customer_id INTEGER NOT NULL REFERENCES customers(id), dispatch_qty INTEGER NOT NULL, carton_qty INTEGER NOT NULL DEFAULT 0, invoice_no TEXT NOT NULL, challan_no TEXT NOT NULL, transporter TEXT NOT NULL DEFAULT '', vehicle_no TEXT NOT NULL DEFAULT '', driver_name TEXT NOT NULL DEFAULT '', driver_contact TEXT NOT NULL DEFAULT '', dispatch_date TEXT NOT NULL, destination TEXT NOT NULL DEFAULT '', tracking_no TEXT NOT NULL DEFAULT '', dispatch_status TEXT NOT NULL DEFAULT 'Dispatched', delivery_status TEXT NOT NULL DEFAULT 'In Transit', remarks TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS department_transfers (id INTEGER PRIMARY KEY AUTOINCREMENT, lot_id INTEGER NOT NULL REFERENCES lots(id), design_id INTEGER NOT NULL REFERENCES designs(id), from_department_id INTEGER NOT NULL REFERENCES departments(id), to_department_id INTEGER NOT NULL REFERENCES departments(id), user_id INTEGER REFERENCES users(id), quantity INTEGER NOT NULL CHECK(quantity > 0), remarks TEXT NOT NULL DEFAULT '', transfer_date TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS lot_remarks (id INTEGER PRIMARY KEY AUTOINCREMENT, lot_id INTEGER NOT NULL REFERENCES lots(id), user_id INTEGER REFERENCES users(id), department_id INTEGER REFERENCES departments(id), remark TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS lot_history (id INTEGER PRIMARY KEY AUTOINCREMENT, lot_id INTEGER NOT NULL REFERENCES lots(id), user_id INTEGER REFERENCES users(id), department_id INTEGER REFERENCES departments(id), action TEXT NOT NULL, quantity INTEGER NOT NULL DEFAULT 0, remarks TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS notifications (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER REFERENCES users(id), title TEXT NOT NULL, message TEXT NOT NULL, read INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS audit_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER REFERENCES users(id), department_id INTEGER REFERENCES departments(id), lot_id INTEGER REFERENCES lots(id), design_id INTEGER REFERENCES designs(id), action TEXT NOT NULL, previous_value TEXT NOT NULL DEFAULT '', new_value TEXT NOT NULL DEFAULT '', quantity INTEGER NOT NULL DEFAULT 0, remarks TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE INDEX IF NOT EXISTS idx_lots_department_status ON lots(current_department, status)`,
  `CREATE INDEX IF NOT EXISTS idx_lots_design_id ON lots(design_id)`,
  `CREATE INDEX IF NOT EXISTS idx_transfers_lot_id ON department_transfers(lot_id)`,
  `CREATE INDEX IF NOT EXISTS idx_history_lot_id ON lot_history(lot_id)`,
  `CREATE INDEX IF NOT EXISTS idx_audit_lot_id ON audit_logs(lot_id)`,
];

async function ensureDatabase() {
  const db = getD1();
  await db.batch(createStatements.map((statement) => db.prepare(statement)));
  const count = await db.prepare("SELECT COUNT(*) AS count FROM lots").first<{ count: number }>();
  if ((count?.count ?? 0) > 0) return;

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
    db.prepare("INSERT INTO warehouse_receipts (receipt_no,lot_id,design_id,department_id,user_id,received_qty,cartons,location,rack_no,received_by,received_date,status,remarks) VALUES ('WHR-00001',5,5,7,1,4000,200,'Finished Goods - A','A-14','Usman','2026-08-03','In Stock','Count verified')"),
    db.prepare("INSERT INTO warehouse_inventory (lot_id,design_id,available_qty,reserved_qty,dispatched_qty,status) VALUES (5,5,4000,0,0,'In Stock')"),
    db.prepare("INSERT INTO department_transfers (lot_id,design_id,from_department_id,to_department_id,user_id,quantity,remarks,transfer_date) VALUES (1,1,1,2,1,5000,'Lot issued to Embroidery','2026-07-20T09:15:00Z'),(1,1,2,3,1,5000,'Embroidery cleared','2026-07-25T13:00:00Z'),(1,1,3,4,1,5000,'Cut panels transferred','2026-08-01T09:00:00Z'),(3,3,1,2,1,2500,'Lot issued','2026-07-27T09:00:00Z'),(3,3,2,3,1,2500,'Embroidery cleared','2026-08-08T09:30:00Z'),(4,4,1,2,1,1500,'Lot issued','2026-07-12T09:00:00Z'),(4,4,2,3,1,1500,'Embroidery cleared','2026-07-18T10:00:00Z'),(4,4,3,4,1,1500,'Cutting cleared','2026-07-21T09:00:00Z'),(4,4,4,5,1,1500,'Stitching cleared','2026-07-28T09:00:00Z'),(4,4,5,6,1,1500,'Finishing cleared','2026-08-07T09:00:00Z'),(5,5,1,2,1,4000,'Lot issued','2026-07-02T09:00:00Z'),(5,5,2,3,1,4000,'Embroidery cleared','2026-07-09T09:00:00Z'),(5,5,3,4,1,4000,'Cutting cleared','2026-07-12T09:00:00Z'),(5,5,4,5,1,4000,'Stitching cleared','2026-07-22T09:00:00Z'),(5,5,5,6,1,4000,'Finishing cleared','2026-07-29T09:00:00Z'),(5,5,6,7,1,4000,'Packed stock received','2026-08-03T10:00:00Z')"),
    db.prepare("INSERT INTO lot_remarks (lot_id,user_id,department_id,remark,created_at) VALUES (1,1,4,'3,500 PCS completed.','2026-08-09T11:30:00Z'),(2,1,2,'Embroidery production in progress.','2026-08-09T10:45:00Z'),(5,1,7,'Warehouse count verified; ready for dispatch.','2026-08-09T09:20:00Z')"),
    db.prepare("INSERT INTO lot_history (lot_id,user_id,department_id,action,quantity,remarks,created_at) VALUES (1,1,1,'LOT-00001 created',5000,'Production approved','2026-07-20T09:00:00Z'),(1,1,2,'Lot issued to Embroidery',5000,'Received by Ali','2026-07-20T09:15:00Z'),(1,1,3,'Transferred to Cutting',5000,'Embroidery cleared','2026-07-25T13:00:00Z'),(1,1,4,'Stitching production updated',3500,'3,500 PCS completed.','2026-08-09T11:30:00Z'),(2,1,2,'Embroidery production updated',1200,'Production in progress','2026-08-09T10:45:00Z'),(5,1,7,'Received in Warehouse',4000,'Count verified','2026-08-03T10:00:00Z')"),
    db.prepare("INSERT INTO audit_logs (user_id,department_id,lot_id,design_id,action,previous_value,new_value,quantity,remarks,created_at) VALUES (1,1,1,1,'Lot Created','','LOT-00001',5000,'Production approved','2026-07-20T09:00:00Z'),(1,4,1,1,'Production Updated','3050','3500',450,'Daily stitching output','2026-08-09T11:30:00Z'),(1,7,5,5,'Warehouse Received','0','4000',4000,'Count verified','2026-08-03T10:00:00Z')"),
    db.prepare("INSERT INTO notifications (user_id,title,message,created_at) VALUES (1,'LOT-00005 ready for dispatch','4,000 PCS are available in Warehouse.','2026-08-09T09:20:00Z'),(1,'Delivery due soon','LOT-00004 is due on 12 Aug 2026.','2026-08-09T08:00:00Z')"),
  ];
  await db.batch(detailSeed);
  await db.prepare("PRAGMA optimize").run();
}

async function getState() {
  const db = getD1();
  const [lots, sizes, embroidery, cutting, stitching, finishing, packing, warehouse, receipts, dispatches, transfers, remarks, history, audits, customers, designs, notifications] = await Promise.all([
    db.prepare(`SELECT l.*, d.design_no, c.name AS customer, c.destination FROM lots l JOIN designs d ON d.id=l.design_id JOIN customers c ON c.id=l.customer_id ORDER BY l.id DESC`).all(),
    db.prepare("SELECT * FROM lot_size_breakdowns ORDER BY id").all(),
    db.prepare("SELECT * FROM embroidery_records ORDER BY id DESC").all(),
    db.prepare("SELECT * FROM cutting_records ORDER BY id DESC").all(),
    db.prepare("SELECT * FROM stitching_records ORDER BY id DESC").all(),
    db.prepare("SELECT * FROM finishing_records ORDER BY id DESC").all(),
    db.prepare("SELECT * FROM packing_records ORDER BY id DESC").all(),
    db.prepare(`SELECT wi.*, l.lot_no, l.fabrication, l.size_range, d.design_no, c.name AS customer, (wi.available_qty-wi.dispatched_qty) AS balance_qty FROM warehouse_inventory wi JOIN lots l ON l.id=wi.lot_id JOIN designs d ON d.id=wi.design_id JOIN customers c ON c.id=l.customer_id ORDER BY wi.id DESC`).all(),
    db.prepare("SELECT * FROM warehouse_receipts ORDER BY id DESC").all(),
    db.prepare(`SELECT cd.*, l.lot_no, l.fabrication, l.size_range, d.design_no, c.name AS customer FROM customer_dispatches cd JOIN lots l ON l.id=cd.lot_id JOIN designs d ON d.id=cd.design_id JOIN customers c ON c.id=cd.customer_id ORDER BY cd.id DESC`).all(),
    db.prepare(`SELECT t.*, fd.name AS from_department, td.name AS to_department, u.name AS user_name FROM department_transfers t JOIN departments fd ON fd.id=t.from_department_id JOIN departments td ON td.id=t.to_department_id LEFT JOIN users u ON u.id=t.user_id ORDER BY t.id DESC`).all(),
    db.prepare(`SELECT r.*, u.name AS user_name, d.name AS department FROM lot_remarks r LEFT JOIN users u ON u.id=r.user_id LEFT JOIN departments d ON d.id=r.department_id ORDER BY r.id DESC`).all(),
    db.prepare(`SELECT h.*, u.name AS user_name, d.name AS department FROM lot_history h LEFT JOIN users u ON u.id=h.user_id LEFT JOIN departments d ON d.id=h.department_id ORDER BY h.id DESC`).all(),
    db.prepare(`SELECT a.*, u.name AS user_name, dep.name AS department, l.lot_no, d.design_no FROM audit_logs a LEFT JOIN users u ON u.id=a.user_id LEFT JOIN departments dep ON dep.id=a.department_id LEFT JOIN lots l ON l.id=a.lot_id LEFT JOIN designs d ON d.id=a.design_id ORDER BY a.id DESC LIMIT 250`).all(),
    db.prepare("SELECT * FROM customers ORDER BY name").all(),
    db.prepare("SELECT * FROM designs ORDER BY design_no").all(),
    db.prepare("SELECT * FROM notifications ORDER BY id DESC").all(),
  ]);
  return {
    lots: lots.results, sizes: sizes.results,
    records: { Embroidery: embroidery.results, Cutting: cutting.results, Stitching: stitching.results, Finishing: finishing.results, Packing: packing.results },
    warehouse: warehouse.results, receipts: receipts.results, dispatches: dispatches.results,
    transfers: transfers.results, remarks: remarks.results, history: history.results, audits: audits.results,
    customers: customers.results, designs: designs.results, notifications: notifications.results,
  };
}

function bad(error: string, status = 400) {
  return Response.json({ error }, { status });
}

export async function GET() {
  try {
    await ensureDatabase();
    return Response.json(await getState());
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

    if (action === "create-lot") {
      const designNo = String(body.designNo ?? "").trim().toUpperCase();
      const fabrication = String(body.fabrication ?? "").trim();
      const sizeRange = String(body.sizeRange ?? "").trim();
      const customerName = String(body.customer ?? "").trim();
      const quantity = Number(body.quantity ?? 0);
      const sizes = Array.isArray(body.sizes) ? body.sizes as Array<{ size: string; quantity: number }> : [];
      if (!designNo) return bad("Design No. is required.");
      if (!fabrication) return bad("Fabrication is required.");
      if (!sizeRange) return bad("Size Range is required.");
      if (!customerName) return bad("Customer is required.");
      if (!Number.isInteger(quantity) || quantity <= 0) return bad("QTY must be greater than zero.");
      if (sizes.length && sizes.reduce((sum, item) => sum + Number(item.quantity || 0), 0) !== quantity) return bad("Total size quantity must equal lot quantity.");
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
      const entries = sizes.filter((item) => item.size && Number(item.quantity) >= 0).map((item) => db.prepare("INSERT INTO lot_size_breakdowns (lot_id,size,quantity) VALUES (?,?,?)").bind(lot.id, item.size, Number(item.quantity)));
      entries.push(
        db.prepare("INSERT INTO lot_history (lot_id,user_id,department_id,action,quantity,remarks,created_at) VALUES (?,1,1,?,?,?,?)").bind(lot.id, `${lotNo} created`, quantity, String(body.remarks ?? "Production approved."), timestamp),
        db.prepare("INSERT INTO lot_remarks (lot_id,user_id,department_id,remark,created_at) VALUES (?,1,1,?,?)").bind(lot.id, String(body.remarks ?? "Production approved."), timestamp),
        db.prepare("INSERT INTO audit_logs (user_id,department_id,lot_id,design_id,action,new_value,quantity,remarks,created_at) VALUES (1,1,?,?, 'Lot Created',?,?,?,?)").bind(lot.id, design.id, lotNo, quantity, String(body.remarks ?? "Production approved."), timestamp)
      );
      await db.batch(entries);
      return Response.json({ ok: true, message: `${lotNo} issued successfully.`, state: await getState() });
    }

    const lotId = Number(body.lotId ?? 0);
    const lot = lotId ? await db.prepare("SELECT * FROM lots WHERE id=?").bind(lotId).first<Record<string, unknown>>() : null;
    if (!lot) return bad("Lot not found.", 404);

    if (action === "add-remark") {
      const remark = String(body.remark ?? "").trim();
      const department = String(body.department ?? lot.current_department);
      if (!remark) return bad("Remarks cannot be blank.");
      const depId = Math.max(1, workflow.indexOf(department as typeof workflow[number]) + 1);
      const timestamp = now();
      await db.batch([
        db.prepare("INSERT INTO lot_remarks (lot_id,user_id,department_id,remark,created_at) VALUES (?,1,?,?,?)").bind(lotId, depId, remark, timestamp),
        db.prepare("INSERT INTO lot_history (lot_id,user_id,department_id,action,quantity,remarks,created_at) VALUES (?,1,?,'Remark added',0,?,?)").bind(lotId, depId, remark, timestamp),
        db.prepare("INSERT INTO audit_logs (user_id,department_id,lot_id,design_id,action,new_value,remarks,created_at) VALUES (1,?,?,?,'Remark Added',?,?,?)").bind(depId, lotId, lot.design_id, remark, remark, timestamp),
        db.prepare("UPDATE lots SET remarks=?,updated_at=? WHERE id=?").bind(remark, timestamp, lotId),
      ]);
      return Response.json({ ok: true, message: "Remark added to the permanent history.", state: await getState() });
    }

    if (action === "update-lot") {
      const fabrication = String(body.fabrication ?? "").trim();
      const sizeRange = String(body.sizeRange ?? "").trim();
      const quantity = Number(body.quantity ?? 0);
      if (!fabrication) return bad("Fabrication is required.");
      if (!sizeRange) return bad("Size Range is required.");
      if (!Number.isInteger(quantity) || quantity <= 0) return bad("QTY must be greater than zero.");
      if (quantity < Number(lot.completed_qty ?? 0)) return bad("QTY cannot be less than quantity already completed.");
      if (String(body.deliveryDate ?? "") < String(body.orderDate ?? "")) return bad("Required Delivery Date cannot be before Order Date.");
      const timestamp = now();
      await db.batch([
        db.prepare("UPDATE lots SET fabrication=?,quantity=?,size_range=?,order_date=?,required_delivery_date=?,priority=?,remarks=?,updated_at=? WHERE id=?").bind(fabrication, quantity, sizeRange, body.orderDate, body.deliveryDate, body.priority, body.remarks, timestamp, lotId),
        db.prepare("INSERT INTO audit_logs (user_id,department_id,lot_id,design_id,action,previous_value,new_value,quantity,remarks,created_at) VALUES (1,1,?,?, 'Lot Updated',?,?,?,?,?)").bind(lotId, lot.design_id, JSON.stringify(lot), JSON.stringify(body), quantity, String(body.remarks ?? ""), timestamp),
      ]);
      return Response.json({ ok: true, message: `${String(lot.lot_no)} updated.`, state: await getState() });
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
        db.prepare("INSERT INTO lot_history (lot_id,user_id,department_id,action,quantity,remarks,created_at) VALUES (?,1,?,?,?,'Received and counted',?)").bind(lotId, workflow.indexOf(department as typeof workflow[number]) + 1, `Received in ${department}`, record.received_qty, timestamp),
        db.prepare("INSERT INTO audit_logs (user_id,department_id,lot_id,design_id,action,new_value,quantity,remarks,created_at) VALUES (1,?,?,?,'Department Received','Received',?,'Received and counted',?)").bind(workflow.indexOf(department as typeof workflow[number]) + 1, lotId, lot.design_id, record.received_qty, timestamp),
      ]);
      return Response.json({ ok: true, message: `${String(lot.lot_no)} received in ${department}.`, state: await getState() });
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
        db.prepare("INSERT INTO lot_history (lot_id,user_id,department_id,action,quantity,remarks,created_at) VALUES (?,1,?,?,?,?,?)").bind(lotId, workflow.indexOf(department as typeof workflow[number]) + 1, `${department} production updated`, completed, remark, timestamp),
        db.prepare("INSERT INTO audit_logs (user_id,department_id,lot_id,design_id,action,previous_value,new_value,quantity,remarks,created_at) VALUES (1,?,?,?,'Production Updated',?,?,?,?,?)").bind(workflow.indexOf(department as typeof workflow[number]) + 1, lotId, lot.design_id, String(record.completed_qty), String(completed), completed - Number(record.completed_qty ?? 0), remark, timestamp),
      ]);
      return Response.json({ ok: true, message: `${department} production saved.`, state: await getState() });
    }

    if (action === "transfer") {
      const from = String(body.department ?? lot.current_department);
      const fromIndex = workflow.indexOf(from as typeof workflow[number]);
      if (fromIndex < 0 || fromIndex >= workflow.length - 1 || from === "Warehouse") return bad("Invalid department transfer.");
      const to = workflow[fromIndex + 1];
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
        db.prepare("INSERT INTO department_transfers (lot_id,design_id,from_department_id,to_department_id,user_id,quantity,remarks,transfer_date,created_at,updated_at) VALUES (?,?,?,?,1,?,?,?,?,?)").bind(lotId, lot.design_id, fromIndex + 1, fromIndex + 2, quantity, remark, timestamp, timestamp, timestamp),
        db.prepare("UPDATE lots SET current_department=?,status=?,completed_qty=0,remarks=?,updated_at=? WHERE id=?").bind(to, to === "Warehouse" ? "Ready for Dispatch" : "Waiting", remark, timestamp, lotId),
        db.prepare("INSERT INTO lot_history (lot_id,user_id,department_id,action,quantity,remarks,created_at) VALUES (?,1,?,?,?,?,?)").bind(lotId, fromIndex + 1, `${quantity.toLocaleString()} PCS transferred from ${from} to ${to}`, quantity, remark, timestamp),
        db.prepare("INSERT INTO audit_logs (user_id,department_id,lot_id,design_id,action,previous_value,new_value,quantity,remarks,created_at) VALUES (1,?,?,?,'Department Transfer',?,?,?,?,?)").bind(fromIndex + 1, lotId, lot.design_id, from, to, quantity, remark, timestamp),
      ];
      if (from !== "Issue Lot" && record) statements.push(db.prepare(`UPDATE ${tableByDepartment[from]} SET transferred_qty=transferred_qty+?,status=?,updated_at=? WHERE lot_id=?`).bind(quantity, quantity === available ? "Completed" : "Partially Completed", timestamp, lotId));
      if (to === "Warehouse") {
        const packing = record;
        const cartons = Math.ceil(quantity / Math.max(1, Number(packing?.pieces_per_carton ?? 20)));
        const nextReceipt = await db.prepare("SELECT COALESCE(MAX(id),0)+1 AS next FROM warehouse_receipts").first<{ next: number }>();
        statements.push(
          db.prepare("INSERT INTO warehouse_receipts (receipt_no,lot_id,design_id,department_id,user_id,received_qty,cartons,location,rack_no,received_by,received_date,status,remarks) VALUES (?,?,?,7,1,?,?,'Finished Goods - A',?,'Ayesha Khan',?,'In Stock',?)").bind(`WHR-${String(nextReceipt?.next ?? 1).padStart(5,"0")}`, lotId, lot.design_id, quantity, cartons, `A-${String(lotId).padStart(2,"0")}`, timestamp.slice(0,10), remark),
          db.prepare("INSERT INTO warehouse_inventory (lot_id,design_id,available_qty,reserved_qty,dispatched_qty,status,updated_at) VALUES (?,?,?,0,0,'In Stock',?) ON CONFLICT(lot_id) DO UPDATE SET available_qty=available_qty+excluded.available_qty,status='In Stock',updated_at=excluded.updated_at").bind(lotId, lot.design_id, quantity, timestamp)
        );
      } else {
        const targetTable = tableByDepartment[to];
        statements.push(db.prepare(`INSERT INTO ${targetTable} (lot_id,design_id,department_id,user_id,received_qty,status,remarks,created_at,updated_at) VALUES (?,?,?,1,?,'Waiting',?,?,?) ON CONFLICT(lot_id) DO UPDATE SET received_qty=received_qty+excluded.received_qty,remarks=excluded.remarks,updated_at=excluded.updated_at`).bind(lotId, lot.design_id, fromIndex + 2, quantity, remark, timestamp, timestamp));
      }
      await db.batch(statements);
      return Response.json({ ok: true, message: `${quantity.toLocaleString()} PCS transferred to ${to}.`, state: await getState() });
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
      await db.batch([
        db.prepare("INSERT INTO customer_dispatches (dispatch_no,lot_id,design_id,department_id,user_id,customer_id,dispatch_qty,carton_qty,invoice_no,challan_no,transporter,vehicle_no,driver_name,driver_contact,dispatch_date,destination,tracking_no,dispatch_status,delivery_status,remarks,created_at,updated_at) VALUES (?,?,?,8,1,?,?,?,?,?,?,?,?,?,?,?,?, 'Dispatched','In Transit',?,?,?)").bind(dispatchNo, lotId, lot.design_id, lot.customer_id, quantity, Number(body.cartonQty ?? 0), body.invoiceNo, body.challanNo, body.transporter, body.vehicleNo, body.driverName, body.driverContact, String(body.dispatchDate ?? timestamp.slice(0,10)), body.destination, body.trackingNo, body.remarks, timestamp, timestamp),
        db.prepare("UPDATE warehouse_inventory SET dispatched_qty=dispatched_qty+?,status=?,updated_at=? WHERE lot_id=?").bind(quantity, isFull ? "Fully Dispatched" : "Partially Dispatched", timestamp, lotId),
        db.prepare("UPDATE lots SET current_department='Customer Dispatch',status=?,completed_qty=?,remarks=?,updated_at=? WHERE id=?").bind(isFull ? "Dispatched" : "Partially Dispatched", Number(inventory.dispatched_qty ?? 0) + quantity, `${quantity.toLocaleString()} PCS dispatched under ${dispatchNo}.`, timestamp, lotId),
        db.prepare("INSERT INTO lot_history (lot_id,user_id,department_id,action,quantity,remarks,created_at) VALUES (?,1,8,'Customer dispatch created',?,?,?)").bind(lotId, quantity, `${dispatchNo} — ${String(body.transporter ?? "Transport arranged")}`, timestamp),
        db.prepare("INSERT INTO audit_logs (user_id,department_id,lot_id,design_id,action,previous_value,new_value,quantity,remarks,created_at) VALUES (1,8,?,?,'Customer Dispatch',?,?,?,?,?)").bind(lotId, lot.design_id, String(available), String(available - quantity), quantity, dispatchNo, timestamp),
      ]);
      return Response.json({ ok: true, message: `${dispatchNo} created. Warehouse balance updated.`, state: await getState() });
    }

    return bad("Unsupported action.");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to save factory data.";
    return bad(message.includes("UNIQUE") ? "Lot No. already exists." : message, 500);
  }
}
