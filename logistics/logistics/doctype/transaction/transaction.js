// 1. Transaction: Main logic (validation, protection, auto-JE)
frappe.ui.form.on('Transaction', {
	// 1.1 Validate: Prevent deleting protected rows (no JE creation here)
	validate: function (frm) {
		// 1.1.1 Only on update
		if (!frm.is_new()) {
			frappe.call({
				method: 'frappe.client.get',
				args: { doctype: frm.doc.doctype, name: frm.doc.name },
				async: false,
				callback: function (response) {
					let old_doc = response.message;
					let old_fees = old_doc && old_doc.table_clyq ? old_doc.table_clyq : [];
					let new_fees = frm.doc.table_clyq || [];
					// 1.1.2 Find deleted rows
					let deleted = old_fees.filter(
						(old_row) => !new_fees.some((new_row) => new_row.name === old_row.name),
					);
					// 1.1.3 Prevent delete if linked to submitted JE
					deleted.forEach((row) => {
						if (row.reference_doc) {
							frappe.call({
								method: 'frappe.client.get',
								args: { doctype: 'Journal Entry', name: row.reference_doc },
								async: false,
								callback: function (r) {
									if (r.message && r.message.docstatus == 1) {
										frappe.throw(
											__(
												'Cannot delete row linked to submitted Journal Entry: {0}',
												[row.reference_doc],
											),
										);
									}
								},
							});
						}
					});
				},
			});
		}
	},
	// 1.2 After save: Create Journal Entries sequentially (after save only)
	after_save: function (frm) {
		// 1.2.1 Recursive JE creation per row
		function create_journal_entries_sequentially(index) {
			if (!frm.doc.table_clyq || index >= frm.doc.table_clyq.length) return;
			let row = frm.doc.table_clyq[index];
			// 1.2.2 If no previous JE, create new one
			if (!row.reference_doc) {
				// Gather all required fields from the row only
				let journal_entry_title = `${row.transaction}\u200E ${row.item}`;
				let accounts = [
					{
						account: row.bank,
						credit_in_account_currency: row.fee,
						user_remark: `Bank credit for advance expense ${row.item} for customer ${row.customer}, Sadad No. ${row.sadad_no}, Service Date ${row.date}`,
					},
					{
						account: row.debit_account,
						party_type: 'Supplier',
						party: row.supplier,
						debit_in_account_currency: row.fee,
						is_advance: 'Yes',
						user_remark: `Advance expense ${row.item} for customer ${row.customer}`,
					},
					{
						account: row.debit_account,
						party_type: 'Supplier',
						party: row.supplier,
						credit_in_account_currency: row.fee,
						user_remark: `Expense deduction ${row.item} for customer ${row.customer}`,
					},
					{
						account: '1310 - Debtors - A',
						party_type: 'Customer',
						party: row.customer,
						debit_in_account_currency: row.fee,
						user_remark: `Service charge ${row.item} for customer ${row.customer}`,
					},
				];
				create_journal_entry_from_row(
					row,
					accounts,
					journal_entry_title,
					row.idx,
					frm,
					row.date,
					function () {
						create_journal_entries_sequentially(index + 1);
					},
				);
			} else {
				// 1.2.3 If JE exists, just continue to next row
				create_journal_entries_sequentially(index + 1);
			}
		}
		// 1.2.4 Start recursive creation from first row
		create_journal_entries_sequentially(0);
	},
	// 1.4 Import Journal Entries button
	refresh(frm) {
		// 1.5.1 Add custom button to import linked Journal Entries
		frm.add_custom_button('🔗 Fetch Journal Entry', function () {
			if (!frm.doc.name || !frm.doc.customer) {
				frappe.msgprint('Save and select customer first.');
				return;
			}
			frappe.call({
				method: 'frappe.client.get_list',
				args: {
					doctype: 'Journal Entry',
					filters: {
						custom_transaction: frm.doc.name,
						custom_customer: frm.doc.customer,
						custom_bol_no: frm.doc.bol_no,
						docstatus: 1, // fetch only submitted entries
					},
					fields: [
						'name',
						'owner',
						'creation',
						'modified_by',
						'modified',
						'docstatus',
						'total_debit',
					],
				},
				callback: function (r) {
					if (r.message) {
						frm.clear_table('transaction_jv_entries');
						r.message.forEach(function (jv) {
							let child = frm.add_child('transaction_jv_entries');
							child.journal_entry_no = jv.name;
							child.owner_user = jv.owner;
							child.creation_on = jv.creation;
							child.modified_by_user = jv.modified_by;
							child.modified_on = jv.modified;
							child.docstatus = jv.docstatus;
							child.total_debit = (jv.total_debit || 0) / 2;
						});
						frm.refresh_field('transaction_jv_entries');
						frappe.msgprint('تم استيراد القيود بنجاح.');
						frm.save();
					} else {
						frappe.msgprint('لا توجد قيود مطابقة.');
					}
				},
			});
		}).addClass('btn-danger');
	},
});

// New: Create & submit Journal Entry, update child row with reference_doc, using only row fields
function create_journal_entry_from_row(
	row,
	accounts,
	journal_entry_title,
	row_idx,
	frm,
	posting_date,
	callback,
) {
	frappe.call({
		method: 'frappe.client.insert',
		args: {
			doc: {
				doctype: 'Journal Entry',
				posting_date: posting_date,
				title: journal_entry_title,
				user_remark: journal_entry_title,
				accounts: accounts,
				custom_transaction: row.transaction,
				custom_customer: row.customer,
				custom_bol_no: row.bol_no,
			},
		},
		callback: function (response) {
			if (response.message) {
				let journal_entry_no = response.message.name;
				frappe.call({
					method: 'frappe.client.submit',
					args: { doc: response.message },
					callback: function (submit_response) {
						if (submit_response.message) {
							frappe.model.set_value(
								'Transaction Fee',
								row.name,
								'reference_doc',
								journal_entry_no,
							);
							frm.refresh_field('table_clyq');
							frm.save(); // Save after linking JE
							if (callback) callback();
						} else {
							frappe.throw(__('Journal Entry created but failed to submit.'));
						}
					},
				});
			} else {
				frappe.throw(__('Error creating Journal Entry.'));
			}
		},
	});
}

// 3. Transaction Fee child table: protect delete, auto-fill customer/bol_no
frappe.ui.form.on('Transaction Fee', {
	// 3.1 Auto-fill all required fields on add row
	table_clyq_add: function (frm, cdt, cdn) {
		let row = locals[cdt][cdn];
		// Fill all required fields from frm.doc or row if available
		if (frm.doc.customer) frappe.model.set_value(cdt, cdn, 'customer', frm.doc.customer);
		if (frm.doc.bol_no) frappe.model.set_value(cdt, cdn, 'bol_no', frm.doc.bol_no);
		if (frm.doc.name) frappe.model.set_value(cdt, cdn, 'transaction', frm.doc.name);
		// You can add more fields here if you want to auto-fill from frm.doc
	},
	// 3.2 Prevent delete if linked to submitted JE
	before_grid_remove: function (frm, cdt, cdn) {
		let row = locals[cdt][cdn];
		if (row.reference_doc) {
			frappe.db.get_value('Journal Entry', row.reference_doc, 'docstatus', (r) => {
				if (r && r.docstatus == 1) {
					frappe.msgprint(`Cannot delete: linked to submitted JE ${row.reference_doc}`);
				} else {
					frm.get_field('table_clyq').grid.grid_rows_by_docname[cdn].remove();
				}
			});
			return false; // Always prevent default delete for protected row
		}
	},
});

// *---------------- 2. FCL: Unique Container No in fcl_list ----------------
// Prevent duplicate container_no in FCL child table
frappe.ui.form.on('FCL', {
	container_no: function (frm, cdt, cdn) {
		let containerNumbers = new Set();
		let duplicateFound = false;
		frm.doc.fcl_list.forEach(function (row) {
			if (row.container_no) {
				if (containerNumbers.has(row.container_no)) {
					duplicateFound = true;
				} else {
					containerNumbers.add(row.container_no);
				}
			}
		});
		if (duplicateFound) {
			frappe.msgprint({
				title: __('Duplicate Entry'),
				message: __('Container No must be unique. Please enter a different value.'),
				indicator: 'red',
			});
			frappe.model.set_value(cdt, cdn, 'container_no', '');
		}
	},
});

// *---------------- 3. FCL: Calculate total_weight per row and refresh table ----------------
frappe.ui.form.on('FCL', {
	container_weight: function (frm, cdt, cdn) {
		calculate_total_weight(frm);
	},
	shipment_weight: function (frm, cdt, cdn) {
		calculate_total_weight(frm);
	},
});

function calculate_total_weight(frm) {
	if (!frm.doc.fcl_list) return;
	let total_weight = 0;
	let changesMade = false;
	frm.doc.fcl_list.forEach((row) => {
		const newTotalWeight = (row.container_weight || 0) + (row.shipment_weight || 0);
		if (row.total_weight !== newTotalWeight) {
			row.total_weight = newTotalWeight;
			changesMade = true;
		}
		total_weight += row.total_weight;
	});
	if (changesMade) {
		frm.refresh_field('fcl_list');
	}
}

// *---------------- 4. FCL: Calculate containers_qty on add/remove ----------------
frappe.ui.form.on('FCL', {
	fcl_list_add: function (frm, cdt, cdn) {
		calculate_containers_qty(frm);
	},
	fcl_list_remove: function (frm, cdt, cdn) {
		calculate_containers_qty(frm);
	},
});

function calculate_containers_qty(frm) {
	if (!frm.doc.fcl_list) return;
	const containers_qty = frm.doc.fcl_list.length || 0;
	if (frm.doc.containers_qty !== containers_qty) {
		frm.set_value('containers_qty', containers_qty);
		frm.refresh_field('containers_qty');
	}
}

// *---------------- 5. FCL: Calculate total_shipment_weight ----------------
frappe.ui.form.on('FCL', {
	shipment_weight: function (frm, cdt, cdn) {
		calculate_total_shipment_weight(frm);
	},
});

function calculate_total_shipment_weight(frm) {
	if (!frm.doc.fcl_list) return;
	let total_shipment_weight = 0;
	frm.doc.fcl_list.forEach((row) => {
		total_shipment_weight += row.shipment_weight || 0;
	});
	if (frm.doc.total_shipment_weight !== total_shipment_weight) {
		frm.set_value('total_shipment_weight', total_shipment_weight);
		frm.refresh_field('total_shipment_weight');
	}
}

// *---------------- 6. FCL: Calculate no_of_packages ----------------
frappe.ui.form.on('FCL', {
	qty: function (frm, cdt, cdn) {
		calculate_total_packages(frm);
	},
});

function calculate_total_packages_fcl(frm) {
	if (!frm.doc.fcl_list) return;
	let total_qty = 0;
	frm.doc.fcl_list.forEach((row) => {
		total_qty += row.qty || 0;
	});
	return total_qty;
}

frappe.ui.form.on('CBM', {
	pieces: function (frm, cdt, cdn) {
		calculate_total_packages(frm);
	},
});

function calculate_total_packages_cbm(frm) {
	if (!frm.doc.cbm_list) return;
	let total_pieces = 0;
	frm.doc.cbm_list.forEach((row) => {
		total_pieces += row.pieces || 0;
	});
	return total_pieces;
}

function calculate_total_packages(frm) {
	let total = 0;
	total += calculate_total_packages_fcl(frm) || 0;
	total += calculate_total_packages_cbm(frm) || 0;
	// Add for roro if needed
	if (frm.doc.no_of_packages !== total) {
		frm.set_value('no_of_packages', total);
		frm.refresh_field('no_of_packages');
	}
}

// *---------------- END OF SCRIPTS ----------------

frappe.ui.form.on('Transaction', {
	refresh: function (frm) {
		// حساب المجموع عند تحميل النموذج
		calculate_total_expenses(frm);
	},

	table_clyq_add: function (frm, cdt, cdn) {
		setTimeout(() => {
			calculate_total_expenses(frm);
		}, 100);
	},

	table_clyq_remove: function (frm, cdt, cdn) {
		setTimeout(() => {
			calculate_total_expenses(frm);
		}, 100);
	},
});

// استخدم event عام لتغيرات الجدول
frappe.ui.form.on('Transaction Item', {
	// تأكد من اسم child doctype الصحيح
	fee: function (frm, cdt, cdn) {
		calculate_total_expenses(frm);
	},
});

function calculate_total_expenses(frm) {
	let total = 0;

	if (frm.doc.table_clyq) {
		frm.doc.table_clyq.forEach(function (row) {
			if (row.fee) {
				total += parseFloat(row.fee) || 0;
			}
		});
	}

	frm.set_value('total_expenses', total);
	frm.refresh_field('total_expenses');
}
