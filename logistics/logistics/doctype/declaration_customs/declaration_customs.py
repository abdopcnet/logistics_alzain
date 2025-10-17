# 1. DeclarationCustoms class definition
import frappe
from frappe.model.document import Document

class DeclarationCustoms(Document):
    PROTECTED_EDIT_FIELDS = {'item', 'supplier', 'bank', 'debit_account', 'fee'}

    # 2. Validate: Prevent deleting protected rows in table_myde if linked to submitted Journal Entry
    def validate(self):
        # 2.1 Only check on update (not new)
        if self.name and frappe.db.exists(self.doctype, self.name):
            old_doc = frappe.get_doc(self.doctype, self.name)
            old_fees = getattr(old_doc, 'table_myde', [])
            new_fees = getattr(self, 'table_myde', [])
            # 2.2 Find deleted rows
            deleted = [row for row in old_fees if row.name not in [r.name for r in new_fees]]
            for row in deleted:
                # 2.3 Check reference_doc and Journal Entry status
                if row.reference_doc:
                    je = frappe.get_doc('Journal Entry', row.reference_doc)
                    if je.docstatus == 1:
                        frappe.throw(f"لا يمكن حذف السطر المرتبط بقيد محاسبي معتمد: {row.reference_doc}")
        # 1. Update customer, transaction, and bol_no in all child rows of table_myde only if missing (not set)
        for row in self.table_myde:
            if not row.customer:
                row.customer = self.exporter_importer
            if not row.transaction:
                row.transaction = self.transaction_no
            if not row.bol_no:
                row.bol_no = self.bol_no

        if not self.is_new():
            old_doc = frappe.get_doc(self.doctype, self.name)
            old_fees = old_doc.get('table_myde') or []
            new_fees = self.get('table_myde') or []
            # Find deleted rows
            deleted = [row for row in old_fees if not any(nr.name == row.name for nr in new_fees)]
            for row in deleted:
                if row.reference_doc and frappe.db.get_value('Journal Entry', row.reference_doc, 'docstatus') == 1:
                    frappe.throw(f"<b>{row.reference_doc}</b> لا يمكن حذف المصروف لأنه مرتبط بقيد مرحل رقم❌", title='تنبيه')
            # Prevent editing protected fields if reference_doc is linked to submitted Journal Entry
            for new_row in new_fees:
                if new_row.reference_doc and frappe.db.get_value('Journal Entry', new_row.reference_doc, 'docstatus') == 1:
                    old_row = next((r for r in old_fees if r.name == new_row.name), None)
                    if old_row:
                        for field in self.PROTECTED_EDIT_FIELDS:
                            if getattr(new_row, field, None) != getattr(old_row, field, None):
                                frappe.throw(f"<b>{new_row.reference_doc}</b> لا يمكن تعديل الحقل <b>{field}</b> في السطر المرتبط بقيد محاسبي معتمد❌", title='تنبيه')