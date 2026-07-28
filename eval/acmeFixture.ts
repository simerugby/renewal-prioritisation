/**
 * A second company's export, shared by the portability test and the
 * cross-company eval.
 *
 * Deliberately awkward in the ways a real export is: a UTF-8 BOM, CRLF endings,
 * a trailing comma on every line, unquoted commas inside the notes, enum values
 * this model has never seen, no NPS columns at all, an SMB book two orders of
 * magnitude smaller, a duplicate id and a d/m/y date.
 *
 * The notes matter as much as the columns. They are lowercase and informal —
 * "practice manager retiring in sept" — which is exactly the phrasing the
 * keyword scanner was never written for.
 */
export const SECOND_COMPANY_CSV =
  '﻿' +
  [
    'customer_id,customer_name,segment,region,industry,csm_name,renewal_date,arr_gbp,contract_term_months,products_owned,seats_purchased,active_users_30d,active_users_previous_30d,days_since_last_customer_engagement,support_tickets_90d,critical_support_tickets_90d,invoice_status,renewal_stage,executive_sponsor_status,last_renewal_discount_pct,usage_data_last_synced_at,customer_notes,',
    'ACME-01,Pinewood Dental,SMB,South West,Healthcare,J Okafor,2026-08-30,4200,12,Bookings,12,4,11,54,3,1,Part-paid,Legal review,Active,10,2026-07-19,practice manager retiring in sept, no handover planned yet,',
    'ACME-02,Halberd Signage,SMB,Midlands,Manufacturing,J Okafor,2026-09-14,1800,12,Bookings,6,5,5,9,0,0,Current,In discussion,Active,0,2026-07-19,happy - asked about adding a second branch,',
    'ACME-03,Vale Physio,SMB,North,Healthcare,R Mensah,2026-08-02,9600,24,Bookings;Reports,30,9,26,71,7,2,Disputed,Not started,Left company,22,2026-07-19,they are trialling a competitor and the owner has stopped replying,',
    'ACME-04,Kestrel Tutors,SMB,London,Education,R Mensah,2026-11-02,46000,12,Reports,140,131,126,4,2,0,Current,Verbal commitment,Active,5,2026-07-19,renewal agreed verbally; paperwork with their accountant,',
    'ACME-05,Bramble Cafe Group,SMB,South East,Hospitality,R Mensah,2026-06-15,3100,12,Bookings,10,2,9,120,1,0,Overdue,Not started,Unknown,15,2026-06-02,site closed in may; unclear if they are continuing,',
    'ACME-04,Kestrel Tutors,SMB,London,Education,R Mensah,2026-11-02,46000,12,Reports,140,131,126,4,2,0,Current,Verbal commitment,Active,5,2026-07-19,duplicate row from a bad export,',
    'ACME-06,Thistle Vets,SMB,Scotland,Healthcare,J Okafor,15/09/2026,7400,12,Bookings,22,18,19,12,1,0,Current,In discussion,Active,0,2026-07-19,date written the british way on purpose,',
  ].join('\r\n');
