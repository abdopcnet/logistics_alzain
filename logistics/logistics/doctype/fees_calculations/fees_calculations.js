// Copyright (c) 2024, HCS and contributors
// For license information, please see license.txt

frappe.ui.form.on('Fees Calculations', {
	refresh: function(frm) {
		if(frm.doc.__islocal != 1){
		frm.add_custom_button(__("Create Invoice"), function(){
			frappe.call({
				method: "create_invoice",
				doc: frm.doc,
				callback: function (r) {
				 
				},
			  });
		});
	}	

	}
});
