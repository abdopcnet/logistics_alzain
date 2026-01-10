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


def on_submit(doc, method=None):
    """
    After Journal Entry is submitted, copy transaction from Journal Entry Account to GL Entry.
    This ensures transaction field is available in General Ledger for reporting.
    Compatible with AGENTS.md.
    """
    if not doc.accounts:
        return

    # Check if transaction field exists on GL Entry
    gl_entry_meta = frappe.get_meta("GL Entry")
    if not gl_entry_meta.has_field("transaction"):
        return

    # Check if transaction field exists on Journal Entry Account
    je_account_meta = frappe.get_meta("Journal Entry Account")
    if not je_account_meta.has_field("transaction"):
        return

    # Get GL Entries for this Journal Entry
    gl_entries = frappe.get_all(
        "GL Entry",
        filters={
            "voucher_type": "Journal Entry",
            "voucher_no": doc.name,
            "docstatus": 1
        },
        fields=["name", "voucher_detail_no"],
        limit=0
    )

    if not gl_entries:
        return

    # Map Journal Entry Account names to transaction values
    account_transaction_map = {}
    for account_row in doc.accounts:
        if account_row.transaction and account_row.name:
            account_transaction_map[account_row.name] = account_row.transaction

    if not account_transaction_map:
        return

    # Update GL Entries with transaction value from Journal Entry Account
    for gl_entry in gl_entries:
        if gl_entry.voucher_detail_no and gl_entry.voucher_detail_no in account_transaction_map:
            transaction_value = account_transaction_map[gl_entry.voucher_detail_no]
            frappe.db.set_value(
                "GL Entry",
                gl_entry.name,
                "transaction",
                transaction_value,
                update_modified=False
            )

    frappe.db.commit()


def update_specific_journal_entry(journal_entry_name="ACC-JV-2026-00325"):
    """
    Update specific Journal Entry Account and GL Entry rows.
    Compatible with AGENTS.md - uses frappe.db.set_value() method.

    Usage from bench:
    bench --site site.local execute logistics.journal_entry.update_specific_journal_entry

    Or with parameter:
    bench --site site.local execute logistics.journal_entry.update_specific_journal_entry --kwargs '{"journal_entry_name": "ACC-JV-2026-00325"}'
    """
    if not journal_entry_name:
        print("Error: Journal Entry name is required")
        return

    # Check if Journal Entry exists
    if not frappe.db.exists("Journal Entry", journal_entry_name):
        print(f"Error: Journal Entry {journal_entry_name} does not exist")
        return

    # Get Journal Entry custom_transaction value
    je_meta = frappe.get_meta("Journal Entry")
    if not je_meta.has_field("custom_transaction"):
        print("Error: custom_transaction field does not exist on Journal Entry")
        return

    custom_transaction_value = frappe.db.get_value("Journal Entry", journal_entry_name, "custom_transaction")
    if not custom_transaction_value:
        print(f"Info: Journal Entry {journal_entry_name} does not have custom_transaction value")
        return

    # Check fields exist
    je_account_meta = frappe.get_meta("Journal Entry Account")
    gl_entry_meta = frappe.get_meta("GL Entry")
    has_jea_transaction = je_account_meta.has_field("transaction")
    has_gl_transaction = gl_entry_meta.has_field("transaction")

    if not has_jea_transaction and not has_gl_transaction:
        print("Error: transaction field does not exist on Journal Entry Account or GL Entry")
        return

    updated_accounts = 0
    updated_gl_entries = 0

    # Step 1: Update Journal Entry Account rows using frappe.db.set_value()
    if has_jea_transaction:
        accounts = frappe.get_all(
            "Journal Entry Account",
            filters={"parent": journal_entry_name, "parenttype": "Journal Entry"},
            fields=["name", "transaction"],
            limit=0
        )

        for acc in accounts:
            if not acc.get("transaction") or acc.get("transaction") != custom_transaction_value:
                frappe.db.set_value(
                    "Journal Entry Account",
                    acc.name,
                    "transaction",
                    custom_transaction_value,
                    update_modified=False
                )
                updated_accounts += 1
                print(f"Updated Journal Entry Account: {acc.name} -> transaction = {custom_transaction_value}")

    # Step 2: Update GL Entry rows using frappe.db.set_value()
    if has_gl_transaction:
        gl_entries = frappe.get_all(
            "GL Entry",
            filters={
                "voucher_type": "Journal Entry",
                "voucher_no": journal_entry_name,
                "docstatus": 1
            },
            fields=["name", "transaction"],
            limit=0
        )

        for gl_entry in gl_entries:
            if not gl_entry.get("transaction") or gl_entry.get("transaction") != custom_transaction_value:
                frappe.db.set_value(
                    "GL Entry",
                    gl_entry.name,
                    "transaction",
                    custom_transaction_value,
                    update_modified=False
                )
                updated_gl_entries += 1
                print(f"Updated GL Entry: {gl_entry.name} -> transaction = {custom_transaction_value}")

    # Commit changes
    frappe.db.commit()

    result = {
        "status": "success",
        "journal_entry": journal_entry_name,
        "custom_transaction": custom_transaction_value,
        "updated_accounts": updated_accounts,
        "updated_gl_entries": updated_gl_entries
    }

    print(f"\n✅ Success: Updated {updated_accounts} Journal Entry Accounts and {updated_gl_entries} GL Entries")
    print(f"   Journal Entry: {journal_entry_name}")
    print(f"   Transaction: {custom_transaction_value}")

    return result


# Functions are now in fix_gl_entry.py module
# Use logistics.fix_gl_entry.fix_transaction_relations
# Use logistics.fix_gl_entry.fetch_transaction_not_matched
# Use logistics.fix_gl_entry.fix_all_not_matched
