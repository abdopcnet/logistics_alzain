# 1. DeliveryOrder: main logic (validation, protection)
import frappe
from frappe.model.document import Document

class DeliveryOrder(Document):
    PROTECTED_EDIT_FIELDS = {'item', 'supplier', 'bank', 'debit_account', 'fee'}

    # 1.1 Validate: prevent deleting protected rows if linked to submitted JE
    def validate(self):
        # 1.1.1 Only on update
        if self.name and frappe.db.exists(self.doctype, self.name):
            old_doc = frappe.get_doc(self.doctype, self.name)
            old_fees = getattr(old_doc, 'table_uuzw', [])
            new_fees = getattr(self, 'table_uuzw', [])
            # 1.1.2 Find deleted rows
            deleted = [row for row in old_fees if row.name not in [r.name for r in new_fees]]
            for row in deleted:
                # 1.1.3 Prevent delete if linked to submitted JE
                if row.reference_doc:
                    je = frappe.get_doc('Journal Entry', row.reference_doc)
                    if je.docstatus == 1:
                        frappe.throw(f"Cannot delete row linked to submitted JE: {row.reference_doc}")
        # 1.2 Auto-fill customer, transaction, and bol_no in all child rows if missing
        for row in self.table_uuzw:
            if not row.customer:
                row.customer = self.customer
            if not row.transaction:
                row.transaction = self.transaction_no
            if not row.bol_no:
                row.bol_no = self.bol_no
        # 1.3 Prevent delete/edit if linked to submitted JE (duplicate logic for safety)
        if not self.is_new():
            old_doc = frappe.get_doc(self.doctype, self.name)
            old_fees = old_doc.get('table_uuzw') or []
            new_fees = self.get('table_uuzw') or []
            deleted = [row for row in old_fees if not any(nr.name == row.name for nr in new_fees)]
            for row in deleted:
                if row.reference_doc and frappe.db.get_value('Journal Entry', row.reference_doc, 'docstatus') == 1:
                    frappe.throw(f"<b>{row.reference_doc}</b> Cannot delete: linked to submitted JE ❌", title='Alert')
            # 1.4 Prevent editing protected fields if linked to submitted JE
            for new_row in new_fees:
                if new_row.reference_doc and frappe.db.get_value('Journal Entry', new_row.reference_doc, 'docstatus') == 1:
                    old_row = next((r for r in old_fees if r.name == new_row.name), None)
                    if old_row:
                        for field in self.PROTECTED_EDIT_FIELDS:
                            if getattr(new_row, field, None) != getattr(old_row, field, None):
                                frappe.throw(f"<b>{new_row.reference_doc}</b> Cannot edit field <b>{field}</b> in row linked to submitted JE ❌", title='Alert')