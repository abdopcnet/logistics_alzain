# 1. Transaction class definition
import frappe
from frappe.model.document import Document

class Transaction(Document):
    PROTECTED_EDIT_FIELDS = {'item', 'supplier', 'bank', 'debit_account', 'fee'}

    # 2. Validate: Prevent deleting protected rows in table_clyq if linked to submitted Journal Entry
    def validate(self):
        # 2.1 Only check on update (not new)
        if self.name and frappe.db.exists(self.doctype, self.name):
            old_doc = frappe.get_doc(self.doctype, self.name)
            old_fees = getattr(old_doc, 'table_clyq', [])
            new_fees = getattr(self, 'table_clyq', [])
            # 2.2 Find deleted rows
            deleted = [row for row in old_fees if row.name not in [r.name for r in new_fees]]
            for row in deleted:
                # 2.3 Check reference_doc and Journal Entry status
                if row.reference_doc:
                    je = frappe.get_doc('Journal Entry', row.reference_doc)
                    if je.docstatus == 1:
                        frappe.throw(f"لا يمكن حذف السطر المرتبط بقيد محاسبي معتمد: {row.reference_doc}")
        # 1. Update customer, transaction, and bol_no in all child rows of table_clyq only if missing (not set)
        for row in self.table_clyq:
            if not row.customer:
                row.customer = self.customer
            if not row.transaction:
                row.transaction = self.name
            if not row.bol_no:
                row.bol_no = self.bol_no

        if not self.is_new():
            old_doc = frappe.get_doc(self.doctype, self.name)
            old_fees = old_doc.get('table_clyq') or []
            new_fees = self.get('table_clyq') or []
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

    def after_save(self):
        # 2. Update related Delivery Order and Declaration Customs records after save
        # Update Delivery Order
        if frappe.db.exists("Delivery Order", {"transaction_no": self.name}):
            delivery_orders = frappe.get_all("Delivery Order", filters={"transaction_no": self.name}, fields=["name"])
            for do in delivery_orders:
                delivery_order = frappe.get_doc("Delivery Order", do.name)
                delivery_order.customer = self.customer
                delivery_order.importer_no = self.importer_no
                delivery_order.shipping_line = self.shipping_line
                delivery_order.notify = self.notify
                delivery_order.shipping_line_agent = self.shipping_line_agent
                delivery_order.vessel = self.vessel
                delivery_order.voyage_no = self.voyage_no
                delivery_order.discharge_port = self.discharge_port
                delivery_order.fcl = self.fcl
                delivery_order.cbm = self.cbm
                delivery_order.roro = self.roro
                delivery_order.save(ignore_permissions=True)
        # Update Declaration Customs
        if frappe.db.exists("Declaration Customs", {"transaction_no": self.name}):
            declaration_customs = frappe.get_all("Declaration Customs", filters={"transaction_no": self.name}, fields=["name"])
            for dc in declaration_customs:
                declaration_customs_doc = frappe.get_doc("Declaration Customs", dc.name)
                declaration_customs_doc.customer = self.customer
                declaration_customs_doc.importer_no = self.importer_no
                declaration_customs_doc.document_ref_no = self.document_ref_no
                declaration_customs_doc.bol_no = self.bol_no
                declaration_customs_doc.port_type = self.port_type
                declaration_customs_doc.export_country = self.export_country
                declaration_customs_doc.import_country = self.import_country
                declaration_customs_doc.transaction_status = self.transaction_status
                declaration_customs_doc.shipping_line = self.shipping_line
                declaration_customs_doc.shipping_line_agent = self.shipping_line_agent
                declaration_customs_doc.agent_code = self.agent_code
                declaration_customs_doc.discharge_port = self.discharge_port
                declaration_customs_doc.terminal = self.terminal
                declaration_customs_doc.vessel = self.vessel
                declaration_customs_doc.fcl = self.fcl
                declaration_customs_doc.cbm = self.cbm
                declaration_customs_doc.roro = self.roro
                declaration_customs_doc.save(ignore_permissions=True)

