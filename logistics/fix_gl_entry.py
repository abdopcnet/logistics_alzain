import frappe
from frappe import _


@frappe.whitelist()
def fetch_transaction_not_matched():
    """
    Fetch all Journal Entries where transaction fields are not matched.
    Returns data for dialog display.
    Compatible with AGENTS.md.
    """
    # Check fields exist
    je_meta = frappe.get_meta("Journal Entry")
    je_account_meta = frappe.get_meta("Journal Entry Account")
    gl_entry_meta = frappe.get_meta("GL Entry")

    if not je_meta.has_field("custom_transaction"):
        frappe.throw(_("custom_transaction field does not exist on Journal Entry"))

    if not je_account_meta.has_field("transaction"):
        frappe.throw(_("transaction field does not exist on Journal Entry Account"))

    if not gl_entry_meta.has_field("transaction"):
        frappe.throw(_("transaction field does not exist on GL Entry"))

    # Get Journal Entries with mismatched GL Entry transactions
    # Only fetch columns needed for dialog display
    result = frappe.db.sql("""
        SELECT
            je.name as journal_entry_name,
            je.custom_transaction,
            je.custom_customer,
            COALESCE(c.customer_name, je.custom_customer) as customer_name,
            je.custom_bol_no,
            gle.name as gl_entry_name,
            gle.account,
            gle.debit,
            gle.credit,
            gle.transaction as gl_transaction
        FROM `tabJournal Entry` je
        LEFT JOIN `tabCustomer` c ON je.custom_customer = c.name
        INNER JOIN `tabGL Entry` gle ON gle.voucher_type = 'Journal Entry'
            AND gle.voucher_no = je.name
            AND gle.docstatus = 1
            AND (gle.transaction IS NULL OR gle.transaction != je.custom_transaction)
        WHERE je.custom_transaction IS NOT NULL
            AND je.custom_transaction != ''
            AND je.docstatus < 2
        ORDER BY je.name, gle.name
    """, as_dict=True)

    return result


@frappe.whitelist()
def fix_transaction_relations(journal_entry_name):
    """
    Fix Transaction Relations for specific Journal Entry.
    Updates Journal Entry Account and GL Entry rows one by one (record by record).
    Uses shared internal function for consistency.
    Compatible with AGENTS.md.
    """
    if not journal_entry_name:
        frappe.throw(_("Journal Entry name is required"))

    # Check if Journal Entry exists
    if not frappe.db.exists("Journal Entry", journal_entry_name):
        frappe.throw(_("Journal Entry {0} does not exist").format(journal_entry_name))

    # Get Journal Entry custom_transaction value
    je_meta = frappe.get_meta("Journal Entry")
    if not je_meta.has_field("custom_transaction"):
        frappe.throw(_("custom_transaction field does not exist on Journal Entry"))

    custom_transaction_value = frappe.db.get_value("Journal Entry", journal_entry_name, "custom_transaction")
    if not custom_transaction_value:
        frappe.msgprint(_("Journal Entry {0} does not have custom_transaction value").format(journal_entry_name))
        return {"status": "skipped", "message": _("No custom_transaction value found")}

    # Check fields exist
    je_account_meta = frappe.get_meta("Journal Entry Account")
    gl_entry_meta = frappe.get_meta("GL Entry")
    has_jea_transaction = je_account_meta.has_field("transaction")
    has_gl_transaction = gl_entry_meta.has_field("transaction")

    if not has_jea_transaction and not has_gl_transaction:
        frappe.throw(_("transaction field does not exist on Journal Entry Account or GL Entry"))

    # Use shared internal function
    result = _fix_single_journal_entry(journal_entry_name)

    # Commit changes
    frappe.db.commit()

    return {
        "status": result.get("status", "success"),
        "journal_entry": journal_entry_name,
        "custom_transaction": custom_transaction_value,
        "updated_accounts": result.get("updated_accounts", 0),
        "updated_gl_entries": result.get("updated_gl_entries", 0),
        "message": _("Updated {0} accounts and {1} GL entries").format(
            result.get("updated_accounts", 0),
            result.get("updated_gl_entries", 0)
        )
    }


def _fix_single_journal_entry(journal_entry_name):
    """
    Internal function to fix a single Journal Entry.
    Used by both fix_transaction_relations and fix_all_not_matched.
    """
    custom_transaction_value = frappe.db.get_value("Journal Entry", journal_entry_name, "custom_transaction")
    if not custom_transaction_value:
        return {"status": "skipped", "message": _("No custom_transaction value found")}

    # Check fields exist
    je_account_meta = frappe.get_meta("Journal Entry Account")
    gl_entry_meta = frappe.get_meta("GL Entry")
    has_jea_transaction = je_account_meta.has_field("transaction")
    has_gl_transaction = gl_entry_meta.has_field("transaction")

    updated_accounts = 0
    updated_gl_entries = 0

    # Step 1: Update Journal Entry Account rows - one by one (record by record)
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

    # Step 2: Update GL Entry rows - one by one (record by record)
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

    return {
        "status": "success",
        "updated_accounts": updated_accounts,
        "updated_gl_entries": updated_gl_entries
    }


@frappe.whitelist()
def fix_all_not_matched(current_index=0):
    """
    Fix all Journal Entries where transaction fields are not matched.
    Updates all Journal Entry Account and GL Entry rows one by one (record by record).
    Returns progress information for progress bar.
    Compatible with AGENTS.md.

    Args:
        current_index: Current processing index (for progress tracking)
    """
    # Check fields exist
    je_meta = frappe.get_meta("Journal Entry")
    je_account_meta = frappe.get_meta("Journal Entry Account")
    gl_entry_meta = frappe.get_meta("GL Entry")

    if not je_meta.has_field("custom_transaction"):
        frappe.throw(_("custom_transaction field does not exist on Journal Entry"))

    if not je_account_meta.has_field("transaction"):
        frappe.throw(_("transaction field does not exist on Journal Entry Account"))

    if not gl_entry_meta.has_field("transaction"):
        frappe.throw(_("transaction field does not exist on GL Entry"))

    # Get all Journal Entries with mismatched GL Entry transactions
    journal_entries = frappe.db.sql("""
        SELECT DISTINCT
            je.name as journal_entry_name,
            je.custom_transaction
        FROM `tabJournal Entry` je
        INNER JOIN `tabGL Entry` gle ON gle.voucher_type = 'Journal Entry'
            AND gle.voucher_no = je.name
            AND gle.docstatus = 1
            AND (gle.transaction IS NULL OR gle.transaction != je.custom_transaction)
        WHERE je.custom_transaction IS NOT NULL
            AND je.custom_transaction != ''
            AND je.docstatus < 2
        ORDER BY je.name
    """, as_dict=True)

    total_journal_entries = len(journal_entries)
    current_index = int(current_index) if current_index else 0
    total_fixed = 0
    total_accounts = 0
    total_gl_entries = 0
    errors = []

    # Process each Journal Entry one by one (record by record) for safety
    # Process 10 records at a time to allow progress updates
    batch_size = 10
    end_index = min(current_index + batch_size, total_journal_entries)

    for idx in range(current_index, end_index):
        je = journal_entries[idx]
        try:
            result = _fix_single_journal_entry(je.journal_entry_name)

            if result.get("status") == "success":
                total_fixed += 1
                total_accounts += result.get("updated_accounts", 0)
                total_gl_entries += result.get("updated_gl_entries", 0)

        except Exception as e:
            errors.append({
                "journal_entry": je.journal_entry_name,
                "error": str(e)
            })
            frappe.log_error(
                f"Error fixing Journal Entry {je.journal_entry_name}",
                "fix_all_not_matched"
            )

    # Commit changes after each batch
    frappe.db.commit()

    # Check if more records to process
    has_more = end_index < total_journal_entries
    progress_percent = int((end_index / total_journal_entries) * 100) if total_journal_entries > 0 else 100

    return {
        "status": "in_progress" if has_more else "success",
        "current_index": end_index,
        "total_journal_entries": total_journal_entries,
        "total_fixed": total_fixed,
        "total_accounts_fixed": total_accounts,
        "total_gl_entries_fixed": total_gl_entries,
        "progress_percent": progress_percent,
        "remaining": total_journal_entries - end_index,
        "has_more": has_more,
        "errors": errors if errors else None,
        "message": _("تم بنجاح تحديث السجلات الغير متطابقة: {0} Journal Entry, {1} Account, {2} GL Entry").format(
            total_fixed, total_accounts, total_gl_entries
        ) if not has_more else _("جارٍ المعالجة: {0} من {1}").format(end_index, total_journal_entries)
    }
