CREATE TABLE `system_settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`company_name` text DEFAULT 'MS Boutique' NOT NULL,
	`address` text DEFAULT '' NOT NULL,
	`phone` text DEFAULT '' NOT NULL,
	`website` text DEFAULT '' NOT NULL,
	`logo_url` text DEFAULT '' NOT NULL,
	`invoice_prefix` text DEFAULT 'INV' NOT NULL,
	`challan_prefix` text DEFAULT 'DC' NOT NULL,
	`footer_note` text DEFAULT 'Thank you for choosing MS Boutique.' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
