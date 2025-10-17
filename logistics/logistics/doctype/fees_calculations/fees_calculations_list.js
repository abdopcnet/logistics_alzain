
frappe.listview_settings["Fees Calculations"] = {
    onload: function (listview) {
        const fees_names = (listview) => {
            const result = listview.get_checked_items().map((item) => item.name);
            if (result.length === 0) {
              frappe.throw(__("No rows selected."));
            }
            return result;
          };
        const generate_invoice = async (fees) => {
            frappe.call({
                method: "logistics.logistics.doctype.fees_calculations.fees_calculations.create_invoices",
                args:{
                    fees:fees
                },
				callback: function (r) {
				 
				},
			  });
      
            frappe.msgprint(__("Invoices generated successfully"));
          };
   


        listview.page.add_action_item(__("Create Invoices"), async () => {
          let fees = fees_names(listview);
          await generate_invoice(fees);
        });
  
      },
}