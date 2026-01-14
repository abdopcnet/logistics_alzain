// Copyright (c) 2026, Logistics and contributors
// For license information, please see license.txt

frappe.query_reports["customer_final_statement"] = {
	"filters": [
		{
			"fieldname": "company",
			"label": __("Company"),
			"fieldtype": "Link",
			"options": "Company",
			"default": frappe.defaults.get_user_default("Company"),
			"reqd": 1
		},
		{
			"fieldname": "from_date",
			"label": __("From Date"),
			"fieldtype": "Date",
			"default": frappe.datetime.add_months(frappe.datetime.get_today(), -1),
			"reqd": 1
		},
		{
			"fieldname": "to_date",
			"label": __("To Date"),
			"fieldtype": "Date",
			"default": frappe.datetime.get_today(),
			"reqd": 1
		},
		{
			"fieldname": "customer",
			"label": __("Customer"),
			"fieldtype": "Link",
			"options": "Customer"
		},
		{
			"fieldname": "project",
			"label": __("Project"),
			"fieldtype": "Link",
			"options": "Project"
		}
	],
	"formatter": function(value, row, column, data, default_formatter) {
		value = default_formatter(value, row, column, data);

		// Links for clickable IDs
		if (column.fieldname == "name" && data.name && data.voucher_type) {
			value = `<a href="/app/${frappe.router.slug(data.voucher_type)}/${data.name}" target="_blank">${value}</a>`;
		}

		if (column.fieldname == "customer_name") {
			if (data.customer) {
				value = `<a href="/app/customer/${data.customer}" target="_blank">${value}</a>`;
			}
		}

		if (column.fieldname == "transaction" && data.transaction) {
			value = `<a href="/app/transaction/${data.transaction}" target="_blank">${value}</a>`;
		}

		// Color Coding for Amounts
		if (column.fieldname == "debit" && data.debit > 0) {
			value = "<span style='color:red; font-weight:bold;'>" + value + "</span>";
		}

		if (column.fieldname == "credit" && data.credit > 0) {
			value = "<span style='color:#008000 !important; font-weight:bold !important;'>" + value + "</span>";
		}

		if (column.fieldname == "balance") {
			value = "<span style='color:#007bff; font-weight:900;'>" + value + "</span>";
		}

		// Bold special rows
		if (data.customer_name == "Opening Balance" || data.customer_name == "Total" || data.customer_name == __("Opening Balance") || data.customer_name == __("Total")) {
			value = "<b>" + value + "</b>";
		}

		return value;
	}
};
