# Copyright (c) 2025, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from datetime import datetime

def execute(filters=None):
    if not filters:
        filters = {}
    columns = get_columns()
    data = get_data(filters)
    # تأكد من إضافة عمود الرصيد في النتائج
    for row in data:
        if 'balance' not in row:
            row['balance'] = 0
    return columns, data

def get_columns():
    columns = [
        {"fieldname": "owner", "label": _("Owner"), "fieldtype": "Link", "options": "User", "width": 120},
        {"fieldname": "posting_date", "label": _("Posting Date"), "fieldtype": "Date", "width": 100},
        {"fieldname": "party_type", "label": _("Party Type"), "fieldtype": "Select", "options": "Customer\nSupplier", "width": 120},
        {"fieldname": "party", "label": _("Party"), "fieldtype": "Dynamic Link", "options": "party_type", "width": 160},
        {"fieldname": "voucher_type", "label": _("Voucher Type"), "fieldtype": "Data", "width": 120},
        {"fieldname": "voucher_no", "label": _("Voucher No"), "fieldtype": "Dynamic Link", "options": "voucher_type", "width": 120},
        {"fieldname": "transaction", "label": _("Transaction"), "fieldtype": "Data", "width": 120},
        {"fieldname": "debit", "label": _("Debit"), "fieldtype": "Currency", "width": 120},
        {"fieldname": "credit", "label": _("Credit"), "fieldtype": "Currency", "width": 120},
        {"fieldname": "balance", "label": _("Balance"), "fieldtype": "Currency", "width": 120},
    ]
    return columns

def get_data(filters):
    conditions = []
    values = {}
    # Filters (remove debit/credit filters)
    if filters.get("owner"):
        conditions.append("owner = %(owner)s")
        values["owner"] = filters["owner"]
    # لا تستخدم فلتر posting_date من الفلاتر، بل استخدم فقط from_date و to_date
    # if filters.get("posting_date"):
    #     conditions.append("posting_date = %(posting_date)s")
    #     values["posting_date"] = filters["posting_date"]
    # تأكد أن الفلترة على posting_date تتم بشكل صحيح (بدون تحويلات غير ضرورية)
    if filters.get("from_date"):
        conditions.append("posting_date >= %(from_date)s")
        values["from_date"] = filters["from_date"]
    if filters.get("to_date"):
        conditions.append("posting_date <= %(to_date)s")
        values["to_date"] = filters["to_date"]
    if filters.get("party_type"):
        conditions.append("party_type = %(party_type)s")
        values["party_type"] = filters["party_type"]
    if filters.get("party"):
        conditions.append("party = %(party)s")
        values["party"] = filters["party"]
    if filters.get("voucher_type"):
        conditions.append("voucher_type = %(voucher_type)s")
        values["voucher_type"] = filters["voucher_type"]
    if filters.get("voucher_no"):
        conditions.append("voucher_no = %(voucher_no)s")
        values["voucher_no"] = filters["voucher_no"]
    if filters.get("transaction"):
        conditions.append("transaction = %(transaction)s")
        values["transaction"] = filters["transaction"]
    # لا تعرض السجلات الملغية
    conditions.append("is_cancelled = 0")

    where_clause = f"WHERE {' AND '.join(conditions)}" if conditions else ""
    query = f"""
        SELECT
            owner, posting_date, party_type, party, voucher_type, voucher_no, transaction, debit, credit
        FROM `tabGL Entry`
        {where_clause}
        ORDER BY posting_date, party_type, party, name
    """
    rows = frappe.db.sql(query, values, as_dict=1)

    # حساب الرصيد المتراكم مثل General Ledger (حسب party_type و party)
    balance_map = {}
    for row in rows:
        key = (row.get('party_type'), row.get('party'))
        if key not in balance_map:
            balance_map[key] = 0
        balance_map[key] += (row.get('debit') or 0) - (row.get('credit') or 0)
        row['balance'] = balance_map[key]
    return rows