import frappe
from frappe import _
from datetime import datetime
from collections import defaultdict

def execute(filters=None):
    if not filters:
        filters = {}

    # 1. Fetch all raw data first, with running balances
    raw_data = get_data(filters)

    # 2. Process the data: group Journal Entries, keep others detailed
    processed_data = process_data_for_display(raw_data)

    # 3. Always use the 'mixed' column set now, as it caters to both scenarios
    columns = get_mixed_columns()

    return columns, processed_data

def get_detailed_columns():
    """Returns columns for the standard, detailed GL Entry view. No width specified, columns auto-size."""
    columns = [
        {"fieldname": "owner", "label": _("المالك"), "fieldtype": "Link", "options": "User", "width": 120},
        {"fieldname": "posting_date", "label": _("تاريخ القيد"), "fieldtype": "Date", "width": 110},
        {"fieldname": "party_type", "label": _("نوع الطرف"), "fieldtype": "Select", "options": "Customer\nSupplier", "width": 110},
        {"fieldname": "party", "label": _("الطرف"), "fieldtype": "Dynamic Link", "options": "party_type", "width": 180},
        {"fieldname": "voucher_type", "label": _("نوع السند"), "fieldtype": "Data", "width": 120},
        {"fieldname": "voucher_no", "label": _("رقم السند"), "fieldtype": "Dynamic Link", "options": "voucher_type", "width": 180},
        {"fieldname": "transaction", "label": _("المعاملة"), "fieldtype": "Data", "width": 160},
        {"fieldname": "debit", "label": _("مدين"), "fieldtype": "Currency", "width": 120},
        {"fieldname": "credit", "label": _("دائن"), "fieldtype": "Currency", "width": 120},
        {"fieldname": "balance", "label": _("الرصيد المتحرك"), "fieldtype": "Currency", "width": 140},
    ]
    return columns

def get_mixed_columns():
    """
    Returns a comprehensive set of columns that can display both detailed
    and grouped Journal Entry data, using single Debit/Credit columns.
    Now: No width specified, so columns auto-size based on content.
    """
    columns = [
        {"fieldname": "owner", "label": _("المالك"), "fieldtype": "Link", "options": "User", "width": 120},
        {"fieldname": "posting_date", "label": _("تاريخ القيد"), "fieldtype": "Date", "width": 110},
        {"fieldname": "party_type", "label": _("نوع الطرف"), "fieldtype": "Select", "options": "Customer\nSupplier", "width": 110},
        {"fieldname": "party", "label": _("الطرف"), "fieldtype": "Dynamic Link", "options": "party_type", "width": 180},
        {"fieldname": "voucher_type", "label": _("نوع السند"), "fieldtype": "Data", "width": 120},
        {"fieldname": "voucher_no", "label": _("رقم السند"), "fieldtype": "Data", "width": 180},
        {"fieldname": "transaction", "label": _("المعاملة"), "fieldtype": "Data", "width": 160},
        {"fieldname": "debit", "label": _("مدين"), "fieldtype": "Currency", "width": 120},
        {"fieldname": "credit", "label": _("دائن"), "fieldtype": "Currency", "width": 120},
        {"fieldname": "balance", "label": _("الرصيد المتحرك"), "fieldtype": "Currency", "width": 140},
    ]
    return columns


def get_data(filters):
    conditions = []
    values = {}

    # اجعل الفلترة دائمًا على العملاء فقط
    conditions.append("party_type = 'Customer'")

    # التزم فقط بفلاتر JS
    if filters.get("from_date"):
        conditions.append("posting_date >= %(from_date)s")
        values["from_date"] = filters["from_date"]
    if filters.get("to_date"):
        conditions.append("posting_date <= %(to_date)s")
        values["to_date"] = filters["to_date"]
    if filters.get("party"):
        conditions.append("party = %(party)s")
        values["party"] = filters["party"]
    if filters.get("voucher_type"):
        conditions.append("voucher_type = %(voucher_type)s")
        values["voucher_type"] = filters["voucher_type"]
    if filters.get("transaction"):
        conditions.append("transaction = %(transaction)s")
        values["transaction"] = filters["transaction"]
    conditions.append("is_cancelled = 0")

    where_clause = f"WHERE {' AND '.join(conditions)}" if conditions else ""
    query = f"""
        SELECT
            owner, posting_date, party_type, party, voucher_type, voucher_no, transaction, debit, credit
        FROM `tabGL Entry`
        {where_clause}
        ORDER BY posting_date ASC, party_type ASC, party ASC, name ASC
    """
    rows = frappe.db.sql(query, values, as_dict=1)

    # Calculate running balance per party
    balance_map = {}
    for row in rows:
        key = (row.get('party_type'), row.get('party'))
        if key not in balance_map:
            balance_map[key] = 0
        balance_map[key] += (row.get('debit') or 0) - (row.get('credit') or 0)
        row['balance'] = balance_map[key]
    return rows

def process_data_for_display(raw_data):
    final_data = []
    je_grouped_results = defaultdict(lambda: {
        "transaction": "",
        "debit": 0.0,
        "credit": 0.0,
        "party_type": "",
        "party": "",
        "voucher_type": _("Journal Entry"),
        "voucher_no": _("مصاريف المعاملة"),
        "owner": "",
        "posting_date": None,
        "balance": 0.0
    })

    journal_entries = []
    other_entries = []
    je_no_transaction = []

    for row in raw_data:
        row_voucher_type = str(row.get("voucher_type") or '')
        if row_voucher_type == "Journal Entry":
            transaction_key = str(row.get('transaction') or '')
            if transaction_key:
                journal_entries.append(row)
            else:
                je_no_transaction.append(row)
        else:
            other_entries.append(row)

    for row in journal_entries:
        transaction_key = str(row.get('transaction') or '')
        if transaction_key:
            if je_grouped_results[transaction_key]["transaction"] == "":
                je_grouped_results[transaction_key]["transaction"] = transaction_key
                je_grouped_results[transaction_key]["owner"] = str(row.get("owner") or '')
                je_grouped_results[transaction_key]["posting_date"] = row.get("posting_date")
                je_grouped_results[transaction_key]["party_type"] = str(row.get('party_type') or '')
                je_grouped_results[transaction_key]["party"] = str(row.get('party') or '')
            je_grouped_results[transaction_key]["debit"] += (row.get('debit') or 0)
            je_grouped_results[transaction_key]["credit"] += (row.get('credit') or 0)

    final_data.extend(list(je_grouped_results.values()))
    final_data.extend(je_no_transaction)
    final_data.extend(other_entries)

    final_data.sort(key=lambda x: (
        x.get('posting_date') or datetime.min,
        str(x.get('party_type', '') or ''),
        str(x.get('party', '') or ''),
        str(x.get('transaction', '') or ''),
        str(x.get('name', '') or '')
    ))

    current_balance_map = {}
    total_debit = 0
    total_credit = 0
    last_balance = 0
    for row in final_data:
        key = (str(row.get('party_type') or ''), str(row.get('party') or ''))
        if key not in current_balance_map:
            current_balance_map[key] = 0
        net_effect = (row.get('debit') or 0) - (row.get('credit') or 0)
        row.pop('total_debit', None)
        row.pop('total_credit', None)
        row.pop('transaction_balance', None)
        current_balance_map[key] += net_effect
        row['balance'] = current_balance_map[key]
        total_debit += (row.get('debit') or 0)
        total_credit += (row.get('credit') or 0)
        last_balance = current_balance_map[key]

    # Add total row at the end
    total_row = {
        "owner": "",
        "posting_date": None,
        "party_type": "",
        "party": "",
        "voucher_type": _("Total"),
        "voucher_no": "",
        "transaction": "",
        "debit": total_debit,
        "credit": total_credit,
        "balance": last_balance
    }
    final_data.append(total_row)

    return final_data