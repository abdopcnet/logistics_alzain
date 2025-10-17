import frappe

@frappe.whitelist()
def fetch_expenses_for_invoice(customer, bol_no=None):
    """
    1) Whitelisted API to return customer expenses for Sales Invoice.
    2) Aggregates rows from Transaction, Delivery Order, Declaration Customs, and Trips.
    3) Input: customer (required), bol_no (optional). Output: list of dict rows.
    """
    query = """
        SELECT * FROM (
            SELECT 
                child.customer,
                parent.bol_no,
                child.date,
                'Transaction' AS doc,
                child.item,
                child.supplier,
                child.fee,
                child.sadad_no
            FROM `tabTransaction` parent
            JOIN `tabTransaction Fee` child ON parent.name = child.parent
            WHERE child.customer = %(customer)s

            UNION ALL

            SELECT 
                child.customer,
                parent.bol_no,
                child.date,
                'Delivery Order' AS doc,
                child.item,
                child.supplier,
                child.fee,
                child.sadad_no
            FROM `tabDelivery Order` parent
            JOIN `tabAgent Fee` child ON parent.name = child.parent
            WHERE child.customer = %(customer)s

            UNION ALL

            SELECT 
                child.customer,
                parent.bol_no,
                child.date,
                'Declaration Customs' AS doc,
                child.item,
                child.supplier,
                child.fee,
                child.sadad_no
            FROM `tabDeclaration Customs` parent
            JOIN `tabPort Fee` child ON parent.name = child.parent
            WHERE child.customer = %(customer)s

            UNION ALL

            SELECT 
                child.customer,
                parent.bol_no,
                child.date,
                'Trips' AS doc,
                child.item,
                child.supplier,
                child.fee,
                child.sadad_no
            FROM `tabTrips` parent
            JOIN `tabTrip stops` child ON parent.name = child.parent
            WHERE child.customer = %(customer)s
        ) AS combined
    """

    params = {'customer': customer}

    if bol_no:
        # 2) Optional filter by BOL number
        query += " WHERE bol_no = %(bol_no)s"
        params['bol_no'] = bol_no

    # 3) Execute query and return list of dicts
    expenses = frappe.db.sql(query, params, as_dict=True)

    return expenses
