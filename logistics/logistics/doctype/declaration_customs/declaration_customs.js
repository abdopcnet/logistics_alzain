// 1. Main Declaration Customs Main logic (validation, protection, auto-JE)
frappe.ui.form.on('Declaration Customs', {
    // 1.1 Validate: Prevent deleting protected rows (no JE creation here)
    validate: function(frm) {
        // 1.1.1 Only check on update (not new)
        if (!frm.is_new()) {
            frappe.call({
                method: 'frappe.client.get',
                args: { doctype: frm.doc.doctype, name: frm.doc.name },
                async: false,
                callback: function(response) {
                    let old_doc = response.message;
                    let old_fees = (old_doc && old_doc.table_myde) ? old_doc.table_myde : [];
                    let new_fees = frm.doc.table_myde || [];
                    // 1.1.2 Find deleted rows
                    let deleted = old_fees.filter(old_row => !new_fees.some(new_row => new_row.name === old_row.name));
                    // 1.1.3 For each deleted row, check reference_doc
                    deleted.forEach(row => {
                        if (row.reference_doc) {
                            frappe.call({
                                method: 'frappe.client.get',
                                args: { doctype: 'Journal Entry', name: row.reference_doc },
                                async: false,
                                callback: function(r) {
                                    if (r.message && r.message.docstatus == 1) {
                                        frappe.throw(__('Cannot delete row linked to submitted Journal Entry: {0}', [row.reference_doc]));
                                    }
                                }
                            });
                        }
                    });
                }
            });
        }
    },
    // 1.2 After save: Create Journal Entries sequentially (after save only)
    after_save: function(frm) {
        // 1.2.1 Recursive JE creation per row
        function create_journal_entries_sequentially(index) {
            if (!frm.doc.table_myde || index >= frm.doc.table_myde.length) return;
            let row = frm.doc.table_myde[index];
            // 1.2.2 If no previous JE, create new one
            if (!row.reference_doc) {
                let journal_entry_title = `${frm.doc.name}\u200E ${row.item}`;
                let accounts = [
                    { account: row.bank, credit_in_account_currency: row.fee, user_remark: `Bank credit for advance expense ${row.item} for customer ${row.customer}, Sadad No. ${row.sadad_no}, Service Date ${row.date}` },
                    { account: row.debit_account, party_type: "Supplier", party: row.supplier, debit_in_account_currency: row.fee, is_advance: "Yes", user_remark: `Advance expense ${row.item} for customer ${row.customer}` },
                    { account: row.debit_account, party_type: "Supplier", party: row.supplier, credit_in_account_currency: row.fee, user_remark: `Expense deduction ${row.item} for customer ${row.customer}` },
                    { account: "1310 - Debtors - A", party_type: "Customer", party: row.customer, debit_in_account_currency: row.fee, user_remark: `Service charge ${row.item} for customer ${row.customer}` }
                ];
                create_journal_entry(accounts, journal_entry_title, row.idx, frm, row.date, function() {
                    create_journal_entries_sequentially(index + 1);
                });
            } else {
                // 1.2.3 If JE exists, just continue to next row
                create_journal_entries_sequentially(index + 1);
            }
        }
        // 1.2.4 Start recursive creation from first row
        create_journal_entries_sequentially(0);
    },
    // 1.3 On transaction_no change: fetch FCL/CBM lists
    transaction_no: function(frm) {
        if (frm.doc.transaction_no) {
            // Clear and fetch fcl_list
            frm.clear_table('fcl_list');
            frappe.model.with_doc('Transaction', frm.doc.transaction_no, function () {
                const source_doc = frappe.model.get_doc("Transaction", frm.doc.transaction_no);
                for (const source_row of source_doc.fcl_list) {
                    const target_row = frm.add_child("fcl_list");
                    target_row.container_no = source_row.container_no;
                    target_row.type = source_row.type;
                    target_row.qty = source_row.qty;
                    target_row.shipment_weight = source_row.shipment_weight;
                    frm.refresh_field('fcl_list');
                }
            });
            // Clear and fetch CBM list
            frm.clear_table('cbm_list');
            frappe.model.with_doc('Transaction', frm.doc.transaction_no, function () {
                const source_doc = frappe.model.get_doc("Transaction", frm.doc.transaction_no);
                for (const source_row of source_doc.cbm_list) {
                    const target_row = frm.add_child("cbm_list");
                    target_row.package_type = source_row.package_type;
                    target_row.pieces = source_row.pieces;
                    target_row.chargeable_weight = source_row.chargeable_weight;
                    target_row.location = source_row.location;
                    frm.refresh_field('cbm_list');
                }
            });
            // Clear and fetch roro_list
            frm.clear_table('roro_list');
            frappe.model.with_doc('Transaction', frm.doc.transaction_no, function () {
                const source_doc = frappe.model.get_doc("Transaction", frm.doc.transaction_no);
                for (const source_row of source_doc.roro_list) {
                    const target_row = frm.add_child("roro_list");
                    target_row.vin_no = source_row.vin_no;
                    target_row.specification_serial_number = source_row.specification_serial_number;
                    target_row.unit_price = source_row.unit_price;
                    target_row.model_year = source_row.model_year;
                    frm.refresh_field('roro_list');
                }
            });
        }
    },
    // 1.4 Import Journal Entries button
    refresh(frm) {
        // 1.5.1 Add custom button to import linked Journal Entries
        frm.add_custom_button('🔗 Fetch Journal Entry', function() {
            if (!frm.doc.transaction_no || !frm.doc.exporter_importer) {
                frappe.msgprint('Save and select customer first.');
                return;
            }
            frappe.call({
                method: 'frappe.client.get_list',
                args: {
                    doctype: 'Journal Entry',
                    filters: {
                        custom_transaction: frm.doc.transaction_no,
                        custom_customer: frm.doc.exporter_importer,
                        custom_declaration_customs: frm.doc.name,
                        docstatus: 1 // fetch only submitted entries
                    },
                    fields: ['name', 'owner', 'creation', 'modified_by', 'modified', 'docstatus', 'total_debit']
                },
                callback: function(r) {
                    if (r.message) {
                        frm.clear_table('transaction_jv_entries');
                        r.message.forEach(function(jv) {
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
                }
            });
        }).addClass('btn-danger');
    }
});

// 2. Create & submit Journal Entry, update child row with reference_doc
function create_journal_entry(accounts, journal_entry_title, row_idx, frm, posting_date, callback) {
    let row = frm.doc.table_myde.find(r => r.idx === row_idx);
    frappe.call({
        method: "frappe.client.insert",
        args: {
            doc: {
                doctype: "Journal Entry",
                posting_date: row.date,
                title: journal_entry_title,
                user_remark: journal_entry_title,
                accounts: accounts,
                custom_customer: row.customer,
                custom_bol_no: row.bol_no,
                custom_transaction: row.transaction,
                custom_declaration_customs: frm.doc.name
                // يمكن إضافة المزيد من الحقول من row إذا لزم الأمر
            }
        },
        callback: function(response) {
            if (response.message) {
                let journal_entry_no = response.message.name;
                frappe.call({
                    method: "frappe.client.submit",
                    args: { doc: response.message },
                    callback: function(submit_response) {
                        if (submit_response.message) {
                            frappe.model.set_value(
                                'Port Fee',
                                row.name,
                                'reference_doc',
                                journal_entry_no
                            );
                            frm.refresh_field("table_myde");
                            frm.save(); // Save the doc after linking Journal Entry
                            if (callback) callback();
                        } else {
                            frappe.throw(__('Journal Entry created but failed to submit.'));
                        }
                    }
                });
            } else {
                frappe.throw(__('Error creating Journal Entry.'));
            }
        }
    });
}

// 3. Port Fee child table: protect delete, auto-fill customer/bol_no
frappe.ui.form.on('Port Fee', {
    // 3.1 Auto-fill customer on add row
    table_myde_add: function(frm, cdt, cdn) {
        let row = locals[cdt][cdn];
        if (frm.doc.exporter_importer) frappe.model.set_value(cdt, cdn, 'customer', frm.doc.exporter_importer);
        if (frm.doc.bol_no) frappe.model.set_value(cdt, cdn, 'bol_no', frm.doc.bol_no);
        if (frm.doc.transaction_no) frappe.model.set_value(cdt, cdn, 'transaction', frm.doc.transaction_no);
    },
    // 3.2 Prevent delete if linked to submitted JE
    before_grid_remove: function(frm, cdt, cdn) {
        let row = locals[cdt][cdn];
        if (row.reference_doc) {
            frappe.db.get_value('Journal Entry', row.reference_doc, 'docstatus', (r) => {
                if (r && r.docstatus == 1) {
                    frappe.msgprint(`Cannot delete: linked to submitted JE ${row.reference_doc}`);
                } else {
                    frm.get_field('table_uuzw').grid.grid_rows_by_docname[cdn].remove();
                }
            });
            return false; // Always prevent default delete for protected row
        }
    }
});
