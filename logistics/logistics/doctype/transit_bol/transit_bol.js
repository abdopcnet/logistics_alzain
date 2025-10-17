// Copyright (c) 2025, HCS and contributors
// For license information, please see license.txt

frappe.ui.form.on('Transit BoL', {
    refresh: function(frm) {
        frm.add_custom_button(__('Create Trips'), function() {
            let child_table = frm.doc.trip_plans; // Assuming the child table is named 'trip_plans'

            if (!child_table || child_table.length === 0) {
                frappe.msgprint(__('No Trip Plans found.'));
                return;
            }

            child_table.forEach(row => {
                // Create a new Trip without requiring trip_no
                frappe.call({
                    method: 'frappe.client.insert',
                    args: {
                        doc: {
                            doctype: 'Trips',
                            pickup: row.pickup,
                            delivery: row.delivery,
                            date: row.date,
                            cost: row.cost,
                            status: row.status,
                            transit_bol: frm.doc.name // Link to the parent Transit BoL
                        }
                    },
                    callback: function(response) {
                        if (response.message) {
                            let trip_name = response.message.name; // Get the auto-generated name of the Trip

                            // Update the trip_no in the child table with the newly created Trip's name
                            frappe.call({
                                method: 'frappe.client.set_value',
                                args: {
                                    doctype: 'Trip Plans', // Assuming the child table is linked to 'Trip Plans'
                                    name: row.name, // The row's name in the child table
                                    fieldname: 'trip_no',
                                    value: trip_name
                                },
                                callback: function(response) {
                                    frappe.msgprint(__('Trip {0} Created and linked to Trip Plan', [trip_name]));
                                    frm.refresh_field('trip_plans'); // Refresh the child table
                                },
                                error: function(err) {
                                    console.error('Error updating Trip Plan:', err);
                                    frappe.msgprint(__('Error updating Trip Plan: {0}', [err.message]));
                                }
                            });
                        }
                    },
                    error: function(err) {
                        console.error('Error creating Trip:', err);
                        frappe.msgprint(__('Error creating Trip: {0}', [err.message]));
                    }
                });
            });
        }).addClass("btn-primary"); // Blue button, always visible
    }
});



// سكريبت العميل لـ Transit BoL
frappe.ui.form.on('Transit BoL', {
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
    frm.doc.trip_plans.forEach(row => {
        if (row.cost) {
            total += parseFloat(row.cost);
        }
    });

    // تحديث حقل total في المستند الرئيسي
    frm.set_value('total', total);
}