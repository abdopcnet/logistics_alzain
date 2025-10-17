# Copyright (c) 2024, HCS and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document

class FleetSettings(Document):
	def validate(self):
		self.validate_settings()

	def validate_settings(self):
		for acc in self.fleet_calculation_account:
			debit_account_type = frappe.db.get_value("Account",acc.debit,"account_type")

			if debit_account_type in ["Receivable","Payable"] and not acc.party_type :
				frappe.throw(_("Please set party type for receivable/payable account"))
