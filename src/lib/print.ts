import { StoreSettings } from './supabase';
import { formatDateTime } from './utils';

// =============================================================
// TYPES FOR PURCHASE PRINT RECEIPT
// =============================================================
export interface PurchasePrintItem {
  name: string;
  batch_no: string;
  expiry_date: string;
  qty: number | string;
  bonus_qty?: number | string;
  unit?: string;
  mrp: number | string;
  gst_amt?: number | string;
  adv_tax_amt?: number | string;
  further_tax_amt?: number | string;
  lineTotal: number;
}

export interface PurchasePrintData {
  invoice_no: string;
  vendor_name: string;
  purchase_date: string;
  items: PurchasePrintItem[];
  items_subtotal: number;
  total_discount?: number;
  gst_amt?: number;
  gst_percent?: number | string;
  adv_tax_amt?: number;
  adv_tax_percent?: number | string;
  further_tax_amt?: number;
  further_tax_percent?: number | string;
  net_payable: number;
}

// =============================================================
// 1 & 2: SALE INVOICE & SALES RETURN SLIP (ORIGINAL UNTOUCHED)
// =============================================================
export function printThermalReceipt({
  settings,
  sale,
  items,
}: {
  settings: StoreSettings | null;
  sale: any;
  items: any[];
}) {
  const isReturn =
    sale.invoice_no?.startsWith('RET-') ||
    sale.customer_name?.includes('(RETURN)') ||
    sale.payment_type === 'Refund';

  const storeName = settings?.name || 'Pharmacy Store';
  const address = settings?.address || '';
  const phone = settings?.phone || '';

  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document;
  if (!doc) return;

  // -------------------------------------------------------------
  // 1. REGULAR SALE INVOICE (No Adjustment Line on Receipt)
  // -------------------------------------------------------------
  if (!isReturn) {
    const grossTotal = Number(sale.total_amount ?? 0);
    const discount = Number(sale.discount ?? 0);
    const adjustment = Number(sale.round_off ?? 0);
    const netPayable = Number(sale.net_payable ?? (grossTotal - discount + adjustment));
    const cashPaid = Number(sale.cash_received ?? netPayable);
    const change = Number(sale.change_return ?? (cashPaid - netPayable));

    const saleItemsHtml = items
      .map((it) => {
        const name = it.name || '';
        const unit = it.unit ? ` (${it.unit})` : '';
        const qty = Number(it.qty ?? 1);
        const rate = Number(it.unit_price ?? 0);
        const discPercent = Number(it.discount_percent ?? 0);
        const amt = Number(it.line_total ?? (rate * qty * (1 - discPercent / 100)));

        return `
          <tr>
            <td style="padding: 2px 0; word-break: break-word;">${name}${unit}</td>
            <td style="text-align: center; padding: 2px 0;">${qty}</td>
            <td style="text-align: right; padding: 2px 0;">${rate.toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
            <td style="text-align: center; padding: 2px 0;">${discPercent > 0 ? `${discPercent}%` : '-'}</td>
            <td style="text-align: right; padding: 2px 0;">${amt.toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
          </tr>
        `;
      })
      .join('');

    doc.open();
    doc.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Sale Receipt</title>
          <style>
            @page { margin: 0; size: auto; }
            body {
              font-family: 'Courier New', Courier, monospace;
              font-size: 11px;
              margin: 0;
              padding: 8px;
              color: #000;
              width: 76mm;
            }
            .center { text-align: center; }
            .bold { font-weight: bold; }
            .title { font-size: 14px; margin-bottom: 2px; }
            .divider { border-top: 1px dashed #000; margin: 4px 0; }
            .meta-table, .items-table, .totals-table { width: 100%; border-collapse: collapse; }
            .meta-table td { padding: 1px 0; }
            .items-table th { border-bottom: 1px dashed #000; padding: 2px 0; font-size: 10px; }
            .totals-table td { padding: 1.5px 0; }
            .policy-box { margin-top: 5px; font-size: 10px; line-height: 1.3; }
            .policy-box ul { margin: 3px 0; padding-left: 14px; }
          </style>
        </head>
        <body>
          <div class="center bold title">${storeName}</div>
          ${address ? `<div class="center">${address}</div>` : ''}
          ${phone ? `<div class="center">Phone: ${phone}</div>` : ''}

          <div class="divider"></div>
          <table class="meta-table">
            <tr>
              <td>Invoice:</td>
              <td class="bold" style="text-align: right;">${sale.invoice_no}</td>
            </tr>
            <tr>
              <td>Date:</td>
              <td style="text-align: right;">${formatDateTime(sale.created_at || new Date().toISOString())}</td>
            </tr>
            <tr>
              <td>Customer:</td>
              <td class="bold" style="text-align: right;">${sale.customer_name || 'Walking Customer'}</td>
            </tr>
            <tr>
              <td>Phone:</td>
              <td style="text-align: right;">${sale.customer_phone || '-'}</td>
            </tr>
            ${sale.cashier_name ? `<tr><td>Cashier:</td><td style="text-align: right;">${sale.cashier_name}</td></tr>` : ''}
          </table>

          <div class="divider"></div>
          <table class="items-table">
            <thead>
              <tr>
                <th style="width: 40%; text-align: left;">ITEM</th>
                <th style="width: 10%; text-align: center;">QTY</th>
                <th style="width: 20%; text-align: right;">RATE</th>
                <th style="width: 10%; text-align: center;">DISC</th>
                <th style="width: 20%; text-align: right;">AMT</th>
              </tr>
            </thead>
            <tbody>
              ${saleItemsHtml}
            </tbody>
          </table>

          <div class="divider"></div>
          <table class="totals-table">
            <tr>
              <td>Gross Total:</td>
              <td style="text-align: right;">${grossTotal.toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
            </tr>
            ${discount > 0 ? `
              <tr>
                <td>Discount:</td>
                <td style="text-align: right;">-${discount.toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
              </tr>
            ` : ''}
            <tr class="bold" style="font-size: 13px;">
              <td style="padding-top: 3px;">NET PAYABLE:</td>
              <td style="text-align: right; padding-top: 3px;">Rs. ${netPayable.toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
            </tr>
          </table>

          <div class="divider"></div>
          <table class="totals-table">
            <tr>
              <td>Cash Paid:</td>
              <td style="text-align: right;">${cashPaid.toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
            </tr>
            <tr>
              <td>Change:</td>
              <td style="text-align: right;">${(change >= 0 ? change : 0).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
            </tr>
          </table>

          <div class="divider"></div>
          <div class="policy-box">
            <div class="center bold">TERMS & RETURN POLICY</div>
            <ul>
              <li>Medicines without bill cannot be returned or claimed.</li>
              <li>Refrigerated / Cold-chain items and loose blister cuts are non-returnable.</li>
              <li>Returns valid within 3 days in original packaging.</li>
            </ul>
          </div>

          <div class="divider"></div>
          <div class="center" style="margin-top: 3px;">Thank you for visiting!</div>
          <div class="center bold" style="margin-top: 3px; font-size: 10px;">STANDARD PRO by TECHI</div>
          <div class="center" style="font-size: 9px;">Contact: 03314289788</div>
        </body>
      </html>
    `);
    doc.close();
  }

  // -------------------------------------------------------------
  // 2. SALES RETURN SLIP (Clean Return slip layout)
  // -------------------------------------------------------------
  else {
    const totalRefund = Math.abs(Number(sale.net_payable ?? sale.total_amount ?? 0));

    const returnItemsHtml = items
      .map((it) => {
        const name = it.name || '';
        const unit = it.unit ? ` (${it.unit})` : '';
        const qty = Number(it.qty ?? 1);
        const rate = Number(it.unit_price ?? 0);
        const amt = Math.abs(Number(it.line_total ?? rate * qty));

        return `
          <tr>
            <td style="padding: 2px 0; word-break: break-word;">${name}${unit}</td>
            <td style="text-align: center; padding: 2px 0;">${qty}</td>
            <td style="text-align: right; padding: 2px 0;">${rate.toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
            <td style="text-align: right; padding: 2px 0;">${amt.toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
          </tr>
        `;
      })
      .join('');

    doc.open();
    doc.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Return Slip</title>
          <style>
            @page { margin: 0; size: auto; }
            body {
              font-family: 'Courier New', Courier, monospace;
              font-size: 11px;
              margin: 0;
              padding: 8px;
              color: #000;
              width: 76mm;
            }
            .center { text-align: center; }
            .bold { font-weight: bold; }
            .title { font-size: 14px; margin-bottom: 2px; }
            .divider { border-top: 1px dashed #000; margin: 4px 0; }
            .meta-table, .items-table, .totals-table { width: 100%; border-collapse: collapse; }
            .meta-table td { padding: 1px 0; }
            .items-table th { border-bottom: 1px dashed #000; padding: 2px 0; }
            .totals-table td { padding: 2px 0; }
          </style>
        </head>
        <body>
          <div class="center bold title">${storeName}</div>
          ${address ? `<div class="center">${address}</div>` : ''}
          ${phone ? `<div class="center">Phone: ${phone}</div>` : ''}
          <div class="center bold" style="margin-top: 3px; font-size: 11px;">*** SALES RETURN SLIP ***</div>

          <div class="divider"></div>
          <table class="meta-table">
            <tr>
              <td>Invoice:</td>
              <td class="bold" style="text-align: right;">${sale.invoice_no}</td>
            </tr>
            <tr>
              <td>Date:</td>
              <td style="text-align: right;">${formatDateTime(sale.created_at || new Date().toISOString())}</td>
            </tr>
            <tr>
              <td>Customer:</td>
              <td class="bold" style="text-align: right;">${sale.customer_name || 'Walking Customer'}</td>
            </tr>
            <tr>
              <td>Phone:</td>
              <td style="text-align: right;">${sale.customer_phone || '-'}</td>
            </tr>
            ${sale.cashier_name ? `<tr><td>Cashier:</td><td style="text-align: right;">${sale.cashier_name}</td></tr>` : ''}
          </table>

          <div class="divider"></div>
          <table class="items-table">
            <thead>
              <tr>
                <th style="width: 48%; text-align: left;">ITEM</th>
                <th style="width: 14%; text-align: center;">QTY</th>
                <th style="width: 18%; text-align: right;">RATE</th>
                <th style="width: 20%; text-align: right;">AMT</th>
              </tr>
            </thead>
            <tbody>
              ${returnItemsHtml}
            </tbody>
          </table>

          <div class="divider"></div>
          <table class="totals-table">
            <tr class="bold" style="font-size: 13px;">
              <td>TOTAL REFUND:</td>
              <td style="text-align: right;">Rs. ${totalRefund.toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
            </tr>
          </table>

          <div class="divider"></div>
          <div class="center" style="margin-top: 3px;">Items Restocked to Inventory</div>
          <div class="center bold" style="margin-top: 3px; font-size: 10px;">STANDARD PRO by TECHI</div>
          <div class="center" style="font-size: 9px;">Contact: 03314289788</div>
        </body>
      </html>
    `);
    doc.close();
  }

  // Trigger print dialog
  setTimeout(() => {
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();
    setTimeout(() => {
      document.body.removeChild(iframe);
    }, 1500);
  }, 300);
}

// =============================================================
// 3: PURCHASE INVOICE RECEIPT (Custom 3-Column Compact Width)
// =============================================================
export function printPurchaseReceipt(
  data: PurchasePrintData,
  settings: StoreSettings | null
) {
  const storeName = settings?.name || 'Bin Shams Medicos';
  const address = settings?.address || '';
  const phone = settings?.phone || '';

  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document;
  if (!doc) return;

  const itemsRows = data.items
    .map((it) => {
      const q = Number(it.qty) || 0;
      const b = Number(it.bonus_qty) || 0;
      const totalTaxes =
        (Number(it.gst_amt) || 0) +
        (Number(it.adv_tax_amt) || 0) +
        (Number(it.further_tax_amt) || 0);

      return `
        <tr>
          <td style="padding: 3px 0; word-break: break-word;">
            <div style="font-weight: bold;">${it.name}</div>
            <div style="font-size: 9px; color: #444;">MRP: ${Number(it.mrp).toFixed(2)} | Exp: ${it.expiry_date || 'N/A'} | B: ${it.batch_no || 'N/A'}</div>
          </td>
          <td style="padding: 3px 2px; text-align: center;">
            ${q} ${it.unit || 'Box'}${b > 0 ? `<br><small style="color: #666;">+${b}bon</small>` : ''}
          </td>
          <td style="padding: 3px 2px; text-align: right;">
            ${totalTaxes > 0 ? totalTaxes.toFixed(1) : '0'}
          </td>
          <td style="padding: 3px 0; text-align: right; font-weight: bold;">
            ${Number(it.lineTotal).toFixed(2)}
          </td>
        </tr>
      `;
    })
    .join('');

  doc.open();
  doc.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Purchase Receipt #${data.invoice_no}</title>
        <style>
          @page { margin: 0; size: auto; }
          body {
            font-family: 'Courier New', Courier, monospace;
            font-size: 11px;
            margin: 0;
            padding: 8px;
            color: #000;
            width: 76mm;
          }
          .center { text-align: center; }
          .bold { font-weight: bold; }
          .title { font-size: 14px; margin-bottom: 2px; }
          .divider { border-top: 1px dashed #000; margin: 4px 0; }
          .meta-table, .items-table, .totals-table { width: 100%; border-collapse: collapse; }
          .meta-table td { padding: 1px 0; }
          .items-table th { border-bottom: 1px dashed #000; padding: 2px 0; font-size: 10px; }
          .totals-table td { padding: 1.5px 0; }
        </style>
      </head>
      <body>
        <div class="center bold title">${storeName}</div>
        ${address ? `<div class="center">${address}</div>` : ''}
        ${phone ? `<div class="center">Phone: ${phone}</div>` : ''}
        <div class="center bold" style="margin-top: 3px; font-size: 11px;">*** PURCHASE INVOICE ***</div>

        <div class="divider"></div>
        <table class="meta-table">
          <tr>
            <td>Vendor:</td>
            <td class="bold" style="text-align: right;">${data.vendor_name}</td>
          </tr>
          <tr>
            <td>Invoice #:</td>
            <td class="bold" style="text-align: right;">${data.invoice_no}</td>
          </tr>
          <tr>
            <td>Purchase Date:</td>
            <td style="text-align: right;">${data.purchase_date}</td>
          </tr>
        </table>

        <div class="divider"></div>
        <table class="items-table">
          <thead>
            <tr>
              <th style="width: 44%; text-align: left;">ITEM</th>
              <th style="width: 18%; text-align: center;">QTY</th>
              <th style="width: 16%; text-align: right;">TAX</th>
              <th style="width: 22%; text-align: right;">NET</th>
            </tr>
          </thead>
          <tbody>
            ${itemsRows}
          </tbody>
        </table>

        <div class="divider"></div>
        <table class="totals-table">
          <tr>
            <td>Items Net Subtotal:</td>
            <td style="text-align: right;">Rs. ${Number(data.items_subtotal).toFixed(2)}</td>
          </tr>
          ${Number(data.total_discount) > 0 ? `
            <tr>
              <td>Overall Discount:</td>
              <td style="text-align: right;">-Rs. ${Number(data.total_discount).toFixed(2)}</td>
            </tr>
          ` : ''}
          ${Number(data.gst_amt) > 0 ? `
            <tr>
              <td>GST Tax (${data.gst_percent || 0}%):</td>
              <td style="text-align: right;">+Rs. ${Number(data.gst_amt).toFixed(2)}</td>
            </tr>
          ` : ''}
          ${Number(data.adv_tax_amt) > 0 ? `
            <tr>
              <td>Advance Tax WHT (${data.adv_tax_percent || 0}%):</td>
              <td style="text-align: right;">+Rs. ${Number(data.adv_tax_amt).toFixed(2)}</td>
            </tr>
          ` : ''}
          ${Number(data.further_tax_amt) > 0 ? `
            <tr>
              <td>Further Tax (${data.further_tax_percent || 0}%):</td>
              <td style="text-align: right;">+Rs. ${Number(data.further_tax_amt).toFixed(2)}</td>
            </tr>
          ` : ''}
          <tr class="bold" style="font-size: 13px;">
            <td style="padding-top: 3px;">GRAND TOTAL:</td>
            <td style="text-align: right; padding-top: 3px;">Rs. ${Number(data.net_payable).toFixed(2)}</td>
          </tr>
        </table>

        <div class="divider"></div>
        <div class="center" style="margin-top: 4px; font-size: 10px;">Stock Received & Recorded</div>
        <div class="center bold" style="margin-top: 3px; font-size: 10px;">STANDARD PRO by TECHI</div>
        <div class="center" style="font-size: 9px;">Contact: 03314289788</div>
      </body>
    </html>
  `);
  doc.close();

  // Trigger print dialog
  setTimeout(() => {
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();
    setTimeout(() => {
      document.body.removeChild(iframe);
    }, 1500);
  }, 300);
}