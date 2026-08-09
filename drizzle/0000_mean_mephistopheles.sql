CREATE TABLE `attachments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`design_id` integer,
	`file_name` text NOT NULL,
	`object_key` text NOT NULL,
	`content_type` text,
	`size` integer,
	`uploaded_by` integer,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`design_id`) REFERENCES `designs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`uploaded_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `attachments_object_key_unique` ON `attachments` (`object_key`);--> statement-breakpoint
CREATE TABLE `attendance` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`employee_id` integer NOT NULL,
	`date` text NOT NULL,
	`check_in` text,
	`check_out` text,
	`working_hours` real,
	`overtime` real DEFAULT 0,
	`status` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer,
	`design_id` integer,
	`department_id` integer,
	`action` text NOT NULL,
	`entity` text NOT NULL,
	`entity_id` text,
	`old_value` text,
	`new_value` text,
	`ip_address` text,
	`device` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`design_id`) REFERENCES `designs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`department_id`) REFERENCES `departments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `customers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`contact` text,
	`email` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `customers_code_unique` ON `customers` (`code`);--> statement-breakpoint
CREATE TABLE `cutting_records` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`design_id` integer NOT NULL,
	`production_order_id` integer,
	`department_id` integer,
	`user_id` integer,
	`received_qty` integer DEFAULT 0 NOT NULL,
	`target_qty` integer DEFAULT 0 NOT NULL,
	`completed_qty` integer DEFAULT 0 NOT NULL,
	`passed_qty` integer DEFAULT 0 NOT NULL,
	`rejected_qty` integer DEFAULT 0 NOT NULL,
	`rework_qty` integer DEFAULT 0 NOT NULL,
	`pending_qty` integer DEFAULT 0 NOT NULL,
	`start_date` text,
	`completion_date` text,
	`supervisor` text,
	`operator` text,
	`status` text DEFAULT 'Pending' NOT NULL,
	`remarks` text,
	`details` text DEFAULT '{}' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`design_id`) REFERENCES `designs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`production_order_id`) REFERENCES `production_orders`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`department_id`) REFERENCES `departments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `department_transfers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`design_id` integer NOT NULL,
	`production_order_id` integer,
	`from_department_id` integer,
	`to_department_id` integer,
	`quantity` integer NOT NULL,
	`status` text DEFAULT 'Completed' NOT NULL,
	`transferred_by` integer,
	`remarks` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`design_id`) REFERENCES `designs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`production_order_id`) REFERENCES `production_orders`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`from_department_id`) REFERENCES `departments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`to_department_id`) REFERENCES `departments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`transferred_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `departments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`code` text NOT NULL,
	`sequence` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `departments_name_unique` ON `departments` (`name`);--> statement-breakpoint
CREATE UNIQUE INDEX `departments_code_unique` ON `departments` (`code`);--> statement-breakpoint
CREATE TABLE `designs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`design_no` text NOT NULL,
	`design_name` text NOT NULL,
	`customer_id` integer,
	`brand` text,
	`category` text,
	`season` text,
	`fabrication` text NOT NULL,
	`fabric_name` text,
	`fabric_composition` text,
	`gsm` real,
	`color` text,
	`size_range` text,
	`sample_quantity` integer DEFAULT 0,
	`order_quantity` integer NOT NULL,
	`production_quantity` integer NOT NULL,
	`order_date` text,
	`start_date` text,
	`due_date` text,
	`priority` text DEFAULT 'Medium' NOT NULL,
	`factory` text,
	`remarks` text,
	`image_url` text,
	`tech_pack_url` text,
	`status` text DEFAULT 'Draft' NOT NULL,
	`workflow` text NOT NULL,
	`created_by` integer,
	`updated_by` integer,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_designs_design_no` ON `designs` (`design_no`);--> statement-breakpoint
CREATE TABLE `dispatch_records` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`design_id` integer NOT NULL,
	`production_order_id` integer,
	`department_id` integer,
	`user_id` integer,
	`received_qty` integer DEFAULT 0 NOT NULL,
	`target_qty` integer DEFAULT 0 NOT NULL,
	`completed_qty` integer DEFAULT 0 NOT NULL,
	`passed_qty` integer DEFAULT 0 NOT NULL,
	`rejected_qty` integer DEFAULT 0 NOT NULL,
	`rework_qty` integer DEFAULT 0 NOT NULL,
	`pending_qty` integer DEFAULT 0 NOT NULL,
	`start_date` text,
	`completion_date` text,
	`supervisor` text,
	`operator` text,
	`status` text DEFAULT 'Pending' NOT NULL,
	`remarks` text,
	`details` text DEFAULT '{}' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`design_id`) REFERENCES `designs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`production_order_id`) REFERENCES `production_orders`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`department_id`) REFERENCES `departments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `embroidery_records` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`design_id` integer NOT NULL,
	`production_order_id` integer,
	`department_id` integer,
	`user_id` integer,
	`received_qty` integer DEFAULT 0 NOT NULL,
	`target_qty` integer DEFAULT 0 NOT NULL,
	`completed_qty` integer DEFAULT 0 NOT NULL,
	`passed_qty` integer DEFAULT 0 NOT NULL,
	`rejected_qty` integer DEFAULT 0 NOT NULL,
	`rework_qty` integer DEFAULT 0 NOT NULL,
	`pending_qty` integer DEFAULT 0 NOT NULL,
	`start_date` text,
	`completion_date` text,
	`supervisor` text,
	`operator` text,
	`status` text DEFAULT 'Pending' NOT NULL,
	`remarks` text,
	`details` text DEFAULT '{}' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`design_id`) REFERENCES `designs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`production_order_id`) REFERENCES `production_orders`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`department_id`) REFERENCES `departments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `employees` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`employee_id` text NOT NULL,
	`name` text NOT NULL,
	`cnic` text,
	`phone` text,
	`department_id` integer,
	`department` text NOT NULL,
	`designation` text NOT NULL,
	`joining_date` text,
	`salary` real DEFAULT 0,
	`shift` text,
	`status` text DEFAULT 'Active' NOT NULL,
	`photo_url` text,
	`emergency_contact` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`department_id`) REFERENCES `departments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `employees_employee_id_unique` ON `employees` (`employee_id`);--> statement-breakpoint
CREATE TABLE `expenses` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`voucher_no` text NOT NULL,
	`voucher_type` text NOT NULL,
	`description` text NOT NULL,
	`amount` real NOT NULL,
	`party` text,
	`date` text NOT NULL,
	`created_by` integer,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `expenses_voucher_no_unique` ON `expenses` (`voucher_no`);--> statement-breakpoint
CREATE TABLE `fabric_inventory` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`design_id` integer,
	`fabric_code` text NOT NULL,
	`fabrication` text NOT NULL,
	`fabric_name` text,
	`composition` text,
	`gsm` real,
	`required_fabric` real DEFAULT 0 NOT NULL,
	`available_fabric` real DEFAULT 0 NOT NULL,
	`issued_fabric` real DEFAULT 0 NOT NULL,
	`balance_fabric` real DEFAULT 0 NOT NULL,
	`supplier_id` integer,
	`lot_no` text,
	`roll_no` text,
	`shade` text,
	`received_date` text,
	`issued_date` text,
	`issued_to` text,
	`remarks` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`design_id`) REFERENCES `designs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `finishing_records` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`design_id` integer NOT NULL,
	`production_order_id` integer,
	`department_id` integer,
	`user_id` integer,
	`received_qty` integer DEFAULT 0 NOT NULL,
	`target_qty` integer DEFAULT 0 NOT NULL,
	`completed_qty` integer DEFAULT 0 NOT NULL,
	`passed_qty` integer DEFAULT 0 NOT NULL,
	`rejected_qty` integer DEFAULT 0 NOT NULL,
	`rework_qty` integer DEFAULT 0 NOT NULL,
	`pending_qty` integer DEFAULT 0 NOT NULL,
	`start_date` text,
	`completion_date` text,
	`supervisor` text,
	`operator` text,
	`status` text DEFAULT 'Pending' NOT NULL,
	`remarks` text,
	`details` text DEFAULT '{}' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`design_id`) REFERENCES `designs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`production_order_id`) REFERENCES `production_orders`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`department_id`) REFERENCES `departments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `inventory_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`item_code` text NOT NULL,
	`item_name` text NOT NULL,
	`category` text NOT NULL,
	`unit` text NOT NULL,
	`opening_stock` real DEFAULT 0 NOT NULL,
	`received` real DEFAULT 0 NOT NULL,
	`issued` real DEFAULT 0 NOT NULL,
	`current_stock` real DEFAULT 0 NOT NULL,
	`minimum_stock` real DEFAULT 0 NOT NULL,
	`supplier` text,
	`location` text,
	`remarks` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `inventory_items_item_code_unique` ON `inventory_items` (`item_code`);--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer,
	`design_id` integer,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`message` text NOT NULL,
	`is_read` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`design_id`) REFERENCES `designs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `orders` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`order_no` text NOT NULL,
	`design_id` integer NOT NULL,
	`customer_id` integer,
	`quantity` integer NOT NULL,
	`status` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`design_id`) REFERENCES `designs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `orders_order_no_unique` ON `orders` (`order_no`);--> statement-breakpoint
CREATE TABLE `packing_records` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`design_id` integer NOT NULL,
	`production_order_id` integer,
	`department_id` integer,
	`user_id` integer,
	`received_qty` integer DEFAULT 0 NOT NULL,
	`target_qty` integer DEFAULT 0 NOT NULL,
	`completed_qty` integer DEFAULT 0 NOT NULL,
	`passed_qty` integer DEFAULT 0 NOT NULL,
	`rejected_qty` integer DEFAULT 0 NOT NULL,
	`rework_qty` integer DEFAULT 0 NOT NULL,
	`pending_qty` integer DEFAULT 0 NOT NULL,
	`start_date` text,
	`completion_date` text,
	`supervisor` text,
	`operator` text,
	`status` text DEFAULT 'Pending' NOT NULL,
	`remarks` text,
	`details` text DEFAULT '{}' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`design_id`) REFERENCES `designs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`production_order_id`) REFERENCES `production_orders`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`department_id`) REFERENCES `departments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `printing_records` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`design_id` integer NOT NULL,
	`production_order_id` integer,
	`department_id` integer,
	`user_id` integer,
	`received_qty` integer DEFAULT 0 NOT NULL,
	`target_qty` integer DEFAULT 0 NOT NULL,
	`completed_qty` integer DEFAULT 0 NOT NULL,
	`passed_qty` integer DEFAULT 0 NOT NULL,
	`rejected_qty` integer DEFAULT 0 NOT NULL,
	`rework_qty` integer DEFAULT 0 NOT NULL,
	`pending_qty` integer DEFAULT 0 NOT NULL,
	`start_date` text,
	`completion_date` text,
	`supervisor` text,
	`operator` text,
	`status` text DEFAULT 'Pending' NOT NULL,
	`remarks` text,
	`details` text DEFAULT '{}' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`design_id`) REFERENCES `designs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`production_order_id`) REFERENCES `production_orders`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`department_id`) REFERENCES `departments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `production_orders` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`design_id` integer NOT NULL,
	`current_department_id` integer,
	`current_department` text NOT NULL,
	`order_qty` integer NOT NULL,
	`completed_qty` integer DEFAULT 0 NOT NULL,
	`pending_qty` integer NOT NULL,
	`progress` integer DEFAULT 0 NOT NULL,
	`status` text NOT NULL,
	`assigned_employee` text,
	`supervisor` text,
	`delay_days` integer DEFAULT 0 NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`design_id`) REFERENCES `designs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`current_department_id`) REFERENCES `departments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `purchase_orders` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`po_no` text NOT NULL,
	`supplier_id` integer,
	`item` text NOT NULL,
	`quantity` real NOT NULL,
	`rate` real NOT NULL,
	`total` real NOT NULL,
	`tax` real DEFAULT 0,
	`delivery_date` text,
	`payment_terms` text,
	`status` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `purchase_orders_po_no_unique` ON `purchase_orders` (`po_no`);--> statement-breakpoint
CREATE TABLE `purchases` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`pr_no` text NOT NULL,
	`department_id` integer,
	`requested_item` text NOT NULL,
	`quantity` real NOT NULL,
	`required_date` text,
	`requested_by` integer,
	`approval_status` text DEFAULT 'Pending' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`department_id`) REFERENCES `departments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`requested_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `purchases_pr_no_unique` ON `purchases` (`pr_no`);--> statement-breakpoint
CREATE TABLE `qc_records` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`design_id` integer NOT NULL,
	`production_order_id` integer,
	`department_id` integer,
	`user_id` integer,
	`received_qty` integer DEFAULT 0 NOT NULL,
	`target_qty` integer DEFAULT 0 NOT NULL,
	`completed_qty` integer DEFAULT 0 NOT NULL,
	`passed_qty` integer DEFAULT 0 NOT NULL,
	`rejected_qty` integer DEFAULT 0 NOT NULL,
	`rework_qty` integer DEFAULT 0 NOT NULL,
	`pending_qty` integer DEFAULT 0 NOT NULL,
	`start_date` text,
	`completion_date` text,
	`supervisor` text,
	`operator` text,
	`status` text DEFAULT 'Pending' NOT NULL,
	`remarks` text,
	`details` text DEFAULT '{}' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`design_id`) REFERENCES `designs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`production_order_id`) REFERENCES `production_orders`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`department_id`) REFERENCES `departments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `roles` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`permissions` text DEFAULT '[]' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `roles_name_unique` ON `roles` (`name`);--> statement-breakpoint
CREATE TABLE `stitching_records` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`design_id` integer NOT NULL,
	`production_order_id` integer,
	`department_id` integer,
	`user_id` integer,
	`received_qty` integer DEFAULT 0 NOT NULL,
	`target_qty` integer DEFAULT 0 NOT NULL,
	`completed_qty` integer DEFAULT 0 NOT NULL,
	`passed_qty` integer DEFAULT 0 NOT NULL,
	`rejected_qty` integer DEFAULT 0 NOT NULL,
	`rework_qty` integer DEFAULT 0 NOT NULL,
	`pending_qty` integer DEFAULT 0 NOT NULL,
	`start_date` text,
	`completion_date` text,
	`supervisor` text,
	`operator` text,
	`status` text DEFAULT 'Pending' NOT NULL,
	`remarks` text,
	`details` text DEFAULT '{}' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`design_id`) REFERENCES `designs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`production_order_id`) REFERENCES `production_orders`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`department_id`) REFERENCES `departments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `suppliers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`contact` text,
	`category` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `suppliers_code_unique` ON `suppliers` (`code`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`role_id` integer,
	`department_id` integer,
	`status` text DEFAULT 'Active' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`department_id`) REFERENCES `departments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);