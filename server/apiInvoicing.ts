import { getApiPool } from './apiAuth';
import { sendApiInvoiceEmail } from './emailService';

export async function generateInvoiceNumber(pool: any): Promise<string> {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const prefix = `RC-API-${year}${month}`;

  const { rows } = await pool.query(
    `SELECT COUNT(*) FROM api_invoices WHERE invoice_number LIKE $1`,
    [`${prefix}-%`]
  );
  const seq = parseInt(rows[0].count) + 1;
  return `${prefix}-${String(seq).padStart(3, '0')}`;
}

export async function runWeeklyApiInvoicingJob(
  manual = false
): Promise<{ invoiced: number; skipped: number; errors: string[] }> {
  const result = { invoiced: 0, skipped: 0, errors: [] as string[] };
  const pool = await getApiPool();

  try {
    console.log(`[INVOICING] Starting API invoice run (manual=${manual})`);

    const { rows: clients } = await pool.query(
      `SELECT id, company_name, email, invoice_cycle, account_status
       FROM api_clients
       WHERE payment_mode = 'pay_later' AND is_active = true AND account_status != 'suspended'
       ORDER BY id`
    );

    if (clients.length === 0) {
      console.log('[INVOICING] No active pay_later clients found');
      return result;
    }

    console.log(`[INVOICING] Found ${clients.length} pay_later client(s)`);

    const { supabaseAdmin } = await import('./supabaseAdmin');
    if (!supabaseAdmin) {
      result.errors.push('Supabase admin not available');
      return result;
    }

    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setUTCHours(23, 59, 59, 999);
    const periodStart = new Date(periodEnd);
    periodStart.setUTCDate(periodStart.getUTCDate() - 6);
    periodStart.setUTCHours(0, 0, 0, 0);

    const periodStartStr = periodStart.toISOString().slice(0, 10);
    const periodEndStr = periodEnd.toISOString().slice(0, 10);

    const dueDate = new Date(now);
    dueDate.setUTCDate(dueDate.getUTCDate() + 30);
    const dueDateStr = dueDate.toISOString().slice(0, 10);

    for (const client of clients) {
      try {
        const { rows: invoicedItems } = await pool.query(
          `SELECT ii.tracking_number FROM api_invoice_items ii
           JOIN api_invoices inv ON inv.id = ii.invoice_id
           WHERE inv.api_client_id = $1`,
          [client.id]
        );
        const invoicedSet = new Set(invoicedItems.map((r: any) => r.tracking_number));

        let unbilledJobs: any[] = [];

        const { data: byClientId, error: byClientIdErr } = await supabaseAdmin
          .from('jobs')
          .select('id, tracking_number, job_number, pickup_address, delivery_address, vehicle_type, scheduled_pickup_time, total_price, created_at')
          .eq('payment_status', 'pay_later')
          .eq('api_client_id', String(client.id));

        if (!byClientIdErr && byClientId && byClientId.length > 0) {
          unbilledJobs = byClientId.filter((j: any) => !invoicedSet.has(j.tracking_number));
        } else {
          const { data: byCreatedBy, error: byCreatedByErr } = await supabaseAdmin
            .from('jobs')
            .select('id, tracking_number, job_number, pickup_address, delivery_address, vehicle_type, scheduled_pickup_time, total_price, created_at')
            .eq('payment_status', 'pay_later')
            .ilike('created_by', `API: ${client.company_name}`);

          if (byCreatedByErr) {
            result.errors.push(`Client ${client.company_name}: ${byCreatedByErr.message}`);
            continue;
          }
          unbilledJobs = (byCreatedBy || []).filter((j: any) => !invoicedSet.has(j.tracking_number));
        }

        await processClientInvoice(pool, supabaseAdmin, client, unbilledJobs, periodStartStr, periodEndStr, dueDateStr, result);
      } catch (e: any) {
        result.errors.push(`${client.company_name}: ${e?.message || 'unknown'}`);
        console.error(`[INVOICING] Error for client ${client.company_name}:`, e?.message);
      }
    }

    console.log(`[INVOICING] Done: invoiced=${result.invoiced}, skipped=${result.skipped}, errors=${result.errors.length}`);
  } catch (e: any) {
    result.errors.push(e?.message || 'unknown');
    console.error('[INVOICING] Fatal:', e?.message);
  } finally {
    await pool.end();
  }

  return result;
}

async function processClientInvoice(
  pool: any,
  supabaseAdmin: any,
  client: any,
  unbilledJobs: any[],
  periodStartStr: string,
  periodEndStr: string,
  dueDateStr: string,
  result: { invoiced: number; skipped: number; errors: string[] }
) {
  if (unbilledJobs.length === 0) {
    console.log(`[INVOICING] No unbilled jobs for ${client.company_name} — skipping`);
    result.skipped++;
    return;
  }

  const totalAmount = unbilledJobs.reduce((sum: number, j: any) => sum + parseFloat(j.total_price || '0'), 0);
  const invoiceNumber = await generateInvoiceNumber(pool);

  const { rows: invoiceRows } = await pool.query(
    `INSERT INTO api_invoices
      (invoice_number, api_client_id, company_name, billing_email, period_start, period_end,
       total_amount, job_count, status, sent_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'sent',NOW())
     RETURNING id`,
    [
      invoiceNumber, client.id, client.company_name, client.email,
      periodStartStr, periodEndStr,
      totalAmount.toFixed(2), unbilledJobs.length,
    ]
  );
  const invoiceId = invoiceRows[0].id;

  for (const job of unbilledJobs) {
    await pool.query(
      `INSERT INTO api_invoice_items
        (invoice_id, job_id, tracking_number, job_number, pickup_address, delivery_address, vehicle_type, scheduled_date, amount)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        invoiceId, String(job.id), job.tracking_number, job.job_number || null,
        job.pickup_address || '', job.delivery_address || '',
        job.vehicle_type || '',
        job.scheduled_pickup_time ? new Date(job.scheduled_pickup_time).toISOString().slice(0, 10) : '',
        parseFloat(job.total_price || '0').toFixed(2),
      ]
    );
  }

  const trackingNumbers = unbilledJobs.map((j: any) => j.tracking_number);
  await supabaseAdmin
    .from('jobs')
    .update({ payment_status: 'invoiced' })
    .in('tracking_number', trackingNumbers);

  const jobItems = unbilledJobs.map((j: any) => ({
    trackingNumber: j.tracking_number,
    pickupAddress: j.pickup_address || 'N/A',
    deliveryAddress: j.delivery_address || 'N/A',
    vehicleType: j.vehicle_type || 'N/A',
    scheduledDate: j.scheduled_pickup_time
      ? new Date(j.scheduled_pickup_time).toISOString().slice(0, 10)
      : 'N/A',
    amount: parseFloat(j.total_price || '0'),
  }));

  try {
    await sendApiInvoiceEmail({
      toEmail: client.email,
      companyName: client.company_name,
      invoiceNumber,
      periodStart: periodStartStr,
      periodEnd: periodEndStr,
      dueDate: dueDateStr,
      totalAmount: totalAmount.toFixed(2),
      jobItems,
    });
    console.log(`[INVOICING] Invoice ${invoiceNumber} → ${client.email} (${unbilledJobs.length} jobs, £${totalAmount.toFixed(2)})`);
  } catch (e: any) {
    console.error(`[INVOICING] Email failed for ${invoiceNumber}:`, e?.message);
  }

  result.invoiced++;
}

export async function resendApiInvoice(invoiceId: number): Promise<void> {
  const pool = await getApiPool();
  try {
    const { rows: invoices } = await pool.query(
      `SELECT id, invoice_number, company_name, billing_email, period_start, period_end, total_amount, job_count
       FROM api_invoices WHERE id = $1`,
      [invoiceId]
    );
    if (!invoices[0]) throw new Error('Invoice not found');
    const inv = invoices[0];

    const { rows: items } = await pool.query(
      `SELECT tracking_number, pickup_address, delivery_address, vehicle_type, scheduled_date, amount
       FROM api_invoice_items WHERE invoice_id = $1 ORDER BY id`,
      [invoiceId]
    );

    const dueDate = new Date();
    dueDate.setUTCDate(dueDate.getUTCDate() + 30);

    await sendApiInvoiceEmail({
      toEmail: inv.billing_email,
      companyName: inv.company_name,
      invoiceNumber: inv.invoice_number,
      periodStart: inv.period_start instanceof Date
        ? inv.period_start.toISOString().slice(0, 10)
        : String(inv.period_start).slice(0, 10),
      periodEnd: inv.period_end instanceof Date
        ? inv.period_end.toISOString().slice(0, 10)
        : String(inv.period_end).slice(0, 10),
      dueDate: dueDate.toISOString().slice(0, 10),
      totalAmount: parseFloat(inv.total_amount).toFixed(2),
      jobItems: items.map((item: any) => ({
        trackingNumber: item.tracking_number,
        pickupAddress: item.pickup_address || 'N/A',
        deliveryAddress: item.delivery_address || 'N/A',
        vehicleType: item.vehicle_type || 'N/A',
        scheduledDate: item.scheduled_date || 'N/A',
        amount: parseFloat(item.amount),
      })),
    });

    await pool.query(
      `UPDATE api_invoices SET sent_at = NOW() WHERE id = $1`,
      [invoiceId]
    );
  } finally {
    await pool.end();
  }
}

export function scheduleWeeklyInvoicing() {
  let lastRunDate = '';

  const checkAndRun = async () => {
    const now = new Date();
    const dayOfWeek = now.getUTCDay();
    const hour = now.getUTCHours();
    const todayStr = now.toISOString().slice(0, 10);

    if (dayOfWeek === 1 && hour >= 9 && lastRunDate !== todayStr) {
      lastRunDate = todayStr;
      console.log('[INVOICING] Monday 9am UTC — starting weekly API invoice run');
      try {
        await runWeeklyApiInvoicingJob();
      } catch (e: any) {
        console.error('[INVOICING] Weekly run failed:', e?.message);
      }
    }
  };

  setTimeout(checkAndRun, 5 * 60 * 1000);
  setInterval(checkAndRun, 60 * 60 * 1000);

  console.log('[INVOICING] Scheduler started (runs Monday 9am UTC)');
}
