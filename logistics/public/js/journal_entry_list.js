// List View: Fetch Transaction Not Matched button
frappe.listview_settings['Journal Entry'] = {
	onload: function (listview) {
		listview.page.add_inner_button(
			__('Fetch Transaction Not Matched'),
			function () {
				frappe.call({
					method: 'logistics.fix_gl_entry.fetch_transaction_not_matched',
					freeze: true,
					freeze_message: __('Fetching mismatched transactions...'),
					callback: function (r) {
						if (r.message && r.message.length > 0) {
							// Create dialog with results - wide dialog
							let dialog = new frappe.ui.Dialog({
								title: __('Transaction Not Matched ({0} records)', [
									r.message.length,
								]),
								size: 'extra-large',
								fields: [
									{
										fieldname: 'results',
										fieldtype: 'HTML',
										options: '',
									},
								],
							});

							// Make dialog wider
							dialog.$wrapper.find('.modal-dialog').css({
								width: '95%',
								'max-width': '1400px',
							});

							// Prevent horizontal scrollbar in modal body
							dialog.$wrapper.find('.modal-body').css({
								'overflow-x': 'hidden',
								padding: '15px 20px',
							});

							// Build HTML table with all columns - no wrapping
							let table_html = `
							<div style="max-height: 70vh; overflow-y: auto; overflow-x: hidden;">
								<table class="table table-bordered" style="width: 100%; font-size: 11px; table-layout: auto; white-space: nowrap;">
									<thead style="background-color: #f8f9fa; position: sticky; top: 0; z-index: 10;">
										<tr>
											<th style="white-space: nowrap; padding: 8px 12px; font-weight: bold; color: #212529;">${__(
												'JE Name',
											)}</th>
											<th style="white-space: nowrap; padding: 8px 12px; min-width: 200px; font-weight: bold; color: #212529;">${__(
												'Customer',
											)}</th>
											<th style="white-space: nowrap; padding: 8px 12px; font-weight: bold; color: #212529;">${__(
												'Transaction',
											)}</th>
											<th style="white-space: nowrap; padding: 8px 12px; min-width: 150px; font-weight: bold; color: #212529;">${__(
												'BOL No',
											)}</th>
											<th style="white-space: nowrap; padding: 8px 12px; font-weight: bold; color: #212529;">${__(
												'GL Entry',
											)}</th>
											<th style="white-space: nowrap; padding: 8px 12px; min-width: 150px; font-weight: bold; color: #212529;">${__(
												'Account',
											)}</th>
											<th style="white-space: nowrap; padding: 8px 12px; text-align: right; font-weight: bold; color: #212529;">${__(
												'Debit',
											)}</th>
											<th style="white-space: nowrap; padding: 8px 12px; text-align: right; font-weight: bold; color: #212529;">${__(
												'Credit',
											)}</th>
											<th style="white-space: nowrap; padding: 8px 12px; font-weight: bold; color: #212529;">${__(
												'GL Transaction',
											)}</th>
										</tr>
									</thead>
									<tbody>
						`;

							r.message.forEach(function (item) {
								// Build URLs for clickable links
								let je_url = item.journal_entry_name
									? `/app/journal-entry/${encodeURIComponent(
											item.journal_entry_name,
									  )}`
									: '#';
								let customer_url = item.custom_customer
									? `/app/customer/${encodeURIComponent(item.custom_customer)}`
									: '#';
								let transaction_url = item.custom_transaction
									? `/app/transaction/${encodeURIComponent(
											item.custom_transaction,
									  )}`
									: '#';
								let gl_entry_url = item.gl_entry_name
									? `/app/gl-entry/${encodeURIComponent(item.gl_entry_name)}`
									: '#';

								table_html += `
								<tr>
									<td style="white-space: nowrap; padding: 8px 12px;">
										${
											item.journal_entry_name
												? `<a href="${je_url}" target="_blank" style="color: #007bff; text-decoration: none; cursor: pointer;" onmouseover="this.style.textDecoration='underline'" onmouseout="this.style.textDecoration='none'">${item.journal_entry_name}</a>`
												: ''
										}
									</td>
									<td style="white-space: nowrap; padding: 8px 12px;">
										${
											item.customer_name && item.custom_customer
												? `<a href="${customer_url}" target="_blank" style="color: #007bff; text-decoration: none; cursor: pointer;" onmouseover="this.style.textDecoration='underline'" onmouseout="this.style.textDecoration='none'">${item.customer_name}</a>`
												: item.customer_name || ''
										}
									</td>
									<td style="white-space: nowrap; padding: 8px 12px;">
										${
											item.custom_transaction
												? `<a href="${transaction_url}" target="_blank" style="color: #007bff; text-decoration: none; cursor: pointer;" onmouseover="this.style.textDecoration='underline'" onmouseout="this.style.textDecoration='none'">${item.custom_transaction}</a>`
												: ''
										}
									</td>
									<td style="white-space: nowrap; padding: 8px 12px;">${item.custom_bol_no || ''}</td>
									<td style="white-space: nowrap; padding: 8px 12px;">
										${
											item.gl_entry_name
												? `<a href="${gl_entry_url}" target="_blank" style="color: #007bff; text-decoration: none; cursor: pointer;" onmouseover="this.style.textDecoration='underline'" onmouseout="this.style.textDecoration='none'">${item.gl_entry_name}</a>`
												: ''
										}
									</td>
									<td style="white-space: nowrap; padding: 8px 12px;">${item.account || ''}</td>
									<td style="white-space: nowrap; padding: 8px 12px; text-align: right;">${item.debit || 0}</td>
									<td style="white-space: nowrap; padding: 8px 12px; text-align: right;">${item.credit || 0}</td>
									<td style="white-space: nowrap; padding: 8px 12px; color: ${
										item.gl_transaction ? 'red' : 'gray'
									}">${item.gl_transaction || __('NULL')}</td>
								</tr>
							`;
							});

							table_html += `
									</tbody>
								</table>
							</div>
							<p style="margin-top: 15px; font-size: 11px; color: #666; text-align: center;">
								${__('Note: All columns data available in console. Right-click > Inspect to view full data.')}
							</p>
						`;

							dialog.fields_dict.results.$wrapper.html(table_html);

							// Add Fix All button in footer using add_custom_action
							dialog.add_custom_action(
								__('Fix All Not Matched'),
								function () {
									frappe.confirm(
										__(
											'Are you sure you want to fix all {0} mismatched transactions? This will update Journal Entry Accounts and GL Entries.',
											[r.message.length],
										),
										function () {
											// Yes button - Start processing with progress bar
											let progress_dialog = new frappe.ui.Dialog({
												title: __('Fixing All Transactions...'),
												fields: [
													{
														fieldname: 'progress_info',
														fieldtype: 'HTML',
													},
												],
											});

											let progress_html = `
												<div style="text-align: center; padding: 20px;">
													<div style="font-size: 14px; margin-bottom: 15px; color: #666;">
														<span id="progress_text">${__('جارٍ المعالجة...')}</span>
													</div>
													<div style="width: 100%; background-color: #f0f0f0; border-radius: 10px; overflow: hidden; margin-bottom: 10px;">
														<div id="progress_bar" style="width: 0%; height: 30px; background-color: #5e64ff; transition: width 0.3s ease; text-align: center; line-height: 30px; color: white; font-weight: bold;">
															0%
														</div>
													</div>
													<div style="font-size: 12px; color: #999; margin-top: 10px;">
														<span id="progress_count">0 / 0</span> ${__('سجل')}
													</div>
													<div style="font-size: 12px; color: #999; margin-top: 5px;">
														<span id="remaining_count">0</span> ${__('متبقي')}
													</div>
												</div>
											`;

											progress_dialog.fields_dict.progress_info.$wrapper.html(
												progress_html,
											);
											progress_dialog.show();

											// Hide original dialog
											dialog.hide();

											// Process in batches with progress updates
											function processBatch(currentIndex, totalCount) {
												frappe.call({
													method: 'logistics.fix_gl_entry.fix_all_not_matched',
													args: {
														current_index: currentIndex,
													},
													freeze: false,
													callback: function (response) {
														if (response.message) {
															let data = response.message;
															let processed =
																data.current_index || 0;
															let total =
																data.total_journal_entries ||
																totalCount ||
																r.message.length;
															let remaining =
																data.remaining ||
																total - processed;
															let percent =
																data.progress_percent || 0;

															// Update progress bar
															$('#progress_bar')
																.css('width', percent + '%')
																.text(percent + '%');
															$('#progress_count').text(
																processed + ' / ' + total,
															);
															$('#remaining_count').text(remaining);

															if (data.has_more) {
																// Continue processing
																setTimeout(function () {
																	processBatch(processed, total);
																}, 100);
															} else {
																// Finished
																progress_dialog.hide();
																frappe.show_alert({
																	message: __(
																		'تم بنجاح تحديث السجلات الغير متطابقة',
																	),
																	indicator: 'green',
																});
																listview.refresh();
															}
														}
													},
													error: function (error) {
														progress_dialog.hide();
														frappe.show_alert({
															message:
																error.message ||
																__(
																	'Error occurred while fixing all transactions',
																),
															indicator: 'red',
														});
													},
												});
											}

											// Start processing
											processBatch(0, r.message.length);
										},
										function () {
											// No button - do nothing
										},
									);
								},
								'btn-success',
							);

							dialog.show();

							// Log full data to console for inspection
							console.log('Transaction Not Matched - Full Data:', r.message);
						} else {
							frappe.msgprint({
								title: __('Info'),
								message: __('No mismatched transactions found'),
								indicator: 'blue',
							});
						}
					},
					error: function (r) {
						frappe.msgprint({
							title: __('Error'),
							message: r.message || __('Error occurred while fetching data'),
							indicator: 'red',
						});
					},
				});
			},
			null,
			'info',
		);
	},
};
