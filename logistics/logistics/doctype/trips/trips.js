// Copyright (c) 2024, HCS and contributors
// For license information, please see license.txt

frappe.ui.form.on("Trips", {
    driver_id: function (frm) {

        frappe.call({
            method: "get_transporter_name",
            doc: frm.doc,
            callback: function (r) {
                
            
              refresh_field("transporter");
            },
          });
    }
});

frappe.ui.form.on('Trips', {
    refresh: function(frm) {
        calculate_total_fee(frm);
    },
    trip_stops_add: function(frm, cdt, cdn) {
        calculate_total_fee(frm);
    },
    trip_stops_fee: function(frm, cdt, cdn) {
        calculate_total_fee(frm);
    },
    trip_stops_remove: function(frm, cdt, cdn) {
        calculate_total_fee(frm);
    }
});

function calculate_total_fee(frm) {
    let total = 0;
    frm.doc.trip_stops.forEach(row => {
        if (row.fee) {
            total += parseFloat(row.fee);
        }
    });
    frm.set_value('total', total);
}


frappe.ui.form.on('Trips', {
    // 1. Before saving the form, prepare journal entries to be created after save
    validate: function(frm) {
        frm.journal_entries_to_create = [];

        // 2. Check if the child table has rows
        if (frm.doc.trip_stops && frm.doc.trip_stops.length > 0) {
            frm.doc.trip_stops.forEach(row => {
                    // 3. Only process rows that don't have reference_doc and all required fields are filled
                    if (!row.reference_doc && row.item && row.bank && row.debit_account && row.supplier && row.customer && row.fee) {
                        let journal_entry_title = `${row.item} ${frm.doc.name}`;

                        // 4. Prepare accounts for Journal Entry
                        let accounts = [
                            {
                                account: row.bank,
                                credit_in_account_currency: row.fee,
                                user_remark: `خصم من البنك لحساب المصروفات المقدمة ${row.item} على العميل ${row.customer}, رقم سداد ${row.sadad_no}, تاريخ الخدمة ${row.date}`
                            },
                            {
                                account: row.debit_account,
                                party_type: "Supplier",
                                party: row.supplier,
                                debit_in_account_currency: row.fee,
                                is_advance: "Yes",
                                user_remark: `استلام على حساب المصروفات المقدمة ${row.item} على العميل ${row.customer}`
                            },
                            {
                                account: row.debit_account,
                                party_type: "Supplier",
                                party: row.supplier,
                                credit_in_account_currency: row.fee,
                                user_remark: `خصم من حساب المصروفات المقدمة ${row.item} على العميل ${row.customer}`
                            },
                            {
                                account: "1310 - Debtors - A",
                                party_type: "Customer",
                                party: row.customer,
                                debit_in_account_currency: row.fee,
                                user_remark: `تحميل خدمة ${row.item} على العميل ${row.customer}`
                            }
                        ];

                    // 5. Add journal entry data to a list for creation after save
                    frm.journal_entries_to_create.push({
                        accounts: accounts,
                        title: journal_entry_title,
                        row_idx: row.idx
                    });
                }
            });
        }
    },

    // 6. After the document is saved, create and submit journal entries
    after_save: function(frm) {
        if (frm.journal_entries_to_create && frm.journal_entries_to_create.length > 0) {
            frm.journal_entries_to_create.forEach(entry => {
                create_journal_entry(entry.accounts, entry.title, entry.row_idx, frm);
            });

            // 7. Clear the list to avoid duplication
            frm.journal_entries_to_create = [];
        }
    }
});

// 8. Function to create, submit the Journal Entry and update child table with reference_doc
function create_journal_entry(accounts, journal_entry_title, row_idx, frm) {
    // 8.1 Create the Journal Entry document
    frappe.call({
        method: "frappe.client.insert",
        args: {
            doc: {
                doctype: "Journal Entry",
                posting_date: frappe.datetime.nowdate(),
                title: journal_entry_title,
                user_remark: journal_entry_title,
                accounts: accounts,
                custom_customer: frm.doc.customer,
                custom_bol_no: frm.doc.bol_no,
                custom_transaction: frm.doc.transaction_no,
                custom_trips: frm.doc.name
            }
        },
        callback: function(response) {
            if (response.message) {
                let journal_entry_no = response.message.name;

                // 8.2 Submit the Journal Entry after creation
                frappe.call({
                    method: "frappe.client.submit",
                    args: {
                        doc: response.message
                    },
                    callback: function(submit_response) {
                        if (submit_response.message) {
                            // 8.3 Update reference_doc in the correct child row
                let row = frm.doc.trip_stops.find(r => r.idx === row_idx);
                if (row) {
                    frappe.model.set_value(row.doctype, row.name, "reference_doc", journal_entry_no);
                }

                frappe.msgprint(__("Journal Entry created and submitted: ") + journal_entry_no);
                frm.refresh_field("trip_stops");
            } else {
                frappe.throw(__('Journal Entry was created but failed to submit.'));
            }
        }
    });

} else {
    frappe.throw(__('Error occurred while creating Journal Entry.'));
}
}
});
}
