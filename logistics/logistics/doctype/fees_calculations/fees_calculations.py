# Copyright (c) 2024, HCS and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils.background_jobs import enqueue
import json

class FeesCalculations(Document):
    def on_submit(self):
        self.create_journal_entries()

    # def on_cancel(self):
    # 	self.cancel_linked_docs()

    def cancel_linked_docs(self):
        jes= frappe.get_all("Journal Entry",filters={"from_fees_calculation":1,"fees_calculations":self.name},pluck='name')
        for je in jes:
            frappe.throw(
                    f"Cancel linked journal entry: "
                    f"<a href='/app/fees-calculations/{je}'>{je}</a>"
                    )



    
    def create_journal_entries(self):
        l = []

        settings = frappe.get_all(
            "Fee Calculation Account",
            filters={"parenttype": "Logistics Settings", "parent": "Logistics Settings"},
            fields=["*"]
        )
        fleet_settings = frappe.get_all(
            "Fleet Calculation Account",
            filters={"parenttype": "Fleet Settings", "parent": "Fleet Settings"},
            fields=["*"]
        )

        if not settings:
            frappe.throw(_("Please set accounts in Logistics Settings"))

        valid_items = [item["item"] for item in settings]
        valid_fleet_items = [item["item"] for item in fleet_settings]
        purchase_order_data = {}
        grouped_entries = {}
        item_taxes = []
        
        for fee in self.fees:
            if  not fee.fleet and fee.item not in valid_items :
                frappe.throw(_(f"Item {fee.item} does not exist in Fee Logistics settings"))

            if fee.fleet and fee.item not in valid_fleet_items :
                frappe.throw(_(f"Item {fee.item} does not exist in Fleet settings"))

            for item in settings:
                if fee.fleet == 1:
                    continue

                if fee.item == item["item"]:
                    accounts = []

                    # Validate debit account
                    if not item.debit:
                        frappe.throw(_("Debit account is missing in Fee Calculation Account for item {0}".format(fee.item)))
                    
                    debit_type = frappe.db.get_value("Account", item.debit, "account_type")
                    if debit_type in ["Receivable", "Payable"]:
                        if not item.party_type or not item.party:
                            frappe.throw(_("Party Type and Party must be set in Fee Calculation Account for debit entry."))

                        debit = {
                            "account": item.debit,
                            "party_type": item.party_type,
                            "party": item.party,
                            "transaction": self.transaction_no,

                            "debit_in_account_currency": fee.fee,
                            "credit_in_account_currency": 0
                        }
                    else:
                        debit = {
                            "account": item.debit,
                            "debit_in_account_currency": fee.fee,
                            "transaction": self.transaction_no,

                            "credit_in_account_currency": 0
                        }

                    # Validate credit account (fee.bank)
                    if not fee.bank:
                        frappe.throw(_("Bank account is missing for fee item {0}".format(fee.item)))

                    credit = {
                        "account": fee.bank,
                        "debit_in_account_currency": 0,
                        "transaction": self.transaction_no,

                        "credit_in_account_currency": fee.fee
                    }

                    accounts.append(debit)
                    accounts.append(credit)

                    journal_entry = frappe.get_doc({
                        "doctype": "Journal Entry",
                        "voucher_type": "Journal Entry",
                        "from_fees_calculation": 1,
                        "fees_calculations": self.name,
                        "posting_date": frappe.utils.nowdate(),
                        "accounts": accounts,
                        "user_remark": f"Journal entry for fee item {fee.item}"
                    })

                    journal_entry.insert()
                    journal_entry.submit()
                    break

            
            for item in fleet_settings:
                if fee.fleet != 1:
                    continue

                if fee.item == item["item"]:
                    accounts = []

                    if not item.debit:
                        frappe.throw(_("Debit account is missing in Fleet Calculation Account for item {0}".format(fee.item)))

                    debit_type = frappe.db.get_value("Account", item.debit, "account_type")
                    if debit_type in ["Receivable", "Payable"]:
                        if not item.party_type or not item.party:
                            frappe.throw(_("Party Type and Party must be set in Fleet Calculation Account for debit entry."))

                        debit = {
                            "account": item.debit,
                            "party_type": item.party_type,
                            "party": item.party,
                            "transaction": self.transaction_no,
                            "trips": fee.reference_name if fee.reference == "Trips" else "",
                            "debit_in_account_currency": fee.fee,
                            "credit_in_account_currency": 0
                        }
                    else:
                        debit = {
                            "account": item.debit,
                            "debit_in_account_currency": fee.fee,
                            "transaction": self.transaction_no,
                            "trips": fee.reference_name if fee.reference == "Trips" else "",
                            "credit_in_account_currency": 0
                        }

                    transporter = frappe.db.get_value("Trips", fee.reference_name, "transporter")
                    fleet = frappe.db.get_value("Trips", fee.reference_name, "driver_id")
                    driver = frappe.db.get_value("Fleet", fleet, "driver")
                    employee = frappe.db.get_value("Driver", driver, "employee")

                    # Check with VAT conditions
                    transporter_with_vat = frappe.db.get_value("Supplier", transporter, "with_vat")
                    item_with_vat = frappe.db.get_value("Item", fee.item, "with_vat")
                    apply_vat = transporter_with_vat or item_with_vat

                    vat_amount = round(fee.fee * 0.15, 2) if apply_vat else 0

                    if transporter:
                        # Prepare item details
                        if fee.item == "موعد":
                            account = frappe.db.get_value("Fleet Settings", "Fleet Settings", "bank_credit")
                            if not account:
                                frappe.throw(_("Bank account is missing in Fleet Settings"))

                            credit_type = frappe.db.get_value("Account", account, "account_type")
                            if credit_type in ["Receivable", "Payable"]:
                                credit = {
                                    "account": account,
                                    "party_type": party_type,
                                    "party": party,
                                    "transaction": self.transaction_no,
                                    "trips": fee.reference_name if fee.reference == "Trips" else "",
                                    "debit_in_account_currency": 0,
                                    "credit_in_account_currency": fee.fee + vat_amount
                                }
                            else:
                                credit = {
                                    "account": account,
                                    "debit_in_account_currency": 0,
                                    "transaction": self.transaction_no,
                                    "trips": fee.reference_name if fee.reference == "Trips" else "",
                                    "credit_in_account_currency": fee.fee + vat_amount
                                }
                            if item_with_vat:
                                vat_account = frappe.db.get_value("Fleet Settings", "Fleet Settings", "vat_account")
                                if not vat_account:
                                    frappe.throw(_("VAT account is missing in Fleet Settings"))

                                vat_entry = {
                                    "account": vat_account,
                                    "debit_in_account_currency": 0,
                                    "transaction": self.transaction_no,
                                    "trips": fee.reference_name if fee.reference == "Trips" else "",
                                    "debit_in_account_currency": vat_amount
                                }
                                accounts.append(vat_entry)

                            accounts.append(debit)
                            accounts.append(credit)

                            journal_entry = frappe.get_doc({
                                "doctype": "Journal Entry",
                                "voucher_type": "Journal Entry",
                                "from_fees_calculation": 1,
                                "fees_calculations": self.name,
                                "posting_date": frappe.utils.nowdate(),
                                "accounts": accounts,
                                "user_remark": f"Journal entry for fleet item {fee.item}"
                            })

                            journal_entry.insert()
                            journal_entry.submit()
                            break

                        else:

                        
                            item_details = {
                                "item_code": fee.item,
                                "qty": 1,
                                "rate": fee.fee,
                                "amount": fee.fee,
                                "description": frappe.db.get_value("Item", fee.item, "description")
                            }
                            
                            if not transporter_with_vat and item_with_vat:
                                tax = frappe.get_all("Item Tax",filters= {"parent":fee.item,"parenttype":"Item"}, pluck='item_tax_template')

                                if tax and len(tax):
                                    item_details["item_tax_template"] = tax[0]

                                    tax_rate = frappe.get_all("Item Tax Template Detail",filters={"parent":tax[0],"parenttype":"Item Tax Template"},pluck='tax_rate')

                                    if tax_rate and len(tax_rate):
                                        vat_account = frappe.db.get_value("Fleet Settings", "Fleet Settings", "vat_account")
                                        if not vat_account:
                                            frappe.throw(_("VAT account is missing in Fleet Settings"))

                                        vat_item_amount = round(fee.fee * (tax_rate[0] / 100), 2)

                                        item_taxes.append({
                                                "charge_type": "Actual",
                                                "account_head": vat_account,
                                                "rate": tax_rate[0],
                                                "description": tax[0],
                                                "tax_amount": vat_item_amount
                                            })
                                        
                    

                            # Add VAT as a charge if applicable
                            taxes= []
                            if transporter_with_vat:
                                vat_account = frappe.db.get_value("Fleet Settings", "Fleet Settings", "vat_account")
                                if not vat_account:
                                    frappe.throw(_("VAT account is missing in Fleet Settings"))

                                taxes.append({
                                    "charge_type": "On Net Total",
                                    "account_head": vat_account,
                                    "rate": 15,
                                    "description": "VAT 15%",
                                    "tax_amount": vat_amount
                                })
                            

                            if fee.reference_name not in purchase_order_data:
                                

                                

                                purchase_order_data[fee.reference_name] = {
                                    "supplier": transporter,
                                    "type": fee.reference,
                                    "items": [],
                                    "taxes": taxes,
                                    "remarks": f"Purchase Order for transporter {transporter}",
                                    "transaction": self.transaction_no,
                                    "trip": fee.reference_name if fee.reference == "Trips" else ""
                                }

                            purchase_order_data[fee.reference_name]["items"].append(item_details)


                    else:
                        party_type = "Employee"
                        party = employee

                        if fee.item == "موعد":
                            account = frappe.db.get_value("Fleet Settings", "Fleet Settings", "bank_credit")
                            if not account:
                                frappe.throw(_("Bank account is missing in Fleet Settings"))
                        else:
                            account = frappe.db.get_value("Fleet Settings", "Fleet Settings", "employee_credit")
                            if not account:
                                frappe.throw(_("Credit account is missing in Fleet Settings"))

                        credit_type = frappe.db.get_value("Account", account, "account_type")
                        if credit_type in ["Receivable", "Payable"]:
                            credit = {
                                "account": account,
                                "party_type": party_type,
                                "party": party,
                                "transaction": self.transaction_no,
                                "trips": fee.reference_name if fee.reference == "Trips" else "",
                                "debit_in_account_currency": 0,
                                "credit_in_account_currency": fee.fee + vat_amount
                            }
                        else:
                            credit = {
                                "account": account,
                                "debit_in_account_currency": 0,
                                "transaction": self.transaction_no,
                                "trips": fee.reference_name if fee.reference == "Trips" else "",
                                "credit_in_account_currency": fee.fee + vat_amount
                            }
                        if item_with_vat:
                            vat_account = frappe.db.get_value("Fleet Settings", "Fleet Settings", "vat_account")
                            if not vat_account:
                                frappe.throw(_("VAT account is missing in Fleet Settings"))

                            vat_entry = {
                                "account": vat_account,
                                "debit_in_account_currency": 0,
                                "transaction": self.transaction_no,
                                "trips": fee.reference_name if fee.reference == "Trips" else "",
                                "debit_in_account_currency": vat_amount
                            }
                            accounts.append(vat_entry)

                        accounts.append(debit)
                        accounts.append(credit)

                        journal_entry = frappe.get_doc({
                            "doctype": "Journal Entry",
                            "voucher_type": "Journal Entry",
                            "from_fees_calculation": 1,
                            "fees_calculations": self.name,
                            "posting_date": frappe.utils.nowdate(),
                            "accounts": accounts,
                            "user_remark": f"Journal entry for fleet item {fee.item}"
                        })

                        journal_entry.insert()
                        journal_entry.submit()
                        break





                        # accounts.append(debit)
                        # accounts.append(credit)

                        # journal_entry = frappe.get_doc({
                        #     "doctype": "Journal Entry",
                        #     "voucher_type": "Journal Entry",
                        #     "from_fees_calculation": 1,
                        #     "fees_calculations": self.name,
                        #     "posting_date": frappe.utils.nowdate(),
                        #     "accounts": accounts,
                        #     "user_remark": f"Journal entry for fleet item {fee.item}"
                        # })

                        # journal_entry.insert()
                        # journal_entry.submit()
                        # break
        

        for reference_name, po_data in purchase_order_data.items():

            if len(item_taxes):
                total_tax = 0
                for tax in item_taxes:
                    total_tax += tax.get("tax_amount")

                item_taxes[0]["tax_amount"] = total_tax
                po_data["taxes"].append(item_taxes[0])

            purchase_order = frappe.get_doc({
                "doctype": "Purchase Order",
                "supplier": po_data["supplier"],
                "from_fees_calculation": 1,
                "fees_calculations": self.name,
                "schedule_date": frappe.utils.nowdate(),
                "items": po_data["items"],
                "taxes": po_data["taxes"],
                "remarks": po_data["remarks"],
                "transaction": po_data["transaction"],
            })
            purchase_order.insert()
            purchase_order.submit()

        
        

        # for reference_name, data in grouped_entries.items():
        #     total_credit = data["total_fee"] + data["total_vat"]
        #     data["debit_entries"][0]["debit_in_account_currency"]=  data["total_fee"]
        #     data["credit_entries"][0]["credit_in_account_currency"]=  total_credit
        #     data["vats"][0]["debit_in_account_currency"] =  data["total_vat"]


        #     # frappe.throw(str(data["vats"][0]))
        #     debit_entry = data["debit_entries"][0]


        #     credit_entry =data["credit_entries"][0]

        #     vat_entry = data["vats"][0]

        #     accounts = [debit_entry,credit_entry, vat_entry]

        #     journal_entry = frappe.get_doc({
        #         "doctype": "Journal Entry",
        #         "voucher_type": "Journal Entry",
        #         "from_fees_calculation": 1,
        #         "fees_calculations": self.name,
        #         "posting_date": frappe.utils.nowdate(),
        #         "accounts": accounts,
        #         "user_remark": f"Journal entry for fees under reference {reference_name}",
        #     })
        #     journal_entry.insert()
        #     journal_entry.submit()
    @frappe.whitelist()
    def create_invoice(self):
        invoice = frappe.new_doc("Sales Invoice")
        invoice.customer = self.customer
        invoice.transaction = self.transaction_no
        for fee in self.fees:
            item_name = frappe.db.get_value("Item",fee.item,"item_name")
            uom = frappe.db.get_value("Item",fee.item,"stock_uom")

            invoice.append("items",
                           {
                               "item_code": fee.item,
                               "item_name": item_name,
                               "uom": uom,
                               "description": item_name,
                               "qty": 1,
                               "fees_calculations": self.name,
                               "transaction": self.transaction_no,
                               "trips": fee.reference_name,
                               "rate": fee.fee,
                               "base_rate": fee.fee,
                               "amount":fee.fee,
                               "base_amount":fee.fee,
                           })
        invoice.insert()
        frappe.db.set_value("Fees Calculations",self.name,"sales_invoice",invoice.name)


@frappe.whitelist()
def create_invoices(fees):
    if isinstance(fees, str):
        fees = json.loads(fees)

    total_records = len(fees)
    if total_records > 10:
        frappe.msgprint(
            _(
                """invoice records will be created in the background."""
            )
        )
        enqueue(
            generate_sales_invoice,
            queue="default",
            timeout=6000,
            event="generate_sales_invoice",
            fees = fees
        )
    else:
        generate_sales_invoice(fees)


def generate_sales_invoice(fees):
    for fee in fees:
        doc = frappe.get_cached_doc("Fees Calculations",fee)

        if doc.sales_invoice:
            continue
        
        invoice = frappe.new_doc("Sales Invoice")
        invoice.customer = doc.customer
        invoice.transaction = doc.transaction_no

        for fee in doc.fees:
            item_name = frappe.db.get_value("Item",fee.item,"item_name")
            uom = frappe.db.get_value("Item",fee.item,"stock_uom")

            invoice.append("items",
                           {
                               "item_code": fee.item,
                               "item_name": item_name,
                               "uom": uom,
                               "description": item_name,
                               "qty": 1,
                               "fees_calculations": doc.name,
                               "transaction": doc.transaction_no,
                               "trips": fee.reference_name,
                               "rate": fee.fee,
                               "base_rate": fee.fee,
                               "amount":fee.fee,
                               "base_amount":fee.fee,
                           })
        invoice.insert()
        frappe.db.set_value("Fees Calculations",fee,"sales_invoice",invoice.name)


