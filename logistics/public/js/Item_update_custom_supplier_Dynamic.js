frappe.ui.form.on('Item', {
	setup: function (frm) {
		// تحديث أولي عند تحميل النموذج
		frm.trigger('update_supplier_field');
	},
	custom_party_type: function (frm) {
		// تحديث عند تغيير نوع الطرف
		frm.trigger('update_supplier_field');
	},
	update_supplier_field: function (frm) {
		if (frm.doc.custom_party_type) {
			// إعدادات إضافية لضمان العمل
			frm.fields_dict.custom_supplier.df.options = frm.doc.custom_party_type;
			frm.fields_dict.custom_supplier.refresh();
			frm.refresh_field('custom_supplier');
		}
	},
});
