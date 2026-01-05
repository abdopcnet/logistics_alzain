
import frappe
from frappe.model.document import Document


class JournalEntry(Document):
    def before_save(self):
        for row in self.accounts:
            row.transaction = self.custom_transaction
