// Form View: Fix Transaction Relations button
frappe.ui.form.on('Journal Entry', {
	refresh: function (frm) {
		if (!frm.is_new()) {
			frm.page.add_inner_button(
				__('Fix Transaction Relations'),
				function () {
					frappe.confirm(
						__(
							'Are you sure you want to fix transaction relations for this Journal Entry?',
						),
						function () {
							// Yes button
							frappe.call({
								method: 'logistics.fix_gl_entry.fix_transaction_relations',
								args: {
									journal_entry_name: frm.doc.name,
								},
								freeze: true,
								freeze_message: __('Fixing transaction relations...'),
								callback: function (r) {
									if (r.message) {
										if (r.message.status === 'success') {
											frappe.show_alert({
												message: __(
													'Updated {0} accounts and {1} GL entries',
													[
														r.message.updated_accounts,
														r.message.updated_gl_entries,
													],
												),
												indicator: 'green',
											});
											frm.reload_doc();
										} else {
											frappe.show_alert({
												message:
													r.message.message || __('No changes needed'),
												indicator: 'blue',
											});
										}
									}
								},
								error: function (r) {
									frappe.show_alert({
										message:
											r.message ||
											__(
												'Error occurred while fixing transaction relations',
											),
										indicator: 'red',
									});
								},
							});
						},
						function () {
							// No button - do nothing
						},
					);
				},
				null,
				'success',
			);
		}
	},
});
