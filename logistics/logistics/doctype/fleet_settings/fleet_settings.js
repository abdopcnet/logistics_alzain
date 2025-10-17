// Copyright (c) 2024, HCS and contributors
// For license information, please see license.txt

frappe.ui.form.on('Fleet Settings', {
	refresh: function(frm) {
		frm.set_query("party_type", "fleet_calculation_account", function () {
			return {
			  filters: [
				["name", "in", ["Customer","Supplier"]],
			
			  ],
			};
		  });
		  frm.set_query("bank_credit", function () {
			return {
			  filters: [
				["account_type", "in", ["Bank"]],
			
			  ],
			};
		  });
	}
});
