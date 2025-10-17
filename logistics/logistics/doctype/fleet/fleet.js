// Copyright (c) 2024, HCS and contributors
// For license information, please see license.txt

frappe.ui.form.on('Fleet', {
    axles_on_a_truck: function(frm){
        frm.doc.axles = frm.doc.axles_on_a_truck + frm.doc.axles_on_a_trailer;
        refresh_field("axles");
    },
    axles_on_a_trailer: function(frm){
        frm.doc.axles = frm.doc.axles_on_a_truck + frm.doc.axles_on_a_trailer;
        refresh_field("axles");
    }
});

frappe.ui.form.on('Fleet', {
    truck_weight: function(frm){
        frm.doc.weight = frm.doc.truck_weight + frm.doc.trailer_weight;
        refresh_field("weight");
    },
    trailer_weight: function(frm){
        frm.doc.weight = frm.doc.truck_weight + frm.doc.trailer_weight;
        refresh_field("weight");
    }
});