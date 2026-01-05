frappe.ui.form.on('Sales Invoice', {
	validate: function (frm) {
		if (frm.doc.transaction) {
			update_transaction_child_table(frm);
		}
	},
});

function update_transaction_child_table(frm) {
	frappe.call({
		method: 'frappe.client.get',
		args: {
			doctype: 'Transaction',
			name: frm.doc.transaction,
		},
		callback: function (r) {
			if (r.message) {
				let transaction_doc = r.message;

				// Check if this Sales Invoice already exists in the child table
				let existing_row = (transaction_doc.sales_invoice_info || []).find(
					(row) => row.sales_invoice_no === frm.doc.name,
				);

				if (existing_row) {
					// Update existing row
					existing_row.posting_date = frm.doc.posting_date;
				} else {
					// Add new row
					if (!transaction_doc.sales_invoice_info) {
						transaction_doc.sales_invoice_info = [];
					}
					transaction_doc.sales_invoice_info.push({
						sales_invoice_no: frm.doc.name,
						posting_date: frm.doc.posting_date,
					});
				}

				// Save the updated Transaction document
				frappe.call({
					method: 'frappe.client.save',
					args: {
						doc: transaction_doc,
					},
					callback: function (save_resp) {
						if (save_resp.message) {
							frappe.show_alert({
								message: __('Transaction updated successfully'),
								indicator: 'green',
							});
						}
					},
					error: function (err) {
						frappe.msgprint(__('Failed to update Transaction'));
						console.error(err);
					},
				});
			}
		},
		error: function (err) {
			frappe.msgprint(__('Transaction not found'));
			console.error(err);
		},
	});
}

frappe.ui.form.on('Sales Invoice', {
	transaction: function (frm) {
		if (frm.doc.transaction) {
			check_transaction_exists(frm);
		}
	},

	refresh: function (frm) {
		// التحقق عند تحميل الفاتورة إذا كان الحقل مليء
		if (frm.doc.transaction) {
			check_transaction_exists(frm);
		}
	},
});

function check_transaction_exists(frm) {
	frappe.call({
		method: 'frappe.client.get_list',
		args: {
			doctype: 'Sales Invoice',
			filters: [
				['transaction', '=', frm.doc.transaction],
				['name', '!=', frm.doc.name], // استثناء الفاتورة الحالية
			],
			fields: ['name', 'posting_date', 'customer', 'custom_expenses_and_grand'],
		},
		callback: function (r) {
			if (r.message && r.message.length > 0) {
				let existing_invoice = r.message[0];

				frappe.msgprint({
					title: __('تنبيه - رقم المعاملة مكرر'),
					indicator: 'orange',
					message: __(`
                        <div style="direction: rtl; text-align: right;">
                            <b>رقم المعاملة موجود مسبقاً!</b>
                            <br><br>
                            <b>رقم الفاتورة:</b> ${existing_invoice.name}<br>
                            <b>التاريخ:</b> ${existing_invoice.posting_date}<br>
                            <b>العميل:</b> ${existing_invoice.customer}<br>
                            <b>المبلغ:</b> ${format_currency(
								existing_invoice.custom_expenses_and_grand,
							)}
                        </div>
                    `),
				});

				// تغيير لون الحقل للإشارة إلى الخطأ
				frm.fields_dict.transaction.$input.css('border-color', '#e74c3c');
			} else {
				// إرجاع اللون إلى الطبيعي إذا كان الرقم غير مكرر
				frm.fields_dict.transaction.$input.css('border-color', '#d1d8dd');
			}
		},
	});
}

// CSS لجعل حقل readonly يبدو مقفولاً في جدول الاصناف
frappe.ui.form.on('Sales Invoice', {
	refresh: function (frm) {
		// ضف الـ CSS مرة واحدة في الصفحة
		if (!frm.__si_rate_css_added) {
			$('<style>')
				.prop('type', 'text/css')
				.html(
					'.grid-row td[data-fieldname="rate"] input[readonly] { background-color: #f5f5f5; }',
				)
				.appendTo('head');
			frm.__si_rate_css_added = true;
		}

		// لكل صف عند التحميل أو التحديث
		(frm.doc.items || []).forEach((d) => {
			let grid_row = frm.fields_dict.items.grid.grid_rows_by_docname[d.name];
			if (!grid_row) return;
			let $input = grid_row.wrapper.find('input[data-fieldname="rate"]');
			if (d.rate && d.rate > 0) {
				$input.prop('readonly', true);
			} else {
				$input.prop('readonly', false);
			}
		});
	},
});

// عند إضافة أو تغيير صنف أو سعر في صف مفرد
frappe.ui.form.on('Sales Invoice Item', {
	item_code: function (frm, cdt, cdn) {
		frappe.after_ajax(() => {
			let row = locals[cdt][cdn];
			let grid_row = frm.fields_dict.items.grid.grid_rows_by_docname[cdn];
			if (!grid_row) return;
			let $input = grid_row.wrapper.find('input[data-fieldname="rate"]');
			$input.prop('readonly', !!(row.rate && row.rate > 0));
		});
	},
	rate: function (frm, cdt, cdn) {
		// يطبق نفس المنطق لو تم تعديل السعر يدوياً
		let row = locals[cdt][cdn];
		let grid_row = frm.fields_dict.items.grid.grid_rows_by_docname[cdn];
		if (!grid_row) return;
		let $input = grid_row.wrapper.find('input[data-fieldname="rate"]');
		$input.prop('readonly', !!(row.rate && row.rate > 0));
	},
});

frappe.ui.form.on('Sales Invoice', {
	refresh(frm) {
		setup_return_invoice(frm);
	},

	is_return(frm) {
		if (frm.doc.is_return) {
			apply_return_settings(frm);
		} else {
			clear_return_settings(frm);
		}
	},
});

function setup_return_invoice(frm) {
	if (frm.doc.is_return) {
		apply_return_settings(frm);
	}
}

function apply_return_settings(frm) {
	// Set naming series for returns
	if (!frm.doc.naming_series || !frm.doc.naming_series.includes('RET')) {
		frm.set_value('naming_series', 'ACC-SINV-RET-.YYYY.-');
	}

	// Flip custom_expenses_and_grand value to negative (if not already negative)
	if (frm.doc.custom_expenses_and_grand > 0) {
		frm.set_value('custom_expenses_and_grand', -Math.abs(frm.doc.custom_expenses_and_grand));
	} else if (frm.doc.custom_expenses_and_grand < 0) {
		// Already negative, do nothing (optional)
	}

	// Refresh the form to apply changes
	frm.refresh_fields();
}

function clear_return_settings(frm) {
	// Reset naming series if it's the return series
	if (frm.doc.naming_series && frm.doc.naming_series.includes('RET')) {
		frm.set_value('naming_series', '');
	}

	// Flip custom_expenses_and_grand value to positive (if not already positive)
	if (frm.doc.custom_expenses_and_grand < 0) {
		frm.set_value('custom_expenses_and_grand', Math.abs(frm.doc.custom_expenses_and_grand));
	} else if (frm.doc.custom_expenses_and_grand > 0) {
		// Already positive, do nothing (optional)
	}
}

frappe.ui.form.on('Sales Invoice', {
	refresh: function (frm) {
		// تشغيل السكربت فقط إذا كانت الفاتورة في حالة Draft
		if (frm.doc.docstatus === 0) {
			// تعيين تاريخ اليوم في posting_date و due_date
			frm.set_value('posting_date', frappe.datetime.get_today());
			frm.set_value('due_date', frappe.datetime.get_today());

			// مسح جميع سطور جدول الدفع
			frm.clear_table('payment_schedule');
			frm.refresh_field('payment_schedule');
		}
	},
});

frappe.ui.form.on('Sales Invoice', {
	validate: function (frm) {
		clear_tax_fields_if_draft(frm);
	},
});

function clear_tax_fields_if_draft(frm) {
	if (frm.doc.docstatus === 0) {
		frm.set_value('taxes_and_charges', '');
		frm.set_value('tax_category', '');
	}
}
