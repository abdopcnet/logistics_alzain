# Copyright (c) 2025, HCS and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class TransitBoL(Document):
	def after_save(self):
		"""
		بعد الحفظ:
		1) تحديث حالة Transit BoL بناءً على حالات الصفوف في trip_plans.
		2) مزامنة الحالة إلى Manifest.fcl_list (الحقل bol_status) حيث trip يساوي اسم Transit BoL.
		"""
		# أولاً: تحديث الحالة بناءً على trip_plans
		trip_rows = self.trip_plans or []
		statuses = [row.status for row in trip_rows if getattr(row, "status", None)]
		if statuses:
			unique_statuses = set(statuses)
			new_status = "Open"
			if len(unique_statuses) == 1:
				# جميع الصفوف لها نفس الحالة
				new_status = unique_statuses.pop()
			# حدّث الحالة في السجل إذا تغيّرت بدون استدعاء save() لتفادي حلقات الحفظ
			if self.status != new_status:
				self.status = new_status
				frappe.db.set_value("Transit BoL", self.name, "status", new_status)

		# ثانياً: تحديث الحالة في Manifest.fcl_list بناءً على Transit BoL.name
		if self.status and getattr(self, "manifest_no", None):
			if frappe.db.exists("Manifest", self.manifest_no):
				manifest = frappe.get_doc("Manifest", self.manifest_no)
				updated = False
				for row in (manifest.fcl_list or []):
					if row.trip == self.name:
						row.bol_status = self.status
						updated = True
				if updated:
					manifest.save(ignore_permissions=True)
