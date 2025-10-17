// Copyright (c) 2025, Logistics and contributors
// For license information, please see license.txt

frappe.query_reports["customer_report"] = {
    "filters": [
        {
            "fieldname": "owner",
            "label": __("Owner"),
            "fieldtype": "Link",
            "options": "User"
        },
        {
            "fieldname": "party_type",
            "label": __("Party Type"),
            "fieldtype": "Select",
            "options": ["", "Customer", "Supplier"],
            "reqd": 0,
            "on_change": function() {
                frappe.query_report.set_filter_value("party", "");
            }
        },
        {
            "fieldname": "party",
            "label": __("Party"),
            "fieldtype": "Link",
            "options": function() {
                var party_type = frappe.query_report.get_filter_value("party_type");
                return party_type || "Customer";
            }
        },
        {
            "fieldname": "voucher_type",
            "label": __("Voucher Type"),
            "fieldtype": "Data"
        },
        {
            "fieldname": "voucher_no",
            "label": __("Voucher No"),
            "fieldtype": "Dynamic Link",
            "options": "voucher_type",
        },
        {
            "fieldname": "transaction",
            "label": __("Transaction"),
            "fieldtype": "Data"
        },
        {
            "fieldname": "from_date",
            "label": __("From Date"),
            "fieldtype": "Date",
            "default": frappe.datetime.add_months(frappe.datetime.get_today(), -1),
            "reqd": 1,
            "width": "60px",
        },
        {
            "fieldname": "to_date",
            "label": __("To Date"),
            "fieldtype": "Date",
            "default": frappe.datetime.get_today(),
            "reqd": 1,
            "width": "60px",
        }
    ]
};