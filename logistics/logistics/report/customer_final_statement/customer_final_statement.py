# Copyright (c) 2026, Logistics and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.utils import flt, getdate

def execute(filters=None):
    if not filters:
        filters = {}
    
    columns = get_columns()
    data = get_data(filters)
    
    return columns, data

def get_columns():
    return [
        {"label": _("Voucher No"), "fieldname": "name", "fieldtype": "Data", "width": 193},
        {"label": _("Customer Name"), "fieldname": "customer_name", "fieldtype": "Data", "width": 265},
        {"label": _("Status"), "fieldname": "status", "fieldtype": "Data", "width": 88},
        {"label": _("Transaction"), "fieldname": "transaction", "fieldtype": "Data", "width": 141},
        {"label": _("BoL No"), "fieldname": "custom_bol_no", "fieldtype": "Data", "width": 175},
        {"label": _("Declaration No"), "fieldname": "custom_declaration_no", "fieldtype": "Data", "width": 103},
        {"label": _("Date"), "fieldname": "posting_date", "fieldtype": "Date", "width": 127},
        {"label": _("Invoice Amount"), "fieldname": "grand_total", "fieldtype": "Currency", "width": 116},
        {"label": _("Total Expenses"), "fieldname": "custom_total_expenses", "fieldtype": "Currency", "width": 120},
        {"label": _("Expenses & Grand"), "fieldname": "custom_expenses_and_grand", "fieldtype": "Currency", "width": 120},
        {"label": _("Debit"), "fieldname": "debit", "fieldtype": "Currency", "width": 120},
        {"label": _("Credit"), "fieldname": "credit", "fieldtype": "Currency", "width": 120},
        {"label": _("Balance"), "fieldname": "balance", "fieldtype": "Currency", "width": 140}
    ]

def get_data(filters):
    if not filters.get("customer"):
        return []

    company = filters.get("company")
    customer = filters.get("customer")
    from_date = getdate(filters.get("from_date"))
    to_date = getdate(filters.get("to_date"))

    # 1. Opening Balance Calculation
    inv_opening = frappe.db.sql("""
        SELECT SUM(custom_expenses_and_grand)
        FROM `tabSales Invoice`
        WHERE customer = %s AND posting_date < %s AND company = %s AND docstatus = 1
    """, (customer, from_date, company))[0][0] or 0.0

    pay_opening = frappe.db.sql("""
        SELECT SUM(received_amount)
        FROM `tabPayment Entry`
        WHERE party = %s AND posting_date < %s AND company = %s AND docstatus = 1
    """, (customer, from_date, company))[0][0] or 0.0
    
    jv_opening = frappe.db.sql("""
        SELECT SUM(credit - debit)
        FROM `tabJournal Entry Account` jea
        JOIN `tabJournal Entry` je ON jea.parent = je.name
        WHERE jea.party = %s AND je.posting_date < %s AND je.company = %s AND je.docstatus = 1
        AND jea.party_type = 'Customer'
    """, (customer, from_date, company))[0][0] or 0.0

    opening_balance = flt(inv_opening) - (flt(pay_opening) + flt(jv_opening))

    data = []
    data.append({
        "posting_date": from_date,
        "customer_name": _("Opening Balance"),
        "balance": opening_balance
    })

    running_balance = opening_balance

    # 2. Fetch all Invoices in the period
    invoices = frappe.db.get_all("Sales Invoice", 
        filters={
            "customer": customer,
            "company": company,
            "docstatus": 1,
            "posting_date": ["between", [from_date, to_date]]
        },
        fields=[
            "name", "customer", "customer_name", "status", "transaction", 
            "custom_bol_no", "custom_declaration_no", "posting_date", 
            "grand_total", "custom_total_expenses", "custom_expenses_and_grand"
        ],
        order_by="posting_date asc"
    )

    # 3. Fetch all Payment Entries and their allocations in the period
    period_payments = frappe.db.sql("""
        SELECT name, posting_date, received_amount, status, reference_no, 'Payment Entry' as type
        FROM `tabPayment Entry`
        WHERE party = %s AND company = %s AND docstatus = 1
        AND posting_date BETWEEN %s AND %s
    """, (customer, company, from_date, to_date), as_dict=1)

    allocations = frappe.db.sql("""
        SELECT 
            per.parent as payment, per.reference_name as invoice, 
            per.allocated_amount as amount, 'Payment Entry' as type
        FROM `tabPayment Entry Reference` per
        JOIN `tabPayment Entry` pe ON per.parent = pe.name
        WHERE per.reference_doctype = 'Sales Invoice' AND pe.docstatus = 1
        AND (
            pe.posting_date BETWEEN %s AND %s 
            OR per.reference_name IN (SELECT name FROM `tabSales Invoice` WHERE customer = %s AND docstatus = 1)
        )
    """, (from_date, to_date, customer), as_dict=1)

    invoice_alloc_map = {}
    payment_alloc_map = {}
    for a in allocations:
        invoice_alloc_map.setdefault(a.invoice, []).append(a)
        payment_alloc_map.setdefault(a.payment, []).append(a)

    processed_invoices = set()
    handled_payment_parts = set() 

    # 4. Display Logic
    for inv in invoices:
        inv.voucher_type = "Sales Invoice"
        inv.debit = flt(inv.custom_expenses_and_grand)
        inv.credit = 0
        running_balance += inv.debit
        inv.balance = running_balance
        data.append(inv)
        processed_invoices.add(inv.name)

        if inv.name in invoice_alloc_map:
            for al in invoice_alloc_map[inv.name]:
                pay_info = frappe.db.get_value("Payment Entry", al.payment, ["posting_date", "status", "reference_no"], as_dict=1)
                if pay_info:
                    p_date = getdate(pay_info.posting_date)
                    if from_date <= p_date <= to_date:
                        running_balance -= flt(al.amount)
                        data.append({
                            "name": al.payment,
                            "voucher_type": "Payment Entry",
                            "customer": customer,
                            "customer_name": f"{_('Payment for')} {inv.name}",
                            "transaction": pay_info.reference_no,
                            "posting_date": p_date,
                            "status": pay_info.status,
                            "debit": 0,
                            "credit": flt(al.amount),
                            "balance": running_balance
                        })
                        handled_payment_parts.add(f"{al.payment}|{inv.name}")

    # 5. Handle Allocated Payments in period for OLD Invoices
    all_allocations = sorted(allocations, key=lambda x: x.payment)
    for p in all_allocations:
        pay_info = frappe.db.get_value("Payment Entry", p.payment, ["posting_date", "status", "reference_no"], as_dict=1)
        if not pay_info: continue
        p_date = getdate(pay_info.posting_date)
        if from_date <= p_date <= to_date:
            if f"{p.payment}|{p.invoice}" not in handled_payment_parts:
                inv_date = frappe.db.get_value("Sales Invoice", p.invoice, "posting_date")
                if inv_date and inv_date < from_date:
                    header_key = f"OLD_HEADER|{p.invoice}"
                    if header_key not in processed_invoices:
                        inv_basic = frappe.db.get_value("Sales Invoice", p.invoice, ["posting_date", "customer_name", "custom_bol_no", "transaction"], as_dict=1)
                        if inv_basic:
                            data.append({
                                "name": p.invoice,
                                "voucher_type": "Sales Invoice",
                                "customer": customer,
                                "customer_name": f"{inv_basic.customer_name} ({_('Old Invoice')})",
                                "posting_date": inv_basic.posting_date,
                                "custom_bol_no": inv_basic.custom_bol_no,
                                "transaction": inv_basic.transaction,
                                "debit": 0, "credit": 0, "balance": running_balance
                            })
                            processed_invoices.add(header_key)

                    running_balance -= flt(p.amount)
                    data.append({
                        "name": p.payment,
                        "voucher_type": "Payment Entry",
                        "customer": customer,
                        "customer_name": f"{_('Payment for')} {p.invoice}",
                        "transaction": pay_info.reference_no,
                        "posting_date": p_date,
                        "status": pay_info.status,
                        "debit": 0,
                        "credit": flt(p.amount),
                        "balance": running_balance
                    })
                    handled_payment_parts.add(f"{p.payment}|{p.invoice}")

    # 6. Handle UNALLOCATED parts of Period Payments (Advances)
    for pay in period_payments:
        pmt_name = pay.name
        total_allocated = sum(flt(al.amount) for al in payment_alloc_map.get(pmt_name, []))
        unallocated = flt(pay.received_amount) - total_allocated
        
        if unallocated > 0.01:
            running_balance -= unallocated
            data.append({
                "name": pmt_name,
                "voucher_type": "Payment Entry",
                "customer": customer,
                "customer_name": _("Advance / Unallocated Payment"),
                "transaction": pay.reference_no,
                "posting_date": getdate(pay.posting_date),
                "status": pay.status,
                "debit": 0,
                "credit": unallocated,
                "balance": running_balance
            })

    # Total Row
    if data:
        tot_debit = sum(flt(d.get("debit")) for d in data if d.get("customer_name") != _("Opening Balance"))
        tot_credit = sum(flt(d.get("credit")) for d in data if d.get("customer_name") != _("Opening Balance"))
        data.append({
            "customer_name": _("Total"),
            "debit": tot_debit, "credit": tot_credit, "balance": running_balance
        })

    return data
