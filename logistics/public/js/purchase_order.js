// Trigger when supplier field is changed in Purchase Order
frappe.ui.form.on('Purchase Order', {
	supplier: function (frm) {
		if (frm.doc.supplier) {
			frm.clear_table('items');

			// Fetch Trips where transporter matches the selected supplier
			frappe.call({
				method: 'frappe.client.get_list',
				args: {
					doctype: 'Trips',
					filters: {
						transporter: frm.doc.supplier,
					},
					fields: ['name', 'transaction_no', 'customer', 'truck_no'],
				},
				callback: function (response) {
					if (response.message && response.message.length > 0) {
						const trip = response.message[0];
						const trip_name = trip.name;

						// Load the selected Trip document
						frappe.model.with_doc('Trips', trip_name, function () {
							const trip_doc = frappe.model.get_doc('Trips', trip_name);

							if (trip_doc.table_ymko && trip_doc.table_ymko.length > 0) {
								// Loop through table_ymko and add rows to Purchase Order items
								for (const source_row of trip_doc.table_ymko) {
									const target_row = frm.add_child('items');

									// Map fields from Trips.table_ymko to Purchase Order items
									target_row.item_code = source_row.item;
									target_row.qty = source_row.qty;
									target_row.custom_container_no = source_row.container_no;
									target_row.custom_container_type = source_row.container_type;

									// Map additional fields from Trips to Purchase Order items
									target_row.custom_transaction_no = trip_doc.transaction_no;
									target_row.custom_customer = trip_doc.customer;
									target_row.custom_truck_no = trip_doc.truck_no;
									target_row.custom_trip = trip_doc.name;
								}

								// Refresh the items table in Purchase Order
								frm.refresh_field('items');
							} else {
								frappe.msgprint(
									__('No data found in table_ymko for the selected Trip.'),
								);
							}
						});
					} else {
						frappe.msgprint(__('No Trips found for the selected supplier.'));
					}
				},
			});
		} else {
			frappe.msgprint(__('Please select a supplier.'));
		}
	},
});
