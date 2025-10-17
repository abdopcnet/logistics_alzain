import frappe
from frappe.model.document import Document

class PortStatus(Document):
    # You can add custom functions, hooks, validations here
    def validate(self):
        # Example validation
        if not self.some_field:
            frappe.throw("Some field is mandatory!")