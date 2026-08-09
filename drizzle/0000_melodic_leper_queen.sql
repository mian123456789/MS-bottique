CREATE TABLE `audit_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer,
	`department_id` integer,
	`lot_id` integer,
	`design_id` integer,
	`action` text NOT NULL,
	`previous_value` text DEFAULT '' NOT NULL,
	`new_value` text DEFAULT '' NOT NULL,
	`quantity` integer DEFAULT 0 NOT NULL,
	`remarks` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`department_id`) REFERENCES `departments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`lot_id`) REFERENCES `lots`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`design_id`) REFERENCES `designs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_audit_lot_id` ON `audit_logs` (`lot_id`);--> statement-breakpoint
CREATE TABLE `customer_dispatches` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`dispatch_no` text NOT NULL,
	`lot_id` integer NOT NULL,
	`design_id` integer NOT NULL,
	`department_id` integer NOT NULL,
	`user_id` integer,
	`customer_id` integer NOT NULL,
	`dispatch_qty` integer NOT NULL,
	`carton_qty` integer DEFAULT 0 NOT NULL,
	`invoice_no` text NOT NULL,
	`challan_no` text NOT NULL,
	`transporter` text DEFAULT '' NOT NULL,
	`vehicle_no` text DEFAULT '' NOT NULL,
	`driver_name` text DEFAULT '' NOT NULL,
	`driver_contact` text DEFAULT '' NOT NULL,
	`dispatch_date` text NOT NULL,
	`destination` text DEFAULT '' NOT NULL,
	`tracking_no` text DEFAULT '' NOT NULL,
	`dispatch_status` text DEFAULT 'Dispatched' NOT NULL,
	`delivery_status` text DEFAULT 'In Transit' NOT NULL,
	`remarks` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`lot_id`) REFERENCES `lots`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`design_id`) REFERENCES `designs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`department_id`) REFERENCES `departments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `customer_dispatches_dispatch_no_unique` ON `customer_dispatches` (`dispatch_no`);--> statement-breakpoint
CREATE TABLE `customers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`contact` text DEFAULT '' NOT NULL,
	`destination` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `cutting_records` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`lot_id` integer NOT NULL,
	`design_id` integer NOT NULL,
	`department_id` integer NOT NULL,
	`user_id` integer,
	`received_qty` integer DEFAULT 0 NOT NULL,
	`completed_qty` integer DEFAULT 0 NOT NULL,
	`rejected_qty` integer DEFAULT 0 NOT NULL,
	`rework_qty` integer DEFAULT 0 NOT NULL,
	`transferred_qty` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'Waiting' NOT NULL,
	`remarks` text DEFAULT '' NOT NULL,
	`start_date` text,
	`completion_date` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`target_qty` integer DEFAULT 0 NOT NULL,
	`cutting_qty` integer DEFAULT 0 NOT NULL,
	`passed_qty` integer DEFAULT 0 NOT NULL,
	`layer_no` text DEFAULT '' NOT NULL,
	`marker_no` text DEFAULT '' NOT NULL,
	`cutting_table` text DEFAULT '' NOT NULL,
	`operator` text DEFAULT '' NOT NULL,
	`supervisor` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`lot_id`) REFERENCES `lots`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`design_id`) REFERENCES `designs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`department_id`) REFERENCES `departments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_cutting_lot_unique` ON `cutting_records` (`lot_id`);--> statement-breakpoint
CREATE TABLE `department_transfers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`lot_id` integer NOT NULL,
	`design_id` integer NOT NULL,
	`from_department_id` integer NOT NULL,
	`to_department_id` integer NOT NULL,
	`user_id` integer,
	`quantity` integer NOT NULL,
	`remarks` text DEFAULT '' NOT NULL,
	`transfer_date` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`lot_id`) REFERENCES `lots`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`design_id`) REFERENCES `designs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`from_department_id`) REFERENCES `departments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`to_department_id`) REFERENCES `departments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_transfers_lot_id` ON `department_transfers` (`lot_id`);--> statement-breakpoint
CREATE TABLE `departments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`sequence` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `departments_name_unique` ON `departments` (`name`);--> statement-breakpoint
CREATE TABLE `designs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`design_no` text NOT NULL,
	`fabrication` text NOT NULL,
	`size_range` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `designs_design_no_unique` ON `designs` (`design_no`);--> statement-breakpoint
CREATE TABLE `embroidery_records` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`lot_id` integer NOT NULL,
	`design_id` integer NOT NULL,
	`department_id` integer NOT NULL,
	`user_id` integer,
	`received_qty` integer DEFAULT 0 NOT NULL,
	`completed_qty` integer DEFAULT 0 NOT NULL,
	`rejected_qty` integer DEFAULT 0 NOT NULL,
	`rework_qty` integer DEFAULT 0 NOT NULL,
	`transferred_qty` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'Waiting' NOT NULL,
	`remarks` text DEFAULT '' NOT NULL,
	`start_date` text,
	`completion_date` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`embroidery_type` text DEFAULT 'Multi-head' NOT NULL,
	`pattern_no` text DEFAULT '' NOT NULL,
	`machine_no` text DEFAULT '' NOT NULL,
	`operator` text DEFAULT '' NOT NULL,
	`supervisor` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`lot_id`) REFERENCES `lots`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`design_id`) REFERENCES `designs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`department_id`) REFERENCES `departments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_embroidery_lot_unique` ON `embroidery_records` (`lot_id`);--> statement-breakpoint
CREATE TABLE `finishing_records` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`lot_id` integer NOT NULL,
	`design_id` integer NOT NULL,
	`department_id` integer NOT NULL,
	`user_id` integer,
	`received_qty` integer DEFAULT 0 NOT NULL,
	`completed_qty` integer DEFAULT 0 NOT NULL,
	`rejected_qty` integer DEFAULT 0 NOT NULL,
	`rework_qty` integer DEFAULT 0 NOT NULL,
	`transferred_qty` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'Waiting' NOT NULL,
	`remarks` text DEFAULT '' NOT NULL,
	`start_date` text,
	`completion_date` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`process` text DEFAULT 'General Quality Check' NOT NULL,
	`checked_qty` integer DEFAULT 0 NOT NULL,
	`passed_qty` integer DEFAULT 0 NOT NULL,
	`supervisor` text DEFAULT '' NOT NULL,
	`received_date` text,
	FOREIGN KEY (`lot_id`) REFERENCES `lots`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`design_id`) REFERENCES `designs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`department_id`) REFERENCES `departments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_finishing_lot_unique` ON `finishing_records` (`lot_id`);--> statement-breakpoint
CREATE TABLE `lot_history` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`lot_id` integer NOT NULL,
	`user_id` integer,
	`department_id` integer,
	`action` text NOT NULL,
	`quantity` integer DEFAULT 0 NOT NULL,
	`remarks` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`lot_id`) REFERENCES `lots`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`department_id`) REFERENCES `departments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_history_lot_id` ON `lot_history` (`lot_id`);--> statement-breakpoint
CREATE TABLE `lot_remarks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`lot_id` integer NOT NULL,
	`user_id` integer,
	`department_id` integer,
	`remark` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`lot_id`) REFERENCES `lots`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`department_id`) REFERENCES `departments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `lot_size_breakdowns` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`lot_id` integer NOT NULL,
	`size` text NOT NULL,
	`quantity` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`lot_id`) REFERENCES `lots`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `lots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`lot_no` text NOT NULL,
	`design_id` integer NOT NULL,
	`customer_id` integer NOT NULL,
	`fabrication` text NOT NULL,
	`quantity` integer NOT NULL,
	`size_range` text NOT NULL,
	`order_date` text NOT NULL,
	`required_delivery_date` text NOT NULL,
	`priority` text DEFAULT 'Normal' NOT NULL,
	`current_department` text DEFAULT 'Issue Lot' NOT NULL,
	`status` text DEFAULT 'Lot Issued' NOT NULL,
	`completed_qty` integer DEFAULT 0 NOT NULL,
	`remarks` text DEFAULT '' NOT NULL,
	`issue_date` text NOT NULL,
	`user_id` integer,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`design_id`) REFERENCES `designs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `lots_lot_no_unique` ON `lots` (`lot_no`);--> statement-breakpoint
CREATE INDEX `idx_lots_department_status` ON `lots` (`current_department`,`status`);--> statement-breakpoint
CREATE INDEX `idx_lots_design_id` ON `lots` (`design_id`);--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer,
	`title` text NOT NULL,
	`message` text NOT NULL,
	`read` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `packing_records` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`lot_id` integer NOT NULL,
	`design_id` integer NOT NULL,
	`department_id` integer NOT NULL,
	`user_id` integer,
	`received_qty` integer DEFAULT 0 NOT NULL,
	`completed_qty` integer DEFAULT 0 NOT NULL,
	`rejected_qty` integer DEFAULT 0 NOT NULL,
	`rework_qty` integer DEFAULT 0 NOT NULL,
	`transferred_qty` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'Waiting' NOT NULL,
	`remarks` text DEFAULT '' NOT NULL,
	`start_date` text,
	`completion_date` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`packing_qty` integer DEFAULT 0 NOT NULL,
	`pieces_per_carton` integer DEFAULT 20 NOT NULL,
	`total_cartons` integer DEFAULT 0 NOT NULL,
	`barcode_status` text DEFAULT 'Pending' NOT NULL,
	`tag_status` text DEFAULT 'Pending' NOT NULL,
	`polybag_status` text DEFAULT 'Pending' NOT NULL,
	`carton_status` text DEFAULT 'Pending' NOT NULL,
	`supervisor` text DEFAULT '' NOT NULL,
	`packing_date` text,
	FOREIGN KEY (`lot_id`) REFERENCES `lots`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`design_id`) REFERENCES `designs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`department_id`) REFERENCES `departments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_packing_lot_unique` ON `packing_records` (`lot_id`);--> statement-breakpoint
CREATE TABLE `roles` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `roles_name_unique` ON `roles` (`name`);--> statement-breakpoint
CREATE TABLE `stitching_records` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`lot_id` integer NOT NULL,
	`design_id` integer NOT NULL,
	`department_id` integer NOT NULL,
	`user_id` integer,
	`received_qty` integer DEFAULT 0 NOT NULL,
	`completed_qty` integer DEFAULT 0 NOT NULL,
	`rejected_qty` integer DEFAULT 0 NOT NULL,
	`rework_qty` integer DEFAULT 0 NOT NULL,
	`transferred_qty` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'Waiting' NOT NULL,
	`remarks` text DEFAULT '' NOT NULL,
	`start_date` text,
	`completion_date` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`production_line` text DEFAULT '' NOT NULL,
	`supervisor` text DEFAULT '' NOT NULL,
	`target_qty` integer DEFAULT 0 NOT NULL,
	`today_production` integer DEFAULT 0 NOT NULL,
	`efficiency` real DEFAULT 0 NOT NULL,
	`expected_completion_date` text,
	FOREIGN KEY (`lot_id`) REFERENCES `lots`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`design_id`) REFERENCES `designs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`department_id`) REFERENCES `departments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_stitching_lot_unique` ON `stitching_records` (`lot_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`role_id` integer,
	`department_id` integer,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`department_id`) REFERENCES `departments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE TABLE `warehouse_inventory` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`lot_id` integer NOT NULL,
	`design_id` integer NOT NULL,
	`available_qty` integer DEFAULT 0 NOT NULL,
	`reserved_qty` integer DEFAULT 0 NOT NULL,
	`dispatched_qty` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'In Stock' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`lot_id`) REFERENCES `lots`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`design_id`) REFERENCES `designs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `warehouse_inventory_lot_id_unique` ON `warehouse_inventory` (`lot_id`);--> statement-breakpoint
CREATE TABLE `warehouse_receipts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`receipt_no` text NOT NULL,
	`lot_id` integer NOT NULL,
	`design_id` integer NOT NULL,
	`department_id` integer NOT NULL,
	`user_id` integer,
	`received_qty` integer NOT NULL,
	`cartons` integer DEFAULT 0 NOT NULL,
	`location` text DEFAULT 'Finished Goods' NOT NULL,
	`rack_no` text DEFAULT '' NOT NULL,
	`received_by` text DEFAULT '' NOT NULL,
	`received_date` text NOT NULL,
	`status` text DEFAULT 'Received' NOT NULL,
	`remarks` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`lot_id`) REFERENCES `lots`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`design_id`) REFERENCES `designs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`department_id`) REFERENCES `departments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `warehouse_receipts_receipt_no_unique` ON `warehouse_receipts` (`receipt_no`);