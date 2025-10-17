# Sales Invoice: Fetch Expenses Flow

Short, numbered sequence of how the UI and API work together.

1) UI Button (Form Refresh)
- On Sales Invoice refresh, a "Fetch Expenses" button is added.
- On click, if the child table has rows, user is asked to confirm clearing them.

2) Preconditions
- Customer must be selected. If not, the flow stops with a message.

3) Reset Table
- The child table `custom_customer_expense` is cleared to avoid duplicates.

4) Server Call
- The client calls `logistics.logistics.api.fetch_customer_expenses.fetch_expenses_for_invoice`.
- Args: `customer` (required), `bol_no` (optional from `custom_bol_no`).

5) Query Aggregation (Server)
- The API runs a single SQL UNION across:
  - Transaction + Transaction Fee
  - Delivery Order + Agent Fee
  - Declaration Customs + Port Fee
  - Trips + Trip stops
- Optional filter by `bol_no` if provided.
- Returns a unified list of dict rows: customer, bol_no, date, doc, item, supplier, fee, sadad_no.

6) Populate Rows (Client)
- For each returned row, a child row is added and fields are copied.
- The child table is refreshed in the UI.

7) Compute Totals
- `custom_total_expenses` = sum of `fee` across child rows.
- `custom_expenses_and_grand` = `custom_total_expenses` + `grand_total`.

8) No Results Case
- If no rows are returned, totals are reset: `custom_total_expenses` = 0 and `custom_expenses_and_grand` = `grand_total`.

9) Feedback
- Success or no-results messages are shown to the user.

Notes
- This flow is idempotent per fetch: the child table is cleared each time before inserting rows.
- Use `bol_no` to narrow expenses to a specific shipment when available.
