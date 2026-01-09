import frappe
from frappe import _


def before_save(doc, method=None):
    """
    Copy custom_transaction from Journal Entry to all Journal Entry Account rows.
    Compatible with AGENTS.md - uses frappe.get_meta() which includes custom fields automatically.
    """
    if not doc.accounts:
        return

    # Check if custom_transaction field exists on Journal Entry
    # frappe.get_meta() automatically includes custom fields
    je_meta = frappe.get_meta("Journal Entry")
    if not je_meta.has_field("custom_transaction"):
        return

    # Check if transaction field exists on Journal Entry Account
    je_account_meta = frappe.get_meta("Journal Entry Account")
    if not je_account_meta.has_field("transaction"):
        return

    # Get custom_transaction value safely
    custom_transaction_value = doc.get("custom_transaction")
    if not custom_transaction_value:
        return

    # Copy value to all account rows
    for row in doc.accounts:
        row.transaction = custom_transaction_value
