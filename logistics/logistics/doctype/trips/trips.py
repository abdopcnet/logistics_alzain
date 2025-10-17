# Copyright (c) 2024, HCS and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document

class Trips(Document):
    def before_save(self):
        """قبل الحفظ: تمرير العميل من السجل الأب إلى كل صف في trip_stops."""
        if not getattr(self, "trip_stops", None):
            return
        for row in self.trip_stops:
            row.customer = self.customer

    def after_save(self):
        """بعد الحفظ: مزامنة حالة الرحلة إلى Transit BoL.trip_plans للرحلة الحالية."""
        if not (getattr(self, "status", None) and getattr(self, "transit_bol", None)):
            return
        if not frappe.db.exists("Transit BoL", self.transit_bol):
            return
        transit_bol = frappe.get_doc("Transit BoL", self.transit_bol)
        updated = False
        for row in (transit_bol.trip_plans or []):
            if row.trip_no == self.name:
                row.status = self.status
                updated = True
        if updated:
            transit_bol.save(ignore_permissions=True)