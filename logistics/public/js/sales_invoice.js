frappe.ui.form.on('Sales Invoice', {
	after_save: function (frm) {
		if (frm.doc.transaction && frm.doc.name) {
			update_transaction_child_table(frm);
		}
	},
});

function update_transaction_child_table(frm) {
	if (!frm.doc.name) {
		return;
	}

	frappe.call({
		method: 'frappe.client.get',
		args: {
			doctype: 'Transaction',
			name: frm.doc.transaction,
		},
		callback: function (r) {
			if (r.message) {
				let transaction_doc = r.message;
				let existing_row = (transaction_doc.sales_invoice_info || []).find(
					(row) => row.sales_invoice_no === frm.doc.name,
				);

				if (existing_row) {
					existing_row.posting_date = frm.doc.posting_date;
				} else {
					if (!transaction_doc.sales_invoice_info) {
						transaction_doc.sales_invoice_info = [];
					}
					transaction_doc.sales_invoice_info.push({
						sales_invoice_no: frm.doc.name,
						posting_date: frm.doc.posting_date,
					});
				}

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
						console.log('[sales_invoice.js] method: update_transaction_child_table');
					},
				});
			}
		},
		error: function (err) {
			frappe.msgprint(__('Transaction not found'));
			console.log('[sales_invoice.js] method: update_transaction_child_table');
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
				['name', '!=', frm.doc.name],
			],
			fields: ['name', 'posting_date', 'customer', 'custom_expenses_and_grand'],
		},
		callback: function (r) {
			if (r.message && r.message.length > 0) {
				let existing_invoice = r.message[0];

				frappe.msgprint({
					title: __('Warning - Duplicate Transaction Number'),
					indicator: 'orange',
					message: __(`
                        <div>
                            <b>Transaction number already exists!</b>
                            <br><br>
                            <b>Invoice Number:</b> ${existing_invoice.name}<br>
                            <b>Date:</b> ${existing_invoice.posting_date}<br>
                            <b>Customer:</b> ${existing_invoice.customer}<br>
                            <b>Amount:</b> ${format_currency(
								existing_invoice.custom_expenses_and_grand,
							)}
                        </div>
                    `),
				});

				frm.fields_dict.transaction.$input.css('border-color', '#e74c3c');
			} else {
				frm.fields_dict.transaction.$input.css('border-color', '#d1d8dd');
			}
		},
	});
}

frappe.ui.form.on('Sales Invoice', {
	refresh: function (frm) {
		if (!frm.__si_rate_css_added) {
			$('<style>')
				.prop('type', 'text/css')
				.html(
					'.grid-row td[data-fieldname="rate"] input[readonly] { background-color: #f5f5f5; }',
				)
				.appendTo('head');
			frm.__si_rate_css_added = true;
		}

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
		let row = locals[cdt][cdn];
		let grid_row = frm.fields_dict.items.grid.grid_rows_by_docname[cdn];
		if (!grid_row) return;
		let $input = grid_row.wrapper.find('input[data-fieldname="rate"]');
		$input.prop('readonly', !!(row.rate && row.rate > 0));
	},
});

frappe.ui.form.on('Sales Invoice', {
	refresh: function (frm) {
		setup_return_invoice(frm);
	},

	is_return: function (frm) {
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
	if (!frm.doc.naming_series || !frm.doc.naming_series.includes('RET')) {
		frm.set_value('naming_series', 'ACC-SINV-RET-.YYYY.-');
	}

	if (frm.doc.custom_expenses_and_grand > 0) {
		frm.set_value('custom_expenses_and_grand', -Math.abs(frm.doc.custom_expenses_and_grand));
	}

	frm.refresh_fields();
}

function clear_return_settings(frm) {
	if (frm.doc.naming_series && frm.doc.naming_series.includes('RET')) {
		frm.set_value('naming_series', '');
	}

	if (frm.doc.custom_expenses_and_grand < 0) {
		frm.set_value('custom_expenses_and_grand', Math.abs(frm.doc.custom_expenses_and_grand));
	}
}

frappe.ui.form.on('Sales Invoice', {
	refresh: function (frm) {
		if (frm.doc.docstatus === 0) {
			frm.set_value('posting_date', frappe.datetime.get_today());
			frm.set_value('due_date', frappe.datetime.get_today());
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

// 1) UI: Add "Fetch Expenses" button on Sales Invoice form refresh
frappe.ui.form.on('Sales Invoice', {
	// 1.1) Add custom button on refresh
	refresh: function (frm) {
		// On click, confirm if rows exist, then run fetch
		frm.add_custom_button(__('Fetch Expenses'), function () {
			// Confirm if expenses already exist
			if (frm.doc.custom_customer_expense?.length) {
				frappe.confirm(
					__('There are existing expenses. Do you want to clear and fetch again?'),
					() => fetch_expenses(frm),
					() => frappe.msgprint(__('Fetching cancelled.')),
				);
			} else {
				fetch_expenses(frm);
			}
		});
	},
});

// 2) Fetch expenses from server, fill child table, compute totals
function fetch_expenses(frm) {
	// 2.1) Guard: require customer
	if (!frm.doc.customer) {
		frappe.msgprint(__('Please select a customer first.'));
		return;
	}

	// 2.2) Clear child table before fetching
	frappe.msgprint(__('Clearing existing expenses and fetching new ones...'));
	frm.clear_table('custom_customer_expense');

	// 2.3) Call backend with customer and optional bol_no
	frappe.call({
		method: 'logistics.logistics.api.fetch_customer_expenses.fetch_expenses_for_invoice',
		args: { customer: frm.doc.customer, bol_no: frm.doc.custom_bol_no || '' },
		freeze: true,
		freeze_message: __('Fetching customer expenses...'),
		callback: function (r) {
			// 2.4) On success: append rows and compute totals
			if (r.message?.length) {
				// Add fetched expenses
				r.message.forEach((expense) => {
					let row = frm.add_child('custom_customer_expense');
					Object.assign(row, expense);
				});
				frm.refresh_field('custom_customer_expense');

				// Calculate total expenses
				let total_expenses = frm.doc.custom_customer_expense.reduce(
					(sum, row) => sum + parseFloat(row.fee || 0),
					0,
				);
				frm.set_value('custom_total_expenses', total_expenses);

				// Update total with grand total
				calculate_expenses_and_grand(frm);

				frappe.msgprint(__('Expenses fetched and loaded successfully.'));
			} else {
				// 2.5) No results: reset totals
				frappe.msgprint(__('No expenses found for this customer and BOL.'));
				frm.set_value('custom_total_expenses', 0);
				frm.set_value('custom_expenses_and_grand', frm.doc.grand_total || 0);
			}
		},
	});
}

// 3) Calculate total = expenses + grand total
function calculate_expenses_and_grand(frm) {
	let total =
		parseFloat(frm.doc.custom_total_expenses || 0) + parseFloat(frm.doc.grand_total || 0);
	frm.set_value('custom_expenses_and_grand', total);
}
