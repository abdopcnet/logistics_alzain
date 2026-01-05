frappe.ui.form.on('Item', {
	setup: function (frm) {
		// Initial update when loading the form
		frm.trigger('update_supplier_field');
	},
	custom_party_type: function (frm) {
		// Update when changing party type
		frm.trigger('update_supplier_field');
	},
	update_supplier_field: function (frm) {
		if (frm.doc.custom_party_type) {
			// Additional settings to ensure functionality
			frm.fields_dict.custom_supplier.df.options = frm.doc.custom_party_type;
			frm.fields_dict.custom_supplier.refresh();
			frm.refresh_field('custom_supplier');
		}
	},
});
