# Copyright (c) 2024, HCS and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class Manifest(Document):
	def after_save(self):
		"""
		بعد الحفظ: تحديث حالة الـ Manifest بناءً على قيم bol_status في fcl_list.
		- إذا كانت جميع الحالات "Complete" تصبح الحالة "Complete"، وإلا "Open".
		"""
		rows = self.fcl_list or []
		statuses = [row.bol_status for row in rows if getattr(row, "bol_status", None)]
		if not statuses:
			return
		new_status = "Complete" if all(s == "Complete" for s in statuses) else "Open"
		if self.status != new_status:
			frappe.db.set_value("Manifest", self.name, "status", new_status)
