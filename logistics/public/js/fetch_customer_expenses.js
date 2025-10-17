// 1) UI: Add "Fetch Expenses" button on Sales Invoice form refresh
frappe.ui.form.on('Sales Invoice', {
    // 1.1) Add custom button on refresh
    refresh: function(frm) {
        // On click, confirm if rows exist, then run fetch
        frm.add_custom_button(__('Fetch Expenses'), function() {
            // Confirm if expenses already exist
            if (frm.doc.custom_customer_expense?.length) {
                frappe.confirm(__('There are existing expenses. Do you want to clear and fetch again?'),
                    () => fetch_expenses(frm),
                    () => frappe.msgprint(__('Fetching cancelled.'))
                );
            } else {
                fetch_expenses(frm);
            }
        });
    }
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
        callback: function(r) {
            // 2.4) On success: append rows and compute totals
            if (r.message?.length) {
                // Add fetched expenses
                r.message.forEach(expense => {
                    let row = frm.add_child('custom_customer_expense');
                    Object.assign(row, expense);
                });
                frm.refresh_field('custom_customer_expense');

                // Calculate total expenses
                let total_expenses = frm.doc.custom_customer_expense.reduce((sum, row) => sum + parseFloat(row.fee || 0), 0);
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
        }
    });
}

// 3) Calculate total = expenses + grand total
function calculate_expenses_and_grand(frm) {
    let total = (parseFloat(frm.doc.custom_total_expenses || 0)) + (parseFloat(frm.doc.grand_total || 0));
    frm.set_value('custom_expenses_and_grand', total);
}
