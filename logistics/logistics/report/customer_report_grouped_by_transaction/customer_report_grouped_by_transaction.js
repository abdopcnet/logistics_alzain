// Copyright (c) 2025, HCS and contributors
// For license information, please see license.txt

frappe.templates["customer_report_grouped_by_transaction"] = frappe.templates["customer_report_grouped_by_transaction.html"];
console.log("Loaded external HTML template for Customer Report Grouped By Transaction:", !!frappe.templates["customer_report_grouped_by_transaction"]);


frappe.query_reports["Customer Report Grouped By Transaction"] = {
    "filters": [
        {
            "fieldname": "from_date",
            "label": "من تاريخ",
            "fieldtype": "Date",
            "default": frappe.datetime.add_months(frappe.datetime.get_today(), -1),
            "reqd": 1,
            "width": "60px"
        },
        {
            "fieldname": "to_date",
            "label": "إلى تاريخ",
            "fieldtype": "Date",
            "default": frappe.datetime.get_today(),
            "reqd": 1,
            "width": "60px"
        },
        {
            "fieldname": "party",
            "label": "العميل",
            "fieldtype": "Link",
            "options": "Customer"
        },
        {
            "fieldname": "voucher_type",
            "label": "نوع السند",
            "fieldtype": "Data"
        },
        {
            "fieldname": "transaction",
            "label": "المعاملة",
            "fieldtype": "Link",
            "options": "Transaction",
            "get_query": function() {
                var customer = frappe.query_report.get_filter_value("party");
                if (customer) {
                    return {
                        filters: [
                            ["Transaction", "customer", "=", customer]
                        ]
                    };
                }
                return {};
            }
        }
    ]
};