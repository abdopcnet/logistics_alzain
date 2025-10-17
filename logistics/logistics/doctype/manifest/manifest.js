// Copyright (c) 2024, HCS and contributors
// For license information, please see license.txt

frappe.ui.form.on('Manifest', {
    refresh: function(frm) {
        frm.add_custom_button(__('Create Transit BoL'), function() {
            let child_table = null;
            
            if (frm.doc.fcl) {
                child_table = frm.doc.fcl_list;
            } else if (frm.doc.cbm) {
                child_table = frm.doc.cbm_list;
            } else if (frm.doc.roro) {
                child_table = frm.doc.roro_list;
            }

            if (!child_table) {
                frappe.msgprint(__('No valid child table selected.'));
                return;
            }

            let selected_rows = child_table.filter(row => row.create_transit);
            
            if (selected_rows.length === 0) {
                frappe.msgprint(__('No rows selected for Transit BoL creation.'));
                return;
            }
            
            selected_rows.forEach(row => {
                frappe.call({
                    method: 'frappe.client.insert',
                    args: {
                        doc: {
                            doctype: 'Transit BoL',
                            customer: frm.doc.customer,
                            transaction_no: frm.doc.transaction_no,
                            manifest_no: frm.doc.name,
                            container_no: row.container_no,
                            container_type: row.type,
                            container_weight: row.container_weight,
                            package_type: row.packages_type,
                            qty: row.qty,
                            weight: row.shipment_weight
                        }
                    },
                    callback: function(response) {
                        if (response.message) {
                            frappe.model.set_value(row.doctype, row.name, 'trip', response.message.name);
                            frappe.msgprint(__('Transit BoL {0} Created', [response.message.name]));
                            frm.refresh_field(child_table);
                        }
                    }
                });
            });
        }).addClass("btn-danger"); // Red button, always visible
    }
});



frappe.ui.form.on('Manifest', {
    refresh: function(frm) {
        fetch_package_type(frm);
    }
});

function fetch_package_type(frm) {
    let package_type = null;

    // Check in fcl_list (Linked from FCL)
    if (frm.doc.fcl_list && frm.doc.fcl_list.length > 0) {
        package_type = frm.doc.fcl_list[0].package_type;
    }

    // Check in cbm_list (Linked from CBM) if fcl_list is empty
    if (!package_type && frm.doc.cbm_list && frm.doc.cbm_list.length > 0) {
        package_type = frm.doc.cbm_list[0].package_type;
    }

    // Set value in type_of_packages if found
    if (package_type) {
        frm.set_value('type_of_packages', package_type);
    }
}



// سكريبت العميل لـ Transit BoL
frappe.ui.form.on('Manifest', {
    // تحديث تلقائي عند تحميل النموذج
    refresh: function(frm) {
        calculate_total_cost(frm);
    },

    // تحديث تلقائي عند تعديل أي صف في الجدول الفرعي
    trip_stops_add: function(frm, cdt, cdn) {
        calculate_total_cost(frm);
    },
    trip_stops_cost: function(frm, cdt, cdn) {
        calculate_total_cost(frm);
    },
    trip_stops_remove: function(frm, cdt, cdn) {
        calculate_total_cost(frm);
    }
});

function calculate_total_cost(frm) {
    let total = 0;
    // التكرار عبر جميع الصفوف في الجدول الفرعي trip_stops
    frm.doc.fcl_list.forEach(row => {
        if (row.cost) {
            total += parseFloat(row.cost);
        }
    });

    // تحديث حقل total في المستند الرئيسي
    frm.set_value('total', total);
}



frappe.ui.form.on('Manifest', {
    refresh: function(frm) {
        // Add a button to manually check and update the status
       // frm.add_custom_button(__('Check and Update Status'), function() {
       //     update_manifest_status(frm);
       // });
    },

    // Optional: Automatically check status when a child table row is modified
    bol_status: function(frm, cdt, cdn) {
        update_manifest_status(frm);
    }
});

function update_manifest_status(frm) {
    // Check if all child table rows have status = "Complete"
    let all_complete = true;
    frm.doc.bol_status.forEach(row => {
        if (row.status !== "Complete") {
            all_complete = false;
        }
    });

    // If all rows are complete, update the parent status
    if (all_complete && frm.doc.status !== "Complete") {
        frm.set_value('status', 'Complete');
        frappe.msgprint(__('Manifest status updated to Complete'));
    } else if (!all_complete && frm.doc.status === "Complete") {
        // Optional: Revert status if not all rows are complete
        frm.set_value('status', 'Pending');
    }
}

frappe.ui.form.on('Manifest', {
    transaction_no: function (frm) {
        if (frm.doc.transaction_no) {
            frm.clear_table('fcl_list');
            frappe.model.with_doc('Transaction', frm.doc.transaction_no, function () {
                
                const source_doc = frappe.model.get_doc("Transaction", frm.doc.transaction_no);
			   for (const source_row of source_doc.fcl_list) {
					const target_row = frm.add_child("fcl_list");
					target_row.container_no = source_row.container_no;
					target_row.type = source_row.type;
					target_row.qty = source_row.qty;                                                       // this table has only one column. You might want to fill more columns.
                    target_row.shipment_weight = source_row.shipment_weight;              
                    target_row.package_type = source_row.package_type;
                    target_row.total_weight = source_row.total_weight;
                    frm.refresh_field('fcl_list');
				}
			});
		}
	},
});
